---
title: "Emptiness"
kind: content
section: "Metatheory"
tight: true
---

Another basic question: **emptiness** — on **some** input, can a predicate ever be non-empty? (Or is it always empty, whatever the input?)

For **pure** Datalog this is **easy**. The rules are **monotone**: if a predicate's body can be satisfied by any input at all, some input makes the predicate non-empty. So emptiness is **decidable**.

<div class="note">
Emptiness is one of the questions that stays tractable for pure Datalog — until negation enters the language.
</div>
