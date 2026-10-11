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
