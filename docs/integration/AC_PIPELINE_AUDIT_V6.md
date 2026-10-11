# AutoCinematic ONE: pipeline audit and fixes (patch v6)

`patches/autocinematic_pipeline_fixes_v6.patch` fixes bugs found in an audit of AutoCinematic Story Studio V12.9.36.6 (the copy the user uploaded), across every stage: script → images → voice → motion → render.

The audit:
- **Reproduced every bug before fixing it.** Each one has a script that makes it happen by calling the real functions. Claude, ComfyUI and OmniVoice were mocked.
- **Re-ran every repro after the fix.**
- **Ran the whole flow end to end** through `App()` under Xvfb, with a Thai project name that contains a space. All five stages passed:

| stage | output |
|---|---|
| story | 3 shots |
| images | Z-Image + Qwen-edit, plus LTX clips |
| voice | `narration_master.wav`, captions |
| motion | Hybrid MP4 with story_motion and code_motion; A/V 8.083 s / 8.083 s |
| Remotion | clean, captioned and preview; A/V 8.083 s / 8.085 s |

No real model calls were made. Renders were low-resolution.

Existing behaviour is kept. The app's test suite passes 47/47 after the patch. Before it, the suite had 2 failures: both were stale tests, which the patch updates (see "Tests" below).

## Install (Windows)

Patches v1–v5 must already be applied: v6 edits files they add. Back up the files the patch changes first (`git apply --check` lists them), then, in the AutoCinematic folder:

```
git apply --check "<ClaudeAnimationBase>\patches\autocinematic_pipeline_fixes_v6.patch"
git apply "<ClaudeAnimationBase>\patches\autocinematic_pipeline_fixes_v6.patch"
```

- **Remove:** `git apply -R` with the same file. The reverse apply was tested.
- **Remotion:** run `INSTALL_REMOTION.bat` once. The patch adds `remotion/src/index.jsx`, which was missing from the release, so Remotion export could never run before.
- **Your files:** no project, story, config or reference file is touched.

## What was wrong, and what changed

### Script / research
| bug | effect | fix |
|---|---|---|
| `extract_json` broke on brackets before the JSON (`[PDF_01, p.3]`, `[1]`) | Opus/Sonnet answers failed to parse or parsed as the wrong value | decode from each `{`/`[`, skip failures, prefer an object |
| the raw answer was saved only after a successful parse; a non-object answer was cached as `{}` | a paid answer was lost; an empty character cast was cached for good | `_model_json`: save raw first, raise on a non-object |
| web pages decoded from `r.text` | Thai pages with only a `<meta charset>` became mojibake, and the story was written from it | parse `r.content` (bs4 honours the meta charset) |
| writing a long prompt to a CLI that already exited | `BrokenPipeError` hid the real error (e.g. "Please run /login") | ignore the broken pipe; report the CLI's stderr |
| retry after a failed or stopped run | Sonnet research was bought again | `story/pending_source.json` marks the research as this source's until the request is recorded |
| variant name checked unslugified | "New Narrative" reused the old folder and returned the old story | check the slugified folder name |

### Images
| bug | effect | fix |
|---|---|---|
| style prefixes ("Visual treatment.") not recognised when re-styling | switching style stacked blocks and kept the old style | the period forms are now markers too |
| the default `preferred_view` counted as "wants a character" | with one character, it was pasted into every b-roll shot | only a name, an id or an action asks for a character |
| reroll looked up `<id>_reroll` for continuity | rerolls lost PREVIOUS_SHOT / SAME_CHARACTER references | look up the real shot id; unnamed shots are numbered from 1 |
| prompt sanitiser | "no texture" counted as "no text"; the style prefix was corrupted; `CHAR_A` ids leaked | regex for the clause; the prefix is left alone; letter ids are matched case-sensitively, so words like chart and charm are untouched |
| ComfyUI `temp` previews (the ImageCompare node) were downloaded | a preview became the shot's image | skip `type: temp` |
| queued rerolls read the project when they ran | a project switch sent them to the other project | the project is bound when the job is queued |
| Character Refs dialog lower-cased the id | `CHAR_01` was stored as `char_01` and never matched | the typed id is kept |
| Stop counted as a shot error | shots were marked `image_error` / `video_error` | `RunCancelled` propagates |

### Voice / captions
| bug | effect | fix |
|---|---|---|
| pronunciation overrides replaced inside numbers | `12×` was read "1 สองเท่า"; `146 พันล้าน…` was misread | digit guards on both ends |
| unit overrides never matched after a digit; `IGNORECASE` on short units | `300Wh` was left unread; `mW` was read as megawatt | letters may follow digits; short tokens are case-sensitive |
| per-chunk 0.95 s ceiling | captions ran seconds ahead of the voice; the last chunk took the rest | share the shot by text length |
| duplicate `shot_id` | the first shot became silent | ids are made unique per shot |
| `Path("")` counted as an existing reference | an opaque OmniVoice failure instead of "pick a Voice Reference" | `is_file()` check |
| Thai caption fallback | chunks started with orphan vowel or tone marks | no cut inside a syllable |
| headline units after Thai text; a literal `\n` in the Audio Test dialog | minor | fixed |

### Motion / render
| bug | effect | fix |
|---|---|---|
| `scene['file']` on code_motion scenes | ▶ Motion and Plan Only crashed with `KeyError` | use the story id |
| scene lengths from the story, voice from natural lengths | the narration drifted against the shots in Hybrid export | scene length = voice length; the preflight requires a match within 0.25 s |
| bridge output in the Windows code page | Hybrid export of a Thai-named project crashed (cp1252) | stdout and stderr are UTF-8 |
| libass wraps only at spaces | Thai captions ran off the frame | pre-wrap to 3 lines (`\N`); the last line ends with … |
| Motion Plan reused the last project's manifest | it rendered and exported project A into project B | a saved manifest is reused only inside the project |
| Remotion: no `src/index.jsx`; `npx`/`npm` not found on Windows; no timeouts | Remotion export could never run | compositions added; `shutil.which`, timeouts, UTF-8 logs |
| code_motion headline cut by character count | the headline ended mid-word | cut at a space, never inside a syllable |

### Application (UI orchestration)
| bug | effect | fix |
|---|---|---|
| loading a project restyled it with the previous project's dropdown | the story's style and every prompt were rewritten | sync the dropdown from the loaded story first |
| Continue / Duplicate / Fork / New Project / renaming while jobs ran or waited | jobs wrote into another project | `_jobs_active()` guard; the project box is read-only while busy |
| Rebuild Story Prompts | research was wiped and media archived, despite the dialog | rebuild in resume mode |
| Pause did not hold the queue; Resume ran Run Media | queued jobs ran anyway | Pause holds the queue; Resume continues it; Stop and New Project clear the pause |
| New Project kept the old character, PDF and library views | a character could be generated into the wrong project | views refresh |

## Tests
Two tests were stale and are updated:
- the version label: `app.py` is already V12.9.36.7;
- the "Visual treatment: <name>" check: since V12.9.36.10 the style name is kept out of prompts on purpose.

The updated style test now also checks that re-styling replaces the treatment block. It fails on the old code.

## Not changed (known limits)
- **Thai word breaks:** line breaks avoid splitting syllables but may still split words, because no dictionary is used. `pythainlp` would do better.
- **Tk variables read from worker threads:** this works with threaded Tcl but is fragile. It is unchanged.
- **Remotion clip length:** there is no check that LTX clips cover the voice. A longer voice holds the clip's last frame.
- **Windows:** the audit ran on Linux. Windows-only paths (`.cmd` shims, code pages) were fixed from the code and simulated (`PYTHONIOENCODING=cp1252`), not run on Windows.
