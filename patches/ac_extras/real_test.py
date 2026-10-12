"""Real-machine test of AutoCinematic's generation path against YOUR running ComfyUI.

Uses the app's own code (ComfyUIClient + ProductionRunner + the workflows and
config.json in this folder), in a new test folder only: projects/_real_test_<time>/.
Nothing in your projects, configs or ComfyUI models is changed.

  python real_test.py               check + Z-Image + Qwen edit + LTX video (2 s)
  python real_test.py --no-video    skip the LTX video (faster)
  python real_test.py --check-only  only check ComfyUI, nodes, models, tools

Writes real_test_report.txt next to this file (paste it back to Claude).
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
import traceback
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

from autocinematic.utils import load_json  # noqa: E402
from autocinematic.comfyui import ComfyUIClient  # noqa: E402
from autocinematic.production_runner import ProductionRunner  # noqa: E402

REPORT: list[str] = []
RESULTS: dict[str, str] = {}


def log(msg: str = "") -> None:
    print(msg, flush=True)
    REPORT.append(msg)


def step(name: str, ok: bool, detail: str = "") -> bool:
    RESULTS[name] = "PASS" if ok else "FAIL"
    log(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    return ok


def get_json(url: str, timeout: int = 30):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def check_workflow(name: str, wf: dict, info: dict) -> list[str]:
    """Every node class must be installed and every file choice (models) present."""
    problems = []
    for nid, node in wf.items():
        cls = node.get("class_type")
        spec = info.get(cls)
        if spec is None:
            problems.append(f"{name}: node {nid} '{cls}' is not installed in ComfyUI (custom node pack missing?)")
            continue
        inputs = {**spec.get("input", {}).get("required", {}), **spec.get("input", {}).get("optional", {})}
        for key, val in node.get("inputs", {}).items():
            choices = inputs.get(key, [None])[0]
            if isinstance(val, str) and isinstance(choices, list) and choices and val not in choices:
                problems.append(f"{name}: node {nid} {cls}.{key} = '{val}' is not in ComfyUI's list (model file missing?)")
    return problems


def ffprobe(path: Path) -> str:
    exe = shutil.which("ffprobe")
    if not exe:
        return "ffprobe not found"
    p = subprocess.run([exe, "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height",
                        "-of", "compact", str(path)], capture_output=True, text=True, encoding="utf-8", errors="replace")
    return (p.stdout or p.stderr).strip().replace("\n", " | ")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-video", action="store_true")
    ap.add_argument("--check-only", action="store_true")
    ap.add_argument("--url", help="ComfyUI URL (default: config.json production.comfyui_url)")
    args = ap.parse_args()

    log(f"AutoCinematic real test — {time.strftime('%Y-%m-%d %H:%M:%S')}")
    log(f"Folder: {ROOT}")
    log(f"Python: {sys.version.split()[0]}  ({sys.executable})")
    cfg = load_json(ROOT / "config.json")
    prod = cfg.get("production", {})
    url = (args.url or prod.get("comfyui_url") or "http://127.0.0.1:8188").rstrip("/")
    prod["comfyui_url"] = url  # in memory only: the runner below uses the same server
    log(f"ComfyUI: {url}")
    log("")

    # 1. tools
    for tool in ("ffmpeg", "ffprobe", "node", "npm"):
        where = shutil.which(tool)
        step(f"tool {tool}", bool(where), where or "not on PATH")
    settings = load_json(ROOT / "hybrid_settings.local.json") if (ROOT / "hybrid_settings.local.json").exists() else {}
    engine = Path(settings.get("animation_root") or "")
    step("ClaudeAnimationBase (animation_root)", bool(settings.get("animation_root")) and (engine / "render.mjs").is_file(),
         str(engine) if settings.get("animation_root") else "not set in hybrid_settings.local.json")
    step("Remotion installed", (ROOT / "remotion" / "node_modules" / "remotion").exists()
         and (ROOT / "remotion" / "src" / "index.jsx").exists(), "run INSTALL_REMOTION.bat if FAIL")

    # 2. ComfyUI reachable, nodes and models present
    try:
        stats = get_json(url + "/system_stats", 10)
        dev = (stats.get("devices") or [{}])[0]
        step("ComfyUI reachable", True, f"{dev.get('name', '?')} VRAM free {round((dev.get('vram_free') or 0) / 2**30, 1)} GB")
    except Exception as e:
        step("ComfyUI reachable", False, f"{e} — open ComfyUI first (and check the port)")
        return finish()
    try:
        info = get_json(url + "/object_info", 120)
    except Exception as e:
        step("ComfyUI object_info", False, str(e))
        return finish()
    wfs = prod.get("workflows", {})
    all_ok = True
    for key in ("z_image", "qwen_image_edit", "ltx25_i2v"):
        wf_file = ROOT / wfs.get(key, {}).get("file", "")
        if not wf_file.is_file():
            all_ok = step(f"workflow {key}", False, f"missing {wf_file}") and all_ok
            continue
        problems = check_workflow(key, json.loads(wf_file.read_text(encoding="utf-8")), info)
        for p in problems:
            log("   " + p)
        all_ok = step(f"workflow {key} nodes + models", not problems, f"{len(problems)} problem(s)" if problems else "") and all_ok
    if args.check_only:
        return finish()

    # 3. real generation, in a new test folder only
    test_dir = ROOT / "projects" / f"_real_test_{time.strftime('%Y%m%d_%H%M%S')}"
    out = test_dir / "media" / "T001"
    out.mkdir(parents=True, exist_ok=True)
    log(f"\nTest folder: {test_dir}")
    runner = ProductionRunner(ROOT, cfg, log=log)
    prompt = ("A quiet Thai riverside village at sunrise, wooden houses on stilts, mist over the water, "
              "a small boat, soft warm light, editorial illustration")
    prompt = runner._sanitize_image_prompt(prompt)
    negative = runner._sanitize_negative_prompt("blurry, low quality")

    img = None
    t0 = time.time()
    try:
        img = runner.z_image(prompt, "T001", "short", out)
        step("Z-Image (text → image)", img.is_file(), f"{img.name} in {time.time() - t0:.0f}s · {ffprobe(img)}")
    except Exception as e:
        step("Z-Image (text → image)", False, str(e))
        log(traceback.format_exc())

    if img:
        t0 = time.time()
        try:
            edit = runner.qwen_edit("Same scene, a red paper lantern hanging on the nearest house. " + prompt,
                                    negative, img, "T001", "short", out)
            step("Qwen edit (image → image)", edit.is_file(), f"{edit.name} in {time.time() - t0:.0f}s · {ffprobe(edit)}")
        except Exception as e:
            step("Qwen edit (image → image)", False, str(e))
            log(traceback.format_exc())

    if img and not args.no_video:
        t0 = time.time()
        try:
            vid = runner.ltx_i2v("Slow push-in, mist drifting over the water, the boat rocks gently.",
                                 negative, img, "T001", "short", 2, out)
            probe = ffprobe(vid)
            step("LTX video (image → video)", vid.is_file() and "codec_type=video" in probe,
                 f"{vid.name} in {time.time() - t0:.0f}s · {probe}")
        except Exception as e:
            step("LTX video (image → video)", False, str(e))
            log(traceback.format_exc())
    return finish()


def finish() -> int:
    fails = [k for k, v in RESULTS.items() if v == "FAIL"]
    log("\nSUMMARY: " + ("ALL PASS" if not fails else f"{len(fails)} FAIL: " + ", ".join(fails)))
    (ROOT / "real_test_report.txt").write_text("\n".join(REPORT) + "\n", encoding="utf-8")
    print(f"\nReport: {ROOT / 'real_test_report.txt'}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
