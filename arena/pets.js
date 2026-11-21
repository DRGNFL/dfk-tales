/* DFK Tales Arena — pet combat bonuses, from the list Ge sent (Pet_Combat_Bonuses, 21/11/2026).
   [] in the game text is the pet's own value from the chain (pet.combat.value, already divided: Maul 1.5 = 1.5·POWER).
   Kinds: passive and onHit become gear-like mods; conditional ones are read by combat.js; activatable ones are a skill in the hand.
   ASSUMPTION: an activatable pet skill works like an active trait: once per battle, it costs the action, no mana. */

const on = (fx) => ({ key: 'onHit', fx });
/* name -> (v) => mod, or null when nothing in the battle uses it yet (loot, XP, durability, Delay, statuses of classes not in play). */
const PASSIVE = {
  'Stone Hide': (v) => ({ key: 'block', value: v }),
  'Arcane Shell': (v) => ({ key: 'spellBlock', value: v }),
  'Recuperate': null, // Recovery: not simulated yet
  'Magical Shell': (v) => ({ key: 'mdefPct', value: v }),
  'Magic Shell': (v) => ({ key: 'mdefPct', value: v }),
  'Heavy Hide': (v) => ({ key: 'pdefPct', value: v }),
  'Vorpal Soul': (v) => ({ key: 'crit', value: v }),
  'Sharpened Claws': (v) => ({ key: 'attackPct', value: v }),
  'Attuned': (v) => ({ key: 'spellPct', value: v }),
  'Hard Head': (v) => ({ key: 'res', status: 'daze', value: v }),
  'Harder Head': (v) => ({ key: 'res', status: 'stun', value: v }),
  'Graceful': (v) => ({ key: 'res', status: 'push', value: v, alsoPull: true }),
  'Diamond Hands': null, // Disarm: no skill in play disarms yet
  'Impenetrable': (v) => ({ key: 'res', status: 'bleed', value: v }),
  'Resilient': (v) => ({ key: 'res', status: 'poison', value: v }),
  'Relentless': (v) => ({ key: 'res', status: 'slow', value: v }),
  'Outspoken': (v) => ({ key: 'res', status: 'silence', value: v }),
  'Lucid': (v) => ({ key: 'res', status: 'confuse', value: v }),
  'Brave': (v) => ({ key: 'res', status: 'fear', value: v }),
  'Confident': (v) => ({ key: 'res', status: 'intimidate', value: v }),
  'Inner Lids': (v) => ({ key: 'res', status: 'blind', value: v }),
  'Insulated': (v) => ({ key: 'res', status: 'chill', value: v }),
  'Moist': (v) => ({ key: 'res', status: 'burn', value: v }),
  'Studious': null, 'Rune Sniffer': null, 'Scavenger': null, 'Protective Coat': null,
  'Slippery': (v) => ({ key: 'eva', value: v }),
  'Blur': (v) => ({ key: 'speed', value: v }),
  'Divine Intervention': (v) => ({ key: 'healCrit', value: v }),
  'Good Eye': (v) => ({ key: 'acc', value: v }),
  'Third Eye': (v) => ({ key: 'macc', value: v }),
  'Omni Shell': (v) => ({ key: 'pdefPct', value: v, alsoM: true }),
  'Hardy Constitution': (v) => ({ key: 'ser', value: v }),
  'Vampiric': (v) => ({ key: 'lifesteal', value: v }),
  'Lick Wounds': (v) => ({ key: 'lickWounds', value: v }),
  'Rescuer': (v) => ({ key: 'rescuer', value: v }),
  'Amplify': null, 'Intercept': null, // Delay and Negate: no Delay skill in play yet (Seer)
  'Conservative': (v) => ({ key: 'conserve', value: v, cut: 0.4 }),
  'Ultra Conservative': (v) => ({ key: 'conserve', value: v, cut: 0.8 }),
  'Reflector': (v) => ({ key: 'reflect', value: v }),
  'Null Field': (v) => ({ key: 'mred', value: v }),
  'Brick Wall': (v) => ({ key: 'pred', value: v }),
  'Swift Cast': (v) => ({ key: 'swiftCast', value: v }),
  'Total Recall': (v) => ({ key: 'totalRecall', value: v }),
  'Zoomy': (v) => ({ key: 'zoomy', value: v }),
  // conditional
  'Meat Shield': (v) => ({ key: 'meatShield', value: v }),
  'Super Meat Shield': (v) => ({ key: 'meatShield', value: v, party: true }),
  'Flow State': (v) => ({ key: 'flowState', value: v }),
  'Cleansing Aura': (v) => ({ key: 'aura', value: v }),
  'Purifying Aura': (v) => ({ key: 'aura', value: v, purify: true }),
  'Skin of Teeth': () => ({ key: 'skinOfTeeth', value: 1 }),
  // on hit: value = chance in percent
  'Threaten': (v) => ({ ...on({ key: 'intimidate', value: 10, turns: 2, label: 'Intimidate 10%', tag: 'INTIMIDATE' }), value: v }),
  'Hobble': (v) => ({ ...on({ key: 'slow', value: 25, ticks: 30, label: 'Slow 25%', tag: 'SLOW' }), value: v }),
  'Shock': (v) => ({ ...on({ key: 'stun', label: 'Stun', tag: 'STUN' }), value: v }),
  'Bop': (v) => ({ ...on({ key: 'daze', label: 'Daze' }), value: v }),
  'Hush': (v) => ({ ...on({ key: 'silence', turns: 1, label: 'Silence', tag: 'SILENCE' }), value: v }),
  'Befuddle': null, // Confuse: not simulated yet
  'Petrify': (v) => ({ ...on({ key: 'fear', turns: 1, label: 'Fear', tag: 'FEAR' }), value: v }),
  'Tug': (v) => ({ key: 'onHit', pull: 1, value: v }),
  'Gash': (v) => ({ ...on({ key: 'bleed', turns: 3, stackMax: 5, label: 'Bleed', tag: 'BLEED' }), value: v }),
  'Infect': (v) => ({ ...on({ key: 'poison', label: 'Poison', tag: 'POISON' }), value: v }),
  'Gouge': (v) => ({ ...on({ key: 'blind', label: 'Blind', tag: 'BLIND' }), value: v }),
  'Bruise': (v) => ({ ...on({ key: 'pdef', value: -20, neg: true, ticks: 15, label: 'Bruise −20% P.DEF', tag: 'BRUISE' }), value: v }),
  'Expose': (v) => ({ ...on({ key: 'mdef', value: -20, neg: true, ticks: 15, label: 'Expose −20% M.DEF', tag: 'EXPOSE' }), value: v }),
  'Flash': (v) => ({ ...on({ key: 'acc', value: -10, neg: true, ticks: 15, label: 'Flash −10% P.ACC', tag: 'FLASH' }), value: v }),
  'Mystify': (v) => ({ ...on({ key: 'maccDown', value: -10, neg: true, ticks: 15, label: 'Mystify −10% M.ACC', tag: 'MYSTIFY' }), value: v }),
  'Freeze': null, 'Char': null, // Chill and Burn are the Wizard's: not in play yet
};

const POWER = (c) => Math.max(c.ATK, c.SPELL);
const ptype = (c) => (c.ATK >= c.SPELL ? 'physical' : 'magic');
const act = (name, o) => ({ id: `pet.${name.replace(/\W/g, '')}`, pet: true, once: true, trait: true, name, target: 'enemy', reach: 3, channel: 0, mana: [0, 0], amnesia: 0, magic: false, ...o });
const ACTIVE = {
  'Rebalance': (v) => act('Rebalance', { target: 'none', channel: 600, text: `Channel 600. ${v}·POWER to every enemy; heals every party member ${v}·POWER; −600 Initiative.`,
    run(c) { for (const t of c.enemies()) c.strike(t, v * POWER(c), { type: ptype(c) }); for (const a of c.allies()) c.heal(a, v * POWER(c), 'Rebalance'); c.initiative(-600); } }),
  'Guardian Shell': (v) => act('Guardian Shell', { target: 'none', text: `Every party member gains a Barrier of ${v}% of its max HP.`,
    run(c) { for (const a of c.allies()) c.barrier(a, a.hpMax * v / 100, 'Guardian Shell'); } }),
  'Healing Bond': (v) => act('Healing Bond', { target: 'ally', text: `Target ally heals ${v}% of max HP at the start of its next 3 turns.`,
    run(c, t) { c.fx(t, { key: 'bond', value: v, turns: 3, label: 'Healing Bond', tag: 'BOND' }); } }),
  'Foil': (v) => act('Foil', { text: `On hit: 90% Dispel, twice (${v}% Negate of a Delay: no Delay in play yet).`,
    run(c, t) { const r = c.strike(t, 0, { type: 'pure', noDamage: true, label: 'Foil' }); if (r.hit) { if (c.chance(90)) c.dispel(t); if (c.chance(90)) c.dispel(t); } } }),
  'Quicksand': (v) => act('Quicksand', { target: 'none', channel: 600, text: `Channel 600. 0.5·POWER to every enemy; ${v}% Slow 20% for 25 ticks on each.`,
    run(c) { for (const t of c.enemies()) { const r = c.strike(t, 0.5 * POWER(c), { type: ptype(c) }); if (r.hit && c.chance(v)) c.fx(t, { key: 'slow', value: 20, ticks: 25, label: 'Slow 20%', tag: 'SLOW' }); } } }),
  'Beastly Roar': (v) => act('Beastly Roar', { target: 'none', channel: 600, text: `Channel 600. Every enemy, on hit: ${v}% Daze; 80% Intimidate 15% for 2 turns.`,
    run(c) { for (const t of c.enemies()) { const r = c.strike(t, 0, { type: 'pure', noDamage: true, label: 'Beastly Roar' }); if (!r.hit) continue; if (c.chance(v)) c.fx(t, { key: 'daze', label: 'Daze' }); if (c.chance(80)) c.fx(t, { key: 'intimidate', value: 15, turns: 2, label: 'Intimidate 15%', tag: 'INTIMIDATE' }); } } }),
  'Maul': (v) => act('Maul', { text: `${v}·POWER to the target; five times 60% Bleed.`,
    run(c, t) { const r = c.strike(t, v * POWER(c), { type: ptype(c) }); if (r.hit) for (let i = 0; i < 5; i++) if (c.chance(60)) c.fx(t, { key: 'bleed', turns: 3, stackMax: 5, label: 'Bleed', tag: 'BLEED' }); } }),
  'Thwack': (v) => act('Thwack', { text: `${v}·POWER to the target; 50% Stun.`,
    run(c, t) { const r = c.strike(t, v * POWER(c), { type: ptype(c) }); if (r.hit && c.chance(50)) c.fx(t, { key: 'stun', label: 'Stun', tag: 'STUN' }); } }),
};

/* The pet in battle: { name, bonus: { name, tier, value, text, kind }, mods: [...], skill: activatable or null }. */
export function petInBattle(p, describe = DESCRIBE) {
  const c = p && p.combat && p.combat.revealed ? p.combat : null;
  const out = { id: p.id, name: p.name, species: p.species && p.species.name, rarity: p.rarity, bonus: null, mods: [], skill: null };
  if (!c) return out;
  const text = (describe[c.name] || '').replace(/\[\]/g, String(c.value));
  const kind = ACTIVE[c.name] ? 'activatable' : PASSIVE[c.name] ? 'passive' : 'inactive';
  out.bonus = { name: c.name, tier: c.tier, value: c.value, text, kind };
  if (ACTIVE[c.name]) out.skill = { ...ACTIVE[c.name](c.value), text: text || ACTIVE[c.name](c.value).text };
  else if (PASSIVE[c.name]) {
    const m = PASSIVE[c.name](c.value);
    out.mods.push({ ...m, active: true, text });
    if (m.alsoM) out.mods.push({ key: 'mdefPct', value: c.value, active: true, text });
    if (m.alsoPull) out.mods.push({ key: 'res', status: 'pull', value: c.value, active: true, text });
  } else out.mods.push({ key: 'none', active: false, text });
  return out;
}

/* The game text of every combat bonus (from Ge's sheet), [] = the pet's value. */
export const DESCRIBE = {
  'Stone Hide': 'Increase Block by +[]%.', 'Arcane Shell': 'Increase Spell Block by +[]%.', 'Recuperate': 'Increase Recovery by +[]%.',
  'Magical Shell': 'Increase M.DEF by []%.', 'Magic Shell': 'Increase M.DEF by []%.', 'Heavy Hide': 'Increase P.DEF by []%.', 'Vorpal Soul': 'Increase CSC by +[]%.',
  'Sharpened Claws': 'Increase ATTACK by []%.', 'Attuned': 'Increase SPELL by []%.', 'Hard Head': 'Increase resistance to Daze by +[]%.',
  'Harder Head': 'Increase resistance to Stun by +[]%.', 'Graceful': 'Increase resistance to Push and Pull by +[]%.', 'Diamond Hands': 'Increase resistance to Disarm by +[]%.',
  'Impenetrable': 'Increase resistance to Bleed by +[]%.', 'Resilient': 'Increase resistance to Poison by +[]%.', 'Relentless': 'Increase resistance to Slow by +[]%.',
  'Outspoken': 'Increase resistance to Silence by +[]%.', 'Lucid': 'Increase resistance to Confuse by +[]%.', 'Brave': 'Increase resistance to Fear by +[]%.',
  'Confident': 'Increase resistance to Intimidate by +[]%.', 'Inner Lids': 'Increase resistance to Blind by +[]%.', 'Insulated': 'Increase resistance to Chill by +[]%.',
  'Moist': 'Increase resistance to Burn by +[]%.', 'Studious': 'Increase XP gained from combat by []%.', 'Slippery': 'Increase EVA by +[]%.', 'Blur': 'Increase Speed by []%.',
  'Divine Intervention': 'Increase Critical Heal chance by +[]%.', 'Rune Sniffer': 'Increase chance of receiving runes from combat by []%.',
  'Threaten': 'On hit, []% chance to Intimidate target by 10% for 2 turns.', 'Hobble': 'On hit, []% chance to Slow target by 25% for 30 ticks.',
  'Shock': 'On hit, []% chance to Stun target 1 turn.', 'Bop': 'On hit, []% chance to Daze target.', 'Hush': 'On hit, []% chance to Silence target for 1 turn.',
  'Befuddle': 'On hit, []% chance to Confuse target.', 'Petrify': 'On hit, []% chance to Fear target for 1 turn.', 'Tug': 'On hit, []% chance to Pull target 1.',
  'Gash': 'On hit, []% chance to inflict target with Bleed.', 'Infect': 'On hit, []% chance to inflict target with Poison.', 'Gouge': 'On hit, []% chance to inflict target with Blind.',
  'Bruise': "On hit, []% chance to reduce target's P.DEF by 20% for 15 ticks.", 'Expose': "On hit, []% chance to reduce target's M.DEF by 20% for 15 ticks.",
  'Flash': "On hit, []% chance to reduce target's P.ACC by 10% for 15 ticks.", 'Mystify': "On hit, []% chance to reduce target's M.ACC by 10% for 15 ticks.",
  'Freeze': 'On hit, []% chance to Chill target.', 'Char': 'On hit, []% chance to Burn target.', 'Good Eye': 'Increase P.ACC by +[]%.', 'Third Eye': 'Increase M.ACC by +[]%.',
  'Omni Shell': 'Increase P.DEF and M.DEF by []%.', 'Hardy Constitution': 'Increase SER by +[]%.', 'Vampiric': 'Gain +[]% Lifesteal.',
  'Meat Shield': "On this Hero's 5th turn and every 10 turns thereafter, gain a Barrier of up to []% of current HP (final Barrier at most 30% of max HP).",
  'Super Meat Shield': "On this Hero's 5th turn and every 10 turns thereafter, party members gain a Barrier of []% of this Hero's current HP (final Barrier at most 30% of the target's max HP).",
  'Flow State': 'While Channeling, this Hero gains []% EVA.', 'Cleansing Aura': 'Every [] turns, Cleanse a random debuffed party member.',
  'Lick Wounds': '[]% chance to Heal for 10% of missing HP each turn.', 'Rescuer': '[]% chance to Heal the ally with the lowest HP ratio for 10% of its missing HP each turn.',
  'Amplify': 'All party Delay effects gain +[]% resistance to Negate.', 'Intercept': '[]% chance to Negate enemy Delay actions at the moment they are cast.',
  'Conservative': '[]% chance to reduce cost of current skill by 40% (rounded down).', 'Scavenger': 'Increase chance of receiving rare loot from combat by []%.',
  'Ultra Conservative': '[]% chance to reduce cost of current skill by 80% (rounded down).', 'Reflector': '[]% chance to Reflect 30% of damage received.',
  'Null Field': 'Increase M.RED by +[]%.', 'Brick Wall': 'Increase P.RED by +[]%.', 'Purifying Aura': 'Every [] turns, Purify a random debuffed party member.',
  'Swift Cast': '[]% chance to reduce Channeling time by 30%.', 'Total Recall': '[]% chance to reduce Amnesia from each skill used by 1.',
  'Zoomy': '[]% chance to gain 200 Initiative after each turn.', 'Skin of Teeth': "The first time this Hero's HP would be reduced below 1, set it to 1 instead.",
  'Rebalance': 'Channel 600. Deal []·POWER to each enemy. Heal each party member for []·POWER. Lose 600 Initiative.',
  'Guardian Shell': "Each party member gains a Barrier equal to []% of its max HP.", 'Healing Bond': 'Target party member heals []% of max HP at the start of its next 3 turns. Stack limit 1.',
  'Foil': 'Target enemy. On hit: 90% Dispel, 90% Dispel; []% chance to Negate a Delayed action of the target.',
  'Quicksand': 'Channel 600. Deal 0.5·POWER to each enemy; []% chance to Slow each by 20% for 25 ticks.',
  'Beastly Roar': 'Channel 600. Each enemy, on hit: []% Daze; 80% Intimidate by 15% for 2 turns.',
  'Maul': 'Deal []·POWER to target enemy; 60% Bleed, five times.', 'Thwack': 'Deal []·POWER to target enemy; 50% Stun.',
  'Protective Coat': 'Decrease durability loss chance by []% on the first roll.',
};
