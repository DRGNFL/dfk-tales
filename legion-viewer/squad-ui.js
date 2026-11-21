/* Legion Viewer — Arena squad mode: a + on every hero card and a tray with the two teams.
   Heroes go to the Arena as they are equipped: gear and pet are set on the hero, from the slot icons of its card
   (../assets/armory.js). In the tray the same icons show what each hero wears, and open the same picker.
   The squad itself lives in ../assets/squad.js and is shared with the Arena. */
import { readSquad, onSquadChange, toggleHero, select, setCap, clearField, swapTeams, clearSquad, findHero, isComplete, CAPS } from '../assets/squad.js?v=2';
import { SLOTS, heroLook, onArmoryChange } from '../assets/armory.js?v=1';
import { openPicker } from '../assets/equip-ui.js?v=1';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const cap = (s) => (s ? String(s)[0].toUpperCase() + String(s).slice(1) : '');
const same = (a, b) => !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase();
const items = new WeakMap();
let open = false, lastMsg = '', pool = () => ({ pets: [], gear: [], addr: null });

const css = `
body.sq-on { padding-bottom: 140px; }
.sq-add { display: none; position: absolute; z-index: 6; top: 8px; right: 8px; width: 30px; height: 30px; padding: 0; border: 1px solid var(--text); background: rgba(0,0,0,.82); color: var(--text); font: 700 18px/1 var(--mono); cursor: pointer; }
body.sq-on .sq-add { display: grid; place-items: center; }
.sq-add:hover { background: var(--text); color: #000; }
.sq-add.in { background: var(--red); border-color: var(--red); color: #fff; }
.sq-add[disabled] { opacity: .35; cursor: not-allowed; }
.slot { position: relative; }
.sq-toggle { margin-left: auto; border-color: var(--red) !important; color: #ff9aa3; }
.sq-toggle[aria-pressed="true"] { background: var(--red) !important; color: #fff !important; }
.sq-tray { position: fixed; z-index: 40; left: 0; right: 0; bottom: 0; background: #050505; border-top: 1px solid var(--line-2); padding: 10px 16px; display: grid; grid-template-columns: 150px auto auto minmax(110px, 1fr); gap: 14px; align-items: start; overflow-x: auto; box-shadow: 0 -12px 30px rgba(0,0,0,.6); }
.sq-tray[hidden] { display: none; }
.sq-side { display: grid; gap: 6px; }
.sq-side h2 { margin: 0; font: 700 14px var(--display); letter-spacing: .12em; text-transform: uppercase; }
.sq-caps { display: flex; gap: 3px; flex-wrap: wrap; }
.sq-caps button { padding: 2px 6px; font-size: 10.5px; }
.sq-caps button[aria-pressed="true"] { background: var(--text); border-color: var(--text); color: #000; }
.sq-msg { font: 10.5px var(--mono); color: var(--muted); }
.sq-team { display: grid; gap: 4px; }
.sq-team > b { font: 600 10px var(--display); letter-spacing: .16em; text-transform: uppercase; }
.sq-team.b > b { color: var(--red); }
.sq-slots { display: grid; grid-template-columns: repeat(3, 162px); gap: 5px; }
.sq-slot { border: 1px dashed var(--line-2); background: #0a0a0a; padding: 6px 7px; display: grid; gap: 4px; align-content: start; min-height: 84px; cursor: pointer; position: relative; }
.sq-slot.full { border-style: solid; }
.sq-slot.sel { outline: 2px solid var(--text); outline-offset: 1px; }
.sq-team.b .sq-slot.sel { outline-color: var(--red); }
.sq-slot .x { position: absolute; top: 2px; right: 3px; border: 0; background: none; color: var(--muted); padding: 0 3px; font: 13px var(--mono); cursor: pointer; }
.sq-slot .x:hover { color: var(--red); }
.sq-slot .nm { font: 600 12px var(--display); letter-spacing: .04em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 12px; }
.sq-slot .cl { font: 10px var(--mono); color: var(--muted); margin-top: -3px; }
.sq-slot .cl.over { color: var(--red); }
.sq-slot .empty { font: 10.5px var(--mono); color: var(--muted); margin-top: 12px; }
.kit { display: flex; gap: 3px; }
.kit button { width: 20px; height: 20px; padding: 0; border: 1px solid #262626; background: #000; display: grid; place-items: center; cursor: pointer; }
.kit button:hover { border-color: var(--text); }
.kit button.on { border-color: #555; }
.kit button img { width: 18px; height: 18px; image-rendering: pixelated; }
.kit button span { font: 9px var(--mono); color: #444; }
.kit button.on span { color: #ffd34d; }
.sq-go { display: grid; gap: 6px; justify-items: end; align-content: start; }
.sq-go .sq-msg { text-align: right; }
.sq-go .small { display: flex; gap: 5px; flex-wrap: wrap; justify-content: flex-end; }
.sq-go .small button { font-size: 10.5px; padding: 3px 7px; }
.sq-go a.play { display: inline-block; padding: 9px 18px; background: var(--red); color: #fff; font: 700 13px var(--display); letter-spacing: .14em; text-transform: uppercase; text-decoration: none; border: 1px solid var(--red); }
.sq-go a.play.off { background: none; color: var(--muted); border-color: var(--line-2); pointer-events: none; }
`;

/* + on a hero card. */
export function decorate(kind, entry) {
  if (kind !== 'heroes') return;
  let b = entry.slot.querySelector(':scope > .sq-add');
  if (!b) {
    b = el('button', 'sq-add', '+'); b.type = 'button';
    items.set(b, entry.item);
    b.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); lastMsg = toggleHero(items.get(b)).msg; renderTray(); });
  }
  entry.slot.append(b); // after a remount the card's children are replaced: put it back on top
  paintButton(b, readSquad());
}
function paintButton(b, s) {
  const h = items.get(b);
  b.disabled = false; b.className = 'sq-add';
  const there = findHero(s, h);
  if (there) { b.textContent = '✓'; b.classList.add('in'); b.title = `In the ${there.team === 'A' ? 'left' : 'right'} team at P${there.i + 1}: click to take out`; }
  else if (h.level > s.cap) { b.textContent = '+'; b.disabled = true; b.title = `Level ${h.level}: above the level cap ${s.cap}`; }
  else { b.textContent = '+'; b.title = 'Add to the Arena squad, as it is equipped'; }
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
  side.append(caps, el('div', 'sq-msg', lastMsg || 'Click + on a hero. It fights with what it wears: equip it from the icons around its portrait.'));
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
  const n = ['A', 'B'].reduce((acc, k) => acc + s.teams[k].filter(Boolean).length, 0);
  go.append(play, el('div', 'sq-msg', isComplete(s) ? 'Ready: on to the Arena.' : `${n} / 6 heroes${n === 6 ? ' · someone is above the cap' : ''}`), small);
  tray.replaceChildren(side, ...teams, go);
}
function slotCard(s, team, i, slot) {
  const card = el('div', `sq-slot${slot ? ' full' : ''}${s.sel.team === team && s.sel.i === i ? ' sel' : ''}`);
  card.addEventListener('click', () => { select(team, i); renderTray(); });
  if (!slot) { card.append(el('div', 'nm', `P${i + 1}`), el('div', 'empty', s.sel.team === team && s.sel.i === i ? '+ a hero from the grid' : 'empty')); return card; }
  const h = slot.hero;
  const x = el('button', 'x', '×'); x.type = 'button'; x.title = `Take ${h.name} out`;
  x.addEventListener('click', (e) => { e.stopPropagation(); clearField(team, i, 'hero'); lastMsg = `${h.name} left the squad.`; renderTray(); });
  const over = h.level > s.cap;
  card.append(x, el('div', 'nm', `P${i + 1} ${h.name}`), el('div', `cl${over ? ' over' : ''}`, `${cap(h.class)} · Lv ${h.level}${over ? ` > cap ${s.cap}` : ''}`));
  card.title = h.name;
  // What it wears, in the card's order; a click opens the same picker as the card.
  const worn = heroLook(h).worn;
  const kit = el('div', 'kit');
  for (const sl of SLOTS) {
    const v = worn[sl.key];
    const b = el('button', v ? 'on' : null); b.type = 'button';
    if (v && v.image) { const img = document.createElement('img'); img.src = v.image; img.alt = ''; img.onerror = () => img.replaceWith(el('span', null, '•')); b.append(img); }
    else b.append(el('span', null, sl.kind === 'pet' ? (v ? '◆' : '◇') : '·'));
    b.title = `${sl.label}: ${v ? v.name : 'empty'}`;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const P = pool();
      const mine = P.addr && same(P.addr, h.owner);
      openPicker(b, h, sl, { pool: mine ? { gear: P.gear, pets: P.pets } : null });
    });
    kit.append(b);
  }
  card.append(kit);
  return card;
}
function setOpen(v) {
  open = v;
  try { sessionStorage.setItem('dfk-tales:squad-open', v ? '1' : '0'); } catch (e) {}
  renderTray();
}

/* getPool: () => ({ pets, gear, addr }) of the legion on screen. */
export function mountSquad(getPool) {
  if (getPool) pool = getPool;
  const st = document.createElement('style'); st.textContent = css; document.head.append(st);
  tray = el('div', 'sq-tray'); tray.hidden = true; document.body.append(tray);
  const t = document.getElementById('btn-squad');
  if (t) t.addEventListener('click', () => setOpen(!open));
  let start = new URLSearchParams(location.search).get('squad') === '1';
  try { if (sessionStorage.getItem('dfk-tales:squad-open') === '1') start = true; } catch (e) {}
  open = start;
  onSquadChange(() => renderTray());
  onArmoryChange(() => renderTray());
  renderTray();
}
