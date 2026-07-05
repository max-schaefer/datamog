---
title: "Bottom-up, one SCC at a time"
kind: content
section: "Naive Evaluation"
tight: true
---

A whole program's predicates form a **dependency graph**.

Group each cycle of mutually recursive predicates into one **strongly connected component**:

<img class="graph" style="max-height: calc(var(--u) * 33);" src="/images/scc-bottomup.svg" alt="Flat dependency-graph diagram on a white background with circular nodes outlined in teal (#2f8576) and thin teal data-flow arrows that point upward toward the consumer, dark teal labels (#16433c). At the bottom a shaded circle (fill #d9efe9) labelled 'e' with the small caption 'EDB' underneath. Two arrows rise from 'e' to two white circles side by side, 'a' on the left and 'b' on the right, which sit inside a dashed rounded rectangle labelled 'one SCC'; between 'a' and 'b' a pair of horizontal arrows point both ways, showing mutual recursion. From this SCC a single arrow rises to a white circle 't' at the top. Down the left edge runs a thick pale-teal upward arrow (#7cc0b3) with the italic label 'bottom-up' and the step numbers 1, 2, 3 marking evaluation order from 'e' first, then the SCC, then 't'." />

<div class="note">
The SCCs form layers, evaluated <strong>bottom-up</strong>: each SCC runs the <strong>naive evaluation</strong> from the previous slide once everything below it is finished.
</div>
