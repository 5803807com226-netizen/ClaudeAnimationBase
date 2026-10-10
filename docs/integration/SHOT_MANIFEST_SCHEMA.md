# Shot Manifest v1 (proposal)

**Purpose.** One JSON file per project: `projects/<p>/production/shot_manifest.json`.
- AutoCinematic writes it.
- ClaudeAnimationBase compiles and renders it.

**Design rules.**
- Shot fields are *data*. Natural language is kept only in `purpose` and `notes`, and it is never executed.
- Legacy pipeline `segments` and `beats` stay valid.
- The adapter turns a v1 manifest into the existing pipeline job, so assembly, audio and the cache are reused.

```jsonc
{
  "schema": "shot_manifest/1",
  "project_id": "magellan_90",
  "aspect": "16:9",                       // "9:16" | "16:9" (4:5 is legacy only)
  "fps": 24,
  "target_seconds": 90, "tolerance_seconds": 3,
  "mode": "motion_only",                  // auto | motion_only | documentary | cinematic
  "capability_catalog": "sha256:…",       // the catalog version the plan was made against

  "strategy": {                           // Global Visual Strategy (Opus, once per project)
    "name": "historical_map_documentary",
    "look": "collage",                    // a src/look.js style
    "palette": ["#F3EBDD", "#2B2A3A", "#C8553D", "#3E7CB1"],
    "typography": { "font": "display", "labels": "map_serif", "captions": false },
    "camera_language": "slow geographic travel; push in on arrivals",
    "transition_language": ["map_travel", "fade"],
    "motion_intensity": "low",
    "ai_video": "forbidden",              // forbidden | allowed | preferred
    "continuity": ["one map projection for the whole film", "route colour #C8553D"]
  },

  "audio": {
    "narration": { "file": "audio/narration.wav", "timing": "audio/narration.srt", "measured": true },
    "ambience": { "file": "audio/sea.wav", "gain": 0.12 },
    "music": null
  },

  "assets": [                             // Asset Manifest
    { "id": "ne_110m", "type": "geojson", "path": "data/ne_110m_land.json",
      "source": "Natural Earth 1:110m", "license": "public domain" },
    { "id": "portrait", "type": "image", "path": "assets/magellan.png", "alpha": true,
      "source": "…", "license": "PD-art" }
  ],

  "data": {                               // verified facts, separate from animation
    "route_1519": { "type": "route", "coords": [[-6.36, 36.78], [-15.4, 28.1]],
      "dates": ["1519-09-20", "1519-09-26"], "source": "Pigafetta, ch. 1", "confidence": "high" }
  },

  "shots": [{
    "id": "S03",
    "purpose": "show how far the fleet sails before its first landfall",   // documentation only
    "narration": "…", "start": 12.4, "end": 19.0,      // from the measured timing
    "treatment": "animated_map",          // semantic
    "backend": "javascript_motion",       // javascript_motion | composited_still_layers | ltx_video | hybrid_compositor
    "camera": { "cap": "mapView", "params": { "from": { "center": [-10, 35], "zoom": 3 }, "to": { "center": [-30, 10], "zoom": 2 } } },
    "layers": [                           // drawn in order; z = depth for parallax
      { "id": "land", "cap": "mapBase", "params": { "asset": "ne_110m", "fill": "#E9DFC9" } },
      { "id": "route", "cap": "routeDraw", "params": { "data": "route_1519", "at": 0.5, "dur": 4.5 } },
      { "id": "date", "cap": "type.reveal", "params": { "text": "20 ก.ย. 1519", "at": 0.8, "x": 0.12, "y": 0.1 } }
    ],
    "transition_in": "map_travel",
    "sfx": [{ "file": "sfx/waves.wav", "at": 0.0, "gain": 0.4 }],
    "expected_motion": { "min_changed_frac": 0.02, "intentional_still": false },
    "fallback": "block",                  // block | alternative:<cap> | still (must be explicit)
    "status": "planned",                  // planned | compiled | blocked | rendered | failed | validated
    "outputs": { "preview": "out/pipeline/magellan_90/S03_preview.jpg", "clip": "out/pipeline/magellan_90/S03.mp4" }
  }]
}
```

## Collage shots (`"treatment": "collage"`)

These are editorial paper collage shots: imported PNG cut-outs placed and moved by the engine (`src/collage/collage.js`). The full example is `tools/fixtures/plans/collage_demo.json`.

```jsonc
{ "id": "C02", "start": 3.2, "end": 6.2, "treatment": "collage", "backend": "javascript_motion",
  "transition_in": { "cap": "transition.push", "params": { "dur": 0.8, "focus": [540, 980], "zoom": 6 } },   // or "cut"
  "collage": { "assets": "assets/stories/<project>/", "camera": [[0, 540, 1040, 1.05, "smooth"], [3, 540, 1060, 1.12, "smooth"]],
               "boil": { "amp": 1.2, "rot": 0.35 }, "gen": { "seed": 7300, "style": "…", "isolate": "…" } },
  "layers": [
    { "id": "temple", "cap": "collage.layer",
      "params": { "file": "temple.png", "size": [540], "at": [540, 1345], "anchor": [0.5, 0.95], "subject": true,
                  "paper": { "shadow": { "dx": 8, "dy": 12, "blur": 12, "opacity": 0.3 }, "border": 7 },
                  "gen": { "engine": "zimage", "size": [1024, 1024], "matte": "chroma", "prompt": "…" } },
      "motion": [{ "cap": "collage.slam", "params": { "at": 0.6 } }] },
    { "id": "title", "cap": "type.label", "params": { "text": "ทุกเส้นทาง", "at": 1.1, "y": 0.12 } }
  ] }
```

**The shot's layers:**
- A collage shot takes only `collage.layer` and `type.*` layers. Any other capability is blocked, and a `collage.layer` outside a collage shot is blocked too.
- `params.file` must be a lower_snake_case `.png`; `size` ([w] or [null, h]) and `at` are required. Positions are world px on the 1080 × 1920 page.

**Validation (blocked on violation):**
- Every `motion` entry is a `collage.*` capability, validated like any other: verified status, known parameters, types and ranges.
- `transition_in` must be a `transition.*` capability, or `"cut"`.
- `collage.assets` is required; camera keys must be `[t, x, y, zoom, ease?]`.

**Values:**
- Any value may be per format (`{ "9:16": …, "16:9": … }`); the compiler picks the format it compiles for.
- Times are shot-local.

**How it compiles:**
- Each collage shot becomes a `SCENES` entry in the generated `plan.js`, so `tools/gen_assets.mjs` and `tools/validate_assets.mjs` work on `_plan_<id>` directly.
- Consecutive collage shots play as one reel, so transitions are drawn across the cut; the job's segment transition is `cut`.
- Titles with no `out` leave by themselves before a transition.

## Action shots (`"treatment": "action"`)

These are articulated characters from their reference images: the engine rigs the picture and animates its limbs with Action Composer presets (`docs/ACTION_COMPOSER.md`). Nothing is generated. The full example is `tools/fixtures/plans/action_story.json`.

```jsonc
{ "id": "A02", "start": 1.5, "end": 6.5, "treatment": "action", "backend": "javascript_motion",
  "narration": "ไคคว้าปืนเลเซอร์ วิ่ง แล้วกระโดดยิงกลางอากาศ",
  "action": {
    "characters": [{ "id": "KAI", "image": "refs/kai.png", "x": 0.2, "height": 0.34, "facing": "right" }],  // or "rig": "<char_rig/1 json>"
    "props": [{ "id": "BLASTER", "image": "refs/blaster.png", "x": 0.31, "scale": 0.72 }],               // or "spec": "<prop/1 json>"
    "backdrop": { "sky": "#E6EFF3", "ground": "#D6C6A8", "obstacles": [{ "x": 0.73, "w": 130, "h": 150 }] },
    "actions": [ { "type": "pick_up", "start": 0, "duration": 0.8, "target": "BLASTER" },
                 { "type": "run", "start": 0.8, "duration": 1.2, "speed": 330 }, … ]   // or "story": "<sentence>" (rule-based, no AI)
  } }
```

**How the compiler handles them**

- **Rigs and anchors.** An `image` is rigged automatically by `tools/action/rig_analyze.py`, and a prop's anchors come from `prop_analyze.py`. The results are cached in `out/plans/<id>/action/<shot>/` and redone only when the image changes.
  - Pass `--python=<python with Pillow and numpy>`. AutoCinematic passes its own.
  - Paths are relative to the manifest, or absolute.
- **Validation.** The motion plan is validated by `tools/action/plan.mjs`:
  - preset names, parameter ranges, prop in hand, targets behind the character;
  - an unknown preset blocks the shot and names the closest alternatives.
- **Layers and camera.**
  - The only layers allowed are `type.*` text. The auto-polish karaoke subtitle is added the same way and drawn on top of the character.
  - A `camera` capability is blocked. The shot has its own follow camera, `action.camera`; `null` turns it off.
- **Rendering.** Each action shot is its own story, `_act_<project>_<shot>`, and joins the film as one segment, range `0 … length`.
  - Its `shot_hash` covers the plan, the rig, prop and image files, and the action engine.
  - Editing another shot does not re-render it.
- **Sound.** Automatic SFX come from its timeline: take-off (whoosh), landing (impact), firing (whoosh), pick-up (paper).
- **Formats.** Values may be per format (`{"9:16": …, "16:9": …}`).
  - Rendered in another format (`--aspect`), the world keeps the planned pixels: the same run-up reaches the same obstacle.
  - Aim and point targets keep their height above the ground.
  - Verified: 9:16 and 16:9 each pass 12/12 motion checks.

## Validation and error states (compiler output, per shot)

- `ok`.
- `blocked:unknown_capability`.
- `blocked:invalid_param:<path>`.
- `blocked:missing_asset:<id>`.
- `blocked:unverified_capability`: allowed only with `--allow-unverified`.
- `blocked:unsourced_data`: a map or data layer that has no `source`.
- `failed:render`.
- `failed:motion` (the shot is not an intentional still and shows no motion).
- `substituted:<from>→<to>`: always written to the report.

## Mapping from today's AC shot fields

- `shot_id` → `id`
- `start_sec` / `duration_sec` → `start` / `end`
- `transition_in` → `transition_in`
- `sfx_cue` → `sfx`
- `production_method` → `backend`
- `visual_concept` and `camera` (prose) → `purpose` and `notes`. Opus now also emits `treatment`, `camera` and `layers`.
