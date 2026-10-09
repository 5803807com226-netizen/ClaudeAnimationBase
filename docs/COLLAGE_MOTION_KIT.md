# Collage Motion Kit (editorial photo-collage animation)

The moves of a premium editorial collage film, as reusable data-driven presets for any collage story. Taken from the reference *"The best creatively distinctive and impactful collage animation"* (31 s, 16:9).

Every preset is a **motion** on a layer of imported PNG artwork, or a **transition** between scenes. No story writes animation code. The artwork rule still holds: cut-outs are made outside the code (`tools/gen_assets.mjs` on your ComfyUI, or by hand), never drawn procedurally.

## What the reference does, and the preset for each

| in the reference | preset | data |
|---|---|---|
| a hand brings the orange in, then withdraws | `place` (the object) + `follow` → `leave` (the hand) | `{ kind: 'follow', target: 'fruit', grip: [dx, dy], until }`, `{ kind: 'leave', at, to: 'bottom' }` |
| the orange peel comes away and the globe is underneath | `peel` (the globe sits behind it with `appear`) | `{ kind: 'peel', at, dur, pieces: 7, dist, fall, spin }`; `assemble: true` runs it backwards |
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

Also available: `spin`, transitions `fade` and `cut`. These are not in the test reel yet, so the catalog lists them as experimental.

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

- `node tools/test_engine.mjs`: the motion maths (place, pop, wipe, appear / vanish flicker, roll path and spin, follow, leave, walk) and that every motion is in the capability catalog.
- `node tools/aspect_test.mjs --only=collage_reel --aspects=9:16,16:9 --assets=out/mock_assets/collage_reel/`. In the cloud, run `node tools/gen_assets.mjs --story=collage_reel --mock --out=out/mock_assets/collage_reel/` first.
- The capability catalog (`node tools/capabilities.mjs`) lists every motion as `collage.<name>` and every reel transition as `transition.<name>`, with verified formats (`COLLAGE_MOTION_ASPECTS`). The `label` and `stamp` type presets are in `TYPE_PRESET_ASPECTS`.

**Not yet:** the shot-manifest compiler (AutoCinematic → `compile_plan`) does not emit collage scenes. The AutoCinematic Director sees these presets in the catalog, but a collage scene is still written as a manifest like `collage_reel`.
