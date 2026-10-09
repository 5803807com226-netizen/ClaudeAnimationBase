# The Last Smoke — Stage 1 QA (mock assets, cloud, 2026-10-09)

**Scope.** Every image in this stage is a labelled **MOCK** stand-in made by `tools/make_smoke_mocks.py` into `out/mock_assets/`. None of it is artwork, and none of it is a deliverable. Stage 1 proves the motion system. It does not prove how the film looks: appearance needs the real assets (Stage 2).

## Implemented

| piece | file |
|---|---|
| five 3 s shots, one 15 s story | `src/stories/the_last_smoke/story.js` (`config.js`) |
| rig geometry, one source of truth (story, mocks and generation read it) | `src/stories/the_last_smoke/rig_spec.js` |
| generation manifest: 64 layers, one identity anchor (`master_3q`), Qwen edits for every other view and part | `src/stories/the_last_smoke/assets.js` |
| labelled mock parts and plates at the spec's sizes and anchors | `tools/make_smoke_mocks.py` |
| contact QA: IK error, foot and staff slide, ground contact, knee direction | `tools/rig_contact_check.mjs`, `window.RIG_QA` |
| jobs: real and mock, 5 hard cuts, SFX on the contact frames | `jobs/the_last_smoke_15s.json`, `jobs/the_last_smoke_15s_mock.json` |
| Windows steps for Stage 2 | `docs/THE_LAST_SMOKE_STAGE2.md` |

**Changes to shared engine code.** These are small fixes and additive options; existing behaviour is unchanged.
- `src/rig/cutout.js` — **two-bone IK fix.**
  - The lower bone's rotation was measured from the upper bone's line, not its frame. Any IK chain whose upper joint vector isn't horizontal (every leg) missed its target, by about 2.5 u here.
  - No existing rig used such a chain, so their output is unchanged.
  - Before the fix the foot landed at (585, 1244) for a target of (460, 1480); after it, (460, 1480).
- `tools/pipeline.mjs` — **a `cut` is now a true hard cut.**
  - Shots are joined end to end instead of with a 0.04 s crossfade, which shortened the film by 0.04 s per cut and slid narration and SFX off the picture.
  - Two 1.0 s shots now assemble to exactly 2.000 s; before, 1.96 s.
  - The assembly cache key is versioned, so old assemblies are redone.
- `render.mjs`:
  - **refuses to render when the page throws while loading.** Before, a broken story rendered the engine's placeholder animation, which *passed* the motion check. This happened once during this stage and was caught. The other 9 stories and the studio were verified to still render.
  - `--query=k=v` passes a page parameter, used by `freezecam`.
- `tools/gen_assets.mjs` + `tools/comfy/imageops.py` — new derive op **`region`**: a feathered rectangle cut from one image onto another image's canvas. Overlays are registered to the pixel, so blinks and head turns don't pop.

## Tested (cloud, software GL, mock assets)

| test | result |
|---|---|
| `rig_contact_check` S02, 73 frames | **PASS.** IK error 0.00 px (both feet, staff). Planted-pivot slide 0.00 px (heel, then toe roll). Contact off ground 0.00 px. Knees bend one way only, 0.56–1.37 rad. |
| motion check, camera frozen (`--query=freezecam`), 91 frames | **PASS** all shots (mean structural change): S01 3.3 %, S02 9.2 %, S03 7.6 %, S04 5.9 %, S05 1.0 %. The subject moves on its own, not just the camera. |
| pipeline (mock job, 1.5 s per shot) | 5/5 segments rendered and motion-checked. Assembly exactly 7.50 s, 1080×1920, 24 fps. Missing sound files skipped and reported. |
| `gen_assets --dry` | 64 layers planned, no errors. The no-text prompt guard caught one wording ("number of fingers"), now fixed. |
| `validate_assets` | 64 FAIL, all "missing" (no real assets yet): the gate works |
| regression | `test_engine` all passed. `aspect_test` phase2_lumo and preset_cameraMove PASS. 9 stories and the studio render. |

## Inspected frames and what was fixed

- **S02 walk.** These were fixed, then re-checked numerically and visually:
  - IK misses, from the engine bug;
  - a pivot-tracking error in the QA tool itself;
  - an over-swinging far arm;
  - black-speck dust from `particleBurst` (it paints with ink), replaced by soft dust-sprite puffs.

  It now reads as a tired gait: heel strike, a flat stance, a heel-to-toe roll, the staff planted ahead, the free arm hanging.
- **S01.** Two fixes:
  - The hero floated above the ridge. The ridge is now placed by its standing line (`STAND_TOP`).
  - The first 1.5 s were nearly still (0.44 %). Now the camera moves from the first frame, the fog streams in two opposing directions, the head lifts earlier, and the breath and scarf are stronger.
- **S03.** The blink is open → closed (local 1.15 s) → open. The face and scar don't redraw.
- **S04.** The grip crossfade showed the staff through the hand halfway through. Now the tense hand fades in over an opaque relaxed hand.
- **S05.** Two fixes:
  - The smoke was hidden (an emitter timing bug, and the mid-valley layer covered the fire). Now it rises as a column that leans with the breeze, in world space, at parallax depth.
  - The campfire flickers.

## Not done yet (needs real assets or local tools)

- **All artwork.** It comes from Z-Image and Qwen on the local ComfyUI. This session cannot reach `127.0.0.1:8188`.
- **Identity consistency.** This can only be judged on the real master and turnaround (Gate B in the Stage 2 guide). The mocks encode the asymmetry rules (scar on the LEFT, bandage on the LEFT, staff in the RIGHT hand), but they cannot prove the model keeps them.
- **Joint calibration.** Joint and anchor numbers in `rig_spec.js` need adjusting to the real parts, then `rig_contact_check` re-run. Placement constants (`STAND_TOP`, `FIRE`, `GROUND`) need adjusting to the real plates.
- **Narration and SFX.** The Thai narration (OmniVoice) and the SFX files are local only, and the narration timing is unmeasured.
- **Full-length renders.** The full 15 s render and the final `QA_REPORT.md` happen on Windows. The cloud only renders low-res strips and 1.5 s smoke segments.
- **Limits of the 2D approach:**
  - S01 and S05 use a single painted body with registered overlays (head, scarf, cloak), not a full limb rig; their motion is breath, weight, head and cloth, as the spec asks.
  - S04's finger tightening is a crossfade between two edits of the same hand, not a finger rig. If the two edits differ beyond the fingers, that shot is PARTIAL (the spec's own rule).
