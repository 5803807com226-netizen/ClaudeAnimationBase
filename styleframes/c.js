// Style C, "Watercolor Ink Mind": milky water and paper light. The message, a coral drop, dissolves; its threads rise
// and are pulled into an indigo vortex of thought above her head. One accent colour, everything else ink and light.
(async () => {
  const ctx = document.getElementById('c').getContext('2d'), N = makeNoise(5), R = rng(21);
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#F7F2EA'); g.addColorStop(.6, '#EEE6DA'); g.addColorStop(1, '#E2D8CA');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  radial(ctx, 560, 120, 1100, [[0, 'rgba(255,253,246,.9)'], [1, 'rgba(255,253,246,0)']]);

  const V = [560, 640], SRC = [600, 1010];   // the vortex; the message drop (just above her head)
  const step = (x, y, up = .55, wander = .55) => {
    const dx = x - V[0], dy = y - V[1], d = Math.hypot(dx, dy) + 1, s = 2.2 * Math.exp(-d / 430), pull = .5 * Math.exp(-d / 650);
    const n = fbm(N, x * .0026, y * .0026, 3) * TAU * 1.3;
    let vx = -dy / d * s - dx / d * pull + Math.cos(n) * wander, vy = dx / d * s - dy / d * pull + Math.sin(n) * wander - up * (1 - Math.exp(-d / 500));
    const m = Math.hypot(vx, vy) || 1; return [vx / m * 2.4, vy / m * 2.4];
  };
  const trace = (x, y, steps, up, wander) => { const p = [[x, y]]; for (let i = 0; i < steps; i++) { const [vx, vy] = step(x, y, up, wander); x += vx; y += vy; p.push([x, y]); } return p; };
  const strokePath = (c, p) => { c.beginPath(); p.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke(); };
  const gauss = () => (R() + R() + R() - 1.5) / 1.5;

  // indigo thought: soft billows (blurred), then fine filaments, then a dense core
  { const [l, lx] = layer(); lx.lineCap = 'round';
    for (let i = 0; i < 1300; i++) { const x = V[0] + gauss() * 560, y = V[1] + gauss() * 500, f = Math.exp(-((x - V[0]) ** 2 + (y - V[1]) ** 2) / (2 * 380 * 380));
      lx.lineWidth = 10 + R() * 16; lx.strokeStyle = `rgba(${R() < .2 ? '30,70,90' : '28,36,84'},${.026 * f})`; strokePath(lx, trace(x, y, 110, .3)); }
    blurInto(ctx, l, 14, 'multiply'); }
  { const [l, lx] = layer();
    for (let i = 0; i < 900; i++) { const x = V[0] + gauss() * 500, y = V[1] + gauss() * 450, f = Math.exp(-((x - V[0]) ** 2 + (y - V[1]) ** 2) / (2 * 340 * 340));
      lx.lineWidth = .7 + R(); lx.strokeStyle = `rgba(22,28,66,${.1 * f})`; strokePath(lx, trace(x, y, 120, .3)); }
    blurInto(ctx, l, .6, 'multiply'); }
  // the message dissolving: wet-in-wet coral plumes rising off the drop, widening and paling as they are wound into
  // the vortex (soft blooms, blurred), with a few fine filaments for detail
  { const [l, lx] = layer(), [f, fx] = layer(); fx.lineCap = 'round';
    for (let i = 0; i < 240; i++) {
      const p = trace(SRC[0] + gauss() * 120, SRC[1] - 90 + gauss() * 30, 170 + R() * 150, 1.2, 1.2), n = p.length, warm = R() < .25;
      for (let j = 0; j < n; j += 3) {
        const k = j / n, r = 3 + k * 26 * (.6 + R() * .8), sp = 8 + k * 110;    // diffusing sideways as it travels
        lx.fillStyle = `rgba(${warm ? '240,165,150' : '226,118,104'},${.09 * Math.sin(Math.PI * Math.min(1, k * 1.15)) ** .8})`;
        lx.beginPath(); lx.arc(p[j][0] + gauss() * sp, p[j][1] + gauss() * sp, r, 0, TAU); lx.fill();   // faint at the drop, fullest mid-rise
      }
      if (i % 8 === 0) { fx.lineWidth = .8; fx.strokeStyle = 'rgba(205,95,75,.16)'; strokePath(fx, p.slice(0, Math.floor(n * .7))); }
    }
    blurInto(ctx, l, 10, 'source-over', .68); blurInto(ctx, l, 2, 'source-over', .22); blurInto(ctx, f, .6, 'multiply', .8); }   // built with normal blending: overlaps saturate to coral, never darker
  { const [l, lx] = layer();   // the drop itself: crisp at the top, its lower edge already breaking up into the water
    bubblePath(lx, SRC[0], SRC[1], 300, 176, 52); lx.fillStyle = '#E0664F'; lx.fill();
    const lg = lx.createLinearGradient(0, SRC[1] - 90, 0, SRC[1] + 90); lg.addColorStop(0, 'rgba(255,215,195,.45)'); lg.addColorStop(1, 'rgba(255,215,195,0)');
    lx.save(); lx.clip(); lx.fillStyle = lg; lx.fillRect(0, 0, W, H); lx.restore();
    lx.fillStyle = 'rgba(255,235,225,.75)'; [[.58, -.16], [.44, .06], [.26, .26]].forEach(([len, dy]) => { pill(lx, SRC[0] - 105, SRC[1] + dy * 176, 300 * len * .8, 13); lx.fill(); });
    const [m, mx] = layer(), fg = mx.createLinearGradient(0, SRC[1] - 10, 0, SRC[1] + 100); fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(1, 'rgba(0,0,0,1)');
    mx.fillStyle = fg; mx.fillRect(0, SRC[1] - 10, W, 200);
    for (let i = 0; i < 70; i++) { mx.fillStyle = 'rgba(0,0,0,.6)'; mx.beginPath(); mx.arc(SRC[0] - 160 + R() * 320, SRC[1] + 5 + R() * 60, 6 + R() * 18, 0, TAU); mx.fill(); }   // where the edge is already dissolving
    lx.save(); lx.globalCompositeOperation = 'destination-out'; lx.filter = 'blur(7px)'; lx.drawImage(m, 0, 0); lx.restore();
    { const [b, bx] = layer(); for (let i = 0; i < 40; i++) { bx.fillStyle = 'rgba(224,102,79,.035)'; bx.beginPath(); bx.arc(SRC[0] - 150 + R() * 300, SRC[1] + 40 + R() * 120, 20 + R() * 50, 0, TAU); bx.fill(); }
      blurInto(ctx, b, 22, 'multiply'); }   // the coral bleeding into the water below the drop
    ctx.save(); ctx.shadowColor = 'rgba(224,102,79,.35)'; ctx.shadowBlur = 40; ctx.drawImage(l, 0, 0); ctx.restore(); }

  // suspended air: a few tiny bubbles catching light
  for (let i = 0; i < 46; i++) { const x = R() * W, y = 120 + R() * 1250, r = 1.5 + R() * 5;
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(x - r * .35, y - r * .35, r * .3, 0, TAU); ctx.fill(); }

  // her, small at the bottom, looking up into it; a soft pool of shadow under her feet
  radial(ctx, 540, 1850, 260, [[0, 'rgba(60,50,70,.22)'], [1, 'rgba(60,50,70,0)']], 'multiply');
  const C = await characterLayer({ x: 540, y: 1860, h: 700, aspect: .66 }, { slotColor: 'rgba(60,60,90,.45)' });
  if (C.ok) lightOn(C, 560, 900, 700, 'rgba(255,250,240,.12)');
  ctx.drawImage(C.c, 0, 0);

  // caustic light from above, paper grain
  { const [l, lx] = layer(); for (let i = 0; i < 7; i++) { const x = 120 + R() * 840, w = 30 + R() * 90; const lg = lx.createLinearGradient(0, 0, 0, 1300); lg.addColorStop(0, 'rgba(255,255,250,.22)'); lg.addColorStop(1, 'rgba(255,255,250,0)'); lx.fillStyle = lg; lx.beginPath(); lx.moveTo(x, 0); lx.lineTo(x + w, 0); lx.lineTo(x + w * 2.4, 1300); lx.lineTo(x + w * 1.2, 1300); lx.fill(); }
    blurInto(ctx, l, 24, 'screen', .8); }
  vignette(ctx, .22, '70,50,40'); grain(ctx, 11, 9);
  window.done = true;
})();
