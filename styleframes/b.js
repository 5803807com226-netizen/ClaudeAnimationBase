// Style B, "Paper Theatre": a cut-paper diorama lit from the top left. The same folded note repeats on every layer of a
// paper well that spirals down into dusk; she stands at the rim as a paper cut-out. Tactile, warm, real shadows.
(async () => {
  const ctx = document.getElementById('c').getContext('2d'), N = makeNoise(9);
  const TONES = ['#F2ECE3', '#EAE0D2', '#E0D2C0', '#D6C3AE', '#C9B19C', '#B79C8C', '#9C8287', '#7C6A7E', '#5C5070', '#433C5C', '#2E2A45'];
  const n = TONES.length, C0 = [600, 900];
  const ring = k => {   // the k-th layer's hole: an organic cut circle, drifting into a spiral as it descends
    const R = 1050 * Math.pow(.79, k + 1), cx = C0[0] + 60 * Math.cos(k * .9) * k / n, cy = C0[1] + 46 * Math.sin(k * .9) * k / n - k * 10, pts = [];
    for (let i = 0; i < 160; i++) { const a = i / 160 * TAU, rr = R * (1 + .045 * fbm(N, Math.cos(a) * 1.4 + k * 3.1, Math.sin(a) * 1.4)); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * .92]); }
    return { R, cx, cy, pts };
  };
  const rings = [...Array(n).keys()].map(ring);
  const holePath = (c, pts) => { c.moveTo(pts[0][0], pts[0][1]); for (let i = pts.length - 1; i >= 0; i--) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); };

  function note(c, x, y, w, rot, shade) {   // a folded paper note: the message, with debossed lines (never letters)
    const h = w * .58;
    c.save(); c.translate(x, y); c.rotate(rot); c.translate(-x, -y);
    c.shadowColor = 'rgba(45,25,15,.38)'; c.shadowBlur = w * .09; c.shadowOffsetX = w * .03; c.shadowOffsetY = w * .05;
    bubblePath(c, x, y, w, h, h * .28); c.fillStyle = '#C8664A'; c.fill(); c.shadowColor = 'transparent';
    c.save(); c.clip();
    c.fillStyle = 'rgba(70,25,15,.16)'; c.beginPath(); c.moveTo(x - w * .08, y - h); c.lineTo(x + w, y - h); c.lineTo(x + w, y + h); c.lineTo(x + w * .22, y + h); c.fill();   // the fold
    c.strokeStyle = 'rgba(255,215,195,.45)'; c.lineWidth = Math.max(1, w * .006); c.beginPath(); c.moveTo(x - w * .08, y - h); c.lineTo(x + w * .22, y + h); c.stroke();
    const lg = c.createLinearGradient(x - w / 2, y - h / 2, x + w / 2, y + h / 2); lg.addColorStop(0, 'rgba(255,240,225,.22)'); lg.addColorStop(1, 'rgba(255,240,225,0)'); c.fillStyle = lg; c.fillRect(x - w, y - h, w * 2, h * 2);
    [[.6, -.16], [.44, .06], [.26, .26]].forEach(([len, dy]) => {
      c.fillStyle = 'rgba(90,30,20,.25)'; pill(c, x - w * .34 + 1, y + dy * h + 1.5, w * len * .8, h * .075); c.fill();
      c.fillStyle = 'rgba(240,170,140,.75)'; pill(c, x - w * .34, y + dy * h, w * len * .8, h * .075); c.fill();
    });
    if (shade > 0) { c.fillStyle = `rgba(30,22,45,${shade})`; c.fillRect(x - w, y - h, w * 2, h * 2); }
    c.restore(); c.restore();
  }

  // deepest first: each layer is the page with its hole cut out, casting its shadow down onto the layers below
  ctx.fillStyle = TONES[n - 1]; ctx.fillRect(0, 0, W, H);
  radial(ctx, rings[n - 1].cx, rings[n - 1].cy, 260, [[0, 'rgba(255,150,110,.35)'], [1, 'rgba(0,0,0,0)']], 'screen');   // a faint warm glow at the bottom
  for (let k = n - 1; k >= 0; k--) {
    const r = rings[k];
    ctx.save(); ctx.shadowColor = `rgba(40,22,12,${.3 + .02 * k})`; ctx.shadowBlur = 34; ctx.shadowOffsetX = 12; ctx.shadowOffsetY = 18;
    ctx.beginPath(); ctx.rect(-200, -200, W + 400, H + 400); holePath(ctx, r.pts); ctx.fillStyle = TONES[k]; ctx.fill('evenodd'); ctx.restore();
    ctx.save(); ctx.beginPath(); r.pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
    const eg = ctx.createLinearGradient(r.cx - r.R, r.cy - r.R, r.cx + r.R, r.cy + r.R); eg.addColorStop(0, 'rgba(255,250,240,0)'); eg.addColorStop(1, 'rgba(255,250,240,.7)');
    ctx.strokeStyle = eg; ctx.lineWidth = 2.2; ctx.stroke(); ctx.restore();                                                          // lit cut edge
    if (k >= 1 && k <= 8) {   // the replayed note on this layer, smaller and further into shadow as it descends
      const a = -2.35 + k * 1.2, mid = (r.R + rings[k - 1].R) / 2, s = Math.pow(.79, k);
      note(ctx, r.cx + Math.cos(a) * mid, r.cy + Math.sin(a) * mid * .92, 330 * s, -.25 + k * .37, Math.min(.55, k * .07));
    }
  }

  // the original note on the top layer, and her at the rim as a paper cut-out (white border, real shadow)
  note(ctx, 760, 1440, 420, .12, 0);
  const C = await characterLayer({ x: 300, y: 1860, h: 820, aspect: .66 }, { slotColor: 'rgba(80,60,60,.45)' });
  if (C.ok) {
    const [o, ox] = layer();
    for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; ox.drawImage(C.c, Math.cos(a) * 11, Math.sin(a) * 11); }
    ox.globalCompositeOperation = 'source-in'; ox.fillStyle = '#FBF8F2'; ox.fillRect(0, 0, W, H);
    ctx.save(); ctx.shadowColor = 'rgba(40,22,12,.42)'; ctx.shadowBlur = 30; ctx.shadowOffsetX = 18; ctx.shadowOffsetY = 22; ctx.drawImage(o, 0, 0); ctx.restore();
  }
  ctx.drawImage(C.c, 0, 0);

  // paper: fibre and mottling over everything; the light falls from the top left
  {
    const [t, tx] = layer(), id = tx.createImageData(W, H), d = id.data, R = rng(4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, m = fbm(N, x * .012, y * .012, 3), f = R() < .004 ? 40 : 0, v = 235 + m * 22 - f;
      d[i] = v; d[i + 1] = v - 3; d[i + 2] = v - 8; d[i + 3] = 255;
    }
    tx.putImageData(id, 0, 0); blurInto(ctx, t, .5, 'multiply', .45);
  }
  radial(ctx, 120, 160, 1500, [[0, 'rgba(255,248,235,.42)'], [1, 'rgba(255,248,235,0)']], 'screen');
  radial(ctx, 1080, 1920, 1300, [[0, 'rgba(70,40,30,.28)'], [1, 'rgba(70,40,30,0)']], 'multiply');
  vignette(ctx, .3, '50,30,20'); grain(ctx, 9, 3);
  window.done = true;
})();
