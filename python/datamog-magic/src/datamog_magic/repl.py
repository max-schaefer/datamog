"""Subprocess wrapper around `datamog --repl --json`.

The CLI's JSON mode is line-oriented:

  * Each non-blank line is appended to an internal buffer.
  * Each blank line commits the buffer as one *chunk*. The CLI parses
    the chunk, emits one ndjson event per result/declaration/error/...,
    and then one ``{"kind": "done"}`` sentinel.

This module hides that protocol behind ``DatamogProcess.send_chunk``,
which sends a block of source text, drains every event up to the
expected number of ``done`` sentinels, and returns the events as a list
of plain dicts. Callers (the cell magic, tests) never see ``done``.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import threading
from pathlib import Path
from typing import Any, Optional


class DatamogError(RuntimeError):
    """Raised when the subprocess crashes or its output can't be parsed."""


# Each event is one parsed-JSON dict. We keep them as plain dicts rather
# than a typed dataclass so the magic can forward arbitrary fields the
# CLI may add later (column types, schema entries, ...) without a
# round-trip through this module.
Event = dict[str, Any]


def _default_cmd() -> list[str]:
    """Pick a reasonable default for invoking the CLI.

    Honours ``DATAMOG_CMD`` if set (split on whitespace, no shell). Falls
    back to ``bun run datamog`` — the canonical invocation from a
    Datamog repo checkout, which is the expected setup for v1.
    """
    env = os.environ.get("DATAMOG_CMD")
    if env:
        return env.split()
    if shutil.which("bun") is None:
        raise DatamogError(
            "Could not find `bun` on PATH. Install Bun (https://bun.sh) or set "
            "DATAMOG_CMD to override the launch command (e.g. "
            "DATAMOG_CMD='node /path/to/datamog/packages/cli/src/main.ts')."
        )
    return ["bun", "run", "datamog"]


def _count_blank_lines(body: str) -> int:
    """Count blank (whitespace-only) lines in ``body``.

    Used by ``send_chunk`` to predict how many ``done`` sentinels the
    subprocess will emit: the JSON-mode loop commits at every blank line,
    so an internal blank line in the user's cell produces an extra chunk.
    """
    return sum(1 for ln in body.split("\n") if ln.strip() == "")


class DatamogProcess:
    """Long-lived ``datamog --repl --json`` subprocess.

    Spawned lazily on the first ``send_chunk``. ``stderr`` is drained in a
    background thread so a chatty CLI never deadlocks the writer.
    """

    def __init__(
        self,
        cmd: Optional[list[str]] = None,
        *,
        backend: Optional[str] = None,
        data_dir: Optional[str] = None,
        cwd: Optional[str | Path] = None,
        extra_args: Optional[list[str]] = None,
    ) -> None:
        self._cmd = list(cmd) if cmd else _default_cmd()
        self._args = [*self._cmd, "--repl", "--json"]
        if backend:
            self._args.extend(["--backend", backend])
        if data_dir:
            self._args.extend(["--data-dir", str(data_dir)])
        if extra_args:
            self._args.extend(extra_args)
        self._cwd = str(cwd) if cwd else None
        self._proc: Optional[subprocess.Popen[str]] = None
        self._stderr_lines: list[str] = []
        self._stderr_thread: Optional[threading.Thread] = None

    # --- lifecycle ------------------------------------------------------

    def start(self) -> None:
        """Idempotent: spawn the subprocess if it's not already running."""
        if self._proc is not None and self._proc.poll() is None:
            return
        self._proc = subprocess.Popen(
            self._args,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=self._cwd,
            text=True,
            bufsize=1,  # line-buffered
        )
        self._stderr_lines = []
        self._stderr_thread = threading.Thread(target=self._drain_stderr, daemon=True)
        self._stderr_thread.start()

    def close(self) -> None:
        """Idempotent: shut down the subprocess.

        Closes stdin (which lets the CLI's stdin loop fall through to EOF),
        then waits briefly. Falls back to terminate / kill if the process
        ignores the close.
        """
        if self._proc is None:
            return
        proc = self._proc
        self._proc = None
        try:
            if proc.stdin is not None:
                try:
                    proc.stdin.close()
                except (BrokenPipeError, OSError):
                    pass
            try:
                proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                proc.terminate()
                try:
                    proc.wait(timeout=1)
                except subprocess.TimeoutExpired:
                    proc.kill()
        finally:
            # Drain remaining stderr so the thread can finish.
            if self._stderr_thread is not None:
                self._stderr_thread.join(timeout=1)

    def is_alive(self) -> bool:
        return self._proc is not None and self._proc.poll() is None

    # --- I/O ------------------------------------------------------------

    def send_chunk(self, source: str) -> list[Event]:
        """Send a block of source to the subprocess and collect its events.

        Empty / whitespace-only ``source`` is a no-op (returns ``[]``).
        Internal blank lines in ``source`` are passed through verbatim:
        the JSON-mode loop will emit one ``done`` per blank line, and we
        collect events across all of them so a single ``send_chunk`` call
        always corresponds to a single notebook cell.
        """
        body = source.strip()
        if not body:
            return []
        self.start()
        assert self._proc is not None and self._proc.stdin is not None
        if self._proc.poll() is not None:
            raise DatamogError(self._exit_message())
        # Internal blank lines = extra implicit chunk boundaries; we tack
        # one final blank line on so the CLI's last chunk is always
        # committed before we stop reading.
        expected_dones = _count_blank_lines(body) + 1
        try:
            self._proc.stdin.write(body + "\n\n")
            self._proc.stdin.flush()
        except BrokenPipeError as exc:
            raise DatamogError(self._exit_message()) from exc

        events: list[Event] = []
        dones_seen = 0
        assert self._proc.stdout is not None
        while dones_seen < expected_dones:
            line = self._proc.stdout.readline()
            if not line:
                raise DatamogError(self._exit_message())
            try:
                ev = json.loads(line)
            except json.JSONDecodeError as exc:
                raise DatamogError(
                    f"Could not parse event line from datamog: {line!r}"
                ) from exc
            if ev.get("kind") == "done":
                dones_seen += 1
                continue
            events.append(ev)
        return events

    def reset(self) -> list[Event]:
        """Send the ``:reset`` meta-command to the underlying REPL."""
        return self.send_chunk(":reset")

    # --- internals ------------------------------------------------------

    def _drain_stderr(self) -> None:
        if self._proc is None or self._proc.stderr is None:
            return
        try:
            for line in self._proc.stderr:
                self._stderr_lines.append(line)
        except (ValueError, OSError):
            # The pipe was closed under us during shutdown; that's fine.
            pass

    def _exit_message(self) -> str:
        proc = self._proc
        rc = proc.returncode if proc is not None else None
        stderr = "".join(self._stderr_lines).strip() or "(no stderr output)"
        return (
            f"datamog subprocess exited (returncode={rc}). stderr:\n{stderr}"
        )

    # --- context manager ----------------------------------------------------

    def __enter__(self) -> "DatamogProcess":
        self.start()
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()

    def __del__(self) -> None:  # best-effort cleanup
        try:
            self.close()
        except Exception:
            pass
