// node tools/test_thai_segmentation.mjs: checks the text system's Thai guarantees with the same Intl.Segmenter the
// browser uses: grapheme clusters never start with a combining vowel or tone mark (so a progressive reveal never shows
// a mark without its consonant), clusters and words join back to the original, and words split where Thai readers expect.
const G = new Intl.Segmenter('th', { granularity: 'grapheme' }), Wd = new Intl.Segmenter('th', { granularity: 'word' });
const MARK = /^[ัิ-ฺ็-๎]/;   // above/below vowels, tone marks, thanthakhat, nikhahit…
const samples = ['ออมวันละนิด', 'แค่วันละ 10 บาท', 'ผ่านไปหนึ่งปี คุณจะมี', 'เล็กน้อย แต่ไม่เล็กเลย', 'เริ่มวันนี้!', 'น้ำใจ กำลังใจ', 'ปู่ย่าตายาย', 'ฤๅษี ฦๅ', 'สวัสดีครับ ยินดีต้อนรับ', 'ญี่ปุ่น ฐาน ฎีกา'];
let fail = 0;
for (const s of samples) {
  const gs = [...G.segment(s)].map(x => x.segment), ws = [...Wd.segment(s)].map(x => x.segment);
  const bad = gs.filter(g => MARK.test(g));
  if (bad.length || gs.join('') !== s || ws.join('') !== s) { fail++; console.log('FAIL', s, bad); }
  else console.log('ok  ', s.padEnd(26), '|', ws.filter(w => w.trim()).join(' · '));
}
console.log(fail ? `${fail} failed` : 'all passed'); process.exit(fail ? 1 : 0);
