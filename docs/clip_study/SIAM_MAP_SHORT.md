# Clip study: "ทำไมไทยถึงไม่เคยเป็นเมืองขึ้น?" (EARTHLY, 91 s, 9:16)

The reference Short is a map documentary.
- **Picture:** one continuous camera over a satellite map (no hard cuts were detected), with colour-coded countries, flags and stickers pinned to places, a numbered chapter structure, date cards and keyword subtitles.
- **Sound:** a Thai voice with music.
- **Frames:** [30–60 s](reference_30-60s.jpg) and [60–90 s](reference_60-90s.jpg).

**Test.** The first 15 s were rebuilt with the engine only (`tools/fixtures/plans/siam_hook.json`). Here is a [side-by-side at matching times](siam_hook_compare.jpg).

## What the system already does (used in the test)

| Element of the clip | Engine |
|---|---|
| Satellite map, smooth zoom and pan, motion blur | `mapBase` satellite + `mapView` (Mercator) |
| Countries filled red / blue / yellow with white edges | `mapRegion` (modern borders) |
| Place and sea labels in Thai, city dots | `mapLabel`, `mapMarker` |
| Globe that turns from Europe to Asia | `mapView` orthographic |
| Dashed sea routes drawing themselves, ships sailing | `routeDraw`, `mapSprite` ship |
| Railway line drawn between cities | `routeDraw` |
| Bottom subtitle with yellow keywords | `captionBar` |
| Big title with a yellow keyword, 2 lines | `type.pop` + **`[keyword]` and `\n` (added now, all title presets)** |
| Big year "1909" slam | `type.impact` |
| Channel name top right | `type.label` (`safe: false`, `avoid: false`) |
| Timeline, counters, charts | `timeline`, `type.counter`, charts |
| SFX on motion, music under the voice | `compile_plan` auto SFX, `audio.music` |
| 90 s length, per-scene render, re-render failed | `tools/pipeline.mjs` |

## Missing (in order of impact on this kind of clip)

| # | Missing | Where it shows | Size | Needs from you |
|---|---|---|---|---|
| 1 | **Historical and partial territories**, with a "territory changes hands" animation (an area turns from yellow to blue, with the year) | the whole second half: 1893, 1904, 1909 cessions | large | source for the historical borders (polygons with references; the compiler rejects unsourced map data) |
| 2 | **Stickers pinned to places**: flags, a treaty document, a cannon, a red X, a question mark, an axe | almost every shot | medium | the artwork: flags as PNG (public domain), icons generated on ComfyUI |
| 3 | **Date card** (day / Thai month / year calendar) and **chapter badge** (number in a circle + title) | chapters 1–3 | small | – |
| 4 | **Satellite texture on the globe** (today the globe is flat colour) | 12–15 s | medium | – |
| 5 | **Region highlight**: a lighter inner area, a glowing outline, a pulse | "ส่วนสำคัญ", "แกนกลางของประเทศ" | small | – |
| 6 | **Thai narration voice** (no text-to-speech in the system) | the whole clip | depends | choice of TTS or a recorded voice |
| 7 | **Cartoon character sticker** (e.g. King Rama V) | 40–45 s | small (engine) + art | the character artwork |
| 8 | **Brighter "stylised" satellite look** (turquoise shallow seas, more saturation) | throughout | small | – |
