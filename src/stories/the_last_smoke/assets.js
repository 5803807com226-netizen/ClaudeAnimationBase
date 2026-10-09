// the_last_smoke/assets.js: the GENERATION manifest for tools/gen_assets.mjs (data only; nothing here draws). One
// identity anchor: master_3q.png (Z-Image) is generated and APPROVED first; every other view, rig part and detail is
// a Qwen-Image EDIT with that master (or a view derived from it) as the reference image (`ref`), never an
// independent text-to-image of "an old man". Overlays (closed eyes, 3/4 head / scarf / cloak, back head / scarf) are
// cut with derive op 'region' from the SAME image as their base, so they are registered to the pixel.
// Order (each step reviewed before the next; see docs/THE_LAST_SMOKE_STAGE2.md):
//   1 smoke_master --only=master_3q   → approve   2 smoke_master (turnaround)   3 smoke_rig   4 smoke_hero3q / smoke_face /
//   smoke_back / smoke_details        5 smoke_env / smoke_fx
// Files are lower_snake_case (pilot asset_manifest MASTER_3Q.png = character/master_3q.png, rig/hand_R_grip.png =
// rig/hand_r_grip.png, …). Generation sizes are model sizes; layer `size` is the display px the rig needs.
(() => {
  const R = window.SMOKE_RIG, BASE = 'assets/stories/the_last_smoke/', PX = R.px_per_u;
  const STYLE = 'premium painterly 2.5D animated feature-film illustration, semi-realistic cartoon, believable adult anatomy, ' +
    'soft matte hand-painted surface detail, subtle painterly grain, natural dawn light with warm/cool separation and subtle rim light, ' +
    'crisp clean silhouette, earth-tone palette, no watercolor bleed, no paper-cut border, no text, no watermark, no logo, no signature';   // in the POSITIVE too: Z-Image Turbo (cfg 1) ignores the negative
  const NEG = 'photograph, photorealistic live-action, plastic 3d render, flat vector, chibi, anime, oversized head, inconsistent face, ' +
    'extra limbs, extra fingers, fused fingers, broken anatomy, melted props, blurry, motion blur, cropped feet, mirrored character, ' +
    'second person, crowd, modern clothing, metal, text, letters, numbers, logo, watermark, signature, caption, UI';
  const HERO = 'the same single elderly ancient traveller, male about 62, lean sinewy slightly stooped, warm medium-brown weathered skin, ' +
    'deep-set amber-brown eyes with crow\'s feet, long narrow slightly hooked nose, high cheekbones, short gray-charcoal beard, ' +
    'silver-gray hair in a half-up knot with flyaway strands, a short thin healed scar on his anatomical LEFT cheek, ' +
    'rough woven off-white long tunic, faded brown short layered mantle, narrow torn charcoal-beige scarf, aged hide crossbody satchel ' +
    'on his right hip, leather-and-rope sandals with wrapped shins, a linen bandage on his anatomical LEFT forearm, ' +
    'one knotted cedar walking staff with a Y-shaped knob held in his RIGHT hand';
  const KEEP = 'keep exactly the same face, hair, scar side, costume, satchel, bandage side and staff as the reference; do not mirror';
  const MASTER = BASE + 'character/master_3q.png', SIDE = BASE + 'character/master_side_right.png', SIDE_L = BASE + 'character/master_side_left.png';
  const qwen = (prompt, ref, o = {}) => ({ engine: 'qwen', ref, prompt: `${prompt}, ${KEEP}`, size: [1024, 1024], character: 'wanderer', ...o });
  const shared = { style: STYLE, negative: NEG };

  SCENES.smoke_master = { assets: BASE + 'character/', duration: 3, gen: shared, layers: [
    { id: 'master_3q', file: 'master_3q.png', size: [1200], opaque: true, gen: { engine: 'zimage', size: [1024, 1536], seed: 61519, character: 'wanderer', matte: 'none',
      prompt: `full-body character design of ${HERO}, standing in a neutral relaxed stance, three-quarter front view turned toward his left, ` +
        'whole figure from head to sandals with margin, plain light warm-gray studio background, even soft light' } },
    ...[['master_front', 'full FRONT view, facing the viewer'], ['master_side_right', 'true RIGHT PROFILE: he faces screen-right, his right side toward the viewer, staff in his near (right) hand'],
        ['master_side_left', 'true LEFT PROFILE: he faces screen-left, his left side toward the viewer showing the left-cheek scar and the left-forearm bandage'],
        ['master_back', 'full BACK view, facing away from the viewer, staff in his right hand on the viewer\'s right'],
        ['master_face_close', 'CLOSE-UP of his face and shoulders, head turned slightly to his right so his LEFT cheek and its scar face the viewer']]
      .map(([id, view]) => ({ id, file: id + '.png', size: [1200], opaque: true, gen: qwen(`the same character, ${view}, plain light warm-gray studio background`, MASTER, { matte: 'none', size: [1024, 1536] }) })),
  ] };

  // side rig parts (his RIGHT profile); the far LEFT limbs come from the left-profile view (bandage visible there)
  const PART = {
    pelvis: 'his hips and rope belt in the off-white tunic', torso: 'his torso with the faded brown mantle and the satchel strap, upright, without head or arms',
    head: 'his head and neck in right profile (nose pointing right)', hair_back: 'only the back hair knot and loose strands', hair_front: 'only the front hairline fringe',
    scarf_back: 'only the trailing torn scarf tail', scarf_front: 'only the front hanging end of the scarf', satchel: 'only the hide satchel with its flap',
    robe_hem: 'only the lower hem of the tunic below the belt', thigh_l: 'his left thigh in the tunic', calf_l: 'his left shin with rope wraps',
    foot_l: 'his left foot in its sandal, toes pointing right', thigh_r: 'his right thigh in the tunic', calf_r: 'his right shin with rope wraps',
    foot_r: 'his right foot in its sandal, toes pointing right', upper_arm_l: 'his left upper arm in the mantle sleeve', forearm_l: 'his LEFT forearm with the linen bandage',
    hand_l: 'his relaxed left hand', upper_arm_r: 'his right upper arm in the mantle sleeve', forearm_r: 'his right forearm, no bandage',
    hand_r: 'his right hand closed in a grip around a vertical staff (staff not included)', staff: 'only the knotted cedar staff with the Y-shaped knob, vertical, knob at the top',
  };
  SCENES.smoke_rig = { assets: BASE + R.body.dir, duration: 3, gen: shared, layers: R.body.parts.map(p => ({
    id: p.name, file: p.file, size: [Math.round(p.w * PX)],
    gen: qwen(`cut-out body part of the same character: ${PART[p.name]}, a single separate part laid straight with its joint end at the top, ` +
      'complete edges, nothing else in the image', p.name.endsWith('_l') ? SIDE_L : SIDE, { size: p.h > 3 ? [512, 1536] : [1024, 1024] }) })) };

  // overlay rigs: base images + registered region cuts (rects are fractions of the canvas; calibrate after step 2)
  const overlay = (scene, dir, base, basePrompt, ref, cuts) => {
    SCENES[scene] = { assets: BASE + dir, duration: 3, gen: shared, layers: [
      { id: base.replace('.png', ''), file: base, size: [1400], gen: qwen(basePrompt, ref, { size: [1024, 1536] }) },
      ...cuts.map(([id, rect, src]) => ({ id, file: id + '.png', size: [1400], gen: { engine: 'derive', op: 'region', from: base.replace('.png', ''), rect, feather: .025,
        ...(src ? { source: qwen(src, BASE + dir + base, { size: [1024, 1536], matte: 'none' }) } : {}) } })),
    ] };
  };
  overlay('smoke_hero3q', 'rig/', 'hero3q_body.png', 'the same character, full body three-quarter view standing on a ridge, wind in the scarf', MASTER,
    [['hero3q_head', [.3, .05, .75, .27]], ['hero3q_scarf_tail', [.05, .27, .45, .5]], ['hero3q_cloak_tip', [.12, .6, .9, .76]]]);
  overlay('smoke_face', 'character/', 'face_close.png', 'the same character, close-up portrait, head turned slightly to his right, LEFT-cheek scar clearly visible, eyes open, calm and exhausted',
    BASE + 'character/master_face_close.png',
    [['face_eyes_closed', [.22, .33, .78, .5], 'the same image with only the eyes gently closed, nothing else changed'], ['face_eyes_open', [.22, .33, .78, .5]],
     ['face_hair_wisps', [.1, .02, .9, .2]]]);
  overlay('smoke_back', 'details/', 's05_hero_back_over_shoulder.png', 'the same character seen from behind over his right shoulder, upper body, looking down into a valley',
    BASE + 'character/master_back.png', [['s05_hero_back_head', [.3, .05, .75, .35]], ['s05_hero_back_scarf_tail', [.12, .3, .5, .62]]]);

  SCENES.smoke_details = { assets: BASE + 'details/', duration: 3, gen: shared, layers: [
    { id: 's04_right_hand_relaxed', file: 's04_right_hand_relaxed.png', size: [1080], gen: qwen('macro close-up of only his RIGHT hand loosely holding the knotted cedar staff, vertical staff, knuckles and wrist wrap visible', MASTER, { size: [1024, 1536] }) },
    { id: 's04_right_hand_tense', file: 's04_right_hand_tense.png', size: [1080], gen: qwen('the same hand now gripping the staff tightly, knuckles paler, tendons raised, exactly the same framing, the same fingers with none added or removed', BASE + 'details/s04_right_hand_relaxed.png', { size: [1024, 1536] }) },
    { id: 's04_staff_close', file: 's04_staff_close.png', size: [1080], gen: qwen('macro of only the knotted cedar staff, vertical, matching the hand close-up framing', MASTER, { size: [1024, 1536] }) },
    { id: 's04_left_bandaged_forearm', file: 's04_left_bandaged_forearm.png', size: [1080], gen: qwen('macro of only his LEFT forearm with the linen bandage, entering from the lower left of the frame', SIDE_L, { size: [1024, 1536] }) },
  ] };

  const plate = (id, prompt, size = [1500], o = {}) => ({ id, file: id + '.png', size, ...o, gen: { engine: 'zimage', size: [1024, 1536], matte: o.opaque ? 'none' : 'chroma', prompt } });
  const PLACE = 'ancient mountain valley before sunrise, cold slate-blue sky warming to amber at the horizon, layered blue ridges, no people, no buildings';
  SCENES.smoke_env = { assets: BASE + 'environments/', duration: 3, gen: shared, layers: [
    plate('s01_sky', `${PLACE}, only the sky, full-bleed`, [1500], { opaque: true }), plate('s01_far_mountains', `${PLACE}, only the far mountain ridges as one cut-out band`),
    plate('s01_mid_mountains', 'nearer darker mountain ridges as one cut-out band, same palette'), plate('s01_ridge', 'a muted brown stony ridge top where one person could stand, cut-out'),
    plate('s01_foreground', 'foreground angular rocks and sparse dry scrub, cut-out'),
    plate('s02_sky', `${PLACE}, wide sky for a side view, full-bleed`, [2200], { opaque: true }), plate('s02_far_mountains', 'distant valley rocks and ridges for a side view, one cut-out band', [2600]),
    plate('s02_walkable_path', 'a dusty gravel mountain path seen exactly from the side, flat walkable ground plane, cut-out band', [2600]),
    plate('s02_foreground_gravel', 'foreground gravel and small scrub strip, cut-out', [2600]),
    plate('s03_soft_valley', `${PLACE}, soft defocused background for a portrait, full-bleed`, [1400], { opaque: true }),
    plate('s04_soft_stone', 'soft defocused dawn stone texture background, full-bleed', [1400], { opaque: true }),
    plate('s05_sky', 'dawn sky turning golden over a deep valley, full-bleed', [1500], { opaque: true }),
    plate('s05_far_valley', 'a deep valley far below with a few primitive hide shelters, cut-out band, no smoke drawn'),
    plate('s05_mid_valley', 'mid-distance valley slopes, cut-out band'), plate('s05_cliff', 'a rocky cliff edge in the foreground lower right, cut-out'),
  ] };
  SCENES.smoke_fx = { assets: BASE + 'fx/', duration: 3, gen: { ...shared, style: 'soft painterly atmospheric element, no hard edges' }, layers: [
    plate('s01_fog_back', 'a soft horizontal band of pale morning fog, cut-out'), plate('s01_fog_front', 'a soft wisp of pale morning fog, cut-out'),
    plate('s02_dust', 'a small soft puff of tan dust, cut-out', [200]), plate('s05_smoke_puff', 'a single soft round puff of pale gray smoke, cut-out', [260]),
    plate('s05_campfire', 'a tiny distant warm campfire glow, cut-out', [160]), plate('s04_dust_mote', 'a tiny soft glowing dust mote, cut-out', [48]),
  ] };
})();
