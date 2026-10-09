# Working on this repo

Read ANIMATION_GUIDE.md first. Multi-aspect rules: docs/ASPECT_RATIOS.md. Visual styles: docs/VISUAL_QUALITY.md.

## Every preset, system and story supports 9:16, 16:9 and 4:5

- Use src/responsive.js instead of assuming 1920 × 1080:
  - positions: `nx()` / `ny()`;
  - sizes: `* US()`;
  - per-format values: `byAspect` / `av`;
  - keep things inside `safeArea('action' | 'title')`.
- Horizontal positions that must fit a 1080 px wide frame are width fractions, not `W / 2 ± px`.
- Never stretch characters or PNG art, and don't fix a format by cropping: re-frame it.
- Before listing a format as supported, it must PASS `node tools/aspect_test.mjs --only=<target>`, and the comparison sheet in out/aspect/ must look right.
- Then add the formats to the registry:
  - `PRESET_ASPECTS` (src/presets/index.js);
  - `TYPE_PRESET_ASPECTS` (src/type/kinetic.js).

  A new preset starts with `[]`.
- New projects: `aspect: '9:16'` in their config. Existing projects keep their format unless `--aspect` is given.

## Visual quality: a look per story, never per-story finishing code

- The finish (grade, light, texture, vignette, depth haze, glow and shadow strength, camera polish) comes from `src/look.js`.
- Every style renders full frame, edge to edge, in every format. Letterbox bars are never on by default; only a story's explicit `set: { letterbox: <ratio> }` adds them. The tests FAIL black bars.
- A story picks a style in its config: `look: 'cinematic'` or `{ style, off: [...], set: {...} }`. See docs/VISUAL_QUALITY.md.
- Don't hand-tune those effects inside a story. If a style needs to change, change `LOOK_STYLES` and re-run `node tools/look_test.mjs`.
- Story-specific: palette, characters, world theme, camera keys, acting. A look never changes these.
- A new or changed style must PASS `tools/look_test.mjs` (before/after against `classic`) and `tools/aspect_test.mjs --look=<style>`.

## Artwork-first scenes (Editorial Paper Collage)

- Story artwork is imported PNG layers made outside the code (docs/COLLAGE_PIPELINE.md). Never draw a scene's artwork procedurally.
- A scene is a data manifest (`SCENES.id = {...}`, `playCollage`). Prefer extending the manifest over writing scene-specific code.
- Run `node tools/validate_assets.mjs --story=<id>` before any render. Image-generation prompts always exclude letters, numbers, logos and watermarks; Thai text is live text (typeOverlay), and subject layers are kept clear of it.
- Make artwork with `node tools/gen_assets.mjs --story=<id>` (local ComfyUI, from the manifest's `gen` blocks; `--mock` / `--dry` in the cloud). Never present mock stand-ins as artwork, and never claim assets were generated unless the pipeline produced and validated them.
- Prototype one polished short scene before a full video.

## Rendering

- Cloud: low-res `--sheet` / `--strip` or `tools/aspect_test.mjs --frames=2 --frame-timeout=90 --soft-gl` only. No full-video renders, and no unbounded waiting loops. Final videos are rendered locally on Windows.
- `--sheet` takes times separated by commas (quote them in PowerShell). `--strip=a:b` gives every frame in a span.
