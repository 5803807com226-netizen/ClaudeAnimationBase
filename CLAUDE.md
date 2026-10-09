# Working on this repo

Read ANIMATION_GUIDE.md first. Multi-aspect rules: docs/ASPECT_RATIOS.md.

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

## Rendering

- Cloud: low-res `--sheet` / `--strip` or `tools/aspect_test.mjs --frames=2 --frame-timeout=90 --soft-gl` only. No full-video renders, and no unbounded waiting loops. Final videos are rendered locally on Windows.
- `--sheet` takes times separated by commas (quote them in PowerShell). `--strip=a:b` gives every frame in a span.
