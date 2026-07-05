---
title: "The Landscape of Logic Programming"
kind: content
section: "Introduction"
---

- Pure Datalog = **first-order logic** +  **recursive** predicates + **aggregates** (<span class="fml">max, min, sum, …</span>)<br>
  <span style="visibility: hidden">Pure Datalog </span>\- **function symbols**
  <span class="aside">**No** arrays/lists/objects/…, **no** string operations/arithmetic, only atomic values</span>
- **Not** Turing complete: all programs terminate

<div class="expr" style="margin-top: calc(var(--u) * 0.5); font-size: calc(var(--u) * 2.7);">
  <div class="expr__node">SQL</div>
  <div class="expr__arrow"></div>
  <div class="expr__box" data-label="Recursion">
    <div class="expr__node">Pure Datalog</div>
    <div class="expr__arrow"></div>
    <div class="expr__box" data-label="Turing complete">
      <div style="display: flex; flex-direction: column; gap: calc(var(--u) * 0.6);">
        <div class="expr__node">Prolog</div>
        <div class="expr__node">Practical Datalog</div>
      </div>
      <div class="expr__arrow"></div>
      <div class="expr__box expr__box--inner" data-label="Higher-order logic">
        <div class="expr__node">λProlog</div>
      </div>
    </div>
  </div>
</div>

<div class="spectrum">
  <div class="spectrum__line"></div>
  <div class="spectrum__ends">
    <span>less expressive,<br>runs efficiently</span>
    <span>more expressive,<br>difficult to implement efficiently</span>
  </div>
</div>
