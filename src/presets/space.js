// presets/space.js: space and scale scenes (screen layers, drawn as motion graphics: seeded particles and shapes)
//   starfield     stars drifting past in depth; warp: they stretch into streaks as the speed climbs (a journey)
//   galaxy        a spiral galaxy of seeded stars, tilted and turning, with an optional body on its orbit (trail + name)
//   depthProfile  a side cut through the sea: surface, sea floor profile, a depth arrow, objects stacked for scale

definePreset('starfield', {
  label: 'Starfield', about: 'a deep starry sky: stars at three depths drift past (speed), and with warp they stretch into streaks rushing from the centre as the speed climbs to warp (a journey through space, hyperspace), then settle; covers the frame',
  meta: { version: '1.0.0', category: 'fx', tags: ['space', 'stars', 'starfield', 'warp', 'hyperspace', 'journey', 'travel', 'night sky', 'cosmos', 'speed'], camera: 'screen', layers: ['screen'],
    params: { speed: { min: 0, max: 3 }, warp: { min: 0, max: 1 }, density: { min: .2, max: 3 } } },
  defaults: { speed: .3, warp: 0, warpAt: 0, warpDur: 2, density: 1, color: '#FFFFFF', bg: 'sky', out: null, outDur: .5, ease: 'ease', dur: .5 },
  run(t, o) {
    const q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1, a = Math.min(presetK(t, o), q); if (a <= 0) return;
    const { g, c } = stkCtx(o, 'starfield'), u = US(), n = Math.round(420 * o.density), cx = W / 2, cy = H / 2, F = Math.hypot(W, H) * .6;
    const wk = o.warp > 0 ? Math.sin(Math.PI * clamp((t - o.at - o.warpAt) / o.warpDur)) * o.warp : 0;   // warp rises and falls
    c.save(); c.globalAlpha = a; if (o.bg === 'sky') spaceSky(c); else if (o.bg) { c.fillStyle = o.bg; c.fillRect(0, 0, W, H); }   // bg 'sky': deep space; a colour; null lays the stars over what is below
    for (let i = 0; i < n; i++) {   // each star moves toward the viewer: z runs 1 → 0 and loops
      const sp = o.speed * .15 + wk * 1.6, z0 = mapRand(i, 21), z = 1 - (((1 - z0) + (t - o.at) * sp * (.4 + mapRand(i, 22) * .6)) % 1);
      const ax = (mapRand(i, 23) - .5) * 2, ay = (mapRand(i, 24) - .5) * 2, x = cx + ax * F * (.08 / (z + .05)), y = cy + ay * F * (.08 / (z + .05));
      if (x < -50 || x > W + 50 || y < -50 || y > H + 50) continue;
      const br = clamp(1.2 - z) * (.4 + .6 * mapRand(i, 25)), r = (.4 + 2.2 * (1 - z)) * u;
      c.globalAlpha = a * br; c.strokeStyle = c.fillStyle = mapRand(i, 26) > .9 ? '#FFDDB0' : o.color;
      if (wk > .05) { const len = wk * 220 * u * (1.2 - z), dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1;
        c.lineWidth = r; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y); c.lineTo(x - dx / d * len, y - dy / d * len); c.stroke(); }
      else { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
    }
    c.restore(); stkBlit(g);
  },
  demo: { bg: '#0D1736', after: [['starfield', { at: 0, speed: .4, warp: 1, warpAt: .6, warpDur: 2 }]] },
});

// a seeded spiral galaxy, built once: core bulge + arms (log spirals) + dust; stars in galaxy-plane coordinates
const GALAXY = new Map();
function galaxyStars(arms, n, seed) {
  const k = `${arms}|${n}|${seed}`; if (GALAXY.has(k)) return GALAXY.get(k);
  let s = seed * 7919 + 3; const r = () => (s = (s * 16807) % 2147483647) / 2147483647, g = () => (r() + r() + r() - 1.5) / 1.5, st = [];
  for (let i = 0; i < n; i++) {
    if (i < n * .22) { const d = Math.abs(g()) * .22; const a = r() * TAU; st.push([Math.cos(a) * d, Math.sin(a) * d, .9 + r() * .3, 1]); continue; }   // bulge
    const arm = i % arms, d = .08 + Math.pow(r(), .8) * .92, a = arm / arms * TAU + Math.log(d / .08) * 2.2 + g() * .32 / (d + .3);
    st.push([Math.cos(a) * d + g() * .03, Math.sin(a) * d + g() * .03, .4 + r() * .6, r() > .82 ? 2 : 0]);
  }
  GALAXY.set(k, st); return st;
}
definePreset('galaxy', {
  label: 'Galaxy', about: 'a spiral galaxy made of thousands of seeded stars (bright core, arms, a few blue and gold stars), tilted toward the viewer and slowly turning; optionally a body (the Sun) travels its orbit, bobbing above and below the disc, leaving a trail, with its name; zooms in with zoom / zoomTo',
  meta: { version: '1.0.0', category: 'fx', tags: ['space', 'galaxy', 'milky way', 'andromeda', 'stars', 'orbit', 'cosmos', 'astronomy', 'sun'], camera: 'screen', layers: ['screen'],
    params: { tilt: { min: 0, max: 85 }, arms: { min: 2, max: 6 }, zoom: { min: .2, max: 20 }, spin: { min: -1, max: 1 } } },
  defaults: { tilt: 62, arms: 4, stars: 9000, seed: 3, spin: .08, zoom: 1, zoomTo: null, x: .5, y: .5, orbit: null, orbitText: '', orbitColor: '#E8F25A', trail: 1.6, bob: .08, bg: 'sky', out: null, outDur: .5, ease: 'ease', dur: 1 },
  run(t, o) {
    const q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1, a = Math.min(clamp((t - o.at) / .5), q); if (a <= 0) return;
    const { g, c } = stkCtx(o, 'galaxy'), u = US(), cx = o.x * W, cy = o.y * H, z = o.zoomTo != null ? Math.exp(lerp(Math.log(o.zoom), Math.log(o.zoomTo), presetK(t, o))) : o.zoom;
    const R = Math.min(W, H) * .46 * z, ct = Math.cos(o.tilt * Math.PI / 180), rot = (t - o.at) * o.spin, cr = Math.cos(rot), sr = Math.sin(rot);
    const P = (x, y, h = 0) => { const X = x * cr - y * sr, Y = x * sr + y * cr; return [cx + X * R, cy + Y * R * ct - h * R * Math.sin(o.tilt * Math.PI / 180)]; };
    c.save(); c.globalAlpha = a; if (o.bg === 'sky') spaceSky(c, (t - o.at) * 4); else if (o.bg) { c.fillStyle = o.bg; c.fillRect(0, 0, W, H); }
    const glow = c.createRadialGradient(cx, cy, 0, cx, cy, R * .55); glow.addColorStop(0, 'rgba(255,236,200,.85)'); glow.addColorStop(.35, 'rgba(255,214,160,.25)'); glow.addColorStop(1, 'rgba(255,214,160,0)');
    c.save(); c.translate(cx, cy); c.scale(1, ct); c.fillStyle = glow; c.beginPath(); c.arc(0, 0, R * .55, 0, TAU); c.fill(); c.restore();
    c.globalCompositeOperation = 'lighter';
    for (const [x, y, b, kind] of galaxyStars(o.arms, o.stars, o.seed)) {
      const [px, py] = P(x, y); if (px < -10 || px > W + 10 || py < -10 || py > H + 10) continue;
      c.globalAlpha = a * b * (kind === 1 ? .55 : .7); c.fillStyle = kind === 2 ? '#9EC3FF' : kind === 1 ? '#FFE2B8' : '#F2EEF8';
      const rr = (kind === 2 ? 2.2 : 1.5) * u * Math.sqrt(z); c.fillRect(px - rr / 2, py - rr / 2, rr, rr);
    }
    c.globalCompositeOperation = 'source-over';
    if (o.orbit) {   // a body on its orbit: radius orbit (0..1 of the disc), bobbing through the plane, with a fading trail
      const w = (t - o.at) * .5, pos = s => { const an = s * TAU * .5 + .4; return P(Math.cos(an) * o.orbit, Math.sin(an) * o.orbit, Math.sin(s * 9) * o.bob); };
      const s0 = Math.max(0, w - o.trail); c.lineCap = 'round';
      for (let k = 0; k < 40; k++) { const s1 = lerp(s0, w, k / 40), s2 = lerp(s0, w, (k + 1) / 40), p1 = pos(s1), p2 = pos(s2);
        c.globalAlpha = a * (k / 40); c.strokeStyle = o.orbitColor; c.lineWidth = 2.4 * u; c.beginPath(); c.moveTo(...p1); c.lineTo(...p2); c.stroke(); }
      const p = pos(w); c.globalAlpha = a; c.fillStyle = o.orbitColor; c.shadowColor = o.orbitColor; c.shadowBlur = 16 * u; c.beginPath(); c.arc(p[0], p[1], 6 * u, 0, TAU); c.fill(); c.shadowBlur = 0;
      if (o.orbitText) { c.font = fontCss({ font: 'display', weight: 700, size: 46 }); c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = o.orbitColor; c.fillText(o.orbitText, p[0] + 14 * u, p[1] + 16 * u); }
    }
    c.restore(); stkBlit(g);
  },
  demo: { bg: '#0D1736', after: [['galaxy', { at: 0, orbit: .55, orbitText: 'ดวงอาทิตย์', tilt: 66 }]] },
});

definePreset('depthProfile', {
  label: 'Depth Profile', about: 'a side cut through the sea for scale: sky and the sea surface on top, the sea floor profile with a deep trench, a depth arrow with its value, then objects stacked inside the trench one by one (items: [{ label, height }] in metres, drawn as simple outlined shapes to scale: mountain, tower, building) so the viewer feels the depth',
  meta: { version: '1.0.0', category: 'infographic', tags: ['depth', 'deep', 'sea', 'ocean', 'trench', 'cross section', 'profile', 'scale', 'comparison', 'height', 'everest'], camera: 'screen', layers: ['screen'],
    params: { depth: { min: 100, max: 12000 } } },
  defaults: { depth: 10935, label: '', unit: 'ม.', items: [], sea: '#1E5FAF', deep: '#061633', floor: '#0A1324', line: '#9FD3FF', out: null, outDur: .4, ease: 'ease', dur: 1, stagger: .8 },
  run(t, o) {
    const q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1, a = Math.min(clamp((t - o.at) / .4), q); if (a <= 0) return;
    const { g, c } = stkCtx(o, 'depthProfile'), u = US(), top = H * .2, bot = H * .82, scale = (bot - top) / o.depth, tx = W * .55, tw = W * .32, k = presetK(t, o);
    c.save(); c.globalAlpha = a;
    const sky = c.createLinearGradient(0, 0, 0, top); sky.addColorStop(0, '#7FB6F2'); sky.addColorStop(1, '#D8ECFF'); c.fillStyle = sky; c.fillRect(0, 0, W, top);
    const sea = c.createLinearGradient(0, top, 0, bot); sea.addColorStop(0, o.sea); sea.addColorStop(1, o.deep); c.fillStyle = sea; c.fillRect(0, top, W, H - top);
    // the sea floor: shelves on both sides, the trench in the middle (drawn as k grows: the cut reveals downward)
    const floorY = top + (bot - top) * .18, prof = [[0, floorY * 1.02], [W * .2, floorY], [tx - tw * .7, floorY + 10 * u], [tx - tw / 2, top + (bot - top) * .45], [tx - tw * .22, bot], [tx + tw * .22, bot], [tx + tw / 2, top + (bot - top) * .42], [tx + tw * .75, floorY + 6 * u], [W, floorY]];
    c.save(); c.beginPath(); c.rect(0, 0, W, top + (H - top) * k); c.clip();
    c.fillStyle = o.floor; c.beginPath(); c.moveTo(0, H); prof.forEach(([x, y]) => c.lineTo(x, y)); c.lineTo(W, H); c.closePath(); c.fill();
    c.strokeStyle = o.line; c.lineWidth = 3 * u; c.beginPath(); prof.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke(); c.restore();
    // waves on the surface
    c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 2 * u; c.beginPath(); for (let x = 0; x <= W; x += 8 * u) { const y = top + Math.sin(x / (40 * u) + t * 2) * 4 * u; x ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
    // the depth arrow and its value
    const ka = easeOut(clamp((k - .3) / .5)), ax = W * .14; if (ka > 0) {
      c.strokeStyle = c.fillStyle = '#FFFFFF'; c.lineWidth = 3 * u; const y1 = top + (bot - top) * ka;
      c.beginPath(); c.moveTo(ax, top); c.lineTo(ax, y1); c.stroke(); c.beginPath(); c.moveTo(ax - 10 * u, y1 - 14 * u); c.lineTo(ax, y1); c.lineTo(ax + 10 * u, y1 - 14 * u); c.stroke();
      c.font = fontCss({ font: 'display', weight: 800, size: 64 }); c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(`${o.depth.toLocaleString('en-US')} ${o.unit}`, ax + 18 * u, top + (bot - top) * .55);
      if (o.label) { c.font = fontCss({ font: 'display', weight: 600, size: 40 }); c.globalAlpha = a * .85; c.fillText(o.label, ax + 18 * u, top + (bot - top) * .55 + 62 * u); c.globalAlpha = a; }
    }
    // objects stacked from the trench floor up, to scale, one after another
    let base = bot;
    o.items.forEach((it, i) => { const ki = easeOut(clamp((t - o.at - o.dur - i * o.stagger) / .6)); if (ki <= 0) return;
      const h = it.height * scale, w = Math.min(tw * (it.shape === 'mountain' || !it.shape ? .75 : .4), h * (it.shape === 'tower' ? .35 : it.shape === 'building' ? .22 : .9)), y0 = base, y1 = base - h * ki;
      c.save(); c.globalAlpha = a * ki; c.fillStyle = 'rgba(159,211,255,.18)'; c.strokeStyle = o.line; c.lineWidth = 2.5 * u; c.beginPath();
      if (it.shape === 'building' || it.shape === 'tower') { c.moveTo(tx - w / 2, y0); c.lineTo(tx - w * .12, y1 + h * .1 * ki); c.lineTo(tx, y1); c.lineTo(tx + w * .12, y1 + h * .1 * ki); c.lineTo(tx + w / 2, y0); }
      else { c.moveTo(tx - w / 2, y0); c.lineTo(tx - w * .1, y1 + h * .08 * ki); c.lineTo(tx, y1); c.lineTo(tx + w * .15, y1 + h * .12 * ki); c.lineTo(tx + w / 2, y0); }
      c.closePath(); c.fill(); c.stroke();
      c.setLineDash([6 * u, 6 * u]); c.beginPath(); c.moveTo(tx + 8 * u, y1); c.lineTo(W - W * .05, y1); c.stroke(); c.setLineDash([]);
      c.font = fontCss({ font: 'display', weight: 700, size: 40 }); c.fillStyle = '#FFFFFF'; c.textAlign = 'right'; c.textBaseline = 'bottom'; c.fillText(it.label, W - W * .05, y1 - 8 * u);
      c.restore(); base = y1 + 0; if (ki >= 1) base = y0 - h; });
    c.restore(); stkBlit(g);
  },
  demo: { bg: '#000000', after: [['depthProfile', { at: 0, depth: 10935, label: 'ร่องลึกมาเรียนา', items: [{ label: 'เอเวอเรสต์ 8,849 ม.', height: 8849, shape: 'mountain' }, { label: 'ตึก 828 ม.', height: 828, shape: 'building' }] }]] },
});
