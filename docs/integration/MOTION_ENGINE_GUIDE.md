# Motion Engine: how AutoCinematic drives it (contract v1)

AutoCinematic writes a **shot manifest** ([schema](SHOT_MANIFEST_SCHEMA.md)). The engine compiles it against its **live capability catalog**, renders it scene by scene, checks that each scene really moves, and assembles the result. There are no AI calls and no LTX: this is Motion Only.

| step | command (engine folder) | output |
|---|---|---|
| Capabilities | `node tools/capabilities.mjs [--compact]` | `out/capabilities.json` (hash, params, verified aspects) |
| Generate Motion | `node tools/compile_plan.mjs --manifest=<file> [--aspect=16:9] [--catalog=out/capabilities.json]` | `out/plans/<id>/compile_report.json`, `job.json`, `src/stories/_plan_<id>/` |
| Render all | `node tools/pipeline.mjs --job=out/plans/<id>/job.json` | `out/pipeline/<id>/<id>.mp4`, `seg_<shot>.mp4`/`.jpg`/`.motion.json`, `report.json`, `pipeline.log` |
| Render selected scene | `… --only=P02` (add `--force=segment:P02` to redo a passed one) | that scene only; no assembly |
| Re-render failed | `… --failed-only` | failed scenes redone, passed ones kept, then assembly |
| Motion check (any clip) | `node tools/motion_check.mjs --in=clip.mp4 [--still] [--windows=a:b,…]` | PASS/FAIL per window |

## Rules the compiler enforces before anything renders

The compiler blocks a shot for any of these:
- an unknown capability;
- a parameter that isn't in the capability's schema, or is the wrong type, out of range or not in its enum;
- a capability not verified for the aspect;
- `$data` without a `source`;
- a gap or overlap between shots;
- map layers without a `mapView` camera;
- `ltx_video` in `motion_only`.

Substitutions happen only through an explicit `fallback: "alternative:<cap>"`, and they are reported. Nothing silently becomes a still.

## AutoCinematic side (patch, applied on Windows)

`autocinematic_motion_plan_v1.patch` adds `autocinematic/motion_engine.py` (the CLI adapter, no UI) and `autocinematic/motion_plan_ui.py` (a dialog). It also adds one button, **Motion Plan (JS Engine)…**, to the Hybrid Export footer. No existing behaviour changes.

## Local Windows test, prototype (about 10 s) — do this before the 90 s pilot

```
cd C:\Users\User\ClaudeAnimationBase
git fetch origin && git checkout claude/trusting-meitner-3ffnhp && npm install
node tools/capabilities.mjs                                   # expect: 17 capabilities, map: mapBase, mapLabel, mapMarker, routeDraw
node tools/compile_plan.mjs --manifest=tools/fixtures/plans/magellan_proto.json --catalog=out/capabilities.json
node tools/pipeline.mjs --job=out/plans/magellan_proto/job.json                   # 9:16, about 10.2 s, both scenes motion-checked
node tools/compile_plan.mjs --manifest=tools/fixtures/plans/magellan_proto.json --catalog=out/capabilities.json --aspect=16:9
node tools/pipeline.mjs --job=out/plans/magellan_proto_16x9/job.json
```

Then, in the AutoCinematic folder (Git for Windows; the folder does not need to be a git repository):

```
git apply --check autocinematic_motion_plan_v1.patch && git apply autocinematic_motion_plan_v1.patch
copy C:\Users\User\ClaudeAnimationBase\tools\fixtures\plans\magellan_proto.* projects\<project>\production\
ren projects\<project>\production\magellan_proto.json shot_manifest.json
```

In the app, open Hybrid Export, then **Motion Plan (JS Engine)…**, then run each of these in turn:
1. Check Engine
2. Generate Motion
3. Select P01 → Render Selected Scene → Preview Scene
4. Render All Scenes
5. Open Final

Report back:
- the two final MP4s;
- `out/pipeline/*/report.json`;
- any dialog error.
