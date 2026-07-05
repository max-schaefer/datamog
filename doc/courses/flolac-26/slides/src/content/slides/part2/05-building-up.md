---
title: "How it builds up"
kind: content
section: "Recursion"
tight: true
---

`reach` is a set of `(from, to)` pairs.
Datalog computes it in **rounds**, re-applying the rules until no new pairs appear:

<div class="columns" style="grid-template-columns: 0.8fr 2.2fr; align-items: center;">

<img class="metro" src="/images/metro.svg" alt="Stylised subway-map diagram on a white background, drawn with thick coloured lines and small white station dots ringed in teal (#2f8576), station names in dark teal (#16433c). A horizontal blue line (#1565a8) with arrowheads runs left to right through three stations: Taipei Main Station, then Ximen, then Longshan Temple. From the Ximen station a green branch line (#1a8a4a) with arrowheads drops straight down through two more stations: Beimen, then Zhongshan. All arrows point in travel direction, away from Taipei Main Station." />

<div>

| round | new pairs | reach so far |
| --- | --- | --- |
| 1 | Taipei Main Station→Ximen, Ximen→Longshan Temple, Ximen→Beimen, Beimen→Zhongshan | 4 pairs |
| 2 | Taipei Main Station→Longshan Temple, Taipei Main Station→Beimen, Ximen→Zhongshan | 7 pairs |
| 3 | Taipei Main Station→Zhongshan | 8 pairs |
| 4 | none | 8 pairs: **stop** |

</div>

</div>

<div class="note">
Each round feeds the previous round's <code>reach</code> facts back into the recursive rule.

This "apply the rules until nothing changes" procedure is the heart of recursion in Datalog.
</div>
