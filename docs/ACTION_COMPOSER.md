# Action Composer: articulated character motion from a reference image

You give one character image (and optionally a prop image). The engine:
- finds a skeleton in the image;
- cuts the artwork into skinned limbs;
- plays a timeline of preset actions on it, in 8 layers. The legs can run while the torso aims, the hands grip the prop, effects come out of its muzzle, and the camera follows.

It never moves, zooms or rotates a whole PNG, and it uses no AI video and no LTX. The test results are in [action_demo/REPORT.md](action_demo/REPORT.md).

## Parts

| where | what |
|---|---|
| `tools/action/rig_analyze.py` | character image → `char_rig/1`: joints marked detected / estimated / uncertain, bones with capsule radii; templates `human`, `quadruped`, `object` |
| `tools/action/prop_analyze.py` | prop image → `prop/1` anchors: `origin`, `grip`, `grip2`, `muzzle`, plus `hold_angle` |
| `src/action/catalog.js` | 33 presets, each with a layer, joint mask, Thai name and parameter limits |
| `src/action/rig.js` | segmentation, mesh skinning (mode A texture), coloured points (mode B), FK, two-bone IK |
| `src/action/composer.js` | the layered Action Composer: blending, masks, priorities, root motion, ground contact, props, secondary motion |
| `src/action/play.js` | plays a plan, with props, effects and a follow camera |
| `tools/action/plan.mjs` | validates the `motion_plan/1` schema (alternatives for unknown presets), builds the engine scene, `--catalog` |
| `tools/action/direct.mjs` | Action Director: story → Motion Plan (Opus through Claude Code on your plan, or rule-based without AI) |
| `tools/action/verify.mjs` | motion QA: rig, feet on the ground, no sliding or popping, attach, grip, muzzle, blending |
| `patches/autocinematic_action_composer_v4.patch` | the Thai screen inside AutoCinematic ONE: `autocinematic/action_composer.py` + one button in `app.py` |

## Setup (Windows)

1. **ClaudeAnimationBase.** In the ClaudeAnimationBase folder:

   ```
   git pull
   npm install
   ```

   The engine folder must contain `tools/action/`.

2. **AutoCinematic.** Patches v1, v2 and v3 must already be applied. Back up `app.py` first, then, in the AutoCinematic folder:

   ```
   copy app.py app.py.before_v4
   git apply --check "<ClaudeAnimationBase>\patches\autocinematic_action_composer_v4.patch"
   git apply "<ClaudeAnimationBase>\patches\autocinematic_action_composer_v4.patch"
   ```

   If the folder is not a git repository, `git apply` still works when Git for Windows is installed.

3. **Start AutoCinematic as usual.** Next to "🎞 Hybrid Plan / Export" there is a new button, **🤸 Action Composer (ท่าทางตัวละคร)**.

The patch adds no packages:
- the dialog uses Pillow and numpy, which AutoCinematic's requirements already include;
- the analysis scripts run with AutoCinematic's own Python;
- the engine runs with `node`.

There is no server and no new localhost port.

## Using it (the tabs are in Thai)

1. **ตัวละคร & Rig.** Upload the character image. It is copied into `<project>/action/refs/`; an existing file is never overwritten.
   - Auto-rig runs at once. Red joints are uncertain: drag them into place (they turn blue, "manual"). You can also set a bone's capsule radius.
   - Save the rig.
   - Choose the drawing mode: **A Texture/Mesh** or **B Colored Points** (density, dot size). The editor previews mode B.
2. **พร็อพ & จุดยึด.** Upload the prop.
   - Auto anchors: drag `grip`, `grip2` and `muzzle` if needed, and set the hold angle and scale.
   - Save the anchors.
3. **ไทม์ไลน์ท่าทาง.** The timeline:
   - Double-click a preset to add it at the playhead.
   - Drag a bar to move it, or drag its right edge to resize it. Blend ramps are drawn at its ends.
   - On the right, edit the selected action: its layer, IK target / attachment (prop or point), parameters within their limits, timed effects, blending and joint mask.
   - **ตรวจแผน** validates the plan.
4. **ผู้กำกับท่าทาง (Opus).** Tell the scene in Thai or English, then choose a mode:
   - **Opus** runs Claude Code on your plan. It uses plan quota, not API credits, and asks before running.
   - **กฎภายใน** works without AI.

   The plan is validated. Unsupported presets are rejected with alternatives, and Opus gets one repair round. The result replaces the timeline's actions.
5. **พรีวิว & เรนเดอร์.**
   - **พรีวิว**: a low-res frame sheet, played with the play button and the slider (synced with the timeline playhead).
   - **ตรวจคุณภาพการเคลื่อนไหว**: the 12-check motion QA.
   - **Render MP4**: writes `<project>/exports/action/<plan>_<date_time>.mp4`, always a new file. The resolution, fps, frame count and duration are read back with ffprobe.

Plans live in `<project>/action/plans/<id>.json`. They are the source of truth: re-rendering never calls Opus again.

Opening a plan from outside the project imports a copy. The original and its images are not edited.

## Files it writes, and what it never touches

**Writes.** Only these:
- `<project>/action/…`: refs, plans, previews;
- `<project>/exports/action/*.mp4`;
- two keys in `hybrid_settings.local.json`: `animation_root` and `action_last_plan`, the same file and pattern the Motion Plan dialog uses.

**Never touches.** Story files, other project folders, `config.json`, character references, caches and earlier exports are never written. The test opened an existing project and compared the SHA-1 of all 45 of its files before and after: they were identical.

**Engine side.** ClaudeAnimationBase writes the scene to `src/stories/_act_<id>/` and copies the images to `assets/action/<id>/`. Both are git-ignored.

## Rollback

- **AutoCinematic.** Either restore `app.py.before_v4` and delete `autocinematic/action_composer.py`, or run:

  ```
  git apply -R "<ClaudeAnimationBase>\patches\autocinematic_action_composer_v4.patch"
  ```

  The reverse apply was tested. Projects keep their `action/` folders: they are plain files and can be deleted by hand.
- **ClaudeAnimationBase.** Check out the commit before the Action Composer. Nothing else in the engine depends on `src/action/` or `tools/action/`.

## Optional settings (`hybrid_settings.local.json`)

| key | meaning |
|---|---|
| `"node"` | path to node.exe, when it is not on PATH |
| `"claude_command"` | the `claude` command for Opus mode, when it is not on PATH |
| `"render_flags"` | extra flags for render.mjs / verify.mjs, e.g. `["--soft-gl"]` on a machine without GPU WebGL |

## Limits

These are listed in [the report](action_demo/REPORT.md). The main ones:
- one flat image means turning is a mirror, and hidden limbs only show what the drawing shows;
- auto-rig needs clean, separated limbs;
- the dialog was tested on Linux under Xvfb with AutoCinematic's real `app.py`, not yet on Windows.
