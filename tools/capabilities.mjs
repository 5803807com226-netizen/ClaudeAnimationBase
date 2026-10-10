// tools/capabilities.mjs: export the CURRENT capability catalog (what the engine can actually render) as JSON, for the
// Director prompt (AutoCinematic) and the plan compiler. Loads the real engine headless, so the catalog is what is
// registered, not a hand-kept list. No frames are rendered: runs in seconds, also under software GL.
//   node tools/capabilities.mjs [--out=out/capabilities.json] [--compact] [--chrome=<path>] [--soft-gl]
//   --compact   the short form for an LLM prompt: id, category, about, tags, param names with type / range / enum, status
// The catalog carries a sha256 `hash`; a shot manifest records the hash it was planned against.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { args, launch, openTarget, cleanErrors } from './lib/harness.mjs';
import { ACTION_CATALOG, ACTION_LAYERS, ACTION_EFFECTS } from './action/plan.mjs';

export async function loadCatalog(browser) {
  const errors = [], page = await openTarget(browser, { name: 'catalog', story: 'type_demo' }, { aspect: '9:16' }, errors);
  const caps = await page.evaluate(() => window.CAPABILITY_CATALOG());
  await page.close();
  const errs = cleanErrors(errors);
  if (errs.length) throw new Error('engine errors while loading the catalog:\n  ' + errs.join('\n  '));
  caps.sort((a, b) => a.id.localeCompare(b.id));
  const actions = actionCatalog();
  const hash = 'sha256:' + createHash('sha256').update(JSON.stringify([caps, actions])).digest('hex').slice(0, 16);
  return { schema: 'capability_catalog/1', hash, production_aspects: ['9:16', '16:9'], capabilities: caps, actions };
}

// the Action Composer's presets, for shots with treatment "action" (an articulated character from its reference image)
export function actionCatalog() {
  const P = s => ({ type: s.type, ...(s.values ? { enum: s.values } : {}), ...(s.min != null ? { min: s.min, max: s.max } : {}), default: s.default });
  return { layers: ACTION_LAYERS, effects: ACTION_EFFECTS, presets: Object.fromEntries(Object.entries(ACTION_CATALOG).map(([k, c]) => [k,
    { layer: c.layer, mask: c.mask, th: c.th, about: c.about, ...(c.additive ? { additive: true } : {}),
      params: Object.fromEntries(Object.entries(c.params).filter(([n]) => !['strength', 'weight', 'ease'].includes(n)).map(([n, d]) => [n, P(d)])) }])) };
}

export function compact(cat) {
  const p = s => [s.type, s.enum ? s.enum.join('|') : null, s.min != null || s.max != null ? `${s.min ?? ''}..${s.max ?? ''}` : null].filter(Boolean).join(' ');
  return { schema: 'capability_catalog/1-compact', hash: cat.hash, capabilities: cat.capabilities.map(c => ({ id: c.id, category: c.category, about: c.about,
    tags: c.tags, params: Object.fromEntries(Object.entries(c.params).map(([k, s]) => [k, p(s)])), assets: c.assets, status: c.status })), actions: cat.actions };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('capabilities.mjs')) {
  const browser = await launch();
  try {
    const cat = await loadCatalog(browser), out = args.compact ? compact(cat) : cat, file = args.out || 'out/capabilities.json';
    mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(out, null, 1));
    const by = {}; for (const c of cat.capabilities) (by[c.category] ||= []).push(`${c.id}${c.status === 'verified' ? '' : ' (experimental)'}`);
    console.log(`${cat.capabilities.length} capabilities, ${cat.hash} → ${file}`);
    for (const [k, v] of Object.entries(by)) console.log(`  ${k.padEnd(11)} ${v.join(', ')}`);
  } finally { await browser.close(); }
}
