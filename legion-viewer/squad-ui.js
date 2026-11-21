/* Legion Viewer — choosing a hero for the Arena, the old DFK way: select a place, then a hero.
   The Arena opens this page as ?pick=1 (2, 3): a bar on top says which place you are choosing, the Level filter
   is set to the squad's cap, and every hero card gets a PICK button. A pick puts the hero in that place
   (swapping places if it was already in the squad) and goes back to the Arena.
   Gear and pet stay on the hero (../assets/armory.js); the squad itself lives in ../assets/squad.js. */
import { readSquad, findHero, placeHero } from '../assets/squad.js?v=4';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const items = new WeakMap();
const ARENA = new URL('../arena/', location.href).href;
const pickParam = Number(new URLSearchParams(location.search).get('pick'));
/* 0, 1, 2 for P1, P2, P3; null when the page was not opened to pick. */
export const pickSlot = pickParam >= 1 && pickParam <= 3 ? pickParam - 1 : null;
export const pickCap = () => readSquad().cap;

const css = `
.pick-bar { position: sticky; top: 52px; z-index: 19; display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 10px 18px; background: #12030a; border-bottom: 1px solid var(--red); }
.pick-bar b { font: 700 16px var(--display); letter-spacing: .14em; text-transform: uppercase; }
.pick-bar b em { font-style: normal; color: var(--red); }
.pick-bar span { font: 12px var(--mono); color: #d0a8ad; }
.pick-bar a { margin-left: auto; padding: 7px 12px; border: 1px solid var(--line-2); color: var(--text); text-decoration: none; font: 600 11px var(--display); letter-spacing: .12em; text-transform: uppercase; }
.pick-bar a:hover { border-color: var(--text); }
.slot { position: relative; }
.sq-pick { position: absolute; z-index: 6; top: 8px; right: 8px; padding: 6px 10px; border: 1px solid var(--red); background: var(--red); color: #fff; font: 700 11px var(--display); letter-spacing: .14em; text-transform: uppercase; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.6); }
.sq-pick:hover { background: #ff2438; }
.sq-pick.here { background: #000; color: var(--text); border-color: var(--text); }
.sq-pick.other { background: rgba(0,0,0,.85); border-color: var(--red); color: #ffb3ba; }
.sq-pick[disabled] { opacity: .4; cursor: not-allowed; background: #000; border-color: #444; color: #888; }
@media (max-width: 700px) { .pick-bar { top: 0; position: relative; } }
`;

/* The PICK button on a hero card. */
export function decorate(kind, entry) {
  if (kind !== 'heroes' || pickSlot == null) return;
  let b = entry.slot.querySelector(':scope > .sq-pick');
  if (!b) {
    b = el('button', 'sq-pick'); b.type = 'button';
    items.set(b, entry.item);
    b.addEventListener('click', (e) => {
      e.stopPropagation(); e.preventDefault();
      const r = placeHero(pickSlot, items.get(b));
      if (r.ok) location.href = `${ARENA}?p=${pickSlot + 1}`;
      else { b.textContent = 'Above cap'; b.title = r.msg; }
    });
  }
  entry.slot.append(b); // after a remount the card's children are replaced: put it back on top
  paint(b, readSquad());
}
function paint(b, s) {
  const h = items.get(b);
  const there = findHero(s, h);
  b.disabled = false; b.className = 'sq-pick';
  if (h.level > s.cap) { b.disabled = true; b.textContent = `Lv ${h.level}`; b.title = `Above the level cap ${s.cap}`; }
  else if (there && there.i === pickSlot) { b.classList.add('here'); b.textContent = `In P${pickSlot + 1}`; b.title = 'Already in this place: click to keep it'; }
  else if (there) { b.classList.add('other'); b.textContent = `P${there.i + 1} ⇄ P${pickSlot + 1}`; b.title = `In P${there.i + 1}: picking it swaps the two places`; }
  else { b.textContent = `Pick for P${pickSlot + 1}`; b.title = `Put ${h.name} in P${pickSlot + 1} and go back to the Arena`; }
}

/* In pick mode: the Level filter starts at the squad's cap (levels above it cannot fight). */
export function pickPreset(sec) {
  if (pickSlot == null || sec.key !== 'heroes') return;
  sec.rng.level = { min: sec.rng.level ? sec.rng.level.min : null, max: Math.min(pickCap(), sec.rng.level && sec.rng.level.max != null ? sec.rng.level.max : 99) };
}

export function mountSquad() {
  const st = document.createElement('style'); st.textContent = css; document.head.append(st);
  // The old tray toggle now goes to the Arena, where the squad is built.
  const t = document.getElementById('btn-squad');
  if (t) { t.textContent = 'Arena ▸'; t.title = 'Your Arena squad: choose each hero from its place'; t.addEventListener('click', () => { location.href = ARENA; }); }
  if (pickSlot == null) return;
  const s = readSquad();
  const cur = s.teams.A[pickSlot];
  const bar = el('div', 'pick-bar');
  const b = el('b'); b.append('Arena · choosing ', el('em', null, `P${pickSlot + 1}`));
  bar.append(b, el('span', null, `${cur ? `now ${cur.hero.name} · ` : ''}level cap ${s.cap} · press PICK on a hero`));
  const back = el('a', null, 'Back to the Arena'); back.href = ARENA;
  bar.append(back);
  const top = document.querySelector('.topbar');
  if (top) top.after(bar); else document.body.prepend(bar);
  document.title = `Pick P${pickSlot + 1} · ${document.title}`;
}
