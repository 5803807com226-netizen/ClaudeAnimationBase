# Action Composer: test report (phases 1–6)

These are the results that were actually produced, in the cloud test container (Linux, Chromium with software GL). Nothing was run on Windows yet, and Opus was not called for real (see Phase 5).

## The mandatory demo: `tools/fixtures/action/demo_blaster.json`

The demo is 5 s long, 24 fps, 1080 × 1920 (9:16). It uses one generated test character (`test_kai.png`) and one prop (`blaster.png`). Both are flat test artwork made by `tools/action/make_test_assets.py`; they are not AI-generated.

| time | action (layer) | what you see |
|---|---|---|
| 0–0.8 s | pick_up (upper_body) + implied crouch | squats, the front hand closes on the grip at 0.36 s, lifts the blaster |
| 0.8–2.0 s | run (lower_body) | run cycle with flight phase; the blaster stays in the hand |
| 2.0–3.2 s | jump (lower_body) | crouch, take-off with run momentum, tucked legs, over the crate |
| 2.15–3.3 s | aim (upper_body) | both hands raise the blaster (second hand on the fore grip) while the legs jump |
| 2.6 s | fire + recoil (upper_body / effects) | muzzle flash on the muzzle anchor, an energy bolt, smoke, recoil kick |
| 3.2–3.6 s | land (lower_body) | knees absorb, dust |
| 3.6–5.0 s | idle | feet step into stance, arms lower the blaster, breathing |

**MP4.** The MP4 was rendered with `node render.mjs --story=_act_demo_blaster --clip --fps=24`. ffprobe reports `h264 1080x1920 yuv420p 24/1 fps, 120 frames, 5.000 s, 4.1 MB`. The file itself is not committed (a generated video); it was written to `out/action/demo_blaster/demo_blaster_1080x1920.mp4`.

**Frames inspected.** The frames were inspected from the MP4, not just checked by exit code:
- Every 6th frame: the contact sheet ([contact_sheet.jpg](contact_sheet.jpg)).
- All 121 frames: a low-res strip.
- Full-resolution crops at the pick-up, the fire and the landing.

**Rig overlay.** The overlay images are [rig_overlay.jpg](rig_overlay.jpg) and [rig_overlay_detail.jpg](rig_overlay_detail.jpg) (`?overlay=1`). They show:
- the bones;
- joints coloured by confidence: green = detected, orange = estimated, red = uncertain.

**Motion Plan.** The plan is in [motion_plan.json](motion_plan.json). It is validated (`motion_plan/1`) and reproducible: rendering it again never calls a model.

### Verification (`tools/action/verify.mjs`, the composed pose sampled at 120 Hz)

[verify.json](verify.json): **12/12 checks passed**

| check | measured |
|---|---|
| rig hierarchy | 15 bones, 0 missing parents, joint gap 0.000 px |
| planted feet on the ground | max 0.26 px off the ground line |
| planted feet don't slide | max 0.70 px between samples |
| feet back on the ground at the end | 0.00 px |
| no joint snapping | max 28 rad/s (limit 40 rad/s = 1.7 rad per frame) |
| no body teleport | max 10.9 px per 1/120 s (the run speed) |
| prop in world → in hand at attach | attach at 0.36 s |
| hand meets the grip when it closes | 0.36 px |
| prop stays in the hand (run, jump, land) | max 1.21 px over 557 samples |
| second hand on the fore grip while aiming | max 0.59 px |
| muzzle flash rides the muzzle anchor | 0.000 px change (rigid with the prop) |
| aim blends with the leg action | at 3.10 s the jump lifts the feet 81 px while the aim holds the arms |

### The other phase tests (all re-run on the final code)

| plan | what it tests | result |
|---|---|---|
| phase1_run_jump | rig, walk → run → jump → land, ground contact | 6/6 |
| phase2_pickup_drop | pick up, carry while walking, drop (falls, bounces, rests) | 10/10 |
| phase3_layers | legs walk while torso points / looks; interrupt and resume; masks; additive | 15/15 |
| preset_tour | all 33 presets in one timeline | 10/10 |
| fall_test | fall → land | 6/6 |

## Phase 5: Action Director (`tools/action/direct.mjs`)

**Rules mode** (no AI) was tested with the same story in Thai and in English. Both gave the same valid 7-action plan:

> ตัวละครหยิบปืนเลเซอร์ แล้ววิ่งไปข้างหน้า กระโดดข้ามกล่อง เล็งและยิงกลางอากาศ แล้วลงพื้น

The Thai plan was rendered ([rules_th_sheet.jpg](rules_th_sheet.jpg)) and verified, **12/12** passing.

The first version failed the snapping check (143 rad/s at 3.4 s). The aim target ended up behind the character, so the arms flipped over. Two fixes followed:
- the director now aims ahead of where the character will be when the aim ends;
- the validator's position estimate now carries run momentum through a jump, and checks targets at the action's end.

**Opus mode** goes through Claude Code headless on your plan (`studio/director.mjs` `ask`) and was tested with a **stand-in `claude` command** (`--claude=<cmd>`). The stand-in's first answer used an unsupported preset (`backflip_shot`). The validator rejected it with alternatives, and the director sent exactly one repair request containing the error. The second answer validated and was saved. **Real Opus was not called in this test.**

## Phase 6: Thai UI inside AutoCinematic ONE (`patches/autocinematic_action_composer_v4.patch`)

The dialog was tested under Xvfb on Linux (Python 3.12, Tk 8.6). It was driven through real widget events: clicks, drags and button `invoke`. Screenshots are in [ui/](ui/).

| check | result |
|---|---|
| patch applies on AutoCinematic V12.9.36.x + v1 + v2 + v3, compiles, reverses cleanly (rollback) | ✓ |
| the real `app.py` starts, the new button exists and opens the dialog ([real_dialog.jpg](ui/real_dialog.jpg), dark app theme) | ✓ |
| an existing project still loads; all 45 of its files are byte-identical after opening the dialog (SHA-1) | ✓ |
| upload a character and a prop: copied into `<project>/action/refs/`, auto-rig and auto-anchors run, the plan is updated | ✓ |
| rig editor: dragging a joint moves it and marks it `manual` ([s_rig.jpg](ui/s_rig.jpg)) | ✓ |
| Texture / Points toggle (Mode B preview, [t1_points.jpg](ui/t1_points.jpg)); attachment editor ([prop_labels.jpg](ui/prop_labels.jpg)) | ✓ |
| timeline: preset browser, add at the playhead, drag a bar (2.15 → 2.25 s and back), delete, parameter / mask / IK target / effects editor ([s_timeline.jpg](ui/s_timeline.jpg)) | ✓ |
| validate from the UI: "✓ แผนถูกต้องตาม motion_plan/1" | ✓ |
| director (rules mode) from the UI: 7 actions put on the timeline, plan saved | ✓ |
| preview: 21 low-res frames, play / scrub synced with the playhead ([t5_preview.jpg](ui/t5_preview.jpg)) | ✓ |
| motion QA from the UI: 12/12 | ✓ |
| Render MP4 from the UI: `exports/action/demo_blaster_<time>.mp4`, ffprobe 1080×1920, 24 fps, 120 frames, 5.00 s; frames inspected ([ui_render_mp4_sheet.jpg](ui/ui_render_mp4_sheet.jpg)) | ✓ |
| reopening the dialog restores the last plan | ✓ |
| responsive: at 1360×860 and at 980×620, side panels scroll, nothing is cut off | ✓ (after fixing a cut-off top bar and panel) |
| engine regression: `node tools/test_engine.mjs` | all passed |

**Not tested here:**
- the dialog on Windows;
- Opus mode with a real `claude` login (only with a stand-in command);
- AutoCinematic's own production pipelines, which this patch does not change.

## Known limitations (seen in the frames)

- The test character's short cartoon arms force a deep squat to reach a prop on the ground (`reachDepth`).
- Turning is a mirror of the artwork; there is no separate back or side view.
- Hidden parts (the far arm and leg behind the body) can only show what the artwork shows. A small white gap can appear at the back knee during a deep tuck.
- The neutral pose assumes the arms hang down. A rig made from an A-pose or T-pose drawing is rotated into it.
- Rig detection works on clean, separated limbs. Overlapping limbs, loose clothing or a side view mark joints as uncertain, and they must be placed by hand (the rig editor).
