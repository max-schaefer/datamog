"""Tests for the cell-magic argument parser and `--df` binding logic.

These don't need a real IPython kernel — we exercise
``DatamogMagics._bind_dataframe`` directly with synthetic events and a
fake ``shell.user_ns``. The full magic flow (subprocess + render +
bind) is covered by the wrapper-level tests in ``test_repl.py``.
"""

from __future__ import annotations

import io
import sys
from types import SimpleNamespace

import pytest

# Skip the whole module cleanly if IPython isn't on PATH; the magic
# imports it at module load.
ipython = pytest.importorskip("IPython")
pytest.importorskip("pandas")  # _bind_dataframe needs pandas to actually bind

from datamog_magic.magic import DatamogMagics, _build_cell_parser  # noqa: E402


def _capture(fn) -> str:  # type: ignore[no-untyped-def]
    out = io.StringIO()
    old_out, old_err = sys.stdout, sys.stderr
    sys.stdout = out
    sys.stderr = out
    try:
        fn()
    finally:
        sys.stdout, sys.stderr = old_out, old_err
    return out.getvalue()


def _make_magics() -> DatamogMagics:
    """Build a Magics instance with a fake shell exposing ``user_ns``.

    ``Magics.__init__`` will accept ``shell=None``; the ``--df`` path
    needs ``self.shell.user_ns``, so we hand it a tiny stand-in.
    """
    shell = SimpleNamespace(user_ns={})
    return DatamogMagics(shell=shell)  # type: ignore[arg-type]


def _result_event(rows: list, columns: list[str]) -> dict:
    return {
        "kind": "result",
        "rows": rows,
        "columns": columns,
        "types": [None] * len(columns),
        "sql": "",
        "source": "?- ...",
    }


# --- argparse layer --------------------------------------------------------


def test_cell_parser_accepts_no_args() -> None:
    args = _build_cell_parser().parse_args([])
    assert args.df is None


def test_cell_parser_extracts_df_name() -> None:
    args = _build_cell_parser().parse_args(["--df", "result"])
    assert args.df == "result"


# --- _bind_dataframe -------------------------------------------------------


def test_bind_dataframe_binds_last_result() -> None:
    mag = _make_magics()
    import pandas as pd

    events = [
        _result_event([{"X": 1}, {"X": 2}], ["X"]),
    ]
    out = _capture(lambda: mag._bind_dataframe("survival", events))
    df = mag.shell.user_ns["survival"]  # type: ignore[attr-defined]
    assert isinstance(df, pd.DataFrame)
    assert list(df.columns) == ["X"]
    assert len(df) == 2
    assert "bound `survival`" in out


def test_bind_dataframe_warns_on_multiple_results_and_binds_last() -> None:
    mag = _make_magics()
    events = [
        _result_event([{"A": 1}], ["A"]),
        _result_event([{"B": 9}], ["B"]),
    ]
    out = _capture(lambda: mag._bind_dataframe("ans", events))
    df = mag.shell.user_ns["ans"]  # type: ignore[attr-defined]
    assert list(df.columns) == ["B"]
    assert "binding the last one" in out


def test_bind_dataframe_skips_when_no_result() -> None:
    mag = _make_magics()
    out = _capture(
        lambda: mag._bind_dataframe(
            "x",
            [{"kind": "rule", "predicate": "p", "arity": 1}],
        )
    )
    assert "no `?- ...` query" in out
    assert "x" not in mag.shell.user_ns  # type: ignore[attr-defined]


def test_bind_dataframe_rejects_invalid_identifier() -> None:
    mag = _make_magics()
    out = _capture(
        lambda: mag._bind_dataframe("1foo", [_result_event([], [])])
    )
    assert "not a valid Python identifier" in out
    assert "1foo" not in mag.shell.user_ns  # type: ignore[attr-defined]


def test_bind_dataframe_handles_empty_result() -> None:
    mag = _make_magics()
    import pandas as pd

    events = [_result_event([], ["X", "Y"])]
    _capture(lambda: mag._bind_dataframe("empty", events))
    df = mag.shell.user_ns["empty"]  # type: ignore[attr-defined]
    assert isinstance(df, pd.DataFrame)
    assert list(df.columns) == ["X", "Y"]
    assert len(df) == 0


def test_bind_dataframe_singular_row_count_message() -> None:
    mag = _make_magics()
    out = _capture(lambda: mag._bind_dataframe("one", [_result_event([{"X": 1}], ["X"])]))
    # Cosmetic: "1 row" rather than "1 rows" is small but the kind of
    # detail that lands well in a tutorial demo.
    assert "1 row " in out
