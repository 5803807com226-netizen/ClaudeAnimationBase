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
