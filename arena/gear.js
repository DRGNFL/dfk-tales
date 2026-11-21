/* DFK Tales Arena — real gear from the chain (SDK Equipment objects) turned into battle numbers.
   Units read from the chain (checked on Ge's legion): scaling value /10 (11 = 1.1 x stat), accuracy at requirement /1000,
   armour scalar /100 (120 = 1.2 x stat), speed modifier signed (bit 128 = negative).
   Bonuses are read from their game text; the ones the battle does not use yet are kept with active: false. */

const speedPct = (m) => (1 - 2 * Math.floor(m / 128)) * (m % 128);
/* ASSUMPTION: armour evasion is signed like the speed modifier but on 16 bits, in hundredths of a percent (33228 = −4.60%). */
const evasionPct = (v) => ((1 - 2 * Math.floor(v / 32768)) * (v % 32768)) / 100;

const TYPE = { Staff: '2H Staff', Wand: '1H Wand', Dagger: '1H Dagger' };
export const weaponSetOf = (e) => TYPE[e.typeName] || e.typeName;
const RANGED = new Set(['Bow', 'Staff', 'Wand']);
const MAGIC = new Set(['Staff', 'Wand']);
const REACH2 = new Set(['1H Spear', '2H Spear']);

export function weaponFromGear(e) {
  const w = e.weapon;
  const magic = MAGIC.has(e.typeName);
  return {
    name: e.name, gearId: e.id, rarity: e.rarity, typeName: e.typeName, real: true,
    kind: RANGED.has(e.typeName) ? 'ranged' : 'melee',
    reach: RANGED.has(e.typeName) ? 3 : REACH2.has(e.typeName) ? 2 : 1,
    magic,
    base: w.baseDamage,
    scale: w.physicalScaling.map((s) => [s.stat, s.value / 10, s.max]),
    spell: [w.basePotency, w.magicalScaling.map((s) => [s.stat, s.value / 10, s.max])],
    req: magic ? w.focusRequirement : w.accuracyRequirement,
    aar: (magic ? w.magicalAccuracyAtRequirement : w.physicalAccuracyAtRequirement) / 1000,
    speed: speedPct(w.speedModifier) / 100,
    mods: bonusesOf(e),
  };
}

/* P.DEF = base + min(END x scalar, max); M.DEF = base + min(WIS x scalar, max), as the loaned Medium set. */
export function armourFromGear(e) {
  const a = e.armor;
  return {
    name: e.name, gearId: e.id, rarity: e.rarity, typeName: e.typeName, real: true,
    pdef: [a.physicalDefense, 'END', a.physicalDefenseScalar / 100, a.physicalDefenseScalarMax],
    mdef: [a.magicalDefense, 'WIS', a.magicalDefenseScalar / 100, a.magicalDefenseScalarMax],
    eva: evasionPct(a.evasion),
    mods: bonusesOf(e),
  };
}

/* Offhands and accessories have no stat block of their own: everything they give is in their bonuses. */
export const extraFromGear = (e) => ({ name: e.name, gearId: e.id, rarity: e.rarity, typeName: e.typeName, kind: e.kind, real: true, mods: bonusesOf(e) });

const STATUS = { bleed: 'bleed', confuse: 'confuse', daze: 'daze', poison: 'poison', blind: 'blind', stun: 'stun', silence: 'silence', fear: 'fear', slow: 'slow', burn: 'burn', chill: 'chill', exhaust: 'exhaust' };
const RULES = [
  [/^Gain ([\d.]+)% chance to inflict (\w+) on hit$/, (m) => ({ key: 'onHit', status: STATUS[m[2].toLowerCase()], value: +m[1] })],
  [/^Gain ([\d.]+)% chance to inflict Daze on basic attack when targeting a channeling enemy$/, (m) => ({ key: 'dazeChanneler', value: +m[1] })],
  [/^Critical Hits gain ([\d.]+)% Lifesteal$/, (m) => ({ key: 'critLifesteal', value: +m[1] })],
  [/^Increase Critical Hit chance by \+?([\d.]+)%$/, (m) => ({ key: 'crit', value: +m[1] })],
  [/^Increase Critical Hit (?:damage multiplier|Multiplier) by \+?([\d.]+)$/, (m) => ({ key: 'critMult', value: +m[1] })],
  [/^Decrease Physical and Magical Defense by ([\d.]+)% each$/, (m) => ({ key: 'defPct', value: -m[1] })],
  [/^Increase Magical Damage dealt and reduce Healing Potency by ([\d.]+)% each$/, (m) => ({ key: 'magicVsHeal', value: +m[1] })],
  [/^Increase Healing Potency and reduce Magical Damage dealt by ([\d.]+)% each$/, (m) => ({ key: 'magicVsHeal', value: -m[1] })],
  [/^Increase Block chance by \+?([\d.]+)%$/, (m) => ({ key: 'block', value: +m[1] })],
  [/^Increase Spell Block chance by \+?([\d.]+)%$/, (m) => ({ key: 'spellBlock', value: +m[1] })],
  [/^Increase Block damage reduction by ([\d.]+)%$/, (m) => ({ key: 'blockCut', value: +m[1] })],
  [/^Increase (\w+) Resistance by \+?([\d.]+)%$/, (m) => ({ key: 'res', status: m[1].toLowerCase(), value: +m[2] })],
  [/^Gain ([\d.]+) Initiative after each successful Block$/, (m) => ({ key: 'blockInit', value: +m[1] })],
  [/^Decrease Speed by ([\d.]+)%$/, (m) => ({ key: 'speed', value: -m[1] })],
  [/^Increase Speed by ([\d.]+)%$/, (m) => ({ key: 'speed', value: +m[1] })],
  [/^Increase P\.DEF by ([\d.]+)$/, (m) => ({ key: 'pdefFlat', value: +m[1] })],
  [/^Increase M\.DEF by ([\d.]+)$/, (m) => ({ key: 'mdefFlat', value: +m[1] })],
  [/^Increase SPELL by \+?([\d.]+)%$/, (m) => ({ key: 'spellPct', value: +m[1] })],
  [/^Increase ATTACK by \+?([\d.]+)%$/, (m) => ({ key: 'attackPct', value: +m[1] })],
  [/^Increase Evasion by ([\d.]+)%$/, (m) => ({ key: 'eva', value: +m[1] })],
  [/^Increase Physical Accuracy by \+?([\d.]+)%$/, (m) => ({ key: 'acc', value: +m[1] })],
  [/^Increase Magical Accuracy by \+?([\d.]+)%$/, (m) => ({ key: 'macc', value: +m[1] })],
  [/^Increase Physical Damage by \+?([\d.]+)%$/, (m) => ({ key: 'physPct', value: +m[1] })],
  [/^Increase Magical Damage by \+?([\d.]+)%$/, (m) => ({ key: 'magPct', value: +m[1] })],
];
export function bonusesOf(e) {
  const out = [];
  for (const b of [...(e.bonuses || []), ...(e.enchantments || [])]) {
    if (!b.text || /^Empty Enchantment Slot$/.test(b.text)) continue;
    let mod = null;
    for (const [re, fn] of RULES) { const m = b.text.match(re); if (m) { mod = fn(m); break; } }
    if (mod && mod.status === undefined && 'status' in mod) mod = null;
    out.push(mod ? { ...mod, text: b.text, active: true } : { key: 'none', text: b.text, active: false });
  }
  return out;
}

/* Can this hero carry it? Level requirement only, for now. */
export const canEquip = (hero, e) => (e.equipRequirement || 0) <= hero.level;
