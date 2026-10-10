// tools/lib/polish.mjs: the AUTO-POLISH pass of the plan compiler, and the automatic sound cues.
//
// polishManifest(M, ctx) runs on the manifest BEFORE validation and only ADDS what a professional editor would never
// leave out; anything the director wrote explicitly is kept as written:
//   - every collage cut-out without a move gets an entrance (backdrops and page-wide ground strips stay as the set) (the subject is placed, the rest pop / drop / swing in),
//     staggered so nothing arrives together; a collage shot without a camera gets a slow push (in and out alternate);
//     scene boil (the stop-motion life on held frames) when none is set;
//   - between two collage shots with no transition, a transition (varied: push, slide, whip, tear);
//   - a karaoke subtitle (type.subtitle) from the shot's narration, unless the shot already has one or `subtitles: false`.
// Each addition uses a capability only when the catalog says it may (verified, or --allow-experimental). Every change
// is listed in the compile report (polish). Turn it off with "polish": false in the manifest.
//
// sfxCues(compiled, ctx) reads the compiled plan and places sound effects where the picture moves: entrances (pop,
// paper, impact), transitions (whoosh), titles and counters (tick, ding), infographics. Files come from
// assets/sfx/<category>/*.wav (python tools/make_sfx.py makes a starter pack; your own .wav files join it). Cues are
// relative to their shot ({ beat: shotId, offset }) so tools/pipeline.mjs places them where the shot really starts.
import { existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const pick = (list, key) => list[parseInt(createHash('md5').update(String(key)).digest('hex').slice(0, 8), 16) % list.length];
const r2 = x => +x.toFixed(2);
const CONTINUOUS = new Set(['sway', 'float', 'walk', 'fly', 'orbit', 'pulse', 'cycle', 'flutter', 'roll', 'swing', 'spin']);
const ENTRANCES = new Set(['place', 'pop', 'wipe', 'drop', 'slam', 'appear', 'fly', 'flutter', 'swing', 'roll', 'walk', 'follow']);

export function polishManifest(M, { CAPS, allowExp, aspect }) {
  const changes = [];
  if (M.polish === false) return changes;
  const ok = id => CAPS[id] && (CAPS[id].status === 'verified' || allowExp) && (!CAPS[id].aspects.length || CAPS[id].aspects.includes(aspect));
  const [w] = [1080], TRANS = ['push', 'slide', 'whip', 'tear'];
  M.shots.forEach((s, i) => {
    const len = (s.end ?? 0) - (s.start ?? 0); if (!(len > 0)) return;
    if (s.treatment === 'collage') {
      const C = s.collage = s.collage || {};
      // no camera: a slow push on the page centre (the same world point in every format), in and out alternating
      if (!C.camera) { const z = i % 2 ? [1.06, 1] : [1, 1.06]; C.camera = [[0, 540, 960, z[0], 'ease'], [r2(len), 540, 960, z[1], 'ease']]; changes.push(`${s.id}: camera slow push ${z[0]} → ${z[1]}`); }
      if (C.boil === undefined) { C.boil = { amp: 1.2, rot: .3, rate: 12 }; changes.push(`${s.id}: stop-motion boil on held frames`); }
      let j = 0;
      for (const L of s.layers || []) {
        if (L.cap !== 'collage.layer') continue;
        const P = L.params || {};
        // backdrops, ground strips (as wide as the page) and doodles are the set, there from the first frame
        if (P.fill || P.doodle || (Array.isArray(P.size) && (P.size[0] ?? 0) >= w * .8)) continue;
        const kinds = (L.motion || []).map(m => String(m.cap || '').replace(/^collage\./, ''));
        if (!kinds.some(k => ENTRANCES.has(k))) {
          const kind = P.subject ? 'place' : pick(['pop', 'pop', 'drop', 'place'], s.id + L.id);
          if (ok('collage.' + kind)) {
            const at = r2(Math.min(len * .5, .05 + j++ * .18));   // the first one right away: no empty page after a cut
            (L.motion = L.motion || []).unshift({ cap: 'collage.' + kind, params: { at } });
            changes.push(`${s.id}.${L.id}: entrance ${kind} at ${at} s`);
          }
        }
        if (P.subject && !kinds.some(k => CONTINUOUS.has(k)) && ok('collage.pulse')) {
          L.motion.push({ cap: 'collage.pulse', params: { at: r2(Math.min(len * .6, 1.2)), amp: .015, hz: .5 } });
          changes.push(`${s.id}.${L.id}: a gentle breathing pulse on the subject`);
        }
      }
      const prev = M.shots[i - 1];
      if (i && prev?.treatment === 'collage' && s.transition_in == null) {
        const kind = TRANS[i % TRANS.length];
        if (ok('transition.' + kind)) { s.transition_in = { cap: 'transition.' + kind, params: { dur: kind === 'whip' ? .45 : .6 } }; changes.push(`${s.id}: transition ${kind}`); }
      }
    }
    // no subtitle when the shot already shows its narration as text (a kinetic-type shot of the same words)
    const norm = x => String(x ?? '').replace(/\s+/g, ''), said = norm(s.narration);
    const hasSub = (s.layers || []).some(L => L.cap === 'type.subtitle' || (L.cap?.startsWith('type.') && said && norm(L.params?.text) === said));
    if (M.subtitles !== false && s.subtitles !== false && s.narration && !hasSub && ok('type.subtitle')) {
      (s.layers = s.layers || []).push({ id: 'subtitle', cap: 'type.subtitle', params: { text: String(s.narration), at: 0, end: r2(Math.max(.5, len - .15)) } });
      changes.push(`${s.id}: karaoke subtitle from the narration`);
    }
  });
  return changes;
}

const SFX_OF_MOTION = { place: 'paper', pop: 'pop', drop: 'impact', slam: 'impact', wipe: 'paper', peel: 'paper', appear: 'pop', vanish: 'pop', swing: 'whoosh', fly: 'whoosh', leave: 'whoosh', flutter: 'paper', shake: 'impact' };
const SFX_OF_TRANS = { push: 'whoosh', slide: 'paper', whip: 'whoosh', tear: 'paper', iris: 'whoosh', fade: null, cut: null };
const SFX_OF_PRESET = { popBounce: 'pop', particleBurst: 'ding', objectReveal: 'whoosh', brushWipe: 'whoosh', barChart: 'tick', lineChart: 'riser', donutChart: 'tick', timeline: 'tick', iconGrid: 'pop', callout: 'pop', captionBar: 'paper' };
const SFX_OF_ACTOR = { jump: 'whoosh', hop: 'pop', fly: 'whoosh', shake: 'impact', spin: 'whoosh', exit: 'whoosh', turn: 'paper' };
const SFX_OF_TYPE = { impact: 'impact', stamp: 'impact', counter: 'tick', pop: 'pop', slide: 'whoosh', cutout: 'paper', reveal: 'whoosh' };
const GAIN = { whoosh: .5, pop: .45, paper: .55, tick: .35, impact: .55, riser: .4, ding: .35, type: .3 };

export function sfxCues(compiled, { dir = 'assets/sfx', minGap = .22, perShot = 5, off = false } = {}) {
  const warnings = [], files = {};
  if (off) return { cues: [], warnings };
  const lib = cat => files[cat] ??= existsSync(`${dir}/${cat}`) ? readdirSync(`${dir}/${cat}`).filter(f => /\.wav$/i.test(f)).sort().map(f => `${dir}/${cat}/${f}`) : [];
  const cues = [], missing = new Set();
  for (const s of compiled) {
    const want = [];   // [offset, category, why]
    if (s.collage) {
      const C = s.collage;
      if (C.transition && SFX_OF_TRANS[C.transition.kind]) want.push([0, SFX_OF_TRANS[C.transition.kind], 'transition ' + C.transition.kind]);
      for (const L of C.layers || []) for (const m of L.motion || []) if (SFX_OF_MOTION[m.kind] && typeof (m.at ?? 0) === 'number') want.push([m.at ?? 0, SFX_OF_MOTION[m.kind], `${L.id} ${m.kind}`]);
      for (const T of C.type || []) if (SFX_OF_TYPE[T.preset]) want.push([T.at ?? 0, SFX_OF_TYPE[T.preset], `title ${T.preset}`]);
    } else {
      for (const L of s.layers || []) {
        const name = L.cap.startsWith('type.') ? null : L.cap, at = typeof L.params?.at === 'number' ? L.params.at : 0;
        if (name && SFX_OF_PRESET[name]) want.push([at, SFX_OF_PRESET[name], name]);
        if (name === 'iconActor') for (const m of L.params?.moves || []) {   // an actor's moves: each lands on its own sound
          const cat = m.do === 'enter' ? { drop: 'impact', slide: 'whoosh' }[m.style] || 'pop' : SFX_OF_ACTOR[m.do];
          if (cat) want.push([(m.at ?? 0) + (m.style === 'drop' && m.do === 'enter' ? (m.dur ?? .6) : m.do === 'jump' || m.do === 'hop' ? .05 : 0), cat, `${L.id} ${m.do}`]);   // a drop sounds when it lands
        }
        if (L.cap.startsWith('type.') && SFX_OF_TYPE[L.cap.slice(5)]) want.push([at, SFX_OF_TYPE[L.cap.slice(5)], L.cap]);
      }
    }
    want.sort((a, b) => a[0] - b[0]);
    let lastAt = -1, n = 0;
    for (const [at, cat, why] of want) {
      if (n >= perShot || at - lastAt < minGap || at > s.end - s.start) continue;   // never a pile-up of sounds
      const L = lib(cat); if (!L.length) { missing.add(cat); continue; }
      cues.push({ beat: s.id, offset: r2(at), file: pick(L, s.id + why), gain: GAIN[cat] ?? .4, why, category: cat });
      lastAt = at; n++;
    }
  }
  if (missing.size) warnings.push(`no SFX files for ${[...missing].join(', ')} in ${dir}/ (python tools/make_sfx.py makes a starter pack)`);
  return { cues, warnings };
}
