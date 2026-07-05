---
title: "One IDB, many EDBs"
kind: content
section: "Pokémon"
tight: true
---

The **rules** are what makes the program. If you change them, you get a different program.

The **EDB** can change between runs. The same program computes different IDBs from different EDBs.

<img class="graph" style="max-height: calc(var(--u) * 44);" src="/images/idb-edb.svg" alt="Flat data-flow diagram, left to right, on a white background with rounded rectangular boxes and thick directed arrows. Two input boxes on the left feed a single shared box in the centre, which feeds two output boxes on the right. Top row is teal (fill #e6f2ef, border #5f9d92, arrows #34786c): box 'EDB 1' lists monospace rows 'Snorlax 210' and 'Pikachu 111', an arrow runs to the central box, and another arrow runs from the central box to box 'Result 1' listing 'Snorlax'. Bottom row is amber (fill #f7edd8, border #d9a441, arrows #cf8a2e): box 'EDB 2' lists 'Mewtwo 246', 'Slaking 284', 'Magikarp 20', an amber arrow runs to the central box, and another amber arrow runs from it to box 'Result 2' listing 'Mewtwo' and 'Slaking'. The central teal box titled 'IDB, same rules' holds the monospace Datalog rule strong_pokemon(N) :- pokemon(_, N, H), H > 150. Dark teal text throughout (#16433c)." />
