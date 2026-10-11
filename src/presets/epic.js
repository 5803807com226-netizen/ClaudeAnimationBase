// presets/epic.js: the "from the birth of the Earth to AI" foundation kit, and action effects.
//   blastFx      the shared explosion (flash, fireball, shock ring, sparks, smoke): drawn by mapBlast, blast, mapDogfight
//   mapBlast     explosions at a sourced place (one or several hits), with a light flash and a camera shake
//   blast        the same explosion on screen (over a collage or any scene), with a frame flash
//   mapDogfight  aircraft (artwork) circle and chase over a sourced place: smoke trails, tracer bursts, a shot-down spiral
//   mapFlow      a broad tapered arrow of spread / migration (people, a faith, farming, an idea) with flowing texture
//   mapEmpire    a territory through dated steps (grows, shrinks), each step an area set with its label
//   eraTicker    a persistent era readout: "4,600 ล้านปีก่อน" → "ค.ศ. 1945", counting in log time between keys
//   deepTimeline a time ruler of eras (log or linear) whose window zooms, with a "now / here" marker
//   barRace      a bar-chart race over years from a sourced table
// Effects (light, smoke, sparks, tracers) are drawn because they are motion; aircraft and people are always artwork.

const TAU2 = Math.PI * 2;
const epRand = (i, k) => { const v = Math.sin(i * 127.1 + k * 311.7 + 17.3) * 43758.5453; return v - Math.floor(v); };

// one explosion at (x, y), radius R px, s seconds after it goes off (seed varies the shape). Returns false when over.
function blastFx(c, x, y, R, s, seed = 1, o = {}) {
  const life = o.life ?? 2.6; if (s < 0 || s > life) return false;
  const hot = o.color || '#FFB347', smoke = o.smoke || '#4E4A47';
  c.save();
  // smoke first (under the fire): puffs that rise, grow and thin out
  for (let i = 0; i < 9; i++) {
    const d = .08 + epRand(seed, i) * .25, ss = s - d; if (ss <= 0) continue;
    const k = clamp(ss / (life - d)), r = R * (.25 + .55 * Math.sqrt(k)) * (.7 + epRand(seed, i + 20) * .6);
    const px = x + (epRand(seed, i + 40) - .5) * R * .9 + Math.sin(ss * 1.3 + i) * R * .08, py = y - R * (.1 + 1.1 * k) * (.6 + epRand(seed, i + 60) * .6);
    c.globalAlpha = (1 - k) * .55 * clamp(ss / .25); c.fillStyle = smoke; c.beginPath(); c.arc(px, py, r, 0, TAU2); c.fill();
  }
  c.globalCompositeOperation = 'lighter';
  // the flash: a hot core that blooms and dies fast
  if (s < .35) { const f = s / .35, r = R * (.5 + 1.4 * f), g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,252,235,${1 - f})`); g.addColorStop(.35, `rgba(255,200,110,${.85 * (1 - f)})`); g.addColorStop(1, 'rgba(255,120,40,0)');
    c.globalAlpha = 1; c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU2); c.fill(); }
  // the fireball: overlapping hot blobs that swell, then cool to red and fade
  if (s < 1.1) for (let i = 0; i < 6; i++) {
    const k = clamp(s / 1.1), a = epRand(seed, i + 80) * TAU2, dd = R * .35 * epRand(seed, i + 90) * Math.sqrt(k), r = R * (.25 + .45 * Math.sqrt(k)) * (.7 + epRand(seed, i + 100) * .5);
    const px = x + Math.cos(a) * dd, py = y + Math.sin(a) * dd - R * .25 * k, g = c.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, k < .3 ? 'rgba(255,240,190,.9)' : 'rgba(255,170,70,.75)'); g.addColorStop(.6, hot); g.addColorStop(1, 'rgba(200,40,10,0)');
    c.globalAlpha = (1 - k) * .8; c.fillStyle = g; c.beginPath(); c.arc(px, py, r, 0, TAU2); c.fill();
  }
  // sparks: hot streaks flung out on ballistic paths
  const n = o.sparks ?? 26;
  for (let i = 0; i < n; i++) {
    const a = epRand(seed, i + 200) * TAU2, v = R * (2.2 + 2.8 * epRand(seed, i + 300)), ss = Math.min(s, .9), g = R * 2.4;
    const px = x + Math.cos(a) * v * ss, py = y + Math.sin(a) * v * ss * .8 + g * ss * ss, qx = x + Math.cos(a) * v * Math.max(0, ss - .05), qy = y + Math.sin(a) * v * Math.max(0, ss - .05) * .8 + g * Math.max(0, ss - .05) ** 2;
    c.globalAlpha = clamp(1 - s / .9); c.strokeStyle = epRand(seed, i + 400) < .5 ? '#FFE9A8' : '#FF9A3C'; c.lineWidth = Math.max(1, R * .03); c.beginPath(); c.moveTo(qx, qy); c.lineTo(px, py); c.stroke();
  }
  c.globalCompositeOperation = 'source-over';
  // the shock ring
  if (s < .6) { const f = s / .6; c.globalAlpha = (1 - f) * .85; c.strokeStyle = '#FFF4DC'; c.lineWidth = Math.max(1.5, R * .06 * (1 - f)); c.beginPath(); c.ellipse(x, y, R * (.4 + 2.6 * f), R * (.3 + 1.6 * f), 0, 0, TAU2); c.stroke(); }
  c.restore();
  return true;
}
// a warm light over the whole frame right after a blast (light reaching the land / the camera)
function blastFlash(c, s, amt = .45, x = W / 2, y = H / 2) {
  if (s < 0 || s > .5 || amt <= 0) return; const f = s / .5, g = c.createRadialGradient(x, y, 0, x, y, Math.hypot(W, H) * .7);
  g.addColorStop(0, `rgba(255,236,190,${amt * (1 - f)})`); g.addColorStop(1, `rgba(255,170,90,${amt * .35 * (1 - f)})`);
  c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = g; c.fillRect(0, 0, W, H); c.restore();
}
// a camera shake for the map frame (mapView applies the largest request of the frame)
const mapShake = amt => { if (typeof MAP !== 'undefined') MAP.shake = Math.max(MAP.shake || 0, amt); };
const shakeAfter = (s, amp, dur = .7) => s < 0 || s > dur ? 0 : amp * (1 - s / dur) ** 2;

definePreset('mapBlast', {
  label: 'Map Blast', about: 'explosions at a sourced place (a battle, a bombing, an eruption, a meteor strike): flash, fireball, shock ring, sparks, rising smoke; hits: offsets in seconds for several blasts (spread around the place); a warm light flash over the frame and a camera shake',
  meta: { version: '1.0.0', category: 'map', tags: ['map', 'explosion', 'blast', 'bomb', 'battle', 'war', 'impact', 'meteor', 'volcano', 'fire', 'smoke', 'shake'],
    params: { radius: { min: 10, max: 400 }, shake: { min: 0, max: 40 }, flash: { min: 0, max: 1 } }, layers: ['overlay'] },
  defaults: { lonlat: [0, 0], hits: [0], spread: 60, radius: 70, shake: 14, flash: .4, color: '#FFB347', smoke: '#4E4A47', seed: 3, dur: .1 },
  run(t, o) {
    if (!mapVisible(o.lonlat)) return; const p = mapPt(o.lonlat); if (!p) return;
    const c = mapCtx(), u = US();
    o.hits.forEach((h, i) => {
      const s = t - o.at - h, x = p[0] + (i ? (epRand(o.seed, i) - .5) * 2 * o.spread * u : 0), y = p[1] + (i ? (epRand(o.seed, i + 9) - .5) * o.spread * u : 0);
      if (blastFx(c, x, y, o.radius * u, s, o.seed * 31 + i, o)) { blastFlash(c, s, o.flash, x, y); mapShake(shakeAfter(s, o.shake * u)); }
    });
  },
});

definePreset('blast', {
  label: 'Blast', about: 'an explosion on screen at (x, y) as fractions of the frame (over a collage, a scene, a title): flash, fireball, shock ring, sparks, smoke; hits: offsets for several; a warm flash over the frame',
  meta: { version: '1.0.0', category: 'fx', tags: ['explosion', 'blast', 'bomb', 'boom', 'impact', 'fire', 'smoke', 'sparks', 'flash'], camera: 'screen', layers: ['screen'],
    params: { radius: { min: 20, max: 600 }, flash: { min: 0, max: 1 } } },
  defaults: { x: .5, y: .55, hits: [0], spread: .12, radius: 160, flash: .45, color: '#FFB347', smoke: '#4E4A47', seed: 5, dur: .1 },
  run(t, o) {
    const { g, c } = stkCtx(o, 'blast'), u = US(); let any = false;
    o.hits.forEach((h, i) => { const s = t - o.at - h, x = (o.x + (i ? (epRand(o.seed, i) - .5) * 2 * o.spread : 0)) * W, y = (o.y + (i ? (epRand(o.seed, i + 9) - .5) * o.spread : 0)) * H;
      if (blastFx(c, x, y, o.radius * u, s, o.seed * 31 + i, o)) { blastFlash(c, s, o.flash, x, y); any = true; } });
    if (any) stkBlit(g);
  },
  demo: { bg: '#2B2F3A', after: [['blast', { at: .3, hits: [0, .35, .7] }]] },
});

// ---------------------------------------------------------------- dogfight
definePreset('mapDogfight', {
  label: 'Map Dogfight', about: 'aircraft (artwork items, side view facing right) circle and chase over a sourced place (radius in km, or px: the loop size on screen, for a close shot): the chaser fires tracer bursts with muzzle flashes, both leave smoke trails and shadows on the ground; down: {at} sends the chased plane spinning down in black smoke to a blast with a camera shake. Illustrative manoeuvre, not a recorded flight path',
  meta: { version: '1.0.0', category: 'map', tags: ['map', 'dogfight', 'aircraft', 'plane', 'fighter', 'air battle', 'war', 'tracer', 'gunfire', 'chase', 'shot down', 'smoke'],
    params: { radius: { min: 5, max: 600 }, laps: { min: .25, max: 6 }, shape: { enum: ['circle', 'eight'] }, width: { min: 30, max: 300 } }, layers: ['overlay'] },
  defaults: { lonlat: [0, 0], image: '', art: null, imageB: '', artB: null, radius: 60, px: null, laps: 1.5, shape: 'eight', width: 120, gap: .55, altitude: 70,
    trailA: '#E8E2D6', trailB: '#E8E2D6', bursts: [[.8, 1.4], [2.2, 2.9]], down: null, fall: 1.5, tracer: '#FFE36B', out: null, outDur: .4, dur: 5 },
  run(t, o) {
    const q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1; if (q <= 0 || t < o.at || !mapVisible(o.lonlat)) return;
    const c = mapCtx(), u = US(), P = mapPt(o.lonlat); if (!P) return;
    const N = mapPt([o.lonlat[0], o.lonlat[1] + o.radius / 111.2]);   // radius km to the north (111.2 km per degree of latitude)
    const R = o.px ? o.px * u : Math.max(30 * u, N ? Math.abs(P[1] - N[1]) : 120 * u), wd = o.width * u, alt = o.altitude * u;
    const w = TAU2 * o.laps / o.dur, path = ph => o.shape === 'eight' ? [P[0] + R * 1.25 * Math.sin(ph), P[1] + R * .75 * Math.sin(ph) * Math.cos(ph)] : [P[0] + R * Math.cos(ph), P[1] + R * .7 * Math.sin(ph)];
    const downAt = o.down ? o.at + o.down.at : Infinity;
    // where each plane is at time tt (plane 1 = chased, 0 = chaser a little behind); the chased plane leaves the loop when hit
    const pos = (i, tt) => {
      const s = tt - o.at, ph = w * s - (i ? 0 : o.gap);
      if (i === 1 && tt > downAt) {   // spinning down: carry on along the last heading, curling and dropping
        const s0 = downAt - o.at, a = path(w * s0), b = path(w * s0 + .01), hd = Math.atan2(b[1] - a[1], b[0] - a[0]), f = clamp((tt - downAt) / o.fall);
        const curl = hd + f * 3.2, d = R * .9 * f;
        return { p: [a[0] + Math.cos(hd) * d + Math.cos(curl) * R * .12 * f, a[1] + Math.sin(hd) * d + Math.sin(curl) * R * .12 * f + alt * f], hd: curl + Math.PI / 2 * f, f };
      }
      const a = path(ph), b = path(ph + .01); return { p: a, hd: Math.atan2(b[1] - a[1], b[0] - a[0]), f: 0 };
    };
    c.save(); c.globalAlpha = q; c.lineCap = 'round';
    // smoke trails (and the black smoke of the falling plane)
    for (const i of [0, 1]) {
      const pts = []; for (let k = 0; k < 18; k++) { const tt = t - k * .045; if (tt < o.at) break; pts.push(pos(i, tt)); }
      for (let k = 1; k < pts.length; k++) {
        const black = i === 1 && pts[k].f > 0, a = (1 - k / pts.length) * (black ? .8 : .45);
        c.globalAlpha = q * a; c.strokeStyle = black ? '#1E1C1C' : (i ? o.trailB : o.trailA); c.lineWidth = (black ? 10 + k * 1.2 : 3 + k * .35) * u;
        c.beginPath(); c.moveTo(...pts[k - 1].p); c.lineTo(...pts[k].p); c.stroke();
      }
    }
    // tracers: during a burst the chaser fires short bright dashes at where the target is
    const firing = o.bursts.some(([a, b]) => t - o.at >= a && t - o.at <= b && t < downAt + .1);
    c.globalCompositeOperation = 'lighter';
    for (const [a, b] of o.bursts) for (let ts = o.at + a; ts <= Math.min(o.at + b, downAt); ts += .07) {
      const age = t - ts; if (age < 0 || age > .22) continue;
      const from = pos(0, ts), to = pos(1, ts + .2), f = age / .22, nose = [from.p[0] + Math.cos(from.hd) * wd * .5, from.p[1] + Math.sin(from.hd) * wd * .5];
      const x = lerp(nose[0], to.p[0], f), y = lerp(nose[1], to.p[1], f), bx = lerp(nose[0], to.p[0], Math.max(0, f - .18)), by = lerp(nose[1], to.p[1], Math.max(0, f - .18));
      c.globalAlpha = q * (1 - f * .5); c.strokeStyle = o.tracer; c.lineWidth = 3 * u; c.shadowColor = o.tracer; c.shadowBlur = 10 * u; c.beginPath(); c.moveTo(bx, by); c.lineTo(x, y); c.stroke();
      if (f > .85) { c.fillStyle = '#FFF2C0'; c.beginPath(); c.arc(to.p[0] + (epRand(ts * 100, 1) - .5) * wd * .3, to.p[1] + (epRand(ts * 100, 2) - .5) * wd * .2, 4 * u, 0, TAU2); c.fill(); }   // hit sparks
    }
    c.shadowBlur = 0; c.globalCompositeOperation = 'source-over';
    // the planes: a shadow on the ground, then the artwork turned to its heading (never upside down)
    for (const i of [0, 1]) {
      const im = STICKER_IMG[artPath(i ? o.imageB || o.image : o.image)], S = pos(i, t); if (!im) continue;
      if (i === 1 && S.f >= 1) continue;
      const sc = i === 1 ? 1 - S.f * .45 : 1, hgt = wd * im.height / im.width, flip = Math.cos(S.hd) < 0 ? -1 : 1;
      c.save(); c.globalAlpha = q * .28 * (1 - S.f); c.fillStyle = '#000'; c.beginPath(); c.ellipse(S.p[0], S.p[1] + alt * (1 - S.f), wd * .42 * sc, hgt * .22 * sc, S.hd, 0, TAU2); c.fill(); c.restore();
      c.save(); c.globalAlpha = q; c.translate(...S.p); c.rotate(S.hd); c.scale(sc, sc * flip);
      if (i === 0 && firing && Math.floor(t * 24) % 2 === 0) { c.save(); c.globalCompositeOperation = 'lighter'; const g2 = c.createRadialGradient(wd * .52, 0, 0, wd * .52, 0, wd * .18); g2.addColorStop(0, 'rgba(255,240,180,1)'); g2.addColorStop(1, 'rgba(255,160,60,0)'); c.fillStyle = g2; c.beginPath(); c.arc(wd * .52, 0, wd * .18, 0, TAU2); c.fill(); c.restore(); }
      c.drawImage(im.canvas || im.elt, -wd / 2, -hgt / 2, wd, hgt); c.restore();
    }
    c.restore();
    // the crash: a blast where the falling plane meets the ground
    if (o.down) { const s = t - downAt - o.fall; if (s >= 0) { const E = pos(1, downAt + o.fall - .001); if (blastFx(c, E.p[0], E.p[1], wd * .55, s, 77, {})) { blastFlash(c, s, .3, E.p[0], E.p[1]); mapShake(shakeAfter(s, 12 * u)); } } }
  },
});

// ---------------------------------------------------------------- spread / migration
definePreset('mapFlow', {
  label: 'Map Flow', about: 'a broad tapered arrow of spread along sourced coords (a migration, a faith, farming, an idea, a trade): it grows from its origin with a flowing texture inside and a soft glow, the head carries an optional label (a date, a people); several layers make a branching spread',
  meta: { version: '1.0.0', category: 'map', tags: ['map', 'flow', 'spread', 'migration', 'diffusion', 'religion', 'expansion', 'arrow', 'out of africa', 'trade', 'idea'],
    params: { width: { min: 4, max: 120 } }, assets: [{ param: 'coords', type: 'route' }], layers: ['overlay'] },
  defaults: { coords: [[0, 0], [10, 10]], color: '#FF8A3D', width: 34, taper: .35, text: '', size: 42, glow: 18, speed: 1, out: null, outDur: .5, ease: 'ease', dur: 2.4 },
  run(t, o) {
    const q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1, e = presetK(t, o); if (q <= 0 || e <= 0) return;
    const c = mapCtx(), u = US(), R = routeOf(o.coords), xy = R.P.map(mapPt); if (xy.some(p => !p)) return;
    const S = [0]; for (let i = 1; i < xy.length; i++) S.push(S[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]));
    const L = S.at(-1) * e; if (L < 2) return;
    const at = d => { let i = 1; while (i < S.length - 1 && S[i] < d) i++; const f = (d - S[i - 1]) / ((S[i] - S[i - 1]) || 1); return [lerp(xy[i - 1][0], xy[i][0], f), lerp(xy[i - 1][1], xy[i][1], f)]; };
    const n = Math.max(8, Math.ceil(L / (6 * u))), mid = [], left = [], right = [];
    for (let k = 0; k <= n; k++) { const d = L * k / n, p = at(d), p2 = at(Math.min(L, d + 2)), p1 = at(Math.max(0, d - 2)), a = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
      const wv = o.width * u * (o.taper + (1 - o.taper) * (1 - Math.abs(k / n - .55) * 1.1)) * Math.min(1, (L - d) / (o.width * u * 1.4) + .25);
      mid.push(p); left.push([p[0] + Math.cos(a - Math.PI / 2) * wv / 2, p[1] + Math.sin(a - Math.PI / 2) * wv / 2]); right.push([p[0] + Math.cos(a + Math.PI / 2) * wv / 2, p[1] + Math.sin(a + Math.PI / 2) * wv / 2]); }
    const end = mid.at(-1), prev = at(Math.max(0, L - 6 * u)), ha = Math.atan2(end[1] - prev[1], end[0] - prev[0]), hw = o.width * u * 1.15;
    c.save(); c.globalAlpha = q;
    c.beginPath(); left.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p));
    c.lineTo(end[0] + Math.cos(ha - Math.PI / 2) * hw * .7, end[1] + Math.sin(ha - Math.PI / 2) * hw * .7); c.lineTo(end[0] + Math.cos(ha) * hw, end[1] + Math.sin(ha) * hw);
    c.lineTo(end[0] + Math.cos(ha + Math.PI / 2) * hw * .7, end[1] + Math.sin(ha + Math.PI / 2) * hw * .7); [...right].reverse().forEach(p => c.lineTo(...p)); c.closePath();
    c.shadowColor = o.color; c.shadowBlur = o.glow * u; c.fillStyle = o.color; c.globalAlpha = q * .78; c.fill(); c.shadowBlur = 0;
    c.clip(); c.globalAlpha = q * .35; c.strokeStyle = '#FFFFFF'; c.lineWidth = 3 * u; c.setLineDash([10 * u, 22 * u]); c.lineDashOffset = -(t - o.at) * 60 * u * o.speed;   // the flow inside
    c.beginPath(); mid.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.stroke();
    c.restore();
    if (o.text && e > .6) {
      const font = fontCss({ font: 'display', weight: 800, size: o.size }), px = o.size * TS(), a2 = clamp((e - .6) / .3) * q;
      c.save(); c.font = font; const tw = c.measureText(o.text).width, M = .04 * Math.min(W, H), x = clamp(end[0] + Math.cos(ha) * hw * 1.4 - tw / 2, M, W - M - tw), y = clamp(end[1] + Math.sin(ha) * hw * 1.4 - px * .2, M + px, H - M);
      c.globalAlpha = a2; c.fillStyle = 'rgba(16,16,22,.8)'; c.beginPath(); c.roundRect(x - px * .35, y - px * 1.0, tw + px * .7, px * 1.4, px * .3); c.fill(); c.fillStyle = '#FFFFFF'; c.fillText(o.text, x, y); c.restore();
      mapObstacle(x - px * .35, y - px, tw + px * .7, px * 1.4);
    }
  },
});

// ---------------------------------------------------------------- territory through time
definePreset('mapEmpire', {
  label: 'Map Empire', about: 'a territory through dated steps: steps [{at, units, label}] (units: countries / "<ISO3>/<province>" approximating the historical extent, from sourced data); each change cross-fades with a bright edge pulse, the step\'s label (a year, a ruler) shows in a tag',
  meta: { version: '1.0.0', category: 'map', tags: ['map', 'empire', 'kingdom', 'territory', 'expansion', 'decline', 'history', 'timeline', 'conquest', 'borders'],
    params: { alpha: { min: 0, max: 1 } }, assets: [{ param: 'units', type: 'geo' }], layers: ['overlay'] },
  defaults: { steps: [], color: '#E5484D', alpha: .5, blend: 'tint', fade: .6, edge: '#FFFFFF', x: .06, y: .18, size: 56, out: null, outDur: .5, dur: .1 },
  run(t, o) {
    const q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1; if (q <= 0 || !o.steps.length || t < o.at + o.steps[0].at) return;
    const c = mapCtx(), u = US(); let i = 0; while (i + 1 < o.steps.length && t >= o.at + o.steps[i + 1].at) i++;
    const cur = o.steps[i], f = clamp((t - o.at - cur.at) / o.fade), gs = mapUnits({ units: cur.units }, 'mapEmpire');
    if (i > 0 && f < 1) mapFill(c, mapUnits({ units: o.steps[i - 1].units }, 'mapEmpire'), o.color, o.alpha * q * (1 - f), o.blend, false, u);
    mapFill(c, gs, o.color, o.alpha * q * (i === 0 ? f : Math.max(f, 0)), o.blend, false, u);
    mapEdge(c, gs, 2.5 * u, o.edge, q * (f < 1 ? .6 + .4 * Math.sin(f * Math.PI) : .8), f < 1 ? 16 * u * Math.sin(f * Math.PI) : 0);
    if (cur.label) {
      const px = o.size * TS(); c.save(); c.font = fontCss({ font: 'display', weight: 800, size: o.size }); const tw = c.measureText(cur.label).width, x = o.x * W, y = o.y * H;
      c.globalAlpha = q * clamp((t - o.at - cur.at) / .25); c.fillStyle = o.color; c.beginPath(); c.roundRect(x - px * .35, y - px * 1.0, tw + px * .7, px * 1.4, px * .3); c.fill();
      c.fillStyle = '#FFFFFF'; c.fillText(cur.label, x, y); c.restore(); mapObstacle(x - px * .35, y - px, tw + px * .7, px * 1.4);
    }
  },
});

// ---------------------------------------------------------------- deep time
const NOW_CE = 2026;
// years ago → Thai readout. Big spans in ล้าน (million) years; recent history as a calendar year (ค.ศ. / พ.ศ.)
function eraText(ago, era = 'ce') {
  if (ago >= 1e6) { const m = ago / 1e6; return (m >= 100 ? fmtNum(m, 10) : m >= 10 ? fmtNum(m, 1) : m.toFixed(1).replace(/\.0$/, '')) + ' ล้านปีก่อน'; }
  if (ago >= 10000) return fmtNum(ago, ago >= 100000 ? 1000 : 100) + ' ปีก่อน';
  const y = Math.round(NOW_CE - ago);
  if (y <= 0) return fmtNum(1 - y, 1) + ' ปีก่อน ค.ศ.';
  return era === 'be' ? 'พ.ศ. ' + (y + 543) : 'ค.ศ. ' + y;
}
const agoOf = v => typeof v === 'number' ? v : v && v.year != null ? NOW_CE - v.year : v && v.ago != null ? v.ago : 0;
const logAgo = a => Math.log10(Math.max(1, a));

definePreset('eraTicker', {
  label: 'Era Ticker', about: 'a persistent "when are we" readout: keys [[t, ago | {year}]] in shot time; between keys it counts through deep time in log steps ("4,600 ล้านปีก่อน" … "12,000 ปีก่อน" … "ค.ศ. 1945"); an optional era name under it; era be shows พ.ศ.',
  meta: { version: '1.0.0', category: 'sticker', tags: ['era', 'year', 'time', 'deep time', 'history', 'evolution', 'geology', 'counter', 'timeline', 'ago'], camera: 'screen', layers: ['screen'],
    params: { size: { min: 30, max: 200 }, era: { enum: ['ce', 'be'] } } },
  defaults: { keys: [[0, 4.6e9]], names: [], count: 1.2, era: 'ce', x: .5, y: .1, size: 76, color: '#FFFFFF', accent: '#FFD43B', plate: 'rgba(12,12,18,.72)', out: null, outDur: .4, ease: 'ease', dur: .5 },
  run(t, o) {
    const q = (o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1) * clamp((t - o.at) / o.dur); if (q <= 0) return;
    // at each key the readout counts from the previous value to the new one (log time) over `count` seconds
    const K = o.keys; let i = 0; while (i + 1 < K.length && t >= K[i + 1][0]) i++;
    const cur = agoOf(K[i][1]), prev = i ? agoOf(K[i - 1][1]) : cur, f = i ? ease(clamp((t - K[i][0]) / o.count)) : 1;
    const ago = 10 ** lerp(logAgo(prev), logAgo(cur), f), txt = eraText(f >= 1 ? cur : ago, o.era);
    let nm = ''; for (const [nt, name] of o.names) if (t >= nt) nm = name;
    const { g, c } = stkCtx(o, 'eraTicker'), px = o.size * TS(), sm = px * .42;
    c.save(); c.globalAlpha = q; c.font = fontCss({ font: 'display', weight: 800, size: o.size }); const tw = c.measureText(txt).width;
    c.font = fontCss({ font: 'display', weight: 700, size: o.size * .42 }); const nw = nm ? c.measureText(nm).width : 0, bw = Math.max(tw, nw) + px * .9, bh = px * 1.35 + (nm ? sm * 1.5 : 0);
    const x = clamp(o.x * W - bw / 2, .03 * W, W * .97 - bw), y = o.y * H;
    c.fillStyle = o.plate; c.beginPath(); c.roundRect(x, y, bw, bh, px * .25); c.fill(); c.fillStyle = o.accent; c.fillRect(x, y + bh - px * .08, bw, px * .08);
    c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillStyle = o.color; c.font = fontCss({ font: 'display', weight: 800, size: o.size }); c.fillText(txt, x + bw / 2, y + px * 1.02);
    if (nm) { c.fillStyle = o.accent; c.font = fontCss({ font: 'display', weight: 700, size: o.size * .42 }); c.fillText(nm, x + bw / 2, y + px * 1.02 + sm * 1.35); }
    c.restore(); stkBlit(g);
  },
  demo: { bg: '#20263A', after: [['eraTicker', { at: .1, keys: [[0, 4.6e9], [1, 6.6e7], [2, { year: 1945 }]], names: [[0, 'โลกกำเนิด'], [1, 'ไดโนเสาร์สูญพันธุ์'], [2, 'สงครามโลกครั้งที่ 2 จบ']] }]] },
});

definePreset('deepTimeline', {
  label: 'Deep Timeline', about: 'a ruler of eras in log (or linear) time: eras [{name, from, to, color}] in years ago as coloured bands, a window that zooms by keys [[t, fromAgo, toAgo]], a "here" marker that travels by marker keys [[t, ago]] (a cosmic-calendar style overview)',
  meta: { version: '1.0.0', category: 'sticker', tags: ['timeline', 'deep time', 'eras', 'geology', 'evolution', 'history', 'scale', 'zoom', 'cosmic calendar', 'ruler'], camera: 'screen', layers: ['screen'],
    params: { scale: { enum: ['log', 'linear'] }, height: { min: 30, max: 240 } } },
  defaults: { eras: [], window: [[0, 1.38e10, 1]], marker: [], scale: 'log', y: .78, height: 90, x0: .06, x1: .94, size: 34, color: '#FFFFFF', out: null, outDur: .4, ease: 'ease', dur: .6 },
  run(t, o) {
    const q = (o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1) * clamp((t - o.at) / o.dur); if (q <= 0) return;
    const keyAt = (K, tt) => { let i = 0; while (i + 1 < K.length && tt >= K[i + 1][0]) i++; const a = K[i], b = K[Math.min(i + 1, K.length - 1)]; return [a, b, b[0] > a[0] ? ease(clamp((tt - a[0]) / (b[0] - a[0]))) : 1]; };
    const tr = v => o.scale === 'log' ? logAgo(v) : v;
    const [wa, wb, wf] = keyAt(o.window, t), A = lerp(tr(wa[1]), tr(wb[1]), wf), B = lerp(tr(wa[2]), tr(wb[2]), wf);
    const X0 = o.x0 * W, X1 = o.x1 * W, xOf = ago => X0 + (A - tr(ago)) / ((A - B) || 1) * (X1 - X0), hh = o.height * US(), y = o.y * H;
    const { g, c } = stkCtx(o, 'deepTimeline'); c.save(); c.globalAlpha = q;
    c.fillStyle = 'rgba(10,10,16,.7)'; c.beginPath(); c.roundRect(X0 - 10, y - 10, X1 - X0 + 20, hh + 20, 12); c.fill();
    c.beginPath(); c.rect(X0, y - hh, X1 - X0, hh * 3); c.clip();
    for (const e of o.eras) {
      const a = clamp(xOf(e.from), X0, X1), b = clamp(xOf(e.to), X0, X1); if (b - a < 1) continue;
      c.fillStyle = e.color || '#557'; c.fillRect(a, y, b - a, hh); c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(b - 1.5, y, 1.5, hh);
      c.font = fontCss({ font: 'display', weight: 700, size: o.size }); const tw = c.measureText(e.name).width;
      if (tw + 12 < b - a) { c.fillStyle = '#FFFFFF'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(e.name, (a + b) / 2, y + hh / 2); }
    }
    if (o.marker.length) {   // the "here" marker with its readout above
      const [ma, mb, mf] = keyAt(o.marker, t), m = 10 ** lerp(logAgo(agoOf(ma[1])), logAgo(agoOf(mb[1])), mf), mx = clamp(xOf(m), X0, X1);
      c.fillStyle = '#FFD43B'; c.fillRect(mx - 2, y - hh * .25, 4, hh * 1.5); c.beginPath(); c.moveTo(mx - 12, y - hh * .25 - 14); c.lineTo(mx + 12, y - hh * .25 - 14); c.lineTo(mx, y - hh * .25); c.fill();
      c.font = fontCss({ font: 'display', weight: 800, size: o.size * 1.1 }); c.textAlign = 'center'; c.textBaseline = 'alphabetic'; const txt = eraText(m), tw = c.measureText(txt).width;
      c.fillStyle = '#FFFFFF'; c.fillText(txt, clamp(mx, X0 + tw / 2, X1 - tw / 2), y - hh * .25 - 22);
    }
    c.restore(); stkBlit(g);
  },
  demo: { bg: '#20263A', after: [['deepTimeline', { at: .1, eras: [{ name: 'ฮาเดียน', from: 4.6e9, to: 4e9, color: '#9A3B2E' }, { name: 'อาร์เคียน', from: 4e9, to: 2.5e9, color: '#B5653A' }, { name: 'โพรเทอโรโซอิก', from: 2.5e9, to: 5.39e8, color: '#C7923E' }, { name: 'พาลีโอโซอิก', from: 5.39e8, to: 2.52e8, color: '#4E8F6A' }, { name: 'มีโซโซอิก', from: 2.52e8, to: 6.6e7, color: '#3E7CA8' }, { name: 'ซีโนโซอิก', from: 6.6e7, to: 1, color: '#7A5BB5' }],
    window: [[0, 4.6e9, 1e6], [2, 6e8, 1e4]], marker: [[0, 4.6e9], [2.5, 6.6e7]] }]] },
});

// ---------------------------------------------------------------- bar chart race
definePreset('barRace', {
  label: 'Bar Race', about: 'a bar-chart race over years from a sourced table: years [...], series [{name, color, values [...]}] (one value per year); bars slide and swap places as values change, values count, the year shows large; source: the citation shown small under the chart',
  meta: { version: '1.0.0', category: 'infographic', tags: ['bar race', 'chart', 'ranking', 'gdp', 'population', 'economy', 'race', 'years', 'data', 'compare'], camera: 'screen', layers: ['screen'],
    params: { top: { min: 2, max: 15 } } },
  defaults: { years: [2000, 2010, 2020], series: [], top: 6, plate: 'rgba(10,10,16,.62)', unit: '', decimals: 0, x0: .06, x1: .94, y0: .2, y1: .78, title: '', source: '', size: 36, out: null, outDur: .4, dur: 6 },
  run(t, o) {
    const q = (o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1) * clamp((t - o.at) / .3); if (q <= 0 || !o.series.length) return;
    const n = o.years.length, fy = clamp((t - o.at) / o.dur) * (n - 1), i0 = Math.min(n - 2, Math.floor(fy)), fr = n > 1 ? fy - i0 : 0;
    const val = s => n > 1 ? lerp(s.values[i0] ?? 0, s.values[i0 + 1] ?? 0, fr) : s.values[0];
    const rankAt = k => [...o.series].sort((a, b) => (b.values[k] ?? 0) - (a.values[k] ?? 0)).map(s => s.name);
    const ra = rankAt(i0), rb = rankAt(Math.min(n - 1, i0 + 1)), e = ease(clamp((fr - .15) / .7));
    const rows = o.series.map(s => ({ s, v: val(s), r: lerp(ra.indexOf(s.name), rb.indexOf(s.name), e) })).filter(x => x.r < o.top - .02);
    const max = Math.max(...rows.map(x => x.v), 1e-9), X0 = o.x0 * W, X1 = o.x1 * W, Y0 = o.y0 * H, Y1 = o.y1 * H, rh = (Y1 - Y0) / o.top, px = o.size * TS();
    const { g, c } = stkCtx(o, 'barRace'); c.save(); c.globalAlpha = q;
    if (o.plate) { c.fillStyle = o.plate; c.beginPath(); c.roundRect(X0 - px * .6, Y0 - px * (o.title ? 2.2 : .8), X1 - X0 + px * 1.2, Y1 - Y0 + px * (o.title ? 5.2 : 3.8), px * .5); c.fill(); }
    if (o.title) { c.font = fontCss({ font: 'display', weight: 800, size: o.size * 1.3 }); c.fillStyle = '#FFFFFF'; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillText(o.title, X0, Y0 - px * .9); }
    for (const { s, v, r } of rows) {
      const y = Y0 + r * rh, w = (X1 - X0) * .62 * v / max, a = clamp((o.top - r) * 1.5);
      c.globalAlpha = q * a; c.fillStyle = s.color || '#4FA3FF'; c.beginPath(); c.roundRect(X0, y + rh * .12, Math.max(4, w), rh * .76, rh * .16); c.fill();
      // the name inside the bar when it fits, else just after it; the value always follows
      c.font = fontCss({ font: 'display', weight: 700, size: o.size }); c.textBaseline = 'middle'; c.textAlign = 'left'; const nw = c.measureText(s.name).width, inside = nw + px < w;
      c.fillStyle = '#FFFFFF'; c.fillText(s.name, inside ? X0 + px * .4 : X0 + w + px * .3, y + rh / 2);
      const vt = fmtNum(v, 10 ** -o.decimals) + (o.unit ? ' ' + o.unit : ''); c.font = fontCss({ font: 'display', weight: 800, size: o.size * .9 });
      c.fillStyle = '#FFE58A'; c.fillText(vt, inside ? X0 + w + px * .3 : X0 + w + px * .6 + nw, y + rh / 2);
    }
    // the year: large, under the bars on the right; the source: small, on the left of the same line
    c.globalAlpha = q; c.font = fontCss({ font: 'display', weight: 800, size: o.size * 2.2 }); c.textAlign = 'right'; c.textBaseline = 'alphabetic'; c.fillStyle = 'rgba(255,255,255,.9)';
    c.fillText(String(Math.round(lerp(o.years[i0], o.years[Math.min(n - 1, i0 + 1)], fr))), X1, Y1 + px * 2.6);
    if (o.source) { c.font = fontCss({ font: 'body', weight: 500, size: o.size * .55 }); c.textAlign = 'left'; c.fillStyle = 'rgba(255,255,255,.75)'; c.fillText('ที่มา: ' + o.source, X0, Y1 + px * 2.6); }
    c.restore(); stkBlit(g);
  },
  demo: { bg: '#1A1D26', after: [['barRace', { at: .1, dur: 2.4, years: [2000, 2010, 2020], title: 'ตัวอย่าง (ข้อมูลสมมติ)', source: 'demo data', series: [{ name: 'A', color: '#E5484D', values: [10, 30, 45] }, { name: 'B', color: '#3D7DD8', values: [25, 28, 30] }, { name: 'C', color: '#46A758', values: [18, 35, 60] }] }]] },
});
