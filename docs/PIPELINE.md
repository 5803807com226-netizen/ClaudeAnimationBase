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
- Sound (no music):
  - `narration.audio` is cut per beat and placed where that beat's shot actually starts, so pauses and transitions never drift it;
  - `sfx: [{ beat, offset, file, gain }]`;
  - `ambience: { file, gain }` is a looped bed.

  Missing files are skipped and listed in the report.
- `continuity: { look: 'collage' | 'watercolor' | 'none', globalGrain }` grades LTX and still shots so they sit with the JavaScript segments. `globalGrain` adds one light grain over everything.
