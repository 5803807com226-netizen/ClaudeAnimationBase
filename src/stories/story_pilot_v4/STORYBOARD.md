# story_pilot_v4: ข้อความเดียว (V4.1 storytelling motion pilot)

9:16, 1080 × 1920, 24 fps, 15 s.
- **Look:** `watercolor` (paper texture, warm key light, soft vignette).
- **Sound:** no music. Narration only, plus optional subtle sound effects (not included yet).
- **Narration timing:** PROVISIONAL, because no narration file has been supplied. When one arrives, measure it and edit `NARRATION` and `CUE` in `story.js`. Nothing else needs to change.

**Logline.** One coral message lands on a phone. We dive into it, it becomes a thought, and the thought multiplies around a quiet figure. Then everything settles into one calm question.

**One film, not four demos.**
- **One unbroken camera:** a single shot with continuous camera choreography. The only "cut" is an object-driven match cut *through* the message.
- **One motif:** the coral message shape. It is a speech bubble, then a thought, then many thoughts, then one calm circle.
- **One colour story:** coral (agitation) eases into warm gold (calm).
- **Screen direction:** the message always rises upward from its source. The camera only moves inward (push and dive) and then outward (reveal). There is no reversing pan.

**Text.** Live Thai text rendering only, and it's selective: key phrases, never the full narration. Text stays in the 9:16 title-safe area and never overlaps the focal object. Artwork contains no letters or numbers: the message is drawn as two wavy lines.

| scene | time | narration (provisional) | visual events | camera | transition in / out | presets / systems | focal point |
|---|---|---|---|---|---|---|---|
| 1 | 0–3.4 | 0.20–2.80 ข้อความเดียวจากเขา ทำเราหงุดหงิดได้ทั้งวัน | Phone lies on warm paper, screen dark (opening frame = the composition, no blank). 0.35 screen wakes (anticipation). 0.55 buzz: phone shudders, two ink vibration marks. 0.90 one coral bubble rises out of the screen and settles above it (action → overshoot → hold). | 0–1.9 still wide with slight drift; 1.9–2.6 push to the bubble; 2.6–2.95 hold (the read); 2.95–3.4 dive into the bubble until coral fills the frame | in: first frame already composed / out: dive into the coral (match cut) | popBounce (phone), objectReveal (bubble), cameraMove keys, type: pop "ข้อความเดียวจากเขา", highlight "ทำเราหงุดหงิดได้ทั้งวัน" | the phone, then the bubble |
| 2 | 3.4–6.0 | 3.10–5.60 ทั้งที่เขาพิมพ์มาแค่ครั้งเดียว | MATCH CUT: the frame is all coral. Pulling out shows it is now a *thought* (puffy cloud, same coral, same two lines), not a speech bubble. It floats alone and breathes. | 3.4–4.7 pull out of the coral to a medium shot; 4.7–6.0 slow drift down (anticipating the figure) | in: through the coral / out: continues pulling out and down | cameraMove keys, thought drawing (`SHAPES.thought`), type: impact "แค่ครั้งเดียว" | the single thought |
| 3 | 6.0–10.0 | 6.10–9.60 แต่เราอ่านข้อความนั้นซ้ำในหัวไม่รู้กี่รอบ | The camera tilts down to reveal a calm, faceless figure (a painted silhouette bust). The thought sinks into an elliptical orbit around the head (path motion). 7.0–8.6: five copies pop out of it, one every 0.4 s (controlled repetition). They orbit in depth: behind the head they are smaller and paler, in front larger. The orbit slowly speeds up. Soft paper discs drift at two parallax depths. | 6.0–7.0 tilt down and pull out to frame the figure; 7.0–9.8 slow push-in (rising pressure) | in: continuous / out: orbit tightens | popBounce ×5 (copies), makePath/follow (orbit), parallax (2 depths), cameraMove keys, type: reveal "ซ้ำในหัว… ไม่รู้กี่รอบ" | the head and the orbiting thoughts |
| 4 | 10.0–15.0 | 10.40–13.20 ตกลงเขาทำให้เราทุกข์ หรือใจเราเองกันแน่? | 10.0–11.4: the orbit spirals inward. The copies shrink and dissolve into the original thought, which morphs (shapeMorph) into one simple circle, coral → warm gold, resting just above the head. The background warms. 11.4–15: stillness (the circle breathes very slightly): the hold. | 10.2–11.8 gentle pull back to a calm, centred composition; 11.8–15 locked with minimal drift | in: continuous / out: hold on the question; the final frame is complete (no fade to blank) | shapeMorph (thought → circle), cameraMove keys, type: reveal "ตกลงเขาทำให้เราทุกข์", slide "หรือใจเราเองกันแน่?" | the circle, then the question |

**Reads (video seconds).**
- 0.35 wake · 0.55 buzz · 0.90 bubble up · 1.9 push · 2.6 hold · 2.95 dive
- 3.4 match cut · 4.7 the thought alone · 6.0 figure revealed · 6.6 orbit begins
- 7.0 / 7.4 / 7.8 / 8.2 / 8.6 copies · 10.0 converge · 11.4 one circle · 11.6 question · 12.6 second line · 13.2–15.0 hold

**Separation of concerns (`story.js`).**
- `NARRATION`: script and timing.
- `CUE`: story beats.
- `PAL`: palette.
- `CAMERA`: choreography keys.
- `TYPE`: text items.
- `SHOT`: layers: preset selection and motion parameters.
- Look: `config.js`.
- Drawings: `art.js` (it reuses `one_message`'s phone and bubble).

**Untested until real narration:** lip-sync is not needed (there are no faces), but the text timing follows the provisional narration.

## Verification (2026-10-09, cloud, low resolution only)

**Passed:**
- **Contact sheets:** 8- and 16-frame sheets, plus four key frames at 300 px. Each beat reads, with one focal point per frame. The opening frame is the composed phone (no blank). The final frame (14.96 s) is the complete question with the calm circle and no fade.
- **Every-frame strips:**
  - dive and match cut (2.9–3.9 s): continuous, with no pops;
  - orbit entry (6.1–7.3 s): two continuity pops fixed (the trailing puffs vanished in one frame, and the depth tint jumped). Both now ease.
- **`tools/aspect_test.mjs --only=story_pilot_v4 --aspects=9:16`:** PASS. Text is inside the title-safe area, the frame is full-bleed with no bars, and there are no page errors.
- **Thai shaping:** every line checked at 300 px (ทั้ง, ซ้ำ, รู้, กี่, ทุกข์, แน่?).
- **No unintended text:** none in the artwork. The message is drawn as two wavy lines.

**Engine fix found here:** kinetic text was fitted to `maxWidth` only, so on 9:16 a long title could pass the right edge of the title-safe area (the platform buttons). Text is now fitted to whichever is narrower, `maxWidth` or the safe area. `type_demo` still PASSes, and no other story's text changes.

**Formats:**
- **9:16:** verified.
- **4:5:** passes the automatic checks and composes well, but it has not been reviewed beat by beat.
- **16:9:** passes the automatic checks, but the layout crowds the text into the bubble and the orbit. It needs its own layout before it can be claimed.

**Untested:**
- full-resolution and full-frame-rate playback (render it locally);
- real narration timing (provisional; retime `NARRATION` and `CUE`);
- sound effects (none added);
- the figure's boiling outline at full resolution.

**Systems reused:**
- story format and data blocks;
- `objectReveal` (message), `shapeMorph` (thought → circle);
- `makePath`/`follow` (orbit entry), `parallax` (background discs);
- kinetic presets `pop`, `highlight`, `reveal`, `slide`;
- `glow`, `spring`, the watercolor look, and `one_message`'s phone and bubble drawings;
- responsive safe areas, `aspect_test`.

**Custom code:**
- `art.js`: the thought shape, the faceless figure, the sleeping screen, vibration marks and paper discs;
- in `story.js`: the log-zoom camera from keys, the orbit maths (depth sort, copies), and the background colour story;
- one reusable engine addition, `typeOverlay()` (factored out of `playType`).
