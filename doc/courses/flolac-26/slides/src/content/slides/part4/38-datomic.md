---
title: "Datomic"
kind: content
section: "Real Systems"
tight: true
---

- A commercial **immutable database**. Facts are never overwritten, only added, so you can query the database **as of any past moment** in time.
- Data is stored as **datoms**, entity-attribute-value triples, queried in **Datalog** directly:

```clojure
[:find ?name
 :where [?p :person/age ?a]
        [(>= ?a 18)]
        [?p :person/name ?name]]
```

- Shared logic variables join the clauses: here `?p` links a person's age to their name, exactly as a shared variable joins atoms in a Datamog rule body.

<div class="note">
Where SQL is the mainstream database language, Datomic shows Datalog itself filling that role in production.
</div>
