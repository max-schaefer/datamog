---
title: "Grouping in action"
kind: content
section: "Aggregates"
tight: true
---

Say three literals are negated: `q` in clause 1, and `q` and `r` in clause 2. The body `literal(C, _, 0)` then evaluates to one row each, and grouping by `C` counts them:

<div class="columns" style="grid-template-columns: 1fr 1.3fr; align-items: center;">

<div>

| clause `C` | variable |
| --- | --- |
| 1 | q |
| 2 | q |
| 2 | r |

</div>

<div>

<img class="graph" style="max-height: calc(var(--u) * 40);" src="/images/grouping.svg" alt="Flat fan-in diagram with rounded rectangular pill nodes and directed arrows on a white background. A left column, headed by the italic teal label 'negated literals', has three pills stacked vertically: 'clause 1: not-q' in teal (light-teal fill, teal border), then 'clause 2: not-q' and 'clause 2: not-r' both in amber (pale-amber fill, amber-brown border). A right column, headed by the italic teal label 'count per clause', has two larger pills: a teal 'clause 1 to 1' at top and an amber 'clause 2 to 2' below. Colour-coded arrows fan in from left to right: one teal arrow from the clause-1 pill to 'clause 1 to 1', and two amber arrows from the two clause-2 pills converging on 'clause 2 to 2'. Dark teal text throughout." />

</div>

</div>
