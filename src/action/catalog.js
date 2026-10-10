// action/catalog.js: the MOTION PRESET CATALOG of the Action Composer: every action type a Motion Plan may use, its
// default layer, the joint groups it owns (its mask), and its parameters with defaults and limits. Read by the engine
// (src/action/composer.js), the plan validator (tools/action/plan.mjs) and AutoCinematic's preset browser.
// Joint groups: root, spine, head, arm_f, arm_b (forward kinematics of each arm), hand_f, hand_b (hand IK / grips),
// leg_f, leg_b, prop, fx. Layers, lowest priority first: root, lower_body, upper_body, hands, head, secondary, effects, camera.
// Within one layer the later action wins (it interrupts, crossfading over its blend_in). A higher layer overrides a
// lower one only on the joint groups in its mask, so legs can run while the torso aims and the hands hold a prop.
const ACTION_LAYERS = ['root', 'lower_body', 'upper_body', 'hands', 'head', 'secondary', 'effects', 'camera'];
const ACTION_GROUPS = ['root', 'spine', 'head', 'arm_f', 'arm_b', 'hand_f', 'hand_b', 'leg_f', 'leg_b', 'prop', 'fx'];
const ACT_P = (d, min, max, about) => ({ type: 'number', default: d, min, max, about });
const ACT_COMMON = { strength: ACT_P(1, 0, 2, 'how strongly the action plays (1 = normal)'), weight: ACT_P(1, 0, 1, 'blend weight against lower layers'),
  blend_in: ACT_P(.15, 0, 1, 'seconds to blend in'), blend_out: ACT_P(.2, 0, 1, 'seconds to blend out when nothing follows'), ease: { type: 'enum', default: 'ease', values: ['linear', 'ease', 'easeIn', 'easeOut', 'backOut'] } };
const ACTION_CATALOG = {
  // ---- locomotion ----
  idle:   { layer: 'lower_body', mask: ['root', 'leg_f', 'leg_b', 'spine', 'arm_f', 'arm_b', 'head'], th: 'ยืนนิ่ง หายใจ', about: 'stand, feet planted, gentle breathing and weight shift', params: {} },
  breathe:{ layer: 'secondary', mask: ['spine', 'head'], additive: true, th: 'หายใจ', about: 'additive breathing on the chest and head', params: { rate: ACT_P(.3, .1, 1, 'breaths per second') } },
  walk:   { layer: 'lower_body', mask: ['root', 'leg_f', 'leg_b', 'spine', 'arm_f', 'arm_b'], th: 'เดิน', about: 'walk cycle, feet planted on the ground (no sliding), arm swing, root moves forward', params: { speed: ACT_P(260, 40, 600, 'frame px per second'), stride: ACT_P(0, 0, 600, 'step length px (0 = from the legs)'), arm_swing: ACT_P(1, 0, 2, 'arm swing amount'), direction: { type: 'enum', default: 'forward', values: ['forward', 'left', 'right'] } } },
  run:    { layer: 'lower_body', mask: ['root', 'leg_f', 'leg_b', 'spine', 'arm_f', 'arm_b'], th: 'วิ่ง', about: 'run cycle with flight phase, bent arms swinging, forward lean, planted feet', params: { speed: ACT_P(560, 150, 1200, 'frame px per second'), stride: ACT_P(0, 0, 900, 'step length px (0 = from the legs)'), arm_swing: ACT_P(1, 0, 2, 'arm swing amount'), lean: ACT_P(.16, 0, .5, 'forward lean (radians)'), direction: { type: 'enum', default: 'forward', values: ['forward', 'left', 'right'] } } },
  sprint: { layer: 'lower_body', mask: ['root', 'leg_f', 'leg_b', 'spine', 'arm_f', 'arm_b'], th: 'วิ่งเร็ว', about: 'a faster, lower, more leaning run', params: { speed: ACT_P(900, 300, 1600, 'frame px per second'), arm_swing: ACT_P(1.3, 0, 2, 'arm swing'), lean: ACT_P(.3, 0, .6, 'forward lean'), direction: { type: 'enum', default: 'forward', values: ['forward', 'left', 'right'] } } },
  jump:   { layer: 'lower_body', mask: ['root', 'leg_f', 'leg_b', 'spine', 'arm_f', 'arm_b'], th: 'กระโดด', about: 'anticipation crouch, take-off, airborne arc keeping its run momentum, legs tucked; touches down at its end', params: { height: ACT_P(220, 20, 800, 'peak height px'), distance: ACT_P(-1, -1, 2000, 'horizontal travel px (-1 = keep the momentum it had)'), tuck: ACT_P(1, 0, 1.5, 'how much the legs tuck') } },
  crouch: { layer: 'lower_body', mask: ['root', 'leg_f', 'leg_b', 'spine'], th: 'ย่อตัว', about: 'bend the knees and lower the hips, feet planted', params: { depth: ACT_P(.35, 0, .7, 'fraction of the leg length') } },
  dodge:  { layer: 'lower_body', mask: ['root', 'leg_f', 'leg_b', 'spine', 'head'], th: 'หลบ', about: 'quick sidestep and lean away, then recover', params: { distance: ACT_P(160, 0, 600, 'px moved (backwards from facing)'), lean: ACT_P(.35, 0, .8, 'lean angle') } },
  fall:   { layer: 'lower_body', mask: ['root', 'leg_f', 'leg_b', 'spine', 'arm_f', 'arm_b'], th: 'ตก', about: 'drop from the air (or off an edge) under gravity, limbs flailing, until ground', params: { from_height: ACT_P(300, 0, 1500, 'px above the ground at the start') } },
  land:   { layer: 'lower_body', mask: ['root', 'leg_f', 'leg_b', 'spine', 'arm_f', 'arm_b'], th: 'ลงพื้น', about: 'touch down: knees absorb the impact (squash), balance with the arms, recover; triggers dust', params: { depth: ACT_P(.28, 0, .6, 'how deep the knees give') }, effects: ['dust'] },
  // ---- character actions ----
  look:   { layer: 'head', mask: ['head'], th: 'มอง', about: 'turn the head toward a target point', params: { target: { type: 'point', default: null, about: 'frame px [x, y]' } } },
  turn:   { layer: 'root', mask: ['root'], th: 'หันกลับ', about: 'turn to face the other way (a flat image mirrors: labelled fallback), with a squash', params: {} },
  wave:   { layer: 'upper_body', mask: ['arm_b', 'hand_b'], th: 'โบกมือ', about: 'raise the back arm and wave', params: { hand: { type: 'enum', default: 'b', values: ['f', 'b'] }, count: ACT_P(3, 1, 8, 'waves') } },
  point:  { layer: 'upper_body', mask: ['arm_f', 'hand_f', 'spine'], th: 'ชี้', about: 'point an arm at a target', params: { target: { type: 'point', default: null, about: 'frame px [x, y]' }, hand: { type: 'enum', default: 'f', values: ['f', 'b'] } } },
  reach:  { layer: 'hands', mask: ['arm_f', 'hand_f', 'spine'], th: 'เอื้อม', about: 'reach a hand to a target point or prop (IK)', params: { target: { type: 'point_or_prop', default: null, about: 'frame px [x, y] or a prop id' }, hand: { type: 'enum', default: 'f', values: ['f', 'b'] } } },
  pick_up:{ layer: 'hands', mask: ['root', 'leg_f', 'leg_b', 'spine', 'arm_f', 'hand_f', 'prop'], th: 'หยิบของ', about: 'crouch, reach the prop grip with the hand (IK), close on it and lift: the prop attaches to the hand', params: { target: { type: 'prop', default: null, about: 'prop id' }, hand: { type: 'enum', default: 'f', values: ['f', 'b'] } } },
  hold:   { layer: 'hands', mask: ['arm_f', 'hand_f', 'prop'], th: 'ถือ', about: 'hold the attached prop at the side', params: { target: { type: 'prop', default: null } } },
  carry:  { layer: 'hands', mask: ['arm_f', 'hand_f', 'prop'], th: 'ถือเดิน', about: 'carry the attached prop while moving (the arm swings less, the prop rides the hand)', params: { target: { type: 'prop', default: null } } },
  drop:   { layer: 'hands', mask: ['arm_f', 'hand_f', 'prop'], th: 'ปล่อยของ', about: 'open the hand: the prop falls under gravity, bounces and rests on the ground', params: { target: { type: 'prop', default: null } } },
  transfer:{ layer: 'hands', mask: ['arm_f', 'arm_b', 'hand_f', 'hand_b', 'prop'], th: 'ส่งต่ออีกมือ', about: 'pass the prop from one hand to the other', params: { target: { type: 'prop', default: null }, to: { type: 'enum', default: 'b', values: ['f', 'b'] } } },
  aim:    { layer: 'upper_body', mask: ['spine', 'head', 'arm_f', 'arm_b', 'hand_f', 'hand_b', 'prop'], th: 'เล็ง', about: 'raise the held prop with both hands and point it at the target; blends over any leg action', params: { target: { type: 'point', default: null, about: 'frame px [x, y]' }, two_hands: { type: 'bool', default: true } } },
  fire:   { layer: 'upper_body', mask: ['spine', 'prop', 'fx'], additive: true, th: 'ยิง (เอฟเฟกต์แฟนตาซี)', about: 'stylized fictional energy shot from the prop muzzle: flash, bolt and recoil', params: { shots: ACT_P(1, 1, 6, 'shots'), interval: ACT_P(.18, .06, 1, 'seconds between shots'), recoil: ACT_P(1, 0, 2, 'recoil amount') }, effects: ['muzzle_flash', 'bolt', 'recoil'] },
  react:  { layer: 'upper_body', mask: ['spine', 'head', 'arm_f', 'arm_b'], th: 'สะดุ้ง', about: 'a hit/surprise reaction: jolt back, arms up, recover', params: { direction: { type: 'enum', default: 'back', values: ['back', 'forward'] } } },
  recoil: { layer: 'secondary', mask: ['spine', 'prop'], additive: true, th: 'แรงถีบ', about: 'a kick back along the prop and through the chest', params: {} },
  // ---- secondary motion ----
  squash_stretch: { layer: 'secondary', mask: ['root'], additive: true, th: 'ยืดหด', about: 'squash and stretch strength for jumps and landings (automatic; this scales it)', params: {} },
  bounce: { layer: 'secondary', mask: ['root'], additive: true, th: 'เด้ง', about: 'small bounces of the whole body', params: { count: ACT_P(3, 1, 10, 'bounces'), height: ACT_P(30, 0, 200, 'px') } },
  overshoot: { layer: 'secondary', mask: ['spine', 'head'], additive: true, th: 'เลยแล้วกลับ', about: 'springy overshoot on the chest and head at the action start', params: {} },
  inertia: { layer: 'secondary', mask: ['spine', 'head'], additive: true, th: 'แรงเฉื่อย', about: 'the chest and head lag the hips when they speed up or stop (automatic; this scales it)', params: {} },
  arm_swing: { layer: 'secondary', mask: ['arm_f', 'arm_b'], th: 'แกว่งแขน', about: 'swing the free arms (walk and run do it; this adds it to any action)', params: { rate: ACT_P(1.6, .3, 4, 'swings per second') } },
  head_follow: { layer: 'secondary', mask: ['head'], additive: true, th: 'หัวตาม', about: 'the head follows through after fast moves (automatic; this scales it)', params: {} },
  motion_trail: { layer: 'effects', mask: ['fx'], th: 'เส้นเงาความเร็ว', about: 'ghost trails behind the character while it moves fast', params: { ghosts: ACT_P(3, 1, 6, 'ghost copies'), gap: ACT_P(.035, .01, .1, 'seconds between ghosts') } },
  dust:   { layer: 'effects', mask: ['fx'], th: 'ฝุ่น', about: 'a dust puff at the feet', params: { amount: ACT_P(1, 0, 3, 'size') } },
  impact: { layer: 'effects', mask: ['fx'], th: 'แรงกระแทก', about: 'an impact ring and speed lines at a point', params: { target: { type: 'point', default: null } } },
};
const ACTION_EFFECTS = ['muzzle_flash', 'bolt', 'recoil', 'dust', 'impact', 'smoke', 'trail'];
for (const k of Object.keys(ACTION_CATALOG)) ACTION_CATALOG[k].params = { ...ACT_COMMON, ...ACTION_CATALOG[k].params };
// aliases a director may write
const ACTION_ALIASES = { pickup: 'pick_up', 'pick-up': 'pick_up', grab: 'pick_up', shoot: 'fire', stand: 'idle', recover: 'idle', leap: 'jump', hop: 'jump', squat: 'crouch',
  release: 'drop', throw: 'drop', glance: 'look', sidestep: 'dodge', dash: 'sprint', jog: 'run' };
if (typeof window !== 'undefined') Object.assign(window, { ACTION_CATALOG, ACTION_LAYERS, ACTION_GROUPS, ACTION_EFFECTS, ACTION_ALIASES });
