// systems/world.js: Procedural World & Parallax. A world is a ground function plus layers at depths; each layer is
// tiled endlessly and its tiles are painted by a theme's painter with stable per-tile randomness, so props repeat
// without ever being placed by hand. Optional reveal front: the world draws itself ahead of a moving point and props
// grow in as it passes. Pure functions of time; the look lives in the theme (e.g. src/worlds/meadow.js).
//
//   const world = makeWorld({ ground: x => y, reveal: t => frontX (optional), layers: [
//     { name, depth (1 = moves with the world, < 1 far, > 1 foreground), tile (px), draw(tile) }, ...] });
//   drawLayers(world, t, L => L.depth <= 1)     inside a camera (camBegin … camEnd); far to near
//   followCam(t, target, { lag, lead, offset, lockY })   a camera centre that trails a moving target and leads its motion
//
// draw(tile) gets { i, x0, x1 (tile span in the layer's space), r(k) (stable random 0..1 for this tile), t, front (the
// reveal front in this layer's space, Infinity without one), grow(x) (0 → 1 with overshoot as the front passes x), world }.

function makeWorld(o) { return { layers: [], ...o, layers: (o.layers || []).map(L => ({ seed: 0, ...L })) }; }

function drawLayers(world, t, pick = () => true) {
  const cam = CAM || { cx: PARALLAX_REF[0], cy: PARALLAX_REF[1], zoom: 1 };
  for (const L of world.layers) {
    if (!pick(L)) continue;
    const shift = (cam.cx - PARALLAX_REF[0]) * (1 - L.depth), view = W / 2 / cam.zoom + L.tile;   // same anchor as parallax()
    const front = world.reveal ? world.reveal(t) - shift : Infinity;   // the same screen position at every depth
    const grow = x => world.reveal ? backOut(clamp((front - x) / (L.growDist ?? 160))) : 1;
    parallax(L.depth, () => {
      const c = cam.cx - shift;
      for (let i = Math.floor((c - view) / L.tile); i <= Math.floor((c + view) / L.tile); i++) {
        const x0 = i * L.tile; if (x0 > front) break;
        boilSeed(L.name + '|' + i);
        L.draw({ i, x0, x1: x0 + L.tile, r: k => hash(i * 71.31 + k * 13.7 + L.seed * 3.1), t, front, grow, world, layer: L });
      }
    });
    lookHaze(L.depth, world.haze);   // look.js: atmospheric depth on far layers (off unless the style has haze)
  }
}

// Points along the ground from x0 to x1 (stopping at the reveal front), then down to `bottom`: a closed shape for paint().
function groundShape(fn, x0, x1, bottom, step = 30, front = Infinity) {
  const end = Math.min(x1, front), top = [];
  if (end <= x0) return null;
  for (let x = x0; x < end; x += step) top.push([x, fn(x)]);
  top.push([end, fn(end)]);
  return { top, shape: top.concat([[end, bottom], [x0, bottom]]) };
}

function followCam(t, target, o = {}) {
  const n = o.n ?? 10, lag = o.lag ?? .4; let x = 0, y = 0;
  for (let i = 0; i < n; i++) { const [a, b] = target(t - lag * i / (n - 1)); x += a / n; y += b / n; }
  const [vx, vy] = velocity(target, t), off = o.offset || [0, 0];
  return [x + vx * (o.lead ?? 0) + off[0], o.lockY != null ? o.lockY : y + vy * (o.lead ?? 0) + off[1]];
}
