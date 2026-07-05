---
title: "When is one program inside another?"
kind: content
section: "Metatheory"
tight: true
---

**Running** a program is decidable and cheap; **comparing** two is not.

The basic question is **containment**: `P₁` is contained in `P₂` (written `P₁ ⊑ P₂`) when, on **every** input EDB, the facts `P₁` derives are a subset of the facts `P₂` derives — `IDB₁ ⊆ IDB₂`, for all inputs at once.

<img class="graph" style="max-height: calc(var(--u) * 30);" src="/images/containment.svg" alt="Flat set-containment diagram with rounded rectangular boxes and a directed arrow on a white background, using a teal palette. A small pale-teal box on the left labelled 'EDB E' in bold teal feeds a teal arrow rightward into a large pale-teal outer box labelled 'P-two's output' (top-left, teal). Fully nested inside that outer box is a smaller, more saturated teal box labelled 'P-one's output' in dark teal, showing P-one's output as a subset of P-two's. A large teal subset symbol appears at the right edge of the outer box. Above everything, centred, is an italic grey caption 'for every input EDB E ...'." />

<div class="note">
<strong>Equivalence</strong> is two containments (<code>P₁ ⊑ P₂</code> and <code>P₂ ⊑ P₁</code>), and "is this rule ever needed?" is a containment too — so all of them are exactly as hard as containment.
</div>
