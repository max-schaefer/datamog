---
title: "What about cycles?"
kind: content
section: "Recursion"
tight: true
---

Add one line that loops back: `Zhongshan → Taipei Main Station`.

<img class="metro" src="/images/metro-cycle.svg" alt="The same stylised subway-map diagram as before, with an added loop-back edge. A horizontal blue line (#1565a8) with arrowheads runs left to right through Taipei Main Station, Ximen, then Longshan Temple; a green branch line (#1a8a4a) drops down from Ximen through Beimen to Zhongshan. Now a curving red line (#c0392b) with an arrowhead sweeps out to the left from Zhongshan at the bottom and loops all the way back up to Taipei Main Station, closing the network into a cycle. White station dots ringed in teal (#2f8576), dark teal labels (#16433c)." />

Now `reach("Taipei Main Station", Y)` also holds when `Y` is `Taipei Main Station`.

<div class="note">
A cycle does not cause an infinite loop.

Datalog works with <strong>sets</strong>: once a fact is known, deriving it again adds nothing, so the rounds still stop and evaluation <strong>terminates</strong>.
</div>
