/* DFK Tales — the slot icons around the portrait of a hero card become buttons: a click opens what fits that slot,
   from the hero's own legion, with an Equip tab and a Visage tab (looks only). Used by the Legion Viewer and the Hero Viewer. */
import { getHeroWeaponAnimationSet } from 'https://esm.sh/@defikingdoms/game-sdk@0.1.0/renderer?deps=ethers@5.8.0';
import { SLOTS, equip, heroLook, wearerOf, twoHanded, itemKey } from './armory.js?v=1';
import { petInBattle } from '../arena/pets.js?v=1';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const cap = (s) => (s ? String(s)[0].toUpperCase() + String(s).slice(1) : '');
const STAT = { STR: 'strength', DEX: 'dexterity', AGI: 'agility', VIT: 'vitality', END: 'endurance', INT: 'intelligence', WIS: 'wisdom', LCK: 'luck' };
const SET_TYPE = { '2H Staff': 'Staff', '1H Wand': 'Wand', '1H Dagger': 'Dagger', '1H Shortsword': '1H Sword' };
const RARITY = ['common', 'uncommon', 'rare', 'legendary', 'mythic'];

const css = `
.dfk-e-equippedIcons button { cursor: pointer; transition: transform .12s, filter .12s; }
.dfk-e-equippedIcons button:hover { transform: scale(1.12); filter: drop-shadow(0 0 4px rgba(255,255,255,.75)); }
.eq-pick { position: fixed; z-index: 60; width: 380px; max-width: calc(100vw - 16px); max-height: min(560px, 80vh); display: grid; grid-template-rows: auto auto auto 1fr auto; background: #070707; border: 1px solid var(--line-2, #333); box-shadow: 0 16px 40px rgba(0,0,0,.75); color: var(--text, #eee); }
.eq-pick header { padding: 9px 11px 7px; display: flex; justify-content: space-between; gap: 8px; align-items: baseline; border-bottom: 1px solid var(--line, #222); }
.eq-pick header b { font: 700 13px var(--display, sans-serif); letter-spacing: .1em; text-transform: uppercase; }
.eq-pick header span { font: 10.5px var(--mono, monospace); color: var(--muted, #888); }
.eq-pick header button { border: 0; background: none; color: var(--muted, #888); font: 15px var(--mono, monospace); padding: 0 2px; cursor: pointer; }
.eq-pick .tabs { display: flex; border-bottom: 1px solid var(--line, #222); }
.eq-pick .tabs button { flex: 1; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--muted, #888); padding: 7px; font: 600 11px var(--display, sans-serif); letter-spacing: .14em; text-transform: uppercase; cursor: pointer; }
.eq-pick .tabs button[aria-selected="true"] { color: var(--text, #eee); border-bottom-color: var(--red, #e3172b); }
.eq-pick input { margin: 7px 10px; height: 30px; padding: 0 9px; background: #000; border: 1px solid var(--line-2, #333); color: inherit; font: 12px var(--body, sans-serif); }
.eq-pick ul { list-style: none; margin: 0; padding: 0; overflow: auto; }
.eq-pick li button { width: 100%; display: grid; grid-template-columns: 34px 1fr auto; gap: 9px; align-items: center; padding: 5px 11px; border: 0; border-bottom: 1px solid #141414; background: none; text-align: left; color: inherit; cursor: pointer; text-transform: none; letter-spacing: 0; }
.eq-pick li button:hover { background: #151515; }
.eq-pick li button[disabled] { opacity: .32; cursor: not-allowed; }
.eq-pick li button.on { background: #1a0306; box-shadow: inset 2px 0 0 var(--red, #e3172b); }
.eq-pick li img { width: 32px; height: 32px; image-rendering: pixelated; }
.eq-pick li .ph { width: 32px; height: 32px; display: grid; place-items: center; font: 15px var(--mono, monospace); color: var(--muted, #888); border: 1px dashed #333; }
.eq-pick li b { font: 600 12.5px var(--display, sans-serif); letter-spacing: .03em; display: block; }
.eq-pick li small { font: 10px var(--mono, monospace); color: var(--muted, #888); display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 250px; }
.eq-pick li em { font: 10px var(--mono, monospace); color: var(--muted, #888); font-style: normal; text-align: right; white-space: nowrap; }
.eq-pick .note { padding: 10px 11px; font: 11px var(--mono, monospace); color: var(--muted, #888); }
.eq-pick footer { padding: 7px 11px; border-top: 1px solid var(--line, #222); font: 10.5px var(--mono, monospace); color: var(--muted, #888); min-height: 14px; }
.eq-pick footer.err { color: var(--red, #e3172b); }
`;
let styled = false;
const style = () => { if (styled) return; styled = true; const s = document.createElement('style'); s.textContent = css; document.head.append(s); };

/* ---------- what fits, best first ---------- */
const st = (h, k) => (h.stats && h.stats[STAT[k]]) || 0;
const scaled = (h, base, list) => base + list.reduce((t, s) => t + Math.min(st(h, s.stat) * s.value / 10, s.max), 0);
const weaponType = (h) => { const set = getHeroWeaponAnimationSet(h, null); return SET_TYPE[set] || set; };
function score(h, x) {
  if (x.weapon) { const a = scaled(h, x.weapon.baseDamage, x.weapon.physicalScaling), s = scaled(h, x.weapon.basePotency, x.weapon.magicalScaling); return Math.max(a, s) + 0.25 * Math.min(a, s); }
  if (x.armor) { const a = x.armor; return a.physicalDefense + Math.min(st(h, 'END') * a.physicalDefenseScalar / 100, a.physicalDefenseScalarMax) + a.magicalDefense + Math.min(st(h, 'WIS') * a.magicalDefenseScalar / 100, a.magicalDefenseScalarMax); }
  if (x.combat !== undefined || x.species) { const b = petInBattle(x).bonus; return b ? b.tier * 100 + (b.kind === 'activatable' ? 50 : b.kind === 'inactive' ? -60 : 0) + Math.min(40, Number(b.value) || 0) : -100; }
  return (x.bonuses || []).reduce((t, b) => t + (Number(b.value) || 0), 0);
}
function candidates(h, slot, pool, visage) {
  const list = slot.kind === 'pet' ? (pool.pets || []) : (pool.gear || []).filter((e) => e.kind === slot.kind);
  if (visage) return list.slice().sort((a, b) => RARITY.indexOf(b.rarity) - RARITY.indexOf(a.rarity) || String(a.name).localeCompare(b.name));
  const t = slot.kind === 'weapon' ? weaponType(h) : null;
  return list.slice().sort((a, b) => (t ? (b.typeName === t) - (a.typeName === t) : 0) || score(h, b) - score(h, a));
}
function describe(x, slot) {
  if (slot.kind === 'pet') { const b = petInBattle(x).bonus; return b ? `${b.name} ${'★'.repeat(b.tier)} · ${b.text}` : 'No combat bonus'; }
  if (x.weapon) return `${x.typeName} · DMG ${x.weapon.baseDamage} · POT ${x.weapon.basePotency} · ${[...x.weapon.physicalScaling, ...x.weapon.magicalScaling].map((q) => `${q.stat} ${q.value / 10}`).join(' ')}`;
  if (x.armor) return `${x.typeName} · P.DEF ${x.armor.physicalDefense} · M.DEF ${x.armor.magicalDefense}`;
  return `${x.typeName || cap(x.kind)} · ${(x.bonuses || []).map((q) => q.text).join(' · ')}`;
}

/* ---------- the picker ---------- */
let open = null;
export function closePicker() { if (open) { open.remove(); open = null; } }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePicker(); });
document.addEventListener('pointerdown', (e) => { if (open && !open.contains(e.target) && !e.target.closest('.dfk-e-equippedIcons')) closePicker(); }, true);

/* opts: { pool: () => ({ gear, pets }) or a Promise of it, or null when the legion is not available;
           chainGear, chainPet: what the chain says the hero wears; onChange(changedHeroKeys) } */
export async function openPicker(anchor, h, slot, opts, startVisage = false) {
  style();
  closePicker();
  const box = el('div', 'eq-pick');
  open = box;
  let visage = startVisage;
  const head = el('header');
  const x = el('button', null, '×'); x.type = 'button'; x.addEventListener('click', closePicker);
  const ttl = el('div'); ttl.append(el('b', null, slot.label), ' ', el('span', null, h.name));
  head.append(ttl, x);
  const tabs = el('div', 'tabs');
  const tabBtn = (label, v) => { const b = el('button', null, label); b.type = 'button'; b.setAttribute('aria-selected', String(visage === v)); b.addEventListener('click', () => { visage = v; tabs.querySelectorAll('button').forEach((n, i) => n.setAttribute('aria-selected', String((i === 1) === visage))); fill(); }); return b; };
  if (slot.kind !== 'pet') tabs.append(tabBtn('Equip', false), tabBtn('Visage', true));
  const q = el('input'); q.type = 'search'; q.placeholder = 'Search name or type'; q.autocomplete = 'off';
  const ul = el('ul');
  const foot = el('footer', null, '');
  box.append(head, tabs, q, ul, foot);
  document.body.append(box);
  place(box, anchor);

  let pool = null;
  ul.append(el('li', 'note', 'Reading the legion…'));
  try { pool = await (typeof opts.pool === 'function' ? opts.pool() : opts.pool); } catch (e) { pool = null; }
  if (open !== box) return;

  function fill() {
    ul.replaceChildren();
    const look = heroLook(h, opts.chainGear, opts.chainPet);
    const field = visage ? `${slot.key}Visage` : slot.key;
    const cur = look.worn[field];
    const hand = slot.key === 'offhand1' ? look.worn.weapon1 : slot.key === 'offhand2' ? look.worn.weapon2 : null;
    const row = (item, name, sub, right, on, disabled, act) => {
      const li = el('li'); const b = el('button', on ? 'on' : null); b.type = 'button'; b.disabled = !!disabled;
      if (item && item.image) { const im = document.createElement('img'); im.src = item.image; im.alt = ''; im.onerror = () => im.replaceWith(el('span', 'ph', '·')); b.append(im); }
      else b.append(el('span', 'ph', item ? (slot.kind === 'pet' ? '◆' : '·') : '∅'));
      const mid = el('span'); mid.append(el('b', null, name), el('small', null, sub || '')); b.append(mid, el('em', null, right || ''));
      b.addEventListener('click', act);
      li.append(b); ul.append(li);
    };
    const run = (item) => () => {
      const r = equip(h, slot.key, item, { visage, chainGear: opts.chainGear, chainPet: opts.chainPet });
      foot.textContent = r.msg; foot.className = r.ok ? '' : 'err';
      if (r.ok) { fill(); if (opts.onChange) opts.onChange(r.changed); }
    };
    row(null, visage ? 'No visage' : 'Empty', visage ? 'the real item shows' : slot.kind === 'pet' ? 'no pet' : slot.kind === 'weapon' || slot.kind === 'armor' ? 'in the Arena: the loaned Squire set' : '', '', !cur, !cur, run(null));
    if (!pool) { ul.append(el('li', 'note', `Open the legion of this hero once in the Legion Viewer: its gear and pets are read from there.`)); return; }
    const needle = q.value.trim().toLowerCase();
    let list = candidates(h, slot, pool, visage);
    if (needle) list = list.filter((it) => `${it.name} ${it.typeName || ''} ${it.species ? it.species.name : ''} ${it.combat && it.combat.revealed ? it.combat.name : ''}`.toLowerCase().includes(needle));
    if (!list.length) { ul.append(el('li', 'note', needle ? 'Nothing matches.' : `No ${slot.kind === 'pet' ? 'pets' : `${slot.kind}s`} in this legion.`)); return; }
    for (const it of list.slice(0, 120)) {
      const on = cur && itemKey(cur) === itemKey(it);
      const w = !on && wearerOf(it);
      let right = slot.kind === 'pet' ? cap(it.rarity) : `lv ${it.equipRequirement || 1}+`;
      let disabled = false;
      if (!visage && slot.kind !== 'pet' && (it.equipRequirement || 0) > h.level) disabled = true;
      if (!visage && hand && twoHanded(hand)) disabled = true;
      if (w && w.hero) right = `on ${String(w.hero.name).split(' ')[0]}`;
      row(it, it.name, describe(it, slot), right, on, disabled, run(it));
    }
    if (list.length > 120) ul.append(el('li', 'note', `${list.length - 120} more: search to narrow.`));
  }
  q.addEventListener('input', fill);
  fill();
  setTimeout(() => q.focus(), 0);
}
function place(box, anchor) {
  const r = anchor.getBoundingClientRect();
  const w = Math.min(380, innerWidth - 16);
  let left = r.right + 12;
  if (left + w > innerWidth - 8) left = Math.max(8, r.left - w - 12);
  box.style.left = `${left}px`;
  box.style.top = `${Math.max(8, Math.min(innerHeight - Math.min(560, innerHeight * 0.8) - 8, r.top - 40))}px`;
}

/* Turn the seven slot icons of a card into buttons. root: the card element (or anything containing it). */
export function hookCardIcons(root, h, opts) {
  style();
  const icons = root.querySelectorAll('.dfk-e-equippedIcons button');
  if (icons.length < SLOTS.length) return false;
  const look = heroLook(h, opts.chainGear, opts.chainPet);
  SLOTS.forEach((slot, i) => {
    const b = icons[i];
    if (b.dataset.eq) return;
    b.dataset.eq = slot.key;
    const v = look.worn[slot.key], vv = slot.kind === 'pet' ? null : look.worn[`${slot.key}Visage`];
    b.title = `${slot.label}: ${v ? v.name : 'empty'}${vv ? ` · looks like ${vv.name}` : ''} (click to change)`;
    b.setAttribute('aria-label', b.title);
    b.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); openPicker(b, h, slot, opts); });
  });
  return true;
}
