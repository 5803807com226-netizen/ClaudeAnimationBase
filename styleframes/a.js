// Style A, "Night Glow": cinematic low-key night. The one message is a luminous glass card; its replays recede behind
// her into the dark on a spiral, losing focus with depth. Warm phone light from below, cool bounce from the cards.
(async () => {
  const ctx = document.getElementById('c').getContext('2d'), R = rng(11), N = makeNoise(3);

  // night: a deep blue wash with watercolour blooms (kin to the character's medium), lit softly from above
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0B1233'); g.addColorStop(.55, '#131D48'); g.addColorStop(1, '#060918');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  radial(ctx, 560, 640, 980, [[0, 'rgba(84,104,190,.38)'], [1, 'rgba(0,0,0,0)']], 'screen');
  radial(ctx, 150, 1550, 760, [[0, 'rgba(40,140,150,.16)'], [1, 'rgba(0,0,0,0)']], 'screen');
  {
    const [t, tx] = layer(), id = tx.createImageData(W, H), d = id.data;
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
      const v = fbm(N, x * .0035, y * .0035, 5), a = Math.pow(clamp(v * .9 + .5), 3) * 60, e = Math.abs(v) < .02 ? 30 : 0;   // blooms + dried edges
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const i = ((y + dy) * W + x + dx) * 4; d[i] = d[i + 1] = 210; d[i + 2] = 255; d[i + 3] = a + e; }
    }
    tx.putImageData(id, 0, 0); blurInto(ctx, t, 3, 'screen', .3);
  }

  // far bokeh
  {
    const [b, bx] = layer();
    for (let i = 0; i < 70; i++) {
      const x = R() * W, y = R() * H * .85, r = 6 + R() * 44, col = ['255,150,120', '130,190,255', '255,232,205'][Math.floor(R() * 3)], a = .05 + .12 * R();
      bx.fillStyle = `rgba(${col},${a})`; bx.beginPath(); bx.arc(x, y, r, 0, TAU); bx.fill();
      bx.strokeStyle = `rgba(${col},${a * 1.7})`; bx.lineWidth = 1.5; bx.stroke();
    }
    blurInto(ctx, b, 7, 'screen');
  }

  function glassCard(c, x, y, w, h, o = {}) {
    const r = h * .3;
    c.save(); c.translate(x, y); c.rotate(o.rot || 0); c.translate(-x, -y);
    c.shadowColor = o.glow || 'rgba(120,170,255,.4)'; c.shadowBlur = h * .4;
    bubblePath(c, x, y, w, h, r); c.fillStyle = o.body || 'rgba(70,92,160,.38)'; c.fill(); c.shadowBlur = 0;
    let gg = c.createLinearGradient(x - w / 2, y - h / 2, x + w / 2, y + h / 2);
    gg.addColorStop(0, 'rgba(255,255,255,.24)'); gg.addColorStop(.5, 'rgba(255,255,255,.06)'); gg.addColorStop(1, 'rgba(255,255,255,.13)'); c.fillStyle = gg; c.fill();
    if (o.tint) { gg = c.createRadialGradient(x + w * .25, y - h * .2, 0, x + w * .25, y - h * .2, w * .75); gg.addColorStop(0, o.tint); gg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gg; c.fill(); }
    c.save(); c.clip(); c.globalCompositeOperation = 'screen';
    gg = c.createLinearGradient(x - w * .55, y - h * .7, x - w * .05, y + h * .5);
    gg.addColorStop(0, 'rgba(255,255,255,0)'); gg.addColorStop(.45, 'rgba(255,255,255,.2)'); gg.addColorStop(.56, 'rgba(255,255,255,.02)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gg; c.fillRect(x - w, y - h, w * 2, h * 2); c.restore();
    gg = c.createLinearGradient(x, y - h / 2, x, y + h / 2); gg.addColorStop(0, 'rgba(255,255,255,.95)'); gg.addColorStop(.5, 'rgba(255,255,255,.3)'); gg.addColorStop(1, 'rgba(255,255,255,.55)');
    c.strokeStyle = gg; c.lineWidth = Math.max(1.4, h * .014); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.2)'; c.beginPath(); c.arc(x - w / 2 + h * .32, y - h * .08, h * .14, 0, TAU); c.fill();       // avatar
    c.fillStyle = 'rgba(232,240,255,.6)';
    [[.62, -.2], [.5, .02], [.3, .22]].forEach(([len, dy]) => { pill(c, x - w / 2 + h * .58, y + dy * h, w * len * .82, h * .075); c.fill(); });   // lines, never letters
    if (o.dot) { c.shadowColor = 'rgba(255,120,90,.95)'; c.shadowBlur = h * .2; c.fillStyle = '#FF7A5C'; c.beginPath(); c.arc(x + w / 2 - h * .26, y - h * .26, h * .055, 0, TAU); c.fill(); }
    c.restore();
  }

  // the replays: a spiral receding behind her head, out of focus with depth
  const VP = [520, 720], echoes = [];
  for (let i = 1; i <= 13; i++) {
    const z = 1.3 + (i - 1) * .45, a = -1.9 + i * .8;
    echoes.push({ z, x: VP[0] + Math.cos(a) * 940 / z, y: VP[1] + Math.sin(a) * 640 / z - 60 / z, w: 520 / z, h: 300 / z });
  }
  {
    const [t, tx] = layer(), pts = [];   // light trail through the spiral
    for (let s = 0; s <= 1; s += .004) { const i = 1 + s * 12, z = 1.3 + (i - 1) * .45, a = -1.9 + i * .8; pts.push([VP[0] + Math.cos(a) * 940 / z, VP[1] + Math.sin(a) * 640 / z - 60 / z]); }
    const gg = tx.createLinearGradient(0, 300, 0, 1200); gg.addColorStop(0, 'rgba(140,200,255,.0)'); gg.addColorStop(.5, 'rgba(140,200,255,.55)'); gg.addColorStop(1, 'rgba(255,140,110,.6)');
    tx.strokeStyle = gg; tx.lineWidth = 3.2; tx.beginPath(); pts.forEach(([x, y], i) => i ? tx.lineTo(x, y) : tx.moveTo(x, y)); tx.stroke();
    blurInto(ctx, t, 10, 'screen'); blurInto(ctx, t, 0, 'screen', .8);
  }
  for (const e of echoes.slice().reverse()) {
    const [l, lx] = layer(); glassCard(lx, e.x, e.y, e.w, e.h, { glow: 'rgba(110,160,255,.35)' });
    blurInto(ctx, l, Math.min(9, (e.z - 1) * 1.9), 'source-over', clamp(1.15 - e.z * .09, .45, 1));
  }

  // her: medium shot, cooled into the night, warm phone light from below, cool rim from the cards
  const C = await characterLayer({ x: 470, y: 2060, h: 1260, crop: [0, .62], aspect: .62 }, { slotColor: 'rgba(200,215,255,.5)' });
  if (C.ok) {
    grade(C, '#56609A');
    lightOn(C, 470, 1900, 900, 'rgba(255,170,120,.55)');
    lightOn(C, 640, 600, 520, 'rgba(150,200,255,.35)');
  }
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 60; ctx.drawImage(C.c, 0, 0); ctx.restore();
  radial(ctx, 470, 1860, 620, [[0, 'rgba(255,165,110,.33)'], [1, 'rgba(0,0,0,0)']], 'screen');   // phone glow pooling below frame

  // the original, in focus, in front: coral-lit, unread
  { const [l, lx] = layer(); glassCard(lx, 790, 690, 480, 278, { body: 'rgba(60,40,70,.5)', rot: -.05, glow: 'rgba(255,130,100,.55)', tint: 'rgba(255,120,90,.35)', dot: true }); blurInto(ctx, l, 0); }

  // near, out-of-focus foreground bokeh
  {
    const [b, bx] = layer();
    [[90, 380, 120, '255,140,110'], [1010, 1240, 160, '120,190,255'], [980, 260, 70, '255,220,190'], [140, 1700, 140, '255,150,120']].forEach(([x, y, r, col]) => {
      bx.fillStyle = `rgba(${col},.16)`; bx.beginPath(); bx.arc(x, y, r, 0, TAU); bx.fill();
    });
    blurInto(ctx, b, 26, 'screen');
  }
  vignette(ctx, .62); grain(ctx, 16, 5);
  window.done = true;
})();
