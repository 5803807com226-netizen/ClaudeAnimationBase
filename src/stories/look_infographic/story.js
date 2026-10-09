// look_infographic/story.js: "เติบโตทุกปี" (growing every year): painted bars grow in, a counter lands on +128%, soft
// abstract shapes drift behind. Everything is placed in the title-safe area with responsive.js, so it reads the same at
// 9:16, 16:9 and 4:5; the finish (grade, light, texture) comes from the project's look, not from this file.
(() => {
  const C = { paper: '#F2EEE6', ink: '#262433', bars: ['#9DBEDF', '#8FB5D6', '#5B8FC2', '#2F6AA6'], accent: '#E2735A', soft: '#E8DCEF', sun: '#FFD27A' };
  const NARRATION = [{ at: .15, end: .9, text: 'เติบโตทุกปี' }, { at: 1.6, end: 2.6, text: '+128' }];
  const VALUES = [.32, .5, .71, 1];
  const chart = () => {   // the chart's box: the lower part of the title-safe area (tall) or its right half (wide)
    const sa = safeArea('title');
    return byAspect({ wide: { x0: sa.x0 + sa.w * .52, x1: sa.x1, y0: sa.y0 + sa.h * .18, y1: sa.y1 } }, { x0: sa.x0 + sa.w * .04, x1: sa.x1 - sa.w * .04, y0: sa.y0 + sa.h * .42, y1: sa.y1 });
  };
  const decor = [(t) => {
    const s = US();
    boilSeed('blob-a'); paint(ellPts(W * .82 + 14 * wob(t, .15), H * .16, W * .3, W * .3, 30, 4), { wash: C.soft, washOp: 150, ink: null });
    boilSeed('blob-b'); paint(ellPts(W * .12, H * .88 + 10 * wob(t, .12, .4), W * .24, W * .22, 30, 4), { wash: C.sun, washOp: 110, ink: null });
    const b = chart(), n = VALUES.length, gap = (b.x1 - b.x0) * .06, bw = ((b.x1 - b.x0) - gap * (n - 1)) / n;
    VALUES.forEach((v, i) => {
      const k = backOut(seg(t, .5 + i * .22, 1.2 + i * .22)), h = (b.y1 - b.y0) * v * k, x = b.x0 + i * (bw + gap);
      if (h < 2) return;
      boilSeed('bar' + i); paint(rrPts(x, b.y1 - h, bw, h, Math.min(14 * s, bw * .2)), { wash: C.bars[i], ink: C.ink, sw: 1.1 });
    });
    inkLine([[b.x0 - 10 * s, b.y1], [b.x1 + 10 * s, b.y1]], 1.6, C.ink, 'ink', .2);   // the baseline, over the bars' feet
    const top = VALUES.length - 1, k = seg(t, 1.9, 2.3);   // a light on the tallest bar when the counter lands
    if (k > 0) glow(b.x0 + top * (bw + gap) + bw / 2, b.y0, 160 * s, C.sun, .7 * k);
  }];
  playType({
    background: C.paper, narration: NARRATION, decor, fade: { color: C.paper },
    items: [
      { say: 0, preset: 'pop', stagger: .08, maxLines: 1, x: .5, y: byAspect({ wide: .2 }, .14), maxWidth: byAspect({ wide: .5 }, .8),
        style: { font: 'display', weight: 800, size: byAspect({ wide: 120 }, 150), color: C.ink } },
      { say: 1, preset: 'counter', text: '', from: 0, to: 128, prefix: '+', suffix: '%', dur: .9, flash: C.accent, x: byAspect({ wide: .26 }, .5), y: byAspect({ wide: .55 }, .3),
        maxWidth: byAspect({ wide: .42 }, .8), style: { font: 'display', weight: 800, size: byAspect({ wide: 190 }, 230), color: C.accent }, suffixStyle: { size: 120, weight: 700, color: C.ink } },
    ],
  });
})();
