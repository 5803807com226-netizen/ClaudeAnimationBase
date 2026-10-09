// src/plan/play.js: plays a COMPILED shot plan (tools/compile_plan.mjs writes plan.js, which sets PLAN and calls
// playPlan). Generic: there is no shot-specific code anywhere. Per shot: the camera capability draws the world-space
// layers inside it (a map camera draws map layers; cameraMove draws objects), then screen-space layers (transitions),
// then typography. Every time in a layer's params is SHOT-LOCAL seconds, so one shot renders the same alone or in the film.
function playPlan(plan) {
  shots(plan.shots.map(s => {
    const typeItems = s.layers.filter(L => L.space === 'text').map(L => ({ id: L.id, ...L.params, preset: L.cap.slice(5) }));
    const overlay = typeItems.length ? typeOverlay({ items: typeItems }) : null;
    const world = s.layers.filter(L => L.space === 'world'), screen = s.layers.filter(L => L.space === 'screen');
    return [s.start, (t, lt) => {
      background(s.background || plan.background || '#F3EBDD');
      const inner = () => world.forEach(L => preset(L.cap, lt, { id: L.id, ...L.params }));
      if (s.camera) preset(s.camera.cap, lt, { id: s.id + ':camera', ...s.camera.params }, inner); else inner();
      screen.forEach(L => preset(L.cap, lt, { id: L.id, ...L.params }));
      if (overlay) overlay.draw(lt);
    }];
  }));
  window.PLAN_INFO = { id: plan.id, hash: plan.catalog, shots: plan.shots.map(s => ({ id: s.id, start: s.start, end: s.end })) };
}
