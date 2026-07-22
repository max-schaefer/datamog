---
marp: true
theme: default
paginate: true
size: 16:9
---

# Chapter 1
## Facts, queries, and predicates

The two basic statements of every Datalog program

---

# What's in a Datalog program?

Two kinds of statement:

- **Facts** — things we know are true.
- **Queries** — things we want to know.

No rules yet (those come in Chapter 2). Datalog will look like a very terse description of a small database.

---

# A tiny database

```prolog
person("ada_lovelace",    "uk", 1815).
person("alan_turing",     "uk", 1912).
person("grace_hopper",    "us", 1906).
person("edsger_dijkstra", "nl", 1930).
person("john_mccarthy",   "us", 1927).
person("tony_hoare",      "uk", 1934).
person("barbara_liskov",  "us", 1939).
person("niklaus_wirth",   "ch", 1934).

?- person(Name, Country, Year).
```

Eight facts, one query. Run it and you see all eight rows.

---

# The vocabulary

- **Predicate** — the name of a relation. Here, `person`.
- **Atom** — a predicate applied to arguments. `person("ada_lovelace", "uk", 1815)` is a *ground* atom; `person(Name, Country, Year)` is a *pattern*.
- **Fact** — a ground atom asserted as true (with a trailing `.`).
- **Arity** — number of arguments. `person` is ternary.

**Variables** start with an uppercase letter. Bare lowercase words (`ada_lovelace`) are not variables — they need to be **quoted strings**.

---

# Typed, declared predicates

For non-toy data, declare a typed predicate and load values from a file:

```prolog
input predicate person(name: string, country: string, year_born: integer).

?- person(Name, Country, Year).
# A file runs one query; swap one in to ask another:
#   ?- person(Name, "uk", Year).
#   ?- person(Name, Country, 1912).
```

Datamog looks for a sibling `person.csv` (or `.jsonl` / `.mmd`) and loads it.

---

# Extensional vs. intensional

- **Extensional** — meaning given by **enumeration** (a list of facts, a table). Declared with `input predicate`.
- **Intensional** — meaning given by a **definition** (a rule).

Everything in this chapter is extensional. Intensional predicates arrive in Chapter 2.

---

# What variables mean in queries

A query argument can be:

- **A constant** — must match exactly.
- **A variable** — every binding that makes the atom true is returned.
- **The don't-care `_`** — "something, I don't care what".

```prolog
?- person(Name, "us", Year).      # Americans + birth years
?- person("alan_turing", _, Y).   # when was Turing born?
?- person(_, _, 1934).            # too many slots? use _
```

Same variable in two slots → those slots must take the same value.

---

# Logic lens

A predicate is a **relation** — a set of tuples. A ground fact is an *atomic formula* asserted true.

A query like `?- person(Name, "uk", Year).` is, formally,

```
∃Name, Year. person(Name, "uk", Year)
```

…with a twist: instead of yes/no, we report every **witness** — every assignment that satisfies it. That's exactly what SQL's `SELECT` does.

---

# SQL lens

```bash
bun run datamog --dry-run doc/walkthrough/code/ch01/people.dl
```

```sql
CREATE TABLE IF NOT EXISTS "person" (
  "name" TEXT NOT NULL, "country" TEXT NOT NULL, "year_born" INTEGER NOT NULL
);

SELECT DISTINCT "name" AS "Name", "country" AS "Country",
       "year_born" AS "Year" FROM "person";
```

- `input predicate` → `CREATE TABLE`
- query → `SELECT DISTINCT`
- variables → `AS` aliases
- swap in a constant (`?- person(Name, "uk", Year).`) → a `WHERE` condition
- `DISTINCT` because Datalog has set semantics

---

# Imperative lens

In Python you'd write a different function for each question:

```python
people = [("ada_lovelace", "uk", 1815), ...]

def all_people():           return people
def people_from(country):   return [p for p in people if p[1] == country]
def people_born_in(year):   return [p for p in people if p[2] == year]
```

Four questions → four functions. The Datalog version is **one predicate, four queries** — because a relation has no preferred input or output column.

---

# Recap

- A program is **facts** + **queries**.
- `input predicate` declares a typed predicate; data lives in a sibling file. Inline facts are fine for small examples.
- **Logic lens** — predicates are relations, queries ask for witnesses.
- **SQL lens** — `input predicate` is `CREATE TABLE`; a query is `SELECT DISTINCT`.
- **Imperative lens** — one predicate replaces a fistful of direction-specific Python functions.

---

# Where to next

Time to give Datalog some reasoning power: **rules**.

A shared variable across two body atoms is secretly a SQL join — and that's all you need to write meaningful programs.

[Chapter 2. Rules, variables, and joins →](02-rules-and-joins.md)
