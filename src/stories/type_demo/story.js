// type_demo/story.js: "ออมวันละนิด" (save a little each day), 5 s of Thai kinetic typography using all six presets.
// DATA: the narration timestamps drive the timing; items pick a preset, a style and a place. The same file lays itself
// out for 9:16 (one column) or 16:9 (two columns), depending on the canvas it runs on.
(() => {
  const NARRATION = [
    { at: .15, end: .95, text: 'ออมวันละนิด' },
    { at: .7, end: 1.35, text: 'แค่วันละ 10 บาท' },
    { at: 1.35, end: 2.35, text: 'ผ่านไปหนึ่งปี คุณจะมี' },
    { at: 2.3, end: 3.2, text: '3,650' },
    { at: 3.15, end: 4.15, text: 'เล็กน้อย แต่ไม่เล็กเลย' },
    { at: 4.1, end: 4.7, text: 'เริ่มวันนี้!' },
  ];
  const C = { paper: '#F4ECDF', ink: '#2B2233', coral: '#E2735A', teal: '#2F8F8A', mustard: '#F6C85F', soft: '#EAD9C4' };
  const TALL = H > W;
  // layout per aspect: [x, y] for each narration line, and a column width
  const POS = TALL ? [[.5, .13], [.5, .225], [.5, .355], [.5, .49], [.5, .645], [.5, .8]]
                   : [[.3, .2], [.3, .34], [.3, .52], [.72, .26], [.72, .5], [.72, .74]];
  const MW = TALL ? .86 : .42, sz = (tall, wide) => TALL ? tall : wide;
  const at = (i, o) => ({ say: i, x: POS[i][0], y: POS[i][1], maxWidth: MW, ...o });

  // decor: soft painted shapes behind the text (no text in them), drifting slowly
  const decor = [(t) => {
    boilSeed('decor-a'); paint(ellPts(W * (TALL ? .86 : .9) + 10 * wob(t, .2), H * .08, W * .28, W * .28, 30, 4), { fill: C.coral, fillOp: 70, bleed: .2, tex: .5, ink: null });
    boilSeed('decor-b'); paint(ellPts(W * .08, H * (TALL ? .93 : .9) + 8 * wob(t, .17, .3), W * .22, W * .2, 30, 4), { fill: C.mustard, fillOp: 90, bleed: .2, tex: .5, ink: null });
    boilSeed('decor-c'); paint(rrPts(W * .06, H * (TALL ? .57 : .085), W * (TALL ? .88 : .3), 6, 3), { wash: C.soft, ink: null });
  }];

  playType({
    background: C.paper, narration: NARRATION, decor, fade: { color: C.paper },
    items: [
      at(0, { preset: 'pop', stagger: .09, style: { font: 'display', weight: 800, size: sz(165, 130), color: C.ink, shadow: { color: 'rgba(43,34,51,.18)', dy: 8 } } }),
      at(1, { preset: 'slide', from: 'below', bar: C.mustard, style: { font: 'display', weight: 500, size: sz(92, 72), color: C.coral } }),
      at(2, { preset: 'reveal', cursor: C.coral, style: { font: 'body', weight: 600, size: sz(80, 62), color: C.ink } }),
      at(3, { preset: 'counter', text: '', from: 0, to: 3650, dur: .9, suffix: 'บาท', flash: C.coral,
              style: { font: 'display', weight: 800, size: sz(240, 170), color: C.teal, shadow: { color: 'rgba(47,143,138,.25)', dy: 10 } },
              suffixStyle: { size: sz(104, 80), weight: 700, color: C.ink } }),
      at(4, { preset: 'highlight', style: { font: 'display', weight: 700, size: sz(92, 66), color: C.ink, highlight: C.mustard } }),
      at(5, { preset: 'impact', from: 2.8, burst: C.ink, style: { font: 'display', weight: 800, size: sz(200, 140), color: C.coral, stroke: { color: C.paper, width: 10 }, shadow: { color: 'rgba(43,34,51,.25)', dy: 10 } } }),
    ],
  });
})();
