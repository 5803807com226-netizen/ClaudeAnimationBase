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

## People as vector illustrations (`artwork` + `figure`)

A map story shows the people it is about as vector illustrations of real people (realistic proportions, in the pose the narration describes). They are never icons or cartoons, and never drawn in code:

1. The manifest declares them once: `"artwork": { "assets": "assets/stories/<id>/", "style": "...", "negative": "...", "items": { "<name>": { "prompt": "...", "size": [null, 1100] } } }`.
2. A `figure` layer shows one: `{ "cap": "figure", "params": { "at": 0.6, "art": "<name>", "x": 0.24, "y": 0.82, "height": 540 } }`. It rises in from the bottom edge, breathes, and sits on a paper edge with a soft shadow. Per-format values (`{"9:16": …, "16:9": …}`) re-frame it.
3. `compile_plan.mjs` turns the used items into a `SCENES.<id>_art` entry with `gen` blocks and sets `job.assets`. The pipeline (and Motion Studio's art step) runs `node tools/gen_assets.mjs --story=_plan_<id>` on the local ComfyUI before rendering. That run removes the background, sizes and validates each image. Missing artwork is listed at compile time, not blocked.
4. In the cloud, only `--mock` stand-ins exist (`out/mock_assets/...`, used with `--assets=`). They test placement and are never the artwork.

Prompts describe people and clothing only. Every negative guards against text, flags, insignia, and Nazi or hate symbols.

## Tokens on the map (`mapTroops`, `mapBomber`)

These are small cut-outs from the same `artwork` items (vector, real proportions), acting on the map. The art is a side view facing right, and a token turns to face its direction of travel.

- `mapTroops` shows an army on the move.
  - A wedge of `count` soldiers (default 3) marches along sourced `coords`.
  - The soldiers walk as a flip-book of two whole-figure stride frames (`art`, `artStep`: no rig, nothing cut apart), sway gently, kick up dust, and have a ring in the side's colour under them.
  - On arrival, they switch to the `artArrive` pose (charging, aiming, a flag) with a small hop, and a pulse ring plays in that colour.
  - Map labels keep off its start and end points.
- `mapBomber` shows an air raid.
  - The aircraft flies at `altitude`, with its shadow on the ground.
  - Over the `drop` stretch it releases `bombs`. Each bomb falls, then bursts with a flash, a shock ring and smoke.

The effects (dust, bombs, blasts) are drawn, because they are motion. The soldiers and the aircraft are always artwork. Use at most one token group per shot.

## Explainer kit (`mapLabel` marker / neon, `mapGlow`, `mapSwarm`, `mapNote`, `mapPhoto`, `weather`, `spyglass`, antique map, rivers)

These presets came out of a study of a "why is it called…" map short. Each one does its own job:

| Preset | What it does |
|---|---|
| `mapLabel` `style: "marker"` | A yellow highlighter strip wipes in under dark text, tilted by `angle` |
| `mapLabel` `style: "neon"` | The text flickers on and glows in `glow` |
| `mapGlow` | A territory glows from inside (fill, inner glow, bright rim) and breathes |
| `mapSwarm` | Tokens (an artwork item, or an emoji `glyph`) pop one by one at seeded points spread across a territory |
| `mapNote` | A handwritten note (Mali, font role `hand`) is written on, then a hand-drawn arrow draws itself to the place |
| `mapPhoto` | A photo card (an opaque artwork item) pops out beside a place, white border, tilted |
| `weather` | Snow, rain or dust over the frame (screen) |
| `spyglass` | The frame becomes a telescope view of an opaque artwork scene, with an optional speech bubble (screen) |
| `mapBase` `style: "antique"` | The physical map aged: sepia, paper grain, graticule, vignette |
| `mapBase` `rivers: true` | Natural Earth 1:10m rivers (`src/geo/rivers_10m.js`) |

Artwork items may set `"opaque": true` for a whole picture (no cut-out) and `"style"` to replace the shared style. The demo is `tools/fixtures/plans/bangkok_name.json`.

## Explainer kit 2 (`mapFlagFill`, `mapMeasure`, `mapCompare`, `mapRiver`, `mapZone`, `mapLine`, `mapSpread`, `mapInset`, `yearRuler`, `gauge`, clouds)

Studied from map shorts on borders, growth, size and war.

| Preset | What it does |
|---|---|
| `mapFlagFill` | A territory painted in its flag (`flag`), waving gently |
| `mapMeasure` | A distance line with ticks and arrowheads between two sourced places, the value in a tag |
| `mapCompare` | A territory's outline slides over the sphere onto another place at its TRUE size |
| `mapRiver` | A named Natural Earth river glows and its name runs along it |
| `mapZone` | A soft, feathered region from sourced `coords`, with a name |
| `mapLine` | A neon or dashed line (equator, border, route), its name written along it |
| `mapSpread` | Something spreading over a territory from a point |
| `mapInset` | A round close-up (opaque artwork) tied to a place |
| `yearRuler` | A tilted year track, the marker slides to the year (screen) |
| `gauge` | A dial from safe to danger (screen) |
| `weather` `kind: "clouds"` | Soft clouds drifting over the frame |

The demo is `tools/fixtures/plans/thailand_size.json`.

## Space and scale kit (`depthProfile`, `galaxy`, `starfield`, `mapObjectRow`, teardrop `mapPin`, tilted map, globe in space)

Studied from three shorts: the Pacific and the Mariana Trench, the Sun's orbit around the Milky Way, and a journey to Andromeda.

| Preset | What it does |
|---|---|
| `mapBase` `stars: true` / `atmosphere: true` | On a globe: a starry sky behind it (drifting as it turns) and a glowing rim |
| `mapView` `projection: "satellite"` | The view from a spacecraft: keys add `height` (Earth radii from the centre; 1.2 is low) and `tilt` (degrees). The curved horizon, its glowing air (`atmosphere`) and the stars (`stars`) show above the subject. For a wide, gentle horizon use height 1.2, tilt 40–45, zoom 7–8; travel in from an orbital key (`height` 8, `tilt` 0) |
| `mapView` `punchAt` | A zoom punch for a "look at this" beat on any map: a quick zoom-in (`punch` ×1.1–1.2) that eases back over `punchDur`; on a globe it also rolls `punchRoll` degrees |
| `mapView` `tilt` / `tiltTo` | Leans the flat map image back like a sheet. Its edges show, so don't use it: use `satellite` or `punchAt` |
| `mapPin` `style: "drop"` | A teardrop map marker (flag, icon, glyph or PNG inside) with a pulse ring at its tip |
| `mapObjectRow` | Copies of a thing line up between two places, one after another, with a running count |
| `depthProfile` | A side cut through the sea: surface, trench, depth arrow and value, objects stacked to scale (screen) |
| `galaxy` | A seeded spiral galaxy, tilted and turning, an optional body on its orbit with a trail and its name (screen) |
| `starfield` | Stars at depth drifting past; `warp` turns them into streaks (a journey); `bg: null` lays them over another layer (screen) |

These are motion graphics (particles and shapes), not story artwork: a real place, person or object is still a generated PNG. The demo is `tools/fixtures/plans/space_scale.json`.
