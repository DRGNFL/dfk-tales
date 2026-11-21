/* DFK Tales Arena — the battle: fighters, gear, traits, statuses, damage, healing, skills, channels, turns.
   Pure module (no page): the browser practice arena and the future server referee run the same code.
   Every action returns a list of events; the page animates and logs them.

   Numbers: Hubert's calculator (stats, accuracy), the patch notes up to 2.8.2 and the class pages (skills, traits),
   the status glossary, the gear as it is on the chain. Where the sources leave a gap, the choice is marked ASSUMPTION. */
import { ACT_AT, RETURN, dynamicStats, accuracy, focusOf, hitChance, defenceReduction, CRIT_MULT, BLOCK_BASE, targetable, startInitiative, codexBudget } from './engine.js?v=1';
import { SQUIRE, MEDIUM_ARMOUR, SQUIRE_SHIELD, statsOf } from './rules.js?v=2';
import { SKILLS, CLASS_SKILLS } from './skills.js?v=1';
import { traitsOf } from './traits.js?v=1';
import { weaponFromGear, armourFromGear, extraFromGear, weaponSetOf } from './gear.js?v=1';
import { petInBattle } from './pets.js?v=1';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const NEG = new Set(['stun', 'daze', 'taunt', 'intimidate', 'silence', 'bleed', 'holyLight', 'hunterMark', 'exhaust', 'root', 'blind', 'slow', 'poison', 'confuse', 'fear']);
const isNeg = (e) => NEG.has(e.key) || !!e.neg;

/* ---------- fighters ---------- */
/* loadout: { skills: [ids], weapon, weapon2, armor, offhand, accessory (SDK Equipment or null), pet (SDK Pet or null) } */
export function makeFighter(hero, { team, pos, avgLvl, rng, loadout = {} }) {
  const weaponSet = hero.__weaponSet || (loadout.weapon ? weaponSetOf(loadout.weapon) : '1H Sword');
  const w = loadout.weapon ? weaponFromGear(loadout.weapon) : { ...(SQUIRE[weaponSet] || SQUIRE['1H Sword']), loaned: true };
  const cls = String(hero.class).toLowerCase();
  const armour = loadout.armor ? armourFromGear(loadout.armor) : { ...MEDIUM_ARMOUR, eva: 0, mods: [], loaned: true };
  // ASSUMPTION: a knight who brings no offhand gets the Squire's Shield on loan, as the rig draws knights with one.
  const offhand = loadout.offhand ? extraFromGear(loadout.offhand) : cls === 'knight' ? { ...SQUIRE_SHIELD, loaned: true } : null;
  const accessory = loadout.accessory ? extraFromGear(loadout.accessory) : null;
  const tr = traitsOf(hero);
  const f = {
    id: `${team}${pos}`, hero, team, pos, weaponSet, weapon: w, armour, offhand, accessory, cls,
    name: hero.name, level: hero.level, base: statsOf(hero),
    hpMax: hero.stats.hp, hp: hero.stats.hp, mpMax: hero.stats.mp, mp: hero.stats.mp,
    alive: true, fx: [], cd: {}, channel: null, lastSkill: null, lastTarget: null, history: [], turns: 0,
    skills: [], passives: [], traitActives: tr.actives, traitPassives: tr.passives, used: {},
    pet: loadout.pet ? petInBattle(loadout.pet) : null,
  };
  f.mods = [w, armour, offhand, accessory, f.pet].filter(Boolean).flatMap((g) => (g.mods || []).filter((m) => m.active));
  f.petSkill = f.pet && f.pet.skill ? f.pet.skill : null;
  for (const id of loadout.skills || defaultLoadout(hero)) { const s = SKILLS[id]; if (!s) continue; (s.passive ? f.passives : f.skills).push(s); }
  f.dyn = dynamicStats(effStats(f), avgLvl);
  const init = startInitiative(f.dyn, rng);
  f.initiative = init.value; f.luckyStart = init.lucky;
  return f;
}
export const hasPassive = (f, id) => f.passives.some((p) => p.id === id);
export const hasTrait = (f, id) => f.traitPassives.some((p) => p.id === id);
const modSum = (f, key, status) => f.mods.filter((m) => m.key === key && (status == null || m.status === status)).reduce((t, m) => t + m.value, 0);
export function defaultLoadout(hero) {
  const list = CLASS_SKILLS[String(hero.class).toLowerCase()];
  if (!list) return [];
  const { mainTiers } = codexBudget(hero.level);
  const out = [];
  for (let t = 1; t <= mainTiers; t++) { const first = list.find((s) => s.tier === t); if (first) out.push(first.id); }
  return out;
}

/* Effective stats: base plus flat buffs (Swiftness AGI, For the King STR/END). */
function effStats(f) {
  const s = { ...f.base };
  for (const e of f.fx || []) if (e.stat) s[e.stat] += e.value;
  if (f.passives && hasPassive(f, 'knight.forTheKing')) { s.STR += 3 + 0.15 * f.base.STR; s.END += 3 + 0.15 * f.base.END; }
  return s;
}
const sum = (f, key) => f.fx.filter((e) => e.key === key).reduce((t, e) => t + (e.value || 0) * (e.stacks || 1), 0);
export const has = (f, key) => f.fx.some((e) => e.key === key);
const scaled = (s, [base, scale]) => base + scale.reduce((t, [k, v, max]) => t + Math.min(s[k] * v, max), 0);

/* Derived numbers, always computed from the current effects. */
export function attackOf(f) {
  let pct = sum(f, 'attack') + modSum(f, 'attackPct');
  if (hasPassive(f, 'knight.battleReady')) pct += 15;
  return scaled(effStats(f), [f.weapon.base, f.weapon.scale]) * (1 + pct / 100);
}
export function spellOf(f) {
  const sp = f.weapon.spell || [5, [['INT', 0.1, 10]]];
  let pct = modSum(f, 'spellPct');
  if (hasPassive(f, 'priest.divinePrayer')) pct += 5;
  return scaled(effStats(f), sp) * (1 + pct / 100);
}
const armourDef = (s, [b, k, v, m]) => b + Math.min(s[k] * v, m);
export function pdefOf(f, battle) {
  let def = armourDef(effStats(f), f.armour.pdef) + modSum(f, 'pdefFlat');
  // For Honor: allies behind the knight get part of the knight's P.DEF
  if (battle) for (const k of battle.fighters) {
    if (k.alive && k.team === f.team && k.pos < f.pos && hasPassive(k, 'knight.forHonor')) def += pdefOf(k, null) * (20 + 2 * S(k, 'END')) / 100;
  }
  let pct = sum(f, 'pdef') + modSum(f, 'defPct') + modSum(f, 'pdefPct');
  if (hasPassive(f, 'knight.forValor')) pct += 10 + 3 * S(f, 'END');
  return Math.max(0, def * (1 + pct / 100));
}
export function mdefOf(f) {
  const def = armourDef(effStats(f), f.armour.mdef) + modSum(f, 'mdefFlat');
  return Math.max(0, def * (1 + (sum(f, 'mdef') + modSum(f, 'defPct') + modSum(f, 'mdefPct')) / 100));
}
/* Stat score in percent points, the "STR.S" of the skill formulas (e.g. 9.6 for 9.6%). */
export const S = (f, k) => (f.dyn ? f.dyn.S[k] * 100 : 0);
export function speedOf(f, battle) {
  const d = dynamicStats(effStats(f), battle.avgLvl);
  let pct = sum(f, 'haste') - sum(f, 'slow') + modSum(f, 'speed');
  if (has(f, 'exhaust')) pct -= 50;
  return Math.max(1, d.speed * (1 + f.weapon.speed) * (1 + clamp(pct, -70, 200) / 100));
}
export function evasionOf(f) {
  let e = f.dyn.evasion + (sum(f, 'eva') + modSum(f, 'eva') + (f.armour.eva || 0)) / 100;
  if (has(f, 'root')) e -= 0.10;
  if (f.channel && hasPassive(f, 'archer.shroud')) e += 0.20;
  if (f.channel) e += modSum(f, 'flowState') / 100;
  if (hasTrait(f, 'foresight')) e += 0.03;
  return Math.max(0, e);
}
export function critOf(f) {
  let c = f.dyn.crit + (sum(f, 'crit') + modSum(f, 'crit')) / 100;
  if (hasPassive(f, 'archer.flurry')) c += S(f, 'DEX') / 100;
  return c;
}
const critMultOf = (f) => CRIT_MULT + modSum(f, 'critMult');
export function blockOf(f, magic) {
  if (magic) return f.dyn.spellBlock + modSum(f, 'spellBlock') / 100 + (hasPassive(f, 'knight.battleReady') ? 0.05 : 0);
  return f.dyn.block + (modSum(f, 'block') + sum(f, 'block')) / 100 + (hasPassive(f, 'knight.battleReady') ? 0.05 : 0);
}
const blockCut = (f) => Math.min(0.95, BLOCK_BASE + modSum(f, 'blockCut') / 100);

/* ---------- battle ---------- */
/* heroes: { A: [hero...], B: [hero...] }; loadouts: { [heroId]: loadout } */
export function createBattle({ heroes, rng, loadouts = {} }) {
  const all = [...heroes.A, ...heroes.B];
  const avgLvl = all.reduce((t, h) => t + h.level, 0) / all.length;
  const fighters = [];
  for (const t of ['A', 'B']) heroes[t].forEach((h, i) => fighters.push(makeFighter(h, { team: t, pos: i + 1, avgLvl, rng, loadout: loadouts[String(h.id)] || {} })));
  const b = { fighters, rng, avgLvl, tick: 0, over: false, winner: null, active: null };
  for (const f of fighters) f.speed = speedOf(f, b);
  return b;
}
export const teamOf = (b, t) => b.fighters.filter((f) => f.team === t).sort((x, y) => x.pos - y.pos);
export const enemiesOf = (b, f) => teamOf(b, f.team === 'A' ? 'B' : 'A');
export const alliesOf = (b, f) => teamOf(b, f.team);
const behindOf = (b, f) => alliesOf(b, f).filter((x) => x.pos > f.pos && x.alive);
const nextBehind = (b, f) => teamOf(b, f.team).find((x) => x.pos > f.pos && x.alive) || null;

/* One tick of the timebar: everyone standing gains its Speed; effects measured in ticks run out. */
export function tickOnce(b) {
  b.tick += 1;
  const events = [];
  for (const f of b.fighters) {
    if (!f.alive) continue;
    f.speed = speedOf(f, b);
    f.initiative += f.speed;
    f.fx = f.fx.filter((e) => e.untilTick == null || e.untilTick > b.tick);
    // Poison: 2% of max HP every 10 ticks, +2% for every activation not cured, up to 20%
    for (const e of f.fx.filter((x) => x.key === 'poison')) {
      if ((b.tick - e.since) % 10 === 0) { e.n = (e.n || 0) + 1; events.push(...pureDamage(b, f, f.hpMax * Math.min(0.2, 0.02 * e.n), 'Poison')); }
    }
  }
  return events;
}

/* Whose turn it is, or a channel that completes. */
export function readyFighter(b) {
  const ready = b.fighters.filter((f) => f.alive && f.initiative >= (f.channel ? f.channel.need : ACT_AT))
    .sort((x, y) => y.initiative - x.initiative || y.speed - x.speed || (x.id < y.id ? -1 : 1));
  return ready[0] || null;
}

/* Start of a fighter's turn: damage and healing over time, stun. Returns { events, lost } — lost = the turn is skipped. */
export function startTurn(b, f) {
  b.active = f;
  const events = [];
  for (const e of f.fx.filter((x) => x.key === 'bleed')) events.push(...pureDamage(b, f, f.hpMax * 0.02 * (e.stacks || 1), `Bleed ×${e.stacks || 1}`));
  for (const e of f.fx.filter((x) => x.key === 'holyLight')) if (f.alive) events.push(...hitDamage(b, e.src, f, e.value * (e.stacks || 1), 'magic', 'Holy Light'));
  for (const e of f.fx.filter((x) => x.key === 'hunterMark')) if (f.alive) events.push(...hitDamage(b, e.src, f, e.value * (e.stacks || 1), 'physical', "Hunter's Mark"));
  for (const e of f.fx.filter((x) => x.key === 'beacon')) if (f.alive) events.push(...heal(b, e.src, f, e.value * (e.stacks || 1), 'Holy Beacon', false));
  for (const e of f.fx.filter((x) => x.key === 'bond')) if (f.alive) events.push(...heal(b, null, f, f.hpMax * e.value / 100, 'Healing Bond', false));
  if (!f.alive) return { events, lost: true };
  events.push(...petTurn(b, f));
  const stun = f.fx.find((e) => e.key === 'stun');
  if (stun) {
    f.fx = f.fx.filter((e) => e !== stun);
    events.push({ type: 'status', target: f.id, text: `${f.name} is stunned and loses the turn` });
    return { events, lost: true };
  }
  return { events, lost: false };
}

/* Pet bonuses that act at the start of each of the hero's turns. */
function petTurn(b, f) {
  const ev = [];
  const n = f.turns + 1; // the turn that is starting
  const lw = modSum(f, 'lickWounds');
  if (lw && f.hp < f.hpMax && b.rng.chance(lw / 100)) ev.push(...heal(b, null, f, 0.1 * (f.hpMax - f.hp), 'Lick Wounds', false));
  const rs = modSum(f, 'rescuer');
  if (rs) {
    const hurt = alliesOf(b, f).filter((x) => x.alive && x.hp < x.hpMax).sort((x, y) => x.hp / x.hpMax - y.hp / y.hpMax)[0];
    if (hurt && b.rng.chance(rs / 100)) ev.push(...heal(b, null, hurt, 0.1 * (hurt.hpMax - hurt.hp), 'Rescuer', false));
  }
  for (const m of f.mods.filter((x) => x.key === 'meatShield')) {
    if (n !== 5 && !(n > 5 && (n - 5) % 10 === 0)) continue;
    for (const t of m.party ? alliesOf(b, f).filter((x) => x.alive) : [f]) {
      const cur = (t.fx.find((e) => e.key === 'barrier') || { value: 0 }).value;
      const add = Math.min(f.hp * m.value / 100, Math.max(0, 0.3 * t.hpMax - cur));
      if (add > 0.5) ev.push(...giveBarrier(t, add, m.party ? 'Super Meat Shield' : 'Meat Shield'));
    }
  }
  for (const m of f.mods.filter((x) => x.key === 'aura')) {
    if (!m.value || n % Math.round(m.value) !== 0) continue;
    const bad = alliesOf(b, f).filter((x) => x.alive && x.fx.some((e) => isNeg(e)));
    if (bad.length) { const t = b.rng.pick(bad); ev.push(...(m.purify ? purify(b, t) : cleanse(b, t, 1))); }
  }
  return ev;
}
function giveBarrier(t, amount, label) {
  const cur = t.fx.find((e) => e.key === 'barrier');
  if (cur) cur.value += amount; else t.fx.push({ key: 'barrier', value: amount, label: 'Barrier' });
  return [{ type: 'status', target: t.id, text: `${t.name}: ${label} ${Math.round(amount)}`, tag: 'BARRIER' }];
}

/* End of a turn: durations counted in the bearer's turns go down (not those it gave itself this turn); cooldowns too. */
export function endTurn(b, f, kind = 'action', usedSkill = null) {
  f.turns += 1;
  for (const e of f.fx) { if (e.skipNext) e.skipNext = false; else if (e.turns != null) e.turns -= 1; }
  f.fx = f.fx.filter((e) => e.turns == null || e.turns > 0);
  for (const k of Object.keys(f.cd)) if (k !== (usedSkill && usedSkill.id)) f.cd[k] = Math.max(0, f.cd[k] - 1);
  let bonus = f.pendingInit || 0;
  f.pendingInit = 0;
  const zm = modSum(f, 'zoomy');
  if (zm && b.rng.chance(zm / 100)) bonus += 200;
  f.initiative = (kind === 'reposition' ? RETURN.reposition : kind === 'pass' ? RETURN.pass : 0) + bonus;
  b.active = null;
  checkWinner(b);
}
function checkWinner(b) {
  for (const t of ['A', 'B']) if (teamOf(b, t).every((f) => !f.alive)) { b.over = true; b.winner = t === 'A' ? 'B' : 'A'; }
}

/* ---------- targeting ---------- */
export function tauntedBy(b, f) {
  const t = f.fx.find((e) => e.key === 'taunt');
  if (!t) return null;
  const by = b.fighters.find((x) => x.id === t.by);
  return by && by.alive ? by : null;
}
/* Enemies a single-target attack can reach. Melee reach N: the first N standing; ranged: anyone. A taunt narrows it. */
export function enemyTargets(b, f, { kind, reach }) {
  let list = targetable(enemiesOf(b, f), { kind, reach });
  const t = tauntedBy(b, f);
  if (t) list = list.some((x) => x.id === t.id) ? [t] : list;
  return list;
}

/* ---------- damage, healing, statuses ---------- */
function pureDamage(b, t, amount, label) {
  if (!t.alive) return [];
  const dmg = Math.max(1, Math.round(amount));
  const absorbed = absorb(t, dmg);
  const ev = [{ type: 'damage', target: t.id, amount: dmg - absorbed, absorbed, label, pure: true }];
  ev.push(...loseHp(b, t, dmg - absorbed));
  return ev;
}
function absorb(t, dmg, pierce = 0) {
  const bar = t.fx.find((e) => e.key === 'barrier');
  if (!bar) return 0;
  const eff = dmg * (1 + pierce);
  const take = Math.min(bar.value, eff);
  bar.value -= take;
  if (bar.value <= 0.5) t.fx = t.fx.filter((e) => e !== bar);
  return Math.round(take / (1 + pierce));
}
/* HP actually lost. Last Stand and Second Life live here. */
function loseHp(b, t, n) {
  const ev = [];
  let hp = t.hp - n;
  // ASSUMPTION on Last Stand: it fires the first time a hit takes the hero under 30%, and leaves at least 10% HP.
  if (hasTrait(t, 'lastStand') && !t.used.lastStand && hp < 0.3 * t.hpMax) {
    t.used.lastStand = true;
    hp = Math.max(hp, Math.round(0.1 * t.hpMax));
    ev.push({ type: 'status', target: t.id, text: `${t.name}: Last Stand`, tag: 'LAST STAND' });
    t.fx.push({ key: 'unstoppable', untilTick: b.tick + 15, label: 'Unstoppable', tag: 'UNSTOPPABLE' }, { key: 'lastStand', value: 40, untilTick: b.tick + 15, label: 'Last Stand' });
  }
  if (hp < 1 && modSum(t, 'skinOfTeeth') && !t.used.skinOfTeeth) { t.used.skinOfTeeth = true; hp = 1; ev.push({ type: 'status', target: t.id, text: `${t.name}: Skin of Teeth, 1 HP left`, tag: 'SKIN OF TEETH' }); }
  t.hp = Math.max(0, Math.min(t.hpMax, hp));
  if (t.hp === 0) ev.push(...knockOut(b, t));
  return ev;
}
function knockOut(b, t) {
  if (hasTrait(t, 'secondLife') && !t.used.secondLife) {
    t.used.secondLife = true;
    t.hp = Math.round(0.25 * t.hpMax); t.channel = null;
    t.fx = t.fx.filter((e) => !isNeg(e));
    t.fx.push({ key: 'exhaust', turns: 1, noSkills: true, label: 'Exhausted', tag: 'EXHAUST' });
    t.initiative = Math.max(t.initiative, 0) + 750;
    return [{ type: 'status', target: t.id, text: `${t.name} falls and rises again: Second Life (+750 Initiative)`, tag: 'SECOND LIFE' }];
  }
  t.alive = false; t.hp = 0; t.channel = null; t.fx = [];
  checkWinner(b);
  return [{ type: 'ko', target: t.id }];
}
/* Damage that has already hit: multipliers, defence, shares (Interception), barrier. Used by DoTs and by skills after their rolls. */
function hitDamage(b, src, t, raw, type, label, opts = {}) {
  if (!t.alive) return [];
  let dmg = raw;
  if (src) dmg *= 1 + dmgOutPct(b, src, t, type) / 100;
  dmg *= 1 + dmgInPct(t, type) / 100;
  if (type === 'physical') dmg *= 1 - defenceReduction(pdefOf(t, b), b.avgLvl);
  else if (type === 'magic') dmg *= 1 - defenceReduction(mdefOf(t), b.avgLvl);
  if (opts.blocked) dmg *= 1 - blockCut(t);
  const events = [];
  // Interception: a knight in front takes part of the physical damage meant for the ally behind
  const guard = type === 'physical' && !opts.noGuard && t.fx.find((e) => e.key === 'guarded');
  if (guard) {
    const g = b.fighters.find((x) => x.id === guard.by);
    if (g && g.alive) {
      const part = dmg * guard.value / 100;
      dmg -= part;
      events.push({ type: 'status', target: g.id, text: `${g.name} intercepts ${Math.round(part)}` });
      events.push(...hitDamage(b, null, g, part / Math.max(0.05, 1 - defenceReduction(pdefOf(t, b), b.avgLvl)), 'physical', 'Interception', { noGuard: true }));
    }
  }
  dmg = Math.max(1, Math.round(dmg));
  const absorbed = absorb(t, dmg, opts.pierce || 0);
  events.unshift({ type: 'damage', source: src && src.id, target: t.id, amount: dmg - absorbed, absorbed, crit: !!opts.crit, blocked: !!opts.blocked, label });
  events.push(...loseHp(b, t, dmg - absorbed));
  const rf = modSum(t, 'reflect');
  if (src && src.alive && src !== t && rf && b.rng.chance(rf / 100)) events.push(...pureDamage(b, src, 0.3 * dmg, `Reflected by ${t.name.split(' ')[0]}`));
  return events;
}
function dmgOutPct(b, src, t, type) {
  let p = sum(src, 'dmgOut') - sum(src, 'intimidate');
  if (type === 'physical') p += modSum(src, 'physPct');
  if (type === 'magic') p += modSum(src, 'magPct') + modSum(src, 'magicVsHeal');
  if (hasPassive(t, 'knight.ironclad') && src.pos >= 2) p -= 3 + S(t, 'END');
  // traits
  const allies = alliesOf(b, src).filter((x) => x.alive), foes = enemiesOf(b, src).filter((x) => x.alive);
  if (hasTrait(src, 'duelist') && allies.length === 1 && foes.length === 1) p += 20;
  if (hasTrait(src, 'clutch') && src.hp < 0.25 * src.hpMax) p += 20;
  if (hasTrait(src, 'giantSlayer') && t.hp > src.hp) p += t.hp >= 2 * src.hp ? 20 : t.hp >= 1.5 * src.hp ? 15 : 10;
  p += Math.min(15, 5 * allies.filter((x) => x !== src && hasTrait(x, 'leadership')).length);
  p -= Math.min(15, 5 * foes.filter((x) => hasTrait(x, 'menacing')).length);
  return p;
}
function dmgInPct(t, type) {
  let p = sum(t, 'dmgIn');
  if (type !== 'pure' && has(t, 'holyLight')) p += 5;
  if (type === 'physical') p += sum(t, 'physIn') - modSum(t, 'pred');
  if (type === 'magic') p -= modSum(t, 'mred');
  if (type !== 'pure') p -= sum(t, 'lastStand');
  if (hasPassive(t, 'archer.flurry')) p += 10;
  return Math.max(-95, p);
}
function heal(b, src, t, amount, label, canCrit = true) {
  if (!t.alive) return [];
  let v = amount;
  if (src && hasPassive(src, 'priest.holyGuardian')) v *= 1.10;
  if (src) v *= 1 - modSum(src, 'magicVsHeal') / 100;
  let crit = false;
  if (canCrit && src && b.rng.chance(critOf(src) + modSum(src, 'healCrit') / 100)) { v *= CRIT_MULT; crit = true; }
  const before = t.hp;
  t.hp = Math.min(t.hpMax, t.hp + Math.round(v));
  if (!canCrit && t.hp === before) return []; // passive heals on a full bar say nothing
  const ev = [{ type: 'heal', source: src && src.id, target: t.id, amount: t.hp - before, crit, label }];
  // Blessings of Light: a chance to Cleanse with every heal; critical heals may grant Unstoppable
  if (src && hasPassive(src, 'priest.blessingsOfLight')) {
    if (b.rng.chance(S(src, 'WIS') / 100)) ev.push(...cleanse(b, t, 1));
    if (crit && b.rng.chance(3 * S(src, 'WIS') / 100)) ev.push(...addFx(b, src, t, { key: 'unstoppable', turns: 2, label: 'Unstoppable' }));
  }
  return ev;
}
function cleanse(b, t, n) {
  const ev = [];
  for (let i = 0; i < n; i++) {
    const bad = t.fx.filter((e) => isNeg(e) && e.key !== 'daze' && e.key !== 'exhaust' && e.key !== 'taunt');
    if (!bad.length) break;
    const e = b.rng.pick(bad);
    t.fx = t.fx.filter((x) => x !== e);
    ev.push({ type: 'status', target: t.id, text: `${t.name}: ${e.label || e.key} cleansed` });
  }
  return ev;
}
const purify = (b, t) => cleanse(b, t, 99);

const RESIST = { daze: ['resDaze', 50, 3], stun: ['resStun', 50, 4], taunt: ['resTaunt', 60, 6], silence: ['resSilence', 60, 5], intimidate: ['resIntimidate', 50, 2], fear: ['resFear', 60, 5] };
/* Resistance a fighter has against a status, in percent: after-status resistance, allies' buffs, traits, gear. */
function resistOf(t, key) {
  let r = RESIST[key] ? sum(t, RESIST[key][0]) : 0;
  if (key === 'daze') r += sum(t, 'resDazeAlly');
  if (key === 'silence') r += sum(t, 'resSilenceAlly');
  for (const p of t.traitPassives) { if (p.res === key) r += 32.5; if (p.res) r += 2.5; }
  r += modSum(t, 'res', key) + modSum(t, 'ser') + (t.dyn.ser || 0) * 100;
  return r;
}
/* Apply an effect. Negative effects respect Unstoppable, resistances, and Royal Guard (a knight takes them instead). */
function addFx(b, src, t, e) {
  if (!t.alive) return [];
  if (isNeg(e)) {
    const rg = t.fx.find((x) => x.key === 'royalGuarded');
    if (rg) { const k = b.fighters.find((x) => x.id === rg.by); if (k && k.alive && k !== t) t = k; }
    if (has(t, 'unstoppable')) return [{ type: 'status', target: t.id, text: `${t.name} is Unstoppable: ${e.label} resisted` }];
    const res = resistOf(t, e.key);
    if (res > 0 && b.rng.chance(Math.min(100, res) / 100)) return [{ type: 'status', target: t.id, text: `${t.name} resists ${e.label}` }];
    if (e.key === 'poison' && has(t, 'poison')) return [];
  }
  const ev = [];
  if (e.key === 'daze') {
    t.initiative -= 500;
    if (t.channel) { ev.push({ type: 'status', target: t.id, text: `${t.name}'s ${t.channel.skill.name} is interrupted` }); t.channel = null; }
    ev.push({ type: 'status', target: t.id, text: `${t.name} is Dazed (−500 Initiative)`, tag: 'DAZE' });
    addResist(t, 'daze');
    return ev;
  }
  if (e.key === 'fear') ev.push(...push(b, src, t, 1, true));
  if (['stun', 'silence', 'exhaust', 'fear'].includes(e.key) && t.channel && (e.key !== 'silence' || t.channel.skill.magic)) {
    ev.push({ type: 'status', target: t.id, text: `${t.name}'s ${t.channel.skill.name} is interrupted` }); t.channel = null;
  }
  const same = t.fx.find((x) => x.key === e.key && x.label === e.label);
  if (e.stackMax && same) {
    same.stacks = Math.min(e.stackMax, (same.stacks || 1) + 1);
    if (e.turns != null) same.turns = e.turns;
    if (e.ticks != null) same.untilTick = b.tick + e.ticks;
  } else {
    if (same) t.fx = t.fx.filter((x) => x !== same);
    t.fx.push({ ...e, src, stacks: 1, since: b.tick, untilTick: e.ticks != null ? b.tick + e.ticks : undefined, skipNext: b.active === t && e.turns != null });
  }
  if (RESIST[e.key]) addResist(t, e.key);
  const now = t.fx.find((x) => x.key === e.key && x.label === e.label);
  ev.push({ type: 'status', target: t.id, text: `${t.name}: ${e.label}${e.stackMax && now ? ` ×${now.stacks}` : ''}`, tag: e.tag });
  return ev;
}
function addResist(t, key) {
  const [rk, pct, turns] = RESIST[key];
  const cur = t.fx.find((x) => x.key === rk);
  if (cur) { cur.value = 100; cur.turns = turns + 1; } else t.fx.push({ key: rk, value: pct, turns, label: `${key} resistance` });
}
function push(b, src, t, n, quiet = false) {
  if (!t.alive || has(t, 'unstoppable') || has(t, 'root')) return quiet ? [] : [{ type: 'status', target: t.id, text: `${t.name} holds the ground` }];
  if (b.rng.chance((sum(t, 'resPush') + modSum(t, 'res', 'push')) / 100)) return [{ type: 'status', target: t.id, text: `${t.name} resists the push` }];
  const team = teamOf(b, t.team);
  const from = t.pos;
  const to = Math.min(team.length, from + n);
  if (to === from) return [];
  for (const x of team) if (x !== t && x.pos > from && x.pos <= to) x.pos -= 1;
  t.pos = to;
  const ev = [{ type: 'move', target: t.id, text: `${t.name} is pushed to P${to}` }];
  if (t.channel) { ev.push({ type: 'status', target: t.id, text: `${t.name}'s ${t.channel.skill.name} is interrupted` }); t.channel = null; }
  return ev;
}
/* Pull: towards the front. */
function pull(b, t, n) {
  if (!t.alive || has(t, 'unstoppable') || has(t, 'root')) return [];
  if (b.rng.chance((sum(t, 'resPush') + modSum(t, 'res', 'pull')) / 100)) return [{ type: 'status', target: t.id, text: `${t.name} resists the pull` }];
  const team = teamOf(b, t.team);
  const from = t.pos, to = Math.max(1, from - n);
  if (to === from) return [];
  for (const x of team) if (x !== t && x.pos >= to && x.pos < from) x.pos += 1;
  t.pos = to;
  const ev = [{ type: 'move', target: t.id, text: `${t.name} is pulled to P${to}` }];
  if (t.channel) { ev.push({ type: 'status', target: t.id, text: `${t.name}'s ${t.channel.skill.name} is interrupted` }); t.channel = null; }
  return ev;
}
/* Dispel: one random beneficial effect goes. */
function dispel(b, t) {
  const good = t.fx.filter((e) => !isNeg(e) && !e.key.startsWith('res') && e.key !== 'lastStand');
  if (!good.length) return [];
  const e = b.rng.pick(good);
  t.fx = t.fx.filter((x) => x !== e);
  return [{ type: 'status', target: t.id, text: `${t.name}: ${e.label || e.key} dispelled` }];
}
function revive(b, t, pct) {
  if (t.alive) return [];
  t.alive = true; t.hp = Math.round(pct * t.hpMax); t.initiative = 0; t.fx = [];
  b.over = false; b.winner = null;
  return [{ type: 'revive', target: t.id, text: `${t.name} is back with ${t.hp} HP` }];
}

/* Statuses a weapon bonus or a trait can put on with a hit. Others are listed on the gear but not simulated yet. */
const ON_HIT = {
  bleed: { key: 'bleed', label: 'Bleed', tag: 'BLEED', turns: 3, stackMax: 5 },
  poison: { key: 'poison', label: 'Poison', tag: 'POISON' },
  daze: { key: 'daze', label: 'Daze' },
  blind: { key: 'blind', label: 'Blind', tag: 'BLIND' },
  stun: { key: 'stun', label: 'Stun', tag: 'STUN' },
  silence: { key: 'silence', label: 'Silence', tag: 'SILENCE', turns: 2 },
  exhaust: { key: 'exhaust', label: 'Exhausted', tag: 'EXHAUST', turns: 1, noSkills: true },
};
function afterHit(b, src, t, r, dealt, basic) {
  const ev = [];
  if (!t.alive && !dealt) return ev;
  for (const m of src.mods.filter((x) => x.key === 'onHit')) {
    if (!t.alive || !b.rng.chance(m.value / 100)) continue;
    if (m.fx) ev.push(...addFx(b, src, t, m.fx));
    else if (m.pull) ev.push(...pull(b, t, m.pull));
    else if (ON_HIT[m.status]) ev.push(...addFx(b, src, t, ON_HIT[m.status]));
  }
  const lsAll = modSum(src, 'lifesteal');
  if (lsAll && dealt > 0) ev.push(...heal(b, null, src, dealt * lsAll / 100, 'Lifesteal', false));
  if (hasTrait(src, 'toxic') && b.rng.chance(0.03)) ev.push(...addFx(b, src, t, ON_HIT.poison));
  if (basic && t.channel) { const d = modSum(src, 'dazeChanneler'); if (d && b.rng.chance(d / 100)) ev.push(...addFx(b, src, t, ON_HIT.daze)); }
  if (r.crit) { const ls = modSum(src, 'critLifesteal'); if (ls && dealt > 0) ev.push(...heal(b, null, src, dealt * ls / 100, 'Lifesteal', false)); }
  if (r.blocked) { const bi = modSum(t, 'blockInit'); if (bi) t.initiative += bi; }
  return ev;
}

/* ---------- attacks with rolls ---------- */
function accOf(src, magic, basic) {
  const st = effStats(src);
  const useFocus = magic || src.weapon.magic;
  let acc = accuracy({ stat: useFocus ? focusOf(st) : st.DEX, requirement: src.weapon.req, aar: src.weapon.aar, basic });
  acc += (sum(src, 'acc') + (useFocus ? sum(src, 'maccDown') : 0) + modSum(src, useFocus ? 'macc' : 'acc')) / 100;
  if (has(src, 'blind')) acc -= 0.25;
  return acc;
}
function rollAttack(b, src, t, { magic = false, accBonus = 0, critBonus = 0, basic = false } = {}) {
  const p = hitChance(accOf(src, magic, basic) + accBonus / 100, evasionOf(t));
  const hit = b.rng.chance(p);
  const crit = hit && b.rng.chance(critOf(src) + critBonus / 100);
  const blocked = hit && b.rng.chance(blockOf(t, magic));
  return { p, hit, crit, blocked };
}
/* A strike: roll, then damage. type 'physical' | 'magic' | 'pure'. Returns { hit, crit, blocked, damage, events }. */
function strike(b, src, t, raw, { type = 'physical', label, accBonus = 0, critBonus = 0, critMultBonus = 0, pierce = 0, noMiss = false, basic = false, noDamage = false } = {}) {
  if (!t.alive) return { hit: false, events: [] };
  const r = noMiss ? { p: 1, hit: true, crit: b.rng.chance(critOf(src) + critBonus / 100), blocked: false } : rollAttack(b, src, t, { magic: type === 'magic', accBonus, critBonus, basic });
  if (!r.hit) return { hit: false, events: [{ type: 'miss', source: src.id, target: t.id, chance: r.p, label }] };
  if (noDamage) return { hit: true, crit: false, blocked: false, damage: 0, events: [{ type: 'status', target: t.id, text: `${label} hits ${t.name}` }] };
  let dmg = raw;
  if (r.crit) dmg *= critMultOf(src) + critMultBonus;
  const events = hitDamage(b, src, t, dmg, type, label, { crit: r.crit, blocked: r.blocked, pierce: pierce / 100 });
  events[0].chance = r.p;
  const dealt = events[0].amount;
  events.push(...afterHit(b, src, t, r, dealt, basic));
  src.lastTarget = t.id;
  return { hit: true, crit: r.crit, blocked: r.blocked, damage: dealt, events };
}

/* ---------- the skill context ---------- */
function ctx(b, src, target) {
  const st = (k) => effStats(src)[k];
  const c = {
    b, src, target, events: [],
    S: (k) => S(src, k), stat: st,
    ATK: attackOf(src), SPELL: spellOf(src),
    chance: (pct) => b.rng.chance(clamp(pct, 0, 100) / 100),
    rng: b.rng,
    strike(t, raw, o) { const r = strike(b, src, t, raw, o); c.events.push(...r.events); return r; },
    heal(t, amount, label) { c.events.push(...heal(b, src, t, amount, label)); },
    barrier(t, amount, label = 'Barrier') { c.events.push(...giveBarrier(t, amount, label)); },
    dispel(t) { c.events.push(...dispel(b, t)); },
    fx(t, e) { c.events.push(...addFx(b, src, t, e)); },
    push(t, n) { const before = t.pos; c.events.push(...push(b, src, t, n)); return t.pos !== before; },
    cleanse(t, n = 1) { c.events.push(...cleanse(b, t, n)); },
    purify(t) { c.events.push(...purify(b, t)); },
    revive(t, pct) { c.events.push(...revive(b, t, pct)); },
    initiative(v) { src.pendingInit = (src.pendingInit || 0) + v; },
    enemies: () => enemiesOf(b, src).filter((x) => x.alive),
    allies: () => alliesOf(b, src).filter((x) => x.alive),
    behind: (t) => nextBehind(b, t),
    alliesBehind: () => behindOf(b, src),
    lastWas: (id) => src.lastSkill === id,
    usedRecently: (id, turns) => src.history.slice(-turns).includes(id),
    hasPassive: (id) => hasPassive(src, id),
    log(text) { c.events.push({ type: 'status', target: src.id, text }); },
  };
  return c;
}

/* ---------- skills and active traits ---------- */
export const manaCost = (f, s) => Math.round((s.mana[0] + s.mana[1] * f.level) * (hasTrait(f, 'efficient') ? 0.9 : 1));
/* Why a skill or trait cannot be used now, or null. */
export function skillBlocked(b, f, s) {
  if (s.trait) return f.used[s.id] ? 'used' : null;
  if (f.cd[s.id] > 0) return `Amnesia ${f.cd[s.id]}`;
  if (f.mp < manaCost(f, s)) return 'not enough MP';
  if (s.magic && has(f, 'silence')) return 'Silenced';
  const ex = f.fx.find((e) => e.key === 'exhaust');
  if (ex && ex.noSkills) return 'Exhausted';
  if (!s.magic && has(f, 'fear')) return 'Feared';
  return null;
}
/* How a skill reaches: the skill's own reach, or the hero's weapon for traits. */
export function reachOf(f, s) {
  if (s.reach === 'weapon') return { kind: f.weapon.kind, reach: f.weapon.reach };
  return { kind: s.reach >= 3 ? 'ranged' : 'melee', reach: s.reach };
}
/* Who a skill can target. 'enemy' follows reach and taunt; 'ally' any standing ally (self included);
   'fallen' an ally who is down; 'self', 'none', 'allies' need no choice. */
export function skillTargets(b, f, s) {
  if (s.target === 'enemy') return enemyTargets(b, f, reachOf(f, s));
  if (s.target === 'ally') return alliesOf(b, f).filter((x) => x.alive);
  if (s.target === 'fallen') return alliesOf(b, f).filter((x) => !x.alive);
  return [];
}
export function useSkill(b, f, s, target) {
  const pre = [];
  let cost = manaCost(f, s);
  for (const m of f.mods.filter((x) => x.key === 'conserve')) if (cost && b.rng.chance(m.value / 100)) { cost = Math.floor(cost * (1 - m.cut)); pre.push({ type: 'status', target: f.id, text: `${f.name}: the pet saves mana (${s.name} costs ${cost})` }); break; }
  f.mp -= cost;
  if (s.trait) f.used[s.id] = true;
  else {
    let am = s.amnesia || 0;
    const tr = modSum(f, 'totalRecall');
    if (am && tr && b.rng.chance(tr / 100)) am -= 1;
    f.cd[s.id] = am;
  }
  if (s.channel) {
    let need = s.channel;
    const sc = modSum(f, 'swiftCast');
    if (sc && b.rng.chance(sc / 100)) need = Math.round(need * 0.7);
    f.channel = { skill: s, target: target && target.id, need };
    return [...pre, { type: 'channel', source: f.id, skill: s.name, text: `${f.name} channels ${s.name} (${need} Initiative)` }];
  }
  return [...pre, ...resolveSkill(b, f, s, target)];
}
export function resolveSkill(b, f, s, target) {
  const c = ctx(b, f, target);
  c.events.push({ type: 'skill', source: f.id, target: target && target.id, skill: s.name, anim: s.anim });
  s.run(c, target);
  f.lastSkill = s.id;
  f.history.push(s.id);
  return c.events;
}
/* A channel completes when the hero's Initiative reaches it: the skill resolves and the turn is spent. */
export function completeChannel(b, f) {
  const ch = f.channel;
  f.channel = null;
  b.active = f;
  let target = ch.target ? b.fighters.find((x) => x.id === ch.target) : null;
  if (target && !target.alive && ch.skill.target === 'enemy') target = enemyTargets(b, f, reachOf(f, ch.skill))[0] || null;
  const events = resolveSkill(b, f, ch.skill, target);
  endTurn(b, f, 'action', ch.skill);
  return events;
}

/* ---------- the basic attack ---------- */
export function basicAttack(b, f, t) {
  const r = strike(b, f, t, attackOf(f), { type: f.weapon.magic ? 'magic' : 'physical', label: 'Attack', basic: true });
  f.lastSkill = 'basic'; f.history.push('basic');
  return [{ type: 'skill', source: f.id, target: t.id, skill: 'Attack' }, ...r.events];
}
export const basicHitChance = (b, f, t) => hitChance(accOf(f, false, true), evasionOf(t));
export function skillHitChance(b, f, s, t) {
  if (s.target !== 'enemy') return null;
  return hitChance(accOf(f, s.magic, false) + (s.acc || 0) / 100, evasionOf(t));
}
export function reposition(b, f, other) {
  const p = f.pos; f.pos = other.pos; other.pos = p;
  f.history.push('move');
  return [{ type: 'move', target: f.id, text: `${f.name} moves to P${f.pos}` }];
}

/* Short labels of what a fighter is under, for the page. */
export function tags(f) {
  const out = [];
  for (const e of f.fx) {
    if (e.key.startsWith('res') || e.key === 'lastStand') continue;
    const name = e.tag || e.label || e.key;
    out.push({ text: `${name}${e.stacks > 1 ? `×${e.stacks}` : ''}${e.key === 'barrier' ? ` ${Math.round(e.value)}` : ''}${e.turns != null ? ` ${e.turns}t` : ''}`, bad: isNeg(e) });
  }
  if (f.channel) out.unshift({ text: `CHANNEL ${f.channel.skill.name}`, bad: false });
  return out;
}

/* Numbers for the page's hero sheet. */
export const sheet = (b, f) => ({ attack: attackOf(f), spell: spellOf(f), pdef: pdefOf(f, b), mdef: mdefOf(f), evasion: evasionOf(f), crit: critOf(f), block: blockOf(f, false), speed: f.speed });
