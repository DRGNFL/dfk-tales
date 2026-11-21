/* DFK Tales Arena — combat engine, core.
   Pure module: no page, no network. The same file runs in the browser (practice arena, replays, spectators)
   and on the server referee (live matches), so a battle computed in two places comes out identical.

   Sources: Hubert's Dynamic Stat and Accuracy Calculator ("Latest", 4/16/2025), Workhorse's Skill Codex
   and PvP Reference Guide, DFK patch notes up to 2.8.2. Numbers live in tables, not in code paths. */

/* ---------- dice ---------- */
// mulberry32: small, fast, and identical on every JS engine. All randomness in a battle goes through it.
export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    chance: (p) => next() < p, // p in 0..1
    between: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    state: () => a,
  };
}

/* ---------- arena rules ---------- */
export const LEVEL_CAPS = [10, 12, 15, 20];
export const TEAM_SIZE = 3;
export const ACT_AT = 1000; // Initiative needed to act
export const RETURN = { reposition: 250, pass: 400 }; // Initiative given back (patch 1.0 and 1.2.0)

// Skill Codex: 1 point per level; one skill per tier, in order; tier N costs N points.
// Main class tiers 1-5 cost 1+2+3+4+5 = 15; up to 15 points may go to the subclass.
export const TIER_COST = [0, 1, 2, 3, 4, 5];
export function codexBudget(level) {
  let spent = 0, tiers = 0;
  while (tiers < 5 && spent + TIER_COST[tiers + 1] <= level) { tiers += 1; spent += TIER_COST[tiers]; }
  return { mainTiers: tiers, subPoints: Math.min(15, level - spent) };
}

/* ---------- dynamic stats (Hubert, Latest 4/16/2025) ----------
   One stat:  (A*stat + B*avgLVL + C) / (D*avgLVL + E)
   Two stats: the same term for the main stat plus one for LCK.
   Above the threshold a score yields a third: threshold + excess / 3. */
const ONE = {
  STR: [0.115, -0.020675, -0.314325, 2.245, 21.755],
  DEX: [0.115, -0.019425, -0.460575, 2.37, 18.63],
  AGI: [0.115, -0.02005, -0.34495, 2.3075, 18.6925],
  VIT: [0.115, -0.051925, -0.458075, 1.995, 16.005],
  END: [0.115, -0.0363, -0.4637, 2.12, 16.88],
  INT: [0.115, -0.0038, -0.3312, 2.495, 21.505],
  WIS: [0.115, -0.0038, -0.3312, 2.495, 21.505],
  LCK: [0.115, -0.0147375, -0.4951375, 2.12, 15.8925],
};
const ONE_CAP = 0.1;
const SPEED = { k: [40, 169.6, 1310.4, 2.3075, 18.6925], cap: 110 };
const TWO = {
  block: { main: 'STR', a: [0.092, -0.01654, -0.25146, 2.245, 21.755], l: [0.028, -0.00451, -0.127465, 2.12, 15.8925], cap: 0.1 },
  evasion: { main: 'AGI', a: [0.092, -0.01604, -0.27596, 2.3075, 18.6925], l: [0.028, -0.00451, -0.127465, 2.12, 15.8925], cap: 0.1 },
  recovery: { main: 'VIT', a: [0.072, -0.02904, -0.25896, 1.995, 16.005], l: [0.023, -0.0029475, -0.0990275, 2.12, 15.8925], cap: 0.075 },
  ser: { main: 'END', a: [0.126, -0.04392, -0.54108, 2.12, 16.88], l: [0.039, -0.0100675, -0.20592, 2.12, 15.8925], cap: 0.12 },
  spellBlock: { main: 'INT', a: [0.092, -0.00304, -0.26496, 2.495, 21.505], l: [0.028, -0.00451, -0.127465, 2.12, 15.8925], cap: 0.1 },
};
const term = ([A, B, C, D, E], stat, avg) => (A * stat + B * avg + C) / (D * avg + E);
const soften = (v, cap) => (v > cap ? cap + (v - cap) / 3 : v);

export const STAT_KEYS = { STR: 'strength', DEX: 'dexterity', AGI: 'agility', VIT: 'vitality', END: 'endurance', INT: 'intelligence', WIS: 'wisdom', LCK: 'luck' };

/* stats: { STR, DEX, AGI, VIT, END, INT, WIS, LCK } (effective values, buffs included). avgLvl: average level of all heroes in the battle. */
export function dynamicStats(stats, avgLvl) {
  const S = {};
  for (const k of Object.keys(ONE)) S[k] = soften(term(ONE[k], stats[k], avgLvl), ONE_CAP);
  const two = {};
  for (const [name, d] of Object.entries(TWO)) two[name] = soften(term(d.a, stats[d.main], avgLvl) + term(d.l, stats.LCK, avgLvl), d.cap);
  return {
    S, // stat scores ("STR.S" in the skill formulas), as fractions
    speed: soften(term(SPEED.k, stats.AGI, avgLvl), SPEED.cap),
    crit: S.LCK,
    ...two,
  };
}

/* Starting Initiative: 1500 * AGI.S, plus or minus up to 500 * LCK.S; with chance 3 * LCK.S it starts tripled. */
export function startInitiative(dyn, rng) {
  const mod = rng.between(-500 * dyn.S.LCK, 500 * dyn.S.LCK);
  let v = 1500 * dyn.S.AGI + mod;
  const lucky = rng.chance(3 * dyn.S.LCK);
  if (lucky) v *= 3;
  return { value: v, lucky };
}

/* ---------- accuracy (Hubert's Accuracy Calculator) ----------
   chanceMod = DEX - requirement (physical) or FOCUS - requirement (magic); FOCUS = 0.6 WIS + 0.4 DEX.
   At or below the requirement: AaR * curve / (chanceMod^2 + curve);
   above it: AaR * (1.35 - 0.35 * curve / ((chanceMod + 2)^2 + curve)). Basic attacks get +5%. */
export const focusOf = (stats) => 0.6 * stats.WIS + 0.4 * stats.DEX;
export function accuracy({ stat, requirement, aar, curveBelow = 150, curveAbove = 400, basic = false }) {
  const m = stat - requirement;
  const v = m <= 0 ? aar * curveBelow / (m * m + curveBelow) : aar * (1.35 - 0.35 * curveAbove / ((m + 2) ** 2 + curveAbove));
  return v + (basic ? 0.05 : 0);
}

/* One roll to hit (Ge, 21/11/2026): chance = attacker's accuracy - target's evasion, kept between 0 and 1.
   Accuracy can go above 100% (up to ~120%), which is what eats into high evasion. */
export const hitChance = (acc, evasion) => Math.min(1, Math.max(0, acc - evasion));
export const rollHit = (rng, acc, evasion) => rng.chance(hitChance(acc, evasion));

/* ---------- damage pieces ----------
   Damage reduction from defence is a percentage that depends on the battle's average level: DEF / (50 * avgLVL).
   Critical hits: x1.5 base for damage and healing (daggers add +1.0). Block: 50% base, +20% with a shield. */
export const defenceReduction = (def, avgLvl) => Math.min(1, Math.max(0, def / (50 * avgLvl)));
export const CRIT_MULT = 1.5;
export const BLOCK_BASE = 0.5;

/* ---------- targeting (rules from Ge, 21/11/2026) ----------
   Two kinds of hits. MELEE hits whoever is there: reach N means the first N enemy positions, whatever the
   attacker's own position (from P1, P2 or P3 alike, reach 1 hits enemy P1, reach 2 hits P1 or P2).
   "You hit the first one there": positions are counted on the heroes still standing.
   RANGED: you choose any enemy, from any position. AOE (e.g. the Archer's Barrage) hits every position.
   team: array of fighters ordered P1, P2, P3; a fighter has .alive. */
export function targetable(team, { kind = 'melee', reach = 1 } = {}) {
  const standing = team.filter((f) => f.alive);
  if (kind === 'ranged' || kind === 'aoe') return standing;
  return standing.slice(0, Math.max(1, reach));
}

/* ---------- the timebar ----------
   Every tick each standing hero gains Initiative equal to its Speed; at 1000 it acts.
   Acting resets it to 0; repositioning gives back 250 and passing 400. */
export function createTimebar(fighters) {
  // fighters: [{ id, speed, initiative, alive }]
  return { tick: 0, fighters };
}
export function nextToAct(bar, maxTicks = 100000) {
  for (let n = 0; n < maxTicks; n++) {
    const ready = bar.fighters.filter((f) => f.alive && f.initiative >= ACT_AT);
    if (ready.length) {
      // the one furthest past 1000 goes first; ties to the faster hero, then to the lower id
      ready.sort((a, b) => b.initiative - a.initiative || b.speed - a.speed || (a.id < b.id ? -1 : 1));
      return ready[0];
    }
    bar.tick += 1;
    for (const f of bar.fighters) if (f.alive) f.initiative += f.speed;
  }
  return null;
}
export function spendTurn(fighter, kind = 'action') {
  fighter.initiative = kind === 'reposition' ? RETURN.reposition : kind === 'pass' ? RETURN.pass : 0;
}
