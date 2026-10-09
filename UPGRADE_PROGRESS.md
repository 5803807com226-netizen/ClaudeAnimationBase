# Multi-aspect upgrade: progress (resumable)

Goal: every preset, system and story renders correctly at 9:16 (1080×1920), 16:9 (1920×1080) and 4:5 (1080×1350)
without editing its source. Rollback point: tag `pre-aspect-upgrade` / commit `8b2a713`.

- [x] Checkpoint Phase 3A, tag the rollback point
- [x] Audit: inventory and 16:9 assumptions (see docs/ASPECT_RATIOS.md)
- [x] src/responsive.js: aspect selection (?aspect= / --aspect / PROJECT.aspect), byAspect, nx/ny/US, safe areas
- [x] Parallax and world layers referenced to a fixed world origin (not the canvas centre)
- [x] World themes cover any frame height (sky, ground, sun/moon placement)
- [x] Stage camera: per-aspect framing, keep the hero inside the action-safe area, STAGE_INFO for tests
- [x] Presets: normalized defaults and gallery demos; `aspects` in the registry
- [x] Typography: per-aspect values, auto-fit, safe-area clamp, TYPE_INFO for tests; demo layouts for all three
- [x] tools/aspect_test.mjs: low-res frames ×3 aspects, comparison sheets, automatic checks, report
- [x] Run tests, repair, retest; mark NEEDS_REVIEW
- [x] Docs: CLAUDE.md rules for future presets, preset template, guide section
- [x] Commit and push

Notes:
- The test-tool timeouts were caused by slow GPU readback under software GL (15–30 s per full frame in the cloud). Use `--frame-timeout=90` there.
- Fixed during testing:
  - the type_demo title wrapped at 9:16 (now `maxLines: 1`);
  - the counter's width was estimated, not measured (now measured, and it fits);
  - the counter's suffix didn't shrink with the number;
  - the cameraMove and objectReveal demos were placed with `W / 2 ± px` (now width fractions).
- Remaining NEEDS_REVIEW: one_message, demo.js, preset_example, the emotions/views sheets (untested at new formats).
