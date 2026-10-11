// presets/mapfx.js: explainer-map effects on top of map.js (drawn inside mapView) and two screen effects.
//   mapGlow   a territory glows from inside (a name that means something: green land, ice land, a hot zone)
//   mapSwarm  many small tokens pop one by one across a territory (settlers, flowers, herds): artwork or emoji
//   mapNote   a handwritten note with a hand-drawn arrow that draws itself to a place
//   mapPhoto  a photo card (artwork item) pops out beside a place, tilted, white border
//   weather   snow / rain / dust over the whole frame (screen)
//   spyglass  the frame becomes a telescope view of a scene (artwork item), with an optional speech bubble (screen)
// Places and areas come from sourced manifest data like every map layer; pictures are artwork items (never drawn here).

definePreset('mapGlow', {
  label: 'Map Glow', about: 'a territory glows from inside: a soft fill and an inner glow in one colour that fades in and breathes, a bright rim (a name that means something: "green" land, "ice" land, a hot spot); one country (name) or units',
  meta: { version: '1.0.0', category: 'map', tags: ['map', 'glow', 'highlight', 'territory', 'country', 'region', 'neon', 'emphasis'],
    params: { strength: { min: 0, max: 2 }, alpha: { min: 0, max: 1 } }, assets: [{ param: 'name', type: 'geo' }, { param: 'units', type: 'geo' }], layers: ['overlay'] },
  defaults: { name: 'Iceland', units: [], color: '#7CFF6B', alpha: .35, strength: 1, pulse: 1, out: null, outDur: .5, ease: 'easeOut', dur: .8 },
  run(t, o) {
    const gs = mapUnits(o, 'mapGlow'), c = mapCtx(), u = US(), q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1, a = Math.min(presetK(t, o), q); if (a <= 0) return;
    const br = 1 + .12 * o.pulse * Math.sin((t - o.at) * 2.4);
    c.save(); mapTrace(c, gs); c.globalAlpha = o.alpha * a; c.fillStyle = o.color; c.fill();
    c.clip();   // the inner glow: a thick blurred rim inside the shape
    c.globalAlpha = .8 * a * o.strength; c.shadowColor = o.color; c.shadowBlur = 40 * u * br; c.lineWidth = 26 * u * br; c.strokeStyle = o.color; mapTrace(c, gs); c.stroke();
    c.restore();
    c.save(); c.globalAlpha = a * o.strength; c.shadowColor = o.color; c.shadowBlur = 22 * u * br; c.lineWidth = 2.5 * u; c.strokeStyle = '#FFFFFF'; mapTrace(c, gs); c.stroke(); c.restore();
  },
});

// points spread over a territory, picked once in lon/lat (seeded, kept apart), so they stay put while the camera moves
const SWARM = new Map();
function swarmPoints(o, gs) {
  const key = JSON.stringify([o.units, o.name, o.count, o.seed]); if (SWARM.has(key)) return SWARM.get(key);
  const F = { type: 'FeatureCollection', features: gs.map(g => ({ type: 'Feature', geometry: g })) }, [[x0, y0], [x1, y1]] = d3.geoBounds(F);
  let s = o.seed * 9973 + 1; const r = () => (s = (s * 16807) % 2147483647) / 2147483647, pts = [], minD = Math.max(x1 - x0, y1 - y0) / Math.sqrt(o.count) * .55;
  for (let i = 0; i < o.count * 60 && pts.length < o.count; i++) {
    const p = [x0 + r() * (x1 - x0), y0 + r() * (y1 - y0)];
    if (F.features.some(f => d3.geoContains(f, p)) && pts.every(q => Math.hypot(q[0] - p[0], q[1] - p[1]) > minD)) pts.push(p);
  }
  pts.sort((a, b) => a[0] - b[0]); SWARM.set(key, pts); return pts;
}
definePreset('mapSwarm', {
  label: 'Map Swarm', about: 'many small tokens pop up one by one across a territory (settlers arriving, villages, flowers blooming, herds): an artwork item (art) or an emoji (glyph), spread evenly and kept apart, each popping with a little bounce, then bobbing gently',
  meta: { version: '1.0.0', category: 'map', tags: ['map', 'swarm', 'population', 'settlers', 'people', 'many', 'spread', 'flowers', 'villages', 'icons', 'emoji'],
    params: { count: { min: 1, max: 40 }, size: { min: 10, max: 200 }, stagger: { min: 0, max: 1 } }, assets: [{ param: 'units', type: 'geo' }, { param: 'image', type: 'image' }], layers: ['overlay'] },
  defaults: { name: 'Iceland', units: [], image: '', art: null, glyph: null, count: 12, size: 54, seed: 1, stagger: .12, bob: 1, out: null, outDur: .4, ease: 'backOut', dur: .35 },
  run(t, o) {
    const gs = mapUnits(o, 'mapSwarm'), c = mapCtx(), u = US(), q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1; if (q <= 0) return;
    const im = o.image ? STICKER_IMG[artPath(o.image)] : null, sz = o.size * u;
    swarmPoints(o, gs).forEach((ll, i) => {
      const t0 = o.at + i * o.stagger, k = t < t0 ? 0 : backOut(clamp((t - t0) / o.dur)); if (k <= 0 || !mapVisible(ll)) return;
      const p = mapPt(ll); if (!p) return; const y = p[1] - Math.sin((t - t0) * 2.6 + i) * 2 * o.bob * u;
      c.save(); c.globalAlpha = q; c.translate(p[0], y); c.scale(k, k);
      if (im) { const h = sz, w = h * im.width / im.height; c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 6 * u; c.shadowOffsetY = 3 * u; c.drawImage(im.canvas || im.elt, -w / 2, -h, w, h); }
      else if (o.glyph) { c.font = `${sz}px "Noto Color Emoji", "Segoe UI Emoji", "Apple Color Emoji", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'bottom'; c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 6 * u; c.fillText(o.glyph, 0, 0); }
      c.restore();
    });
  },
});

definePreset('mapNote', {
  label: 'Map Note', about: 'a handwritten note (Mali, the hand font) written on stroke by stroke, with a hand-drawn arrow that draws itself from the note to a place; for a name, a nickname, a "this one!" aside',
  meta: { version: '1.0.0', category: 'map', tags: ['map', 'note', 'handwritten', 'annotation', 'arrow', 'callout', 'label', 'aside', 'doodle'],
    params: { size: { min: 16, max: 160 }, bend: { min: -1, max: 1 }, angle: { min: -30, max: 30 } }, assets: [{ param: 'lonlat', type: 'place' }], layers: ['text'] },
  defaults: { text: '', lonlat: [0, 0], dx: -120, dy: -150, size: 54, color: '#FFE14D', bend: .5, angle: -6, arrow: true, out: null, outDur: .35, ease: 'easeOut', dur: 1 },
  run(t, o) {
    const q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1, k = clamp((t - o.at) / o.dur); if (k <= 0 || q <= 0 || !o.text || !mapVisible(o.lonlat)) return;
    const p = mapPt(o.lonlat); if (!p) return;
    const c = mapCtx(), u = US(), px = o.size * TS(), tx = p[0] + o.dx * u, ty = p[1] + o.dy * u;
    c.save(); c.globalAlpha = q; c.font = fontCss({ font: 'hand', weight: 600, size: o.size }); c.textAlign = 'center'; c.textBaseline = 'middle';
    const tw = c.measureText(o.text).width, kw = easeOut(clamp(k / .55));
    c.save(); c.translate(tx, ty); c.rotate(o.angle * Math.PI / 180);
    c.beginPath(); c.rect(-tw / 2 - px, -px * 1.2, (tw + px * 2) * kw, px * 2.4); c.clip();   // written on, left to right
    c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 6 * u; c.fillStyle = o.color; c.fillText(o.text, 0, 0); c.restore();
    if (o.arrow) {   // a hand-drawn arrow from under the note to just short of the place, curving by bend
      const ka = easeOut(clamp((k - .35) / .5)); if (ka > 0) {
        const a = [tx + Math.sign(p[0] - tx || 1) * Math.min(tw * .3, Math.abs(p[0] - tx)), ty + px * .7], d = Math.hypot(p[0] - a[0], p[1] - a[1]) || 1, b = [p[0] - (p[0] - a[0]) / d * 14 * u, p[1] - (p[1] - a[1]) / d * 14 * u];
        const m = [(a[0] + b[0]) / 2 - (b[1] - a[1]) * .35 * o.bend, (a[1] + b[1]) / 2 + (b[0] - a[0]) * .35 * o.bend], N = 30, pts = [];
        for (let i = 0; i <= N * ka; i++) { const s = i / N, w = Math.sin(s * 9) * 1.2 * u; pts.push([(1 - s) ** 2 * a[0] + 2 * (1 - s) * s * m[0] + s * s * b[0] + w, (1 - s) ** 2 * a[1] + 2 * (1 - s) * s * m[1] + s * s * b[1] + w]); }
        c.strokeStyle = o.color; c.lineWidth = Math.max(3, px * .08); c.lineCap = c.lineJoin = 'round'; c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = 5 * u;
        c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke();
        if (ka >= 1 && pts.length > 2) { const [x, y] = pts.at(-1), [x0, y0] = pts.at(-3), ang = Math.atan2(y - y0, x - x0), h = px * .45;
          c.beginPath(); c.moveTo(x - Math.cos(ang - .5) * h, y - Math.sin(ang - .5) * h); c.lineTo(x, y); c.lineTo(x - Math.cos(ang + .5) * h, y - Math.sin(ang + .5) * h); c.stroke(); }
      }
    }
    c.restore();
    mapObstacle(tx - tw / 2 - px * .3, ty - px * .8, tw + px * .6, px * 1.6);
  },
});

definePreset('mapPhoto', {
  label: 'Map Photo Card', about: 'a photo card pops out beside a place: an artwork item (a picture of the place, a scene) on a white border, tilted, with a soft shadow; several cards around a place fan out one by one',
  meta: { version: '1.0.0', category: 'map', tags: ['map', 'photo', 'picture', 'card', 'postcard', 'place', 'example', 'image', 'polaroid'],
    params: { width: { min: 60, max: 700 }, angle: { min: -30, max: 30 } }, assets: [{ param: 'lonlat', type: 'place' }, { param: 'image', type: 'image' }], layers: ['overlay'] },
  defaults: { lonlat: [0, 0], image: '', art: null, dx: 160, dy: -120, width: 260, angle: -5, border: 10, out: null, outDur: .3, ease: 'backOut', dur: .45 },
  run(t, o) {
    const im = STICKER_IMG[artPath(o.image)]; if (!im || !mapVisible(o.lonlat)) return;
    const p = mapPt(o.lonlat); if (!p) return;
    const u = US(), w = o.width * u, h = w * im.height / im.width, x = p[0] + o.dx * u, y = p[1] + o.dy * u, b = o.border * u;
    mapObstacle(x - w / 2 - b, y - h / 2 - b, w + 2 * b, h + 2 * b);
    const s = stickerPop(t, o) * stickerOut(t, o); if (s <= .001) return;
    const c = mapCtx(); c.save(); c.translate(x, y); c.rotate((o.angle + (1 - Math.min(1, s)) * 8) * Math.PI / 180); c.scale(s, s);
    c.shadowColor = 'rgba(0,0,0,.4)'; c.shadowBlur = 16 * u; c.shadowOffsetY = 7 * u; c.fillStyle = '#FBFAF6'; c.fillRect(-w / 2 - b, -h / 2 - b, w + 2 * b, h + 2 * b);
    c.shadowColor = 'transparent'; c.drawImage(im.canvas || im.elt, -w / 2, -h / 2, w, h); c.restore();
  },
});

// ---- screen effects ----
definePreset('weather', {
  label: 'Weather', about: 'snow, rain, drifting dust or soft clouds over the whole frame (a season, a storm, a harsh land; clouds drifting over a satellite map from high above): seeded, in depths, wind slant, fades in and out',
  meta: { version: '1.0.0', category: 'fx', tags: ['weather', 'snow', 'rain', 'dust', 'winter', 'storm', 'cold', 'atmosphere', 'particles'], camera: 'screen', layers: ['screen'],
    params: { kind: { enum: ['snow', 'rain', 'dust', 'clouds'] }, density: { min: 0, max: 3 }, wind: { min: -2, max: 2 } } },
  defaults: { kind: 'snow', density: 1, wind: .3, color: null, out: null, outDur: .6, ease: 'ease', dur: .6 },
  run(t, o) {
    const q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1, a = Math.min(presetK(t, o), q); if (a <= 0) return;
    if (o.kind === 'clouds') return weatherClouds(t, o, a);
    const { g, c } = stkCtx(o, 'weather'), u = US(), n = Math.round((o.kind === 'rain' ? 140 : 110) * o.density), col = o.color || { snow: '#FFFFFF', rain: '#CFE3FF', dust: '#E6D2A8' }[o.kind];
    c.save(); c.fillStyle = col; c.strokeStyle = col; c.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const z = .4 + mapRand(i, 1) * .6, sp = o.kind === 'rain' ? 1.6 : o.kind === 'snow' ? .16 : .05, vy = sp * H * z, vx = o.wind * (o.kind === 'rain' ? .25 : .08) * W * z;
      const y = ((mapRand(i, 2) * H + t * vy) % (H + 40)) - 20, x = ((mapRand(i, 3) * W + t * vx + Math.sin(t * 1.3 + i) * (o.kind === 'snow' ? 12 * u : 0)) % W + W) % W;
      c.globalAlpha = a * (o.kind === 'dust' ? .35 : .85) * z;
      if (o.kind === 'rain') { c.lineWidth = 1.6 * u * z; c.beginPath(); c.moveTo(x, y); c.lineTo(x - vx * .03, y - vy * .03); c.stroke(); }
      else { c.beginPath(); c.arc(x, y, (o.kind === 'snow' ? 3.4 : 1.8) * u * z, 0, TAU); c.fill(); }
    }
    c.restore(); stkBlit(g);
  },
  demo: { bg: '#2E5E7E', after: [['weather', { at: .2, kind: 'snow', density: 1.2 }]] },
});

// clouds: big soft blurred puffs drifting slowly with the wind (cached sprite, a few depths)
function weatherClouds(t, o, a) {
  const { g, c } = stkCtx(o, 'weather'), u = US();
  if (!STK_G.cloud) { const cv = document.createElement('canvas'); cv.width = cv.height = 256; const x = cv.getContext('2d'); x.filter = 'blur(18px)'; x.fillStyle = '#FFFFFF';
    for (const [cx, cy, r] of [[128, 140, 60], [90, 150, 46], [168, 150, 50], [120, 110, 44], [150, 120, 38]]) { x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill(); } STK_G.cloud = cv; }
  const n = Math.round(7 * o.density);
  c.save();
  for (let i = 0; i < n; i++) { const z = .5 + mapRand(i, 4) * .5, s = (360 + mapRand(i, 5) * 380) * u * z, x = ((mapRand(i, 6) * (W + s) + t * o.wind * 40 * u * z) % (W + s) + (W + s)) % (W + s) - s, y = mapRand(i, 7) * H - s * .3;
    c.globalAlpha = a * .55 * z; c.drawImage(STK_G.cloud, x, y, s, s * .7); }
  c.restore(); stkBlit(g);
}

definePreset('spyglass', {
  label: 'Spyglass View', about: 'the frame becomes a telescope view: a round lens opens over black, a scene (artwork item, opaque picture) drifts gently inside with a lens vignette and a glint; an optional speech bubble pops (what someone sees and says: "land!")',
  meta: { version: '1.0.0', category: 'fx', tags: ['spyglass', 'telescope', 'lens', 'view', 'explorer', 'discovery', 'scene', 'speech bubble', 'reveal'], camera: 'screen', layers: ['screen'],
    params: { radius: { min: .2, max: .6 }, drift: { min: 0, max: 2 } }, assets: [{ param: 'image', type: 'image' }] },
  defaults: { image: '', art: null, radius: .42, drift: 1, bubble: '', bubbleAt: 1.2, bubbleColor: '#FFFFFF', bubbleInk: '#1E5FAF', out: null, outDur: .4, ease: 'easeOut', dur: .6 },
  run(t, o) {
    const im = STICKER_IMG[artPath(o.image)], q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1, k = Math.min(presetK(t, o), q); if (k <= 0) return;
    const { g, c } = stkCtx(o, 'spyglass'), u = US(), R = o.radius * Math.min(W, H) * (.2 + .8 * k), cx = W / 2 + Math.sin(t * .6) * 6 * u * o.drift, cy = H * .45 + Math.cos(t * .5) * 4 * u * o.drift;
    c.save(); c.globalAlpha = Math.min(1, k * 1.5); c.fillStyle = '#050505'; c.fillRect(0, 0, W, H);
    c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.clip();
    if (im) { const s = Math.max(2 * R / im.width, 2 * R / im.height) * (1.12 + .03 * Math.sin(t * .4)), w = im.width * s, h = im.height * s; c.drawImage(im.canvas || im.elt, cx - w / 2 - Math.sin(t * .35) * R * .06 * o.drift, cy - h / 2, w, h); }
    const vg = c.createRadialGradient(cx, cy, R * .55, cx, cy, R); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.85)'); c.fillStyle = vg; c.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    c.globalAlpha = .25; c.fillStyle = '#FFFFFF'; c.beginPath(); c.ellipse(cx - R * .35, cy - R * .45, R * .28, R * .1, -.5, 0, TAU); c.fill();   // glint
    c.restore();
    if (o.bubble) {   // a speech bubble pops at the lens edge
      const b = backOut(clamp((t - o.bubbleAt) / .35)) * q; if (b > 0) {
        c.save(); c.font = fontCss({ font: 'display', weight: 800, size: 60 }); const tw = c.measureText(o.bubble).width, px = 60 * TS(), bw = tw + px, bh = px * 1.5, bx = cx + R * .35, by = cy + R * .45;
        c.translate(bx, by); c.scale(b, b); c.shadowColor = 'rgba(0,0,0,.4)'; c.shadowBlur = 12 * u; c.fillStyle = o.bubbleColor;
        c.beginPath(); c.roundRect(-bw / 2, -bh / 2, bw, bh, bh * .45); c.fill(); c.beginPath(); c.moveTo(bw * .2, bh * .35); c.lineTo(bw * .42, bh * .85); c.lineTo(bw * .02, bh * .45); c.fill();
        c.shadowColor = 'transparent'; c.fillStyle = o.bubbleInk; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(o.bubble, 0, px * .04); c.restore();
      }
    }
    stkBlit(g);
  },
});
