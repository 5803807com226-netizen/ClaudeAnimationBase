# Motion Studio: one program from a story to a finished video

Motion Studio is a local web app that runs on your PC and opens in your browser. It joins every tool of this repository into one place:

1. You write the story (Thai), the length, the format, and a style or "let Opus choose".
2. **Opus directs**: it chooses the visual language, writes the Thai narration, and directs every shot (camera, layers, motion, transitions, titles) as a shot manifest.
3. The compiler checks the manifest. Blocked shots go back to Opus once to be fixed automatically.
4. Footage clips (for cartoons over real video) are turned into plates and tracked.
5. The artwork is generated on your ComfyUI (Z-Image), or replaced by labelled MOCK stand-ins for a quick test.
6. A preview contact sheet is rendered. Optionally Opus looks at it and improves the direction once.
7. The final MP4 is rendered.

The **AUTO** button runs everything in order and stops at the first problem. Each step also has its own button, and every step writes to a live log at the bottom of the page.

## How Claude is used: your Claude plan, not the API

By default the studio calls **Claude Code on this computer** in headless mode (`claude -p`). It runs on the Claude plan you are logged in with (Pro or Max), so there is no API key and no per-call charge.

Each Director step is one call, and each call counts against your plan's usage limits:

| step | calls |
|---|---|
| direct | 1 |
| repair | 0–1 |
| review | 0–1 |

The model is `opus`. If your plan does not include Opus, set `"claudeModel"` to one it does (for example `"sonnet"`).

Claude Code is started from a neutral temporary folder. It may only Read the image files the studio points it at (footage frames, the preview sheet); it cannot run commands or edit files.

**Setting up Claude Code (once):**

```bat
npm install -g @anthropic-ai/claude-code
claude
```

At the `claude` prompt, log in with your Claude account (`/login`), then close it. The studio header shows **Claude: opus (Claude Code, your plan)** when it is found.

To use the Claude API instead, add `"provider": "api"` and `"anthropicApiKey"` to the settings file (it is never committed). API calls are billed per token.

## Start it

1. `git pull` on the branch `claude/trusting-meitner-3ffnhp`.
2. Double-click **`MotionStudio.bat`** in the repository folder. The first start runs `npm install`.
3. The browser opens at http://127.0.0.1:4747. The page is only reachable from this computer.

Other ways to start it: `npm run studio`, or `node studio/server.mjs`.

## Settings: `studio/config.local.json`

The file is optional and never committed. Example:

```json
{
  "provider": "claude-code",
  "claudeModel": "opus",
  "python": "python",
  "comfyEngines": "tools/comfy/engines.local.json",
  "footageWidth": 1920
}
```

ComfyUI uses the same `tools/comfy/engines.local.json` as the other guides. The header shows **ComfyUI: ตั้งค่าแล้ว** when it is found; **เช็ค ComfyUI** runs the preflight check.

## Using it

1. **New project** (+ โปรเจกต์ใหม่). Fill in:
   - the id: small letters, digits and `_`;
   - the title, the story, the length, and the format (9:16 or 16:9);
   - the style: let Opus choose, collage, cartoon over footage, map documentary, or kinetic type;
   - optional notes to the director;
   - optional narration `.wav` path;
   - optional footage clips: path, name, a short description, start and end.

   Then **บันทึก** (save).
2. **AUTO** has four options:
   - ทดสอบไม่ใช้ AI (no-AI test): a plain kinetic-type layout from your sentences, which checks the whole pipeline without calling Claude;
   - ภาพ MOCK: labelled stand-ins instead of ComfyUI;
   - Opus review: one review round on the preview;
   - เรนเดอร์ตอนจบ: render the final video at the end.
3. **The director's result:** the title, the logline, why this style was chosen, review notes, and every shot with its narration (editable; **บันทึกคำบรรยายที่แก้** saves your edits) and its compile status.
4. **Preview, then video.** The final render needs complete artwork (`validate_assets` must pass), so mock art is only for previews.

**Files:**
- Project files: `projects/<id>/` (story and settings, `manifest.json`, `director.json`, `preview.jpg`).
- Compiled story: `src/stories/_plan_<id>/`.
- Artwork: `assets/stories/<id>/`.
- Final video: `out/pipeline/<id>/<id>.mp4`.

## Watercolor characters without generated images

The style **ตัวละครสีน้ำ (ไม่ต้องสร้างภาพ)** needs no ComfyUI:
- Opus names the characters and objects in English nouns, and the compiler matches each to one of about 3,300 public-domain silhouettes (elephant, running horse, dog, lion, flying bird, walking person, sailing ship, car, fighter jet, castle …);
- the engine paints them as watercolor;
- Opus directs their acting: enter, walk, run, hop, jump, fly, swim, shake, spin, turn, exit.

The no-AI test also uses them when a sentence names something the library knows in Thai (ช้าง, ม้า, เรือ, รถ, เครื่องบิน, ปราสาท …).

The icons are public domain (CC0): no credit is needed anywhere. Some subjects are not in the library (mammoth, caveman, tank, dinosaur …); for those, use generated artwork (collage) or pick another subject.

## Automatic finishing and sound

The project form has three switches, all on by default:
- **ซับไตเติลไฮไลต์ตามเสียง:** a karaoke subtitle of each shot's narration (the spoken word lights up);
- **เสียงประกอบ (SFX) อัตโนมัติ:** sound effects on entrances, transitions and titles. The first compile makes a starter pack in `assets/sfx/`; put your own `.wav` files in its category folders to use them;
- **ขัดเกลาอัตโนมัติ:** entrances, camera, transitions and stop-motion life wherever the direction left them out.

**เพลงประกอบ** takes a music file. It loops under the whole video, fades in and out, and dips automatically while the narration speaks.

These settings are applied at every compile, so changing them needs no new direction. Details: [PIPELINE.md](PIPELINE.md#automatic-finishing-in-the-plan-compiler).

## What Opus is told

`studio/playbook.md` holds the Director's instructions; you can edit it. It covers:
- how to choose a style;
- how to write Thai narration (Hook → Context → Turn → Reveal, never labelled);
- the shot-timing rule;
- professional motion rules (a focal subject, entrances, nothing dead, varied moves, a motif and transitions);
- how to write image-generation prompts;
- the output format.

With it, Opus gets two example shots and the live capability catalog (only verified capabilities). The compiler rejects anything that is not in the catalog.

## Tested

The cloud test used a stand-in program in place of Claude Code (no Claude plan is logged in there); it answered with fixed film plans:
- **AUTO with forced compile errors:** Director → blocked shot → automatic repair → compile → mock art → preview → review with the preview image → recompile;
- **a footage project:** the plate prepared and tracked automatically; the Director received the frame image; stickers, doodles and the title rendered on the video;
- **the no-AI test mode** in 16:9;
- **the page itself**, on desktop and phone width.

Not yet done:
- a real call to Claude Code on your plan;
- generating real artwork on your ComfyUI;
- a final MP4 render on your PC.
