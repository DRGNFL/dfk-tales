/* DFK Tales Arena — the battle: fighters, gear, traits, statuses, damage, healing, skills, channels, turns.
   Pure module (no page): the browser practice arena and the future server referee run the same code.
   Every action returns a list of events; the page animates and logs them.

   Numbers: Hubert's calculator (stats, accuracy), the patch notes up to 2.8.2 and the class pages (skills, traits),
   the status glossary, the gear as it is on the chain. Where the sources leave a gap, the choice is marked ASSUMPTION. */
import { ACT_AT, RETURN, dynamicStats, accuracy, focusOf, hitChance, defenceReduction, CRIT_MULT, BLOCK_BASE, targetable, startInitiative, codexBudget } from './engine.js?v=1';
import { SQUIRE, MEDIUM_ARMOUR, SQUIRE_SHIELD, statsOf } from './rules.js?v=2';
import { SKILLS, CLASS_SKILLS } from './skills.js?v=3';
import { traitsOf } from './traits.js?v=2';
import { weaponFromGear, armourFromGear, extraFromGear, weaponSetOf } from './gear.js?v=1';
import { petInBattle } from './pets.js?v=1';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const NEG = new Set(['stun', 'daze', 'taunt', 'intimidate', 'silence', 'bleed', 'holyLight', 'hunterMark', 'exhaust', 'root', 'blind', 'slow', 'poison', 'confuse', 'fear', 'burn', 'chill', 'berserk', 'bmark', 'vuln']);
const isNeg = (e) => NEG.has(e.key) || !!e.neg;
/* Arcane Power. ASSUMPTION: the bar holds 50 (the biggest unlock in the Codex is 35). */
export const AP_MAX = 50;

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
    alive: true, fx: [], cd: {}, channel: null, lastSkill: null, lastBranch: null, lastTarget: null, history: [], turns: 0,
    skills: [], passives: [], traitActives: tr.actives, traitPassives: tr.passives, used: {},
    pet: loadout.pet ? petInBattle(loadout.pet) : null,
    ap: 0, dice: {}, ulf: 0, jof: 0,
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

/* Effective stats: base plus flat buffs (Swiftness and Time Swell AGI, For the King STR/END, the Pirate's dice). */
function effStats(f) {
  const s = { ...f.base };
  for (const e of f.fx || []) if (e.stat) s[e.stat] += e.value;
  for (const k of Object.keys(f.dice || {})) s[k] += f.dice[k];
  if (f.passives && hasPassive(f, 'knight.forTheKing')) { s.STR += Math.ceil(3 + 0.15 * f.base.STR); s.END += Math.ceil(3 + 0.15 * f.base.END); }
  return s;
}
const sum = (f, key) => f.fx.filter((e) => e.key === key).reduce((t, e) => t + (e.value || 0) * (e.stacks || 1), 0);
export const has = (f, key) => f.fx.some((e) => e.key === key);
const stacksOf = (f, key) => { const e = f.fx.find((x) => x.key === key); return e ? e.stacks || 1 : 0; };
const scaled = (s, [base, scale]) => base + scale.reduce((t, [k, v, max]) => t + Math.min(s[k] * v, max), 0);

/* Derived numbers, always computed from the current effects. */
export function attackOf(f) {
  let pct = sum(f, 'attack') + modSum(f, 'attackPct');
  if (hasPassive(f, 'knight.battleReady')) pct += 15;
  if (has(f, 'berserk')) pct += 20;
  if (f.cls === 'berserker') {
    pct += f.ulf + f.jof;
    if (hasPassive(f, 'berserker.berserkir')) pct += 50 * (f.hpMax - f.hp) / f.hpMax;
    if (hasPassive(f, 'berserker.boarHide')) pct += 10;
    if (hasPassive(f, 'berserker.primalStrength')) pct += 10 + (has(f, 'berserk') ? 20 : 0);
    if (hasPassive(f, 'berserker.wolfPack') && f.b) pct += 10 * alliesOf(f.b, f).filter((x) => x.alive && x !== f).length;
  }
  return scaled(effStats(f), [f.weapon.base, f.weapon.scale]) * (1 + pct / 100);
}
export function spellOf(f) {
  const sp = f.weapon.spell || [5, [['INT', 0.1, 10]]];
  let pct = modSum(f, 'spellPct') + sum(f, 'spell');
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
  if (hasPassive(f, 'warrior.buff')) pct += 40;
  if (has(f, 'berserk')) pct -= 25;
  return Math.max(0, def * (1 + pct / 100));
}
export function mdefOf(f) {
  const def = armourDef(effStats(f), f.armour.mdef) + modSum(f, 'mdefFlat');
  let pct = sum(f, 'mdef') + modSum(f, 'defPct') + modSum(f, 'mdefPct');
  if (has(f, 'berserk')) pct -= 25;
  return Math.max(0, def * (1 + pct / 100));
}
/* Stat score in percent points, the "STR.S" of the skill formulas (e.g. 9.6 for 9.6%). */
export const S = (f, k) => (f.dyn ? f.dyn.S[k] * 100 : 0);
export function speedOf(f, battle) {
  const d = dynamicStats(effStats(f), battle.avgLvl);
  let pct = sum(f, 'haste') - sum(f, 'slow') + modSum(f, 'speed');
  if (has(f, 'exhaust')) pct -= 50;
  if (has(f, 'berserk')) pct += 20;
  pct -= 5 * stacksOf(f, 'chill');
  if (hasPassive(f, 'seer.theOracle')) pct += 15;
  if (alliesOf(battle, f).some((x) => x.alive && hasPassive(x, 'seer.theAstrologer'))) pct += 5;
  return Math.max(1, d.speed * (1 + f.weapon.speed) * (1 + clamp(pct, -70, 200) / 100));
}
export function evasionOf(f) {
  let e = f.dyn.evasion + (sum(f, 'eva') + modSum(f, 'eva') + (f.armour.eva || 0)) / 100;
  if (has(f, 'root')) e -= 0.10;
  if (f.channel && hasPassive(f, 'archer.shroud')) e += 0.20;
  if (f.channel) e += modSum(f, 'flowState') / 100;
  if (hasTrait(f, 'foresight')) e += 0.03;
  if (hasPassive(f, 'berserker.wolfPelt')) e += 0.05;
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
  return f.dyn.block + (modSum(f, 'block') + sum(f, 'block')) / 100 + (hasPassive(f, 'knight.battleReady') ? 0.05 : 0) + (hasPassive(f, 'warrior.tuff') ? 0.10 : 0);
}
const blockCut = (f) => Math.min(0.95, BLOCK_BASE + modSum(f, 'blockCut') / 100);

/* ---------- battle ---------- */
/* heroes: { A: [hero...], B: [hero...] }; loadouts: { [heroId]: loadout } */
export function createBattle({ heroes, rng, loadouts = {} }) {
  const all = [...heroes.A, ...heroes.B];
  const avgLvl = all.reduce((t, h) => t + h.level, 0) / all.length;
  const fighters = [];
  for (const t of ['A', 'B']) heroes[t].forEach((h, i) => fighters.push(makeFighter(h, { team: t, pos: i + 1, avgLvl, rng, loadout: loadouts[String(h.id)] || {} })));
  const b = { fighters, rng, avgLvl, tick: 0, over: false, winner: null, active: null, seq: 0, delayed: [], walls: { A: null, B: null } };
  for (const f of fighters) { f.b = b; f.speed = speedOf(f, b); }
  return b;
}
export const teamOf = (b, t) => b.fighters.filter((f) => f.team === t).sort((x, y) => x.pos - y.pos);
export const enemiesOf = (b, f) => teamOf(b, f.team === 'A' ? 'B' : 'A');
export const alliesOf = (b, f) => teamOf(b, f.team);
const behindOf = (b, f) => alliesOf(b, f).filter((x) => x.pos > f.pos && x.alive);
const nextBehind = (b, f) => teamOf(b, f.team).find((x) => x.pos > f.pos && x.alive) || null;
const live = (list) => list.filter((x) => x.alive);

/* One tick of the timebar: everyone standing gains its Speed; effects measured in ticks run out; delayed actions land. */
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
      if ((b.tick - e.since) % 10 === 0) { e.n = (e.n || 0) + 1; events.push(...pureDamage(b, f, f.hpMax * Math.min(0.2, 0.02 * e.n), 'Poison', e.src)); }
    }
  }
  const due = b.delayed.filter((d) => d.at <= b.tick);
  if (due.length) { b.delayed = b.delayed.filter((d) => d.at > b.tick); for (const d of due) if (!b.over) events.push(...runDelayed(b, d)); }
  for (const team of ['A', 'B']) {
    const w = b.walls[team];
    if (!w || b.tick < w.until) continue;
    b.walls[team] = null;
    events.push({ type: 'status', target: w.src.id, text: `${w.src.name}'s Wall fades (took ${Math.round(w.taken)} of ${Math.round(w.max)})` });
    if (w.onExpire) { b.seq++; const c = ctx(b, w.src, null); w.onExpire(c, w); events.push(...c.events); }
  }
  events.push(...risePending(b));
  return events;
}
function runDelayed(b, d) {
  if (d.target && !d.target.alive) return [{ type: 'status', target: d.src.id, text: `${d.label}: the target is down, it fizzles` }];
  b.seq++;
  const c = ctx(b, d.src, d.target);
  c.events.push({ type: 'skill', source: d.src.id, target: d.target && d.target.id, skill: `${d.label} (delayed)`, delayed: true });
  d.fn(c, d.target);
  c.events.push(...postAction(b, d.src));
  return c.events;
}

/* Whose turn it is, or a channel that completes. */
export function readyFighter(b) {
  const ready = b.fighters.filter((f) => f.alive && f.initiative >= (f.channel ? f.channel.need : ACT_AT))
    .sort((x, y) => y.initiative - x.initiative || y.speed - x.speed || (x.id < y.id ? -1 : 1));
  return ready[0] || null;
}

/* Start of a fighter's turn: damage and healing over time, turn-count passives, stun. Returns { events, lost }. */
export function startTurn(b, f) {
  b.active = f;
  b.seq++;
  const events = [];
  const n = f.turns + 1; // the turn that is starting
  for (const e of f.fx.filter((x) => x.key === 'bleed')) events.push(...pureDamage(b, f, f.hpMax * 0.02 * (e.stacks || 1), `Bleed ×${e.stacks || 1}`, e.src));
  for (const e of f.fx.filter((x) => x.key === 'holyLight')) if (f.alive) events.push(...hitDamage(b, e.src, f, e.value * (e.stacks || 1), 'magic', 'Holy Light'));
  for (const e of f.fx.filter((x) => x.key === 'hunterMark')) if (f.alive) events.push(...hitDamage(b, e.src, f, e.value * (e.stacks || 1), 'physical', "Hunter's Mark"));
  for (const e of f.fx.filter((x) => x.key === 'burn')) if (f.alive) events.push(...hitDamage(b, e.src, f, e.value * (e.stacks || 1), 'magic', `Burn ×${e.stacks || 1}`));
  for (const e of f.fx.filter((x) => x.key === 'beacon')) if (f.alive) events.push(...heal(b, e.src, f, e.value * (e.stacks || 1), 'Holy Beacon', false));
  for (const e of f.fx.filter((x) => x.key === 'bond')) if (f.alive) events.push(...heal(b, null, f, f.hpMax * e.value / 100, 'Healing Bond', false));
  if (!f.alive) return { events, lost: true };
  events.push(...petTurn(b, f));
  events.push(...classTurn(b, f, n));
  const stun = f.fx.find((e) => e.key === 'stun');
  if (stun) {
    f.fx = f.fx.filter((e) => e !== stun);
    events.push({ type: 'status', target: f.id, text: `${f.name} is stunned and loses the turn` });
    return { events, lost: true };
  }
  return { events, lost: false };
}

/* Class passives that count the hero's turns. */
function classTurn(b, f, n) {
  const ev = [];
  if (f.cls === 'wizard') {
    if (n === 1) {
      const ap = (hasPassive(f, 'wizard.pyroMastery') ? 5 : 0) + (hasPassive(f, 'wizard.cryoMastery') ? 5 : 0) + (hasPassive(f, 'wizard.arcaneMastery') ? 10 : 0);
      if (ap) ev.push(...gainAp(f, ap, 'Mastery'));
    }
    if (hasPassive(f, 'wizard.arcaneMastery') && n > 1 && has(f, 'barrier')) ev.push(...gainAp(f, 2, 'Arcane Mastery'));
  }
  // The Artificer: at the start of the 1st and every 7th turn, a barrier on the whole party
  if (hasPassive(f, 'seer.theArtificer') && (n === 1 || n % 7 === 0)) for (const a of live(alliesOf(b, f))) ev.push(...giveBarrier(a, f.hpMax * 1.5 * S(f, 'WIS') / 100, 'The Artificer'));
  // The Pirate's disciplines: a D20 at the first turn and every 7 turns raises DEX, STR or LCK until the next roll
  if (f.cls === 'pirate' && (n - 1) % 7 === 0) {
    for (const [id, k] of [['pirate.busster', 'DEX'], ['pirate.pirateCode', 'STR'], ['pirate.luckOfTheSea', 'LCK']]) {
      if (!hasPassive(f, id)) continue;
      const roll = b.rng.int(1, 20);
      f.dice[k] = 0;
      f.dice[k] = 2 + Math.ceil(roll * 0.01 * effStats(f)[k]);
      ev.push({ type: 'status', target: f.id, text: `${f.name} rolls a D20: ${roll}. ${k} +${f.dice[k]}`, tag: `D20 ${roll}` });
    }
  }
  // Berserkir Mushroom: the more it bleeds, the likelier the rage
  if (hasPassive(f, 'berserker.berserkir') && !f.channel && b.rng.chance(0.3 * (1 - f.hp / f.hpMax))) ev.push(...giveBerserk(b, f, 30));
  return ev;
}

/* Pet bonuses that act at the start of each of the hero's turns. */
function petTurn(b, f) {
  const ev = [];
  const n = f.turns + 1;
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
  if (!t.alive || amount < 0.5) return [];
  const cur = t.fx.find((e) => e.key === 'barrier');
  if (cur) cur.value += amount; else t.fx.push({ key: 'barrier', value: amount, label: 'Barrier' });
  return [{ type: 'status', target: t.id, text: `${t.name}: ${label} ${Math.round(amount)}`, tag: 'BARRIER' }];
}
function gainAp(f, n, why) {
  if (!f.alive || !n) return [];
  const before = f.ap || 0;
  f.ap = clamp(before + n, 0, AP_MAX);
  return f.ap === before ? [] : [{ type: 'ap', target: f.id, amount: f.ap - before, text: `${f.name}: +${f.ap - before} Arcane Power (${why}), ${f.ap}` }];
}

/* End of a turn: durations counted in the bearer's turns go down (not those it gave itself this turn); cooldowns too.
   kind: 'action' | 'reposition' | 'pass' | 'lost'. */
export function endTurn(b, f, kind = 'action', usedSkill = null) {
  f.turns += 1;
  for (const e of f.fx) { if (e.skipNext) e.skipNext = false; else if (e.turns != null) e.turns -= 1; }
  f.fx = f.fx.filter((e) => e.turns == null || e.turns > 0);
  for (const k of Object.keys(f.cd)) if (k !== (usedSkill && usedSkill.id)) f.cd[k] = Math.max(0, f.cd[k] - 1);
  if (kind !== 'action') { f.lastSkill = kind; f.lastBranch = null; }
  f.repeated = false;
  let bonus = f.pendingInit || 0;
  f.pendingInit = 0;
  const zm = modSum(f, 'zoomy');
  if (zm && b.rng.chance(zm / 100)) bonus += 200;
  f.initiative = (kind === 'reposition' ? RETURN.reposition : kind === 'pass' ? RETURN.pass : 0) + bonus;
  b.active = null;
  checkWinner(b);
  return risePending(b);
}
function checkWinner(b) {
  for (const t of ['A', 'B']) if (teamOf(b, t).every((f) => !f.alive && !f.pendingRevive)) { b.over = true; b.winner = t === 'A' ? 'B' : 'A'; }
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
/* What a Berserk or Confused hero does on its turn, chosen for it; null when the hero is free. */
export function forcedAction(b, f) {
  const berserk = has(f, 'berserk'), confused = has(f, 'confuse');
  if (!berserk && !confused) return null;
  const why = berserk ? 'Berserk' : 'Confused';
  const foes = enemyTargets(b, f, { kind: f.weapon.kind, reach: f.weapon.reach });
  const mates = live(alliesOf(b, f)).filter((x) => x !== f);
  const taunter = tauntedBy(b, f);
  if (taunter && foes.includes(taunter)) return { kind: 'attack', target: taunter, why };
  if (berserk) {
    const marked = foes.find((x) => has(x, 'bmark'));
    if (marked && b.rng.chance(0.6)) return { kind: 'attack', target: marked, why };
    if (mates.length && b.rng.chance(0.1)) return { kind: 'attack', target: b.rng.pick(mates), why };
    if (foes.length) return { kind: 'attack', target: b.rng.pick(foes), why };
    return mates.length ? { kind: 'attack', target: b.rng.pick(mates), why } : null;
  }
  const all = [...foes, ...mates];
  return all.length ? { kind: 'attack', target: b.rng.pick(all), why } : null;
}

/* ---------- damage, healing, statuses ---------- */
function pureDamage(b, t, amount, label, src = null) {
  if (!t.alive) return [];
  const dmg = Math.max(1, Math.round(amount));
  const absorbed = absorb(t, dmg);
  const ev = [{ type: 'damage', target: t.id, amount: dmg - absorbed, absorbed, label, pure: true }];
  ev.push(...loseHp(b, t, dmg - absorbed, src));
  return ev;
}
function absorb(t, dmg, pierce = 0) {
  const bar = t.fx.find((e) => e.key === 'barrier');
  if (!bar || dmg <= 0) return 0;
  const eff = dmg * (1 + pierce);
  const take = Math.min(bar.value, eff);
  bar.value -= take;
  if (bar.value <= 0.5) t.fx = t.fx.filter((e) => e !== bar);
  return Math.round(take / (1 + pierce));
}
/* A Wall stands in front of the whole team: any damage to a member goes to it first. */
function absorbWall(b, t, dmg, pierce, events) {
  const w = b.walls[t.team];
  if (!w || dmg <= 0) return 0;
  const eff = dmg * (1 + pierce);
  const take = Math.min(w.hp, eff);
  w.hp -= take; w.taken += take;
  if (w.hp <= 0.5) { b.walls[t.team] = null; events.push({ type: 'status', target: t.id, text: `${w.src.name}'s Wall breaks`, tag: 'WALL DOWN' }); }
  return Math.round(take / (1 + pierce));
}
/* HP actually lost. Last Stand and Second Life live here. */
function loseHp(b, t, n, src = null) {
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
  if (t.hp === 0) ev.push(...knockOut(b, t, src));
  return ev;
}
/* A fighter falls. With Second Life (once) it stays down until the action that felled it is over, so the rest of a volley
   finds nobody there, then rises (risePending). Wolf Pack berserkers go wild. */
function knockOut(b, t, src) {
  const ev = [];
  const yame = hasPassive(t, 'berserker.wolfPack') && src && src.team !== t.team && src.alive;
  t.alive = false; t.hp = 0; t.channel = null; t.fx = [];
  if (hasTrait(t, 'secondLife') && !t.used.secondLife) { t.used.secondLife = true; t.pendingRevive = true; }
  ev.push({ type: 'ko', target: t.id, rising: !!t.pendingRevive });
  for (const x of live(alliesOf(b, t))) if (hasPassive(x, 'berserker.wolfPack')) ev.push(...giveBerserk(b, x, 40));
  if (yame && b.rng.chance((5 * S(t, 'STR') + 5 * S(t, 'LCK')) / 100)) ev.push(...markTarget(b, t, src, 50, 'You Are My Enemy'));
  checkWinner(b);
  return ev;
}
/* Second Life: back with 1/3 of max HP (the game's text, per Ge) and +750 Initiative, Exhausted for 1 turn. */
export function risePending(b) {
  const ev = [];
  for (const f of b.fighters.filter((x) => x.pendingRevive)) {
    f.pendingRevive = false; f.alive = true;
    f.hp = Math.round(f.hpMax / 3);
    f.initiative = 750;
    f.fx = [{ key: 'exhaust', turns: 1, noSkills: true, label: 'Exhausted', tag: 'EXHAUST' }];
    ev.push({ type: 'revive', target: f.id, text: `${f.name} rises again: Second Life, ${f.hp} HP, +750 Initiative`, tag: 'SECOND LIFE' });
  }
  if (ev.length) { b.over = false; b.winner = null; checkWinner(b); }
  return ev;
}
/* Damage that has already hit: multipliers, defence, shares (Interception, Nuff), Wall, barrier, Ward.
   ASSUMPTION: when a Wall or a barrier takes the whole hit, or a Ward pops, the statuses of that action on that hero
   are blocked (the game: "blocks statuses like a barrier"; Berserker's Mark and a few self-inflicted ones ignore it). */
function hitDamage(b, src, t, raw, type, label, opts = {}) {
  if (!t.alive) return [];
  const oracle = src && hasPassive(src, 'seer.theOracle');
  let dmg = oracle ? 0 : raw;
  if (src) dmg *= 1 + dmgOutPct(b, src, t, type) / 100;
  dmg *= 1 + dmgInPct(b, t, type, src) / 100;
  if (type === 'physical') dmg *= 1 - defenceReduction(pdefOf(t, b), b.avgLvl);
  else if (type === 'magic') dmg *= 1 - defenceReduction(mdefOf(t), b.avgLvl);
  if (opts.blocked) dmg *= 1 - blockCut(t);
  const events = [];
  // Interception and Nuff: a hero in front takes part of the physical damage meant for the ally behind
  const guard = type === 'physical' && !opts.noGuard && dmg > 0 && t.fx.find((e) => e.key === 'guarded');
  if (guard) {
    const g = b.fighters.find((x) => x.id === guard.by);
    if (g && g.alive && g !== t) {
      const part = dmg * guard.value / 100;
      dmg -= part;
      events.push({ type: 'status', target: g.id, text: `${g.name} takes ${Math.round(part)} for ${t.name}` });
      events.push(...hitDamage(b, null, g, part / Math.max(0.05, 1 - defenceReduction(pdefOf(t, b), b.avgLvl)), 'physical', guard.label || 'Interception', { noGuard: true }));
    }
  }
  dmg = Math.max(oracle ? 0 : 1, Math.round(dmg));
  let absorbed = 0;
  if (!opts.ignoreBarrier) {
    absorbed += absorbWall(b, t, dmg, opts.pierce || 0, events);
    absorbed += absorb(t, dmg - absorbed, opts.pierce || 0);
  }
  let left = dmg - absorbed;
  if (left > 0 && !opts.ignoreWard) {
    const w = t.fx.find((e) => e.key === 'ward' && (e.kind === 'pure' || e.kind === type));
    if (w) {
      t.fx = t.fx.filter((x) => x !== w);
      absorbed += left; left = 0;
      events.push({ type: 'status', target: t.id, text: `${t.name}'s Ward pops`, tag: 'WARD' });
      if (w.onBreak && w.src) { const c = ctx(b, w.src, t); w.onBreak(c, t); events.push(...c.events); }
    }
  }
  if (dmg > 0 && left === 0 && absorbed > 0) t.shieldSeq = b.seq;
  events.unshift({ type: 'damage', source: src && src.id, target: t.id, amount: left, absorbed, crit: !!opts.crit, blocked: !!opts.blocked, label });
  if (left > 0) events.push(...loseHp(b, t, left, src));
  const rf = modSum(t, 'reflect');
  if (src && src.alive && src !== t && rf && dmg > 0 && b.rng.chance(rf / 100)) events.push(...pureDamage(b, src, 0.3 * dmg, `Reflected by ${t.name.split(' ')[0]}`));
  if (src && dmg > 0) events.push(...onDealt(b, src, t));
  if (left > 0) events.push(...onTaken(b, t, src));
  return events;
}
/* Berserker passives that count damage dealt and received. */
function onDealt(b, src, t) {
  const ev = [];
  if (src.team === t.team && src !== t) src.allyHit = true;
  if (src.team !== t.team && hasPassive(src, 'berserker.ulfhednar')) {
    src.ulf = Math.min(30, src.ulf + 1.5);
    if (b.rng.chance(0.25)) ev.push(...giveBerserk(b, src, 30));
  }
  return ev;
}
function onTaken(b, t, src) {
  const ev = [];
  if (!t.alive) return ev;
  if (src && hasPassive(t, 'berserker.jofurr')) {
    t.jof = Math.min(30, t.jof + 2.5);
    if (b.rng.chance(0.25)) ev.push(...giveBerserk(b, t, 30));
  }
  for (const x of live(alliesOf(b, t))) if (x !== t && hasPassive(x, 'berserker.wolfPack') && b.rng.chance(0.05)) ev.push(...giveBerserk(b, x, 25));
  return ev;
}
function dmgOutPct(b, src, t, type) {
  let p = sum(src, 'dmgOut') - sum(src, 'intimidate');
  if (type === 'physical') p += modSum(src, 'physPct');
  if (type === 'magic') p += modSum(src, 'magPct') + modSum(src, 'magicVsHeal');
  if (hasPassive(t, 'knight.ironclad') && src.pos >= 2) p -= 3 + S(t, 'END') + (hasPassive(t, 'knight.forTheKing') ? 4 + 0.5 * S(t, 'END') : 0);
  if (hasPassive(src, 'warrior.buff')) p -= 10;
  if (hasPassive(src, 'warrior.tuff')) p -= 5;
  if (has(src, 'taunt')) p += 25;
  if (has(src, 'berserk') && t.team === src.team) p -= 50;
  for (const e of t.fx) if (e.key === 'vuln' && e.by === src.id) p += e.value;
  if (has(t, 'bmark') && has(src, 'berserk')) p += 20;
  // traits
  const allies = alliesOf(b, src).filter((x) => x.alive), foes = enemiesOf(b, src).filter((x) => x.alive);
  if (hasTrait(src, 'duelist') && allies.length === 1 && foes.length === 1) p += 20;
  if (hasTrait(src, 'clutch') && src.hp < 0.25 * src.hpMax) p += 20;
  if (hasTrait(src, 'giantSlayer') && t.hp > src.hp) p += t.hp >= 2 * src.hp ? 20 : t.hp >= 1.5 * src.hp ? 15 : 10;
  p += Math.min(15, 5 * allies.filter((x) => x !== src && hasTrait(x, 'leadership')).length);
  p -= Math.min(15, 5 * foes.filter((x) => hasTrait(x, 'menacing')).length);
  return p;
}
function dmgInPct(b, t, type) {
  let p = sum(t, 'dmgIn');
  if (type !== 'pure' && has(t, 'holyLight')) p += 5;
  if (type === 'physical') p += sum(t, 'physIn') - modSum(t, 'pred');
  if (type === 'magic') p -= modSum(t, 'mred');
  if (type !== 'pure') p -= sum(t, 'lastStand');
  if (type !== 'pure' && hasPassive(t, 'berserker.bearSkin')) p -= 8;
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
const UNCLEANSABLE = new Set(['daze', 'exhaust', 'taunt', 'bmark', 'berserk']);
function cleanse(b, t, n) {
  const ev = [];
  for (let i = 0; i < n; i++) {
    const bad = t.fx.filter((e) => isNeg(e) && !UNCLEANSABLE.has(e.key) && !e.hidden);
    if (!bad.length) break;
    const e = b.rng.pick(bad);
    t.fx = t.fx.filter((x) => x !== e);
    ev.push({ type: 'status', target: t.id, text: `${t.name}: ${e.label || e.key} cleansed` });
  }
  return ev;
}
const purify = (b, t) => cleanse(b, t, 99);

const RESIST = { daze: ['resDaze', 50, 3], stun: ['resStun', 50, 4], taunt: ['resTaunt', 60, 6], silence: ['resSilence', 60, 5], intimidate: ['resIntimidate', 50, 2], fear: ['resFear', 60, 5], confuse: ['resConfuse', 50, 4] };
/* Resistance a fighter has against a status, in percent: after-status resistance, allies' buffs, traits, gear. */
function resistOf(t, key) {
  let r = RESIST[key] ? sum(t, RESIST[key][0]) : 0;
  if (key === 'daze') r += sum(t, 'resDazeAlly');
  if (key === 'silence') r += sum(t, 'resSilenceAlly') + (hasPassive(t, 'wizard.arcaneMastery') ? 3.5 * S(t, 'WIS') : 0);
  if (key === 'slow') r += sum(t, 'resSlow');
  if (key === 'taunt' && t.channel && t.channel.skill.tauntBreak) r += 50;
  if (['silence', 'fear', 'confuse'].includes(key)) r += sum(t, 'resMind');
  r += sum(t, 'resAll');
  for (const p of t.traitPassives) { if (p.res === key) r += 32.5; if (p.res) r += 2.5; }
  r += modSum(t, 'res', key) + modSum(t, 'ser') + (t.dyn.ser || 0) * 100;
  return r;
}
const interrupt = (t) => { const ev = [{ type: 'status', target: t.id, text: `${t.name}'s ${t.channel.skill.name} is interrupted` }]; t.channel = null; return ev; };
/* Apply an effect. Negative effects respect Unstoppable, resistances, barriers and Wards that took the hit, and
   Royal Guard (a knight takes them instead). */
function addFx(b, src, t, e) {
  if (!t.alive) return [];
  if (isNeg(e) && !e.self) {
    const rg = t.fx.find((x) => x.key === 'royalGuarded');
    if (rg) { const k = b.fighters.find((x) => x.id === rg.by); if (k && k.alive && k !== t) t = k; }
    if (!e.ignoreBarrier && t.shieldSeq === b.seq) return [{ type: 'status', target: t.id, text: `${t.name}'s shield stops ${e.label}` }];
    if (has(t, 'unstoppable')) return [{ type: 'status', target: t.id, text: `${t.name} is Unstoppable: ${e.label} resisted` }];
    const res = resistOf(t, e.key);
    if (res > 0 && b.rng.chance(Math.min(100, res) / 100)) return [{ type: 'status', target: t.id, text: `${t.name} resists ${e.label}` }];
    if (e.key === 'poison' && has(t, 'poison')) return [];
  }
  const ev = [];
  if (['daze', 'stun', 'exhaust'].includes(e.key) && has(t, 'berserk')) { t.fx = t.fx.filter((x) => x.key !== 'berserk'); ev.push({ type: 'status', target: t.id, text: `${t.name} comes out of Berserk` }); }
  if (e.key === 'daze') {
    t.initiative -= 500;
    t.noComboTurn = t.turns + (b.active === t ? 2 : 1);
    t.fx = t.fx.filter((x) => x.key !== 'dazedMark');
    t.fx.push({ key: 'dazedMark', turns: 1, hidden: true, skipNext: b.active === t });
    if (t.channel) ev.push(...interrupt(t));
    ev.push({ type: 'status', target: t.id, text: `${t.name} is Dazed (−500 Initiative)`, tag: 'DAZE' });
    addResist(t, 'daze');
    return ev;
  }
  if (e.key === 'fear') ev.push(...push(b, src, t, 1, true));
  if (['stun', 'silence', 'exhaust', 'fear'].includes(e.key) && t.channel && (e.key !== 'silence' || t.channel.skill.magic)) ev.push(...interrupt(t));
  if (e.key === 'taunt' && t.channel) {
    // a taunt turns a channel onto the taunter when it can, otherwise breaks it
    if (t.channel.skill.tauntBreak || t.channel.skill.target !== 'enemy') ev.push(...interrupt(t));
    else { t.channel.target = src.id; ev.push({ type: 'status', target: t.id, text: `${t.name}'s ${t.channel.skill.name} turns onto ${src.name}` }); }
  }
  if (e.key === 'bmark') for (const x of alliesOf(b, t)) if (x !== t) x.fx = x.fx.filter((y) => y.key !== 'bmark');
  const same = t.fx.find((x) => x.key === e.key && x.label === e.label);
  if (e.stackMax && same) {
    same.stacks = Math.min(e.stackMax, (same.stacks || 1) + 1);
    if (e.value != null) same.value = e.value;
    if (e.turns != null) same.turns = e.turns;
    if (e.ticks != null) same.untilTick = b.tick + e.ticks;
    same.src = src;
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
/* Berserk: +20% Haste and ATTACK, −25% P.DEF and M.DEF; the hero attacks on its own. Ends with Daze, Stun or Exhaust. */
function giveBerserk(b, f, ticks) {
  if (!f.alive) return [];
  const cur = f.fx.find((e) => e.key === 'berserk');
  if (cur) { cur.untilTick = Math.max(cur.untilTick, b.tick + ticks); return []; }
  f.fx.push({ key: 'berserk', untilTick: b.tick + ticks, label: 'Berserk', tag: 'BERSERK', since: b.tick, stacks: 1 });
  if (f.channel) f.channel = null;
  return [{ type: 'status', target: f.id, text: `${f.name} goes Berserk for ${ticks} ticks`, tag: 'BERSERK' }];
}
/* Berserker's Mark: one per team, ignores barriers and Wards, cannot be purified. */
function markTarget(b, src, t, ticks, why = "Berserker's Mark") {
  const ev = addFx(b, src, t, { key: 'bmark', ticks, label: "Berserker's Mark", tag: 'MARK', ignoreBarrier: true });
  if (why !== "Berserker's Mark") ev.unshift({ type: 'status', target: src.id, text: `${src.name}: ${why}` });
  return ev;
}
function applyBurn(b, src, t) {
  const ev = addFx(b, src, t, { key: 'burn', value: 0.16 * spellOf(src), turns: 3, stackMax: 6, label: 'Burn', tag: 'BURN' });
  const e = t.fx.find((x) => x.key === 'burn');
  if (e && e.stacks >= 6) {
    t.fx = t.fx.filter((x) => x !== e);
    ev.push(...hitDamage(b, src, t, 1.7 * spellOf(src), 'magic', 'Burn explodes'));
    if (t.alive && b.rng.chance(0.75)) ev.push(...addFx(b, src, t, { key: 'fear', turns: 2, label: 'Fear', tag: 'FEAR' }));
  }
  return ev;
}
function applyChill(b, src, t) {
  const ev = addFx(b, src, t, { key: 'chill', ticks: 35, stackMax: 6, label: 'Chill', tag: 'CHILL' });
  const e = t.fx.find((x) => x.key === 'chill');
  if (e && e.stacks >= 6) {
    t.fx = t.fx.filter((x) => x !== e);
    ev.push(...hitDamage(b, src, t, 1.5 * spellOf(src), 'magic', 'Frozen solid'));
    if (t.alive && b.rng.chance(0.75)) ev.push(...addFx(b, src, t, { key: 'stun', label: 'Stun', tag: 'STUN' }));
  }
  return ev;
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
  if (t.channel) ev.push(...interrupt(t));
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
  if (t.channel) ev.push(...interrupt(t));
  return ev;
}
/* Move a hero to a position of its own line, the others shifting (Blood Rage: to P1). */
function moveTo(b, f, pos) {
  const team = teamOf(b, f.team);
  const from = f.pos, to = clamp(pos, 1, team.length);
  if (from === to) return [];
  for (const x of team) { if (x === f) continue; if (to < from && x.pos >= to && x.pos < from) x.pos += 1; if (to > from && x.pos <= to && x.pos > from) x.pos -= 1; }
  f.pos = to;
  return [{ type: 'move', target: f.id, text: `${f.name} moves to P${to}` }];
}
/* Dispel: one beneficial effect goes, barriers first, then Wards; on a team behind a Wall, the Wall falls. */
function dispel(b, t) {
  if (b.walls[t.team]) { const w = b.walls[t.team]; b.walls[t.team] = null; return [{ type: 'status', target: t.id, text: `${w.src.name}'s Wall is dispelled`, tag: 'DISPEL' }]; }
  const good = t.fx.filter((e) => !isNeg(e) && !e.key.startsWith('res') && !['lastStand', 'dazedMark'].includes(e.key) && !e.hidden);
  if (!good.length) return [];
  const e = good.find((x) => x.key === 'barrier') || good.find((x) => x.key === 'ward') || b.rng.pick(good);
  t.fx = t.fx.filter((x) => x !== e);
  return [{ type: 'status', target: t.id, text: `${t.name}: ${e.label || e.key} dispelled`, tag: 'DISPEL' }];
}
/* Negate: one delayed action the target cast goes away. */
function negate(b, t) {
  const mine = b.delayed.filter((d) => d.src === t);
  if (!mine.length) return [];
  const d = b.rng.pick(mine);
  b.delayed = b.delayed.filter((x) => x !== d);
  return [{ type: 'status', target: t.id, text: `${t.name}'s ${d.label} is negated`, tag: 'NEGATE' }];
}
function revive(b, t, pct) {
  if (t.alive || t.pendingRevive) return [];
  t.alive = true; t.hp = Math.round(pct * t.hpMax); t.initiative = 0; t.fx = [];
  b.over = false; b.winner = null;
  return [{ type: 'revive', target: t.id, text: `${t.name} is back with ${t.hp} HP` }];
}
function execute(b, src, t) {
  if (!t.alive) return [];
  return [{ type: 'status', target: t.id, text: `${t.name} is executed`, tag: 'EXECUTE' }, ...loseHp(b, t, t.hp, src)];
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
function afterHit(b, src, t, r, dealt, basic, opts) {
  const ev = [];
  if (!t.alive && !dealt) return ev;
  for (const m of src.mods.filter((x) => x.key === 'onHit')) {
    if (!t.alive || !b.rng.chance(m.value / 100)) continue;
    if (m.fx) ev.push(...addFx(b, src, t, m.fx));
    else if (m.pull) ev.push(...pull(b, t, m.pull));
    else if (ON_HIT[m.status]) ev.push(...addFx(b, src, t, ON_HIT[m.status]));
  }
  let ls = modSum(src, 'lifesteal') + sum(src, 'lifestealFx') + (opts.lifesteal || 0);
  if (hasPassive(src, 'warrior.bloodthirst')) ls += 10 + (has(t, 'bleed') ? 15 : 0);
  if (r.crit) ls += modSum(src, 'critLifesteal');
  if (ls && dealt > 0 && src.team !== t.team) ev.push(...heal(b, null, src, dealt * ls / 100, 'Lifesteal', false));
  if (hasTrait(src, 'toxic') && b.rng.chance(0.03)) ev.push(...addFx(b, src, t, ON_HIT.poison));
  if (basic && t.channel) { const d = modSum(src, 'dazeChanneler'); if (d && b.rng.chance(d / 100)) ev.push(...addFx(b, src, t, ON_HIT.daze)); }
  if (r.blocked) { const bi = modSum(t, 'blockInit'); if (bi) t.initiative += bi; }
  if (r.crit && has(src, 'berserk') && hasPassive(src, 'berserker.primalStrength') && b.rng.chance(0.5)) ev.push(...push(b, src, t, 2));
  if (src.cls === 'berserker' && has(t, 'bmark') && !has(src, 'berserk') && b.rng.chance(0.1)) ev.push(...giveBerserk(b, src, 30));
  if (src.cls === 'wizard') {
    let ap = hasPassive(src, 'wizard.arcaneMastery') ? 1 : 0;
    if (hasPassive(src, 'wizard.pyroMastery')) ap += Math.min(3, stacksOf(t, 'burn'));
    if (hasPassive(src, 'wizard.cryoMastery')) ap += Math.min(3, stacksOf(t, 'chill'));
    ev.push(...gainAp(src, ap, 'hit'));
  }
  return ev;
}

/* ---------- attacks with rolls ---------- */
function accOf(src, magic, basic) {
  const st = effStats(src);
  const useFocus = magic || src.weapon.magic;
  let acc = accuracy({ stat: useFocus ? focusOf(st) : st.DEX, requirement: src.weapon.req, aar: src.weapon.aar, basic });
  acc += (sum(src, 'acc') + (useFocus ? sum(src, 'maccDown') : 0) + modSum(src, useFocus ? 'macc' : 'acc')) / 100;
  if (has(src, 'blind')) acc -= 0.25;
  if (has(src, 'berserk') && hasPassive(src, 'berserker.primalStrength')) acc -= 0.05;
  return acc;
}
function rollAttack(b, src, t, { magic = false, accBonus = 0, critBonus = 0, basic = false } = {}) {
  const p = hitChance(accOf(src, magic, basic) + accBonus / 100, evasionOf(t));
  const hit = b.rng.chance(p);
  let cb = critBonus;
  if (hasPassive(src, 'wizard.pyroMastery') && has(t, 'burn')) cb += S(src, 'LCK');
  if (hasPassive(src, 'wizard.cryoMastery') && has(t, 'chill')) cb += S(src, 'LCK');
  const crit = hit && b.rng.chance(critOf(src) + cb / 100);
  const blocked = hit && b.rng.chance(blockOf(t, magic));
  return { p, hit, crit, blocked };
}
/* A strike: roll, then damage. type 'physical' | 'magic' | 'pure'. Returns { hit, crit, blocked, damage, target, events }.
   Options: label, accBonus, critBonus, critMultBonus, pierce, noMiss, basic, noDamage, lifesteal (%), execute (fraction of
   max HP under which the target dies), ignoreBarrier, ignoreWard, noRedirect, noRiposte. */
function strike(b, src, t, raw, opts = {}) {
  const { type = 'physical', label, accBonus = 0, critBonus = 0, critMultBonus = 0, noMiss = false, basic = false, noDamage = false } = opts;
  const events = [];
  if (!t || !t.alive) return { hit: false, events };
  // First Mate: attacks aimed at the pirate go to the mate
  const fm = !opts.noRedirect && t.team !== src.team && t.fx.find((e) => e.key === 'firstMate' && e.n > 0);
  if (fm) {
    const mate = b.fighters.find((x) => x.id === fm.to);
    if (mate && mate.alive) { fm.n -= 1; if (fm.n <= 0) t.fx = t.fx.filter((x) => x !== fm); events.push({ type: 'status', target: mate.id, text: `${mate.name} takes the blow for ${t.name}` }); t = mate; }
  }
  const r = noMiss ? { p: 1, hit: true, crit: b.rng.chance(critOf(src) + critBonus / 100), blocked: false } : rollAttack(b, src, t, { magic: type === 'magic', accBonus, critBonus, basic });
  if (!r.hit) { events.push({ type: 'miss', source: src.id, target: t.id, chance: r.p, label }); return { hit: false, target: t, events }; }
  if (noDamage) { events.push({ type: 'status', target: t.id, text: `${label} hits ${t.name}` }); return { hit: true, crit: false, blocked: false, damage: 0, target: t, events }; }
  let dmg = raw;
  if (r.crit) dmg *= critMultOf(src) + critMultBonus;
  const pierce = (opts.pierce || 0) + sum(src, 'pierce');
  const ev = hitDamage(b, src, t, dmg, type, label, { crit: r.crit, blocked: r.blocked, pierce: pierce / 100, ignoreBarrier: opts.ignoreBarrier, ignoreWard: opts.ignoreWard });
  ev[0].chance = r.p;
  const dealt = ev[0].amount;
  events.push(...ev, ...afterHit(b, src, t, r, dealt, basic, opts));
  if (opts.execute && t.alive && t.hp < opts.execute * t.hpMax) events.push(...execute(b, src, t));
  src.lastTarget = t.id;
  // Riposte: a hero hit in melee may strike back at once
  if (!opts.noRiposte && t.alive && src.alive && t.team !== src.team && type === 'physical' && src.weapon.kind === 'melee' && !t.channel && !has(t, 'stun')) {
    const rp = sum(t, 'riposte');
    if (rp && b.rng.chance(rp / 100)) {
      events.push({ type: 'status', target: t.id, text: `${t.name} ripostes`, tag: 'RIPOSTE' });
      events.push(...strike(b, t, src, attackOf(t), { type: t.weapon.magic ? 'magic' : 'physical', label: 'Riposte', basic: true, noRiposte: true, noRedirect: true }).events);
    }
  }
  return { hit: true, crit: r.crit, blocked: r.blocked, damage: dealt, target: t, events };
}
/* Basic attack hits: Gladiator, Furious Cleave, Sharpshooter's bonus; Wild Frenzy only on the hero's own Basic Attack. */
function basicStrikes(b, f, t, { mult = 1, label = 'Basic Attack', frenzy = false } = {}) {
  const ev = [];
  let raw = attackOf(f) * mult;
  if (hasPassive(f, 'warrior.gladiator')) raw *= 1.10;
  const ss = f.fx.find((e) => e.key === 'sharpBasic');
  if (ss && b.active === f) raw += ss.value;
  const type = f.weapon.magic ? 'magic' : 'physical';
  let hits = 1, each = 1;
  if (frenzy && hasPassive(f, 'berserker.wildFrenzy')) {
    const cost = Math.ceil(1 + 0.5 * f.level);
    if (f.mp >= cost && b.rng.chance((5 + 2.5 * S(f, 'LCK')) / 100)) { f.mp -= cost; hits = 3; each = 0.7; ev.push({ type: 'status', target: f.id, text: `${f.name}: Wild Frenzy (${cost} MP)`, tag: 'WILD FRENZY' }); }
  }
  const cleave = hasPassive(f, 'warrior.furiousCleave');
  let first = null;
  for (let i = 0; i < hits; i++) {
    if (!t.alive || !f.alive) break;
    const r = strike(b, f, t, raw * each * (cleave ? 0.75 : 1), { type, label, basic: true, accBonus: cleave ? -10 : 0 });
    ev.push(...r.events);
    if (!first) first = r;
    if (cleave && r.target) { const bh = nextBehind(b, r.target); if (bh) ev.push(...strike(b, f, bh, raw * each * 0.75, { type, label: 'Cleave', basic: true, accBonus: -10 }).events); }
  }
  return { events: ev, first: first || { hit: false } };
}

/* After an action: Berserker passives that wake when it hurt an ally, and Moment of Clarity. */
function postAction(b, f) {
  const ev = [];
  if (!f.allyHit) return ev;
  f.allyHit = false;
  if (!f.alive) return ev;
  if (hasPassive(f, 'berserker.berserkir')) ev.push(...addFx(b, f, f, { key: 'attack', value: 10, turns: 2, label: 'Berserkir fury', tag: 'FURY' }));
  if (hasPassive(f, 'berserker.ulfhednar')) ev.push(...addFx(b, f, f, { key: 'haste', value: 10, ticks: 20, label: 'Ulfheðnar haste', tag: 'HASTE' }));
  if (hasPassive(f, 'berserker.jofurr')) ev.push(...addFx(b, f, f, { key: 'lifestealFx', value: 25, ticks: 30, label: 'Jöfurr lifesteal', tag: 'LIFESTEAL' }));
  if (f.cls === 'berserker') {
    const foes = live(enemiesOf(b, f));
    if (foes.length) {
      const t = b.rng.pick(foes);
      ev.push({ type: 'status', target: f.id, text: `${f.name}: Moment of Clarity` });
      if (b.rng.chance((4 * S(f, 'STR') + 4 * S(f, 'LCK')) / 100)) ev.push(...markTarget(b, f, t, 40));
      if (foes.some((x) => has(x, 'bmark'))) ev.push(...giveBerserk(b, f, 30));
    }
  }
  return ev;
}

/* ---------- the skill context ---------- */
function ctx(b, src, target, extra = {}) {
  const st = (k) => effStats(src)[k];
  const combo = () => src.noComboTurn !== src.turns + 1;
  const s = extra.skill;
  const c = {
    b, src, target, events: [], skill: s,
    S: (k) => S(src, k), stat: st,
    ATK: attackOf(src), SPELL: spellOf(src),
    X: extra.X || 0, AP: extra.apBefore || 0,
    chance: (pct) => b.rng.chance(clamp(pct, 0, 100) / 100),
    rng: b.rng,
    d20: () => b.rng.int(1, 20), d6: () => b.rng.int(1, 6), coin: () => b.rng.chance(0.5),
    strike(t, raw, o) { const r = strike(b, src, t, raw, o); c.events.push(...r.events); return r; },
    basic(t, o) { const r = basicStrikes(b, src, t, o); c.events.push(...r.events); return r.first; },
    basicBy(a, t) { const r = basicStrikes(b, a, t); c.events.push(...r.events); return r.first; },
    heal(t, amount, label) { c.events.push(...heal(b, src, t, amount, label)); },
    barrier(t, amount, label = 'Barrier') { c.events.push(...giveBarrier(t, amount * (hasPassive(src, 'wizard.arcaneMastery') ? 1.1 : 1), label)); },
    dispel(t) { c.events.push(...dispel(b, t)); },
    negate(t) { c.events.push(...negate(b, t)); },
    fx(t, e) { c.events.push(...addFx(b, src, t, e)); },
    burn(t) { c.events.push(...applyBurn(b, src, t)); },
    chill(t) { c.events.push(...applyChill(b, src, t)); },
    berserk(f, ticks) { c.events.push(...giveBerserk(b, f, ticks)); },
    mark(t, ticks) { c.events.push(...markTarget(b, src, t, ticks)); },
    push(t, n) { const before = t.pos; c.events.push(...push(b, src, t, n)); return t.pos !== before; },
    moveTo(f, pos) { c.events.push(...moveTo(b, f, pos)); },
    cleanse(t, n = 1) { c.events.push(...cleanse(b, t, n)); },
    purify(t) { c.events.push(...purify(b, t)); },
    revive(t, pct) { c.events.push(...revive(b, t, pct)); },
    execute(t) { c.events.push(...execute(b, src, t)); },
    selfPure(amount, label) { c.events.push(...pureDamage(b, src, amount, label)); },
    initiative(v) { src.pendingInit = (src.pendingInit || 0) + v; },
    apGain(n) { c.events.push(...gainAp(src, n, s ? s.name : 'skill')); },
    unlock: (n) => (s && s.apX ? c.X : c.AP) >= n,
    ward(t, o = {}) { c.fx(t, { key: 'ward', kind: o.kind || 'pure', turns: o.turns, ticks: o.ticks, label: 'Ward', tag: 'WARD', onBreak: o.onBreak }); },
    wall(hp, ticks, onExpire) {
      const v = hp * (hasPassive(src, 'wizard.arcaneMastery') ? 1.1 : 1);
      b.walls[src.team] = { hp: v, max: v, until: b.tick + ticks, src, taken: 0, onExpire };
      c.events.push({ type: 'status', target: src.id, text: `${src.name} raises a Wall of ${Math.round(v)} for ${ticks} ticks`, tag: 'WALL' });
      return b.walls[src.team];
    },
    wallOf: (team) => b.walls[team],
    delay(ticks, label, fn, t = null) {
      const n = Math.max(1, Math.round(ticks));
      b.delayed.push({ at: b.tick + n, src, target: t, label, fn });
      c.events.push({ type: 'status', target: (t || src).id, text: `${label}: lands in ${n} ticks`, tag: `DELAY ${n}` });
    },
    mpCut(t, pct, uses) { c.fx(t, { key: 'mpCut', value: pct, uses, label: `Next skills −${pct}% MP`, tag: `MP −${pct}%` }); },
    amnesiaRandom(t, n) {
      const list = t.skills.filter((x) => !x.passive);
      if (!list.length) return;
      const k = b.rng.pick(list);
      t.cd[k.id] = (t.cd[k.id] > 0 ? t.cd[k.id] : 0) + n;
      c.events.push({ type: 'status', target: t.id, text: `${t.name}: Amnesia ${t.cd[k.id]} on ${k.name}`, tag: 'AMNESIA' });
    },
    repeat() { if (!src.repeated) { src.repeated = true; c.repeatNow = true; } },
    enemies: () => live(enemiesOf(b, src)),
    allies: () => live(alliesOf(b, src)),
    behind: (t) => nextBehind(b, t),
    front: (t) => [...teamOf(b, t.team)].reverse().find((x) => x.pos < t.pos && x.alive) || null,
    alliesBehind: () => behindOf(b, src),
    randomEnemy: () => { const l = live(enemiesOf(b, src)); return l.length ? b.rng.pick(l) : null; },
    randomAlly: (notSelf = true) => { const l = live(alliesOf(b, src)).filter((x) => !notSelf || x !== src); return l.length ? b.rng.pick(l) : null; },
    tauntedBy: () => tauntedBy(b, src),
    lastWas: (id) => combo() && src.lastSkill === id,
    lastBranch: (br) => combo() && src.lastBranch === br,
    usedRecently: (id, turns) => combo() && src.history.slice(-turns).includes(id),
    hasPassive: (id) => hasPassive(src, id),
    has: (t, key) => has(t, key),
    stacks: (t, key) => stacksOf(t, key),
    log(text) { c.events.push({ type: 'status', target: src.id, text }); },
  };
  return c;
}

/* ---------- skills and active traits ---------- */
export function manaCost(f, s) {
  if (!s.mana) return 0;
  let m = s.mana[0] + s.mana[1] * f.level;
  if (hasTrait(f, 'efficient')) m *= 0.9;
  if (hasPassive(f, 'seer.theOracle')) m *= 0.9;
  const cut = !s.trait && f.fx.find((e) => e.key === 'mpCut');
  if (cut) m *= 1 - cut.value / 100;
  return Math.round(m);
}
/* Why a skill or trait cannot be used now, or null. */
export function skillBlocked(b, f, s) {
  if (s.trait) return f.used[s.id] ? 'used' : null;
  if (f.cd[s.id] > 0) return `Amnesia ${f.cd[s.id]}`;
  if (f.mp < manaCost(f, s)) return 'not enough MP';
  if (s.ap && (f.ap || 0) < s.ap) return `needs ${s.ap} Arcane Power`;
  if (s.apX && !((f.ap || 0) > 0)) return 'no Arcane Power';
  if (s.noWall && b.walls[f.team]) return 'a Wall is already up';
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
/* Who a skill can target. 'enemy' follows reach and taunt; 'ally' any standing ally (self included); 'allyOther' an ally
   but not the hero; 'fallen' an ally who is down; 'self', 'none', 'allies' need no choice. */
export function skillTargets(b, f, s) {
  if (s.target === 'enemy') return enemyTargets(b, f, reachOf(f, s));
  if (s.target === 'ally') return alliesOf(b, f).filter((x) => x.alive);
  if (s.target === 'allyOther') return alliesOf(b, f).filter((x) => x.alive && x !== f);
  if (s.target === 'fallen') return alliesOf(b, f).filter((x) => !x.alive && !x.pendingRevive);
  return [];
}
export const channelOf = (s, X = 0) => (typeof s.channel === 'function' ? s.channel(X) : s.channel || 0);
export function useSkill(b, f, s, target) {
  b.seq++;
  const pre = [];
  let cost = manaCost(f, s);
  for (const m of f.mods.filter((x) => x.key === 'conserve')) if (cost && b.rng.chance(m.value / 100)) { cost = Math.floor(cost * (1 - m.cut)); pre.push({ type: 'status', target: f.id, text: `${f.name}: the pet saves mana (${s.name} costs ${cost})` }); break; }
  f.mp -= cost;
  const cut = !s.trait && f.fx.find((e) => e.key === 'mpCut');
  if (cut) { cut.uses -= 1; if (cut.uses <= 0) f.fx = f.fx.filter((x) => x !== cut); }
  const apBefore = f.ap || 0;
  let X = 0;
  if (s.ap) f.ap -= s.ap;
  if (s.apX) { X = Math.min(30, f.ap); f.ap -= X; }
  if (s.trait) f.used[s.id] = true;
  else {
    let am = s.amnesia || 0;
    const tr = modSum(f, 'totalRecall');
    if (am && tr && b.rng.chance(tr / 100)) am -= 1;
    f.cd[s.id] = am;
    if (s.teamAmnesia) for (const a of alliesOf(b, f)) if (a !== f && a.skills.some((x) => x.id === s.id)) a.cd[s.id] = Math.max(a.cd[s.id] || 0, s.teamAmnesia);
  }
  const need0 = channelOf(s, X);
  if (need0) {
    let need = need0;
    const sc = modSum(f, 'swiftCast');
    if (sc && b.rng.chance(sc / 100)) need = Math.round(need * 0.7);
    f.channel = { skill: s, target: target && target.id, need, X, apBefore };
    return [...pre, { type: 'channel', source: f.id, skill: s.name, text: `${f.name} channels ${s.name} (${need} Initiative)` }];
  }
  return [...pre, ...resolveSkill(b, f, s, target, { X, apBefore })];
}
export function resolveSkill(b, f, s, target, extra = {}) {
  const c = ctx(b, f, target, { ...extra, skill: s });
  c.events.push({ type: 'skill', source: f.id, target: target && target.id, skill: s.name, anim: s.anim });
  s.run(c, target);
  const events = c.events;
  // Repeat: the skill fires once more for free (Starboard Cannons), at most once per turn
  if (c.repeatNow && f.alive) {
    let t2 = target;
    if (s.target === 'enemy' && (!t2 || !t2.alive)) t2 = enemyTargets(b, f, reachOf(f, s))[0] || null;
    if (s.target !== 'enemy' || t2) {
      const c2 = ctx(b, f, t2, { ...extra, skill: s });
      c2.repeated = true;
      c2.events.push({ type: 'status', target: f.id, text: `${s.name}: Repeat`, tag: 'REPEAT' });
      s.run(c2, t2);
      events.push(...c2.events);
    }
  }
  f.lastSkill = s.id;
  f.lastBranch = s.branch || null;
  f.history.push(s.id);
  events.push(...postAction(b, f));
  return events;
}
/* A channel completes when the hero's Initiative reaches it: the skill resolves and the turn is spent. */
export function completeChannel(b, f) {
  const ch = f.channel;
  f.channel = null;
  b.active = f;
  b.seq++;
  let target = ch.target ? b.fighters.find((x) => x.id === ch.target) : null;
  if (target && !target.alive && ch.skill.target === 'enemy') target = enemyTargets(b, f, reachOf(f, ch.skill))[0] || null;
  const events = resolveSkill(b, f, ch.skill, target, { X: ch.X, apBefore: ch.apBefore });
  events.push(...endTurn(b, f, 'action', ch.skill));
  return events;
}

/* ---------- the basic attack ---------- */
export function basicAttack(b, f, t) {
  b.seq++;
  const r = basicStrikes(b, f, t, { frenzy: true });
  f.lastSkill = 'basic'; f.lastBranch = null; f.history.push('basic');
  return [{ type: 'skill', source: f.id, target: t.id, skill: 'Basic Attack', basic: true }, ...r.events, ...postAction(b, f)];
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

/* ---------- trying moves without making them (the AI) ---------- */
const FIXED = new Set(['hero', 'weapon', 'armour', 'offhand', 'accessory', 'pet', 'petSkill', 'skills', 'passives', 'traitActives', 'traitPassives', 'mods', 'base', 'dyn', 'b',
  'node', 'plate', 'canvas', 'renderer', 'portrait', 'marker', 'markerCanvas', 'idle', 'onHit', 'weaponSet', 'cls', 'id', 'team', 'name', 'level', 'hpMax', 'mpMax', 'luckyStart']);
const copyVal = (v) => (Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' ? { ...x } : x)) : v && typeof v === 'object' ? { ...v } : v);
export function snapshot(b) {
  return {
    b: { tick: b.tick, over: b.over, winner: b.winner, active: b.active, seq: b.seq, delayed: b.delayed.slice(), walls: { ...b.walls }, wallsCopy: { A: b.walls.A && { ...b.walls.A }, B: b.walls.B && { ...b.walls.B } }, rng: b.rng },
    f: b.fighters.map((f) => { const o = {}; for (const k of Object.keys(f)) if (!FIXED.has(k)) o[k] = copyVal(f[k]); return o; }),
  };
}
export function restore(b, s) {
  Object.assign(b, { tick: s.b.tick, over: s.b.over, winner: s.b.winner, active: s.b.active, seq: s.b.seq, rng: s.b.rng, delayed: s.b.delayed.slice() });
  b.walls = { A: s.b.wallsCopy.A && { ...s.b.wallsCopy.A }, B: s.b.wallsCopy.B && { ...s.b.wallsCopy.B } };
  b.fighters.forEach((f, i) => {
    const o = s.f[i];
    for (const k of Object.keys(f)) if (!FIXED.has(k) && !(k in o)) delete f[k];
    for (const k of Object.keys(o)) f[k] = copyVal(o[k]);
  });
}
/* Delayed actions cast after a given point land now (for the AI's trials). */
export function flushDelayed(b, from) {
  const mine = b.delayed.slice(from);
  b.delayed = b.delayed.slice(0, from);
  const ev = [];
  for (const d of mine) ev.push(...runDelayed(b, d));
  return ev;
}

/* Short labels of what a fighter is under, for the page. */
export function tags(f) {
  const out = [];
  for (const e of f.fx) {
    if (e.key.startsWith('res') || e.key === 'lastStand' || e.hidden) continue;
    const name = e.tag || e.label || e.key;
    const left = e.turns != null ? `${e.turns}t` : e.untilTick != null && f.b ? `${Math.max(0, e.untilTick - f.b.tick)}` : '';
    out.push({ key: e.key, name: e.label || name, text: `${name}${e.stacks > 1 ? `×${e.stacks}` : ''}${e.key === 'barrier' ? ` ${Math.round(e.value)}` : ''}${e.turns != null ? ` ${e.turns}t` : ''}`, stacks: e.stacks > 1 ? e.stacks : 0, left, value: e.key === 'barrier' ? Math.round(e.value) : null, bad: isNeg(e) });
  }
  if (f.channel) out.unshift({ key: 'channel', name: `Channelling ${f.channel.skill.name}`, text: `CHANNEL ${f.channel.skill.name}`, bad: false });
  return out;
}

/* Numbers for the page's hero sheet. */
export const sheet = (b, f) => ({ attack: attackOf(f), spell: spellOf(f), pdef: pdefOf(f, b), mdef: mdefOf(f), evasion: evasionOf(f), crit: critOf(f), block: blockOf(f, false), speed: f.speed });
