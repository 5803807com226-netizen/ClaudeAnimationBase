# Scene 1: the hook (0–3 s). Art brief and asset specification

> **Generation is now automatic.** The prompts below live in `scene.js` as `gen` blocks, which are the source of truth. Run
> `node tools/gen_assets.mjs --story=pilot_collage --preview` with your local ComfyUI. Making the layers by hand still works:
> files you place yourself are validated, never overwritten.

**Story:** `pilot_collage`. **Scene:** `s1_hook`. **Format:** 9:16, 1080 × 1920, 24 fps. **Look:** Editorial Paper Collage.
The manifest is `scene.js`. The artwork goes in `assets/stories/pilot_collage/s1/`. Check it with
`node tools/validate_assets.mjs --story=pilot_collage`.

## 1. Visual style brief

**What it should feel like.** A considered editorial page: real paper pieces cut and torn by hand, laid on a desk, lit by a soft window light from the top left. Calm and tactile, never cartoonish. Think magazine feature illustration, not app icons.

**Materials:**
- **Kraft and cream papers:** visible fibres; torn edges show a thin white fibrous core.
- **Photographic cut-outs:** a real hand and phone, printed and cut out, with slightly matte print texture.
- **Coloured papers:** solid sugar-paper colours with subtle tooth.
- **Repeatable recipe:** every piece is a separate object with its own shadow, added by the engine. That keeps the scene repeatable.

**Light.** One key light from the top left, soft and warm.
- Each layer's artwork carries gentle shading in that same direction.
- Cast shadows are NOT painted into the artwork. The engine adds them, so they stay consistent and can move.

**Composition (9:16):**
- **Upper third:** the morning, a torn sky strip with a paper sun.
- **Centre:** the focal point, where the message lands.
- **Lower half:** the hand holding the phone.
- **Text:** at the top, inside the title-safe area. The text layout keeps it off the hand and the message automatically.
- **Focus:** one focal point at a time: phone, then message.

**Metaphor.** A calm paper morning. One message is laid on the page, and a grey paper cloud slides across the sun: the day is clouded by one message.

**Never:** letters, numbers, logos, brand marks, UI icons, watermarks, signatures, cartoon faces, 3D-render plastic, glossy vector gradients, or decorative confetti.

## 2. Palette

| role | colour | use |
|---|---|---|
| desk / kraft | `#CDB89A` (light `#E9DCC6`) | backdrop |
| cream paper | `#F3EBDC` | foreground edge, paper margins |
| morning sky | `#BFD9E6` | sky strip |
| sun | `#F2C14E` | paper sun, text highlight |
| message coral | `#E2735A` | the message (the story's motif) |
| cloud | `#9C97A8` | the grey cloud over the sun |
| ink | `#2B2233` | text, drawn lines on the message |
| skin and phone | natural photographic | the hand and phone (matte, no strong colour cast) |

## 3. Key-frame storyboard

| time | key frame | focal point | camera | motion (data in `scene.js`) |
|---|---|---|---|---|
| 0.00 | Complete composition, no blank frame: kraft desk, sky strip and sun above, hand holding a dark phone below, cream torn edge at the bottom | the phone | wide, 1.00 | — |
| 0.12–0.46 | The screen lights; the phone buzzes (small rotations, animated on twos); two cut-paper vibration ticks flick on beside it | the phone | settling | `screen` opacity, `hand` / `screen` rotation keys, `buzz` on / off |
| 0.30 | First line pops in at the top: **ข้อความเดียวจากเขา** | text | | live text, `pop` |
| 0.42–0.97 | The coral message slip is laid onto the page above the phone. It arrives lifted (bigger, softer shadow), rotates into place and presses down | the message | | `place` reveal, from the bottom |
| 0.95–2.10 | A grey paper cloud slides in from the right across the sun; the sun dips and tilts slightly | the message (the cloud is secondary) | push in, 1.06 → 1.30 | `cloud` x keys, `sun` keys (on twos) |
| 1.25 | Second line, with a sun-yellow marker: **ทำเราหงุดหงิดได้ทั้งวัน** | text | | live text, `highlight` |
| 2.40–3.00 | Hold: the message is the clear focal point, the sun half-clouded. Hands over to scene 2 through the message | the message | 1.30 → 1.33 (breathing) | — |

## 4. Asset list: exact files, sizes, transparency, anchors and depth

All files are PNG with lowercase names, in `assets/stories/pilot_collage/s1/`.
- **Size:** "Min px" is the smallest width that stays sharp at the closest camera zoom (the validator enforces it). Bigger is fine.
- **Placement:** a layer's anchor is its centre unless noted. Its depth sets parallax: 1 = the page, below 1 = further away, above 1 = nearer.

| # | file | what it is | min px (w × h) | alpha | depth | in manifest |
|---|---|---|---|---|---|---|
| 1 | `s1_bg_kraft.png` | Kraft / cream desk paper, full bleed, soft fibre texture, faint warm vignette | 1800 × 2900 | opaque (no transparency) | 0.85 | `bg` (fill) |
| 2 | `s1_sky_strip.png` | Torn strip of pale-blue paper (horizontal band); torn bottom edge with white fibres, straighter top | 1900 × 900 | transparent around | 0.70 | `sky` |
| 3 | `s1_sun.png` | Cut-paper sun: a slightly irregular hand-cut disc of warm yellow paper, subtle tooth; no rays | 600 × 600 | transparent around | 0.62 | `sun` |
| 4 | `s1_cloud.png` | Torn grey-lavender paper cloud, soft bumpy outline, layered (two papers overlapping) | 900 × 560 | transparent around | 0.66 | `cloud` |
| 5 | `s1_hand_phone.png` | Photographic cut-out: a young woman's hand holding a modern smartphone upright, front view, slight tilt; screen dark and blank; natural matte skin, short neat nails; wrist fades at the bottom edge | 1100 × 1600 | transparent around (the wrist may touch the bottom edge) | 1.00 | `hand` (subject) |
| 6 | `s1_screen_glow.png` | ONLY the phone's lit screen: soft warm-white glow, blank, no UI. **Same canvas size and position as file 5**, so it lines up exactly | same as 5 | transparent except the screen | 1.00 | `screen` |
| 7 | `s1_buzz.png` | Two pairs of short curved cut-paper ticks (vibration marks), one either side of the phone. **Same canvas as file 5** | same as 5 | transparent except the ticks | 1.00 | `buzz` |
| 8 | `s1_message.png` | The message: a torn slip of coral paper (rounded speech-bubble silhouette with a small torn tail at the bottom left), with two hand-drawn cream wavy lines standing for words (NOT letters) | 900 × 560 | transparent around | 1.00 | `message` (subject) |
| 9 | `s1_fg_edge.png` | Foreground: a long torn strip of cream paper with a fibrous torn TOP edge, lying across the bottom of the frame | 2000 × 520 | transparent above the tear | 1.15 | `fg` |

**Export rules:**
- **Margins:** cut-outs need a transparent margin of at least 2 % on every side (not touching the edge), except where noted.
- **Format and colour:** RGBA PNG, 8-bit, sRGB, not interlaced.
- **No shadows:** no drop shadows baked in, because the engine adds them.
- **Same canvas:** files 5, 6 and 7 must be exported on the same canvas so they align without manual offsets.

## 5. Image-generation prompts (Z Image / Qwen)

Generate each element on its own, on a flat chroma background, and then remove the background (rembg, Photoshop or GIMP). Keep the light direction (top left) and the paper language identical across all prompts.

**Shared style suffix (append to every prompt):**
> editorial paper collage element, handmade, real paper texture with visible fibres, torn edges with white fibrous core where torn, soft natural window light from the top left, matte, high detail, photographed flat from directly above, isolated on a plain flat solid chroma green background (#00B140), no cast shadow on the background, centered with empty margin around the object

**Shared negative prompt (use on every generation):**
> text, letters, words, numbers, digits, typography, captions, logo, brand, watermark, signature, UI, icons, app interface, emoji, frame, border, drop shadow, cast shadow, 3D render, plastic, glossy, vector, flat cartoon, clip art, gradient mesh, lens flare, bokeh, blurry, low resolution, extra fingers, deformed hand

**Prompts by file** (append the suffix; for the backdrop use the backdrop variant noted):

1. **`s1_bg_kraft.png`.** "a sheet of warm kraft paper and cream paper overlapping, full frame, fine fibre texture, a few soft creases, subtle warm vignette, top-down flat lay". Use this suffix variant instead of the chroma one: "full-bleed texture filling the entire image, no object, no background colour, evenly lit". Make it portrait (about 3:5); upscale to at least 1800 × 2900.
2. **`s1_sky_strip.png`.** "a long horizontal strip of pale sky-blue sugar paper, torn along the bottom edge showing white fibres, slightly uneven straight top edge, subtle paper tooth, very soft lighter area near the top"
3. **`s1_sun.png`.** "a hand-cut circle of warm yellow paper, slightly irregular scissor-cut edge, subtle paper tooth, a faint lighter area at the top left, no rays, no face"
4. **`s1_cloud.png`.** "a torn paper cloud made of two overlapping layers of grey-lavender paper, soft bumpy torn outline with white fibres, gentle shading"
5. **`s1_hand_phone.png`.** "a photograph of a young Asian woman's hand holding a modern black smartphone upright, front view, phone screen completely dark and blank, natural matte skin, short neat nails, relaxed grip, slight tilt, cut out like a printed photograph, soft window light from the top left, wrist ending at the bottom of the image". Add to the negative prompt: "brand logo, camera bump, notification, wallpaper, reflections of text".
6. **`s1_screen_glow.png`.** No prompt. Make it in your editor: select the screen area of file 5, fill it with a soft warm-white (`#FFF4DE` centre to `#F4E6CC` edges), feather 2 px, and export alone on the same canvas.
7. **`s1_buzz.png`.** "four short curved strips of cream paper cut with scissors, arranged as two pairs of vibration marks, simple and elegant". Then position them beside the phone on the canvas of file 5 in your editor.
8. **`s1_message.png`.** "a torn piece of coral-red paper shaped like a rounded speech bubble with a small torn tail at the bottom left, two hand-drawn wavy cream lines across it like abstract handwriting strokes (not letters), subtle paper fibres, soft shading"
9. **`s1_fg_edge.png`.** "a long strip of cream paper lying horizontally, torn along its top edge with white fibres, slightly crumpled, soft shading"

**Quality checklist before export:**
- No letters, numbers or logos anywhere. Check generated "handwriting" closely.
- Edges are clean after background removal, with no green fringe (use defringe or decontaminate).
- The light comes from the top left on every piece.
- The hand looks natural: five fingers, a plausible grip.

## 6. Manifest

`scene.js` in this folder holds the exact layer order, positions, anchors, depths, paper treatment (shadow, border, grain), motion keys, the reveal and the camera. You don't need to edit it to deliver artwork. If an image's proportions differ from the table above, the height follows automatically; it is never stretched.

## 7. Delivery and next step

1. Put the 9 PNGs in `assets/stories/pilot_collage/s1/`.
2. Run `node tools/validate_assets.mjs --story=pilot_collage` and fix any FAIL.
3. Commit them, or send them to me.

I'll then:
- re-validate the files;
- assemble the scene and adjust the timing and the camera against the real art;
- check low-res sheets in the cloud.

You then render the final clip locally.
