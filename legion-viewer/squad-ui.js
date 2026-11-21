/* Legion Viewer — Arena squad mode: a + on every hero, pet and piece of gear, and a tray with the two teams.
   The squad itself lives in ../assets/squad.js and is shared with the Arena. */
import { readSquad, onSquadChange, toggleHero, toggleItem, select, setCap, clearField, swapTeams, clearSquad, findHero, findItem, isComplete, CAPS } from '../assets/squad.js?v=1';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const cap = (s) => (s ? String(s)[0].toUpperCase() + String(s).slice(1) : '');
const FIELD = { weapon: 'weapon', armor: 'armor', offhand: 'offhand', accessory: 'accessory' };
const ROWS = [['pet', 'PET'], ['weapon', 'WPN'], ['armor', 'ARM'], ['offhand', 'OFF'], ['accessory', 'ACC']];
const items = new WeakMap();
let open = false, lastMsg = '';

const css = `
body.sq-on { padding-bottom: 196px; }
.sq-add { display: none; position: absolute; z-index: 6; top: 8px; right: 8px; width: 30px; height: 30px; padding: 0; border: 1px solid var(--text); background: rgba(0,0,0,.82); color: var(--text); font: 700 18px/1 var(--mono); cursor: pointer; }
body.sq-on .sq-add { display: grid; place-items: center; }
.sq-add:hover { background: var(--text); color: #000; }
.sq-add.in { background: var(--red); border-color: var(--red); color: #fff; }
.sq-add.other { border-style: dashed; color: var(--muted); }
.sq-add[disabled] { opacity: .35; cursor: not-allowed; }
.slot { position: relative; }
.sq-toggle { margin-left: auto; border-color: var(--red) !important; color: #ff9aa3; }
.sq-toggle[aria-pressed="true"] { background: var(--red) !important; color: #fff !important; }
.sq-tray { position: fixed; z-index: 40; left: 0; right: 0; bottom: 0; background: #050505; border-top: 1px solid var(--line-2); padding: 10px 16px 12px; display: grid; grid-template-columns: 160px auto auto minmax(110px, 1fr); gap: 12px; align-items: start; overflow-x: auto; box-shadow: 0 -12px 30px rgba(0,0,0,.6); }
.sq-tray[hidden] { display: none; }
.sq-side { display: grid; gap: 7px; }
.sq-side h2 { margin: 0; font: 700 15px var(--display); letter-spacing: .12em; text-transform: uppercase; }
.sq-caps { display: flex; gap: 4px; flex-wrap: wrap; }
.sq-caps button { padding: 3px 7px; font-size: 11px; }
.sq-caps button[aria-pressed="true"] { background: var(--text); border-color: var(--text); color: #000; }
.sq-msg { font: 11px var(--mono); color: var(--muted); min-height: 2.6em; }
.sq-team { display: grid; gap: 5px; }
.sq-team > b { font: 600 10.5px var(--display); letter-spacing: .16em; text-transform: uppercase; }
.sq-team.b > b { color: var(--red); }
.sq-slots { display: grid; grid-template-columns: repeat(3, 146px); gap: 5px; }
.sq-slot { border: 1px dashed var(--line-2); background: #0a0a0a; padding: 6px 7px; display: grid; gap: 2px; align-content: start; min-height: 132px; cursor: pointer; text-align: left; }
.sq-slot.full { border-style: solid; }
.sq-slot.sel { outline: 2px solid var(--text); outline-offset: 1px; }
.sq-team.b .sq-slot.sel { outline-color: var(--red); }
.sq-slot .top { display: flex; justify-content: space-between; font: 600 10px var(--display); letter-spacing: .14em; color: var(--muted); }
.sq-slot .x { border: 0; background: none; color: var(--muted); padding: 0 2px; font: 13px var(--mono); cursor: pointer; }
.sq-slot .x:hover { color: var(--red); }
.sq-slot .nm { font: 600 12.5px var(--display); letter-spacing: .04em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sq-slot .cl { font: 10.5px var(--mono); color: var(--muted); }
.sq-slot .cl.over { color: var(--red); }
.sq-slot .ln { display: grid; grid-template-columns: 28px 1fr; gap: 4px; font: 10.5px var(--mono); color: #cfcfcf; }
.sq-slot .ln i { font-style: normal; color: var(--muted); }
.sq-slot .ln span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sq-slot .ln.set span { cursor: pointer; }
.sq-slot .ln.set span:hover { color: var(--red); text-decoration: line-through; }
.sq-slot .ln.none span { color: #555; }
.sq-slot .empty { font: 11px var(--mono); color: var(--muted); margin-top: 18px; }
.sq-go { display: grid; gap: 6px; justify-items: end; align-content: start; }
.sq-go .sq-msg { text-align: right; }
.sq-go .small { flex-wrap: wrap; justify-content: flex-end; }
.sq-go a.play { display: inline-block; padding: 9px 18px; background: var(--red); color: #fff; font: 700 13px var(--display); letter-spacing: .14em; text-transform: uppercase; text-decoration: none; border: 1px solid var(--red); }
.sq-go a.play.off { background: none; color: var(--muted); border-color: var(--line-2); pointer-events: none; }
.sq-go .small { display: flex; gap: 6px; }
.sq-go .small button { font-size: 11px; padding: 3px 8px; }
`;

/* + on a card. kind: heroes | pets | gear (items get none). */
export function decorate(kind, entry) {
  if (kind !== 'heroes' && kind !== 'pets' && kind !== 'gear') return;
  if (kind === 'gear' && !FIELD[entry.item.kind]) return;
  let b = entry.slot.querySelector(':scope > .sq-add');
  if (!b) {
    b = el('button', 'sq-add', '+'); b.type = 'button';
    items.set(b, { kind, item: entry.item });
    b.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); press(b); });
  }
  entry.slot.append(b); // after a remount the card's children are replaced: put it back on top
  paintButton(b, readSquad());
}
function press(b) {
  const { kind, item } = items.get(b);
  const r = kind === 'heroes' ? toggleHero(item) : toggleItem(item, kind === 'pets' ? 'pet' : FIELD[item.kind]);
  lastMsg = r.msg;
  renderTray();
}
function paintButton(b, s) {
  const { kind, item } = items.get(b);
  b.disabled = false; b.className = 'sq-add';
  if (kind === 'heroes') {
    const there = findHero(s, item);
    if (there) { b.textContent = '✓'; b.classList.add('in'); b.title = `In the ${there.team === 'A' ? 'left' : 'right'} team at P${there.i + 1}: click to take out`; }
    else if (item.level > s.cap) { b.textContent = '+'; b.disabled = true; b.title = `Level ${item.level}: above the level cap ${s.cap}`; }
    else { b.textContent = '+'; b.title = 'Add to the Arena squad'; }
    return;
  }
  const field = kind === 'pets' ? 'pet' : FIELD[item.kind];
  const sel = s.teams[s.sel.team][s.sel.i];
  const there = findItem(s, item, field);
  if (there && sel && there.team === s.sel.team && there.i === s.sel.i) { b.textContent = '✓'; b.classList.add('in'); b.title = `With ${sel.hero.name}: click to take back`; }
  else if (there) { b.textContent = '+'; b.classList.add('other'); b.title = `With ${s.teams[there.team][there.i].hero.name}: click to move it to the selected hero`; }
  else { b.textContent = '+'; b.title = sel ? `Give to ${sel.hero.name}` : 'Select a hero in the squad first'; }
}
const paintAll = (s) => document.querySelectorAll('.sq-add').forEach((b) => items.has(b) && paintButton(b, s));

/* ---------- tray ---------- */
let tray;
function renderTray() {
  const s = readSquad();
  paintAll(s);
  if (!tray) return;
  tray.hidden = !open;
  document.body.classList.toggle('sq-on', open);
  const t = document.getElementById('btn-squad');
  if (t) t.setAttribute('aria-pressed', String(open));
  if (!open) return;
  const side = el('div', 'sq-side');
  side.append(el('h2', null, 'Arena squad'));
  const caps = el('div', 'sq-caps');
  for (const c of CAPS) { const b = el('button', null, `Lv ${c}`); b.type = 'button'; b.setAttribute('aria-pressed', String(c === s.cap)); b.addEventListener('click', () => { setCap(c); lastMsg = `Level cap ${c}.`; renderTray(); }); caps.append(b); }
  side.append(caps, el('div', 'sq-msg', lastMsg || 'Click a slot, then + on heroes, pets and gear. The right team can come from another legion: load it and keep adding.'));
  const teams = ['A', 'B'].map((team) => {
    const box = el('div', `sq-team ${team.toLowerCase()}`);
    box.append(el('b', null, team === 'A' ? 'Left team' : 'Right team'));
    const row = el('div', 'sq-slots');
    s.teams[team].forEach((slot, i) => row.append(slotCard(s, team, i, slot)));
    box.append(row);
    return box;
  });
  const go = el('div', 'sq-go');
  const play = el('a', `play${isComplete(s) ? '' : ' off'}`, 'Play ▸');
  play.href = '../arena/';
  const small = el('div', 'small');
  const sw = el('button', null, 'Swap sides'); sw.type = 'button'; sw.addEventListener('click', () => { swapTeams(); renderTray(); });
  const cl = el('button', null, 'Clear'); cl.type = 'button'; cl.addEventListener('click', () => { clearSquad(); lastMsg = 'Squad cleared.'; renderTray(); });
  const hide = el('button', null, 'Hide'); hide.type = 'button'; hide.addEventListener('click', () => setOpen(false));
  small.append(sw, cl, hide);
  const n = ['A', 'B'].reduce((t, k) => t + s.teams[k].filter(Boolean).length, 0);
  go.append(play, el('div', 'sq-msg', isComplete(s) ? 'Both teams ready: on to the Arena for the Codex.' : `${n} / 6 heroes${n === 6 ? ' · someone is above the cap' : ''}`), small);
  tray.replaceChildren(side, ...teams, go);
}
function slotCard(s, team, i, slot) {
  const card = el('div', `sq-slot${slot ? ' full' : ''}${s.sel.team === team && s.sel.i === i ? ' sel' : ''}`);
  card.addEventListener('click', () => { select(team, i); renderTray(); });
  const top = el('div', 'top');
  top.append(el('span', null, `P${i + 1}`));
  if (slot) {
    const x = el('button', 'x', '×'); x.type = 'button'; x.title = `Take ${slot.hero.name} out`;
    x.addEventListener('click', (e) => { e.stopPropagation(); clearField(team, i, 'hero'); lastMsg = `${slot.hero.name} left the squad.`; renderTray(); });
    top.append(x);
  }
  card.append(top);
  if (!slot) { card.append(el('div', 'empty', s.sel.team === team && s.sel.i === i ? '+ a hero from the grid' : 'empty')); return card; }
  const h = slot.hero;
  card.append(el('div', 'nm', h.name));
  card.title = h.name;
  const over = h.level > s.cap;
  card.append(el('div', `cl${over ? ' over' : ''}`, `${cap(h.class)} · Lv ${h.level}${over ? ` > cap ${s.cap}` : ''}`));
  for (const [field, label] of ROWS) {
    const v = slot[field];
    const ln = el('div', `ln ${v ? 'set' : 'none'}`);
    const span = el('span', null, v ? (field === 'pet' && v.combat && v.combat.revealed ? `${v.name} · ${v.combat.name}` : v.name) : field === 'weapon' ? 'loaned Squire' : field === 'armor' ? 'loaned Medium' : '—');
    if (v) { span.title = `Take ${v.name} back`; span.addEventListener('click', (e) => { e.stopPropagation(); clearField(team, i, field); lastMsg = `${v.name} taken back.`; renderTray(); }); }
    ln.append(el('i', null, label), span);
    card.append(ln);
  }
  return card;
}
function setOpen(v) {
  open = v;
  try { sessionStorage.setItem('dfk-tales:squad-open', v ? '1' : '0'); } catch (e) {}
  renderTray();
}

export function mountSquad() {
  const st = document.createElement('style'); st.textContent = css; document.head.append(st);
  tray = el('div', 'sq-tray'); tray.hidden = true; document.body.append(tray);
  const t = document.getElementById('btn-squad');
  if (t) t.addEventListener('click', () => setOpen(!open));
  let start = new URLSearchParams(location.search).get('squad') === '1';
  try { if (sessionStorage.getItem('dfk-tales:squad-open') === '1') start = true; } catch (e) {}
  open = start;
  onSquadChange(() => renderTray());
  renderTray();
}
