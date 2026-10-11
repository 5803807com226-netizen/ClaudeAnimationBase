# Preset roadmap: from the birth of the Earth to the age of AI

This plan covers the presets needed to tell any story across this range:
- deep time (the cosmos, the Earth, life, human evolution);
- civilizations, religions and wars;
- politics, industry and economy;
- science and computing, up to AI.

Legend:
- ✅ exists now
- 🟡 can be done now by combining presets
- 🆕 to build

**Priority** (Tier 1 = reused by most stories) appears where a preset is used across many themes.

Every new preset follows the house rules:
- it passes 9:16 / 16:9 / 4:5;
- its finish comes from `look.js`;
- places, routes, dates and numbers come from sourced `data`;
- story artwork is imported PNGs (ComfyUI or real photos with credits), never drawn in code.

Code draws only motion, effects, diagrams, maps and data.

## 0. Foundations used by every era (Tier 1)
| Preset | What it does | Status |
|---|---|---|
| `eraTicker` | A persistent era / year readout: "4.5 billion years ago" → "1945" → "2026", with unit changes (Ga, Ma, ka, BCE/CE, Buddhist Era) | 🆕 Tier 1 |
| `deepTimeline` | A zoomable time ruler, linear or logarithmic, that flies from the Big Bang to today. Eras are coloured bands, and a "you are here" marker counts down | 🆕 Tier 1 |
| `realPhoto` + `creditTag` | A sourced real photo, kept unedited, cut out as a collage layer. The credit stays on screen while it shows, and a credits list is made for the description | 🆕 Tier 1 |
| `quoteCard` | A sourced quotation with its citation (book, page, year) | 🆕 |
| `beforeAfter` / `splitCompare` | A wipe slider between two images or maps; side-by-side comparison | 🆕 |
| `scaleZoom` | A Powers-of-Ten zoom (atom → cell → Earth → galaxy) through nested layers | 🆕 Tier 1 |
| `type.*`, `captionBar`, karaoke subtitles, `chapterBadge`, `dateCard` | Kinetic typography and Thai captions | ✅ |
| collage + `depth` parallax + camera keys | 2.5D scenes from artwork layers | ✅ |
| `mapMeasure`, `mapTrueSize` | Measured distance and true-size comparison | ✅ |

## 1. The cosmos and the young Earth
| Preset | What it does | Status |
|---|---|---|
| `space.starfield` | Stars in many depth layers that fly past (real parallax) | 🆕 Tier 1 (3D) |
| `space.planet` | A lit sphere with a texture (NASA public-domain maps), night side, atmosphere glow and rotation | 🆕 Tier 1 (3D) |
| `space.nebulaDisk` | A protoplanetary disk: particles spiralling into a forming Sun and planets | 🆕 (3D) |
| `space.impact` | A giant impact (Theia → Moon) or a meteor strike: flash, shock ring, debris | 🆕 |
| `earth.molten` → `earth.cooling` | A glowing lava surface that cools and cracks into crust, then oceans fill | 🆕 |
| `earth.plates` | Continents drift over time on the globe, from paleogeographic maps (source and licence checked per map) | 🆕 Tier 1 |
| `earth.iceAge` | Ice sheets grow and shrink on the map; sea level changes the coastline | 🆕 |
| `volcano` | An eruption: ash plume, lava glow, ejecta (an effect over artwork) | 🆕 |
| `particleBurst`, `weather`, `collage.orbit`, satellite globe | Sparks, snow and dust, simple orbits, Earth on a globe | ✅ |

## 2. Life and evolution
| Preset | What it does | Status |
|---|---|---|
| `phyloTree` | The tree of life grows branch by branch with dated splits; a branch lights up (no misleading single "march of progress") | 🆕 Tier 1 |
| `cellDivide` | Mitosis and dividing cells as soft blobs | 🆕 |
| `dnaHelix` | A rotating double helix; base pairs light up | 🆕 (3D) |
| `fossilReveal` | A fossil revealed by a brush-off wipe over artwork | 🟡 `brushWipe` + artwork |
| `mapFlow` | Migration or spread arrows that branch over time with dates (out of Africa, the spread of farming) | 🆕 Tier 1 (also religions, trade, ideas) |
| `extinctionCounter` | Species bars that drop at the mass extinctions | 🟡 `barChart` / `lineChart` |
| `figure` | Early humans as vector illustrations beside the map | ✅ |
| `mapSwarm` | Herds and settlements popping up over a region | ✅ |

## 3. Civilizations and empires
| Preset | What it does | Status |
|---|---|---|
| `mapEmpire` | A territory grows and shrinks across dated frames, with a year ticker (sourced historical outlines) | 🆕 Tier 1 |
| `mapTransfer`, `mapRegion` units, `mapHighlight`, `mapPin`, `mapGlow`, `mapNote`, antique map | Territories changing hands, notes, an aged map | ✅ |
| `routeDraw`, `mapSprite` | Trade routes (Silk Road, spice routes), ships and caravans | ✅ |
| `monumentBuild` | A structure builds up layer by layer (collage pieces stack in) | 🆕 |
| `scrollUnroll` / `manuscript` | An old document, scroll or palm-leaf page unrolls; live Thai text appears line by line | 🆕 Tier 1 (also religions, law) |
| `inscription` | Text appears as if carved in stone, lit from the side | 🆕 |
| `dynastyTree` | A family tree or line of rulers with reign dates | 🆕 |
| `spyglass`, `mapPhoto` | A telescope view, photo cards beside a place | ✅ |

## 4. Religions and beliefs (respectful, neutral, sourced)
| Preset | What it does | Status |
|---|---|---|
| `mapFlow` | A faith spreads from its origin with dates and routes | 🆕 (same as §2) |
| `scrollUnroll` / `quoteCard` | Scripture with its exact reference (book, chapter or sutta, edition) | 🆕 (same as §0/§3) |
| `compareTable` | Beliefs, practices and calendars side by side, cell by cell | 🆕 |
| `sacredPattern` | Geometric light patterns, rays and halos as abstract decoration (no religious symbol drawn in code) | 🆕 |
| `doodle.rays`, `light sweep` | Light rays over artwork | ✅ / 🆕 |
| temple / site collage parallax, `realPhoto` + credit | Places shown with real, credited photos | 🟡 / 🆕 |

Rules: people and sacred objects come from real credited photos or respectful artwork, never caricatures. Texts and dates are cited.

## 5. War and conflict
| Preset | What it does | Status |
|---|---|---|
| `mapTroops`, `mapBomber`, `mapArrow`, `mapTransfer` | Armies on the move, air raids, thrusts, captured land | ✅ |
| `mapDogfight` | Aircraft circle and chase over a place: smoke trails, tracer bursts, one shot down in a smoke spiral | 🆕 |
| `frontLine` | A front line that moves across dated frames (a shaded side, a glowing contested edge) | 🆕 Tier 1 |
| `navalBattle` | Ships manoeuvre, cannon or gun flashes, splashes, a ship sinking | 🆕 |
| `siege` | Projectile arcs onto walls, fire and smoke | 🆕 |
| `explosionFx` | A reusable blast (flash, shock ring, smoke column) at any place or over artwork | 🆕 (extracted from `mapBomber`) |
| `casualtyCounter` | Sober counting with a sourced number, slow and without effects | 🟡 `type.counter` (style rule: no celebratory motion) |

Rules: no hate symbols (a colour stands in for a side), no glorification, and figures are cited.

## 6. Politics and society
| Preset | What it does | Status |
|---|---|---|
| `parliament` | A hemicycle of seats that fills by party, with a majority line | 🆕 Tier 1 |
| `voteSwing` | Bars or a map swing between two elections | 🆕 |
| `mapChoropleth` | Countries or provinces coloured by a sourced value, with a legend (GDP, literacy, votes) | 🆕 Tier 1 |
| `powerChart` | An org chart of a system (king → council → people; three branches of government) that builds | 🆕 |
| `spectrum` | A left↔right or authoritarian↔liberal scale; markers slide along it | 🆕 |
| `treaty` | A document plus a seal stamp and signatures | 🟡 `scrollUnroll` + `type.stamp` |
| `crowd` | A crowd fills an area (protests, a population) | 🟡 `mapSwarm` / `iconGrid` |

## 7. Industry and economy
| Preset | What it does | Status |
|---|---|---|
| `barRace` | A bar-chart race over years (GDP, population, companies), sourced data | 🆕 Tier 1 |
| `gears` / `machine` | Interlocking gears, pistons and belts that drive each other | 🆕 |
| `assemblyLine` | Artwork items move along a conveyor and change at stations | 🆕 |
| `railNetwork` | A railway or road network spreads over the map by year | 🟡 `routeDraw` ×N → 🆕 `mapNetwork` |
| `cityLights` | Night lights spread over a region (urbanisation) | 🆕 |
| `sankeyFlow` | Money, energy or supply flows between nodes | 🆕 |
| `candlestick` / `inflationShrink` | A market chart; a banknote shrinking in value | 🆕 |
| `barChart`, `lineChart`, `donutChart`, `timeline`, `iconGrid`, `callout`, `type.counter` | Data basics | ✅ |

## 8. Science (physics, chemistry, biology, space)
| Preset | What it does | Status |
|---|---|---|
| `science.atom` | Bohr orbits or an electron cloud; an electron jumps and emits light | 🆕 Tier 1 (3D) |
| `molecule` | Ball-and-stick molecules that rotate; a bond forms or breaks | 🆕 (3D) |
| `wave` | Sine, sound and light waves; interference | 🆕 |
| `fieldLines` | Magnetic or electric field lines that flow | 🆕 |
| `equationWrite` | An equation writes itself by hand, then terms highlight | 🆕 |
| `periodicTable` | Elements highlight and group | 🆕 |
| `space.orbit` / `solarSystem` | Planets on scaled orbits, a time-speed dial | 🆕 (3D) |
| `scaleZoom` | Microscope or telescope zoom through scales | 🆕 (§0) |

## 9. Computing → the age of AI
| Preset | What it does | Status |
|---|---|---|
| `circuitTrace` | Circuit-board traces draw themselves; pulses run along them | 🆕 |
| `chipZoom` | A dive into a chip: die → transistor | 🟡 collage + `scaleZoom` |
| `binaryFlow` | Streams of bits or bytes | 🆕 |
| `neuralNet` | Layers of nodes; signals pulse forward, weights brighten | 🆕 Tier 1 |
| `tokenStream` | Text splits into tokens and becomes vectors (Thai-safe) | 🆕 |
| `chatMock` | A generic chat interface typing (no brand, no real product UI) | 🆕 |
| `logGrowth` | An exponential or log chart (Moore's law, compute used to train models) with sourced points | 🟡 `lineChart` + log axis |
| `robot` / `dataCenter` | ComfyUI artwork with collage parallax | 🟡 |

## Build order (suggested)
1. **Tier 1 foundations:**
   - `eraTicker` + `deepTimeline`;
   - `realPhoto` + `creditTag`;
   - `mapFlow`;
   - `mapEmpire` / `frontLine`;
   - `barRace`, `mapChoropleth`.
2. **3D kit (Three.js):** `space.starfield`, `space.planet`, `science.atom`, `scaleZoom`, `dnaHelix`, `molecule`.
3. **Life and earth:** `phyloTree`, `earth.plates`, `earth.molten`, `volcano`, `earth.iceAge`.
4. **War extras:** `mapDogfight`, `navalBattle`, `explosionFx`, `siege`.
5. **Society and industry:** `parliament`, `powerChart`, `spectrum`, `gears`, `sankeyFlow`, `cityLights`, `assemblyLine`.
6. **AI:** `neuralNet`, `tokenStream`, `circuitTrace`, `chatMock`.
7. **Text and culture:** `scrollUnroll`, `quoteCard`, `inscription`, `compareTable`, `dynastyTree`, `equationWrite`.

Each step ships with a short demo story and passes `tools/aspect_test.mjs` before it enters the registry.
