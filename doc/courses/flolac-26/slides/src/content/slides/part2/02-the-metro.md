---
title: "The Taipei Metro"
kind: content
section: "Recursion"
tight: true
---

A simplified slice of the **Taipei Metro**, with one branch off the main line:

<img class="metro" src="/images/metro.svg" alt="Stylised subway-map diagram on a white background, drawn with thick coloured lines and small white station dots ringed in teal (#2f8576), station names in dark teal (#16433c). A horizontal blue line (#1565a8) with arrowheads runs left to right through three stations: Taipei Main Station, then Ximen, then Longshan Temple. From the Ximen station a green branch line (#1a8a4a) with arrowheads drops straight down through two more stations: Beimen, then Zhongshan. All arrows point in travel direction, away from Taipei Main Station." />

```prolog
extensional line(from: string, to: string).
```

<div class="note">
<strong>Question:</strong> which stations can you reach from <code>Taipei Main Station</code>, riding in the arrows' direction?
</div>
