# Exam: Introduction to Logic Programming with Datalog

**Time**: 45 minutes.

**Marks**: 100 + 20 extra credit

**Instructions**: Each question gives you a nearly complete Datamog program with placeholders of the form
`⟨...⟩`. Fill in each placeholder so the program computes what the question describes, then answer the short questions below it.

---

## Question 1 — Checking a Sudoku [26+5]

A completed 9×9 Sudoku grid is **correct** when every row, every column, and
every 3×3 box contains each digit 1..9.

The grid is supplied as an extensional predicate
`grid(R, C, N)`: the cell in row `R`, column `C` holds digit `N`.

```prolog
extensional grid(r: integer, c: integer, n: integer).
```

Rows and columns range between 1 and 9:

```prolog
num(N) :- N in [1..9].
row(N) :- num(N).
col(N) :- num(N).
```

The predicate `box(B, R, C)` says that the cell at row `R` column `C` belongs to box `B`, and `in_box(B, N)` says digit `N`
appears somewhere in box `B`.[^1]

```prolog
box(B, R, C) :- row(R), col(C), B = (R-1)/3*3 + (C-1)/3.
in_box(B, N) :- box(B, R, C), grid(R, C, N).
```

[^1]: In the definition of `in_box`, note that integer division truncates, so `(R-1)/3` discards the remainder and rounds down to `0`, `1` or `2`; each cell therefore lands in exactly one of nine boxes, numbered `0` to `8`. (This explanation is included for completeness, you do not need to understand it to answer the question.)

The rest of the program defines predicates that check if a digit is missing in a row, column or box; another predicate that checks if a digit is missing anywhere (either a row, a column or a box), and finally a predicate that checks whether the grid is correct:

```prolog
missing_in_row(R, N) :- row(R), num(N), ⟨1⟩.
missing_in_col(C, N) :- col(C), num(N), ⟨2⟩.
missing_in_box(B, N) :- box(B, _, _), num(N), ⟨3⟩.

missing(N) :- missing_in_row(_, N).
missing(N) :- missing_in_col(_, N).
missing(N) :- missing_in_box(_, N).

correct() :- not ⟨4⟩.

?- correct().
```

**(a)** [8] Fill placeholders `⟨1⟩`, `⟨2⟩` and `⟨3⟩`: digit `N` is missing from row `R`, column `C` or box `B`, respectively. Answer in the following format:

  - `⟨1⟩`: ...
  - `⟨2⟩`: ...
  - `⟨3⟩`: ...

**(b)** [4] Fill placeholder `⟨4⟩`: a solution is correct if nothing is missing.

**(c)** [5 **optional**] `correct` takes no arguments. What are its two possible query outputs, and which one does a correct grid produce?

**(d)** [14] `correct` is defined with `not`, yet Datamog accepts this program. Explain briefly why this negation is fine here, unlike the `even`/`odd`-by-negation program from the lectures.

---

## Question 2 — Greatest common divisor [42+5]

Recall the following facts about the greatest common divisor of two natural numbers:

- `gcd(A, A) = A`;
- `gcd(A, B) = gcd(A - B, B)`;
- `gcd(A, B) = gcd(A, B - A)`.

We write `gcd(A, B, N)` for "the gcd of `A` and `B` is `N`", where `A` and `B` are in 1..10.

```prolog
num(N) :- N in [1..10].

gcd(A, A, A) :- ⟨1⟩.
gcd(A, B, N) :- num(A), num(B), gcd(⟨2⟩, B, N).
gcd(A, B, N) :- num(A), num(B), gcd(A, ⟨3⟩, N).

?- gcd(6, 4, N).
```

**(a)** [12] Fill in placeholders `⟨1⟩`, `⟨2⟩` and `⟨3⟩`, so each rule applies one of the identities above.

**(b)** [16] The first recursive rule tests `num(A)`. Explain why this test is needed.

**(c)** [4] How can we change the definition of `num` so that `num(N)` only holds for `N=2`, `N=4` and `N=6`?

**(d)** [10] With the new definition of `num`, show the first three rounds of the naive evaluation of `gcd`, starting from the empty relation as round 0, in the following format:

  | round | `gcd` |
  | --- | --- |
  | 0 | `{}` |
  | 1 | ... |
  | 2 | ... |
  | 3 | ... |

**(e)** [5 **optional**] Continue the table to its fixed point.

---

## Question 3 — Perfect numbers [32+0]

A number is **perfect** if it equals the sum of its *proper* divisors (the
divisors strictly smaller than itself). For example `6 = 1 + 2 + 3` and
`28 = 1 + 2 + 4 + 7 + 14`. We search for perfect numbers up to 100.

```prolog
num(N)              :- N in [1..100].
divides(D, N)       :- num(D), num(N), ⟨1⟩, D < N.
sum_divisor(N, ⟨2⟩) :- divides(D, N).
perfect_number(N)   :- ⟨3⟩.

?- perfect_number(N).
```

**(a)** [9] Fill placeholder `⟨1⟩`: the condition that `D` divides `N`.

**(b)** [9] Fill placeholder `⟨2⟩`: the head expression that makes `sum_divisor(N, S)` hold when `S` is the sum of the proper divisors of `N`.

**(c)** [14] Fill placeholder `⟨3⟩`: the body that makes `perfect_number(N)` hold exactly when `N` is perfect.

---

## Extra credit [0+10]

Is the following program accepted by Datamog? Explain why or why not. If it is accepted, what is the result of running it?

```prolog
num(N) :- N in [1..10].
p(N) :- num(N), p(N).

?- p(N).
```
