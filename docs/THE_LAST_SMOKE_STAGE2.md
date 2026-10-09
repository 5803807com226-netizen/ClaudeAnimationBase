# The Last Smoke — Stage 2 on Windows (real assets, voice, final render)

**What Stage 1 delivered.** These are all in the repo, on branch `claude/trusting-meitner-3ffnhp`:
- the five-shot story;
- the cutout rig;
- the IK walk;
- the generation manifest;
- the mocks and the QA tools.

**Stage 2 makes the real artwork.** It runs on your local ComfyUI (Z-Image and Qwen-Image), records the Thai voice, and renders the final 15 s MP4.

**Cost.** Nothing here calls a paid API. Generation runs on your own GPU, Opus is not used, and the voice is OmniVoice on your machine.

## 0. Update and check the tools

```
cd C:\Users\User\ClaudeAnimationBase
git pull
npm install
python -c "import PIL, numpy; print('ok')"
curl http://127.0.0.1:8188/system_stats
```

The `curl` command checks that ComfyUI is running. This cloud session cannot reach your `127.0.0.1`, so run it yourself.

**Engine config.** Copy `tools\comfy\engines.example.json` to `tools\comfy\engines.local.json`. Point `zimage` and `qwen` at workflows exported with **Save (API Format)**. The Qwen workflow must contain a **LoadImage** node, which is how each edit receives its reference image.

**Review every prompt before spending GPU time:**
```
node tools\gen_assets.mjs --story=the_last_smoke --dry > out\the_last_smoke\gen_plan.txt
```

This plans 64 layers in 8 groups, in a fixed order, each checked before the next.

## 1. Gate A — the master (one image decides the whole film)

```
node tools\gen_assets.mjs --story=the_last_smoke --scene=smoke_master --only=master_3q
```

Open `assets\stories\the_last_smoke\character\master_3q.png`. Approve it only if **all** of these hold:

| check | must be |
|---|---|
| face | long narrow, slightly hooked nose; deep-set amber eyes; short gray beard; about 62 |
| hair | silver-gray, half-up knot, flyaway strands |
| scar | on his **left** cheek (the viewer's right when he faces you) |
| bandage | on his **left** forearm |
| staff | in his **right** hand; knotted cedar with a **Y-shaped** knob |
| costume | off-white tunic, brown short mantle, torn scarf, rope-wrapped shins |
| satchel | hide, crossbody, on his **right** hip |
| image | full body with margin; no text or watermark; one person only |

**If it fails,** change the `seed` in `src\stories\the_last_smoke\assets.js` (`master_3q`) and rerun with `--force`. Every other asset is edited from this image, so do not continue until it is right.

## 2. Gate B — turnaround, and an identity check before any part is made

```
node tools\gen_assets.mjs --story=the_last_smoke --scene=smoke_master
python tools\comfy\imageops.py compare --in assets\stories\the_last_smoke\character\master_3q.png assets\stories\the_last_smoke\character\master_front.png assets\stories\the_last_smoke\character\master_side_right.png assets\stories\the_last_smoke\character\master_side_left.png assets\stories\the_last_smoke\character\master_back.png assets\stories\the_last_smoke\character\master_face_close.png --labels 3q,front,side_R,side_L,back,face --out out\the_last_smoke\identity_sheet.jpg
```

Compare all six views on `identity_sheet.jpg` against the table in Gate A. To redo one view, use `--only=master_side_left --force`.

Each shot depends on one view:

| shot | made from | what must match there |
|---|---|---|
| S01 ridge, 3/4 | `master_3q` | everything; the scar and bandage are small but visible |
| S02 walk, right profile | `master_side_right` (near limbs), `master_side_left` (far limbs) | staff in the near (right) hand. The far left forearm keeps its bandage. The scar is hidden on the far side, which is correct. |
| S03 face close-up | `master_face_close` | the scar on his left cheek, the nose, the eyes and the beard |
| S04 hand macro | `master_3q` → `s04_right_hand_relaxed` → `_tense` | the **right** hand on the staff; the bandaged forearm is the **left** |
| S05 over the shoulder | `master_back` | the hair knot, scarf, satchel (right hip) and staff (right) |

**Never fix a view by mirroring it.** The character is asymmetric, so a mirrored image moves the scar and bandage to the wrong side.

## 3. Gate C — the walking rig (test it before making everything else)

```
node tools\gen_assets.mjs --story=the_last_smoke --scene=smoke_rig
node tools\validate_assets.mjs --story=the_last_smoke --scene=smoke_rig
node render.mjs --story=the_last_smoke --sheet=3.25,3.8,4.35,5.15,5.5 --cols=5 --crop=120,520,700,1060 --w=300 --out=out\the_last_smoke\real_s02_contacts.jpg
node tools\rig_contact_check.mjs --story=the_last_smoke
```

**Calibrating the parts.** Each part must fit the box `rig_spec.js` gives it: its size (`w`, `h`), and the joint at its anchor point. If a real part's joint sits elsewhere, for example the knee lower in the thigh image:
- change only that part's `anchor` and `joint` numbers in `src\stories\the_last_smoke\rig_spec.js`;
- rerun the two commands above.

No code changes. `rig_contact_check` must still print **PASS**: 0 px IK error, and no foot or staff slide while planted.

## 4. Remaining artwork

```
node tools\gen_assets.mjs --story=the_last_smoke --scene=smoke_hero3q
node tools\gen_assets.mjs --story=the_last_smoke --scene=smoke_face
node tools\gen_assets.mjs --story=the_last_smoke --scene=smoke_back
node tools\gen_assets.mjs --story=the_last_smoke --scene=smoke_details
node tools\gen_assets.mjs --story=the_last_smoke --scene=smoke_env
node tools\gen_assets.mjs --story=the_last_smoke --scene=smoke_fx
node tools\validate_assets.mjs --story=the_last_smoke
```

**Overlay cuts.** The closed eyes, the 3/4 head, scarf and cloak, and the back-view head and scarf are cut from the same image as their base, using a feathered `rect`, so they stay registered. If a cut misses its feature, adjust its `rect` (fractions of the image) in `assets.js` and rerun that scene.

**Placement numbers to calibrate against the real plates** (all in `story.js`):
- `STAND_TOP`: the ridge's flat standing line, as a fraction of the ridge image height;
- `FIRE`: where the campfire sits on the valley floor;
- `GROUND`: the walk line in S02.

## 5. Narration (one Thai voice, natural speed, no music)

Record `narration_th.txt` with OmniVoice and save it as `assets\stories\the_last_smoke\narration_th.wav`. Then measure it:
```
ffprobe -v error -show_entries format=duration -of csv=p=0 assets\stories\the_last_smoke\narration_th.wav
```
If it is longer than about 14.5 s, shorten the copy slightly; do not speed up the voice.

The sound effects sit on the story's real contact frames, set in `jobs\the_last_smoke_15s.json`:

| sound | time (S02 local) | film time |
|---|---|---|
| footfall 1 | 0.70 s | 3.70 s |
| staff tap 1 | 1.35 s | 4.35 s |
| footfall 2 | 2.05 s | 5.05 s |
| staff tap 2 | 2.50 s | 5.50 s |

Put the files under `assets\stories\the_last_smoke\sfx\` with the names listed in the job. Missing files are skipped and reported.

## 6. Final render and QA

```
node tools\pipeline.mjs --job=jobs\the_last_smoke_15s.json
ffprobe -v error -show_entries format=duration:stream=width,height,r_frame_rate -of csv=p=0 out\pipeline\the_last_smoke_15s\the_last_smoke_15s.mp4
node render.mjs --story=the_last_smoke --sheet=0.5,3.5,6.5,9.5,12.5 --cols=5 --w=300 --out=out\the_last_smoke\real_contact.jpg
node render.mjs --story=the_last_smoke --query=freezecam --fps=6 --strip=0:15 --cols=13 --w=120 --out=out\the_last_smoke\real_freezecam.jpg
node tools\motion_check.mjs --sheet=out\the_last_smoke\real_freezecam.jpg --cols=13 --frames=91 --fps=6 --windows=0.2:3,3.2:6,6.2:9,9.2:12,12.2:15 --min=0.005
```

**Expected result:**
- 1080×1920 at 24 fps, 15.00 s;
- every shot passes the motion check with the camera frozen (the subject moves on its own);
- the cuts are hard, so the narration and sound effects stay on the shot timeline.

Send me the MP4, the two contact sheets and `out\pipeline\the_last_smoke_15s\report.json`. I'll write `QA_REPORT.md` from the real frames.
