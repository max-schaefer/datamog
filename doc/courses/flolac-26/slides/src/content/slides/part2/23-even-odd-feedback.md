---
title: "The rules feed back"
kind: content
section: "Least Fixed Points"
tight: true
---

Here is the mutual `even`/`odd` from before:

<div class="columns" style="grid-template-columns: 1fr 1fr; align-items: center;">
<div>

```datamog
num(0). num(1). num(2). num(3). num(4). num(5).

even(0).
even(N) :- num(N), odd(N - 1).
odd(N)  :- num(N), even(N - 1).
```

</div>
<div>

<img class="graph" style="max-height: calc(var(--u) * 30);" src="/images/even-odd-feedback.svg" alt="Diagram of one evaluation round for the mutual even/odd rules. A left box labelled 'before' holds even and odd; arrows lead from both into a central diamond labelled 'evaluation round'; arrows lead on to a right box labelled 'after' that also holds even and odd. A dashed arrow labelled 'feed back' loops from the 'after' box back to the 'before' box, showing that each round's output seeds the next." />

<p class="caption">Each round updates <code>even</code>/<code>odd</code> for the next.</p>

</div>
</div>

When a round adds nothing new, the rules map the relations to **themselves**: we have found a **fixed point**.

<div class="note">
Naive evaluation stops exactly at <em>a</em> fixed point. But which one?
</div>
