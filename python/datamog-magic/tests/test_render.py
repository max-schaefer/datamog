"""Renderer tests using stub events.

These never spawn a subprocess — they exercise the formatting logic in
isolation against synthetic events that match the JSON schema the REPL
emits.
"""

from __future__ import annotations

import io
import sys

import pytest

from datamog_magic import render


def _capture(fn) -> str:  # type: ignore[no-untyped-def]
    out, err = io.StringIO(), io.StringIO()
    old_out, old_err = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = out, err
    try:
        fn()
    finally:
        sys.stdout, sys.stderr = old_out, old_err
    return out.getvalue() + err.getvalue()


def test_declared_renders_pred_arity_and_rows() -> None:
    out = _capture(
        lambda: render.render_event(
            {"kind": "declared", "predicate": "parent", "arity": 2, "rowsLoaded": 3}
        )
    )
    assert "declared parent/2 (3 rows)" in out


def test_declared_omits_count_when_unknown() -> None:
    out = _capture(
        lambda: render.render_event(
            {"kind": "declared", "predicate": "p", "arity": 1, "rowsLoaded": None}
        )
    )
    assert "declared p/1" in out
    assert "rows" not in out


def test_rule_renders_pred_and_arity() -> None:
    out = _capture(
        lambda: render.render_event({"kind": "rule", "predicate": "ancestor", "arity": 2})
    )
    assert "added rule for ancestor/2" in out


def test_error_includes_phase_and_position(monkeypatch: pytest.MonkeyPatch) -> None:
    # Force the plain-text tier: with IPython importable (it's a hard
    # dependency) `_render_error` would `display(HTML(...))`, which outside
    # a live kernel just prints the object repr rather than the message.
    monkeypatch.setattr(render, "_ipydisplay", None)
    out = _capture(
        lambda: render.render_event(
            {
                "kind": "error",
                "phase": "parse",
                "message": "bad token",
                "line": 2,
                "column": 7,
            }
        )
    )
    assert "parse" in out
    assert "bad token" in out
    assert "line 2" in out
    assert "column 7" in out


def test_error_without_position_omits_location(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(render, "_ipydisplay", None)
    out = _capture(
        lambda: render.render_event(
            {"kind": "error", "phase": "execute", "message": "boom"}
        )
    )
    assert "execute" in out
    assert "boom" in out
    # No position info should appear if the event didn't carry any.
    assert "line" not in out


def test_schema_lists_predicates() -> None:
    out = _capture(
        lambda: render.render_event(
            {
                "kind": "schema",
                "predicates": [
                    {
                        "name": "q",
                        "predicateKind": "edb",
                        "columns": [{"name": "x", "type": "integer"}],
                    },
                    {
                        "name": "p",
                        "predicateKind": "idb",
                        "columns": [{"name": "col1", "type": "integer"}],
                    },
                ],
            }
        )
    )
    assert "edb q(x: integer)" in out
    assert "idb p(col1: integer)" in out


def test_ipython_display_module_resolves_correctly() -> None:
    """Regression: ``_try_import('IPython.display')`` must return the
    *submodule*, not the top-level ``IPython`` package.

    The earlier ``__import__('IPython.display')`` call resolved to
    ``IPython``, so ``_ipydisplay.display(df)`` tried to call the
    submodule object — ``TypeError: 'module' object is not callable``
    on the first result event in a notebook session.
    """
    from datamog_magic import render

    if render._ipydisplay is None:
        pytest.skip("IPython not installed")
    # `display` on the resolved module must be the function we'd reach
    # for via `from IPython.display import display`.
    assert callable(getattr(render._ipydisplay, "display", None))
    # And the module itself isn't called by mistake.
    assert render._ipydisplay.__name__ == "IPython.display"


@pytest.mark.parametrize(
    "rows,column_in_output",
    [
        ([{"X": 1}, {"X": 2}], "X"),
        ([], "X"),
    ],
)
def test_result_includes_column_header(rows: list, column_in_output: str) -> None:
    out = _capture(
        lambda: render.render_event(
            {
                "kind": "result",
                "columns": ["X"],
                "types": ["integer"],
                "rows": rows,
                "sql": "...",
                "source": "?- p(X).",
            }
        )
    )
    assert column_in_output in out
