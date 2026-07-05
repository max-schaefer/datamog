---
title: "Bad even/odd has no stratification"
kind: content
section: "Least Fixed Points"
tight: true
---

<div class="columns" style="align-items: center;">

<div>

```prolog
even(N) :- num(N), not odd(N).
odd(N)  :- num(N), not even(N).
```

</div>

<div>

<img class="graph" style="max-height: calc(var(--u) * 48);" src="/images/even-odd-no-stratification.svg" alt="Dependency graph of the even/odd program. A lower box, level 0, holds num. An upper box labelled 'level 1?' holds even and odd. Solid teal arrows point from even and odd down to num. Two red dashed arrows labelled with a minus sign form a cycle between even and odd: even negatively depends on odd, and odd negatively depends on even. The red cycle is the negative dependency that no level assignment can satisfy." />

</div>

</div>

<div class="note">
<code>even</code> negatively depends on <code>odd</code> and vice versa: not stratifiable, so Datamog rejects it.
</div>
