---
title: "Evaluating rules"
kind: content
section: "From Rules to Answers"
tight: true
---

A predicate is computed **completely**, only once everything it depends on is known.

This gives a **bottom-up**, layer-by-layer strategy:

<div class="columns" style="grid-template-columns: 3fr 2fr; align-items: center;">
<div>

<img class="graph" src="/images/dependency-graph.svg" alt="Flat flowchart-style dependency graph on a white background with rounded rectangular nodes (fill #e6f2ef, thin border #5f9d92) and thin directed arrows (#34786c) whose heads point from a predicate to the predicate it depends on. Dark teal text (#16433c). Top row left to right: node 'odd' with an arrow to node 'even' and another arrow curving down to node 'num', and node 'even' with an arrow curving down to node 'num'. Lower rows: node 'not_prime' with one arrow to node 'composite' and another long arrow sweeping right to 'num'; node 'composite' with an arrow to node 'divisor'; node 'divisor' with an arrow to 'num'. Node 'num' at the lower right is the shared sink that several arrows converge on." />

<p class="caption">Arrows point from a predicate to the predicates it depends on.</p>

</div>
<div>

- **Layer 0**: `num` (no dependencies)
- **Layer 1** : `even` (needs `num`), `divisor` (needs `num`)
- **Layer 2**: `odd` (needs `even`), `composite` (needs `divisor`)
- **Layer 3**: `not_prime` (needs `composite`)
- Finally, evaluate the **query**.

</div>
</div>
