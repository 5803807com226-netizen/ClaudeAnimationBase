// tools/motion_check.mjs: does a rendered clip actually MOVE? (render success ≠ motion). ffmpeg samples the clip as small
// grey frames (area-averaged to ~16 px wide, so p5.brush line boil and grain average out and only STRUCTURAL movement
// counts); for each pair of neighbouring samples we measure the fraction of pixels that changed noticeably.
//   node tools/motion_check.mjs --in=clip.mp4 [--fps=4] [--min=0.01] [--still] [--windows=0:3,3:7] [--json=report.json]
//   node tools/motion_check.mjs --sheet=strip.jpg --cols=6 --frames=N --fps=F [--start=a]   a render.mjs --strip sheet
//        (cloud: no video needed; each cell is a frame, the time label in its corner is masked out)
//   --min      a window passes when its mean changed fraction ≥ min (default 0.01 = 1 % of the frame per sample step)
//   --still    the shot is an INTENTIONAL still: it passes when nothing moves (distinguishes stillness from a failure)
//   --windows  check spans separately (seconds a:b, comma separated), e.g. one per shot of an assembled film
// Exit code 1 when any window fails. Fades and cuts count as change, so check shots, not just the whole film.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
if (!args.in && !args.sheet) { console.error('usage: node tools/motion_check.mjs --in=clip.mp4 [--fps=4] [--min=0.01] [--still] [--windows=a:b,…]'); process.exit(2); }

function sampleMotion(file, fps = 4, w = 16) {
  const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  if (probe.status) throw new Error(`ffprobe failed: ${probe.stderr.trim()}`);
  const [sw, sh] = probe.stdout.trim().split(',').map(Number), h = Math.max(2, Math.round(sh / sw * w / 2) * 2);
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `fps=${fps},scale=${w}:${h}:flags=area,format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });
  if (r.status) throw new Error(`ffmpeg failed: ${r.stderr.toString().trim()}`);
  const n = w * h, frames = Math.floor(r.stdout.length / n), steps = [];
  for (let i = 1; i < frames; i++) {
    let c = 0; const a = (i - 1) * n, b = i * n;
    for (let p = 0; p < n; p++) if (Math.abs(r.stdout[a + p] - r.stdout[b + p]) > 6) c++;
    steps.push({ t: +(i / fps).toFixed(3), changed: +(c / n).toFixed(4) });
  }
  return { size: [sw, sh], frames, steps };
}

// A --strip / --sheet image from render.mjs: cols × rows cells of w × h (no gaps), a time label in each top-left corner.
function sampleSheet(file, cols, n, fps, w = 16) {
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  const [SW, SH] = probe.stdout.trim().split(',').map(Number), rows = Math.ceil(n / cols), cw = SW / cols, ch = SH / rows;
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', 'format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });
  if (r.status) throw new Error(`ffmpeg failed: ${r.stderr.toString().trim()}`);
  const h = Math.max(2, Math.round(ch / cw * w)), grids = [];
  for (let i = 0; i < n; i++) {   // area-average each cell to w × h, skipping the 26 px label band at its top
    const x0 = (i % cols) * cw, y0 = Math.floor(i / cols) * ch, g = new Float64Array(w * h), c = new Float64Array(w * h);
    for (let y = Math.ceil(y0 + 26); y < y0 + ch; y++) for (let x = Math.ceil(x0); x < x0 + cw; x++) {
      const k = Math.min(h - 1, Math.floor((y - y0) / ch * h)) * w + Math.min(w - 1, Math.floor((x - x0) / cw * w)); g[k] += r.stdout[y * SW + x]; c[k]++;
    }
    grids.push(g.map((v, k) => c[k] ? v / c[k] : 0));
  }
  const steps = [];
  for (let i = 1; i < n; i++) { let d = 0; for (let k = 0; k < w * h; k++) if (Math.abs(grids[i][k] - grids[i - 1][k]) > 6) d++; steps.push({ t: +(+(args.start || 0) + i / fps).toFixed(3), changed: +(d / (w * h)).toFixed(4) }); }
  return { size: [Math.round(cw), Math.round(ch)], frames: n, steps };
}

const fps = +(args.fps || 4), min = +(args.min ?? 0.01), still = !!args.still;
const { size, frames, steps } = args.sheet ? sampleSheet(args.sheet, +(args.cols || 6), +args.frames, fps) : sampleMotion(args.in, fps);
const t0 = +(args.start || 0), dur = t0 + frames / fps, wins = (args.windows ? String(args.windows).split(',') : [`${t0}:${dur}`]).map(s => s.split(':').map(Number));
const results = wins.map(([a, b]) => {
  const s = steps.filter(x => x.t > a && x.t <= b), mean = s.length ? s.reduce((q, x) => q + x.changed, 0) / s.length : 0;
  const moving = s.filter(x => x.changed >= min).length / Math.max(1, s.length);
  let run = 0, longest = 0; for (const x of s) { run = x.changed < min ? run + 1 : 0; longest = Math.max(longest, run); }
  // fewer than 3 sample steps (a clip shorter than ~0.75 s at 4 fps) cannot show motion either way: inconclusive, not FAIL
  const pass = s.length < 3 ? null : still ? mean < min : mean >= min;
  return { window: [a, b], samples: s.length, mean_changed: +mean.toFixed(4), moving_frac: +moving.toFixed(3),
    longest_static_s: +(longest / fps).toFixed(2), expect: still ? 'still' : 'motion', pass };
});
const report = { file: args.in || args.sheet, size, fps, min, results, pass: results.every(r => r.pass !== false), inconclusive: results.some(r => r.pass === null) };
for (const r of results) console.log(`${r.pass === null ? 'TOO SHORT' : r.pass ? 'PASS' : 'FAIL'}  ${r.window[0]}–${r.window[1]} s  mean changed ${(r.mean_changed * 100).toFixed(2)} %  moving samples ${(r.moving_frac * 100).toFixed(0)} %  longest static ${r.longest_static_s} s  (expect ${r.expect})`);
if (args.json) writeFileSync(args.json, JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 1);
