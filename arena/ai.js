/* DFK Tales Arena — the computer opponent.
   It tries every legal move a few times on the real battle (then puts everything back, see combat.js snapshot/restore),
   scores what happened, and plays the best. No look-ahead past its own action: channels and delayed effects are
   resolved at once in the trial and counted a little less, since they land later and can be broken.
   Scores are in "HP of the enemy": damage dealt and healing done count about the same, a knock-out a lot more. */
import * as C from './combat.js?v=6';
import { makeRng } from './engine.js?v=1';

const TRIES = 4;

/* Everything the hero could do now: attack each reachable enemy, each usable skill on each target. */
export function options(b, f) {
  const out = [];
  for (const t of C.enemyTargets(b, f, { kind: f.weapon.kind, reach: f.weapon.reach })) out.push({ kind: 'attack', target: t });
  for (const s of [...f.skills, ...f.traitActives, ...(f.petSkill ? [f.petSkill] : [])]) {
    if (C.skillBlocked(b, f, s)) continue;
    const needs = ['enemy', 'ally', 'allyOther', 'fallen'].includes(s.target);
    const ts = needs ? C.skillTargets(b, f, s) : [null];
    for (const t of ts) out.push({ kind: 'skill', skill: s, target: t });
  }
  return out;
}

/* The move to play: { kind: 'attack' | 'skill' | 'pass', skill, target, score }. */
export function decide(b, f) {
  const opts = options(b, f);
  if (!opts.length) return { kind: 'pass', score: 0 };
  const scale = avgHp(b);
  let best = null;
  opts.forEach((o, i) => {
    o.score = trial(b, f, o, i);
    // once-per-battle tools (traits, pet skills) wait for a moment worth them
    if (o.kind === 'skill' && o.skill.trait) o.score -= 0.06 * scale;
    o.score *= 0.92 + 0.16 * b.rng.next();
    if (!best || o.score > best.score) best = o;
  });
  if (best.score <= 0) {
    const att = opts.filter((o) => o.kind === 'attack').sort((x, y) => x.target.hp - y.target.hp)[0];
    return att || { kind: 'pass', score: 0 };
  }
  return best;
}

const avgHp = (b) => b.fighters.reduce((t, f) => t + f.hpMax, 0) / b.fighters.length;
const barrierOf = (f) => { const e = f.fx.find((x) => x.key === 'barrier'); return e ? e.value : 0; };
const badCount = (f) => f.fx.filter((e) => isBad(e)).length;
const goodCount = (f) => f.fx.filter((e) => !isBad(e) && !e.hidden && !e.key.startsWith('res') && e.key !== 'barrier').length;
const BAD = new Set(['stun', 'taunt', 'intimidate', 'silence', 'bleed', 'holyLight', 'hunterMark', 'exhaust', 'root', 'blind', 'slow', 'poison', 'confuse', 'fear', 'burn', 'chill', 'bmark', 'vuln', 'dazedMark']);
const isBad = (e) => BAD.has(e.key) || !!e.neg;

function state(b) {
  const list = b.fighters.map((f) => ({ id: f.id, team: f.team, alive: f.alive || !!f.pendingRevive, hp: f.hp, hpMax: f.hpMax, bar: barrierOf(f), bad: badCount(f), good: goodCount(f), init: f.initiative + (f.pendingInit || 0) }));
  list.wall = { A: b.walls.A ? b.walls.A.hp : 0, B: b.walls.B ? b.walls.B.hp : 0 };
  return list;
}

function trial(b, f, o, i) {
  const snap = C.snapshot(b);
  const before = state(b);
  let total = 0;
  for (let k = 0; k < TRIES; k++) {
    b.rng = makeRng((b.seed || 1) ^ (b.tick * 7919) ^ (i * 104729) ^ (k * 1299709));
    let weight = 1;
    try {
      const from = b.delayed.length;
      if (o.kind === 'attack') C.basicAttack(b, f, o.target);
      else {
        C.useSkill(b, f, o.skill, o.target);
        if (f.channel) {
          const ch = f.channel;
          weight = ch.need >= 1000 ? 0.65 : 0.78;
          f.channel = null;
          C.resolveSkill(b, f, ch.skill, o.target, { X: ch.X, apBefore: ch.apBefore });
        }
      }
      if (b.delayed.length > from) { weight *= 0.95; C.flushDelayed(b, from); }
      total += weight * score(b, f, before, state(b), o);
    } catch (e) { total -= 1e6; }
    C.restore(b, snap);
  }
  return total / TRIES;
}

function score(b, f, before, after, o) {
  const scale = avgHp(b);
  let s = 0;
  after.forEach((a, i) => {
    const p = before[i];
    const mine = a.team === f.team;
    const dHp = a.hp - p.hp;
    const dBar = a.bar - p.bar;
    if (mine) {
      // healing counts more on a hero who is low; a barrier counts a bit less than HP
      const low = 1 - p.hp / p.hpMax;
      s += dHp > 0 ? dHp * (0.6 + 1.4 * low) : dHp * 1.2;
      s += dBar > 0 ? Math.min(dBar, p.hpMax * 0.6) * (0.35 + 0.8 * low) : dBar * 0.8;
      if (p.alive && !a.alive) s -= 1.6 * p.hpMax;
      if (!p.alive && a.alive) s += 1.2 * p.hpMax;
      s += (a.good - p.good) * 0.06 * scale - (a.bad - p.bad) * 0.08 * scale;
    } else {
      s -= dHp; // damage dealt
      s -= dBar * 0.8;
      if (p.alive && !a.alive) s += 0.9 * p.hpMax + 0.3 * scale;
      if (a.alive) {
        s += (a.bad - p.bad) * 0.07 * scale - (a.good - p.good) * 0.06 * scale;
        s -= (a.init - p.init) / 1000 * 0.25 * scale; // pushing an enemy back in time
      }
    }
  });
  // a Wall shields the whole team
  const mineT = f.team, foeT = f.team === 'A' ? 'B' : 'A';
  s += (after.wall[mineT] - before.wall[mineT]) * 0.6;
  s -= (after.wall[foeT] - before.wall[foeT]) * 0.8;
  // my own Initiative after the move (Shield Up +300, Holy Circle −500…)
  const me = after.find((x) => x.id === f.id), was = before.find((x) => x.id === f.id);
  if (me && was) s += (me.init - was.init) / 1000 * 0.3 * scale;
  // mana is a budget: spend it, but not for nothing
  // (no mana comes back in battle, so the less is left the dearer it gets)
  if (o.kind === 'skill' && !o.skill.trait) s -= C.manaCost(f, o.skill) / Math.max(20, f.mpMax) * 0.08 * scale * Math.min(4, f.mpMax / Math.max(1, f.mp));
  return s;
}
