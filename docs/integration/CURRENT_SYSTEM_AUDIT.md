# Current System Audit (2026-10-09)

**Evidence base**

- **ClaudeAnimationBase (CAB):** the git repo, branch `handoff/claude-account-transfer-20261009` (`75ff85f`).
  - The other branches add nothing new. `handoff/local-collage-20261009` only removes `PROJECT_HANDOFF.md`, `claude/elegant-galileo-7ck228` is older, and `main` is upstream.
- **AutoCinematic (AC):** the uploaded RAR snapshot `AutoCinematic_Story_Studio_V12.9.36.3_PDF_RESEARCH_FULL_WITH_RUNNER`. It was read only; nothing was executed.
  - **There is no git repo for AC in this session.** `list_repos` returns nothing. The snapshot may differ from the live Windows folder.
  - Files over 400 KB, media, `.bak` files, `research_library/` and `.jsx` files were not extracted. This means `story/story_package.json` was not read; the shot fields below come from `story_draft.json`.

**Status legend**

- **W** — works: verified this session.
- **W\*** — works per code, but not verified here.
- **P** — partial.
- **M** — missing.
- **U** — untested.
- **D** — duplicated.

## ClaudeAnimationBase (motion engine)

| area | status | evidence |
|---|---|---|
| Engine helpers (type layout, objectTransition) | **W** | `node tools/test_engine.mjs --soft-gl`: all passed (cloud, this session) |
| 6 motion presets: `cameraMove`, `popBounce`, `shapeMorph`, `brushWipe`, `objectReveal`, `particleBurst` | W\* | `src/presets/*.js`. Listed in `PRESET_ASPECTS` as passing `aspect_test` (earlier session) |
| Kinetic type presets (pop, slide, impact, highlight, reveal, …) | W\* | `src/type/kinetic.js`, `TYPE_PRESET_ASPECTS` |
| Rig, actors, worlds, parallax, stage camera | W\* | `src/rig`, `src/systems`, `src/worlds` |
| Paper-collage manifest player | P | `src/collage/collage.js`. The handoff reports missing PNGs and chroma-green contamination |
| Asset validation | W\* | `tools/validate_assets.mjs`, `tools/lib/manifest.mjs` (alpha, size, matte quality) |
| Looks (finish styles) | W\* | `src/look.js`, `tools/look_test.mjs` |
| Renderer: sheet, strip, clip, range, speed, aspect | W\* | `render.mjs`. Cloud runs are limited to low-res |
| Job pipeline: segments, beats, director intents, timeline fit, xfade, narration, sfx, ambience, hash state, resume | P / U | `tools/pipeline.mjs`, `tools/lib/director.mjs`, `tools/lib/timeline.mjs`. **It has never passed a full local run** (handoff) |
| LTX through ComfyUI | U | `tools/comfy/client.mjs`. Needs the local GPU |
| Capability metadata (tags, parameter schema, required assets, status) | **M** | `definePreset` stores only `label`, `about`, `defaults`, `run` and `demo` |
| Preset discovery | **M** | `story.html` hardcodes a `<script>` tag for each preset file |
| Structured motion-plan compiler | **M** | Stories are hand-written JS, and the pipeline only references a story plus a time range |
| Motion validation (proof that real movement happened) | **M** | `aspect_test` checks framing, not motion |
| Maps (projection, GeoJSON, routes, territories) | **M** | No geo code or data in either project |
| Charts and diagrams as presets | **M** | Only ad-hoc drawing inside AC's `motion_only` templates |

## AutoCinematic (main app, Python and Tk)

| area | status | evidence |
|---|---|---|
| Story pipeline: research, preproduction cast, draft, fact-check, finalize, production pack | W\* | `autocinematic/pipeline.py` `StoryPipeline`, `prompts/opus_director*.txt`, `sonnet_*.txt` |
| PDF and source research, credit saver, research library | W\* | `pdf_research.py`, `credit_saver.py`, `research_library.py` |
| Model routing (Opus / Sonnet through the CLI or API) | W\* | `model_runner.py` `run(role, …)` |
| Shot schema | W\* | `shot_id`, `start_sec`, `duration_sec`, `story_function`, `narration`, `caption_*`, `visual_concept`, `production_method`, `image_prompt`, `video_prompt`, `camera`, `composition`, `transition_in`/`transition_out`, `sfx_cue`, `continuity`, `character_ref_id`, … |
| Z-Image, Qwen edit and LTX i2v through ComfyUI | W\* / U | `production_runner.py`, `comfyui.py`, `workflows/*.json` |
| Character references and style lock | W\* | `character_refs.py`, `style_lock.py`, `reference_policy.py` |
| TTS (OmniVoice), Thai pronunciation dictionary, captions, SRT | W\* | `voice_pipeline.py`, `pronunciation.py` |
| Narration timing | P | `fit_wav_to_duration` time-stretches the voice to fit a shot (atempo). That is the reverse of "measured narration drives visuals" |
| Motion Only v0.5 | P / U | `motion_only.py`. 16 keyword-chosen `scene_type` templates, emitted as **JS string templates** into `CAB/src/stories/acmotion_*`. Depends on `one_message/art.js`. **No rendered output in the snapshot** |
| Hybrid bridge (per-scene render, cache, concat) | P / U | `hybrid_bridge.py`: `--plan`, `--run`, `--only`, `--force`, `--compose-only`. Hard-cut concat, no transitions, no failed-only mode |
| Hybrid UI dialog (per-shot mode, Test, Motion, View, Render) | P / U | `hybrid_ui.py`. The 19-shot `story_project` manifest is all `code_motion` (about 55 s) |
| Still-image motion | W\* | `story_motion.py` (Python) |
| Remotion compositor | P | `remotion_pipeline.py`, `remotion/src/video.jsx` |
| Pause, stop and resume | W\* | `run_control.py`, V10.5 and V10.9 notes |
| Tests | U | `tests/test_*.py` (5 files). Not run, because they are untrusted archive code |

## Duplicated

- **Three compose paths:**
  - `hybrid_bridge.py`: concat.
  - CAB `tools/pipeline.mjs`: xfade, audio mix, director.
  - `remotion_pipeline.py`.
- **Two per-scene cache and resume systems:** bridge `state` signatures and `pipeline.mjs` `state.json`.
- **Two still-image animators:** AC `story_motion.py` and CAB `cameraMove` / collage.
- **Two shot-to-motion translators:** AC `motion_only.choose_scene` (keywords) and CAB `director.mjs` (intents).
- **A stale copy of the CAB engine inside AC:** `render.mjs`, `src/`, `studio.html`, `ANIMATION_GUIDE.md`.

## Security note

The snapshot's `config.json` contains key- or token-like fields (values not read). It must never be committed. Rotate the keys if the RAR was shared.
