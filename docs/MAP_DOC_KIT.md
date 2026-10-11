# Map documentary kit

Presets for history, geography and politics explainers in the style of map-documentary Shorts. They are all registered in the capability catalog, so Opus (the Motion Studio director) and `tools/compile_plan.mjs` can use them in any story.
- **Fixture:** `tools/fixtures/plans/siam_colonial.json`, 40 s. See its [frames](clip_study/siam_colonial_sheet.jpg).
- **Test:** `node tools/aspect_test.mjs --only=map_doc_kit`.

| Preset | Space | What it does |
|---|---|---|
| `mapRegion` (`units`) | map | Fills one country (`name`), or a union of countries and provinces (`units`), with an outer edge only: no lines between the provinces inside it |
| `mapTransfer` | map | A territory changes hands: the new owner's colour sweeps across it (`dir`) with a glowing front, then the edge flashes |
| `mapHighlight` | map | Singles out a territory: a glowing outline that pulses, and a light wash inside |
| `mapPin` | map | Pins a sticker to a place, on a card or a pole: a flag, an icon, a glyph or a PNG |
| `mapBase` satellite | map | Works on the globe too (`projection: "orthographic"`, with a limb shade). `saturate`, `brightness` and `contrast` give the vivid style |
| `mapBase` physical | map | Clean atlas relief (Natural Earth II + 1:10m lakes, no labels), the sharpest style. Both raster styles draw sharp tiles on close shots, flat or globe (`tools/geo_raster_hi.py`; tiles load on demand and the frame is redrawn, so every rendered frame is final) |
| `mapRegion` / `mapTransfer` `blend` | map | `tint` (default): a see-through overlay that keeps the terrain visible; `solid`: opaque paint with a drop shadow |
| `sticker` | screen | A die-cut sticker that pops in: a flag, an icon, a glyph or a PNG (a character, an object) |
| `dateCard` | screen | A tear-off calendar card: Thai month, day, and year in `ce`, `be` or `none` |
| `chapterBadge` | screen | A numbered chapter: the number in a disc, then the title with a `[keyword]` |
| title presets | text | `[keyword]` is drawn in `style.highlight`; `\n` breaks the line (pop, slide, impact) |

**Built-in symbols:**
- **Flags:** th, gb, fr, nl, de, it, ru, id, pl, ua, be, ie, at, es (without arms), jp, bd, vn, cn, la, mm. Any other flag is an `image`.
- **Icons:** document (treaty), cannon, axe, crown, coin.
- **Glyphs:** `?`, `!`, `✕`, `✓`, or any short text.

## Territories and sources

`src/geo/admin1_10m.js` holds the provinces and states of every country (4,568 areas): Natural Earth 1:10m admin-1 (public domain), simplified to 0.03°, about 2.8 MB. Rebuild it with:

```
curl -L -o ne_admin1.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson
node tools/geo_build.mjs --admin1=ne_admin1.geojson --countries=all --tolerance=0.03
```

The compiler checks every area name against the catalog. When a name is wrong, it blocks the shot and lists the closest real names, and the director repairs it.
- A **historical territory** is a union of modern provinces given in the manifest's `data`, with its source and the note that modern borders approximate it.
- The compiler refuses map data without a source.

## Thai narration (`tools/tts.py`)

`python tools/tts.py --manifest=<plan.json> --out=<dir>/narration` speaks each shot's `narration` and writes `narration.wav` and `narration.srt`, with one cue per shot and measured times. Motion Studio's "สร้างเสียงพากย์ไทย" button does this; with "สร้างให้ทั้งหมด", the cuts then follow the voice.

| Engine | Setup | Notes |
|---|---|---|
| `edge` | `pip install edge-tts`; needs internet | Neural voices: th-TH-PremwadeeNeural (female, default), th-TH-NiwatNeural (male). Check the service's terms before commercial use |
| `sapi` | A Thai voice installed in Windows | Offline |
| `silence` | — | Test only |

## People in watercolour (`artwork` + `figure`)

A map story shows the people it is about as watercolour illustrations, never as icons and never drawn in code:

1. The manifest declares them once: `"artwork": { "assets": "assets/stories/<id>/", "style": "...", "negative": "...", "items": { "<name>": { "prompt": "...", "size": [null, 1100] } } }`.
2. A `figure` layer shows one: `{ "cap": "figure", "params": { "at": 0.6, "art": "<name>", "x": 0.24, "y": 0.82, "height": 540 } }`. It rises in from the bottom edge, breathes, and sits on a paper edge with a soft shadow. Per-format values (`{"9:16": …, "16:9": …}`) re-frame it.
3. `compile_plan.mjs` turns the used items into a `SCENES.<id>_art` entry with `gen` blocks and sets `job.assets`. The pipeline (and Motion Studio's art step) runs `node tools/gen_assets.mjs --story=_plan_<id>` on the local ComfyUI before rendering. That run removes the background, sizes and validates each image. Missing artwork is listed at compile time, not blocked.
4. In the cloud, only `--mock` stand-ins exist (`out/mock_assets/...`, used with `--assets=`). They test placement and are never the artwork.

Prompts describe people and clothing only. Every negative guards against text, flags, insignia, and Nazi or hate symbols.

## Tokens on the map (`mapTroops`, `mapBomber`)

These are small watercolour cut-outs from the same `artwork` items, acting on the map. The art is a side view facing right, and a token turns to face its direction of travel.

- `mapTroops` shows an army on the move.
  - A wedge of `count` soldiers (default 3) marches along sourced `coords`.
  - The soldiers step and sway, with dust at their feet and a ring in the side's colour under them.
  - On arrival, a pulse ring plays in that colour.
  - Map labels keep off its start and end points.
- `mapBomber` shows an air raid.
  - The aircraft flies at `altitude`, with its shadow on the ground.
  - Over the `drop` stretch it releases `bombs`. Each bomb falls, then bursts with a flash, a shock ring and smoke.

The effects (dust, bombs, blasts) are drawn, because they are motion. The soldiers and the aircraft are always artwork. Use at most one token group per shot.
