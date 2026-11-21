/* DFK Tales Arena — the hero's genetic traits in battle (state after patch 2.8.2, project doc "dfk-abilita-classi").
   Keyed by the raw gene value (statGenes.raw.active1.d ...), the same numbers as the SDK's ACTIVE_SKILLS / PASSIVE_SKILLS.
   Active traits: once per battle, they cost the action, no mana. Passive traits: always on, read by combat.js.
   POWER = the higher of ATTACK and SPELL; ASSUMPTION: the damage is physical if ATTACK is the higher, magic otherwise. */

const power = (c) => Math.max(c.ATK, c.SPELL);
const ptype = (c) => (c.ATK >= c.SPELL ? 'physical' : 'magic');
const tr = (id, o) => ({ id: `trait.${id}`, trait: true, once: true, target: 'enemy', reach: 'weapon', channel: 0, mana: [0, 0], amnesia: 0, magic: false, ...o });

export const ACTIVE_TRAITS = {
  0: tr('poisonBlade', { name: 'Poisoned Blade', text: '1.0·POWER; 80% Poison.',
    run(c, t) { const r = c.strike(t, power(c), { type: ptype(c) }); if (r.hit && c.chance(80)) c.fx(t, { key: 'poison', label: 'Poison', tag: 'POISON' }); } }),
  1: tr('blindingWinds', { name: 'Blinding Winds', text: '1.0·POWER; 80% Blind (−25% accuracy until removed).',
    run(c, t) { const r = c.strike(t, power(c), { type: ptype(c) }); if (r.hit && c.chance(80)) c.fx(t, { key: 'blind', label: 'Blind', tag: 'BLIND' }); } }),
  2: tr('heal', { name: 'Heal', target: 'ally', text: 'Heals 0.15·max HP + 10·level + 20.',
    run(c, t) { c.heal(t, 0.15 * t.hpMax + 10 * c.src.level + 20, 'Heal'); } }),
  3: tr('cleanse', { name: 'Cleanse', target: 'ally', text: 'Cleanse, plus 50% of a second Cleanse.',
    run(c, t) { c.cleanse(t, c.chance(50) ? 2 : 1); } }),
  4: tr('ironSkin', { name: 'Iron Skin', target: 'self', text: '−10% physical damage taken for 80 ticks. +500 Initiative.',
    run(c) { c.fx(c.src, { key: 'physIn', value: -10, ticks: 80, label: 'Iron Skin', tag: 'IRON SKIN' }); c.initiative(500); } }),
  5: tr('speed', { name: 'Speed', target: 'self', text: '20% Haste for 30 ticks. +500 Initiative.',
    run(c) { c.fx(c.src, { key: 'haste', value: 20, ticks: 30, label: 'Haste 20%', tag: 'HASTE' }); c.initiative(500); } }),
  6: tr('criticalAim', { name: 'Critical Aim', text: '1.0·POWER with +35% critical chance; then +35% critical chance for 2 turns.',
    run(c, t) { c.strike(t, power(c), { type: ptype(c), critBonus: 35 }); c.fx(c.src, { key: 'crit', value: 35, turns: 2, label: 'Critical Aim', tag: 'CRIT AIM' }); } }),
  7: tr('deathmark', { name: 'Deathmark', text: '1.2·POWER; 85%: +15% damage taken for 40 ticks.',
    run(c, t) { const r = c.strike(t, 1.2 * power(c), { type: ptype(c) }); if (r.hit && c.chance(85)) c.fx(t, { key: 'dmgIn', value: 15, neg: true, ticks: 40, label: 'Deathmark', tag: 'DEATHMARK' }); } }),
  16: tr('exhaust', { name: 'Exhaust', text: '1.2·POWER; 50% Exhaust for 1 turn.',
    run(c, t) { const r = c.strike(t, 1.2 * power(c), { type: ptype(c) }); if (r.hit && c.chance(50)) c.fx(t, { key: 'exhaust', turns: 1, noSkills: true, label: 'Exhausted', tag: 'EXHAUST' }); } }),
  17: tr('daze', { name: 'Daze', text: '1.2·POWER; 80% Daze.',
    run(c, t) { const r = c.strike(t, 1.2 * power(c), { type: ptype(c) }); if (r.hit && c.chance(80)) c.fx(t, { key: 'daze', label: 'Daze' }); } }),
  18: tr('explosion', { name: 'Explosion', reach: 3, channel: 800, text: 'Channel 800. 1.5·POWER to the target, 0.7·POWER to the other enemies; 75% Pierce, +20% critical chance, +0.8x critical damage.',
    run(c, t) {
      const o = { type: ptype(c), pierce: 75, critBonus: 20, critMultBonus: 0.8 };
      if (t && t.alive) c.strike(t, 1.5 * power(c), o);
      for (const x of c.enemies()) if (!t || x.id !== t.id) c.strike(x, 0.7 * power(c), o);
    } }),
  19: tr('hardenedShield', { name: 'Hardened Shield', target: 'self', text: '−30% damage taken for 40 ticks.',
    note: 'Patch 2.8.1 turned it into P.DEF and M.DEF: those numbers are not in the notes, so the 2024 value is used.',
    run(c) { c.fx(c.src, { key: 'dmgIn', value: -30, ticks: 40, label: 'Hardened Shield', tag: 'HARDENED' }); } }),
  24: tr('stun', { name: 'Stun', text: '1.4·POWER; 80% Stun for 1 turn.',
    run(c, t) { const r = c.strike(t, 1.4 * power(c), { type: ptype(c) }); if (r.hit && c.chance(80)) c.fx(t, { key: 'stun', label: 'Stun', tag: 'STUN' }); } }),
  25: tr('secondWind', { name: 'Second Wind', target: 'self', text: 'Heals 50% of the missing HP; allies heal 75% of that amount.',
    run(c) { const v = 0.5 * (c.src.hpMax - c.src.hp); c.heal(c.src, v, 'Second Wind'); for (const a of c.allies()) if (a !== c.src) c.heal(a, 0.75 * v, 'Second Wind'); } }),
  28: tr('resurrection', { name: 'Resurrection', target: 'fallen', text: 'A fallen ally comes back with 25% HP, Exhausted for 1 turn.',
    run(c, t) { c.revive(t, 0.25); c.fx(t, { key: 'exhaust', turns: 1, noSkills: true, label: 'Exhausted', tag: 'EXHAUST' }); } }),
};

/* Passive traits. Effects are read in combat.js through hasTrait(); the text is what the page shows. */
export const PASSIVE_TRAITS = {
  0: { id: 'duelist', name: 'Duelist', text: '+20% damage when it is one against one.' },
  1: { id: 'clutch', name: 'Clutch', text: '+20% damage under 25% HP.' },
  2: { id: 'foresight', name: 'Foresight', text: '+3% Evasion.' },
  3: { id: 'headstrong', name: 'Headstrong', res: 'daze', text: '+32.5% Daze resistance, +2.5% to every status.' },
  4: { id: 'clearVision', name: 'Clear Vision', res: 'blind', text: '+32.5% Blind resistance, +2.5% to every status.' },
  5: { id: 'fearless', name: 'Fearless', res: 'fear', text: '+32.5% Fear resistance, +2.5% to every status.' },
  6: { id: 'chatterbox', name: 'Chatterbox', res: 'silence', text: '+32.5% Silence resistance, +2.5% to every status.' },
  7: { id: 'stalwart', name: 'Stalwart', res: 'poison', text: '+32.5% Poison resistance, +2.5% to every status.' },
  16: { id: 'leadership', name: 'Leadership', text: 'Allies +5% damage (15% at most from all Leaderships).' },
  17: { id: 'efficient', name: 'Efficient', text: 'Skills cost 10% less mana.' },
  18: { id: 'menacing', name: 'Menacing', text: 'Enemies deal 5% less damage (15% at most).' },
  19: { id: 'toxic', name: 'Toxic', text: '+3% chance to Poison with every hit.' },
  24: { id: 'giantSlayer', name: 'Giant Slayer', text: '+10% damage to a target with more HP, +15% from 1.5x, +20% from 2x.' },
  25: { id: 'lastStand', name: 'Last Stand', text: 'Once: under 30% a hit stops at 10% HP; then Unstoppable and +40% physical and magical damage reduction for 15 ticks.' },
  28: { id: 'secondLife', name: 'Second Life', text: 'Once: comes back with 25% HP and +750 Initiative, Exhausted for 1 turn.' },
};

/* The four dominant trait genes of a hero. Returns { actives: [skill...], passives: [{...}] }; unknown genes are skipped. */
export function traitsOf(hero) {
  const raw = (hero.statGenes && hero.statGenes.raw) || {};
  const g = (k) => (raw[k] ? raw[k].d : null);
  const actives = ['active1', 'active2'].map((k, i) => { const t = ACTIVE_TRAITS[g(k)]; return t ? { ...t, id: `${t.id}.${i + 1}`, slot: k } : null; }).filter(Boolean);
  const passives = ['passive1', 'passive2'].map((k) => { const p = PASSIVE_TRAITS[g(k)]; return p ? { ...p, slot: k } : null; }).filter(Boolean);
  return { actives, passives };
}
