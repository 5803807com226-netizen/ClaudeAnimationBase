# The Last Smoke — Stage 2 on Windows (real character artwork → real animation)

**Order: character first.** The parts that move get made first:
1. the master;
2. the turnaround;
3. the S02 walk rig (walking, planted feet, staff contact);
4. the S03 face (blink, breath);
5. the S01 and S05 bodies (breath, clothing in the wind).

Backgrounds come last. The story already renders without them: missing plates are skipped, never faked. You can therefore judge the real character's motion before generating any scenery.

**Cost.** No paid API anywhere. Everything runs on your GPU through ComfyUI; Opus is not used.

## 0. One-time setup (about 5 minutes)

```bat
cd C:\Users\User\ClaudeAnimationBase
git pull
npm install
python -c "import PIL, numpy; print('python ok')"
```

**Engine config.** Create `tools\comfy\engines.local.json` (it is not committed) pointing at the API-format workflows that already sit in your AutoCinematic folder:

```json
{
  "server": "http://127.0.0.1:8188",
  "engines": {
    "zimage": { "workflow": "D:/AI/AutoCinematic_Story_Studio_V12.9.36.3_PDF_RESEARCH_FULL_WITH_RUNNER/workflows/z_image_turbo.json", "bind": {} },
    "qwen":   { "workflow": "D:/AI/AutoCinematic_Story_Studio_V12.9.36.3_PDF_RESEARCH_FULL_WITH_RUNNER/workflows/qwen_image_edit.json", "bind": {} }
  }
}
```

Use forward slashes. If your workflows live elsewhere, change the two paths.

**Start ComfyUI, then run the preflight.** It generates nothing; it only checks:

```bat
node tools\comfy\preflight.mjs
```

It must end with **`PASS: gen_assets can drive this ComfyUI`**, and these are the expected bindings:
```
zimage  binds {"positive":"57:27.text","seed":"57:3.seed","width":"57:13.width","height":"57:13.height"}
qwen    binds {"positive":"459:474.prompt","negative":"459:474.negative_prompt","seed":"459:458.seed","width":"459:456.width","height":"459:456.height","image":"480.image"}
```

**If it FAILs:**
- a node "is not installed": install that custom node in ComfyUI;
- a model "is not in ComfyUI's model list": the workflow names a model file your ComfyUI cannot see;
- the bindings differ from the ones above: send me the output.

**Why the preflight exists.** These two workflows hit two bugs in the auto-binder, now fixed and covered by tests:
- Z-Image's negative is a zeroed copy of the prompt, so the old binder would have **overwritten the prompt with the negative prompt**.
- The Qwen workflow has three LoadImage nodes but only **480** is wired. The old binder would have sent the master reference to node 470, which feeds nothing, so **every edit would have ignored your master**.

## 1. Gate A — the master (one image decides the whole film)

```bat
node tools\gen_assets.mjs --story=the_last_smoke --dry --scene=smoke_master --only=master_3q
node tools\gen_assets.mjs --story=the_last_smoke --scene=smoke_master --only=master_3q
```

The first command prints the exact prompt; the second generates the image. Then open `assets\stories\the_last_smoke\character\master_3q.png`.

Approve it only if **every** row holds:

| check | must be |
|---|---|
| one person | a single old man, full body head to sandals, margin all round, plain gray background |
| face | long narrow, slightly hooked nose; deep-set amber eyes; short gray-charcoal beard; about 62 |
| hair | silver-gray, half-up knot, flyaway strands |
| scar | his **left** cheek (on **your right** when he faces you) |
| bandage | his **left** forearm (on **your right**) |
| staff | in his **right** hand (on **your left**); knotted wood with a **Y-shaped** knob |
| costume | off-white tunic, brown short mantle, torn scarf, rope-wrapped shins, sandals |
| satchel | hide, crossbody, on his **right** hip |
| image | no text, letters, logo or watermark |

**If it fails:**
1. In `src\stories\the_last_smoke\assets.js`, change `seed: 61519` (`master_3q`) to any other number.
2. Rerun with `--force`.

Each try costs one image. Do not continue until it is right: every later image is a Qwen **edit** of this one.

## 2. Gate B — turnaround and identity check (before any part)

```bat
node tools\gen_assets.mjs --story=the_last_smoke --scene=smoke_master
python tools\comfy\imageops.py compare --in assets\stories\the_last_smoke\character\master_3q.png assets\stories\the_last_smoke\character\master_front.png assets\stories\the_last_smoke\character\master_side_right.png assets\stories\the_last_smoke\character\master_side_left.png assets\stories\the_last_smoke\character\master_back.png assets\stories\the_last_smoke\character\master_face_close.png --labels 3q,front,side_R,side_L,back,face --out out\the_last_smoke\identity_sheet.jpg
```

Check all six views on `out\the_last_smoke\identity_sheet.jpg` against the Gate A table. To redo one view: `node tools\gen_assets.mjs --story=the_last_smoke --scene=smoke_master --only=master_side_left --force`.

**Never fix a view by mirroring it:** that moves the scar and bandage to the wrong side.

| view | feeds | must show |
|---|---|---|
| `master_side_right` | the S02 walk (near limbs, staff hand) | staff in the near hand; the scar is hidden on the far side (correct) |
| `master_side_left` | the S02 far limbs | the **bandaged** forearm |
| `master_face_close` | the S03 blink close-up | the scar on his left cheek, the nose, the eyes, the beard |
| `master_back` | the S05 over-the-shoulder shot | the knot, the scarf, the satchel on his right, the staff on his right |
| `master_3q` | S01, the S04 hands | everything |

## 3. Gate C — the walk with real parts (your top priority)

```bat
node tools\gen_assets.mjs --story=the_last_smoke --scene=smoke_rig
node tools\validate_assets.mjs --story=the_last_smoke --scene=smoke_rig
node tools\rig_contact_check.mjs --story=the_last_smoke
node render.mjs --story=the_last_smoke --sheet=3.25,3.7,4.0,4.35,5.05,5.5 --cols=6 --crop=120,520,700,1060 --w=300 --out=out\the_last_smoke\real_s02_contacts.jpg
node render.mjs --story=the_last_smoke --fps=8 --strip=3:6 --cols=8 --crop=120,520,700,1060 --w=200 --out=out\the_last_smoke\real_s02_strip.jpg
```

What these check:
- **`rig_contact_check` must print PASS:**
  - 0 px IK error;
  - no foot slide while planted (the heel, then the toe as it rolls);
  - the staff tip fixed while planted;
  - knees bend one way only.
- **The two images are for your eye:**
  - joints meet (no gaps at hip, knee or ankle);
  - the staff stays in the hand;
  - the feet sit on the path, with the footfalls at 3.70 s and 5.05 s and the staff taps at 4.35 s and 5.50 s.

**When a joint gapes or a limb sits off its socket.** The real part's pivot is not where the mock's was:
- open `src\stories\the_last_smoke\rig_spec.js`;
- adjust only that part's `anchor` (its pivot inside the image, in u) or `joint` (where it attaches on the parent);
- rerun the last three commands.

No code changes are needed. Send me `real_s02_contacts.jpg` and I'll give you the numbers.

## 4. Gate D — blink, breath and clothing (S03 face, S01 and S05 bodies)

```bat
node tools\gen_assets.mjs --story=the_last_smoke --scene=smoke_face
node tools\gen_assets.mjs --story=the_last_smoke --scene=smoke_hero3q
node tools\gen_assets.mjs --story=the_last_smoke --scene=smoke_back
node render.mjs --story=the_last_smoke --sheet=6.9,7.1,7.15,7.2,7.35,8.2 --cols=6 --crop=140,500,800,700 --w=220 --out=out\the_last_smoke\real_s03_blink.jpg
node render.mjs --story=the_last_smoke --query=freezecam --sheet=0.3,1.0,1.7,2.4 --cols=4 --w=260 --out=out\the_last_smoke\real_s01_frozen.jpg
node render.mjs --story=the_last_smoke --query=freezecam --sheet=12.2,13.5,14.8 --cols=3 --w=300 --out=out\the_last_smoke\real_s05_frozen.jpg
```

What to check:
- **The blink:** the eyes go open → closed at 7.15 s → open, with nothing else changing. The closed eyes are cut from the same face image (`region`), so they cannot drift.
- **`freezecam`:** these sheets hold the camera still, so any movement you see is the character's own: breath, head, scarf, cloak.
- **When a cut misses its feature** (the closed eyes, the 3/4 head, scarf or cloak, the back-view head or scarf): adjust that layer's `rect` (fractions of the image) in `assets.js` and rerun the scene.

## 5. The rest of the artwork

```bat
node tools\gen_assets.mjs --story=the_last_smoke --scene=smoke_details
node tools\gen_assets.mjs --story=the_last_smoke --scene=smoke_env
node tools\gen_assets.mjs --story=the_last_smoke --scene=smoke_fx
node tools\validate_assets.mjs --story=the_last_smoke
```

`validate_assets` must report **0 FAIL**. Then calibrate the placement numbers in `story.js` against the real plates:
- `STAND_TOP`: the ridge's standing line;
- `FIRE`: the campfire on the valley floor;
- `GROUND`: the walk line.

## 6. Voice, sound, final render

1. **Narration.** Record `narration_th.txt` with OmniVoice into `assets\stories\the_last_smoke\narration_th.wav`. Measure it with `ffprobe -v error -show_entries format=duration -of csv=p=0 assets\stories\the_last_smoke\narration_th.wav`. If it is longer than about 14.5 s, shorten the copy; never speed up the voice.
2. **Sound effects.** Put them in `assets\stories\the_last_smoke\sfx\`, with the names listed in `jobs\the_last_smoke_15s.json`. They already sit on the story's real contact frames.
3. **Final render and check:**
   ```bat
   node tools\pipeline.mjs --job=jobs\the_last_smoke_15s.json
   ffprobe -v error -show_entries format=duration:stream=width,height,r_frame_rate -of csv=p=0 out\pipeline\the_last_smoke_15s\the_last_smoke_15s.mp4
   node render.mjs --story=the_last_smoke --query=freezecam --fps=6 --strip=0:15 --cols=13 --w=120 --out=out\the_last_smoke\real_freezecam.jpg
   node tools\motion_check.mjs --sheet=out\the_last_smoke\real_freezecam.jpg --cols=13 --frames=91 --fps=6 --windows=0.2:3,3.2:6,6.2:9,9.2:12,12.2:15 --min=0.005
   ```
   Expected: 1080×1920, 24 fps, 15.00 s; every shot passes with the camera frozen.

## What to send back after each gate

| gate | send |
|---|---|
| A | `master_3q.png` |
| B | `identity_sheet.jpg` |
| C | `real_s02_contacts.jpg`, `real_s02_strip.jpg`, the `rig_contact_check` output |
| D | `real_s03_blink.jpg`, `real_s01_frozen.jpg`, `real_s05_frozen.jpg` |
| final | the MP4 and `out\pipeline\the_last_smoke_15s\report.json` |

I calibrate from these and write `QA_REPORT.md` from the real frames.
