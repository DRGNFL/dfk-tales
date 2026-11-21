/* DFK Tales Arena — practice rules for version 0.1: basic attacks only.
   Kept apart from engine.js because these tables are provisional (loaned Squire gear for everyone). */
import { dynamicStats, accuracy, focusOf, hitChance, defenceReduction, CRIT_MULT, BLOCK_BASE, startInitiative } from './engine.js?v=1';

/* Loaned gear: the Hunter's Guild Squire weapons (level 10, Base) from Hubert's calculator, one per weapon type.
   Melee or ranged belongs to the weapon, not to the class (Ge). reach: melee positions reached from the enemy front. */
export const SQUIRE = {
  '1H Sword': { name: "Squire's Sword", kind: 'melee', reach: 1, base: 43, scale: [['STR', 0.9, 50]], req: 15, aar: 0.9, speed: 0 },
  '1H Shortsword': { name: "Squire's Sword", kind: 'melee', reach: 1, base: 43, scale: [['STR', 0.9, 50]], req: 15, aar: 0.9, speed: 0 },
  '2H Sword': { name: "Squire's Greatsword", kind: 'melee', reach: 1, base: 50, scale: [['STR', 1.2, 65]], req: 15, aar: 0.9, speed: -0.10 },
  '2H Axe': { name: "Squire's Greataxe", kind: 'melee', reach: 1, base: 55, scale: [['STR', 1.3, 75]], req: 15, aar: 0.8, speed: -0.15 },
  '1H Mace': { name: "Squire's Mace", kind: 'melee', reach: 1, base: 40, scale: [['STR', 0.9, 50]], req: 13, aar: 0.9, speed: 0 },
  '1H Dagger': { name: "Squire's Dagger", kind: 'melee', reach: 1, base: 20, scale: [['DEX', 0.7, 30], ['STR', 0.6, 20]], req: 10, aar: 0.9, speed: 0.15, crit: 0.05, critMult: 1.0 },
  Gloves: { name: "Squire's Gloves", kind: 'melee', reach: 1, base: 25, scale: [['STR', 0.8, 30], ['DEX', 0.8, 30]], req: 13, aar: 0.9, speed: 0.08 },
  '1H Spear': { name: "Squire's Light Spear", kind: 'melee', reach: 2, base: 25, scale: [['STR', 0.7, 35], ['DEX', 0.6, 25]], req: 14, aar: 0.9, speed: 0 },
  '2H Spear': { name: "Squire's Heavy Spear", kind: 'melee', reach: 2, base: 40, scale: [['STR', 0.7, 35], ['DEX', 0.6, 25]], req: 16, aar: 0.9, speed: -0.08 },
  Bow: { name: "Squire's Bow", kind: 'ranged', reach: 3, base: 30, scale: [['DEX', 0.8, 40], ['STR', 0.2, 10]], req: 18, aar: 0.9, speed: -0.10 },
  '2H Staff': { name: "Squire's Staff", kind: 'ranged', reach: 3, magic: true, base: 15, scale: [['INT', 1.0, 50]], req: 16, aar: 0.9, speed: 0, block: 0.05, spellBlock: 0.10 },
  '1H Wand': { name: "Squire's Wand", kind: 'ranged', reach: 3, magic: true, base: 15, scale: [['INT', 0.8, 40]], req: 16, aar: 0.9, speed: 0 },
};
/* Loaned armour: the Medium set. P.DEF = 40 + END x 1.2 (max 75); M.DEF = 40 + WIS x 1.2 (max 75). */
export const MEDIUM_ARMOUR = { name: 'Medium armour', pdef: [40, 'END', 1.2, 75], mdef: [40, 'WIS', 1.2, 75] };

const STAT = { STR: 'strength', DEX: 'dexterity', AGI: 'agility', VIT: 'vitality', END: 'endurance', INT: 'intelligence', WIS: 'wisdom', LCK: 'luck' };
export const statsOf = (hero) => Object.fromEntries(Object.entries(STAT).map(([k, f]) => [k, hero.stats[f]]));

export function makeFighter(hero, { team, pos, weaponSet, avgLvl, rng }) {
  const stats = statsOf(hero);
  const w = SQUIRE[weaponSet] || SQUIRE['1H Sword'];
  const dyn = dynamicStats(stats, avgLvl);
  const attack = w.base + w.scale.reduce((t, [k, v, max]) => t + Math.min(stats[k] * v, max), 0);
  const [pb, pk, pv, pm] = MEDIUM_ARMOUR.pdef, [mb, mk, mv, mm] = MEDIUM_ARMOUR.mdef;
  const init = startInitiative(dyn, rng);
  return {
    id: `${team}${pos}`, hero, team, pos, weaponSet, weapon: w,
    name: hero.name, level: hero.level, stats, dyn,
    speed: dyn.speed * (1 + w.speed),
    attack,
    pdef: pb + Math.min(stats[pk] * pv, pm),
    mdef: mb + Math.min(stats[mk] * mv, mm),
    block: dyn.block + (w.block || 0),
    spellBlock: dyn.spellBlock + (w.spellBlock || 0),
    crit: dyn.crit + (w.crit || 0),
    critMult: CRIT_MULT + (w.critMult || 0),
    hpMax: hero.stats.hp, hp: hero.stats.hp, mpMax: hero.stats.mp, mp: hero.stats.mp,
    initiative: init.value, luckyStart: init.lucky, alive: true,
  };
}

/* Hit chance of a basic attack, shown before you choose the target. */
export function basicHitChance(a, t) {
  const acc = accuracy({ stat: a.weapon.magic ? focusOf(a.stats) : a.stats.DEX, requirement: a.weapon.req, aar: a.weapon.aar, basic: true });
  return hitChance(acc, t.dyn.evasion);
}

/* A basic attack: one roll to hit, then critical and block; damage = ATTACK x (1 - defence %). */
export function basicAttack(a, t, rng, avgLvl) {
  const p = basicHitChance(a, t);
  const out = { attacker: a.id, target: t.id, chance: p, hit: false, crit: false, blocked: false, damage: 0, ko: false };
  if (!rng.chance(p)) return out;
  out.hit = true;
  const magic = !!a.weapon.magic;
  let dmg = a.attack * (1 - defenceReduction(magic ? t.mdef : t.pdef, avgLvl));
  if (rng.chance(a.crit)) { out.crit = true; dmg *= a.critMult; }
  if (rng.chance(magic ? t.spellBlock : t.block)) { out.blocked = true; dmg *= 1 - BLOCK_BASE; }
  out.damage = Math.max(1, Math.round(dmg));
  t.hp = Math.max(0, t.hp - out.damage);
  if (t.hp === 0) { t.alive = false; out.ko = true; }
  return out;
}
