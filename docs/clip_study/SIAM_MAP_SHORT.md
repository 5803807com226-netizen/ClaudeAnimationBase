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

## Missing items: status (11 Oct 2026)

All 8 have been added as presets (see [../MAP_DOC_KIT.md](../MAP_DOC_KIT.md)).
- **Built:** historical territories and transfers, map stickers and flags, date card, chapter badge, satellite globe, region highlight, vivid satellite and Thai narration (`tools/tts.py`).
- **Showcase:** `tools/fixtures/plans/siam_colonial.json`, 40 s. See its [frames](siam_colonial_sheet.jpg).
- **Not tested here:** the Edge and Windows voices, which are blocked or unavailable in the cloud.
- **Still needed:** character art such as King Rama V. Use `sticker` with `image` and a PNG made on ComfyUI.
