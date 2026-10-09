# Aspect ratios: 9:16, 16:9 and 4:5

Every preset, system and story renders at three formats without editing its source:

| format | size | for |
|---|---|---|
| `9:16` | 1080 × 1920 | Shorts, Reels, TikTok (use it for **new** projects: set `aspect: '9:16'` in their config) |
| `16:9` | 1920 × 1080 | YouTube, landscape |
| `4:5`  | 1080 × 1350 | feed posts |

## Choosing a format

- Render: add `--aspect=9:16` (or `16:9`, `4:5`) to any `render.mjs` command.
- In the browser: `story.html?story=phase2_lumo&aspect=4:5`, `studio.html?aspect=9:16`.
- In a project: `aspect: '9:16'` in its `config.js` (`PROJECT`).
- Without any of these, a project keeps the size its config gives, so existing projects keep their original format.

## The API (`src/responsive.js`)

| call | what |
|---|---|
| `ASPECT()` | the current format: `'9:16'`, `'16:9'`, `'4:5'` (or `'custom'`) |
| `byAspect({ '9:16': a, '16:9': b, '4:5': c })` | a value per format; `{ tall, wide }` also works (4:5 and 9:16 are tall) |
| `av(v)` | resolves `v` if it is such a map, else returns it |
| `nx(f)`, `ny(f)` | a fraction of the frame's width / height, in px |
| `US()` | unit scale: 1 at a 1080 px short side; multiply sizes by it |
| `safeArea('action' \| 'title' \| 'subtitle')` | `{ x0, y0, x1, y1, w, h, cx, cy }` in px, clear of platform UI |
| `fitZoom(w, h, mode)` | zoom that fits a world rectangle: `contain`, `cover`, `width`, `height` |

Built in:
- **Stage camera** (`playStage`): taller formats push in (zoom ×1.12 at 4:5, ×1.28 at 9:16), and the followed character is kept inside `safeArea('action')`. You can override this per format with `camera.framing`.
- **Worlds:** parallax layers are anchored to a fixed world point (`PARALLAX_REF`), and the sky and ground cover any frame height.
- **Typography** (`playType`): `x`, `y`, `maxWidth`, `maxLines` and any style value may be per-format maps. Text shrinks to fit its width and line limit (a counter fits its final value), and every block is clamped into `safeArea('title')`.

## Rules for every preset, system and story (existing and future)

1. **Never assume 1920 × 1080.**
   - Position things with `nx()`, `ny()` or `W`/`H` fractions.
   - Size things with `* US()`.
   - Horizontal offsets that must fit a 1080 px wide frame are width fractions (`nx(700 / 1920)`), not `W / 2 ± px`. A fixed pixel offset from the centre puts objects outside a 9:16 frame.
2. **Never stretch** characters or PNG art. Scale them uniformly (`US()`, camera zoom).
3. **Don't just crop.** Re-frame instead: per-format camera framing, `byAspect` layouts, or the safe areas.
4. **Characters stay inside `safeArea('action')`**, and text inside `safeArea('title')`.
5. **Backgrounds cover the whole frame** at every format: the sky reaches the top, and the ground and foreground reach the bottom.
6. **Test before claiming support.** Run `tools/aspect_test.mjs` and look at the comparison sheet. Only then add the ratios to the registry:
   - `PRESET_ASPECTS` in `src/presets/index.js`;
   - `TYPE_PRESET_ASPECTS` in `src/type/kinetic.js`.

   A new preset starts with `[]`. Never list a ratio that hasn't passed.

### Template for a new motion preset

```js
definePreset('myPreset', {
  label: 'My Preset', about: 'one line',
  defaults: { x: W / 2, y: ny(.6), size: 120 * US(), dist: 400 * US(), at: 0, dur: 1, ease: 'ease' },
  run(t, o) { /* pure function of t; positions from o, sizes already scaled */ },
  demo: { bg: PAL.sky, ground: { y: ny(860 / 1080), color: PAL.sap },
          layers: [(lt) => clawd(nx(700 / 1920), ny(860 / 1080), 24 * US(), feel('happy', lt))] },
});
// then: node tools/aspect_test.mjs --only=preset_myPreset --frames=2   → add to PRESET_ASPECTS when it passes
```

## The test: `tools/aspect_test.mjs`

```
node tools/aspect_test.mjs                                  # everything, all three formats
node tools/aspect_test.mjs --only=phase2_lumo,type_demo --frames=2
node tools/aspect_test.mjs --aspects=9:16 --only=preset_popBounce --verbose
```

It writes a comparison sheet for each target to `out/aspect/<target>.jpg`: one column per format, one row per time. It also writes `out/aspect/report.md` and `report.json`.

Checks:

| check | result |
|---|---|
| page errors | FAIL |
| the followed character leaves the action-safe area | FAIL |
| text overflows the frame or the title-safe area | FAIL |
| a flat, light edge band (uncovered paper) | NEEDS_REVIEW |

Every load and frame has a time limit (`--frame-timeout`, 30 s by default). The exit code is 1 if anything fails.

Preset demos report no character positions, so look at their sheets too: a character cut off at the frame edge is only visible there.

> **Cloud / software GL:** reading a full frame back from the GPU takes 15–30 s with `--soft-gl`. Use `--frame-timeout=90 --frames=2` there. On a real GPU each frame takes well under a second.

## Status (verified 2026-10-09, low-res, 2–5 frames per format)

| target | 9:16 | 16:9 | 4:5 | sheet |
|---|---|---|---|---|
| phase1_demo (Pip, meadow, stage camera) | PASS | PASS | PASS | [pip_phase1_demo.jpg](aspect/pip_phase1_demo.jpg) |
| phase2_lumo (Lumo, snow forest) | PASS | PASS | PASS | [lumo_phase2.jpg](aspect/lumo_phase2.jpg) |
| type_demo (all six typography presets) | PASS | PASS | PASS | [type_demo.jpg](aspect/type_demo.jpg) |
| preset cameraMove, objectReveal | PASS | PASS | PASS | [presets_camera_reveal.jpg](aspect/presets_camera_reveal.jpg) (9:16, 4:5 after the fix) |
| preset popBounce, shapeMorph, brushWipe, particleBurst | PASS | PASS | PASS | [presets_other.jpg](aspect/presets_other.jpg) |

**NEEDS_REVIEW (not yet tested at the new formats).** These keep their original format and still render as before:
- `one_message` (a 9:16 story);
- the studio's `demo.js` scenes and `preset_example`;
- the `emotions` and `views` reference sheets.

Run the test on them before claiming support.

**Known issue (unrelated to aspect):** Lumo's landing trail can leave a faint grey smear.
