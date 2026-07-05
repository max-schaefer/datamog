"""IPython cell magic for running Datamog programs from notebooks."""

from .repl import DatamogError, DatamogProcess, Event

__all__ = ["DatamogError", "DatamogProcess", "Event"]


def load_ipython_extension(ipython):  # type: ignore[no-untyped-def]
    """Entry point for `%load_ext datamog_magic`."""
    from .magic import DatamogMagics

    ipython.register_magics(DatamogMagics)


def unload_ipython_extension(ipython):  # type: ignore[no-untyped-def]
    """Best-effort teardown when the extension is unloaded."""
    from .magic import DatamogMagics

    magics = ipython.magics_manager.registry.get(DatamogMagics.__name__)
    if magics is not None:
        magics.shutdown()
