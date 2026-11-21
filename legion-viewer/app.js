import {
  createDFKClient, ACTIVE_SKILLS, PASSIVE_SKILLS, HERO_CLASSES, PROFESSIONS, ELEMENTS, BACKGROUNDS, CRAFTING_PROFESSIONS,
  STAT_BOOSTS, HAIR_COLORS, SKIN_COLORS, EYE_COLORS, APPENDAGE_COLORS, HEAD_APPENDAGES, BACK_APPENDAGES,
  FEMALE_HAIR_STYLES, MALE_HAIR_STYLES, getClassTier, getDisplayHeroId, resolveAssetUrl, PetRenderer, createHeroCard,
} from 'https://esm.sh/@defikingdoms/game-sdk@0.1.0?deps=ethers@5.8.0';
import { createAnimatedHeroCard } from 'https://esm.sh/@defikingdoms/game-sdk@0.1.0/renderer?deps=ethers@5.8.0';
import { traitScore, heroScore, heroMult, heroScoreX, clearHeroScores } from '../assets/heroscore.js?v=1';
import { getWallet, onWalletChange, mountWallet, sameAddr, shortAddr, saveLegion, readLegion, ago } from '../assets/session.js?v=1';

/* ================= vocab ================= */
const RARITY = ['common', 'uncommon', 'rare', 'legendary', 'mythic'];
const REALMS = { serendale: 'Serendale 1.0', crystalvale: 'Crystalvale', serendale2: 'Serendale 2.0', sunderedisles: 'Sundered Isles', avalanche: 'Avalanche' };
const STATS = [['strength', 'STR'], ['intelligence', 'INT'], ['wisdom', 'WIS'], ['luck', 'LCK'], ['agility', 'AGI'], ['vitality', 'VIT'], ['endurance', 'END'], ['dexterity', 'DEX']];
const SKILLS = [['mining', 'Mining'], ['gardening', 'Gardening'], ['fishing', 'Fishing'], ['foraging', 'Foraging']];
const SLOTS = [['weapon1Id', 'Weapon 1'], ['weapon2Id', 'Weapon 2'], ['offhand1Id', 'Offhand 1'], ['offhand2Id', 'Offhand 2'], ['armorId', 'Armor'], ['accessoryId', 'Accessory'], ['petId', 'Pet']];
const GEAR_SLOTS = [
  ['weapon1', 'weapon1Id', 'weapon'], ['weapon1Visage', 'weapon1VisageId', 'weapon'], ['weapon2', 'weapon2Id', 'weapon'], ['weapon2Visage', 'weapon2VisageId', 'weapon'],
  ['offhand1', 'offhand1Id', 'accessory'], ['offhand1Visage', 'offhand1VisageId', 'accessory'], ['offhand2', 'offhand2Id', 'accessory'], ['offhand2Visage', 'offhand2VisageId', 'accessory'],
  ['armor', 'armorId', 'armor'], ['armorVisage', 'armorVisageId', 'armor'], ['accessory', 'accessoryId', 'accessory'], ['accessoryVisage', 'accessoryVisageId', 'accessory'],
];
const REROLLING = '9999999999999';
const cap = (s) => (s ? String(s)[0].toUpperCase() + String(s).slice(1) : '');
const className = (c) => ({ darkKnight: 'Dark Knight', spellBow: 'SpellBow', dreadKnight: 'DreadKnight' })[c] || cap(c);
const tierOf = (r) => (r < 16 ? 0 : r < 24 ? 1 : r < 28 ? 2 : 3);
const tierCode = (r) => (r < 16 ? `B${r + 1}` : r < 24 ? `A${r - 15}` : r < 28 ? `E${r - 23}` : `X${r - 27}`);
const TIER_TAG = ['', 'ADV', 'ELITE', 'EXALT'];
const hex = (h) => (h ? `#${h}` : null);
const stars = (n) => '★'.repeat(n || 0);
const num = (s) => { const n = Number(s); return Number.isFinite(n) ? n : 0; };
const fmtAmount = (s) => { const n = num(s); return n >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : n.toLocaleString('en-US', { maximumFractionDigits: 2 }); };
const rarityIdx = (r) => RARITY.indexOf(String(r).toLowerCase());
const normText = (t) => String(t).replace(/[-+]?\d+(\.\d+)?/g, '#');
const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };

/* ================= cross-section lookups ================= */
const heroById = new Map();
const gearByKey = new Map();
const heroLabel = (id) => { const h = heroById.get(String(id)); return h ? `${h.name} #${h.displayId}` : `#${getDisplayHeroId(id)}`; };

/* ================= gene scope (heroes) ================= */
let scope = 'd';
const genes = (raw) => (scope === 'd' ? [raw.d] : [...new Set([raw.d, raw.r1, raw.r2, raw.r3])]);
const sg = (k) => (h) => genes(h.statGenes.raw[k]);
const vg = (k) => (h) => genes(h.visualGenes.raw[k]);
const statSum = (h) => STATS.reduce((t, [k]) => t + h.stats[k], 0);

/* Heroscore, ×multiplier and Heroscore X live in ../assets/heroscore.js, shared with the Hero Viewer. */
const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
const compact = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}k` : String(Math.round(n)));

/* Hubert's pet score from the same deck, kept on its own scale. */
const STAR_SCORE = [0, 7000, 10000, 19000, 28000, 40000, 75000, 225000, 450000, 1000000];
const PET_RARITY = { common: [2000, 2], uncommon: [25000, 3], rare: [175000, 4], legendary: [370000, 4], mythic: [780000, 4] };
function petScoreHubert(p) {
  const a = p.gathering ? p.gathering.tier : 0, b = p.combat ? p.combat.tier : 0, c = p.crafting ? p.crafting.tier : 0;
  const [rarityScore, tierMod] = PET_RARITY[p.rarity] || PET_RARITY.common;
  let D = (tierMod - a) * (tierMod - b) * (tierMod - c);
  if (D <= 0) D = 1;
  const starScore = STAR_SCORE[Math.min(9, a + b + c)] || 0;
  return (10 * starScore * D + rarityScore * (10 + a + b + c)) / (10000 * D);
}
const petScore = petScoreHubert;
const bigNum = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} BILLION` : n >= 1e6 ? `${(n / 1e6).toFixed(2)} MILLION` : fmtInt(n));

const geneSet = (id, label, values, name, extra = {}) => ({ id, label, type: 'set', gene: true, values, name, order: 'key', ...extra });
const set = (id, label, values, name, extra = {}) => ({ id, label, type: 'set', values, name: name || cap, order: 'count', ...extra });
const range = (id, label, get, extra = {}) => ({ id, label, type: 'range', get, ...extra });
const skillName = (map) => (r) => map[r] || tierCode(r);
const codeName = (r) => tierCode(Number(r));
const yesNo = (yes, no) => (v) => (v === 'yes' ? yes : no);

/* ================= HEROES ================= */
const HERO_TABS = [
  { id: 'basics', label: 'Basics', groups: [
    range('hsx', 'Heroscore X', heroScoreX, { hint: "Hubert's Heroscore × (1 + trait counter), Gen 0 ×3" }),
    range('hs', 'Heroscore', heroScore),
    geneSet('class', 'Class', sg('class'), (r) => className(HERO_CLASSES[r]) || `#${r}`, { tag: (r) => TIER_TAG[tierOf(r)] }),
    geneSet('subClass', 'Subclass', sg('subClass'), (r) => className(HERO_CLASSES[r]) || `#${r}`, { tag: (r) => TIER_TAG[tierOf(r)] }),
    set('tier', 'Class tier', (h) => [getClassTier(h.statGenes.raw.class.d)], cap, { order: ['basic', 'advanced', 'elite', 'exalted'] }),
    set('rarity', 'Rarity', (h) => [h.rarity], cap, { order: RARITY, swatch: (r) => `var(--r-${r})` }),
    range('level', 'Level', (h) => h.level),
    range('generation', 'Generation', (h) => h.generation),
    range('summons', 'Summons left', (h) => h.summonsRemaining, { hint: '11 means unlimited' }),
    set('realm', 'Origin realm', (h) => [h.originRealm], (r) => REALMS[r] || r, { order: Object.keys(REALMS), hint: 'From the ID: no prefix Serendale 1.0, 1… Crystalvale, 2… Serendale 2.0' }),
    set('shiny', 'Shiny', (h) => [h.shiny ? 'yes' : 'no'], yesNo('Shiny', 'Not shiny'), { order: ['yes', 'no'] }),
    geneSet('gender', 'Gender', vg('gender'), (r) => ({ 1: 'Male', 3: 'Female' })[r] || `#${r}`),
    geneSet('element', 'Element', sg('element'), (r) => cap(ELEMENTS[r]) || `#${r}`),
    geneSet('background', 'Background', vg('background'), (r) => cap(BACKGROUNDS[r]) || `#${r}`),
  ] },
  { id: 'traits', label: 'Traits', groups: [
    geneSet('active1', 'Active 1', sg('active1'), skillName(ACTIVE_SKILLS), { wide: true, tag: (r) => TIER_TAG[tierOf(r)] }),
    geneSet('active2', 'Active 2', sg('active2'), skillName(ACTIVE_SKILLS), { wide: true, tag: (r) => TIER_TAG[tierOf(r)] }),
    geneSet('passive1', 'Passive 1', sg('passive1'), skillName(PASSIVE_SKILLS), { wide: true, tag: (r) => TIER_TAG[tierOf(r)] }),
    geneSet('passive2', 'Passive 2', sg('passive2'), skillName(PASSIVE_SKILLS), { wide: true, tag: (r) => TIER_TAG[tierOf(r)] }),
    range('trait', 'Trait score', traitScore, { hint: 'Dominant traits: Advanced 1, Elite 2, Exalted 3' }),
    geneSet('profession', 'Gathering profession', sg('profession'), (r) => cap(PROFESSIONS[r]) || `#${r}`),
    geneSet('crafting1', 'Crafting 1', sg('crafting1'), (r) => CRAFTING_PROFESSIONS[r] || `#${r}`),
    geneSet('crafting2', 'Crafting 2', sg('crafting2'), (r) => CRAFTING_PROFESSIONS[r] || `#${r}`),
    geneSet('statBoost1', 'Stat boost 1', sg('statBoost1'), (r) => STAT_BOOSTS[r] || `#${r}`),
    geneSet('statBoost2', 'Stat boost 2', sg('statBoost2'), (r) => STAT_BOOSTS[r] || `#${r}`),
  ] },
  { id: 'stats', label: 'Stats', groups: [
    ...STATS.map(([k, l]) => range(`st-${k}`, l, (h) => h.stats[k])),
    range('st-hp', 'HP', (h) => h.stats.hp),
    range('st-mp', 'MP', (h) => h.stats.mp),
    range('st-sum', 'Stat total', statSum, { hint: 'STR + INT + WIS + LCK + AGI + VIT + END + DEX' }),
    ...SKILLS.map(([k, l]) => range(`sk-${k}`, `${l} skill`, (h) => h.skills[k], { closed: true })),
    ...STATS.map(([k, l]) => range(`pg-${k}`, `${l} primary growth %`, (h) => h.primaryGrowth[k] / 100, { closed: true })),
    ...STATS.map(([k, l]) => range(`sgr-${k}`, `${l} secondary growth %`, (h) => h.secondaryGrowth[k] / 100, { closed: true })),
  ] },
  { id: 'looks', label: 'Looks', groups: [
    { id: 'hairStyle', label: 'Hair style', type: 'set', gene: true, wide: true,
      values: (h) => genes(h.visualGenes.raw.hairStyle).map((r) => `${h.gender}:${r}`),
      name: (k) => { const [g, r] = k.split(':'); return `${(g === 'female' ? FEMALE_HAIR_STYLES : MALE_HAIR_STYLES)[r] || `#${r}`} ${g === 'female' ? '♀' : '♂'}`; },
      order: (a, b) => a.localeCompare(b, undefined, { numeric: true }) },
    geneSet('hairColor', 'Hair color', vg('hairColor'), codeName, { swatch: (r) => hex(HAIR_COLORS[r]) }),
    geneSet('headAppendage', 'Head appendage', vg('headAppendage'), (r) => HEAD_APPENDAGES[r] || `#${r}`, { wide: true, tag: (r) => tierCode(Number(r)) }),
    geneSet('appendageColor', 'Head appendage color', vg('appendageColor'), codeName, { swatch: (r) => hex(APPENDAGE_COLORS[r]) }),
    geneSet('backAppendage', 'Back appendage', vg('backAppendage'), (r) => BACK_APPENDAGES[r] || `#${r}`, { wide: true, tag: (r) => tierCode(Number(r)) }),
    geneSet('backAppendageColor', 'Back appendage color', vg('backAppendageColor'), codeName, { swatch: (r) => hex(APPENDAGE_COLORS[r]) }),
    geneSet('skinColor', 'Skin color', vg('skinColor'), codeName, { swatch: (r) => hex(SKIN_COLORS[r]) }),
    geneSet('eyeColor', 'Eye color', vg('eyeColor'), codeName, { swatch: (r) => hex(EYE_COLORS[r]) }),
  ] },
  { id: 'gear', label: 'Gear', groups: SLOTS.map(([k, l]) => set(`eq-${k}`, l, (h) => [h.equipment && h.equipment[k] ? 'on' : 'off'], (v) => (v === 'on' ? 'Equipped' : 'Empty'), { order: ['on', 'off'] })) },
];
const HERO_SORTS = [
  ['hsx', 'Heroscore X', (a, b) => heroScoreX(b) - heroScoreX(a)],
  ['hs', 'Heroscore', (a, b) => heroScore(b) - heroScore(a)],
  ['rarity', 'Rarity', (a, b) => rarityIdx(b.rarity) - rarityIdx(a.rarity) || b.level - a.level],
  ['level', 'Level', (a, b) => b.level - a.level || rarityIdx(b.rarity) - rarityIdx(a.rarity)],
  ['sum', 'Stat total', (a, b) => statSum(b) - statSum(a)],
  ['trait', 'Trait score', (a, b) => traitScore(b) - traitScore(a) || rarityIdx(b.rarity) - rarityIdx(a.rarity)],
  ['gen', 'Generation', (a, b) => a.generation - b.generation || rarityIdx(b.rarity) - rarityIdx(a.rarity)],
  ['summons', 'Summons left', (a, b) => b.summonsRemaining - a.summonsRemaining],
  ['id', 'ID', (a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1)],
];

function heroGear(h) {
  const gear = {}; let missing = false;
  for (const [slot, idKey, contract] of GEAR_SLOTS) {
    const id = h.equipment && h.equipment[idKey];
    if (!id) { gear[slot] = null; continue; }
    const e = gearByKey.get(`${contract}:${id}`);
    gear[slot] = e || null;
    if (!e) missing = true;
  }
  return { gear, missing };
}

const HERO_VIEWER = new URL('../hero-viewer/', location.href).href;
function heroViewerLink(h) {
  const a = el('a', 'hv-link');
  a.href = `${HERO_VIEWER}?id=${h.id}`;
  a.title = `Open ${h.name} in the Hero Viewer`;
  a.setAttribute('aria-label', `Open ${h.name} in the Hero Viewer`);
  a.innerHTML = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M1 8s2.6-4.5 7-4.5S15 8 15 8s-2.6 4.5-7 4.5S1 8 1 8z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="8" r="2.2" fill="currentColor"/></svg>';
  return a;
}

const HEROES = {
  key: 'heroes', label: 'Heroes', tabs: HERO_TABS, sorts: HERO_SORTS, gene: true, lazy: true,
  search: (h) => `${h.name} ${h.id} ${h.displayId}`,
  placeholder: (h) => `${h.name}\n#${h.displayId}`,
  mount(entry) {
    const h = entry.item;
    const go = (gear) => {
      entry.handle = createAnimatedHeroCard(h, { renderer: gear ? { gear } : {} });
      const strip = el('div', 'hs');
      const a = el('span'); a.append('HEROSCORE ', el('b', null, fmtInt(heroScore(h))));
      const b = el('span', 'x'); b.append(`×${heroMult(h)} · HSX `, el('b', null, fmtInt(heroScoreX(h))));
      strip.append(a, heroViewerLink(h), b);
      entry.slot.replaceChildren(entry.handle.element, strip);
      entry.slot.classList.add('live');
      entry.handle.renderer.then((r) => { entry.renderer = r; if (!entry.visible) r.pause(); });
    };
    const { gear, missing } = heroGear(h);
    if (missing && client) client.equipment.forHero(h).then(go, () => go(gear));
    else go(gear);
  },
  tiles: (list) => {
    const n = (f) => list.filter(f).length;
    return [
      ['Mythic', n((h) => h.rarity === 'mythic')], ['Legendary', n((h) => h.rarity === 'legendary')], ['Shiny', n((h) => h.shiny)],
      ['Gen 0', n((h) => h.generation === 0)], ['Exalted', n((h) => getClassTier(h.statGenes.raw.class.d) === 'exalted')],
      ['Elite', n((h) => getClassTier(h.statGenes.raw.class.d) === 'elite')], ['Max level', Math.max(...list.map((h) => h.level))],
      ['Avg level', (list.reduce((t, h) => t + h.level, 0) / list.length).toFixed(1)],
    ];
  },
  rarity: (h) => h.rarity,
  subtotal: (list) => `Heroscore X ${fmtInt(list.reduce((t, h) => t + heroScoreX(h), 0))}`,
  metric: heroScoreX,
  metricLabel: 'Heroscore X',
  title: 'Legion',
  headScore: (list) => ['Heroscore X', bigNum(list.reduce((t, h) => t + heroScoreX(h), 0)), 'Heroscore + Trait Score'],
  slotSize: 'hero',
};

/* ================= PETS ================= */
const petBonusName = (b) => (b ? (b.revealed ? b.name : 'Unrevealed') : 'None');
const petBonusTier = (b) => (b ? String(b.tier) : '0');
const tierName = (t) => (t === '0' ? 'None' : `${stars(Number(t))} ${({ 1: 'Common', 2: 'Rare', 3: 'Mythic' })[t]}`);
const bondState = (p) => (p.equippedTo === REROLLING ? 'rerolling' : p.equippedTo ? 'bonded' : 'free');
const PET_TABS = [
  { id: 'basics', label: 'Basics', groups: [
    range('pscore', "Hubert's Petscore", petScore, { hint: 'From the Hero Transcendence & Divine Essence deck' }),
    set('rarity', 'Rarity', (p) => [p.rarity], cap, { order: RARITY, swatch: (r) => `var(--r-${r})` }),
    set('element', 'Element', (p) => [p.element], cap),
    set('egg', 'Egg', (p) => [p.eggType], (e) => `${cap(e)} Egg`, { order: ['blue', 'grey', 'green'] }),
    set('profession', 'Boosts profession', (p) => [p.profession], cap),
    set('season', 'Season', (p) => [String(p.season)], (s) => `Season ${s}`, { order: 'key' }),
    set('family', 'Family', (p) => [p.species ? p.species.family : 'Unknown'], (v) => v, { wide: true }),
    set('species', 'Species', (p) => [p.species ? p.species.name : 'Unknown'], (v) => v, { wide: true, closed: true }),
    set('background', 'Background', (p) => [p.background], (v) => v, { wide: true }),
    set('shiny', 'Shiny', (p) => [p.shiny ? 'yes' : 'no'], yesNo('Shiny', 'Not shiny'), { order: ['yes', 'no'] }),
    set('bond', 'Bonded', (p) => [bondState(p)], (v) => ({ bonded: 'Bonded to a hero', free: 'Free', rerolling: 'Rerolling' })[v], { order: ['bonded', 'free', 'rerolling'] }),
    set('realm', 'Origin realm', (p) => [p.originRealm], (r) => REALMS[r] || r, { order: Object.keys(REALMS) }),
    range('bonusCount', 'Number of bonuses', (p) => p.bonusCount),
  ] },
  { id: 'bonuses', label: 'Bonuses', groups: [
    set('gName', 'Gathering bonus', (p) => [petBonusName(p.gathering)], (v) => v, { wide: true }),
    set('gTier', 'Gathering tier', (p) => [petBonusTier(p.gathering)], tierName, { order: ['3', '2', '1', '0'] }),
    set('cName', 'Crafting bonus', (p) => [petBonusName(p.crafting)], (v) => v, { wide: true }),
    set('cTier', 'Crafting tier', (p) => [petBonusTier(p.crafting)], tierName, { order: ['3', '2', '1', '0'] }),
    set('xName', 'Combat bonus', (p) => [petBonusName(p.combat)], (v) => v, { wide: true }),
    set('xTier', 'Combat tier', (p) => [petBonusTier(p.combat)], tierName, { order: ['3', '2', '1', '0'] }),
    range('xValue', 'Combat bonus value', (p) => (p.combat && p.combat.revealed ? p.combat.value : null)),
  ] },
];
const bonusScore = (p) => [p.gathering, p.crafting, p.combat].reduce((t, b) => t + (b ? b.tier : 0), 0);
const PET_SORTS = [
  ['pscore', "Hubert's Petscore", (a, b) => petScore(b) - petScore(a)],
  ['rarity', 'Rarity', (a, b) => rarityIdx(b.rarity) - rarityIdx(a.rarity) || bonusScore(b) - bonusScore(a)],
  ['bonus', 'Bonus stars', (a, b) => bonusScore(b) - bonusScore(a) || rarityIdx(b.rarity) - rarityIdx(a.rarity)],
  ['combat', 'Combat tier', (a, b) => (b.combat ? b.combat.tier : 0) - (a.combat ? a.combat.tier : 0)],
  ['season', 'Season', (a, b) => b.season - a.season],
  ['id', 'ID', (a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1)],
];
function bonusLine(kind, b) {
  const row = el('div', 'bline');
  row.append(el('span', 'bk', kind));
  if (!b) { row.append(el('span', 'bn muted', '—')); return row; }
  row.append(el('span', `bs t${b.tier}`, stars(b.tier)));
  const name = b.revealed ? b.name : 'Unrevealed';
  row.append(el('span', 'bn', kind === 'X' && b.revealed && b.value ? `${name} ${b.value}%` : name));
  return row;
}
// The pet scene is 90 px and the renderer only scales it by whole steps, so pick a canvas size that is an
// exact multiple of 90 on this screen and at least as big as the 228x212 portrait: the scene then fills it.
function petSceneSide() {
  const r = window.devicePixelRatio || 1;
  for (let c = 228; c < 460; c++) { const d = Math.round(c * r); if (d % 90 === 0 && d / 90 >= 1) return c; }
  return 270;
}
const setOwnText = (node, text) => { if (!node) return; const t = [...node.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim()); if (t) t.textContent = text; else node.prepend(text); };
function petCard(entry) {
  const p = entry.item;
  const tpl = SECTIONS.heroes.data[0];
  if (!tpl) return false;
  const fake = { ...tpl, id: p.id, displayId: p.displayId, name: p.name, rarity: p.rarity, element: p.element, shiny: p.shiny, shinyStyle: p.shiny ? (tpl.shinyStyle || 1) : 0 };
  let renderer = null;
  const handle = createHeroCard(fake, {
    flipOnClick: false,
    portrait: (frame) => {
      // Only the pet's own scene: no hero background behind it.
      frame.style.overflow = 'hidden'; frame.style.background = '#000';
      const cv = document.createElement('canvas'); const side = petSceneSide(); cv.width = cv.height = 90 * 4;
      cv.style.cssText = `position:absolute;z-index:1;width:${side}px;height:${side}px;left:${Math.round((228 - side) / 2)}px;top:${Math.round((212 - side) / 2)}px;display:block;image-rendering:pixelated`;
      frame.append(cv);
      try { renderer = new PetRenderer(cv, p, { scene: true }); entry.renderer = renderer; if (!entry.visible) renderer.pause(); } catch (e) { console.error(e); }
      return () => renderer && renderer.destroy();
    },
  });
  const root = handle.element;
  root.classList.add('is-pet');
  root.style.visibility = 'hidden';
  entry.handle = handle;
  const fix = () => {
    const q = (sel) => root.querySelector(`.dfk-heroCardFront ${sel}`);
    setOwnText(q('.dfk-heroName span'), p.name);
    setOwnText(q('.dfk-heroID'), `#${p.displayId}`);
    const eq = q('[class*="equippedIcons"]'); if (eq) eq.style.display = 'none';
    root.querySelectorAll('.dfk-heroCardFront .dfk-specials .dfk-icon').forEach((ic, i) => { if (i > 0) ic.style.display = 'none'; });
    setOwnText(q('.dfk-class'), p.species ? p.species.family : 'Pet');
    setOwnText(q('.dfk-class .dfk-subClass'), '');
    setOwnText(q('.dfk-level'), `${cap(p.eggType)} Egg`);
    setOwnText(q('.dfk-level .dfk-subClass'), '');
    const rows = [['.dfk-statSummons', '.dfk-summonsBar', '.dfk-summonsAmount', p.gathering, 'Gathering'], ['.dfk-statStamina', '.dfk-staminaBar', '.dfk-staminaAmount', p.crafting, 'Crafting'], ['.dfk-statXp', '.dfk-xpBar', '.dfk-xpAmount', p.combat, 'Combat']];
    for (const [row, bar, amt, b, kind] of rows) {
      const name = b ? (b.revealed ? b.name : 'Unrevealed') : `No ${kind.toLowerCase()}`;
      setOwnText(q(row), name.length > 18 ? `${name.slice(0, 17)}…` : name);
      const bb = q(bar); if (bb) bb.style.width = `${b ? (b.tier / 3) * 100 : 0}%`;
      const am = q(amt); if (am) am.textContent = b ? stars(b.tier) : '—';
    }
    const hp = q('.dfk-heroHealth'), mp = q('.dfk-heroMana');
    const total = (p.gathering ? p.gathering.tier : 0) + (p.crafting ? p.crafting.tier : 0) + (p.combat ? p.combat.tier : 0);
    if (hp) { setOwnText(hp, `${total}★`); const img = hp.querySelector('img'); if (img) img.remove(); setOwnText(hp.querySelector('.dfk-tooltip'), 'Bonus stars'); }
    if (mp) { setOwnText(mp, compact(petScore(p))); const img = mp.querySelector('img'); if (img) img.remove(); setOwnText(mp.querySelector('.dfk-tooltip'), `Hubert's Petscore ${fmtInt(petScore(p))}`); }
    root.style.visibility = '';
  };
  handle.ready.then(fix, fix);
  return root;
}
let petView = store.get('dfk-tales:petView') || 'cards';

const PETS = {
  key: 'pets', label: 'Pets', tabs: PET_TABS, sorts: PET_SORTS, lazy: true,
  search: (p) => `${p.name} ${p.id} ${p.displayId} ${p.species ? p.species.family : ''}`,
  placeholder: (p) => `${p.name}\n#${p.displayId}`,
  mount(entry) {
    const p = entry.item;
    if (petView === 'cards') {
      const root = petCard(entry);
      if (root) {
        const strip = el('div', 'hs');
        const a = el('span'); a.append(`${p.bonusCount || 0} BONUS · ${cap(p.rarity).toUpperCase()}`);
        const b = el('span', 'x'); b.append('PETSCORE ', el('b', null, fmtInt(petScore(p))));
        strip.append(a, b);
        entry.slot.replaceChildren(root, strip);
        entry.slot.classList.add('live');
        return;
      }
    }
    const card = el('article', 'pcard');
    card.style.setProperty('--rc', `var(--r-${p.rarity})`);
    const stage = el('div', 'pstage');
    const cv = document.createElement('canvas'); cv.width = 180; cv.height = 180;
    stage.append(cv);
    if (p.shiny) stage.append(el('span', 'shiny', 'SHINY'));
    card.append(stage);
    const body = el('div', 'pbody');
    body.append(el('div', 'pid', `#${p.displayId} · S${p.season} · ${cap(p.eggType)} Egg`));
    body.append(el('h3', 'pname', p.name));
    body.append(el('div', 'pmeta', `${p.species ? p.species.family : ''} · ${cap(p.rarity)} · ${cap(p.element)}`));
    const bl = el('div', 'blist');
    bl.append(bonusLine('G', p.gathering), bonusLine('C', p.crafting), bonusLine('X', p.combat));
    body.append(bl);
    const ps = el('div', 'pscore'); ps.append('PETSCORE ', el('b', null, fmtInt(petScore(p)))); body.append(ps);
    const bond = el('div', 'pbond');
    if (p.equippedTo && p.equippedTo !== REROLLING) {
      bond.append('Bonded to ');
      const a = el('button', 'link', heroLabel(p.equippedTo)); a.type = 'button';
      a.addEventListener('click', () => jumpToHero(p.equippedTo));
      bond.append(a);
    } else bond.textContent = p.equippedTo === REROLLING ? 'Rerolling' : 'Free';
    body.append(bond);
    card.append(body);
    entry.slot.replaceChildren(card);
    entry.slot.classList.add('live');
    try {
      const r = new PetRenderer(cv, p, { scene: true });
      entry.renderer = r;
      if (!entry.visible) r.pause();
    } catch (e) { console.error(e); }
  },
  tiles: (list) => {
    const n = (f) => list.filter(f).length;
    return [
      ['Mythic', n((p) => p.rarity === 'mythic')], ['Legendary', n((p) => p.rarity === 'legendary')], ['Shiny', n((p) => p.shiny)],
      ['Bonded', n((p) => bondState(p) === 'bonded')], ['3★ combat', n((p) => p.combat && p.combat.tier === 3)],
      ['3★ gathering', n((p) => p.gathering && p.gathering.tier === 3)], ['Families', new Set(list.map((p) => p.species && p.species.family)).size],
    ];
  },
  rarity: (p) => p.rarity,
  subtotal: (list) => `Hubert's Petscore ${fmtInt(list.reduce((t, p) => t + petScore(p), 0))}`,
  metric: petScore,
  metricLabel: 'Petscore',
  headScore: (list) => ["Hubert's Petscore", bigNum(list.reduce((t, p) => t + petScore(p), 0))],
  get slotSize() { return petView === 'cards' ? 'hero' : 'pet'; },
};

/* ================= GEAR ================= */
const gr = (e) => String(e.rarity).toLowerCase();
const EMPTY_ENCH = /empty enchantment slot/i;
const realEnch = (e) => e.enchantments.filter((b) => !EMPTY_ENCH.test(b.text));
const emptyEnch = (e) => e.enchantments.length - realEnch(e).length;
// speedModifier is stored signed in one byte: 128+ means negative (dev docs).
const speedPct = (m) => (1 - 2 * Math.floor(m / 128)) * (m % 128);
const gearId = (e) => { try { return String(BigInt(e.id) % 1000000000000n); } catch (x) { return e.id; } };
const GEAR_TABS = [
  { id: 'basics', label: 'Basics', groups: [
    set('kind', 'Kind', (e) => [e.kind], cap, { order: ['weapon', 'offhand', 'armor', 'accessory'] }),
    set('type', 'Type', (e) => [e.typeName], (v) => v, { wide: true }),
    set('rarity', 'Rarity', (e) => [gr(e)], cap, { order: RARITY, swatch: (r) => `var(--r-${r})` }),
    set('equipped', 'Equipped', (e) => [e.equippedTo ? 'yes' : 'no'], yesNo('On a hero', 'In the bag'), { order: ['yes', 'no'] }),
    range('req', 'Hero level required', (e) => e.equipRequirement),
    range('dur', 'Durability', (e) => e.durability),
    range('repairs', 'Repairs left', (e) => e.remainingRepairs),
    set('crafted', 'Crafted by', (e) => [e.craftedBy || 'Unknown'], (v) => v, { wide: true, closed: true }),
    set('realm', 'Origin realm', (e) => [e.originRealm], (r) => REALMS[r] || r, { order: Object.keys(REALMS), closed: true }),
  ] },
  { id: 'stats', label: 'Stats', groups: [
    range('dmg', 'Weapon base damage', (e) => (e.weapon ? e.weapon.baseDamage : null)),
    range('pot', 'Weapon base potency', (e) => (e.weapon ? e.weapon.basePotency : null)),
    range('spd', 'Weapon speed %', (e) => (e.weapon ? speedPct(e.weapon.speedModifier) : null)),
    range('acc', 'Accuracy requirement', (e) => (e.weapon ? e.weapon.accuracyRequirement : null), { closed: true }),
    range('foc', 'Focus requirement', (e) => (e.weapon ? e.weapon.focusRequirement : null), { closed: true }),
    set('pscale', 'Physical scaling', (e) => (e.weapon ? e.weapon.physicalScaling.map((s) => s.stat) : []), (v) => v, { order: STATS.map((s) => s[1]) }),
    set('mscale', 'Magical scaling', (e) => (e.weapon ? e.weapon.magicalScaling.map((s) => s.stat) : []), (v) => v, { order: STATS.map((s) => s[1]) }),
    range('pdef', 'Physical defense', (e) => (e.armor ? e.armor.physicalDefense : null)),
    range('mdef', 'Magical defense', (e) => (e.armor ? e.armor.magicalDefense : null)),
    range('eva', 'Evasion', (e) => (e.armor ? e.armor.evasion : null)),
  ] },
  { id: 'bonuses', label: 'Bonuses', groups: [
    set('bonus', 'Bonuses', (e) => e.bonuses.map((b) => normText(b.text)), (v) => v, { wide: true, hint: '# stands for the value, which varies per item' }),
    range('bonusN', 'Number of bonuses', (e) => e.bonuses.length),
    set('ench', 'Enchantments', (e) => e.enchantments.map((b) => normText(b.text)), (v) => v, { wide: true }),
    range('enchN', 'Enchantments applied', (e) => realEnch(e).length),
    range('enchEmpty', 'Empty enchantment slots', emptyEnch),
  ] },
];
const GEAR_SORTS = [
  ['rarity', 'Rarity', (a, b) => rarityIdx(gr(b)) - rarityIdx(gr(a)) || b.equipRequirement - a.equipRequirement],
  ['kind', 'Kind', (a, b) => a.kind.localeCompare(b.kind) || a.typeName.localeCompare(b.typeName)],
  ['req', 'Level required', (a, b) => b.equipRequirement - a.equipRequirement],
  ['dmg', 'Damage', (a, b) => (b.weapon ? b.weapon.baseDamage : -1) - (a.weapon ? a.weapon.baseDamage : -1)],
  ['def', 'Defense', (a, b) => (b.armor ? b.armor.physicalDefense + b.armor.magicalDefense : -1) - (a.armor ? a.armor.physicalDefense + a.armor.magicalDefense : -1)],
  ['dur', 'Durability', (a, b) => b.durability - a.durability],
];
function statChips(e) {
  const out = [];
  if (e.weapon) {
    const sp = speedPct(e.weapon.speedModifier);
    out.push(['DMG', e.weapon.baseDamage], ['POT', e.weapon.basePotency], ['SPD', `${sp > 0 ? '+' : ''}${sp}%`]);
    const ps = e.weapon.physicalScaling.map((s) => `${s.stat} ${s.value}`).join(' ');
    const ms = e.weapon.magicalScaling.map((s) => `${s.stat} ${s.value}`).join(' ');
    if (ps) out.push(['P.SCALE', ps]);
    if (ms) out.push(['M.SCALE', ms]);
  }
  if (e.armor) out.push(['P.DEF', e.armor.physicalDefense], ['M.DEF', e.armor.magicalDefense], ['EVA', e.armor.evasion]);
  return out;
}
const GEAR = {
  key: 'gear', label: 'Gear', tabs: GEAR_TABS, sorts: GEAR_SORTS,
  search: (e) => `${e.name} ${e.typeName} ${e.id} ${gearId(e)}`,
  render(e) {
    const card = el('article', 'gcard');
    card.style.setProperty('--rc', `var(--r-${gr(e)})`);
    const top = el('div', 'gtop');
    const img = document.createElement('img'); img.src = e.image; img.alt = ''; img.loading = 'lazy'; img.width = 64; img.height = 64;
    img.onerror = () => { img.style.visibility = 'hidden'; };
    const head = el('div', 'ghead');
    head.append(el('div', 'gkind', `${e.typeName} · ${cap(gr(e))}`), el('h3', 'gname', e.name), el('div', 'gid', `#${gearId(e)} · lv ${e.equipRequirement}+`));
    top.append(img, head); card.append(top);
    const chips = statChips(e);
    if (chips.length) {
      const c = el('div', 'gstats');
      for (const [k, v] of chips) { const s = el('span', 'gst'); s.append(el('i', null, k), el('b', null, String(v))); c.append(s); }
      card.append(c);
    }
    const dur = el('div', 'gdur');
    const bar = el('span', 'bar'); const fill = el('i'); fill.style.width = `${e.maxDurability ? (e.durability / e.maxDurability) * 100 : 0}%`; bar.append(fill);
    dur.append(el('span', 'k', 'DUR'), bar, el('span', 'v', `${e.durability}/${e.maxDurability} · ${e.remainingRepairs}/${e.maxRepairs} rep`));
    card.append(dur);
    const ench = realEnch(e), empty = emptyEnch(e);
    if (e.bonuses.length || ench.length || empty) {
      const ul = el('ul', 'gbon');
      e.bonuses.forEach((b) => ul.append(el('li', null, b.text)));
      ench.forEach((b) => ul.append(el('li', 'ench', b.text)));
      if (empty) ul.append(el('li', 'empty', `${empty} empty enchantment slot${empty > 1 ? 's' : ''}`));
      card.append(ul);
    }
    const eq = el('div', 'gequip');
    if (e.equippedTo) {
      eq.append('On ');
      const a = el('button', 'link', heroLabel(e.equippedTo)); a.type = 'button';
      a.addEventListener('click', () => jumpToHero(e.equippedTo));
      eq.append(a);
    } else eq.textContent = 'In the bag';
    card.append(eq);
    return card;
  },
  tiles: (list) => {
    const n = (f) => list.filter(f).length;
    return [
      ['Weapons', n((e) => e.kind === 'weapon')], ['Offhands', n((e) => e.kind === 'offhand')], ['Armor', n((e) => e.kind === 'armor')],
      ['Accessories', n((e) => e.kind === 'accessory')], ['On heroes', n((e) => e.equippedTo)], ['Mythic', n((e) => gr(e) === 'mythic')],
      ['Enchanted', n((e) => realEnch(e).length)], ['Open slots', n((e) => emptyEnch(e))],
    ];
  },
  rarity: gr,
  slotSize: 'gear',
};

/* ================= ITEMS ================= */
const ITEM_TABS = [
  { id: 'basics', label: 'Items', groups: [
    set('category', 'Category', (i) => [i.item.category], (v) => cap(String(v).toLowerCase().replace(/_/g, ' '))),
    set('type', 'Type', (i) => [i.item.type], (v) => cap(String(v).replace(/([A-Z])/g, ' $1').toLowerCase())),
    set('consumable', 'Consumable', (i) => [i.item.consumable ? 'yes' : 'no'], yesNo('Consumable', 'Not consumable'), { order: ['yes', 'no'] }),
    set('soulbound', 'Soulbound', (i) => [i.item.soulbound ? 'yes' : 'no'], yesNo('Soulbound', 'Tradable'), { order: ['yes', 'no'] }),
    range('bal', 'Amount', (i) => num(i.formatted)),
  ] },
];
const ITEM_SORTS = [
  ['bal', 'Amount', (a, b) => num(b.formatted) - num(a.formatted)],
  ['name', 'Name', (a, b) => a.item.name.localeCompare(b.item.name)],
  ['category', 'Category', (a, b) => String(a.item.category).localeCompare(String(b.item.category)) || a.item.name.localeCompare(b.item.name)],
];
const ITEMS = {
  key: 'items', label: 'Items', tabs: ITEM_TABS, sorts: ITEM_SORTS,
  id: (i) => i.item.key,
  search: (i) => `${i.item.name} ${i.item.key} ${i.item.description || ''}`,
  render(i) {
    const card = el('article', 'icard');
    const img = document.createElement('img'); img.alt = ''; img.loading = 'lazy'; img.width = 48; img.height = 48;
    try { img.src = client ? client.items.imageUrl(i.item) : resolveAssetUrl(i.item.image); } catch (e) { img.src = resolveAssetUrl(i.item.image); }
    img.onerror = () => { img.style.visibility = 'hidden'; };
    const body = el('div', 'ibody');
    body.append(el('h3', 'iname', i.item.name), el('div', 'icat', cap(String(i.item.category).toLowerCase().replace(/_/g, ' '))));
    card.append(img, body, el('b', 'iamt', fmtAmount(i.formatted)));
    card.title = i.item.description || i.item.name;
    return card;
  },
  tiles: (list) => [['Item types', list.length], ...tokenTiles()],
  slotSize: 'item',
};
let tokens = [];
const tokenTiles = () => tokens.filter((t) => num(t.formatted) > 0).map((t) => [t.token.symbol, fmtAmount(t.formatted)]);

/* ================= engine ================= */
const SECTIONS = { heroes: HEROES, pets: PETS, gear: GEAR, items: ITEMS };
for (const S of Object.values(SECTIONS)) {
  Object.assign(S, { data: [], cache: new Map(), sel: {}, rng: {}, query: '', tab: S.tabs[0].id, sort: S.sorts[0][0], cards: new Map(), state: 'idle' });
  S.groups = S.tabs.flatMap((t) => t.groups);
  S.idOf = S.id || ((x) => String(x.id));
}
let current = 'heroes';
let client = null;
let owner = '';
let chainName = '';
const S = () => SECTIONS[current];

function buildCache(sec) {
  sec.cache = new Map();
  for (const x of sec.data) {
    const row = { _q: sec.search(x).toLowerCase() };
    for (const g of sec.groups) row[g.id] = g.type === 'set' ? g.values(x).map(String) : g.get(x);
    sec.cache.set(sec.idOf(x), row);
  }
}

function matches(sec, x, skip) {
  const row = sec.cache.get(sec.idOf(x));
  if (sec.query && !row._q.includes(sec.query.toLowerCase())) return false;
  for (const g of sec.groups) {
    if (g.id === skip) continue;
    if (g.type === 'set') {
      const s = sec.sel[g.id];
      if (s && s.size && !row[g.id].some((v) => s.has(v))) return false;
    } else {
      const r = sec.rng[g.id];
      if (r && (r.min != null || r.max != null)) {
        const v = row[g.id];
        if (v == null) return false;
        if (r.min != null && v < r.min) return false;
        if (r.max != null && v > r.max) return false;
      }
    }
  }
  return true;
}
const groupActive = (sec, g) => (g.type === 'set' ? !!(sec.sel[g.id] && sec.sel[g.id].size) : !!(sec.rng[g.id] && (sec.rng[g.id].min != null || sec.rng[g.id].max != null)));
const activeCount = (sec) => sec.groups.filter((g) => groupActive(sec, g)).length + (sec.query ? 1 : 0);

function orderKeys(g, keys, counts) {
  if (Array.isArray(g.order)) return [...keys].sort((a, b) => (g.order.indexOf(a) + 1 || 999) - (g.order.indexOf(b) + 1 || 999));
  if (typeof g.order === 'function') return [...keys].sort(g.order);
  if (g.order === 'key') return [...keys].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return [...keys].sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0) || a.localeCompare(b));
}

/* ---------- sidebar ---------- */
function buildSidebar() {
  const sec = S();
  $('#scope-wrap').hidden = !sec.gene;
  if (sec.state !== 'ready') {
    $('#tabs').replaceChildren();
    $('#panels').replaceChildren(el('p', 'side-empty', sec.state === 'loading' ? `Reading ${sec.label.toLowerCase()}…` : 'Load a legion to filter it.'));
    syncHeader();
    return;
  }
  $('#tabs').style.gridTemplateColumns = `repeat(${sec.tabs.length}, 1fr)`;
  $('#tabs').replaceChildren(...sec.tabs.map((t) => {
    const b = el('button', null, t.label); b.type = 'button'; b.id = `tab-${t.id}`; b.setAttribute('role', 'tab'); b.dataset.tab = t.id;
    const d = el('span', 'dot'); d.hidden = true; b.append(d);
    b.addEventListener('click', () => { sec.tab = t.id; syncTabs(); });
    return b;
  }));
  const fullCounts = new Map();
  for (const g of sec.groups) if (g.type === 'set') { const m = new Map(); for (const row of sec.cache.values()) row[g.id].forEach((v) => m.set(v, (m.get(v) || 0) + 1)); fullCounts.set(g.id, m); }
  $('#panels').replaceChildren(...sec.tabs.map((t, ti) => {
    const p = el('div', 'panel'); p.id = `panel-${t.id}`; p.setAttribute('role', 'tabpanel');
    if (ti === 0) {
      const s = el('div', 'search');
      const i = document.createElement('input'); i.type = 'search'; i.id = 'q'; i.placeholder = 'Search name or ID'; i.setAttribute('aria-label', 'Search'); i.value = sec.query;
      i.addEventListener('input', () => { sec.query = i.value.trim(); schedule(); });
      s.append(i); p.append(s);
    }
    for (const g of t.groups) p.append(buildGroup(sec, g, fullCounts.get(g.id)));
    return p;
  }));
  syncTabs();
  syncHeader();
}

function buildGroup(sec, g, counts) {
  const det = el('details', 'fg'); det.dataset.group = g.id; det.open = !g.closed;
  const sum = el('summary');
  sum.append(el('span', 'label', g.label), el('span', 'on'));
  det.append(sum);
  if (g.hint) det.append(el('div', 'hint', g.hint));
  if (g.type === 'set') {
    const box = el('div', `opts${g.wide ? ' wide' : ''}`);
    let idx = 0;
    for (const key of orderKeys(g, counts.keys(), counts)) {
      const l = el('label', 'opt'); l.dataset.key = key; l.dataset.i = String(idx++);
      const c = document.createElement('input'); c.type = 'checkbox'; c.value = key;
      c.id = `f-${sec.key}-${g.id}-${key}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      c.checked = !!(sec.sel[g.id] && sec.sel[g.id].has(key));
      c.addEventListener('change', () => {
        sec.sel[g.id] = sec.sel[g.id] || new Set();
        if (c.checked) sec.sel[g.id].add(key); else sec.sel[g.id].delete(key);
        schedule();
      });
      const col = g.swatch ? g.swatch(key) : null;
      const sw = el('span', col ? 'sw' : 'sw none'); if (col) sw.style.background = col;
      const name = g.name(key);
      const nm = el('span', 'nm', name); nm.title = name;
      const tag = g.tag ? g.tag(key) : ''; if (tag) nm.append(el('i', null, tag));
      l.append(c, sw, nm, el('span', 'ct'));
      box.append(l);
    }
    det.append(box);
  } else {
    let lo = Infinity, hi = -Infinity;
    for (const row of sec.cache.values()) { const v = row[g.id]; if (v == null) continue; if (v < lo) lo = v; if (v > hi) hi = v; }
    const fmt = (v) => (Number.isFinite(v) ? String(Math.round(v * 100) / 100) : '');
    const box = el('div', 'rng');
    const mk = (which, ph) => {
      const i = document.createElement('input'); i.type = 'number'; i.step = 'any'; i.inputMode = 'decimal';
      i.id = `f-${sec.key}-${g.id}-${which}`; i.placeholder = ph; i.setAttribute('aria-label', `${g.label} ${which}`);
      const cur = sec.rng[g.id] && sec.rng[g.id][which]; if (cur != null) i.value = cur;
      i.addEventListener('input', () => {
        sec.rng[g.id] = sec.rng[g.id] || { min: null, max: null };
        sec.rng[g.id][which] = i.value === '' ? null : Number(i.value);
        schedule();
      });
      return i;
    };
    box.append(mk('min', `min ${fmt(lo)}`), el('span', null, '–'), mk('max', `max ${fmt(hi)}`));
    det.append(box);
  }
  return det;
}

function syncTabs() {
  const sec = S();
  document.querySelectorAll('#tabs [role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === sec.tab)));
  sec.tabs.forEach((t) => { const p = document.getElementById(`panel-${t.id}`); if (p) p.hidden = t.id !== sec.tab; });
}

function syncHeader() {
  const sec = S();
  const n = sec.state === 'ready' ? activeCount(sec) : 0;
  $('#active-n').hidden = n === 0; $('#active-n').textContent = n;
  $('#rail-n').hidden = n === 0; $('#rail-n').textContent = n;
  $('#btn-reset').disabled = n === 0;
}

function updateFacets() {
  const sec = S();
  if (sec.state !== 'ready') return;
  for (const g of sec.groups) {
    const det = document.querySelector(`.fg[data-group="${g.id}"]`);
    if (!det) continue;
    if (g.type === 'set') {
      const counts = new Map();
      for (const x of sec.data) if (matches(sec, x, g.id)) for (const v of sec.cache.get(sec.idOf(x))[g.id]) counts.set(v, (counts.get(v) || 0) + 1);
      det.querySelectorAll('.opt').forEach((l) => { const k = counts.get(l.dataset.key) || 0; l.querySelector('.ct').textContent = k; l.classList.toggle('zero', k === 0); });
      det.querySelector('.on').textContent = groupActive(sec, g) ? `${sec.sel[g.id].size} ON` : '';
    } else det.querySelector('.on').textContent = groupActive(sec, g) ? 'ON' : '';
  }
  for (const t of sec.tabs) {
    const on = t.groups.some((g) => groupActive(sec, g)) || (t === sec.tabs[0] && !!sec.query);
    const dot = document.querySelector(`#tab-${t.id} .dot`); if (dot) dot.hidden = !on;
  }
  syncHeader();
}

/* ---------- grid ---------- */
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const sec = SECTIONS[e.target.dataset.sec];
    const entry = sec && sec.cards.get(e.target.dataset.id);
    if (!entry) continue;
    entry.visible = e.isIntersecting;
    if (e.isIntersecting) {
      if (!entry.mounted) { entry.mounted = true; sec.mount(entry); }
      else if (entry.renderer) entry.renderer.resume();
    } else if (entry.renderer) entry.renderer.pause();
  }
}, { rootMargin: '400px 0px' });

function renderGrid() {
  const sec = S();
  const grid = $('#grid');
  grid.className = `grid ${sec.slotSize}`;
  if (sec.state !== 'ready') { grid.replaceChildren(); return; }
  const sorter = sec.sorts.find((s) => s[0] === sec.sort)[2];
  const list = sec.data.filter((x) => matches(sec, x, null)).sort(sorter);
  const keep = new Set(list.map(sec.idOf));
  for (const [id, entry] of sec.cards) if (!keep.has(id)) { io.unobserve(entry.slot); entry.slot.remove(); }
  const frag = document.createDocumentFragment();
  for (const x of list) {
    const id = sec.idOf(x);
    let entry = sec.cards.get(id);
    if (!entry) {
      const slot = el('div', 'slot'); slot.dataset.id = id; slot.dataset.sec = sec.key;
      entry = { item: x, slot, mounted: false, renderer: null, visible: false };
      if (sec.lazy) slot.textContent = sec.placeholder(x);
      else { slot.append(sec.render(x)); slot.classList.add('live'); }
      sec.cards.set(id, entry);
    }
    frag.append(entry.slot);
    if (sec.lazy) io.observe(entry.slot);
  }
  grid.replaceChildren(frag);
  const c = $('#count');
  if (list.length < sec.data.length) {
    c.replaceChildren('Showing ', el('b', null, String(list.length)), ` of ${sec.data.length}`);
    if (sec.subtotal && list.length) c.append(' · ', el('b', null, sec.subtotal(list)));
  } else c.replaceChildren();
}

let timer = 0;
function schedule() { clearTimeout(timer); timer = setTimeout(() => { renderGrid(); updateFacets(); }, 120); }

/* ---------- headline ---------- */
function renderHeadline() {
  const sec = S();
  $('#sec-title').textContent = sec.title || sec.label;
  $('#total').textContent = sec.state === 'ready' ? sec.data.length : '';
  const hs = $('#sec-score');
  if (sec.headScore && sec.state === 'ready' && sec.data.length) {
    const [label, value, desc] = sec.headScore(sec.data);
    const num = el('span', 'num', value);
    if (desc) num.append(el('small', null, desc));
    hs.replaceChildren(el('em', null, label), num);
    hs.hidden = false;
  } else hs.hidden = true;
  const ready = sec.state === 'ready' && sec.data.length;
  $('#tiles').replaceChildren(...(ready ? sec.tiles(sec.data) : []).map(([k, v]) => { const d = el('div', 'tile'); d.append(el('span', 'label', k), el('b', null, String(v))); return d; }));
  const showBar = ready && sec.rarity;
  $('#rbar').hidden = !showBar; $('#legend').hidden = !showBar;
  if (showBar) {
    const counts = RARITY.map((r) => sec.data.filter((x) => String(sec.rarity(x)).toLowerCase() === r).length);
    $('#rbar').replaceChildren(...RARITY.map((r, i) => { const e = el('i'); e.style.width = `${(counts[i] / sec.data.length) * 100}%`; e.style.background = `var(--r-${r})`; return e; }));
    $('#legend').replaceChildren(...RARITY.map((r, i) => { const e = el('em', null, `${cap(r)} ${counts[i]}`); e.style.setProperty('--c', `var(--r-${r})`); return e; }));
  }
  const sort = $('#sort');
  sort.replaceChildren(...sec.sorts.map(([v, l]) => { const o = el('option', null, l); o.value = v; return o; }));
  sort.value = sec.sort;
  $('#resbar').hidden = sec.state !== 'ready';
  $('#count').replaceChildren(sec.state === 'loading' ? `Reading ${sec.label.toLowerCase()}…` : '');
}

function renderSecTabs() {
  document.querySelectorAll('#sections [data-sec]').forEach((b) => {
    const sec = SECTIONS[b.dataset.sec];
    b.setAttribute('aria-selected', String(b.dataset.sec === current));
    b.querySelector('.n').textContent = sec.state === 'ready' ? sec.data.length : sec.state === 'loading' ? '…' : sec.state === 'error' ? '!' : '';
  });
}

function show(key, { keepHash } = {}) {
  if (!SECTIONS[key]) return;
  current = key;
  if (typeof syncPetView === 'function') syncPetView();
  if (!keepHash) history.replaceState(null, '', `#${key}`);
  renderSecTabs(); renderHeadline(); buildSidebar(); renderGrid(); updateFacets();
}

function jumpToHero(id) {
  const sec = SECTIONS.heroes;
  if (sec.state !== 'ready') return;
  for (const k of Object.keys(sec.sel)) delete sec.sel[k];
  for (const k of Object.keys(sec.rng)) delete sec.rng[k];
  sec.query = String(id);
  show('heroes');
  window.scrollTo({ top: 0 });
}

/* ---------- loading ---------- */
let run = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// The public node drops calls when it is busy; try again a few times before giving up.
async function retry(fn, tries = 4) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) { if (i >= tries - 1) throw e; await sleep(700 * (i + 1) * (i + 1)); }
  }
}
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(a.trim());
function setStatus(t, err = false) { const s = $('#status'); s.textContent = t; s.classList.toggle('err', err); }

function resetSection(sec) {
  for (const entry of sec.cards.values()) { io.unobserve(entry.slot); if (entry.handle && entry.handle.destroy) entry.handle.destroy(); if (entry.renderer && entry.renderer.destroy && sec.key === 'pets') entry.renderer.destroy(); }
  sec.cards.clear(); sec.data = []; sec.cache = new Map(); sec.query = '';
  for (const k of Object.keys(sec.sel)) delete sec.sel[k];
  for (const k of Object.keys(sec.rng)) delete sec.rng[k];
}

function finish(sec, data, my) {
  if (my !== run) return;
  sec.data = data; buildCache(sec); sec.state = 'ready';
  renderSecTabs();
  if (current === sec.key) { renderHeadline(); buildSidebar(); renderGrid(); updateFacets(); }
}
function fail(sec, e, my) {
  if (my !== run) return;
  console.error(sec.key, e);
  sec.state = 'error'; renderSecTabs();
  if (current === sec.key) { renderHeadline(); buildSidebar(); $('#count').textContent = `Could not read ${sec.label.toLowerCase()}. Load again in a moment.`; }
}

/* A legion is opened from what this browser kept, when it has it, or read from the chain.
   "Load legion" always reads the chain again. */
const CHAIN_IDS = ['43114', '8217'];
let shown = null; // { addr, chainId } of the legion on screen

function begin(addr, chainId) {
  const my = ++run;
  $('#addr').value = addr; $('#chain').value = String(chainId);
  owner = addr; chainName = $('#chain').selectedOptions[0].textContent;
  shown = { addr, chainId };
  client = createDFKClient({ chainId });
  heroById.clear(); gearByKey.clear(); clearHeroScores(); tokens = [];
  for (const sec of Object.values(SECTIONS)) { resetSection(sec); sec.state = 'loading'; }
  $('#void').hidden = true; $('#headline').hidden = false;
  renderWhose();
  renderSecTabs(); renderHeadline(); buildSidebar(); renderGrid();
  store.set('dfk-tales:addr', addr); store.set('dfk-tales:chain', String(chainId));
  const q = new URLSearchParams(); q.set('legion', addr); if (chainId !== 43114) q.set('chain', String(chainId));
  history.replaceState(null, '', `${location.pathname}?${q}${location.hash}`);
  return my;
}

function renderWhose() {
  const w = getWallet();
  const box = $('#whose');
  if (!shown) { box.textContent = ''; return; }
  box.replaceChildren(sameAddr(w, shown.addr) ? 'Your legion · ' : 'Legion of ', el('span', 'addr', shortAddr(shown.addr)), ` · ${chainName}`);
  box.title = shown.addr;
}

function applyLegion(data, my) {
  for (const e of data.gear) gearByKey.set(`${e.kind === 'offhand' ? 'accessory' : e.kind}:${e.id}`, e);
  data.heroes.forEach((h) => heroById.set(String(h.id), h));
  tokens = data.tokens || [];
  finish(SECTIONS.gear, data.gear, my);
  finish(SECTIONS.heroes, data.heroes, my);
  finish(SECTIONS.pets, data.pets, my);
  finish(SECTIONS.items, data.items, my);
}

/* The legion updates by itself: when the copy kept in this browser is older than STALE, it is read again
   from the chain in the background and swapped in only if something changed, keeping filters and scroll. */
const STALE = 15 * 60 * 1000;
let shownData = null, shownAt = 0, refreshing = false, retryAt = 0;
const digest = (d) => JSON.stringify(d, (k, v) => (typeof v === 'bigint' ? v.toString() : v));
const keptLine = () => `Read from the chain ${ago(shownAt)}, kept in this browser. It updates by itself every 15 minutes; Load legion reads it now.`;

async function openLegion(addr, chainId, { fresh = false } = {}) {
  addr = addr.trim();
  if (!isAddr(addr)) { setStatus('That is not a wallet address: 0x followed by 40 characters.', true); return; }
  chainId = CHAIN_IDS.includes(String(chainId)) ? Number(chainId) : 43114;
  const my = begin(addr, chainId);
  shownData = null; shownAt = 0;
  if (!fresh) {
    const saved = await readLegion(chainId, addr);
    if (my !== run) return;
    if (saved && saved.heroes && saved.pets && saved.gear && saved.items) {
      const { savedAt, ...data } = saved;
      shownData = data; shownAt = savedAt;
      applyLegion(data, my);
      restoreView(addr, chainId);
      setStatus(keptLine());
      if (Date.now() - savedAt > STALE) refreshInBackground();
      return;
    }
  }
  await readChain(addr, chainId, my);
}

/* The five reads of a legion. Heroes come in batches of 60 and report their progress. */
function readParts(addr, my, onHeroes) {
  const pGear = retry(() => client.equipment.byOwner(addr, { includeListed: true }));
  const pHeroes = (async () => {
    const ids = await retry(() => client.heroes.idsByOwner(addr, { includeListed: true }));
    const out = [];
    onHeroes(0, ids.length);
    for (let i = 0; i < ids.length; i += 60) {
      if (my !== run) return out;
      out.push(...(await retry(() => client.heroes.getMany(ids.slice(i, i + 60)))));
      onHeroes(out.length, ids.length);
    }
    return out;
  })();
  const pPets = retry(() => client.pets.byOwner(addr, { includeListed: true }));
  const pItems = retry(() => client.items.balances(addr)).then((l) => l.filter((b) => num(b.formatted) > 0));
  const pTokens = retry(() => client.tokens.balances(addr)).catch(() => []);
  return { pGear, pHeroes, pPets, pItems, pTokens };
}

async function readChain(addr, chainId, my) {
  $('#btn-load').disabled = true;
  setStatus('Reading the legion from the chain…');
  const { pGear, pHeroes, pPets, pItems, pTokens } = readParts(addr, my, (n, total) => {
    if (my !== run) return;
    setStatus(`Reading the legion from the chain: heroes ${n} / ${total}`);
    if (current === 'heroes' && SECTIONS.heroes.state === 'loading') $('#count').textContent = `Reading heroes ${n} / ${total}`;
  });
  const got = {};
  pGear.then((list) => {
    got.gear = list;
    if (my !== run) return;
    for (const e of list) gearByKey.set(`${e.kind === 'offhand' ? 'accessory' : e.kind}:${e.id}`, e);
    finish(SECTIONS.gear, list, my);
  }, (e) => fail(SECTIONS.gear, e, my));
  pHeroes.then((list) => { got.heroes = list; list.forEach((h) => heroById.set(String(h.id), h)); });
  Promise.allSettled([pHeroes, pGear]).then(([h]) => {
    if (h.status === 'fulfilled') finish(SECTIONS.heroes, h.value, my); else fail(SECTIONS.heroes, h.reason, my);
    const g = SECTIONS.gear;
    if (my === run && g.state === 'ready') { g.cards.clear(); if (current === 'gear') renderGrid(); }
  });
  Promise.allSettled([pPets, pHeroes]).then(([p]) => { if (p.status === 'fulfilled') { got.pets = p.value; finish(SECTIONS.pets, p.value, my); } else fail(SECTIONS.pets, p.reason, my); });
  Promise.allSettled([pItems, pTokens]).then(([i, t]) => {
    if (t.status === 'fulfilled') got.tokens = tokens = t.value;
    if (i.status === 'fulfilled') { got.items = i.value; finish(SECTIONS.items, i.value, my); } else fail(SECTIONS.items, i.reason, my);
  });
  await Promise.allSettled([pHeroes, pGear, pPets, pItems, pTokens]);
  if (my !== run) return;
  $('#btn-load').disabled = false;
  const failed = Object.values(SECTIONS).filter((s) => s.state === 'error').map((s) => s.label.toLowerCase());
  if (failed.length) { setStatus(`Could not read ${failed.join(', ')}. Load again in a moment.`, true); return; }
  shownData = got; shownAt = Date.now();
  setStatus('');
  // Keep it in this browser: coming back to this legion will not read the chain again.
  saveLegion(chainId, addr, got).then((t) => { shownAt = t; }, (e) => console.warn('legion not kept in this browser', e));
}

async function refreshInBackground() {
  if (refreshing || !shown || !shownData) return;
  const { addr, chainId } = shown;
  const my = run;
  refreshing = true;
  const base = keptLine().split('. It updates')[0];
  try {
    const p = readParts(addr, my, (n, total) => { if (my === run) setStatus(`${base}. Updating from the chain: heroes ${n} / ${total}`); });
    const [gear, heroes, pets, items, tokens] = await Promise.all([p.pGear, p.pHeroes, p.pPets, p.pItems, p.pTokens]);
    if (my !== run) return;
    const got = { gear, heroes, pets, items, tokens };
    const changed = digest(got) !== digest(shownData);
    shownAt = await saveLegion(chainId, addr, got).catch(() => Date.now());
    if (changed) {
      saveView();
      const my2 = begin(addr, chainId);
      applyLegion(got, my2);
      restoreView(addr, chainId);
    }
    shownData = got;
    setStatus(changed ? 'Updated from the chain just now: the legion changed since the last read.' : keptLine());
  } catch (e) {
    console.warn('background update', e);
    if (my === run) setStatus(`${base}. The chain did not answer the update: it tries again in a few minutes.`, true);
    retryAt = Date.now() + 5 * 60 * 1000; // try again in 5 minutes
  } finally {
    refreshing = false;
  }
}
const maybeRefresh = () => {
  if (document.hidden || !shownAt || refreshing || Date.now() < retryAt) return;
  if (SECTIONS.heroes.state !== 'ready') return;
  if (Date.now() - shownAt > STALE) refreshInBackground();
  else if (shownData && !$('#status').classList.contains('err') && /^Read from the chain/.test($('#status').textContent)) setStatus(keptLine());
};
setInterval(maybeRefresh, 60 * 1000);
document.addEventListener('visibilitychange', maybeRefresh);

/* Where you were in the legion (section, filters, search, sort, scroll), for when you come back to it. */
const viewKey = (addr, chainId) => `dfk-tales:view:${chainId}:${addr.toLowerCase()}`;
function saveView() {
  if (!shown) return;
  const secs = {};
  for (const [k, sec] of Object.entries(SECTIONS)) {
    secs[k] = { tab: sec.tab, sort: sec.sort, query: sec.query, rng: sec.rng, sel: Object.fromEntries(Object.entries(sec.sel).map(([g, set]) => [g, [...set]])) };
  }
  try { sessionStorage.setItem(viewKey(shown.addr, shown.chainId), JSON.stringify({ current, scope, scrollY: window.scrollY, secs })); } catch (e) {}
}
function restoreView(addr, chainId) {
  let v = null;
  try { v = JSON.parse(sessionStorage.getItem(viewKey(addr, chainId)) || 'null'); } catch (e) {}
  if (!v) return;
  if (v.scope && v.scope !== scope) {
    scope = v.scope;
    document.querySelectorAll('[data-scope]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.scope === scope)));
    buildCache(SECTIONS.heroes);
  }
  for (const [k, st] of Object.entries(v.secs || {})) {
    const sec = SECTIONS[k]; if (!sec) continue;
    if (st.tab && sec.tabs.some((t) => t.id === st.tab)) sec.tab = st.tab;
    if (st.sort && sec.sorts.some(([id]) => id === st.sort)) sec.sort = st.sort;
    sec.query = st.query || '';
    Object.assign(sec.rng, st.rng || {});
    for (const [g, list] of Object.entries(st.sel || {})) sec.sel[g] = new Set(list);
  }
  show(SECTIONS[v.current] ? v.current : current);
  if (v.scrollY) requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, v.scrollY)));
}
window.addEventListener('pagehide', saveView);

/* ---------- wiring ---------- */
$('#form').addEventListener('submit', (e) => { e.preventDefault(); openLegion($('#addr').value, $('#chain').value, { fresh: true }); });
$('#sort').addEventListener('change', () => { S().sort = $('#sort').value; renderGrid(); });
$('#btn-reset').addEventListener('click', () => {
  const sec = S();
  for (const k of Object.keys(sec.sel)) delete sec.sel[k];
  for (const k of Object.keys(sec.rng)) delete sec.rng[k];
  sec.query = '';
  buildSidebar(); renderGrid(); updateFacets();
});
document.querySelectorAll('[data-scope]').forEach((b) => b.addEventListener('click', () => {
  scope = b.dataset.scope;
  document.querySelectorAll('[data-scope]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  const sec = SECTIONS.heroes;
  if (sec.state !== 'ready') return;
  for (const g of sec.groups) if (g.gene) delete sec.sel[g.id];
  buildCache(sec);
  if (current === 'heroes') { buildSidebar(); renderGrid(); updateFacets(); }
}));
document.querySelectorAll('#sections [data-sec]').forEach((b) => b.addEventListener('click', () => show(b.dataset.sec)));
$('#btn-filters').addEventListener('click', () => $('#side').classList.toggle('open'));
// Filters fold into a thin rail on the left; on phones the same button closes the drawer.
const narrow = window.matchMedia('(max-width: 900px)');
function setSide(open) {
  $('.lv').classList.toggle('collapsed', !open);
  store.set('dfk-tales:side', open ? 'open' : 'closed');
}
$('#btn-hide').addEventListener('click', () => { if (narrow.matches) $('#side').classList.remove('open'); else setSide(false); });
$('#btn-rail').addEventListener('click', () => setSide(true));
if (store.get('dfk-tales:side') === 'closed') $('.lv').classList.add('collapsed');
// The bar on top wraps to two rows on phones: keep the sticky sidebar just under it.
new ResizeObserver(([e]) => document.documentElement.style.setProperty('--top', `${Math.round(e.target.getBoundingClientRect().height)}px`)).observe($('.topbar'));
document.querySelectorAll('[data-petview]').forEach((b) => b.addEventListener('click', () => {
  if (petView === b.dataset.petview) return;
  petView = b.dataset.petview; store.set('dfk-tales:petView', petView);
  const P = SECTIONS.pets;
  for (const entry of P.cards.values()) { io.unobserve(entry.slot); if (entry.renderer && entry.renderer.destroy) entry.renderer.destroy(); }
  P.cards.clear();
  syncPetView();
  if (current === 'pets') renderGrid();
}));
function syncPetView() {
  document.querySelectorAll('[data-petview]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.petview === petView)));
  $('#petview-wrap').hidden = current !== 'pets';
}
// Your wallet stays connected on every page. Its chip opens your legion; connecting opens it too.
const openMine = (w) => {
  const chainId = Number($('#chain').value) || 43114;
  if (shown && sameAddr(shown.addr, w) && shown.chainId === chainId && SECTIONS.heroes.state !== 'error') return;
  openLegion(w, chainId);
};
mountWallet($('#wallet'), { onOpen: openMine, onConnect: openMine });
onWalletChange(renderWhose);

// Which legion to show: the one in the link, else the last one you looked at, else yours.
const fromHash = location.hash.slice(1);
show(SECTIONS[fromHash] ? fromHash : 'heroes', { keepHash: true });
const params = new URLSearchParams(location.search);
const linked = params.get('legion');
const lastAddr = store.get('dfk-tales:addr');
const lastChain = store.get('dfk-tales:chain');
if (linked && isAddr(linked)) openLegion(linked, params.get('chain') || 43114);
else if (lastAddr && isAddr(lastAddr)) openLegion(lastAddr, lastChain || 43114);
else if (getWallet()) openLegion(getWallet(), 43114);
else setStatus('Connect your wallet, or paste any wallet address in the bar at the top, to begin.');
