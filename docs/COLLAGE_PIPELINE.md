# Artwork-first pipeline (Editorial Paper Collage)

Artwork is designed and made OUTSIDE the code: illustration, photography, or Z Image / Qwen generations, cleaned and exported as layered PNGs. A scene is a DATA manifest that places those layers, gives them depth, paper treatment and motion, and adds live Thai text. The engine never draws a scene's artwork, and a new scene needs a manifest, not new animation code.

## Steps

1. **Brief and storyboard:** style, palette, key frames, focal points, text. Example: `src/stories/pilot_collage/ART_BRIEF.md`.
2. **Asset list:** exact file names, minimum pixel sizes, transparency, anchors, depth, plus generation prompts that exclude text, numbers, logos and watermarks.
3. **Make the art:** automatically with `node tools/gen_assets.mjs --story=<story>` (local ComfyUI; see below), or by hand: put PNGs in `assets/stories/<story>/<scene>/`.
4. **Validate before any render:** `node tools/validate_assets.mjs --story=<story>`. It checks:
   - resolution against the closest camera zoom;
   - transparency, margins and naming;
   - that the backdrop covers the frame under every camera position.
5. **Assemble:** the manifest (`scene.js`) with layers, camera keys, keyframed motion, reveals and text.
6. **Check cheaply in the cloud:**
   - `node render.mjs --story=<story> "--sheet=…" --w=200`;
   - `node tools/aspect_test.mjs --only=<story> --aspects=9:16`, which also FAILs any text that covers a subject layer.
7. **Final render locally:** `node render.mjs --story=<story> --clip --out=out/<story>.mp4`.

## Automatic asset generation (`tools/gen_assets.mjs`, local ComfyUI)

The manifest's `gen` blocks say how each layer is made, so the same tool works for every scene and story:

```
node tools/gen_assets.mjs --story=<id> --dry            # the plan and the exact prompts; nothing is generated
node tools/gen_assets.mjs --story=<id>                  # generate → remove background → size → derive → validate
node tools/gen_assets.mjs --story=<id> --preview        # …then a low-res contact sheet of the scene (out/gen/)
node tools/gen_assets.mjs --story=<id> --only=sun --force   # remake one layer
node tools/gen_assets.mjs --story=<id> --mock           # test the whole pipeline with stand-ins (out/mock_assets/, never the art folder)
```

### Engines

These are your own ComfyUI workflows. In ComfyUI, export each one with **Save (API Format)**, then point `tools/comfy/engines.local.json` at them. Start from `engines.example.json`; the local file is git-ignored.

The client finds each workflow's inputs on its own, by following the sampler's links: the prompt and negative prompt (also through `ConditioningZeroOut`), the seed (`seed` / `noise_seed` / `RandomNoise`), the size (`Empty*LatentImage`) and a `LoadImage` reference. Add `"bind": { "positive": "<node>.<input>" }` only if a workflow is unusual.

Waiting on a job is bounded (`--timeout`, 600 s). Tests:
- `tools/comfy/test_client.mjs` tests the client against a mock ComfyUI server.
- `tools/comfy/test_matte.py` tests the matte on synthetic sources with specks, green spill, fibres and baked shadows.
- `python tools/comfy/imageops.py compare --in a.png b.png --labels before,after --out sheet.jpg` shows cut-outs on a checker, on white, on dark, and as a lower-edge zoom.

### The `gen` block

```js
gen: { engine: 'zimage' | 'qwen' | 'manual' | 'derive', prompt, negative, size: [w, h], seed, matte: 'chroma' | 'rembg' | 'none',
       margin, style (replaces the scene's) | false, character, ref,
       op: 'screen_glow' | 'beside', from, source: { …a gen block… }, mirror, colors }      // derive only
```

The scene-level `gen: { seed, style, isolate, negative }` keeps one paper language, one light and one seed family across every layer.

### Rules

| rule | what happens |
|---|---|
| no text in artwork | Every negative prompt is guaranteed to include text, letters, words, numbers, digits, typography, logo, watermark and signature. A prompt that *asks* for text is refused, because Thai text is live text in `type`. |
| backgrounds | Generated on flat chroma green, then removed in `tools/comfy/imageops.py`. The key works on the green *ratio*, measured against the green actually rendered (taken from the image border), so a shadow cast on the green is removed too. Detached specks are removed by connected components, while torn fibres attached to the object stay. Edge colours are un-mixed from the background and despilled against the object's own nearby colour (yellow, cream and skin are never altered). A neutral baked shadow touching the outside is cleared; if one can't be separated, the layer is marked for regeneration. `matte: 'rembg'` uses rembg if installed, and `unshadow: false` keeps dark-edged art (a black phone) intact. An image with no chroma background is rejected and regenerated. |
| sizes | Every layer is upscaled (Lanczos) to the pixels its closest shot needs in every declared format. A layer is sized by width (`size: [w]`) or height (`size: [null, h]`). |
| aligned layers | `derive` makes layers on another layer's canvas, so they line up with no offsets: `screen_glow` finds the dark phone screen and lights it; `beside` places marks either side of the phone. |
| validation | Every layer is checked with the same rules as `validate_assets.mjs` (shared code in `tools/lib/manifest.mjs`), including matte quality: detached specks, green contamination (`allowGreen: true` for green art), and a dark outer rim (a likely baked shadow, WARN). Only failing layers are retried: first a cheap re-matte at two other tolerances, then regeneration with a new seed, up to `--retries`. Passing layers are never touched. |
| cache | Results are keyed by content in `.cache/assets/` (git-ignored, shared by all stories, or set `ASSET_CACHE`). Generated source images are keyed by engine, workflow file, prompts, seed and size. Processed images are also keyed by the code of `imageops.py`, so a matting fix redoes only the processing. Reprocess without any AI call: `node tools/gen_assets.mjs --story=<id> --only=<layer> --offline`. The same request is never generated twice. A rerun starts from the attempt that last passed. `_generated.json` records each layer's seed, prompts, matte report and status. |
| manual import | A layer without `gen`, with `engine: 'manual'`, or a file you placed yourself (no record in `_generated.json`) is only validated, never overwritten (unless `--force`). |
| consistency | `character: '<name>'` gives a layer the same seed family wherever it appears, in any story. `ref` passes a reference image to workflows that take one (e.g. Qwen-Image-Edit). |

## The manifest (`src/collage/collage.js`)

```js
SCENES.my_scene = {
  assets: 'assets/stories/<story>/<scene>/', duration: 3, background: '#E9DCC6',
  camera: [[t, x, y, zoom, ease], ...],                 // world px on the 1080 × 1920 page; zoom eases in log space
  layers: [{ id, file, size: [w], at: [x, y], anchor: [.5, .5], rot, scale, opacity, depth,
             paper: { shadow: { dx, dy, blur, opacity, color }, border, borderColor, grain },
             keys: [[t, { x, y, rot, scale, opacity }, ease], ...], step: 2,
             reveal: { kind: 'place', at, dur, from, dist, rot, lift }, fill: true, subject: true }],
  narration: [{ at, end, text }],                       // beats; retime to a real voice
  type: [ typeOverlay items ],                          // live Thai text (kinetic presets), kept off subject layers
};
playCollage(SCENES.my_scene);
```

Everything is plain JSON-safe data, so an external planner (AutoCinematic) can write manifests directly. Any future integration package is PATCH ONLY.

### What each feature does

| feature | what it does |
|---|---|
| image layers | imported PNGs, uniformly scaled (`size` is the width; the height follows the image), never stretched |
| depth | parallax through the existing `parallax()` (1 = the page, below 1 = behind, above 1 = in front) |
| paper treatment | prepared once per image: a cast shadow from its own alpha, an optional cut-paper margin (`border`), paper grain inside the shape |
| `keys` | absolute values at times, eased; `step: 2` animates on twos for a hand-made feel |
| `place` reveal | a cut-out laid onto the page: it arrives lifted (larger, softer shadow), rotates into place and presses down |
| `subject` | text never covers it (the collision-aware text layout) |
| `fill` | a full-bleed backdrop; the validator proves it covers the frame |

### Reused from the engine

`camBegin` (camera), `parallax`, the PRELOAD image loading pattern (from the cutout rig), `typeOverlay` and the kinetic presets (Thai text), the collision-aware text layout, `look.js` (`collage` style), the responsive safe areas, `render.mjs`, `aspect_test`, and `tools/lib/harness.mjs`.

## Tests

| test | what it covers |
|---|---|
| `node tools/validate_assets.mjs --story=collage_test` | PASSes the fixtures |
| `node tools/validate_assets.mjs --story=collage_test --scene=broken` | must FAIL; proves the validator catches problems |
| `node tools/test_engine.mjs` | layout and transition helpers |
| `src/stories/collage_test` | renders every collage feature with synthetic fixtures (`tools/fixtures/collage`); not story artwork |

## Not built yet (deliberately)

- More collage transitions: peel, fold, slide-under.
- Mesh deformation (breathing flat art).
- Per-layer blur and lighting.
- Multi-scene sequencing in one manifest.

Each gets added only when a real scene needs it.
