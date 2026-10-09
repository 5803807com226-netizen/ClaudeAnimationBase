# Artwork-first pipeline (Editorial Paper Collage)

Artwork is designed and made OUTSIDE the code: illustration, photography, or Z Image / Qwen generations, cleaned and exported as layered PNGs. A scene is a DATA manifest that places those layers, gives them depth, paper treatment and motion, and adds live Thai text. The engine never draws a scene's artwork, and a new scene needs a manifest, not new animation code.

## Steps

1. **Brief and storyboard:** style, palette, key frames, focal points, text. Example: `src/stories/pilot_collage/ART_BRIEF.md`.
2. **Asset list:** exact file names, minimum pixel sizes, transparency, anchors, depth, plus generation prompts that exclude text, numbers, logos and watermarks.
3. **Make the art:** generate, cut out and clean the PNGs, and put them in `assets/stories/<story>/<scene>/`.
4. **Validate before any render:** `node tools/validate_assets.mjs --story=<story>`. It checks:
   - resolution against the closest camera zoom;
   - transparency, margins and naming;
   - that the backdrop covers the frame under every camera position.
5. **Assemble:** the manifest (`scene.js`) with layers, camera keys, keyframed motion, reveals and text.
6. **Check cheaply in the cloud:**
   - `node render.mjs --story=<story> "--sheet=…" --w=200`;
   - `node tools/aspect_test.mjs --only=<story> --aspects=9:16`, which also FAILs any text that covers a subject layer.
7. **Final render locally:** `node render.mjs --story=<story> --clip --out=out/<story>.mp4`.

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
