/* DFK Tales Arena — loaned gear for heroes who bring none (Hunter's Guild Squire set, from Hubert's calculator).
   Kept apart from engine.js because these tables are provisional. Real gear comes from gear.js. */

/* Loaned gear: the Hunter's Guild Squire weapons (level 10, Base) from Hubert's calculator, one per weapon type.
   Melee or ranged belongs to the weapon, not to the class (Ge). reach: melee positions reached from the enemy front. */
export const SQUIRE = {
  '1H Sword': { name: "Squire's Sword", kind: 'melee', reach: 1, base: 43, scale: [['STR', 0.9, 50]], req: 15, aar: 0.9, speed: 0 },
  '1H Shortsword': { name: "Squire's Sword", kind: 'melee', reach: 1, base: 43, scale: [['STR', 0.9, 50]], req: 15, aar: 0.9, speed: 0 },
  '2H Sword': { name: "Squire's Greatsword", kind: 'melee', reach: 1, base: 50, scale: [['STR', 1.2, 65]], req: 15, aar: 0.9, speed: -0.10 },
  '2H Axe': { name: "Squire's Greataxe", kind: 'melee', reach: 1, base: 55, scale: [['STR', 1.3, 75]], req: 15, aar: 0.8, speed: -0.15 },
  '1H Mace': { name: "Squire's Mace", kind: 'melee', reach: 1, base: 40, scale: [['STR', 0.9, 50]], req: 13, aar: 0.9, speed: 0 },
  '1H Dagger': { name: "Squire's Dagger", kind: 'melee', reach: 1, base: 20, scale: [['DEX', 0.7, 30], ['STR', 0.6, 20]], req: 10, aar: 0.9, speed: 0.15, mods: [{ key: 'crit', value: 5, active: true, text: 'Increase Critical Hit chance by +5%' }, { key: 'critMult', value: 1.0, active: true, text: 'Increase Critical Hit damage multiplier by +1' }] },
  Gloves: { name: "Squire's Gloves", kind: 'melee', reach: 1, base: 25, scale: [['STR', 0.8, 30], ['DEX', 0.8, 30]], req: 13, aar: 0.9, speed: 0.08 },
  '1H Spear': { name: "Squire's Light Spear", kind: 'melee', reach: 2, base: 25, scale: [['STR', 0.7, 35], ['DEX', 0.6, 25]], req: 14, aar: 0.9, speed: 0 },
  '2H Spear': { name: "Squire's Heavy Spear", kind: 'melee', reach: 2, base: 40, scale: [['STR', 0.7, 35], ['DEX', 0.6, 25]], req: 16, aar: 0.9, speed: -0.08 },
  Bow: { name: "Squire's Bow", kind: 'ranged', reach: 3, base: 30, scale: [['DEX', 0.8, 40], ['STR', 0.2, 10]], req: 18, aar: 0.9, speed: -0.10 },
  '2H Staff': { name: "Squire's Staff", kind: 'ranged', reach: 3, magic: true, base: 15, scale: [['INT', 1.0, 50]], spell: [15, [['INT', 1.0, 50]]], req: 16, aar: 0.9, speed: 0, mods: [{ key: 'block', value: 5, active: true, text: 'Increase Block chance by 5%' }, { key: 'spellBlock', value: 10, active: true, text: 'Increase Spell Block chance by 10%' }] },
  '1H Wand': { name: "Squire's Wand", kind: 'ranged', reach: 3, magic: true, base: 15, scale: [['INT', 0.8, 40]], spell: [15, [['INT', 0.8, 40]]], req: 16, aar: 0.9, speed: 0 },
};
/* Loaned armour: the Medium set. P.DEF = 40 + END x 1.2 (max 75); M.DEF = 40 + WIS x 1.2 (max 75). */
export const MEDIUM_ARMOUR = { name: 'Medium armour', pdef: [40, 'END', 1.2, 75], mdef: [40, 'WIS', 1.2, 75] };

const STAT = { STR: 'strength', DEX: 'dexterity', AGI: 'agility', VIT: 'vitality', END: 'endurance', INT: 'intelligence', WIS: 'wisdom', LCK: 'luck' };
export const statsOf = (hero) => Object.fromEntries(Object.entries(STAT).map(([k, f]) => [k, hero.stats[f]]));

/* Loaned offhand for knights who bring none: the Squire's Shield, with the bonuses it has on the chain. */
export const SQUIRE_SHIELD = { name: "Squire's Shield", typeName: 'Shield', kind: 'offhand', mods: [
  { key: 'pdefFlat', value: 25, text: 'Increase P.DEF by 25', active: true },
  { key: 'block', value: 10, text: 'Increase Block chance by +10%', active: true },
  { key: 'blockCut', value: 15, text: 'Increase Block damage reduction by 15%', active: true },
] };
