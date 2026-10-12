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

## Size and distance (`mapMeasure`, `mapTrueSize`)

For "how big is …?" and "how far is …?" explainers. The engine computes every number on screen from the geometry; none is typed in:
- **Distances** are great-circle distances with the mean Earth radius, 6,371.0088 km.
- **Areas** are the spherical areas of the Natural Earth 1:10m borders. Thailand measures about 516,000 km²; the official figure is 513,120 km².

| Preset | What it does |
|---|---|
| `mapMeasure` | A ruler draws itself along sourced `coords`, with ticks every `tick` km and end caps. Its tag counts the measured length up: `text: "{km} กม."`, rounded to `round`. |
| `mapTrueSize` | A country's outline (`name` or `units`) lifts off and slides on the sphere to a sourced `lonlat`, keeping its true shape and area. Mercator then draws it at the size it really has at its new latitude, so a size comparison is honest. Its tag: `{km2}` (km²), `{rai}`. |

- **Fixture:** `tools/fixtures/plans/thailand_size.json` ("ไทยใหญ่แค่ไหน?", 28 s). It measures Mae Sai → Betong (1,640 km) and Mae Sariang → Khong Chiam (870 km), then lays Thailand over France and Japan at true size.
- **Test:** `node tools/aspect_test.mjs --only=map_size`.

## Explainer kit 2 (`mapFlagFill`, `mapRiver`, `mapZone`, `mapLine`, `mapSpread`, `mapInset`, `yearRuler`, `gauge`, clouds)

Studied from map shorts on borders, growth, size and war.

| Preset | What it does |
|---|---|
| `mapFlagFill` | A territory painted in its flag (`flag`), waving gently |
| `mapRiver` | A named Natural Earth river glows and its name runs along it |
| `mapZone` | A soft, feathered region from sourced `coords`, with a name |
| `mapLine` | A neon or dashed line (equator, border, route), its name written along it |
| `mapSpread` | Something spreading over a territory from a point |
| `mapInset` | A round close-up (opaque artwork) tied to a place |
| `yearRuler` | A tilted year track, the marker slides to the year (screen) |
| `gauge` | A dial from safe to danger (screen) |
| `weather` `kind: "clouds"` | Soft clouds drifting over the frame |

For distances and true sizes use `mapMeasure` and `mapTrueSize` (below). The demo is `tools/fixtures/plans/thailand_kit2.json` (`node tools/aspect_test.mjs --only=map_explainer2`).

## Space and scale kit (`depthProfile`, `galaxy`, `starfield`, `mapObjectRow`, teardrop `mapPin`, satellite view, zoom punch)

Studied from three shorts: the Pacific and the Mariana Trench, the Sun's orbit around the Milky Way, and a journey to Andromeda.

| Preset | What it does |
|---|---|
| `mapBase` `atmosphere: true` | On a globe: a glowing rim (the globe floats in space by default; `stars: false` turns that off) |
| `mapView` `projection: "satellite"` | The view from a spacecraft: keys add `height` (Earth radii from the centre; 1.2 is low) and `lean` (degrees: the camera leans forward; a key's `tilt` stays the dutch tilt). The curved horizon, its glowing air (`atmosphere`) and the stars (`stars`) show above the subject. The camera hangs back behind the subject (the subject sits low, the horizon about 20% from the top); zoom is the lens: the higher, the flatter the horizon (height 1.2, tilt 45, zoom 16–20 is gently curved; 8 is a strong dome); travel in from an orbital key (`height` 8, `lean` 0) |
| `mapView` `punchAt` | A zoom punch for a "look at this" beat on any map: a quick zoom-in (`punch` ×1.1–1.2) that eases back over `punchDur`; on a globe it also rolls `punchRoll` degrees |
| `mapPin` `style: "drop"` | A teardrop map marker (flag, icon, glyph or PNG inside) with a pulse ring at its tip |
| `mapObjectRow` | Copies of a thing line up between two places, one after another, with a running count |
| `depthProfile` | A side cut through the sea: surface, trench, depth arrow and value, objects stacked to scale (screen) |
| `galaxy` | A seeded spiral galaxy, tilted and turning, an optional body on its orbit with a trail and its name (screen) |
| `starfield` | Stars at depth drifting past; `warp` turns them into streaks (a journey); `bg: null` lays them over another layer (screen) |

These are motion graphics (particles and shapes), not story artwork: a real place, person or object is still a generated PNG. The demo is `tools/fixtures/plans/space_scale.json`.

## Real planets (`planet`)

`planet` wraps a real surface map (an equirectangular texture from NASA mission data) onto a sphere, per pixel:

- It turns on its real axial tilt.
- The Sun lights one side (`light` in degrees, `night` = how dark the night side is). The Sun itself glows, with a corona.
- The air glows at the rim (Earth, Venus, Mars, the gas giants).
- Saturn's rings pass behind and in front of it.

`body`: sun, mercury, venus, earth, moon, mars, jupiter, saturn, uranus, neptune. Or give `image`: your own equirectangular map.

Before using it, download the maps once, on a machine with internet access:

```
node tools/get_space_textures.mjs        # 2k maps into assets/space/textures/ (+ CREDITS.md), from Wikimedia Commons' copy of the set
node tools/get_space_textures.mjs --hi   # 8k where they exist, for close-ups
```

The maps come from Solar System Scope (made from NASA data, CC BY 4.0): put the credit line from CREDITS.md in the video description. Without its map the layer stops with an error; it never draws a fake planet.

The maps are in the repo (`assets/space/textures/`, 2k). They were downloaded by the `space-assets` GitHub workflow, because the cloud sessions can't reach these hosts; it runs `tools/get_space_textures.mjs` again whenever that script changes. The demo is `tools/fixtures/plans/solar_system.json` (`node tools/aspect_test.mjs --only=solar_system,preset_planet`).

## Real deep-space pictures (`spacePhoto`)

`spacePhoto` shows a real telescope picture or NASA visualisation. These are pictures, not maps.

`photo`:

- Black holes: blackhole_m87, blackhole_sgra, blackhole_sim (a NASA visualisation).
- Galaxies: andromeda, milky_way_center, whirlpool, sombrero, deep_field.
- Nebulae: pillars, carina, orion, crab.

Or give `image`: your own picture.

How it can show the picture:

- `fit: "cover"`: fills the frame around `focus`, never stretched, with a slow push-in (`zoom` → `zoomTo`) and a gentle glow pulse. `spin` turns it slowly (a galaxy, a black hole); the picture still covers the frame while turning.
- `fit: "circle"`: shows it as a round object over the sky, with a glow.
- `label`: a name. `credit`: a small credit line.

Download the pictures once, on a machine with internet access:

```
node tools/get_space_textures.mjs --photos        # maps + pictures
node tools/get_space_textures.mjs --photos-only   # pictures only
```

It searches the NASA Image and Video Library (images-api.nasa.gov) and prints each picture's title and NASA ID: check each is the picture you expect. Credits go to `assets/space/photos/CREDITS.md`. Some pictures include partners' work (ESA, CSA, STScI, the EHT Collaboration): credit them as the NASA page says. The pictures are in the repo (`assets/space/photos/`), each checked by eye. M87* and Sgr A* are the Event Horizon Telescope images (ESO releases, EHT Collaboration, CC BY 4.0). The others come from NASA's library, each pinned to its NASA ID in the `PHOTOS` table of the script. `blackhole_sim` is an artist's illustration, not a photo: say so when you use it.
