# Exercise 8.4 — Spot the unstratifiable program

- **(a)** Accepted. `p` depends on `q` negatively; `q` depends on
  `r` and `s` positively (with a negation against an EDB, which is
  stratum 0). The dependency graph has no cycle through a negative
  edge — `p` and `q` sit in disjoint strata, and both reference
  only EDBs from lower strata.

- **(b)** **Rejected**. `p` depends negatively on `q`; `q` depends
  negatively on `p`. That's a cycle containing two negative edges
  — not stratifiable. Datamog reports it as mutually-recursive
  negation.

- **(c)** Accepted. `r_negated` depends only on `t` (positive,
  stratum 0). `p` depends positively on `r` and negatively on
  `r_negated`. No cycles through negation.

- **(d)** **Rejected**. `b` depends positively on `a` and
  negatively on `c`. `c` depends positively on `r` and negatively
  on `a`. `a` depends positively on `r`. So the cycle `b → c → a
  → ...` has `b → c` as negative and `c → a` as negative — two
  negative edges inside a cycle involving `a`, `b`, `c`. Not
  stratifiable.

  Actually, let's check more carefully: is there a cycle at all?
  `a → r` (positive, terminal). `b → a` (positive), `b → c`
  (negative). `c → r` (positive), `c → a` (negative). So `a`
  points nowhere but `r`; it has no incoming cycle. `b → c → a
  → r` — not a cycle. `c → a → r` — not a cycle. No cycles, so
  this is actually stratified. **Correction: accepted.**

  (The point: checking stratification means checking for cycles
  through negative edges, and paper-tracing gets error-prone for
  even modest programs. Let Datamog do the analysis and trust the
  error message.)
