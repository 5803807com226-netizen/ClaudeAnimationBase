# Integration Gap Report

| spec requirement | exists today | gap | owner |
|---|---|---|---|
| Opus Creative Director: narrative and shot direction | AC `opus_director.txt` produces shots with `visual_concept`, `camera`, `production_method` | No global visual strategy, no capability-aware planning, and the output is prose rather than executable layers | AC |
| Global visual strategy | `style_lock.py`, `continuity_bible.json` (style only) | Strategy object: treatment, palette, type, camera language, transitions, AI-video policy | AC (schema shared) |
| Treatment vs backend separation | `production_method` and the bridge's `kind` mix both concepts | Separate `treatment` and `backend` fields | shared schema |
| Dynamic capability registry | `definePreset` plus `PRESET_ASPECTS` | Metadata, a generated catalog, discovery without `story.html` edits, verified status | CAB |
| Motion plan compiler | `motion_only.py` string templates; `director.mjs` for intents | Data-driven compiler: manifest → validated layers → one generic plan player. Report unsupported items before rendering | CAB |
| Several effects per shot, layers, depth | Possible in hand-written JS | A generic `playPlan(shot)` that stacks registered capabilities | CAB |
| Map engine | none | d3-geo projection, vendored Natural Earth data, `mapView`, `routeDraw`, `territoryHighlight`, `mapLabel`, provenance per feature | CAB (data from AC research) |
| Charts and diagrams | ad-hoc `data` template in `motion_only` | `barGrow`, `timelineReveal`, `diagramReveal` presets | CAB |
| Rendering adapter | `hybrid_bridge.py` and `pipeline.mjs` overlap | AC calls `pipeline.mjs --manifest=…`. The bridge stays only for legacy jobs | CAB runs it, AC calls it |
| Render a selected scene / failed only | bridge `--only`, `--force` | `pipeline.mjs` has no `--only` or `--failed-only`; neither tool has failed-only | CAB |
| Motion validation | none | Frame-difference check against each shot's `expected_motion`. A shot can be marked as an intentional still | CAB |
| Narration-driven timing | CAB `timeline.mjs` reads srt or whisper; AC stretches the WAV to fit shots | AC should export measured per-shot timings (or an SRT), and visuals fit to them | AC → CAB |
| 9:16 and 16:9 only for new work | CAB supports 3 aspects | UI or contract restriction only; keep the 4:5 code | AC UI |
| UI controls | Hybrid dialog: Test, Motion, View, Render, Plan | Generate Motion, Re-render Failed, progress from the pipeline report, per-shot override | AC |
| 90-s pilot | 35–40 s `hybrid_pilot_40` job (unrun); a 19-shot, about 55 s code-motion manifest (unrun) | Everything end to end | both |

## Blockers

1. **No AutoCinematic git repo in this session.** Only the RAR snapshot was available. AC-side changes can only be delivered as patch files against that snapshot until a private repo is added through the GitHub App.
2. **Local-only dependencies:** ComfyUI (Z-Image, Qwen, LTX), OmniVoice TTS, the GPU, the Windows ffmpeg build and Opus credits. The cloud can only do low-res frame tests and engine tests.
3. **Historical map data.**
   - Modern coastlines are covered: Natural Earth through `world-atlas` (ISC, public-domain data), available on npm.
   - Historical borders need a licensed and cited source, chosen per story. For example, `aourednik/historical-basemaps` is GPL-3.0, which is a licence decision for you.
4. **The pilot story is not chosen**, and neither are its sources (a PDF or verified material).
5. **Collage assets** are reported missing or contaminated; local only.
