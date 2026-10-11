# Task for Claude Code running on the user's Windows PC

Paste this whole file into Claude Code started in the AutoCinematic folder (or Claude will receive it from the cloud session).

## Context
- **AutoCinematic Story Studio (AC):** a private Python/Tk app on this PC. It is the folder Claude Code was started in, the one that contains `app.py`. It is already patched with v1–v6 from `ClaudeAnimationBase/patches/`; `docs/integration/AC_PIPELINE_AUDIT_V6.md` lists every v6 fix.
- **ClaudeAnimationBase (CAB):** the motion engine, a git repo. Its path is `animation_root` in AC's `hybrid_settings.local.json`.
- **What has been tested so far:** a cloud audit with mocked ComfyUI, OmniVoice and Claude. Nothing has run yet against the real local ComfyUI, LTX or OmniVoice.

## Rules (from the user)
- **Projects, configs and files:** never modify, delete or overwrite the user's projects, story files, `config.json`, character references or earlier exports. Test only in new folders, `projects/_real_test_*`.
- **Backups:** before editing any AC file, copy it to `backup_before_local_fix/<file>`.
- **Paid calls:** no paid API calls. Claude story generation runs on the user's Pro plan through the `claude` CLI. Ask before running Opus or Sonnet, since each call uses plan quota.
- **Keeping behaviour:** keep every existing function and behaviour, and fix bugs minimally.
- **Reporting:** never claim success without verified output: the file exists, and ffprobe shows the right streams and duration.
- **Pacing:** keep test renders short: one or two shots, a few seconds each.

## Steps
1. **Check.** Run `REAL_TEST.bat --check-only`. Read `real_test_report.txt` and fix what is missing:
   - a missing tool on PATH;
   - `animation_root`;
   - Remotion, via `INSTALL_REMOTION.bat`;
   - a ComfyUI node pack or model name. If a model file has a different name locally, report it and update only the workflow JSON in AC's `workflows/`, after a backup.
2. **Generate.** Run `REAL_TEST.bat`. It makes a Z-Image image, then a Qwen edit, then a 2 s LTX clip, all through the real ComfyUI. Open the image files and check them. Fix any failure in AC's code (`autocinematic/comfyui.py`, `production_runner.py`, workflow patching), then re-run.
3. **Voice.** If OmniVoice is installed, set the voice in the app, then run a pronunciation test or Voice + Captions on a copy of a short test project. Check `exports/narration_master.wav` with ffprobe.
4. **Full flow.** Create a new test project with 2 shots of 3 s each:
   1. Story (ask the user first: uses plan quota).
   2. Run Media.
   3. Voice + Captions + Export.
   4. Hybrid export.
   5. Remotion.
   Verify every output with ffprobe: A/V durations must match, and the captions must be Thai and inside the frame.
5. **Fixes.**
   - Turn each code fix into a patch: `git diff` of the AC files.
   - Save it in CAB as `patches/autocinematic_local_fixes_v7.patch`, with a short entry added to `docs/integration/AC_PIPELINE_AUDIT_V6.md`.
   - Commit and push it in CAB, on branch `claude/trusting-meitner-3ffnhp`.
   - Never commit AC itself, `config.json`, keys, models or videos.
6. **Report.** Report to the user in Thai: what passed, what was fixed, and anything left.
