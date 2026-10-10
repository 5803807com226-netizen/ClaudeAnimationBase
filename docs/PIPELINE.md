# Integration pipeline (AutoCinematic → ClaudeAnimationBase)

**Contract.** AutoCinematic, or a person, writes a JSON **job** (example: `jobs/hybrid_pilot.json`). One command turns it into an MP4:

    node tools/pipeline.mjs --job=jobs/<id>.json --python=<ComfyUI python>

AutoCinematic needs no code from this repo, only the job file (patch-only integration).

## What the pipeline does

1. **Collage art:** for each `assets` story, `gen_assets` makes whatever is missing or invalid (cached), then `validate_assets` must pass.
2. **Segments:**
   - `story` segments render with `render.mjs --clip` (JavaScript motion or a PNG collage scene).
   - The `ltx` segment is generated through ComfyUI, using the `ltx` engine in `tools/comfy/engines.local.json` and an optional start image. It's then cover-cropped to the frame, and the Thai text (rendered by Chrome: correct vowels and tone marks) is overlaid.
3. **Assembly:** ffmpeg crossfades the segments (`fade`) and adds the job's `audio` if that file exists; otherwise the video is silent and the report says so.

## Resuming and records

- Every step is checkpointed by a hash of its inputs in `out/pipeline/<id>/state.json`. A rerun skips what's done and redoes only what failed or changed. LTX clips are cached in `.cache/assets`.
- The full log is in `out/pipeline/<id>/pipeline.log`, and a summary (with any stand-ins) is in `report.json`.

## Options

| option | effect |
|---|---|
| `--allow-missing=ltx` | if ComfyUI or the LTX workflow is unavailable, a slowly zooming still stands in; this is clearly marked in the report |
| `--force=<step>\|all` | redo a step |
| `--offline` | never call ComfyUI for collage art |
| `--max-seconds=0.2 --fade=0.05 --mock-ltx` | smoke test |

## Job shape

```json
{ "id", "fps", "size": [w, h], "fade", "audio", "assets": [{ "story" }], "fallbackImage",
  "segments": [ { "id", "type": "story", "story", "range": [a, b], "assets" },
                { "id", "type": "ltx", "engine": "ltx", "prompt", "negative", "seconds", "image", "text": "line|line", "textY" } ] }
```

## Beat jobs (director + audio-driven timeline)

Instead of `segments`, a job may give `beats` (see `jobs/hybrid_pilot_40.json`):

- Each beat is `{ id, intent, at, end, text, visual: { type: 'story' | 'ltx', … } }`.
- `tools/lib/director.mjs` turns beats into segments. Each beat's `intent` sets:
  - the transition into it;
  - the on-screen text policy;
  - the camera move for AI and still shots;
  - an extra pause.

  The intents are `hook`, `setup`, `build`, `turn`, `reflect` and `end`; any beat can override them.
- `tools/lib/timeline.mjs` sets each beat's window from narration timing. The timing comes from `narration.srt` or `narration.whisper` when that file exists; otherwise the beats' `at`/`end` are provisional.
- A story clip is fitted to its beat's window by playing it a little faster or slower (never more than ±25%), then holding its last frame.
- Sound (tools/lib/audiomix.mjs, tested by `node tools/test_audiomix.mjs`):
  - `narration.audio` is cut per beat and placed where that beat's shot actually starts, so pauses and transitions never drift it;
  - `sfx: [{ beat, offset, file, gain }]` (the plan compiler writes these automatically, see below);
  - `ambience: { file, gain }` is a looped bed;
  - `music: { file, gain = .22, duck = .7, fadeIn = 1.2, fadeOut = 2 }` is a looped music bed, faded in and out and ducked under the narration with a sidechain compressor (`duck: 0` never dips; .7 dips it about 14 dB while someone speaks and lets it swell back between lines).

  Missing files are skipped and listed in the report.
- `continuity: { look: 'collage' | 'watercolor' | 'none', globalGrain }` grades LTX and still shots so they sit with the JavaScript segments. `globalGrain` adds one light grain over everything.

## Automatic finishing in the plan compiler

`tools/compile_plan.mjs` runs `tools/lib/polish.mjs` on every manifest. It only adds what is missing and never overrides what the director wrote; every addition is listed under `polish` in `compile_report.json`.

- **Auto-polish:**
  - collage cut-outs without a move get a staggered entrance (the subject is placed; backdrops and page-wide ground strips stay as the set), and the subject a gentle breathing pulse;
  - collage shots without a camera get a slow push on the page centre, alternating in and out;
  - stop-motion boil;
  - a varied transition between collage shots (push, slide, whip, tear);
  - a karaoke subtitle (`type.subtitle`) from each shot's narration.

  Turn it off with `"polish": false` (or `--no-polish`); subtitles alone with `"subtitles": false` (manifest or shot).
- **Automatic SFX:** cues on entrances (paper, pop, impact), transitions (whoosh, paper), titles and counters (impact, tick) and infographics, at most 5 per shot and never closer than 0.22 s. They are written to `job.json` as `sfx` relative to their shot. The files come from `assets/sfx/<category>/*.wav`:
  - `python tools/make_sfx.py` synthesizes a starter pack (whoosh, pop, paper, tick, impact, riser, ding, type; generated, not committed);
  - any `.wav` you add to a category folder joins the pack.

  Off with `"audio": { "sfx": false }` or `--no-sfx`.
- **Music:** `"audio": { "music": { "file": "…", "gain": 0.22, "duck": 0.7 } }` in the manifest becomes `job.music`.
