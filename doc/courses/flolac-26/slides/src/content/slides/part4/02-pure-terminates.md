---
title: "Pure Datalog always stops"
kind: content
section: "Metatheory"
---

**Pure** Datalog has no function symbols and no arithmetic: rules only combine values already in the program or the data.

- So the set of possible facts is **finite**: finitely many predicates, each over a finite set of constants.
- Bottom-up iteration adds facts from that finite set and never creates new ones, so it must reach a **fixed point** in finitely many rounds.

<div class="note">
Every pure Datalog query <strong>terminates</strong>, so query answering is <strong>decidable</strong>.
Contrast with Prolog, which is Turing-complete and can loop forever.
</div>
