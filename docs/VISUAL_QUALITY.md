# Visual quality system (`src/look.js`)

Each story chooses a **look** (a visual style). The shared engine then finishes every frame in that style:
- colour grade and key light;
- texture and vignette;
- atmospheric depth;
- glow and contact shadows;
- letterboxing;
- camera polish.

A new story gets all of this by naming a style. It needs no new code.

## What is shared and what stays story-specific

| shared engine: automatic for every story | story-specific: stays in the story |
|---|---|
| colour grade (contrast, saturation, brightness), tint | the palette: world, character and prop colours |
| key light and shade (soft-light, from a side) | character designs, PNG art, proportions |
| paper texture, grain, vignette | world themes (what the place looks like) |
| atmospheric depth: far world layers fade toward the theme's own sky colour | camera keys (where the shot looks), acting, timing |
| glow strength (`glow()`), contact-shadow strength (actors) | one-off effects (a firefly, a shooting star) |
| letterbox bars (wide formats only), with safe areas moved clear of them | text content and its layout per format |
| camera polish: handheld drift, slow breathing push, landing-shake strength | |
| existing systems it builds on: stage camera framing, actor shadow/dust/light, `glow()`, parallax, responsive safe areas | |

A look never draws characters, worlds or props, so it can't change a design or bring Lumo's art style into another story. It only grades and finishes the frame and adjusts shared parameters.

## Styles

| style | for | what it does |
|---|---|---|
| `classic` | the default when no look is set | the original finish: paper, grain and vignette as before; renders pixel-identical to earlier versions |
| `watercolor` | storybook, nature, gentle | warm key light, paper texture, soft vignette, strong atmospheric depth |
| `collage` | craft, scrapbook | heavy paper texture, richer colour, firmer contact shadows, little haze |
| `illustration` | clean 2D animation | slightly crisper contrast and colour, light grain, gentle key light and depth |
| `cinematic` | drama, night, trailers | contrast, teal shade and warm key light, deep vignette, stronger glow, 2.39 letterbox (16:9 only), breathing camera, slight handheld |
| `documentary` | news, explainers with real-world framing | muted colour, visible grain, handheld drift, stronger landing shake |
| `infographic` | data, charts, explainers | clean: no grain, paper or vignette, soft glow, no camera shake |
| `abstract` | music, mood, loops | saturated colour, coloured key light, strong glow, slow breathing push |
| `product` | ads, launches | bright, clean contrast, white top key light, deep vignette, firm shadows, slow push |

## Choosing a look (the Creative Director's call)

```js
// a story's config.js
const PROJECT = { ..., look: 'cinematic' };
// or, with effects disabled or retuned for this story:
const PROJECT = { ..., look: { style: 'watercolor', off: ['letterbox', 'haze'], set: { vignette: { amt: .2 }, glow: 1.2 } } };
```

- `chooseLook({ subject, tone, genre, characters })` picks a style from a short brief. For example, `{ subject: 'data' }` gives `infographic`, `{ tone: 'suspense' }` gives `cinematic`, and `{ subject: 'kids' }` gives `watercolor`. An automatic planner can use it; a story can always override it.
- **Overrides:** `--look=<style>` on `render.mjs`, or `?look=<style>` on the page. These are useful for comparisons.
- **Effect names for `off` and `set`:** `grade`, `tint`, `light`, `paper`, `grain`, `vignette`, `haze`, `glow`, `shadow`, `letterbox`, `camera`.

### Adding a style

Add an entry to `LOOK_STYLES` in `src/look.js`, using only the effect fields. Then run `tools/look_test.mjs --looks=classic,<style>` on Lumo, Pip and `look_infographic`. Check the before/after sheet, and run `tools/aspect_test.mjs --look=<style>` for the three formats.

## How it adapts automatically

- **Atmospheric depth:** fades toward the world theme's own sky colour (`palette.haze`, `skyLow` or `sky`), so a snowy night hazes blue and a meadow hazes pink-cream. It touches only far parallax layers.
- **Letterbox:** applied only to frames wider than the target ratio, never to 9:16 or 4:5. `safeArea()` shrinks to keep clear of the bars, so the stage camera re-frames the character instead of cropping it.
- **Camera polish:** applies to every camera (`camBegin`), whether from the stage or a preset. It is deterministic: smooth sine drift, with no randomness.
- **Glow and shadows:** scale the existing systems (`glow()`, actor `fx.shadow`), keeping each story's own colours.
- **Cost:** effects that are off cost nothing, and the rest are a few 2D canvas operations per frame. Everything is a pure function of time, so it's safe for parallel batch rendering.

## Engine fix found during this work

p5.brush drops washed shapes queued before the frame's first ink stroke. In the infographic test this showed as a missing first bar and missing background blobs. `draw()` now primes the brush every frame with an invisible inked speck. Lumo and Pip render pixel-statistically identical to before.

## Tests: `tools/look_test.mjs`

```
node tools/look_test.mjs                                      # Lumo, Pip, the infographic, type_demo; each before/after
node tools/look_test.mjs --only=phase2_lumo --looks=classic,cinematic --aspect=9:16 --frames=2
```

The BEFORE column is always `classic`. Each frame is checked:

| check | result |
|---|---|
| page errors | FAIL |
| more than 4 % of the frame crushed to black or blown to white, and worse than before | FAIL |
| the character's colours shift too far from the original (identity) | FAIL above 60, NEEDS_REVIEW above 38 (RGB distance) |
| a character or text leaves the safe area (e.g. under letterbox bars) | FAIL |
| flat, low-contrast frame | NEEDS_REVIEW |
| the character separates from its surroundings much less than before | NEEDS_REVIEW |

Output: `out/look/<target>_<aspect>.jpg` sheets and `report.md` (contrast, saturation, % clipped, separation).

`tools/aspect_test.mjs --look=<style>` checks a style in all three formats. Both tools share `tools/lib/harness.mjs`.

## Verified (2026-10-09, low-res, 1 frame per look; cloud software GL)

| target | looks | result | sheet |
|---|---|---|---|
| Lumo (`phase2_lumo`) | classic, watercolor, cinematic | PASS; classic identical to before | [before/after](look/lumo_before_after.jpg), [cinematic in 3 formats](look/lumo_cinematic_3ratios.jpg) |
| Pip (`phase1_demo`) | classic, illustration, documentary | PASS; classic identical to before | [before/after](look/pip_before_after.jpg) |
| `look_infographic` (no characters) | classic, infographic, abstract | PASS in 9:16, 16:9 and 4:5 | [before/after](look/infographic_before_after.jpg), [3 formats](look/infographic_3ratios.jpg) |
| `type_demo` | classic, infographic, collage | PASS | [before/after](look/type_before_after.jpg) |

| `look_infographic` | classic, product, collage | PASS. The first `product` run FAILed with 14 % of the frame blown out on a light background; its brightness boost was removed and its key light and contrast softened, and it now PASSes (1.3 % clipped) | [sheet](look/infographic_product_collage.jpg) |

Existing projects keep `classic` until their config chooses a look. Styles only tested on some targets (for example `product` on the infographic, not yet on a character scene): run `look_test` on the new kind of scene before relying on them.
