// subtitle_demo/story.js: two narration lines as karaoke subtitles (the spoken word lights up, the rest waits dimmed)
// on a dark pill in the subtitle-safe band, under a big title, the way auto-polish adds them to every narrated shot.
// The second line is long on purpose: it must wrap to two lines inside the safe band in every format.
(() => {
  const NARRATION = [
    { at: .2, end: 1.7, text: 'ส้มเขียวหวานจากเชียงใหม่' },
    { at: 1.8, end: 3.8, text: 'เดินทางไกลกว่าเจ็ดร้อยกิโลเมตร เพื่อมาถึงตลาดในกรุงเทพฯ ตอนเช้ามืด' },
  ];
  const C = { paper: '#F3EFE6', ink: '#22202A', orange: '#E8541E', mint: '#9ED9C4' };
  const decor = [(t) => {
    boilSeed('sub-a'); paint(ellPts(W * .5 + 12 * wob(t, .2), H * .52, Math.min(W, H) * .32, Math.min(W, H) * .32, 32, 4), { fill: C.orange, fillOp: 255, bleed: .15, tex: .4, ink: null });
    boilSeed('sub-b'); paint(rrPts(0, H * .74, W, H * .26, 0), { wash: C.mint, ink: null });
  }];
  playType({
    background: C.paper, narration: NARRATION, decor,
    items: [
      { at: .1, end: 3.9, text: 'ส้มเดินทาง', preset: 'pop', x: .5, y: .16, maxLines: 1, style: { font: 'display', weight: 800, size: 140, color: C.ink } },
      { say: 0, preset: 'subtitle' },
      { say: 1, preset: 'subtitle' },
    ],
  });
})();
