# Unified Architecture Plan

Related documents: [audit](CURRENT_SYSTEM_AUDIT.md), [gaps](INTEGRATION_GAP_REPORT.md), [manifest](SHOT_MANIFEST_SCHEMA.md), [registry](DYNAMIC_CAPABILITY_REGISTRY.md).

## Ownership

```
AutoCinematic (UI, state, AI, assets, audio)          ClaudeAnimationBase (motion engine)
──────────────────────────────────────────           ──────────────────────────────────
Research → Script (Opus/Sonnet)                       capabilities.mjs  → catalog.json ──┐
TTS (OmniVoice) → narration.wav + measured SRT        compile_plan.mjs  (validate, resolve)│
Global Strategy + Shot plan (Opus, uses catalog) ◄────────────────────────────────────────┘
Assets: ComfyUI Z-Image / Qwen / LTX (only if allowed)
writes shot_manifest.json ──► motion_adapter.py ──►  pipeline.mjs --manifest  (existing:
                                                      director transitions, timeline fit,
                                                      per-shot cache, xfade, audio mix)
                                                      render.mjs  story=_plan  playPlan(shot)
                                                      motion_check → report.json
Hybrid dialog shows previews / status ◄─────────────── out/pipeline/<id>/{S*.mp4, *.jpg, report.json}
```

- **One orchestrator:** CAB `tools/pipeline.mjs`. Both `hybrid_bridge.py` and Remotion are kept for legacy jobs and get no new features.
- **One translator:** the compiler. `motion_only.py` v0.5 stays as a fallback. Its 16 scene templates can later be ported into registered JS capabilities, so the Python string templates go away.
- **One UI:** the existing AC hybrid dialog and main window.
- **The contract** between the two is files: `catalog.json`, `shot_manifest.json`, `report.json`, plus the CLI exit codes. There are no imports across repos.
- **Timing:** narration is measured first, and visuals fit to it. AC stops time-stretching the voice to fit shots in this mode.

## Staged implementation plan to the 90-second pilot

Each stage is a small patch with a pass/fail test. C means verifiable in the cloud; L means it needs local Windows.

| # | stage | deliverable | test |
|---|---|---|---|
| 0 | Access | Private AC repo added to the session (or keep patching against the snapshot) | `list_repos` shows it |
| 1 | Registry | `meta` on 6 presets and the type presets; `tools/capabilities.mjs`; manifest-driven `story.html` | C: catalog JSON lists 6 + N capabilities; `test_engine` still passes |
| 2 | Compiler and plan player | `tools/compile_plan.mjs` and `src/plan/play.js` (`playPlan`): layers, camera, type, timing | C: a fixture manifest with 3 shots; invalid params and unknown caps are blocked before render |
| 3 | Motion validation | `tools/motion_check.mjs`: low-res samples, changed-pixel fraction against `expected_motion` | C: a static shot fails and a moving shot passes |
| 4 | Pipeline adapter | `pipeline.mjs --manifest`, plus `--only=S03` and `--failed-only` on the existing `state.json` | C: smoke with `--max-seconds`; L: real clips |
| 5 | Map capabilities | d3-geo plus `world-atlas` (both ISC); `mapView`, `mapBase`, `routeDraw`, `mapLabel`, `territoryHighlight` | C: capability tests at 9:16 and 16:9 |
| 6 | AC adapter | `autocinematic/motion_adapter.py`: export the manifest from the story, call the pipeline, read the report; dialog buttons for Generate Motion and Re-render Failed | L (patch against AC) |
| 7 | Director prompt | `opus_visual_director.txt`: strategy, then shots in manifest v1, given the compact catalog | L: one Opus call per project; compiler accepts the result |
| 8 | 90-s pilot | Story, measured narration, manifest, previews, MP4, allocation and validation report | L: duration 90 ± tolerance, motion check passes on all shots, single-shot re-render |

**Order rationale.** Stages 1–4 are the smallest end-to-end path (spec Phase 3) using existing presets. Maps come after the path works, so the first real shot needs no new art.

## Pilot story (proposal)

**Magellan–Elcano circumnavigation, 1519–1522.**

- **Why it fits:** it is map-dominant, its route and dates are well documented, it needs no disputed borders (Natural Earth coastlines are enough), and Pigafetta's account is public domain.
- **Alternative:** the Silk Road, which is harder because routes and dates are less exact.
- **Treatments:** the first estimate is about 90 % `animated_map` and 10 % `documentary_photo` (public-domain engravings plus parallax). It uses 0 LTX clips.

## Decisions needed from you

1. Add the private AutoCinematic repo, or confirm that patches against the RAR snapshot are acceptable.
2. Pilot story and sources (provide the PDF or the sources).
3. Allow npm dependencies `d3-geo` and `world-atlas` (vendored data, no runtime network access).
4. Approve starting stages 1–4 in this repo.
