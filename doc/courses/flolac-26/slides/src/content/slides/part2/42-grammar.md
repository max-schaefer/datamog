---
title: "Each production, a rule"
kind: content
section: "Parsing"
tight: true
---

The grammar uses `->`, `|`, `&`, `~` and parentheses.
Each **BNF production** becomes a **rule**:

<div class="columns grammar" style="grid-template-columns: max-content 1fr;">
<div>

```
impl ::= disj
       | disj "->" impl
disj ::= conj
       | disj "|" conj
conj ::= lit
       | conj "&" lit
lit  ::= atom
       | "~" lit
atom ::= var
       | "(" impl ")"
```

</div>
<div>

```prolog
impl(F, T) :- disj(F, T).
impl(F, T) :- disj(F, M), char(M, "-"), char(M + 1, ">"), impl(M + 2, T).
disj(F, T) :- conj(F, T).
disj(F, T) :- disj(F, M), char(M, "|"), conj(M + 1, T).
conj(F, T) :- lit(F, T).
conj(F, T) :- conj(F, M), char(M, "&"), lit(M + 1, T).
lit(F, T)  :- atom(F, T).
lit(F, T)  :- char(F, "~"), lit(F + 1, T).
atom(F, T) :- char(F, C), prop_var(C), T = F + 1.
atom(F, T) :- char(F, "("), impl(F + 1, M), char(M, ")"), T = M + 1.
```

</div>
</div>

<div class="note">
<code>disj</code> and <code>conj</code> recurse on the <strong>left</strong>: <code>p | q | r</code> is effectively <code>(p | q) | r</code> (<strong>left</strong> associative).

<code>impl</code> recurses on the <strong>right</strong>: <code>p -> q -> r</code> is effectively <code>p -> (q -> r)</code> (<strong>right</strong> associative).
</div>
