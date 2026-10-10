# Mixed media: 2D cartoon and doodles over live-action footage

This is the style where real video gets hand-painted cartoon stickers and white hand-drawn doodles on top, stuck to the shot. Examples: a smiling sun in the sky, a cat riding a bus, a couple on a boat's bow, a giant Thai iced tea landing over the city. It is made from the same collage engine (`src/collage/collage.js`), with three additions:

| piece | what it does |
|---|---|
| **footage plate** (`scene.footage`) | Live-action video, turned into a frame sequence at the story fps by `tools/footage.py prepare`. It is drawn full-bleed under every layer (cover fit, never letterboxed) and follows the scene camera. |
| **footage space** (`space: 'footage'` on a layer) | `at` and `keys` x/y are **fractions of the plate** (u, v), and `size` is a fraction of its width (or `[null, h]` of its height). A sticker sits on the same spot of the footage in every format. A 9:16 frame shows the middle of a 16:9 plate (u ≈ 0.34–0.66); use per-format values for the rest. |
| **tracking** (`track`) | `tools/footage.py track` measures the plate's camera motion (`global`: a median of phase correlations over a 3 × 3 grid of tiles, so a moving bus does not drag it). It also follows named points (`--point name:t:u:v:size`, normalised cross-correlation with a confidence per frame). Footage-space layers follow `global` by default; `track: '<name>'` sticks a layer to a point (the cat on the bus), and `track: false` keeps it fixed on screen. |
| **doodle FX** (`doodle: { kind, … }` instead of `file`) | White hand-drawn line effects that draw themselves and boil on held frames: `wind`, `sparkle`, `birds`, `splash`, `lines` (emphasis), `hearts`, `swirl`, `rays`. Options: `color`, `width` (world px), `count`, `speed`, `seed`, `shadow`. They are motion marks; the stickers and characters are still generated artwork. |

The characters are cut-out PNGs. Small acting comes from the motions:
- a sip is the arm layer `follow`-ing the body (`relative: true` grip) with `sway` about the shoulder anchor;
- breathing is `float`;
- hair in the wind is `sway` on a hair layer;
- entrances use `pop`, `drop`, `slam` and `place`.

## The demo: `doodle_footage` (11.4 s, 9:16 and 16:9)

`src/stories/doodle_footage/scene.js` has four scenes:

| scene | what happens |
|---|---|
| skyline | sun, blob, flower and a boy sipping iced tea on the skytrain line, with birds and wind lines |
| bus stop | a cat riding the bus on a tracked point, flowers and sparkles |
| longtail boat | a couple on the bow from behind, a cat on the bow post, sun and cloud faces, birds, wind and a splash |
| sunset | a giant smiling Thai iced tea slams into the sky, with sparkles, emphasis lines, hearts and the title |

**Tested in the cloud:** test plates were cut from the reference clip, which is kept out of the repo; the stickers were labelled MOCK stand-ins. Results:
- `aspect_test --only=doodle_footage` PASSes in 9:16 and 16:9;
- `tools/test_footage.py` checks the trackers on synthetic plates.

### On Windows, with your own footage

Prepare each plate: frames, then tracking. Shoot steady if you can; slow pans and hand-held shots are fine.

```bat
cd C:\Users\User\ClaudeAnimationBase
python tools\footage.py prepare --in D:\clips\skyline.mp4 --out assets\stories\doodle_footage\footage\skyline\ --start 0 --end 2.25 --width 1920
python tools\footage.py track --dir assets\stories\doodle_footage\footage\skyline\
python tools\footage.py prepare --in D:\clips\bus.mp4 --out assets\stories\doodle_footage\footage\bus\ --end 2.0 --width 1920
python tools\footage.py track --dir assets\stories\doodle_footage\footage\bus\ --point front:0.4:0.42:0.36:0.06
```

Repeat for `boat` and `sunset`. A `--point` is `name:time:u:v:size`, with u and v fractions of the frame. Check that the point's confidence stays above 0.6, and move it to a high-contrast spot if it doesn't.

Make the stickers and render:

```bat
node tools\gen_assets.mjs --story=doodle_footage --dry
node tools\gen_assets.mjs --story=doodle_footage
node tools\validate_assets.mjs --story=doodle_footage
node render.mjs --story=doodle_footage "--sheet=0.6,1.5,3.4,4.5,6.9,8.5,10.5" --w=300 --out=out\doodle_check.jpg
node render.mjs --story=doodle_footage --clip --out=out\doodle_footage.mp4
```

- The `--dry` run shows every prompt; nothing is generated.
- The second command runs on your ComfyUI, in the sticker style shared by every layer (`STYLE` in `scene.js`).
- `validate_assets` must report 0 FAIL.
- Check the contact sheet before the full render.

**Placing things on a new plate:** open a frame, read the u, v of a spot (pixel x ÷ width, y ÷ height), and put it in `at`. Anchor a standing figure at its feet (`anchor: [.5, 1]`), so it stands on what is under it.
