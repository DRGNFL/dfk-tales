/* DFK Tales — the Arena squad: your three heroes, each with its Codex skills (gear and pet live on the hero, see armory.js).
   Built in the Legion Viewer, played in the Arena against the computer, which drafts its own squad.
   Kept in localStorage as plain JSON, so it survives changing legion and closing the page.
   (Up to version 0.4 there was a second, right-hand team: it is gone; the data keeps the shape { A, B } with B empty.) */

import { equip, entryOf } from './armory.js?v=1';

const KEY = 'dfk-tales:squad';
export const CAPS = [10, 12, 15, 20];
export const GEAR_KINDS = ['weapon', 'armor', 'offhand', 'accessory'];
const empty = () => ({ cap: 20, teams: { A: [null, null, null], B: [null, null, null] }, sel: { team: 'A', i: 0 } });
const clean = (v) => JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? x.toString() : x)));

export function readSquad() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.teams) return s; } catch (e) {}
  return empty();
}
function write(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { return 'This browser would not keep the squad (storage full or blocked).'; }
  window.dispatchEvent(new CustomEvent('dfk-squad', { detail: s }));
  return null;
}
export const onSquadChange = (fn) => {
  window.addEventListener('dfk-squad', (e) => fn(e.detail));
  window.addEventListener('storage', (e) => { if (e.key === KEY) fn(readSquad()); });
};

const heroKey = (h) => `${h.chainId}:${h.id}`;
const itemKey = (x) => `${x.chainId}:${x.kind || 'pet'}:${x.id}`;
export const slotsOf = (s) => s.teams.A.map((slot, i) => ({ team: 'A', i, slot }));
export const findHero = (s, h) => slotsOf(s).find((x) => x.slot && heroKey(x.slot.hero) === heroKey(h)) || null;
export const findItem = (s, x, field) => slotsOf(s).find((o) => o.slot && o.slot[field] && itemKey(o.slot[field]) === itemKey(x)) || null;
export const twoHanded = (e) => !!e && (/^2H /.test(e.typeName) || ['Staff', 'Bow', 'Gloves'].includes(e.typeName));
export const isComplete = (s) => s.teams.A.every((x) => x && x.hero.level <= s.cap);

export function setCap(c) { const s = readSquad(); s.cap = c; return write(s); }
export function select(team, i) { const s = readSquad(); s.sel = { team: 'A', i }; return write(s); }

/* Add a hero, or take it out if it is already in. kit: { weapon, armor, offhand, pet } picked for it (Legion Viewer). Returns { ok, msg }. */
export function toggleHero(h, kit = {}) {
  const s = readSquad();
  const there = findHero(s, h);
  if (there) { s.teams[there.team][there.i] = null; s.sel = { team: there.team, i: there.i }; return done(s, `${h.name} left the squad.`); }
  if (h.level > s.cap) return { ok: false, msg: `${h.name} is level ${h.level}: above the level cap ${s.cap}.` };
  const team = 'A';
  let i = s.sel && s.sel.team === 'A' ? s.sel.i : 0;
  if (s.teams.A[i]) {
    i = s.teams.A.findIndex((x) => !x);
    if (i < 0) return { ok: false, msg: 'The squad is full: take someone out first.' };
  }
  const k = (x) => (x ? clean(x) : null);
  s.teams[team][i] = { hero: clean(h), pet: k(kit.pet), weapon: k(kit.weapon), armor: k(kit.armor), offhand: k(kit.offhand), accessory: null, skills: null };
  s.sel = { team, i };
  const got = ['weapon', 'armor', 'offhand', 'pet'].filter((f) => kit[f]).map((f) => kit[f].name);
  return done(s, `${h.name} is in the squad at P${i + 1}${got.length ? `, with ${got.join(', ')}` : ''}.`);
}

/* Give a pet or a piece of gear to the selected hero (or take it back). field: pet | weapon | armor | offhand | accessory. */
export function toggleItem(x, field) {
  const s = readSquad();
  const target = s.teams[s.sel.team][s.sel.i];
  if (!target) return { ok: false, msg: 'Select a hero in the squad first, then click + on what you want to give it.' };
  if (target[field] && itemKey(target[field]) === itemKey(x)) { target[field] = null; return done(s, `${x.name} taken back from ${target.hero.name}.`); }
  if (field !== 'pet' && x.equipRequirement > target.hero.level) return { ok: false, msg: `${x.name} needs level ${x.equipRequirement}: ${target.hero.name} is level ${target.hero.level}.` };
  if (field === 'offhand' && twoHanded(target.weapon)) return { ok: false, msg: `${target.hero.name} holds a two-handed ${target.weapon.typeName}: no room for an offhand.` };
  const other = findItem(s, x, field);
  if (other) s.teams[other.team][other.i][field] = null;
  let note = '';
  if (field === 'weapon' && twoHanded(x) && target.offhand) { note = ` The ${target.offhand.name} comes off: two hands needed.`; target.offhand = null; }
  target[field] = clean(x);
  return done(s, `${x.name} goes to ${target.hero.name}.${other ? ' (Moved from another hero.)' : ''}${note}`);
}
/* Put x (or null) in one field of one hero, moving it away from whoever had it. */
export function setItem(team, i, field, x) {
  const s = readSquad();
  const t = s.teams[team][i];
  if (!t) return { ok: false, msg: 'Empty slot.' };
  if (x) {
    if (field !== 'pet' && x.equipRequirement > t.hero.level) return { ok: false, msg: `${x.name} needs level ${x.equipRequirement}.` };
    if (field === 'offhand' && twoHanded(t.weapon)) return { ok: false, msg: `${t.hero.name} holds a two-handed ${t.weapon.typeName}: no room for an offhand.` };
    const other = findItem(s, x, field);
    if (other) s.teams[other.team][other.i][field] = null;
    if (field === 'weapon' && twoHanded(x)) t.offhand = null;
  }
  t[field] = x ? clean(x) : null;
  return done(s, x ? `${x.name} goes to ${t.hero.name}.` : `${t.hero.name}: ${field} back to the loaned one.`);
}
/* Keys of every pet and piece of gear already given to someone in the squad. */
export const takenKeys = (s) => new Set(slotsOf(s).filter((x) => x.slot).flatMap((x) => ['pet', 'weapon', 'armor', 'offhand', 'accessory'].filter((f) => x.slot[f]).map((f) => itemKey(x.slot[f]))));
export { itemKey };
export function clearField(team, i, field) {
  const s = readSquad(); const t = s.teams[team][i];
  if (!t) return null;
  if (field === 'hero') s.teams[team][i] = null; else t[field] = null;
  return write(s);
}
export function setSkills(team, i, skills) {
  const s = readSquad(); const t = s.teams[team][i];
  if (!t) return null;
  t.skills = skills;
  return write(s);
}
export function clearSquad() { return write(empty()); }
function done(s, msg) { const err = write(s); return err ? { ok: false, msg: err } : { ok: true, msg }; }

/* Squads built with version 0.2 kept gear and pet on the squad slot: move them onto the heroes (the armory), once. */
(function migrate() {
  let s;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { return; }
  if (!s || !s.teams) return;
  let moved = false;
  // 0.5: no right-hand team any more (the computer drafts its own).
  if (s.teams.B && s.teams.B.some(Boolean)) { s.teams.B = [null, null, null]; moved = true; }
  if (s.sel && s.sel.team !== 'A') { s.sel = { team: 'A', i: 0 }; moved = true; }
  for (const t of ['A']) for (const slot of s.teams[t]) {
    if (!slot) continue;
    const old = [['weapon', 'weapon1'], ['offhand', 'offhand1'], ['armor', 'armor'], ['accessory', 'accessory'], ['pet', 'pet']].filter(([f]) => slot[f]);
    if (!old.length) continue;
    if (!entryOf(slot.hero)) for (const [f, to] of old) equip(slot.hero, to, slot[f]);
    for (const [f] of old) delete slot[f];
    moved = true;
  }
  if (moved) try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
})();
