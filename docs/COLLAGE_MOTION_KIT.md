# Collage Motion Kit (editorial photo-collage animation)

The moves of a premium editorial collage film, as reusable data-driven presets for any collage story. Taken from the reference *"The best creatively distinctive and impactful collage animation"* (31 s, 16:9).

Every preset is a **motion** on a layer of imported PNG artwork, or a **transition** between scenes. No story writes animation code. The artwork rule still holds: cut-outs are made outside the code (`tools/gen_assets.mjs` on your ComfyUI, or by hand), never drawn procedurally.

## What the reference does, and the preset for each

| in the reference | preset | data |
|---|---|---|
| a hand brings the orange in, then withdraws | `place` (the object) + `follow` → `leave` (the hand) | `{ kind: 'follow', target: 'fruit', grip: [dx, dy], until }`, `{ kind: 'leave', at, to: 'bottom' }` |
| the orange peel comes away and the globe is underneath | `peel` (the globe sits behind it with `appear`) | `{ kind: 'peel', at, dur, pieces: 7, speed, gravity, spin, back }` |
| buildings, trees and the tree with oranges grow in, stop-motion | `pop` (anchor at the base) | `{ kind: 'pop', at, dur, overshoot }` |
| the orange road and bridge arcs draw themselves | `wipe` | `{ kind: 'wipe', at, dur, dir: 'up' \| 'down' \| 'left' \| 'right', out }` |
| the orange bounces down the stairs and rolls home with a dashed trail | `roll` | `{ kind: 'roll', at, dur, path: [[x, y], …], hops, hop, trail: { color, len, dy } }` |
| small cut-out people walking | `walk` | `{ kind: 'walk', speed, bob, steps, rock }` |
| trees change season (green → red) | `vanish` (old) + `appear` (new), on the same spot | `{ kind: 'appear', at, flutter: 2 }` |
| everything held on twos, slightly alive | `step: 2` + scene `boil` (or the `boil` motion) | `boil: { amp: 1.2, rot: .35 }` on the scene; `boil: false` on a layer |
| trees and signs breathing in the wind; the plane | `sway`, `float` | `{ kind: 'sway', amp, hz }`, `{ kind: 'float', amp, hz }` |
| a cut-out laid onto the page | `place` | `{ kind: 'place', at, from, dist, rot, lift }` |
| zoom into the globe into the next scene | transition `push` | scene `transition: { kind: 'push', dur, focus: [x, y], zoom }` |
| the next sheet of paper slides over | transition `slide` | `transition: { kind: 'slide', dur, from: 'right' }` |
| "IT'S" "EVERLASTING" on black label tape | type `label` | `{ preset: 'label', text, at, by: 'phrase' \| 'line' \| 'word', bar, tilt }` |
| big newsprint letters stamped in one by one ("WELCOME") | type `stamp` | `{ preset: 'stamp', text, at, stagger, tilt }` |
| camera pans along the campus, pushes in | scene `camera` keys + layer `depth` (parallax) | already in the engine |

## The full vocabulary (every preset, what a professional uses it for)

**Collage motions** (`motion: [{ kind, … }]`, applied in order; any value may be per format):

| family | motion | use it for | key data |
|---|---|---|---|
| entrances | `place` | laying a cut-out on the page: overshoots a touch, presses down, small rotational wobble | `from, dist, rot, overshoot, wobble, press` |
| | `pop` | stop-motion growth from the anchor (trees, buildings) | `dur, overshoot, from` |
| | `drop` | falling in under gravity, bouncing lower each time | `height, gravity, bounce, bounces` |
| | `slam` | stamping something down hard, with a short shake (titles, stickers, a big reveal) | `from` (scale), `shake` |
| | `swing` | hanging things settling like a pendulum (signs, tags, lanterns); anchor at the pin | `amp, hz, decay, enter` |
| | `wipe` | drawing on with a torn paper edge, from a side or along a path like a brush | `dir` or `path` + `width`, `tear` |
| | `appear` | a replacement cut with a stop-motion flicker | `flutter` |
| travel | `fly` | a smooth path, facing the way it goes and banking into turns; `scaleTo` for perspective | `path, orient, face, bank, scaleTo` |
| | `roll` | rolling by distance; hops lose height, the shadow stays on the ground; dashed trail | `path, hops, hop, decay, trail` |
| | `walk` | cut-out figures walking (bob and rock) | `speed, bob, steps, rock` |
| | `orbit` | circling a point; the near half bigger | `center, rx, ry, hz, depth` |
| | `flutter` | falling leaves, petals, paper scraps | `fall, sway, hz, rock` |
| hands | `follow` | a hand carrying its object (slight drag), then letting go | `target, grip, until, release, drag` |
| | `leave` | exits with anticipation (a wind-up, then away) | `to, dist, anticipate` |
| life | `sway`, `float`, `pulse` | breeze, hover, breathing focus | `amp, hz` |
| | `cycle` | **replacement animation**: several layers on one spot are frames shown one at a time (walk cycles, flags, flames, smoke) | `index, count, fps, pingpong` |
| | `boil` | held-frame jitter (scene `boil` applies it to every stepped layer) | `amp, rot, rate` |
| accents | `shake` | a decaying jolt on an impact | `amp, rot, dur` |
| | `spin` | a turn about the anchor | `turns, dur` |
| exits | `peel` | coming apart in torn wedges that are flicked off and tumble away, the paper's back showing, until out of frame | `pieces, stagger, speed, gravity, spin, back` |
| | `vanish` | the reverse of `appear` | `flutter` |

**Reel transitions** (`transition` on the incoming scene):

| | |
|---|---|
| `push` | one continuous zoom: into the outgoing scene's `focus` while the next grows out of it (match cut); `paper: true` dips through paper |
| `slide` | the next sheet slides over the last, with a shadowed edge |
| `tear` | the scene is torn in two along a ragged edge with white fibres, and the halves are pulled apart |
| `iris` | the next scene opens out of a ragged paper hole from `focus` (screen fractions) |
| `whip` | a fast pan out one side and in from the other, with smear echoes |
| `fade`, `cut` | dissolve, hard cut |

Titles with no `out` of their own leave by themselves just before the transition out of their scene.

**Camera:** key ease `'smooth'` makes consecutive keys ONE continuous move (velocity carried through every key, at rest only at the ends). The same option exists for the illustration preset `cameraMove` (`smooth: true`, plus `settle` for a landing overshoot).

**Type presets** for collage: `label` (tape strips), `stamp` (letters land one by one), `cutout` (ransom-note paper scraps, one per phrase, laid down with a press; `papers` / `inks`).

**Look.** White paper, grey halftone photo prints, tangerine-orange and mint accents. Use `look: { style: 'collage', off: ['vignette'], set: { paper: .3 } }` with a cool white `background` (`'#F3F1EC'`). The colours come from the generation `style` (see `collage_reel/scene.js` `GEN`), not from a filter.

## Use it in a story

A scene is the usual collage manifest (docs/COLLAGE_PIPELINE.md). Add `motion: [...]` to any layer. Motions run in order after `keys` and `reveal`, and any value may be per format (`{ '9:16': …, '16:9': … }`).

```js
SCENES.my_scene = { assets: 'assets/stories/my_story/', duration: 4, background: '#F3F1EC', aspects: ['9:16', '16:9'],
  boil: { amp: 1.2, rot: .35 }, transition: { kind: 'push', dur: .7, focus: [540, 980], zoom: 5 },
  layers: [
    { id: 'globe', file: 'globe.png', size: [560], at: [540, 980], step: 2, motion: [{ kind: 'appear', at: 1.25, flutter: 0 }] },
    { id: 'fruit', file: 'fruit.png', size: [470], at: [540, 990], step: 2, subject: true,
      motion: [{ kind: 'place', at: .15, from: 'bottom' }, { kind: 'peel', at: 1.3, dur: 1.3, pieces: 7 }] },
    { id: 'hand', file: 'hand_up.png', size: [null, 760], at: [560, 1190], anchor: [.5, .08], step: 2, boil: false,
      motion: [{ kind: 'follow', target: 'fruit', grip: [30, 200], until: .95 }, { kind: 'leave', at: .95, to: 'bottom' }] },
  ],
  type: [{ text: 'ยินดีต้อนรับ', preset: 'label', at: .45, y: .13 }],
};
playCollage([SCENES.my_scene, SCENES.next_scene]);   // a reel: scenes back to back, joined by each scene's transition
```

**Recipes (copy them):**
- **Hand delivers an object.** The object gets `place` from a side. The hand gets `follow` (that object, `grip`, `until` = when the place ends + 0.15 s), then `leave` to the same side. Use `boil: false` on the hand. Point the hand's `anchor` at its fingertips.
- **Object turns into another.** Put B behind A, at the same spot. B gets `appear` at the peel's start (`flutter: 0`); A gets `peel`.
- **Stop-motion build-up.** Use `pop` on each building or tree with staggered `at` (0.1–0.15 s apart), the anchor at the base, `step: 2`, plus `sway` on foliage.
- **Season change.** Put two layers on the same spot, `vanish` on one and `appear` on the other at the same `at`. Stagger them across trees.
- **Motif across scenes.** The same file in every scene; `roll` it along the ground. The next scene's `push` transition uses its end point as `focus`.
- **Title.** `label` phrases over `stamp`ed big letters. Text is live text, kept off `subject` layers automatically.

A file used by several layers or scenes (one tree planted five times) is generated **once**, at the size its largest use needs.

## The demo: `collage_reel` (15 s, 9:16 and 16:9)

`src/stories/collage_reel/scene.js` is a Chiang Mai welcome reel in four scenes. It uses every verified preset; the tangerine is the motif.

| scene | what happens |
|---|---|
| hook | a hand brings a tangerine; it peels into a globe; push |
| road | ribbon road draws itself, trees and a temple pop, a hand sets down a red songthaew, a plane; slide |
| town | the camera pans along the old city, people walk, trees blossom, the tangerine rolls; push |
| end | the tangerine rolls home to a growing tangerine tree; "เชียงใหม่" stamps in |

**`collage_kit`** (`src/stories/collage_kit/`) is the showcase and test fixture for the rest: six short scenes, one per family, joined by every transition. It uses the reel's cut-outs, so it needs no extra artwork: `node render.mjs --story=collage_kit --clip --out=out\collage_kit.mp4` once the reel's art exists.

**Status.** Motion and layout were tested in the cloud with labelled **MOCK** stand-ins (not artwork):
- `aspect_test --only=collage_reel` PASSes for 9:16 and 16:9;
- `test_engine` covers the motion maths.

The real look needs the real cut-outs from your ComfyUI.

### On Windows

```bat
cd C:\Users\User\ClaudeAnimationBase
git pull
node tools\comfy\preflight.mjs
node tools\gen_assets.mjs --story=collage_reel --dry
node tools\gen_assets.mjs --story=collage_reel --scene=reel_hook --preview
```

- `preflight` must end with PASS; `tools\comfy\engines.local.json` is the same file as for The Last Smoke.
- The `--dry` run prints all prompts; nothing is generated.
- The `--preview` run makes the hook's art first, then writes a contact sheet to `out\gen\`.

Check the hook's cut-outs before going on:
- the tangerine and the globe are round and roughly the same size;
- the hand is open with the palm up, and the wrist runs to the bottom edge;
- there is no text anywhere.

To redo one: change its `seed` (or `GEN.seed`), then `--only=<id> --force`.

```bat
node tools\gen_assets.mjs --story=collage_reel
node tools\validate_assets.mjs --story=collage_reel
node render.mjs --story=collage_reel "--sheet=1.9,3.5,5.6,7.75,9.8,13.6" --w=300 --out=out\collage_reel_check.jpg
node render.mjs --story=collage_reel --clip --out=out\collage_reel.mp4
node render.mjs --story=collage_reel --aspect=16:9 --clip --out=out\collage_reel_16x9.mp4
```

- `validate_assets` must report 0 FAIL.
- Check the contact sheet before the full render.
- Tune with real art only by data:
  - the hand's `grip` and `anchor`, so the fingers sit on the fruit or the truck;
  - `size` and `at`;
  - the `peel` `pieces` / `dist`.

## Tests

- `node tools/test_engine.mjs`: the motion maths (place, pop, wipe, appear / vanish, roll, follow, leave, walk, drop bounces, swing settle, cycle frames, fly, smoothed paths, slam), the smooth camera's continuous velocity, and that every motion is in the capability catalog.
- `node tools/aspect_test.mjs --only=collage_reel,collage_kit --aspects=9:16,16:9 --assets=out/mock_assets/collage_reel/`. In the cloud, run `node tools/gen_assets.mjs --story=collage_reel --mock --out=out/mock_assets/collage_reel/` first.
- The capability catalog (`node tools/capabilities.mjs`) lists every motion as `collage.<name>` and every reel transition as `transition.<name>`, with verified formats (`COLLAGE_MOTION_ASPECTS`). The `label` and `stamp` type presets are in `TYPE_PRESET_ASPECTS`.

**Not yet:** the shot-manifest compiler (AutoCinematic → `compile_plan`) does not emit collage scenes. The AutoCinematic Director sees these presets in the catalog, but a collage scene is still written as a manifest like `collage_reel`.
