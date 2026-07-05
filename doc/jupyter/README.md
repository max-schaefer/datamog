# Datamog in a Jupyter notebook

A runnable tutorial that drives Datamog from a Jupyter notebook via the
[`datamog-magic`](../../python/datamog-magic/) IPython cell magic. It
mirrors the early chapters of the [language walkthrough](../walkthrough/README.md),
but every example runs in a live `%%datamog` cell so you can edit and
re-run it in place — and bind query results to a pandas DataFrame.

- [`datamog-jupyter.ipynb`](datamog-jupyter.ipynb) — the notebook. Browse
  it on GitHub or open it in Jupyter and run the cells.

## Regenerating the notebook

The notebook is generated from a structured cell list so prose and code
stay in one editable place rather than hand-escaped JSON. The script is
the source of truth; the `.ipynb` is a build artifact committed
alongside it.

```bash
python3 doc/jupyter/build-jupyter-tutorial.py
```

Edit the `CELLS` list at the top of the script, rerun it, and commit the
regenerated `datamog-jupyter.ipynb` alongside the script.
