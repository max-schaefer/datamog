"""IPython magic registration for ``%%datamog``."""

from __future__ import annotations

import argparse
import shlex
from pathlib import Path
from typing import Any, Optional

from IPython.core.magic import Magics, cell_magic, line_magic, magics_class

from .render import render_events
from .repl import DatamogError, DatamogProcess, Event


def _build_cell_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="%%datamog",
        description="Run Datamog source and (optionally) bind the result.",
        add_help=False,
    )
    p.add_argument(
        "--df",
        metavar="NAME",
        help=(
            "Bind the cell's last query result to a pandas DataFrame in the "
            "user namespace. The cell must contain at least one `?- ...` query."
        ),
    )
    return p


def _build_init_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="%datamog_init",
        description="Configure the underlying datamog subprocess.",
        add_help=False,
    )
    p.add_argument("--backend", help="Backend to launch (sqlite, postgres, sqljs, native, seminaive).")
    p.add_argument("--data-dir", help="Directory loaders should read from.")
    p.add_argument(
        "--cmd",
        help=(
            "Override the launch command (space-separated). Default: $DATAMOG_CMD if set, "
            "else `bun run datamog`."
        ),
    )
    p.add_argument("--cwd", help="Working directory for the subprocess.")
    p.add_argument(
        "--extensional",
        action="append",
        default=[],
        metavar="name=source",
        help=(
            "Map an extensional predicate to a file or URL (.csv, .jsonl, .json, .mmd, "
            "or a Google Sheets URL). Repeatable. Forwarded to the CLI verbatim."
        ),
    )
    return p


@magics_class
class DatamogMagics(Magics):
    """Cell magic for running Datamog code in a notebook.

    The first ``%%datamog`` cell (or an explicit ``%datamog_init``)
    spawns a single long-lived REPL subprocess. Subsequent cells share
    its accumulated state — declarations, rules, and queries persist
    across cells until ``%datamog_reset``.
    """

    def __init__(self, shell=None) -> None:  # type: ignore[no-untyped-def]
        super().__init__(shell)
        self._proc: Optional[DatamogProcess] = None
        # `extensional` is a list (zero or more `name=source` mappings)
        # threaded into the subprocess via repeated `--extensional`
        # flags. The other entries are scalar config.
        self._config: dict[str, object] = {
            "backend": None,
            "data_dir": None,
            "cmd": None,
            "cwd": None,
            "extensional": [],
        }

    # --- magics ----------------------------------------------------------

    @cell_magic("datamog")
    def datamog(self, line: str, cell: str) -> None:
        parser = _build_cell_parser()
        try:
            args = parser.parse_args(shlex.split(line))
        except SystemExit:
            # argparse already printed an error; suppress its sys.exit()
            # so the kernel stays alive. Render nothing further.
            return
        try:
            events = self._proc_or_start().send_chunk(cell)
        except DatamogError as exc:
            print(f"datamog error: {exc}")
            return
        render_events(events)
        if args.df is not None:
            self._bind_dataframe(args.df, events)

    def _bind_dataframe(self, name: str, events: list[Event]) -> None:
        """Bind the last result event in ``events`` to ``name`` in the user
        namespace as a pandas DataFrame.

        Multi-result cells bind the last result and warn (a one-result-
        per-cell convention is the cleanest mental model for ``--df``).
        Cells with no result, no pandas, or an invalid Python name
        surface a clear message instead of silently failing.
        """
        if not name.isidentifier():
            print(f"%%datamog --df {name!r}: not a valid Python identifier")
            return
        results = [e for e in events if e.get("kind") == "result"]
        if not results:
            print(
                f"%%datamog --df {name}: no `?- ...` query in this cell — "
                "nothing bound"
            )
            return
        try:
            import pandas as pd
        except ImportError:
            print(
                f"%%datamog --df {name}: pandas is not installed "
                "(install datamog-magic[pandas])"
            )
            return
        if len(results) > 1:
            print(
                f"%%datamog --df {name}: cell has {len(results)} query results; "
                "binding the last one"
            )
        last = results[-1]
        df = pd.DataFrame(
            last.get("rows") or [],
            columns=last.get("columns") or None,
        )
        ns = _user_ns(self)
        if ns is None:
            print(f"%%datamog --df {name}: no user namespace available")
            return
        ns[name] = df
        print(f"bound `{name}` ({len(df)} row{'s' if len(df) != 1 else ''} × {len(df.columns)} cols)")

    @line_magic("datamog_init")
    def datamog_init(self, line: str) -> None:
        parser = _build_init_parser()
        try:
            args = parser.parse_args(shlex.split(line))
        except SystemExit:
            return
        cmd = args.cmd.split() if args.cmd else None
        extra_args: list[str] = []
        for mapping in args.extensional:
            extra_args.extend(["--extensional", mapping])
        self.shutdown()
        self._config = {
            "backend": args.backend,
            "data_dir": args.data_dir,
            "cmd": shlex.join(cmd) if cmd else None,
            "cwd": args.cwd,
            "extensional": list(args.extensional),
        }
        # Spawning is still lazy — a user who does `%datamog_init` and
        # never runs a cell shouldn't pay for a process they don't use.
        self._proc = DatamogProcess(
            cmd=cmd,
            backend=args.backend,
            data_dir=args.data_dir,
            cwd=args.cwd,
            extra_args=extra_args or None,
        )
        print(f"datamog_init: configured ({self._config_summary()})")

    @line_magic("datamog_reset")
    def datamog_reset(self, _line: str) -> None:
        if self._proc is None:
            print("datamog_reset: no subprocess running")
            return
        try:
            events = self._proc.reset()
        except DatamogError as exc:
            print(f"datamog error: {exc}")
            return
        render_events(events)

    @line_magic("datamog_close")
    def datamog_close(self, _line: str) -> None:
        if self._proc is None:
            print("datamog_close: no subprocess running")
            return
        self.shutdown()
        print("datamog_close: subprocess shut down")

    # --- internals -------------------------------------------------------

    def _proc_or_start(self) -> DatamogProcess:
        if self._proc is None:
            extensional = self._config["extensional"]
            extra_args: list[str] = []
            if isinstance(extensional, list):
                for mapping in extensional:
                    extra_args.extend(["--extensional", str(mapping)])
            self._proc = DatamogProcess(
                backend=_optstr(self._config.get("backend")),
                data_dir=_optstr(self._config.get("data_dir")),
                cwd=_optstr(self._config.get("cwd")),
                extra_args=extra_args or None,
            )
        return self._proc

    def _config_summary(self) -> str:
        parts: list[str] = []
        for key in ("cmd", "backend", "data_dir", "cwd"):
            v = self._config[key]
            if v is not None:
                parts.append(f"{key}={v}")
        ext = self._config.get("extensional") or []
        if isinstance(ext, list) and ext:
            parts.append(f"extensional=[{', '.join(map(str, ext))}]")
        cwd = self._config["cwd"] or str(Path.cwd())
        if "cwd" not in {p.split("=", 1)[0] for p in parts}:
            parts.append(f"cwd={cwd}")
        return ", ".join(parts) if parts else "defaults"

    def shutdown(self) -> None:
        if self._proc is not None:
            self._proc.close()
            self._proc = None

    @property
    def process(self) -> Optional[DatamogProcess]:
        """The active subprocess, or ``None`` before the first cell.

        Exposed so notebook code that wants to reuse the same session
        (e.g. capture a query result as a DataFrame) doesn't have to
        reach for private attributes. ``send_chunk`` directly on the
        process gives you the same events the cell magic renders.
        """
        return self._proc


def _user_ns(magics: Magics) -> Optional[dict[str, Any]]:
    """Return the IPython user namespace, or ``None`` if unavailable.

    ``Magics.shell`` is typed ``InteractiveShell | None`` because the
    tests construct magics without a shell. Centralise the narrow so
    ``--df`` rebinding doesn't need a defensive ``getattr`` chain.
    """
    shell = getattr(magics, "shell", None)
    if shell is None:
        return None
    ns = getattr(shell, "user_ns", None)
    if isinstance(ns, dict):
        return ns
    return None


def _optstr(value: object) -> Optional[str]:
    """Narrow `_config[...]` lookups (typed `object`) back down to `str | None`.

    The config dict mixes string scalars with a list of extensional
    mappings, so its declared value type is `object`. Constructor args
    on `DatamogProcess` are typed precisely; this helper bridges the
    two without sprinkling casts at call sites.
    """
    if value is None:
        return None
    if isinstance(value, str):
        return value
    raise TypeError(f"Expected str or None, got {type(value).__name__}")
