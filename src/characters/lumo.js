// lumo.js: "Lumo", an original paper-lantern creature, built ENTIRELY from transparent PNG layers on the cutout rig
// (src/rig/cutout.js): the layered-artwork path. Expressions are separate layers swapped by the pose (eyes_open,
// eyes_wide, eyes_happy, eyes_blink; mouth_smile, mouth_o, mouth_open). The images in assets/characters/lumo/ are
// stand-ins from tools/make_lumo_layers.py: an illustrator's layers with the same names, sizes and anchors drop in as is.
// One code-painted part (the halo of light) shows painter and PNG parts mixing in one character.
// Registered as CHARACTERS.lumo; exposes the actor adapter: feet, head, pose(channels).
//
// Layer sizes and anchors are in character units (u = half the lantern's width, ~.8 of it):
//   body 2.0 × 2.7 @ (1.0, 1.35) · eyes 1.0 × .5 @ (.5, .25) · mouth .5 × .35 @ (.25, .12) · leg .36 × .9 @ (.18, .04)
//   arm .62 × .24 @ (.04, .12) · handle .7 × .55 @ (.35, .52)
function makeLumo(o = {}) {
  const A = o.assets || 'assets/characters/lumo/', img = (f, w, h, ax, ay) => ({ src: A + f + '.png', w, h, anchor: [ax, ay] });
  const pick = (names, fn) => ({ src: Object.fromEntries(names.map(n => [n, A + n + '.png'])), pick: fn });
  const F = .12;                                   // the face sits toward the way Lumo walks
  const parts = [
    { name: 'halo', parent: 'body', joint: [0, 0], z: -1, draw: (u, pose) => {   // code-painted light, behind the lantern
      const g = pose.glow ?? 1; glow(0, 0, u * 2.6 * (.85 + .15 * g), o.light || '#FFC066', clamp(.55 * g, 0, 1));
    } },
    { name: 'body', z: 1, img: img('body', 2.0, 2.7, 1.0, 1.35) },
    { name: 'handle', parent: 'body', joint: [0, -1.08], z: .5, drag: .9, img: img('handle', .7, .55, .35, .52) },
    { name: 'legL', parent: 'body', joint: [-.3, 1.06], z: 0, img: img('leg', .36, .9, .18, .04) },
    { name: 'legR', parent: 'body', joint: [.3, 1.06], z: 0, img: img('leg', .36, .9, .18, .04) },
    { name: 'armL', parent: 'body', joint: [-.8, .2], z: 2, drag: .5, img: img('arm', .62, .24, .04, .12) },
    { name: 'armR', parent: 'body', joint: [.8, .2], z: 2, drag: .5, img: img('arm', .62, .24, .04, .12) },
    { name: 'eyes', parent: 'body', joint: [F, -.15], z: 3, img: { ...pick(['eyes_open', 'eyes_wide', 'eyes_happy', 'eyes_blink'], p => {
      const f = p.face || {}; return f.happy > .5 ? 'eyes_happy' : f.blink > .5 ? 'eyes_blink' : f.wide > .3 ? 'eyes_wide' : 'eyes_open';
    }), w: 1.0, h: .5, anchor: [.5, .25] } },
    { name: 'mouth', parent: 'body', joint: [F, .3], z: 3, img: { ...pick(['mouth_smile', 'mouth_o', 'mouth_open'], p => {
      const f = p.face || {}; return f.mouth === 'open' || f.open > .05 ? 'mouth_open' : f.mouth === 'o' ? 'mouth_o' : 'mouth_smile';
    }), w: .5, h: .35, anchor: [.25, .12] } },
  ];
  return { ...defineCharacter({ id: o.id || 'lumo', parts, lag: .12 }),
    feet: 1.06 + .82, head: [F, -.15],
    // a printed face can't move its pupils, so the whole eye layer glances toward the look target
    pose: c => ({ legL: { rot: c.legL * .8 }, legR: { rot: c.legR * .8 }, armL: { rot: Math.PI + c.armL }, armR: { rot: c.armR },
      eyes: { dx: c.look[0] * .07, dy: c.look[1] * .05 }, glow: c.glow ?? 1,
      face: { blink: c.blink, wide: c.wide, happy: c.happy, mouth: c.mouth, open: c.open } }) };
}
CHARACTERS.lumo = makeLumo;
