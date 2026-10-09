// the_last_smoke/rig_spec.js: ONE source of truth for the hero's rigs. Read by story.js (the cutout rigs), by
// tools/make_smoke_mocks.py (labelled mock parts with exactly these sizes / anchors / joints) and by assets.js (the
// generation targets). The body below the comment line is strict JSON (the Python tool parses it).
// Units: u (the rig's size unit; the body is ~8.4 u tall). Images point DOWN their bone (+y), anchored at the joint;
// feet point FORWARD (+x). Side rig = his RIGHT profile, walking to screen-right: the RIGHT (near) arm holds the staff,
// the LEFT (far) forearm carries the bandage, the LEFT-cheek scar is on the far side (not visible) — never mirrored.
// Overlay rigs (face, hero3q, back) use layers on ONE canvas (same w/h/anchor) cut from the same master edit, so they
// stay registered by construction. After the real parts exist, only joints/anchors here are calibrated; no code changes.
window.SMOKE_RIG =
{
  "px_per_u": 120,
  "body": {
    "dir": "rig/",
    "parts": [
      { "name": "pelvis", "file": "pelvis.png", "w": 1.3, "h": 0.9, "anchor": [0.65, 0.35], "z": 2 },
      { "name": "torso", "parent": "pelvis", "joint": [0.05, -0.15], "file": "torso.png", "w": 1.5, "h": 2.75, "anchor": [0.7, 2.6], "z": 3 },
      { "name": "satchel", "parent": "torso", "joint": [-0.25, -0.9], "file": "satchel.png", "w": 0.95, "h": 0.95, "anchor": [0.45, 0.12], "z": 3.6, "drag": 0.6 },
      { "name": "scarf_back", "parent": "torso", "joint": [-0.05, -2.4], "file": "scarf_back.png", "w": 1.2, "h": 1.4, "anchor": [1.05, 0.12], "z": 1, "drag": 1.3 },
      { "name": "head", "parent": "torso", "joint": [0.3, -2.55], "file": "head.png", "w": 1.3, "h": 1.5, "anchor": [0.55, 1.3], "z": 6 },
      { "name": "hair_back", "parent": "head", "joint": [-0.35, -0.8], "file": "hair_back.png", "w": 0.95, "h": 1.05, "anchor": [0.75, 0.2], "z": 5.5, "drag": 0.9 },
      { "name": "hair_front", "parent": "head", "joint": [0.05, -1.1], "file": "hair_front.png", "w": 0.95, "h": 0.55, "anchor": [0.5, 0.25], "z": 7, "drag": 0.45 },
      { "name": "scarf_front", "parent": "torso", "joint": [0.35, -2.35], "file": "scarf_front.png", "w": 0.75, "h": 1.15, "anchor": [0.38, 0.1], "z": 4, "drag": 0.75 },
      { "name": "robe_hem", "parent": "pelvis", "joint": [0.0, 0.25], "file": "robe_hem.png", "w": 1.7, "h": 1.35, "anchor": [0.85, 0.1], "z": 4.5, "drag": 0.5 },
      { "name": "thigh_l", "parent": "pelvis", "joint": [-0.05, 0.2], "file": "thigh_l.png", "w": 0.55, "h": 2.05, "anchor": [0.27, 0.15], "z": 0.5 },
      { "name": "calf_l", "parent": "thigh_l", "joint": [0, 1.9], "file": "calf_l.png", "w": 0.47, "h": 1.95, "anchor": [0.23, 0.1], "z": 0.5 },
      { "name": "foot_l", "parent": "calf_l", "joint": [0, 1.8], "file": "foot_l.png", "w": 1.05, "h": 0.48, "anchor": [0.3, 0.16], "z": 0.6 },
      { "name": "thigh_r", "parent": "pelvis", "joint": [0.05, 0.2], "file": "thigh_r.png", "w": 0.55, "h": 2.05, "anchor": [0.27, 0.15], "z": 4.2 },
      { "name": "calf_r", "parent": "thigh_r", "joint": [0, 1.9], "file": "calf_r.png", "w": 0.47, "h": 1.95, "anchor": [0.23, 0.1], "z": 4.2 },
      { "name": "foot_r", "parent": "calf_r", "joint": [0, 1.8], "file": "foot_r.png", "w": 1.05, "h": 0.48, "anchor": [0.3, 0.16], "z": 4.3 },
      { "name": "upper_arm_l", "parent": "torso", "joint": [0.1, -2.25], "file": "upper_arm_l.png", "w": 0.47, "h": 1.65, "anchor": [0.23, 0.12], "z": 0.2 },
      { "name": "forearm_l", "parent": "upper_arm_l", "joint": [0, 1.5], "file": "forearm_l_bandaged.png", "w": 0.44, "h": 1.5, "anchor": [0.22, 0.1], "z": 0.2 },
      { "name": "hand_l", "parent": "forearm_l", "joint": [0, 1.35], "file": "hand_l.png", "w": 0.45, "h": 0.6, "anchor": [0.22, 0.08], "z": 0.25 },
      { "name": "upper_arm_r", "parent": "torso", "joint": [0.15, -2.25], "file": "upper_arm_r.png", "w": 0.47, "h": 1.65, "anchor": [0.23, 0.12], "z": 8 },
      { "name": "forearm_r", "parent": "upper_arm_r", "joint": [0, 1.5], "file": "forearm_r.png", "w": 0.44, "h": 1.5, "anchor": [0.22, 0.1], "z": 8 },
      { "name": "hand_r", "parent": "forearm_r", "joint": [0, 1.35], "file": "hand_r_grip.png", "w": 0.52, "h": 0.62, "anchor": [0.26, 0.08], "z": 9 },
      { "name": "staff", "parent": "hand_r", "joint": [0, 0.32], "file": "staff.png", "w": 0.4, "h": 5.85, "anchor": [0.2, 0.85], "z": 8.6 }
    ],
    "ankle_height": 0.32, "foot_toe": 0.75, "foot_heel": -0.25, "staff_grip_to_tip": 5.0
  },
  "hero3q": {
    "dir": "rig/",
    "canvas": [2.6, 8.8],
    "parts": [
      { "name": "body3q", "file": "hero3q_body.png", "w": 2.6, "h": 8.8, "anchor": [1.3, 8.8], "z": 1 },
      { "name": "head3q", "parent": "body3q", "joint": [0.1, -6.75], "file": "hero3q_head.png", "w": 2.6, "h": 8.8, "anchor": [1.4, 2.05], "z": 2 },
      { "name": "scarf3q", "parent": "body3q", "joint": [-0.35, -6.2], "file": "hero3q_scarf_tail.png", "w": 2.6, "h": 8.8, "anchor": [0.95, 2.6], "z": 3, "drag": 1.1 },
      { "name": "hem3q", "parent": "body3q", "joint": [0.0, -3.0], "file": "hero3q_cloak_tip.png", "w": 2.6, "h": 8.8, "anchor": [1.3, 5.8], "z": 0.5, "drag": 0.6 }
    ]
  },
  "face": {
    "dir": "character/",
    "canvas": [6.0, 7.2],
    "parts": [
      { "name": "face", "file": "face_close.png", "w": 6.0, "h": 7.2, "anchor": [3.0, 6.6], "z": 1 },
      { "name": "eyes", "parent": "face", "joint": [0, 0], "files": { "open": "face_eyes_open.png", "closed": "face_eyes_closed.png" }, "w": 6.0, "h": 7.2, "anchor": [3.0, 6.6], "z": 2 },
      { "name": "wisps", "parent": "face", "joint": [-0.4, -5.6], "file": "face_hair_wisps.png", "w": 6.0, "h": 7.2, "anchor": [2.6, 1.0], "z": 3, "drag": 0.8 }
    ]
  },
  "back": {
    "dir": "details/",
    "canvas": [5.0, 7.5],
    "parts": [
      { "name": "back_body", "file": "s05_hero_back_over_shoulder.png", "w": 5.0, "h": 7.5, "anchor": [2.5, 7.5], "z": 1 },
      { "name": "back_head", "parent": "back_body", "joint": [0.2, -5.4], "file": "s05_hero_back_head.png", "w": 5.0, "h": 7.5, "anchor": [2.7, 2.1], "z": 2 },
      { "name": "back_scarf", "parent": "back_body", "joint": [-0.6, -4.9], "file": "s05_hero_back_scarf_tail.png", "w": 5.0, "h": 7.5, "anchor": [1.9, 2.6], "z": 3, "drag": 1.2 }
    ]
  }
}
;
