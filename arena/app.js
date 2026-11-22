import { getAssetConfig } from 'https://esm.sh/@defikingdoms/game-sdk@0.1.0?deps=ethers@5.8.0';
import {
  HeroRenderer, HERO_ANIMATIONS, getHeroWeaponAnimationSet, weaponAnimation, createAnimatedHeroCard,
} from 'https://esm.sh/@defikingdoms/game-sdk@0.1.0/renderer?deps=ethers@5.8.0';
import { mountWallet, readLegion, getWallet, hasProvider, connectWallet, shortAddr } from '../assets/session.js?v=1';
import { loadLegion, isAddr, CHAINS } from '../assets/legion.js?v=1';
import { readSquad, onSquadChange, setSkills, isComplete, setCap, CAPS } from '../assets/squad.js?v=4';
import { heroLook, heroKey, onArmoryChange } from '../assets/armory.js?v=1';
import { hookCardIcons } from '../assets/equip-ui.js?v=1';
import { ACT_AT, makeRng, codexBudget } from './engine.js?v=1';
import * as C from './combat.js?v=7';
import { CLASS_SKILLS } from './skills.js?v=3';
import * as AI from './ai.js?v=3';
import { traitsOf } from './traits.js?v=2';
import { svg, iconOf, imgOf, classImg, statusImg } from './icons.js?v=2';
import * as VFX from './vfx.js?v=2';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const cap = (s) => (s ? String(s)[0].toUpperCase() + String(s).slice(1) : '');
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const img = (src, cls) => { const i = document.createElement('img'); i.src = src; i.alt = ''; if (cls) i.className = cls; i.decoding = 'async'; return i; };
const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };
const plain = (v) => JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? x.toString() : x)));
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const CODEX = (cls) => CLASS_SKILLS[String(cls).toLowerCase()];
const TIER_OPENS = [0, 1, 3, 6, 10, 15]; // level at which each Codex tier opens (1 point per level, tier N costs N)
mountWallet($('#wallet'));

/* Battle state (declared first: the setup reads it). */
let battle = null;
let opponent = null;   // the computer's squad, kept for a rematch
let scene = null;
let pending = null;    // { skill } or { skill: null } for the Basic Attack
let handId = null;     // the hero whose skills are on the action bar (always one of yours)
let geo = { W: 0, H: 0, u: 0 };
/* Two players. duel: the match with a friend (the duel.js link and where it stands), null against the AI.
   In the battle engine the one who opened the challenge is team A and the one who joined is team B; on the page
   your heroes are always on the left: vis() turns an engine team into a page side ('A' = yours). */
let duel = null;
let mySide = 'A';
const isMine = (f) => f.team === mySide;
const vis = (t) => (t === mySide ? 'A' : 'B');
const BUILD = 'arena-0.7'; // both browsers must run the same Arena: the same code computes the same battle
const TURN_S = 40, LATE_S = 25; // seconds to choose a move; how long past that we wait for a friend before calling them gone
let clock = null;
/* The live link (duel.js and PeerJS) loads only when a challenge is opened or accepted: if it cannot load, the AI still plays. */
let DUEL = null;
const duelLib = async () => DUEL || (DUEL = await import('./duel.js?v=1'));
const NO_LIB = 'The live mode could not load (PeerJS): check the connection or a blocker in the browser, then reload the page.';
/* The challenge you opened or were sent, kept in this tab (sessionStorage) so a trip to the Legion Viewer does not lose it.
   A link ?duel=code&cap=15&by=0xab…cd makes you the guest of that challenge. */
const DUEL_KEY = 'dfk-tales:duel';
const intent = {
  get() { try { const v = JSON.parse(sessionStorage.getItem(DUEL_KEY) || 'null'); return v && Date.now() - v.at < 6 * 3600e3 ? v : null; } catch (e) { return null; } },
  set(v) { try { if (v) sessionStorage.setItem(DUEL_KEY, JSON.stringify(v)); else sessionStorage.removeItem(DUEL_KEY); } catch (e) { /* private mode */ } },
};
{
  const q = new URLSearchParams(location.search);
  if (/^[a-z0-9]{6}$/.test(q.get('duel') || '')) {
    const c = Number(q.get('cap'));
    intent.set({ role: 'guest', code: q.get('duel'), cap: CAPS.includes(c) ? c : 15, by: String(q.get('by') || '').slice(0, 24), at: Date.now() });
    for (const k of ['duel', 'cap', 'by']) q.delete(k);
    history.replaceState(null, '', location.pathname + (q.toString() ? `?${q}` : ''));
  }
  const it = intent.get();
  if (it) {
    duel = { ...it, state: it.role === 'host' ? 'opening' : 'choosing', link: null, them: null, err: null, busy: false };
    if (readSquad().cap !== it.cap) setCap(it.cap);
  }
}

/* ================= scenes =================
   Every scene of the game's hero cards: 55 x 52 pixel art, most of them animated GIFs, a few with a front layer
   (grass, fog, snow) drawn over the heroes' feet; the light beams and the mist are drawn faint, as on the card
   (frontOpacity: the card's CSS has 0.1 and 0.2). Our own scenes will go in SCENES with dir, w and h.
   dim: how much the scene is calmed behind the heroes (darker, less contrast, a little less colour), 0 to 1.
   Default 1; 0 for the scenes already dark or very light, which Ge found work as they are (22/11). */
const BG = `${getAssetConfig().assetsBaseUrl}/hero-card/assets/images/hero/backgrounds/`;
const SCENES = [
  { id: 'colosseum', name: 'Colosseum', base: 'colosseum.gif', group: 'card' },
  { id: 'plains', name: 'Plains', base: 'plains.png', front: 'plains-front.gif', group: 'card' },
  { id: 'forest', name: 'Forest', base: 'forest.gif', front: 'forest-front.png', group: 'card' },
  { id: 'desert', name: 'Desert', base: 'desert.gif', front: 'desert-front.png', group: 'card' },
  { id: 'swamp', name: 'Swamp', base: 'swamp.gif', front: 'swamp-front.png', group: 'card' },
  { id: 'island', name: 'Island', base: 'island.gif', group: 'card', dim: 0 },
  { id: 'mountains', name: 'Mountains', base: 'mountain.gif', group: 'card' },
  { id: 'arctic', name: 'Arctic', base: 'arctic.gif', group: 'card', dim: 0 },
  { id: 'city', name: 'City', base: 'city.gif', group: 'card' },
  { id: 'fields', name: 'Golden Fields', base: 'plains-back.gif', group: 'back' },
  { id: 'deepwood', name: 'Deep Forest', base: 'forest-back.gif', front: 'forest-front.gif', group: 'back', dim: 0 },
  { id: 'dunes', name: 'Desert Night', base: 'desert-back.gif', group: 'back' },
  { id: 'snowtown', name: 'Snow Town', base: 'city-back.gif', group: 'back', dim: 0 },
  { id: 'peaks', name: 'Snow Peaks', base: 'arctic-back.gif', front: 'arctic-front.gif', group: 'back', dim: 0 },
  { id: 'lake', name: 'Lilac Lake', base: 'island-back.gif', group: 'back', dim: 0 },
  { id: 'cave', name: 'Cave Mouth', base: 'mountains-back.png', front: 'mountains-front.gif', frontOpacity: 0.1, group: 'back' },
  { id: 'darkwood', name: 'Misty Woods', base: 'swamp-back.gif', front: 'swamp-front.gif', frontOpacity: 0.2, group: 'back', dim: 0 },
];
const SCENE_KEY = 'dfk-tales:arena-scene';
const sceneChoice = () => store.get(SCENE_KEY) || 'colosseum';
const sceneUrl = (sc, file) => `${sc.dir || BG}${file}`;
const sceneFilter = (sc) => { const d = sc.dim == null ? 1 : sc.dim; return d ? `brightness(${(1 - 0.28 * d).toFixed(2)}) contrast(${(1 - 0.18 * d).toFixed(2)}) saturate(${(1 - 0.12 * d).toFixed(2)})` : ''; };
function pickScene() {
  const c = sceneChoice();
  if (c === 'random') return SCENES[Math.floor(Math.random() * SCENES.length)];
  return SCENES.find((x) => x.id === c) || SCENES[0];
}

/* ---------- tooltip ---------- */
const tip = $('#tip');
function showTip(anchor, name, meta, text, why) {
  tip.replaceChildren(el('b', null, name));
  if (meta) tip.append(el('small', null, meta));
  if (text) tip.append(el('p', null, text));
  if (why) tip.append(el('p', 'why', why));
  tip.hidden = false;
  const r = anchor.getBoundingClientRect();
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
  tip.style.top = `${r.top - h - 8 < 8 ? r.bottom + 8 : r.top - h - 8}px`;
}
const hideTip = () => { tip.hidden = true; };
const tipOn = (node, fn) => { node.addEventListener('mouseenter', () => fn()); node.addEventListener('focus', () => fn()); node.addEventListener('mouseleave', hideTip); node.addEventListener('blur', hideTip); };

/* ================= the legions kept in this browser =================
   The Legion Viewer keeps the last legions it read (IndexedDB). From there: what each hero wears on the chain,
   the gear and pets it can be given, and the heroes the computer drafts from. */
const GEAR_SLOTS = [
  ['weapon1', 'weapon1Id', 'weapon'], ['weapon1Visage', 'weapon1VisageId', 'weapon'], ['weapon2', 'weapon2Id', 'weapon'], ['weapon2Visage', 'weapon2VisageId', 'weapon'],
  ['offhand1', 'offhand1Id', 'accessory'], ['offhand1Visage', 'offhand1VisageId', 'accessory'], ['offhand2', 'offhand2Id', 'accessory'], ['offhand2Visage', 'offhand2VisageId', 'accessory'],
  ['armor', 'armorId', 'armor'], ['armorVisage', 'armorVisageId', 'armor'], ['accessory', 'accessoryId', 'accessory'], ['accessoryVisage', 'accessoryVisageId', 'accessory'],
];
let legionsP = null;
function keptLegions() {
  if (!legionsP) {
    legionsP = (async () => {
      let index = [];
      try { index = JSON.parse(store.get('dfk-tales:legions') || '[]'); } catch (e) { /* none */ }
      const out = [];
      for (const { key } of index) {
        const at = String(key).indexOf(':');
        const chainId = Number(String(key).slice(0, at)), addr = String(key).slice(at + 1);
        const d = await readLegion(chainId, addr).catch(() => null);
        if (d && Array.isArray(d.heroes)) out.push({ chainId, addr, heroes: d.heroes, gear: d.gear || [], pets: d.pets || [], byId: new Map(d.heroes.map((h) => [String(h.id), h])) });
      }
      return out;
    })();
  }
  return legionsP;
}
async function legionOf(h) { return (await keptLegions()).find((L) => L.byId.has(String(h.id))) || null; }
/* What the chain says the hero wears, and the pool of its legion for the slot pickers. */
function chainOf(L, h) {
  if (!L) return { chainGear: null, chainPet: null, pool: null };
  if (!L.gearMap) L.gearMap = new Map(L.gear.map((e) => [`${e.kind === 'offhand' ? 'accessory' : e.kind}:${e.id}`, e]));
  const fresh = L.byId.get(String(h.id)) || h;
  const chainGear = {};
  for (const [slot, idKey, contract] of GEAR_SLOTS) { const id = fresh.equipment && fresh.equipment[idKey]; chainGear[slot] = id ? L.gearMap.get(`${contract}:${id}`) || null : null; }
  const chainPet = L.pets.find((p) => p.equippedTo && String(p.equippedTo) === String(h.id)) || null;
  return { chainGear, chainPet, pool: { gear: L.gear, pets: L.pets } };
}
/* What the battle uses: weapon 1, offhand 1, armour, accessory, pet (the armory first, then the chain); the look for the rig. */
function kitOf(h, ch) {
  const look = heroLook(h, ch && ch.chainGear, ch && ch.chainPet);
  const w = look.worn;
  return { weapon: w.weapon1, offhand: w.offhand1, armor: w.armor, accessory: w.accessory, pet: w.pet, look: look.gear, cardHero: look.hero };
}

/* ================= setup: your squad, the card, the Codex ================= */
const skillsOf = (slot) => slot.skills || C.defaultLoadout(slot.hero);
let tab = Math.max(0, Math.min(2, (Number(new URLSearchParams(location.search).get('p')) || 1) - 1)); // ?p=2: back from picking P2
let said = null; // the Codex skill last read, kept across redraws

function renderSetup() {
  if (battle) return;
  const s = readSquad();
  const mine = s.teams.A;
  if (!mine[tab] && mine.some(Boolean)) tab = mine.findIndex(Boolean);
  const ok = isComplete(s);
  const n = mine.filter(Boolean).length;
  const fb = $('#btn-fight');
  fb.textContent = duel && duel.role === 'guest' ? 'Accept ▸' : 'Fight ▸';
  fb.disabled = !ok || !!(duel && (duel.role === 'host' || duel.busy));
  fb.title = duel && duel.role === 'host' ? 'You are waiting for your friend: cancel the challenge to fight the AI' : '';
  renderDuelBox();
  $('#status').textContent = duel && duel.role === 'guest' && ok ? `Level cap ${duel.cap}, set by the challenge. One Codex skill per tier, then Accept: the battle starts at once.`
    : duel && duel.role === 'host' && ok ? `Level cap ${duel.cap}. Your challenge is open: send the link and keep this page open.`
    : ok ? `Level cap ${s.cap}. One Codex skill per tier, then Fight: the AI drafts three heroes near your level and plays them.`
    : n === 0 ? (legion.addr ? 'No squad yet: press "Choose a hero" on P1, then P2 and P3.' : 'Paste a wallet address above (yours or any other), then choose a hero for P1, P2 and P3.')
    : `${n} of 3 heroes${n === 3 ? `, but someone is above the level cap ${s.cap}: change them` : ': choose the others'}.`;
  renderScenes();
  renderCaps(s);
  renderTabs(s);
  const slot = mine[tab];
  $('#editor').hidden = !slot;
  if (!slot) { destroyCard(); return; }
  ensureCard(slot.hero);
  renderCodex(slot, tab);
}

function renderScenes() {
  const box = $('#scenes');
  const cur = sceneChoice();
  const sc = SCENES.find((x) => x.id === cur);
  const lbl = el('span', 'lbl');
  lbl.append('Arena', el('b', null, cur === 'random' ? 'Random' : sc ? sc.name : SCENES[0].name));
  box.replaceChildren(lbl);
  let group = null;
  const choose = (id) => { store.set(SCENE_KEY, id); renderScenes(); };
  for (const x of SCENES) {
    if (group && x.group !== group) box.append(el('span', 'sc-sep'));
    group = x.group;
    const b = el('button', 'sc'); b.type = 'button'; b.title = x.name; b.setAttribute('aria-label', x.name);
    b.style.backgroundImage = [x.front && !x.frontOpacity && `url("${sceneUrl(x, x.front)}")`, `url("${sceneUrl(x, x.base)}")`].filter(Boolean).join(', ');
    b.setAttribute('aria-pressed', String(x.id === cur));
    b.addEventListener('click', () => choose(x.id));
    box.append(b);
  }
  box.append(el('span', 'sc-sep'));
  const r = el('button', 'sc rnd', '?'); r.type = 'button'; r.title = 'Random: a different scene every battle';
  r.setAttribute('aria-pressed', String(cur === 'random'));
  r.addEventListener('click', () => choose('random'));
  box.append(r);
}

/* Your three places. A place is chosen the old DFK way: select it, then pick the hero in the Legion Viewer. */
const LV = new URL('../legion-viewer/', location.href).href;
const pickUrl = (i) => { const q = new URLSearchParams(); if (legion.addr) { q.set('legion', legion.addr); if (legion.chain !== 43114) q.set('chain', String(legion.chain)); } q.set('pick', String(i + 1)); return `${LV}?${q}`; };

/* ---------- whose legion ----------
   The main way in is to paste an address: any wallet, yours or not, nothing to sign or approve. Connecting a wallet
   is there too, for who prefers it: it only asks the wallet for its address. The Legion Viewer shares the choice. */
const legion = { addr: null, chain: 43114, heroes: null, busy: null, err: null, edit: false };
{
  const a = store.get('dfk-tales:addr') || getWallet();
  if (a && isAddr(a)) { legion.addr = a; legion.chain = Number(store.get('dfk-tales:chain')) || 43114; }
}
async function useLegion(addr, chain, fresh = false) {
  addr = String(addr || '').trim();
  if (!isAddr(addr)) { legion.err = 'That is not a wallet address: 0x followed by 40 characters.'; renderLegionBar(); return; }
  Object.assign(legion, { addr, chain, err: null, busy: 'Opening the legion…' });
  renderLegionBar();
  try {
    const d = await loadLegion(addr, chain, { fresh, onProgress: (t) => { legion.busy = t; renderLegionBar(); } });
    store.set('dfk-tales:addr', addr); store.set('dfk-tales:chain', String(chain));
    legionsP = null; // the computer drafts from the legions kept in this browser: this one too, now
    Object.assign(legion, { heroes: d.heroes.length, busy: null, edit: false });
  } catch (e) {
    console.warn('legion', e);
    Object.assign(legion, { busy: null, err: e && e.message && /address/.test(e.message) ? e.message : 'The chain did not answer: try again in a moment.' });
  }
  renderLegionBar();
  renderSetup();
}
function renderLegionBar() {
  const box = $('#legionbar');
  box.replaceChildren(el('span', 'lb', 'Legion'));
  if (legion.addr && !legion.edit) {
    const b = el('b', null, shortAddr(legion.addr)); b.title = legion.addr;
    box.append(b, el('span', 'info', legion.busy || `${CHAINS[legion.chain] || legion.chain}${legion.heroes != null ? ` · ${legion.heroes.toLocaleString('en-US')} heroes` : ''}`));
    const ch = el('button', null, 'Change'); ch.type = 'button';
    ch.addEventListener('click', () => { legion.edit = true; renderLegionBar(); box.querySelector('input').focus(); });
    if (!legion.busy) box.append(ch);
  } else {
    const inp = el('input'); inp.type = 'text'; inp.placeholder = 'Paste any wallet address: 0x…'; inp.spellcheck = false; inp.autocomplete = 'off';
    if (legion.addr) inp.value = legion.addr;
    const sel = el('select');
    for (const id of [43114, 8217]) { const o = el('option', null, CHAINS[id]); o.value = id; if (Number(id) === legion.chain) o.selected = true; sel.append(o); }
    const go = el('button', 'primary', legion.busy ? '…' : 'Load legion'); go.type = 'button'; go.disabled = !!legion.busy;
    const load = () => useLegion(inp.value, Number(sel.value) || 43114);
    go.addEventListener('click', load);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') load(); });
    box.append(inp, sel, go);
    if (hasProvider() && !legion.busy) {
      const w = el('button', 'quiet', 'or connect a wallet'); w.type = 'button';
      w.title = 'Asks your wallet for its address only: no signature, no transaction, no approval.';
      w.addEventListener('click', async () => { try { const a = await connectWallet(); useLegion(a, 43114); } catch (e) { console.warn('wallet', e); } });
      box.append(w);
    }
    if (legion.edit && legion.addr) { const c = el('button', 'quiet', 'cancel'); c.type = 'button'; c.addEventListener('click', () => { legion.edit = false; renderLegionBar(); }); box.append(c); }
    if (legion.busy) box.append(el('span', 'info', legion.busy));
  }
  if (legion.err) box.append(el('span', 'err', legion.err));
}
if (legion.addr) readLegion(legion.chain, legion.addr).then((d) => { if (d && d.heroes) { legion.heroes = d.heroes.length; renderLegionBar(); } else useLegion(legion.addr, legion.chain); });
renderLegionBar();
function renderTabs(s) {
  const box = $('#tabs');
  box.replaceChildren();
  s.teams.A.forEach((slot, i) => {
    const over = slot && slot.hero.level > s.cap;
    const b = el('div', `tab${slot ? '' : ' empty'}${over ? ' over' : ''}`);
    b.tabIndex = 0;
    b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(i === tab));
    b.append(el('span', 'pp', `P${i + 1}`));
    const info = el('span');
    const chg = el('a', 'chg', slot ? '⇄ Change' : '+ Choose a hero');
    chg.href = pickUrl(i);
    chg.title = `Choose the hero for P${i + 1} in the Legion Viewer`;
    chg.addEventListener('click', (e) => e.stopPropagation());
    if (!slot) info.append(el('b', null, 'Empty'), chg);
    else {
      const h = slot.hero;
      const nb = el('b'); nb.append(img(classImg(h.class)), h.name);
      info.append(nb, el('small', null, `${cap(h.class)} · Lv ${h.level}${over ? ` > cap ${s.cap}` : ''}`));
      const picks = el('span', 'picks');
      const list = CODEX(h.class);
      if (list) for (const id of skillsOf(slot)) { const sk = list.find((x) => x.id === id); const u = sk && imgOf(sk); if (u) { const im = img(u); im.title = sk.name; picks.append(im); } }
      info.append(picks);
      b.append(chg);
    }
    b.prepend(info); b.prepend(b.querySelector('.pp'));
    const go = () => { if (!slot) { location.href = pickUrl(i); return; } if (tab === i) return; tab = i; said = null; renderSetup(); };
    b.addEventListener('click', go);
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    box.append(b);
  });
}

/* The level cap of the squad: 10, 12, 15 or 20, as in DFK's PvP. */
function renderCaps(s) {
  const box = $('#caps');
  box.querySelectorAll('button').forEach((n) => n.remove());
  for (const c of CAPS) {
    const b = el('button', null, `Lv ${c}`); b.type = 'button';
    b.setAttribute('aria-pressed', String(c === s.cap));
    if (duel) { b.disabled = true; b.title = 'The challenge fixes the level cap'; }
    b.addEventListener('click', () => { if (!duel) setCap(c); });
    box.append(b);
  }
}

/* The hero's own card, open, with the seven slot icons that equip it. Rebuilt only when the hero or its gear changes. */
let cardKey = null, cardHandle = null, cardRun = 0;
async function ensureCard(h, force = false) {
  const key = heroKey(h);
  if (!force && key === cardKey && cardHandle) return;
  destroyCard();
  cardKey = key;
  const run = ++cardRun;
  const ch = chainOf(await legionOf(h), h);
  if (run !== cardRun) return;
  const kit = kitOf(h, ch);
  const handle = createAnimatedHeroCard(revive(kit.cardHero), { flipOnClick: true, renderer: kit.look ? { gear: kit.look } : {} });
  cardHandle = handle;
  $('#cardbox').replaceChildren(handle.element);
  const opts = { pool: () => ch.pool, chainGear: ch.chainGear, chainPet: ch.chainPet };
  const hook = () => hookCardIcons(handle.element, h, opts);
  if (!hook()) Promise.resolve(handle.ready).then(hook, hook);
}
function destroyCard() {
  cardRun += 1;
  if (cardHandle) { try { if (cardHandle.destroy) cardHandle.destroy(); } catch (e) { /* gone */ } cardHandle.element.remove(); }
  cardHandle = null; cardKey = null;
  $('#cardbox').replaceChildren();
}

/* The squad keeps heroes as JSON: the card wants its dates back as dates. */
function revive(h) {
  const out = { ...h };
  for (const k of ['staminaFullAt', 'summonedAt', 'nextSummonAt']) if (out[k] != null && !(out[k] instanceof Date)) out[k] = new Date(out[k]);
  return out;
}

const costOf = (sk, h) => `${Math.round(sk.mana[0] + sk.mana[1] * h.level)} MP${sk.ap ? ` · ${sk.ap} AP` : sk.apX ? ' · X AP' : ''}`;
function metaOf(sk, h) {
  if (sk.passive) return `${sk.branch} · tier ${sk.tier} · passive`;
  return [`${sk.branch} · tier ${sk.tier}`, costOf(sk, h), sk.amnesia && `Amnesia ${sk.amnesia}`, sk.channel && `channel ${typeof sk.channel === 'function' ? '50 + 50·X' : sk.channel}`].filter(Boolean).join(' · ');
}

/* The Skill Codex: the class's three disciplines side by side, tiers 1 to 5 down; one skill per tier. */
function renderCodex(slot, i) {
  const h = slot.hero;
  const box = $('#codex');
  box.replaceChildren();
  const { mainTiers, subPoints } = codexBudget(h.level);
  const head = el('div', 'cx-head');
  const nb = el('b'); nb.append(img(classImg(h.class)), h.name);
  head.append(nb, el('span', null, `P${i + 1} · ${cap(h.class)} / ${cap(h.subClass)} · Lv ${h.level} · ${mainTiers} of 5 tiers open`));
  box.append(head);

  const tr = traitsOf(h);
  const line = el('div', 'cx-traits');
  const chip = (t, cls) => { const c = el('span', cls); const u = imgOf(t); if (u) c.append(img(u)); c.append(t.name); return c; };
  for (const t of tr.actives) { const c = chip(t, 'chip'); tipOn(c, () => showTip(c, t.name, 'Active trait · once per battle', t.text)); line.append(c); }
  for (const t of tr.passives) { const c = chip(t, 'chip dim'); tipOn(c, () => showTip(c, t.name, 'Passive trait', t.text)); line.append(c); }
  box.append(line);

  const list = CODEX(h.class);
  if (!list) { box.append(el('div', 'note', `The game never gave the ${cap(h.class)} a Skill Codex: it fights with Basic Attack, traits, pet and gear.`)); return; }
  const picks = skillsOf(slot).slice();
  const desc = el('div', 'cx-desc');
  const idle = () => { said = null; desc.replaceChildren(el('span', 'nt', 'Hover a skill to read it. One skill per tier; each tier opens at its level.')); };
  const say = (sk) => {
    said = sk.id;
    desc.replaceChildren(el('b', null, sk.name), el('small', null, metaOf(sk, h)), sk.text);
    if (sk.note) desc.append(el('span', 'nt', sk.note));
  };
  const disciplines = [...new Set(list.filter((x) => x.tier === 1).map((x) => x.branch))];
  for (const x of list) if (!disciplines.includes(x.branch)) disciplines.push(x.branch);
  const grid = el('div', 'cx-grid');
  grid.append(el('span'));
  for (const d of disciplines) grid.append(el('div', 'disc', d));
  for (let t = 1; t <= 5; t++) {
    const locked = t > mainTiers;
    const tl = el('div', `tl${locked ? ' locked' : ''}`);
    tl.append(`T${t}`, el('small', null, locked ? `Lv ${TIER_OPENS[t]}` : `${t} pt${t > 1 ? 's' : ''}`));
    grid.append(tl);
    for (const d of disciplines) {
      const sk = list.find((x) => x.tier === t && x.branch === d);
      if (!sk) { grid.append(el('span')); continue; }
      const b = el('button', `node t${t}${sk.passive ? ' pas' : ''}${locked ? ' locked' : ''}`); b.type = 'button';
      const ic = el('span', 'ic');
      const u = imgOf(sk);
      if (u) ic.append(img(u)); else ic.innerHTML = svg(iconOf(sk.id));
      const tx = el('span');
      tx.append(el('span', 'nm', sk.name), el('span', 'mt', sk.passive ? 'Passive' : costOf(sk, h)));
      b.append(ic, tx);
      b.setAttribute('aria-pressed', String(picks.includes(sk.id)));
      b.addEventListener('mouseenter', () => say(sk));
      b.addEventListener('focus', () => say(sk));
      b.addEventListener('click', () => {
        said = sk.id;
        const next = picks.filter((id) => !list.some((x) => x.id === id && x.tier === t));
        next.push(sk.id);
        setSkills('A', i, next);
      });
      grid.append(b);
    }
  }
  grid.addEventListener('mouseleave', idle);
  box.append(grid, desc);
  const again = said && list.find((x) => x.id === said);
  if (again) say(again); else idle();
  if (subPoints) box.append(el('div', 'note', `+${subPoints} ${cap(h.subClass)} points: the subclass Codex comes with the second weapon.`));
}

onSquadChange(() => renderSetup());
onArmoryChange(() => { if (battle) return; const s = readSquad(); const slot = s.teams.A[tab]; if (slot) ensureCard(slot.hero, true); renderSetup(); });
renderSetup();

/* ================= the computer's squad =================
   Three random heroes of the eight Codex classes, at or under the cap and near your average level, from the legions
   kept in this browser (yours first of all); different classes when it can; one random skill per open tier.
   When there is nobody to draft, a mirror match: your own heroes, with random skills. */
function randomSkills(h) {
  const list = CODEX(h.class);
  if (!list) return [];
  const { mainTiers } = codexBudget(h.level);
  const out = [];
  for (let t = 1; t <= mainTiers; t++) { const o = list.filter((s) => s.tier === t); if (o.length) out.push(o[Math.floor(Math.random() * o.length)].id); }
  return out;
}
async function draftOpponent(s) {
  const legions = await keptLegions();
  const mine = s.teams.A.filter(Boolean).map((x) => x.hero);
  const mineIds = new Set(mine.map((h) => String(h.id)));
  const avg = mine.reduce((t, h) => t + h.level, 0) / mine.length;
  const seen = new Set(), pool = [];
  for (const L of legions) for (const h of L.heroes) {
    const id = String(h.id);
    if (seen.has(id) || mineIds.has(id)) continue;
    seen.add(id);
    if (!CODEX(h.class) || !(h.level <= s.cap) || !h.stats) continue;
    pool.push({ h, L });
  }
  let near = pool;
  for (const d of [1, 2, 3, 5]) { const n = pool.filter((x) => Math.abs(x.h.level - avg) <= d); if (n.length >= 8) { near = n; break; } }
  if (near.length >= 3) {
    shuffle(near);
    const picks = [], classes = new Set();
    for (const x of near) { if (picks.length === 3) break; if (!classes.has(x.h.class)) { picks.push(x); classes.add(x.h.class); } }
    for (const x of near) { if (picks.length === 3) break; if (!picks.includes(x)) picks.push(x); }
    return { mirror: false, heroes: picks.map(({ h, L }) => { const hero = plain(h); return { hero, ch: chainOf(L, hero), skills: randomSkills(hero) }; }) };
  }
  const heroes = [];
  for (const h of shuffle(mine.slice())) {
    const ch = chainOf(await legionOf(h), h);
    const hero = { ...plain(h), id: `${h.id}m` };
    heroes.push({ hero, ch, skills: randomSkills(hero) });
  }
  return { mirror: true, heroes };
}

/* ================= battle ================= */
/* The rig draws the feet at 93% of its canvas; the scenes' ground is row 48 of 52. Heroes stand in units of --u
   (the field's height, or its width / 2.25 on narrow screens): P1 0.31 u from the centre, P2 0.63, P3 0.95
   (left team P3 P2 P1 facing right, right team P1 P2 P3 facing left). */
const FEET = 0.93, GROUND = 48 / 52;
const DX = { 1: 0.31, 2: 0.63, 3: 0.95 };
const TICK_MS = 45;
/* Hero size: at zoom 0.72 the hero stands about 29% of --u (0.5: smaller than in 0.4, with more room around, on a field as big as the window).
   The head, for the portraits: the hero is 0.404·zoom of the canvas tall with the feet at 93%; the head is its top fifth. */
const ZOOM = 0.72;
const HEAD = { x: 0.5, cy: 0.93 - 0.404 * ZOOM * 0.81, size: 0.404 * ZOOM * 0.42 };

async function fight(fresh) {
  const s = readSquad();
  if (!isComplete(s)) return;
  if (fresh || !opponent) {
    $('#btn-fight').disabled = true;
    $('#status').textContent = 'The AI is drafting its squad…';
    try { opponent = await draftOpponent(s); } catch (e) { console.error(e); opponent = null; }
    $('#btn-fight').disabled = false;
    if (!opponent || opponent.heroes.length < 3) { $('#status').textContent = 'The AI found nobody to draft. Open a legion in the Legion Viewer first.'; return; }
  }
  await startBattle(s);
}
$('#btn-fight').addEventListener('click', () => (duel && duel.role === 'guest' ? acceptDuel() : fight(true)));
$('#btn-back').addEventListener('click', () => {
  const bk = $('#btn-back');
  if (duel && battle && !battle.over && !battle.stopped && bk.dataset.sure !== '1') {
    bk.dataset.sure = '1'; bk.textContent = 'Leave? Your friend wins';
    setTimeout(() => { bk.dataset.sure = ''; bk.textContent = duel ? '◂ Leave' : '◂ Squad'; }, 3500);
    return;
  }
  bk.dataset.sure = '';
  if (duel) leaveDuel();
  stopBattle();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  document.body.classList.remove('in-battle');
  $('#battle').hidden = true; $('#setup').hidden = false;
  renderSetup();
});
$('#btn-rematch').addEventListener('click', () => { if (duel) { askRematch(); return; } stopBattle(); fight(false); });
$('#btn-next').addEventListener('click', () => { stopBattle(); fight(true); });
$('#btn-full').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
});
$('#log-toggle').addEventListener('click', () => {
  const closed = $('#logbox').classList.toggle('closed');
  $('#log-arrow').textContent = closed ? '▸' : '▾';
  store.set('dfk-tales:arena-log', closed ? 'closed' : 'open');
});
if (store.get('dfk-tales:arena-log') === 'closed') { $('#logbox').classList.add('closed'); $('#log-arrow').textContent = '▸'; }
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !battle || !battle.live || battle.busy) return;
  showHand(battle.live, true); setPending(battle.live, null); turnLine(battle.live);
});
new ResizeObserver(() => { if (battle) layoutField(); }).observe($('#field'));

function stopBattle() {
  if (!battle) return;
  battle.stopped = true;
  stopClock();
  battle.fighters.forEach((f) => f.renderer && f.renderer.destroy && f.renderer.destroy());
  battle = null; pending = null; handId = null;
  hideTip();
}

async function startBattle(s) {
  const mineLegions = await Promise.all(s.teams.A.map((slot) => legionOf(slot.hero)));
  const heroes = { A: [], B: [] }, loadouts = {}, looks = {};
  const add = (team, hero, ch, skills) => {
    const kit = kitOf(hero, ch);
    const h = { ...hero, __weaponSet: getHeroWeaponAnimationSet(hero, kit.weapon ? { weapon1: kit.weapon } : null) };
    heroes[team].push(h);
    const at = `${team}${heroes[team].length}`;
    loadouts[at] = { skills, weapon: kit.weapon, armor: kit.armor, offhand: kit.offhand, accessory: kit.accessory, pet: kit.pet };
    looks[at] = kit.look;
  };
  s.teams.A.forEach((slot, i) => add('A', slot.hero, chainOf(mineLegions[i], slot.hero), skillsOf(slot)));
  for (const o of opponent.heroes) add('B', o.hero, o.ch, o.skills);
  const seed = newSeed();
  mySide = 'A';
  const b = C.createBattle({ heroes, rng: makeRng(seed), loadouts });
  Object.assign(b, { seed, stopped: false, turn: null, live: null, busy: false, cap: s.cap, ai: { A: false, B: true }, remote: null, dec: 0, acts: 0 });
  enterBattle(b, pickScene(), looks);
  log(opponent.mirror ? 'No other heroes kept in this browser: a mirror match against your own squad.'
    : `The AI drafted ${opponent.heroes.map((o) => `${o.hero.name} (${cap(o.hero.class)} ${o.hero.level})`).join(', ')}.`, 'sys');
  $('#b-eyebrow').textContent = `Level cap ${s.cap} · average level ${b.avgLvl.toFixed(1)} · ${scene.name} · seed ${seed}`;
}
const newSeed = () => (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0;
/* The page of a battle that starts: field, plates, timebar, log; then the timebar runs. */
function enterBattle(b, sc, looks) {
  battle = b;
  scene = sc;
  destroyCard();
  document.body.classList.add('in-battle');
  $('#setup').hidden = true; $('#battle').hidden = false;
  $('#btn-rematch').hidden = true; $('#btn-next').hidden = true; $('#result').hidden = true; $('#groups').hidden = false;
  $('#btn-back').textContent = duel ? '◂ Leave' : '◂ Squad'; $('#btn-back').dataset.sure = '';
  $('#btn-rematch').textContent = 'Rematch'; $('#btn-rematch').disabled = false;
  $('#log').replaceChildren(); endLogGroup();
  log(`Battle starts in the ${scene.name}. Seed ${b.seed}.`, 'sys');
  b.fighters.filter((f) => f.luckyStart).forEach((f) => log(`${f.name} starts lucky: triple Initiative.`, 'sys'));
  buildField(looks); buildPlates(); buildTimebar();
  layoutField();
  VFX.preload(['basicImpact', 'magicBlast', 'arcSlash', 'archerDefaultAttack', 'healImpact', 'secondLifeImpact', ...Object.values(VFX.STATUS).map((x) => x[0]), 'barrier', 'wardFront', 'channelingFront']);
  for (const f of b.fighters) for (const sk of [...f.skills, ...f.traitActives]) VFX.preloadSkill(sk.name);
  turnLine(null);
  showHand(C.teamOf(b, mySide)[0], false);
  paint();
  runLoop();
}

const byId = (id) => battle.fighters.find((f) => f.id === id);
const nameOf = (id) => { const f = id && byId(id); return f ? f.name : '?'; };

/* ---------- the field ---------- */
function buildField(looks) {
  const field = $('#field');
  const front = $('#scene-front');
  field.querySelectorAll('.ftr').forEach((n) => n.remove());
  for (const f of battle.fighters) {
    const node = el('div', `ftr ${vis(f.team).toLowerCase()}${isMine(f) ? ' mine' : ''}`);
    const canvas = el('canvas');
    const body = el('button', 'body'); body.type = 'button'; body.setAttribute('aria-label', f.name);
    node.append(canvas, el('span', 'chance'), body);
    body.addEventListener('click', () => onFighterClick(f));
    tipOn(body, () => { if (battle) showTip(body, f.name, `${cap(f.hero.class)} · Lv ${f.level} · ${fmt(f.hp)} / ${fmt(f.hpMax)} HP`, isMine(f) && !node.classList.contains('can') ? 'Click to see its skills.' : null); });
    f.node = node; f.canvas = canvas;
    field.insertBefore(node, front);
    f.idle = weaponAnimation(f.weaponSet, 'Idle');
    const look = looks[f.id] || looks[String(f.hero.id)];
    f.renderer = new HeroRenderer(canvas, f.hero, { animation: f.idle, mix: 0.12, zoom: ZOOM, ...(look ? { gear: look } : {}), onEvent: (ev) => { if (ev.name === 'hit' && f.onHit) { const fn = f.onHit; f.onHit = null; fn(); } } });
  }
}
/* Size everything to the field: the scene tiles, --u, the heroes' places. */
function layoutField() {
  const field = $('#field');
  const W = field.clientWidth, H = field.clientHeight;
  if (!W || !H) return;
  geo = { W, H, u: Math.min(H, W / 2.25) };
  field.style.setProperty('--u', `${geo.u}px`);
  tileScene();
  place();
  if (battle) battle.fighters.forEach((f) => loops(f, true));
}
function tileScene() {
  const { W, H } = geo;
  for (const [id, file] of [['#scene-back', scene && scene.base], ['#scene-front', scene && scene.front]]) {
    const box = $(id);
    box.replaceChildren();
    if (id === '#scene-front') box.style.opacity = scene && scene.frontOpacity ? String(scene.frontOpacity) : '';
    box.style.filter = scene ? sceneFilter(scene) : '';
    if (!file) continue;
    const url = `url("${sceneUrl(scene, file)}")`;
    const tw = H * (scene.w || 55) / (scene.h || 52);
    const cx = W / 2;
    // The game's square scenes meet in the middle (a seam between the scene and its mirror); a wide scene of ours sits in the middle.
    const off = scene.w > 2 * (scene.h || 52) ? -0.5 : 0;
    const k0 = Math.floor(-cx / tw - off) - 1, k1 = Math.ceil((W - cx) / tw - off) + 1;
    for (let k = k0; k <= k1; k++) {
      const x = cx + (k + off) * tw;
      const odd = ((k % 2) + 2) % 2 === 1;
      const tile = el('i', (off ? odd : !odd) ? 'm' : null);
      tile.style.left = `${Math.floor(x)}px`;
      tile.style.width = `${Math.ceil(tw) + 1}px`;
      tile.style.backgroundImage = url;
      box.append(tile);
    }
  }
}
function place() {
  if (!battle) return;
  const { W, H, u } = geo;
  const top = H * GROUND - FEET * u;
  for (const f of battle.fighters) {
    const x = W / 2 + (isMine(f) ? -1 : 1) * DX[f.pos] * u;
    const st = f.node.style;
    st.left = `${x - u / 2}px`; st.top = `${top}px`; st.width = `${u}px`; st.height = `${u}px`;
  }
}

/* Copy the head out of the hero's own canvas: live portraits for the plates and the timebar. */
function drawHead(f, target) {
  const src = f.canvas, ctx = target.getContext('2d');
  const W = src.width, H = src.height;
  if (!W || !H) return;
  const size = HEAD.size * H, sx = HEAD.x * W - size / 2, sy = HEAD.cy * H - size / 2;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.save();
  if (isMine(f)) { ctx.translate(target.width, 0); ctx.scale(-1, 1); }
  try { ctx.drawImage(src, sx, sy, size, size, 0, 0, target.width, target.height); } catch (e) { /* not drawn yet */ }
  ctx.restore();
}

/* The HUD sides: one plate per hero, stacked P1 to P3, portrait outward. */
function buildPlates() {
  for (const team of ['A', 'B']) $(`#side-${team.toLowerCase()}`).replaceChildren();
  for (const f of battle.fighters) {
    const p = el('button', 'plate'); p.type = 'button';
    const pt = el('div', 'pt'); const pc = el('canvas'); pc.width = 48; pc.height = 48; pt.append(pc);
    const info = el('div');
    const nm = el('div', 'nm');
    const ci = img(classImg(f.cls));
    if (!isMine(f)) nm.append(f.name.split(' ')[0], ci); else nm.append(ci, f.name.split(' ')[0]);
    info.append(nm, bar('hp'), bar('mp'));
    if (f.cls === 'wizard') info.append(bar('ap'));
    info.append(el('div', 'tags'));
    p.classList.toggle('wiz', f.cls === 'wizard');
    p.append(pt, info);
    p.addEventListener('click', () => onFighterClick(f));
    tipOn(p, () => { if (!battle) return; const sh = C.sheet(battle, f); showTip(p, f.name, `${cap(f.hero.class)} · Lv ${f.level} · P${f.pos} · ${f.weapon.name}${f.weapon.loaned ? ' (loaned)' : ''}`, `HP ${fmt(f.hp)} / ${fmt(f.hpMax)} · MP ${fmt(f.mp)} / ${fmt(f.mpMax)}${f.cls === 'wizard' ? ` · Arcane Power ${f.ap} / ${C.AP_MAX}` : ''} · ATK ${fmt(sh.attack)} · SPELL ${fmt(sh.spell)} · P.DEF ${fmt(sh.pdef)} · M.DEF ${fmt(sh.mdef)} · EVA ${pct(sh.evasion)} · CRIT ${pct(sh.crit)} · Speed ${sh.speed.toFixed(1)}`, C.tags(f).map((t) => t.name).join(' · ') || null); });
    f.plate = p; f.portrait = pc;
    $(`#side-${vis(f.team).toLowerCase()}`).append(p);
  }
}
/* A bar with its number beside it: HP, MP, and the Wizard's Arcane Power. */
function bar(cls) {
  const row = el('div', `bx ${cls}`);
  const d = el('div', `bar ${cls}`); d.append(el('i'), el('u'));
  row.append(d, el('span', 'v'));
  return row;
}
function setBar(node, cls, v, max, extra, label) {
  const row = node.querySelector(`.bx.${cls}`);
  if (!row) return;
  row.querySelector('i').style.width = `${max ? Math.max(0, Math.min(100, (v / max) * 100)) : 0}%`;
  row.querySelector('u').style.width = `${extra && max ? Math.min(100, (extra / max) * 100) : 0}%`;
  row.querySelector('.v').textContent = label != null ? label : fmt(v);
}

function buildTimebar() {
  const tb = $('#timebar');
  tb.querySelectorAll('.mk').forEach((m) => m.remove());
  for (const f of battle.fighters) {
    const m = el('div', `mk ${vis(f.team).toLowerCase()}`);
    const c = el('canvas'); c.width = 34; c.height = 34; m.append(c);
    m.title = f.name;
    f.marker = m; f.markerCanvas = c;
    tb.append(m);
  }
}

function paint() {
  const b = battle;
  if (!b) return;
  const turnId = b.turn && b.turn.id;
  for (const f of b.fighters) {
    const goal = f.channel ? f.channel.need : ACT_AT;
    f.marker.style.left = `${Math.min(100, (Math.max(0, f.initiative) / goal) * 100) * 0.95 + 2.5}%`;
    f.marker.classList.toggle('down', !f.alive);
    f.marker.classList.toggle('turn', f.id === turnId);
    f.marker.classList.toggle('ch', !!f.channel);
    f.marker.title = f.channel && isMine(f) ? `${f.name} · channelling ${f.channel.skill.name}` : f.channel ? `${f.name} · channelling` : f.name;
    for (const n of [f.node, f.plate]) { n.classList.toggle('turn', f.id === turnId); n.classList.toggle('down', !f.alive); }
    f.plate.classList.toggle('shown', f.id === handId);
    f.plate.style.order = f.pos;
    const barrier = f.fx.find((e) => e.key === 'barrier');
    setBar(f.plate, 'hp', f.hp, f.hpMax, barrier ? barrier.value : 0, barrier ? `${fmt(f.hp)}+${fmt(barrier.value)}` : null);
    setBar(f.plate, 'mp', f.mp, f.mpMax);
    setBar(f.plate, 'ap', f.ap || 0, C.AP_MAX, 0, `AP ${f.ap || 0}`);
    loops(f);
    f.plate.querySelector('.tags').replaceChildren(...C.tags(f).map(tagNode));
    // While a hero acts its rig may be loading a new animation (a blank frame): keep its last portrait.
    if (!(b.busy && b.turn === f)) { drawHead(f, f.portrait); drawHead(f, f.markerCanvas); }
  }
  $('#tick').textContent = `tick ${b.tick}`;
}

/* A status on a plate: the game's tracker icon with its stacks, or a short word when the game has no icon for it. */
function tagNode(t) {
  const src = t.key !== 'barrier' && t.key !== 'channel' && statusImg(t.key, t.value != null ? t.value : t.bad ? -1 : 1);
  if (!src) return el('span', t.bad ? 'bad' : null, t.text);
  const n = el('span', `st${t.bad ? ' bad' : ''}`);
  n.title = `${t.name}${t.left ? ` · ${t.left}${/t$/.test(t.left) ? '' : ' ticks'}` : ''}`;
  n.append(img(src));
  if (t.stacks) n.append(el('b', null, String(t.stacks)));
  return n;
}
/* The battle log, newest action on top; inside an action, the headline first and what it did under it.
   side: 'A' (yours) or 'B' (the AI) marks who acted. */
let logGroup = null;
function log(text, cls, side) {
  const li = el('li', [cls, side === 'A' ? 'ally' : side === 'B' ? 'foe' : null].filter(Boolean).join(' ') || null, text);
  const ul = $('#log');
  if (cls === 'hit' && side) {
    logGroup = el('li', 'grp');
    const inner = el('ul');
    inner.append(li);
    logGroup.append(inner);
    ul.prepend(logGroup);
  } else if (logGroup && cls !== 'sys') logGroup.firstChild.append(li);
  else ul.prepend(li);
  while (ul.children.length > 120) ul.lastChild.remove();
}
const endLogGroup = () => { logGroup = null; };
function floatText(f, text, cls, n = 0) {
  const s = el('span', `float${cls ? ` ${cls}` : ''}`, text);
  s.style.marginTop = `calc(var(--u) * ${(-n * 0.058).toFixed(3)})`;
  f.node.append(s);
  setTimeout(() => s.remove(), 1400);
}
const playAnim = (f, anim, loop) => { const list = f.renderer.animations; if (list.length && !list.includes(anim)) anim = f.idle; return f.renderer.play(anim, { loop }).catch(() => {}); };
const hasAnim = (f, a) => !!a && f.renderer.animations.includes(a);
const pickAnim = (f, list) => list.find((a) => hasAnim(f, a)) || null;

/* Show what an action did: floats on the field, the log, hurt, fall and rise animations. */
function showEvents(events) {
  const b = battle;
  const n = {};
  const bump = (id) => (n[id] = (n[id] || 0) + 1) - 1;
  for (const e of events) {
    const t = e.target && byId(e.target);
    if (e.type === 'skill') {
      const src = byId(e.source);
      log(`${nameOf(e.source)}: ${e.skill}${e.target ? ` → ${nameOf(e.target)}` : ''}`, 'hit', src && vis(src.team));
      if (e.delayed && src) floatText(src, e.skill.replace(' (delayed)', ''), 'st good', bump(e.source));
      if (e.delayed) { const name = e.skill.replace(' (delayed)', ''); const d = VFX.skillFx(`Delay: ${name}`) || VFX.skillFx(name); const fx = d && (d.hitEffectFront || d.globalHitEffectFront); const t = e.target && byId(e.target); if (fx && t) VFX.play(t.node, fx, fxOpts(t, { delay: 0 })); }
      continue;
    }
    if (e.type === 'damage') {
      if (e.amount === 0 && e.absorbed > 0) floatText(t, `(${e.absorbed})`, 'abs', bump(t.id));
      else floatText(t, `${e.amount}${e.crit ? '!' : ''}`, e.crit ? 'crit' : null, bump(t.id));
      if (t.alive && e.amount > 0) { playAnim(t, HERO_ANIMATIONS.hurt, false); setTimeout(() => t.alive && !b.stopped && playAnim(t, t.idle, true), 700); }
      const bits = [e.crit && 'critical', e.blocked && 'blocked', e.absorbed && `${e.absorbed} absorbed`, e.chance != null && `${Math.round(e.chance * 100)}%`].filter(Boolean);
      log(`${e.label ? `${e.label} ` : ''}→ ${t.name} −${e.amount}${bits.length ? ` (${bits.join(', ')})` : ''}`, 'sub');
    } else if (e.type === 'miss') { floatText(t, 'MISS', 'miss', bump(t.id)); log(`${e.label ? `${e.label} ` : ''}→ ${t.name} miss (${Math.round(e.chance * 100)}%)`, 'sub'); }
    else if (e.type === 'heal') { if (e.amount > 0) floatText(t, `+${e.amount}${e.crit ? '!' : ''}`, 'heal', bump(t.id)); log(`${e.label}: ${t.name} +${e.amount}${e.crit ? ' (critical)' : ''}`, 'sub'); }
    else if (e.type === 'status') { if (e.tag && t) floatText(t, e.tag, `st${/resist|Unstoppable|BARRIER|SHIELD|GUARD|MIGHT|SWIFT|BEACON|HASTE|IRON|CRIT|BOND|HARDENED|LAST|SKIN/.test(e.tag + e.text) ? ' good' : ''}`, bump(t.id)); log(e.text, 'sub'); }
    else if (e.type === 'ko') { playAnim(t, HERO_ANIMATIONS.down, false); log(e.rising ? `${t.name} falls…` : `${t.name} is down.`, 'ko'); }
    else if (e.type === 'revive') {
      if (e.tag) floatText(t, e.tag, 'st good', bump(t.id));
      VFX.play(t.node, ['secondLifeImpact', 0.2, 'NORMAL', 0, 58, 76, 0, 0, 1], fxOpts(t));
      if (hasAnim(t, HERO_ANIMATIONS.getUp)) { playAnim(t, HERO_ANIMATIONS.getUp, false); setTimeout(() => t.alive && !b.stopped && playAnim(t, t.idle, true), (t.renderer.duration(HERO_ANIMATIONS.getUp) || 1) * 1000); }
      else playAnim(t, t.idle, true);
      log(e.text, 'hit');
    }
    else if (e.type === 'move') { place(); log(e.text, 'sub'); }
    else if (e.type === 'ap') { if (e.amount >= 3) floatText(t, `+${e.amount} AP`, 'st good', bump(t.id)); log(e.text, 'sub'); }
    else if (e.type === 'channel') { const src = byId(e.source || e.target); log(e.text, 'hit', src && vis(src.team)); }
  }
}

/* Play the actor's animation and show the results when the blow lands (the rig's hit marker, or about two thirds in). */
async function animate(f, events, anim, onLand) {
  const b = battle;
  let landed = false;
  const land = () => { if (landed || b.stopped) return; landed = true; if (onLand) onLand(); showEvents(events); paint(); };
  if (anim) {
    const dur = f.renderer.duration(anim) || 1.2;
    f.onHit = land;
    playAnim(f, anim, false);
    setTimeout(land, dur * 650);
    await sleep(dur * 1000);
  } else { land(); await sleep(650); }
  if (b.stopped) return;
  land();
  if (f.alive) playAnim(f, f.idle, true);
}
function animFor(f, s, phase) {
  const set = f.weaponSet;
  if (phase === 'channel') return pickAnim(f, [weaponAnimation(set, 'Channel'), weaponAnimation(set, 'Charge'), s.anim]);
  if (!s) return pickAnim(f, [weaponAnimation(set, 'Hit')]);
  const hits = s.target === 'enemy' || (s.target === 'none' && !/heal|barrier|shell/i.test(s.text));
  return pickAnim(f, [s.anim, hits ? weaponAnimation(set, 'Hit') : weaponAnimation(set, 'Cast'), hits ? null : HERO_ANIMATIONS.shout].filter(Boolean));
}
/* ---------- the game's effects ---------- */
const fxOpts = (x, extra) => ({ u: geo.u, zoom: ZOOM, side: vis(x.team), ...extra });
const IMPACT = ['basicImpact', 0.2, 'NORMAL', 0, 60, 78, 1, 0, 2];
const MAGIC_IMPACT = ['magicBlast', 0.2, 'NORMAL', 0, 72, 87, 1, 0, 2];
const HEAL_IMPACT = ['healImpact', 0.2, 'NORMAL', 0, 52, 76, 0, 0, 1];
/* Who an action touched: hit, missed, healed or given a status. */
function touched(events) {
  const all = [], dmg = [], heal = [];
  for (const e of events) {
    const t = e.target && byId(e.target);
    if (!t) continue;
    if (['damage', 'miss', 'heal', 'status'].includes(e.type) && !all.includes(t)) all.push(t);
    if (e.type === 'damage' && !dmg.includes(t)) dmg.push(t);
    if (e.type === 'heal' && e.amount > 0 && !heal.includes(t)) heal.push(t);
  }
  return { all, dmg, heal };
}
/* Basic Attack: the swing on the attacker; the impact on the target when the blow lands. */
function fxBasic(f) {
  if (f.weapon.kind === 'melee') VFX.play(f.node, ['arcSlash', 0.2, 'NORMAL', 0.3, 22, 76, 0, 0, 0], fxOpts(f, { back: true }));
  else if (!f.weapon.magic) VFX.play(f.node, ['archerDefaultAttack', 0.2, 'NORMAL', 0.2, 93, 72, 1, 0, 61], fxOpts(f));
}
const fxImpacts = (f, events) => () => {
  const hit = touched(events);
  for (const t of hit.dmg) VFX.play(t.node, f.weapon.magic ? MAGIC_IMPACT : IMPACT, fxOpts(t));
};
/* A skill: the game's own effects for it, timed from the start of the hero's animation as in the game.
   Without data, a plain impact on whoever was hit and a glow on whoever was healed. Returns what to do when it lands. */
function fxSkill(f, s, events, primary) {
  const hit = touched(events);
  const d = VFX.skillFx(s.name);
  if (!d) return () => { for (const t of hit.dmg) VFX.play(t.node, s.magic ? MAGIC_IMPACT : IMPACT, fxOpts(t)); for (const t of hit.heal) VFX.play(t.node, HEAL_IMPACT, fxOpts(t)); };
  const side = hit.all[0] ? hit.all[0].team : s.target === 'enemy' ? (f.team === 'A' ? 'B' : 'A') : f.team;
  for (const [k, fx] of Object.entries(d)) {
    const back = /Back$/.test(k);
    if (/^(secondary)?[aA]ttackEffect/.test(k)) VFX.play(f.node, fx, fxOpts(f, { back }));
    else if (/^global/.test(k) && String(fx[9] || '').includes('S')) {
      const team = C.teamOf(battle, side);
      const mid = team.find((x) => x.pos === 2) || team[0];
      if (mid) VFX.play(mid.node, fx, fxOpts(mid, { back }));
    } else {
      const list = /^global/.test(k) || !primary ? hit.all : [primary];
      for (const t of list.length ? list : primary ? [primary] : []) VFX.play(t.node, fx, fxOpts(t, { back }));
    }
  }
  return null;
}
/* The loops on a hero: one status at a time, in turn every 2.2 s as in the game; a barrier, a ward and a channel on their own. */
const LOOP_KEY = { stun: 'stun', daze: 'dazed', taunt: 'taunt', intimidate: 'intimidate', silence: 'silence', bleed: 'bleed', exhaust: 'exhausted', root: 'root', blind: 'blind', slow: 'slow', poison: 'poison', confuse: 'confuse', fear: 'fear', burn: 'burn', chill: 'chill', berserk: 'berserk', bmark: 'berserksMark', haste: 'haste', beacon: 'holybeacon', holyLight: 'holylight', hunterMark: 'huntersmark', unstoppable: 'unstoppable' };
const CHANNEL_LOOP = ['channelingFront', 46, 84, 0.2, 'NORMAL'];
/* Kept off the fighter objects: the computer's trials copy and restore those field by field. */
const LOOPS_OF = new WeakMap();
const loopState = (f) => LOOPS_OF.get(f) || (LOOPS_OF.set(f, { sig: null, list: [], idx: 0, el: null }), LOOPS_OF.get(f));
function loops(f, force = false) {
  if (!geo.u || !f.node) return;
  const L = loopState(f);
  const list = f.alive ? [...new Set(f.fx.map((e) => LOOP_KEY[e.key]).filter(Boolean))] : [];
  const sig = list.join('|');
  if (force || sig !== L.sig) { L.sig = sig; L.list = list; L.idx = 0; showLoop(f); }
  steady(f, L, 'barrier', f.alive && f.fx.some((e) => e.key === 'barrier'), VFX.LOOPS.barrier, force);
  steady(f, L, 'ward', f.alive && f.fx.some((e) => e.key === 'ward'), VFX.LOOPS.ward, force);
  steady(f, L, 'channel', f.alive && !!f.channel, CHANNEL_LOOP, force);
}
function showLoop(f) {
  const L = loopState(f);
  if (L.el) L.el.remove();
  L.el = null;
  const k = L.list.length ? L.list[L.idx % L.list.length] : null;
  const st = k && VFX.STATUS[k];
  if (st) L.el = VFX.play(f.node, [st[0], st[3], 'NORMAL', 0, st[1], st[2], 0, 0, 60], fxOpts(f, { loop: true }));
}
function steady(f, L, key, on, def, force) {
  if (L[key] && (force || !on)) { L[key].remove(); L[key] = null; }
  if (on && !L[key]) L[key] = VFX.play(f.node, [def[0], def[3], def[4], 0, def[1], def[2], 0, 0, 60], fxOpts(f, { loop: true }));
}
setInterval(() => { if (!battle) return; for (const f of battle.fighters) { const L = loopState(f); if (L.list.length > 1) { L.idx += 1; showLoop(f); } } }, 2200);

/* Risings (Second Life) after an action: show them and give them a moment. */
async function after(events) { if (!events || !events.length) return; showEvents(events); paint(); await sleep(1100); }

/* The timebar runs: every tick each standing hero gains its Speed; whoever reaches 1000 first acts, channels complete on their own. */
async function runLoop() {
  const b = battle;
  while (b && !b.stopped && !b.over) {
    const f = C.readyFighter(b);
    if (!f) {
      const ev = C.tickOnce(b);
      if (ev.length) { endLogGroup(); showEvents(ev); if (ev.some((e) => e.type === 'revive')) await sleep(1000); }
      paint();
      await sleep(TICK_MS);
      continue;
    }
    if (f.channel) {
      const s = f.channel.skill;
      b.turn = f; b.live = null; turnLine(f, isMine(f) ? `completes ${s.name}` : 'completes a channel'); paint();
      const chTarget = f.channel.target ? byId(f.channel.target) : null;
      const ev = C.completeChannel(b, f);
      const onLand = fxSkill(f, s, ev, chTarget);
      await animate(f, ev, animFor(f, s), onLand);
      if (ev.some((e) => e.type === 'revive')) await sleep(1000);
      b.turn = null; refreshHand(); paint();
      continue;
    }
    endLogGroup();
    const st = C.startTurn(b, f);
    if (st.events.length) { b.turn = f; showEvents(st.events); paint(); await sleep(550); }
    if (b.stopped || b.over) break;
    if (st.lost) { await after(C.endTurn(b, f, 'lost')); b.turn = null; refreshHand(); paint(); await sleep(250); continue; }
    const forced = C.forcedAction(b, f);
    if (forced) { forcedTurn(f, forced); return; }
    if (b.ai[f.team]) { aiTurn(f); return; }
    b.dec += 1; // a choice to make: yours, or your friend's
    if (b.remote === f.team) { remoteTurn(f); return; }
    offerTurn(f);
    return;
  }
  if (b && b.over && !b.stopped) finish();
}

/* The line over the action bar: whose turn it is; when the bar already shows the hero waiting for you, only what a click does. */
function turnLine(f, extra) {
  const t = $('#turnline');
  t.className = 'turnline';
  if (!f) { t.replaceChildren(); return; }
  if (battle && battle.live === f && handId === f.id) { t.replaceChildren(extra || 'Click an enemy for a Basic Attack, or pick a skill'); return; }
  t.replaceChildren(isMine(f) ? 'Your turn · ' : 'Enemy turn · ', el('b', !isMine(f) ? 'b' : null, f.name), extra ? ` · ${extra}` : '');
}

/* ---------- the action bar: only your heroes, ever ---------- */
/* The bar keeps showing a hero until you click another of yours or the turn passes to one of yours.
   live: it is that hero's turn and it is waiting for you; otherwise the tiles are only there to read. */
function showHand(f, live) {
  handId = f ? f.id : null;
  if (!f) { clearHand(); return; }
  renderHand(f, live);
  if (battle) for (const x of battle.fighters) x.plate.classList.toggle('shown', x.id === handId);
}
function refreshHand() {
  const b = battle;
  const f = b && handId && byId(handId);
  if (!f) return;
  renderHand(f, !!(b.live && b.live === f && !b.busy));
}
function clearHand() {
  hideTip();
  for (const id of ['#g-actions', '#g-skills', '#g-passives']) $(id).replaceChildren();
  $('#handline').replaceChildren();
}

/* A Berserk or Confused hero attacks on its own. */
async function forcedTurn(f, act) {
  const b = battle;
  b.turn = f; b.live = null; b.busy = false;
  if (isMine(f)) showHand(f, false);
  paint();
  turnLine(f, `${act.why}: attacks on its own`);
  log(`${f.name} is ${act.why} and attacks on its own.`, 'sys');
  await sleep(600);
  if (b.stopped) return;
  doAttack(f, act.target);
}
/* The computer's turn: nothing of its hand shows. What it does goes to the battle log. */
async function aiTurn(f) {
  const b = battle;
  b.turn = f; b.live = null; b.busy = true;
  paint();
  turnLine(f, 'thinking…');
  refreshHand();
  await sleep(480);
  if (b.stopped) return;
  const d = AI.decide(b, f);
  turnLine(f);
  b.busy = false;
  if (d.kind === 'attack') doAttack(f, d.target);
  else if (d.kind === 'skill') doSkill(f, d.skill, d.target);
  else { b.busy = true; log(`${f.name} passes.`, 'hit', vis(f.team)); finishAction(f, 'pass'); }
}

function offerTurn(f) {
  const b = battle;
  b.turn = f; b.live = f; b.busy = false;
  paint();
  showHand(f, true);
  turnLine(f);
  setPending(f, null);
  if (duel) startClock(f, true);
}

/* The action bar: Actions & abilities (Basic Attack, move, pass, active traits, pet skill), Skills (Codex), Passives. */
function renderHand(f, live) {
  const b = battle;
  const A = $('#g-actions'), K = $('#g-skills'), P = $('#g-passives');
  hideTip();
  A.replaceChildren(); K.replaceChildren(); P.replaceChildren();
  const groups = $('#groups');
  groups.classList.toggle('view', !live);
  groups.classList.remove('locked');
  const hl = $('#handline');
  hl.replaceChildren(img(classImg(f.cls)), el('span', null, f.name), el('em', live ? 'live' : null, live ? 'your move' : !f.alive ? 'down' : b.turn === f ? 'acting' : 'waiting'));
  if (f.cls === 'wizard') { const ap = el('strong', 'apchip'); ap.append('AP ', el('b', null, String(f.ap || 0)), ` / ${C.AP_MAX}`); ap.title = 'Arcane Power: the X of the X skills (up to 30) and the unlocks'; hl.append(ap); }
  const pad = (box) => { while (box.children.length % 4) box.append(el('span', 'tile empty')); };
  const ok = (t) => live && !b.busy && !t.classList.contains('off');

  // Basic Attack
  const atk = tile(f.weapon.magic ? 'staff' : f.weapon.kind === 'ranged' ? 'bow' : 'sword', 'primary');
  tipOn(atk, () => showTip(atk, 'Basic Attack', `${f.weapon.name} · ${f.weapon.kind}${f.weapon.reach === 2 ? ' · reach 2' : ''}`, f.weapon.kind === 'melee' ? 'Hits the first enemy standing (reach 2: one of the first two).' : 'Click the enemy to hit.'));
  atk.addEventListener('click', () => {
    if (!ok(atk)) return;
    setPending(f, null);
    const ts = C.enemyTargets(b, f, { kind: f.weapon.kind, reach: f.weapon.reach });
    if (ts.length === 1) mineAct(f, { kind: 'attack', target: ts[0] });
  });
  A.append(atk);
  // move one place forward or back, pass
  const mates = C.alliesOf(b, f);
  for (const d of [-1, 1]) {
    const other = mates.find((m) => m.pos === f.pos + d);
    const t = tile(isMine(f) ? (d < 0 ? 'right' : 'left') : (d < 0 ? 'left' : 'right'));
    if (!other || C.has(f, 'root')) t.classList.add('off');
    tipOn(t, () => showTip(t, other ? `Move to P${other.pos}` : 'Move', other ? `Swap places with ${other.name}` : 'Nobody there', 'Gives back 250 Initiative.', C.has(f, 'root') ? 'Rooted' : null));
    t.addEventListener('click', () => { if (!ok(t) || !other) return; mineAct(f, { kind: 'move', other }); });
    A.append(t);
  }
  const pass = tile('pass');
  tipOn(pass, () => showTip(pass, 'Pass', null, 'Gives back 400 Initiative.'));
  pass.addEventListener('click', () => { if (!ok(pass)) return; mineAct(f, { kind: 'pass' }); });
  A.append(pass);
  for (const s of f.traitActives) A.append(actTile(f, s, live, 'trait'));
  if (f.petSkill) A.append(actTile(f, f.petSkill, live, 'pet'));
  pad(A);

  for (const s of f.skills) K.append(actTile(f, s, live));
  if (!CODEX(f.cls)) { const t = tile('ring', 'passive'); tipOn(t, () => showTip(t, `No Codex for the ${cap(f.cls)}`, null, 'The game never gave this class a Skill Codex: Basic Attack, traits, pet and gear.')); K.append(t); }
  pad(K);

  if (f.cls === 'berserker') P.append(passiveTile({ id: 'berserker.momentOfClarity', cls: 'berserker', name: 'Moment of Clarity', img: '../assets/game/ability-icons/berserker/howl.png' }, 'Moment of Clarity', 'Berserker · always on', 'After an action that hurt allies: (4·STR.S + 4·LCK.S)% Berserker\'s Mark on a random enemy for 40 ticks; then, if an enemy has the Mark, Berserk for 30 ticks.'));
  for (const p of f.passives) P.append(passiveTile(p, p.name, 'Codex passive', p.text));
  for (const p of f.traitPassives) P.append(passiveTile(p, p.name, 'Passive trait', p.text, 'T'));
  if (f.pet && f.pet.bonus && !f.petSkill) { const bn = f.pet.bonus; P.append(passiveTile('paw', `${bn.name} ${'★'.repeat(bn.tier)}`, `${f.pet.name}${bn.kind === 'inactive' ? ' · not in play yet' : ''}`, bn.text, 'P')); }
  pad(P);
}
function tile(icon, cls) {
  const t = el('button', `tile${cls ? ` ${cls}` : ''}`); t.type = 'button';
  const u = icon && typeof icon === 'object' ? icon.img || imgOf(icon) : null;
  if (u) t.append(img(u)); else t.innerHTML = svg(typeof icon === 'object' ? iconOf(icon.id) : icon);
  return t;
}
function passiveTile(icon, name, meta, text, tag) {
  const t = tile(icon, 'passive');
  if (tag) t.append(el('span', 'tag', tag));
  tipOn(t, () => showTip(t, name, meta, text));
  return t;
}
function actTile(f, s, live, kind) {
  const b = battle;
  const t = tile(s, kind || null);
  const blocked = C.skillBlocked(b, f, s);
  const needs = ['enemy', 'ally', 'allyOther', 'fallen'].includes(s.target);
  const targets = needs ? C.skillTargets(b, f, s) : [];
  const noTarget = needs && !targets.length;
  if (kind) t.append(el('span', 'tag', kind === 'pet' ? 'P' : 'T'));
  if (!s.trait) t.append(el('span', 'mp', s.ap ? `${C.manaCost(f, s)}·${s.ap}` : String(C.manaCost(f, s))));
  if (s.apX) t.append(el('span', 'apx', `X${Math.min(30, f.ap || 0)}`));
  if (!s.trait && f.cd[s.id] > 0) t.append(el('span', 'cd', String(f.cd[s.id])));
  if (s.trait && f.used[s.id]) t.append(el('span', 'cd', '×'));
  if (blocked || noTarget) t.classList.add('off');
  t.dataset.skill = s.id;
  const meta = [kind === 'trait' ? 'Active trait · once per battle' : kind === 'pet' ? `${f.pet.name} · pet skill · once per battle` : `${C.manaCost(f, s)} MP${s.ap ? ` · ${s.ap} AP` : s.apX ? ` · all AP up to 30 (now ${Math.min(30, f.ap)})` : ''}${s.amnesia ? ` · Amnesia ${s.amnesia}` : ''}`, s.channel && `channel ${typeof s.channel === 'function' ? C.channelOf(s, Math.min(30, f.ap)) : s.channel}`].filter(Boolean).join(' · ');
  const why = blocked || (noTarget ? (s.target === 'fallen' ? 'Nobody is down' : 'No target in reach') : null);
  tipOn(t, () => showTip(t, s.name, meta, `${s.text}${s.note ? ` (${s.note})` : ''}`, why));
  t.addEventListener('click', () => {
    if (!live || b.busy || t.classList.contains('off')) return;
    hideTip();
    if (pending && pending.skill === s) { setPending(f, null); return; }
    if (!needs) { mineAct(f, { kind: 'skill', skill: s, target: null }); return; }
    if (targets.length === 1 && s.target === 'enemy') { mineAct(f, { kind: 'skill', skill: s, target: targets[0] }); return; }
    setPending(f, s);
  });
  return t;
}

function clearTargets() {
  if (!battle) return;
  for (const x of battle.fighters) for (const n of [x.node, x.plate]) n.classList.remove('can', 'ally');
  for (const x of battle.fighters) x.node.querySelector('.chance').textContent = '';
  document.querySelectorAll('.tile.pick').forEach((n) => n.classList.remove('pick'));
}
/* What a click on a hero does now: the Basic Attack (default) or the chosen skill. */
function setPending(f, s) {
  const b = battle;
  clearTargets();
  pending = { skill: s };
  const targets = s ? C.skillTargets(b, f, s) : C.enemyTargets(b, f, { kind: f.weapon.kind, reach: f.weapon.reach });
  const ally = s && s.target !== 'enemy';
  for (const t of targets) {
    for (const n of [t.node, t.plate]) { n.classList.add('can'); n.classList.toggle('ally', !!ally); }
    const p = s ? C.skillHitChance(b, f, s, t) : C.basicHitChance(b, f, t);
    t.node.querySelector('.chance').textContent = p == null ? (s.target === 'fallen' ? 'RAISE' : '') : `${Math.round(p * 100)}%`;
  }
  const btn = document.querySelector(s ? `.tile[data-skill="${CSS.escape(s.id)}"]` : '#g-actions .tile.primary');
  if (btn) btn.classList.add('pick');
  turnLine(f, s ? `${s.name}: pick ${s.target === 'enemy' ? 'an enemy' : s.target === 'fallen' ? 'a fallen ally' : 'an ally'}` : null);
}
/* A click on a hero: a target when you are aiming at it; otherwise, one of yours shows its skills. */
function onFighterClick(t) {
  const b = battle;
  if (!b || b.over) return;
  const f = b.live;
  if (f && !b.busy && handId === f.id && t.node.classList.contains('can')) {
    mineAct(f, pending && pending.skill ? { kind: 'skill', skill: pending.skill, target: t } : { kind: 'attack', target: t });
    return;
  }
  if (!isMine(t)) return;
  if (f && t === f && !b.busy) { showHand(f, true); setPending(f, null); return; }
  clearTargets(); pending = null;
  showHand(t, false);
  if (f) turnLine(f, `click ${f.name.split(' ')[0]} to act`);
}

async function doAttack(f, t) {
  const b = battle;
  if (b.busy) return;
  b.busy = true; b.live = null; hideTip(); clearTargets(); lockHand(f);
  turnLine(f, isMine(f) ? 'Basic Attack' : null);
  const events = C.basicAttack(b, f, t);
  fxBasic(f);
  await animate(f, events, animFor(f, null), fxImpacts(f, events));
  if (b.stopped) return;
  finishAction(f, 'action');
}
async function doMove(f, other) {
  const b = battle;
  if (b.busy) return;
  b.busy = true; b.live = null; hideTip(); clearTargets(); lockHand(f);
  showEvents(C.reposition(b, f, other)); place();
  finishAction(f, 'reposition');
}
function doPass(f) {
  const b = battle;
  if (b.busy) return;
  b.busy = true; b.live = null; hideTip(); clearTargets(); lockHand(f);
  log(`${f.name} passes.`, 'hit', vis(f.team));
  finishAction(f, 'pass');
}
/* A move, yours or your friend's: { kind: 'attack', target } | { kind: 'skill', skill, target } | { kind: 'move', other } | { kind: 'pass' }. */
function apply(f, m) {
  if (m.kind === 'attack') doAttack(f, m.target);
  else if (m.kind === 'skill') doSkill(f, m.skill, m.target);
  else if (m.kind === 'move') doMove(f, m.other);
  else doPass(f);
}
/* Your choice: in a duel it goes to your friend first, then both browsers play it. */
function mineAct(f, m) {
  const b = battle;
  if (!b || b.busy || b.live !== f) return;
  if (duel && b.remote) { stopClock(); duel.link.send({ t: 'move', g: duel.game, dec: b.dec, f: f.id, kind: m.kind, skill: m.skill ? m.skill.id : null, target: m.target ? m.target.id : null, other: m.other ? m.other.id : null }); }
  apply(f, m);
}
async function doSkill(f, s, t) {
  const b = battle;
  if (b.busy) return;
  b.busy = true; b.live = null; hideTip(); clearTargets(); lockHand(f);
  turnLine(f, isMine(f) ? s.name : null);
  const events = C.useSkill(b, f, s, t);
  const onLand = s.channel ? null : fxSkill(f, s, events, t);
  await animate(f, events, animFor(f, s, s.channel ? 'channel' : null), onLand);
  if (b.stopped) return;
  finishAction(f, 'action', s);
}
/* While a hero acts nothing on the bar answers; if the bar shows that hero, it says so. */
function lockHand(f) {
  $('#groups').classList.add('locked');
  const em = $('#handline em');
  if (em && f && f.id === handId) { em.className = ''; em.textContent = 'acting'; }
}
async function finishAction(f, kind, s = null) {
  const b = battle;
  const ev = C.endTurn(b, f, kind, s);
  if (duel && b.remote) sendSum(b);
  b.turn = null; b.live = null;
  refreshHand();
  paint();
  await after(ev);
  endLogGroup();
  if (b.stopped) return;
  if (b.over) finish(); else runLoop();
}

function finish(note) {
  const b = battle;
  const w = b.winner;
  const won = w === mySide;
  const them = duel ? duel.them : 'The AI';
  b.turn = null; b.live = null;
  stopClock();
  paint();
  clearHand();
  const t = $('#turnline');
  t.className = 'turnline result';
  t.textContent = note || (won ? 'Your squad wins' : `${cap(them)} wins`);
  const r = $('#result');
  r.className = `banner${won ? '' : ' lose'}`;
  $('#groups').hidden = true;
  r.querySelector('b').textContent = won ? 'Victory' : 'Defeat';
  r.hidden = false;
  $('#btn-rematch').hidden = !!(duel && !duel.link); $('#btn-next').hidden = !!duel;
  log(note || `${won ? 'Your squad' : cap(them)} wins after ${b.tick} ticks.`, 'ko');
  C.teamOf(b, w).filter((x) => x.alive).forEach((x) => playAnim(x, weaponAnimation(x.weaponSet, 'Celebrate'), true));
}

/* ================= two players =================
   A challenge by link. The one who opens it (host, team A in the engine) waits on this page; the friend (guest, team B)
   opens the link, chooses a squad at the challenge's level cap and accepts. The host's page puts the two squads, a seed
   and the scene together and sends them: from there both browsers run the same battle and only the moves travel.
   Every move is checked against the battle before it is played; after every action the two fingerprints must match. */
function duelUrl(d) { return `${location.origin}${location.pathname}?duel=${d.code}&cap=${d.cap}${d.by ? `&by=${encodeURIComponent(d.by)}` : ''}`; }
function linkError(kind) { return ({
  'peer-unavailable': 'Nobody is waiting on this link: the challenge was closed, or your friend\'s page is not open any more.',
  'browser-incompatible': 'This browser cannot play live matches (it has no WebRTC).',
  'unavailable-id': 'This challenge is already open in another page.',
}[kind] || `Could not reach the meeting point (${kind}): check the connection and try again.`); }
const NOPE = {
  version: 'Your page and your friend\'s run different versions of the Arena: both reload the page, then try again.',
  host: 'Your friend\'s squad is not ready any more: ask them to check it.',
  squad: 'Your friend\'s page did not accept your squad: three heroes, none above the level cap.',
};

function renderDuelBox() {
  const box = $('#duelbox');
  if (!box) return;
  box.replaceChildren();
  box.classList.toggle('on', !!duel);
  const quiet = (text, fn) => { const b = el('button', 'quiet', text); b.type = 'button'; b.addEventListener('click', fn); return b; };
  if (!duel) {
    const ok = isComplete(readSquad());
    box.append(el('span', 'lb', 'Two players'), el('span', 'info', 'Challenge a friend: you send a link, your friend opens it, chooses a squad, and you fight live, turn by turn.'));
    const b = el('button', null, 'Challenge a friend ▸'); b.type = 'button';
    b.disabled = !ok; if (!ok) b.title = 'Choose your three heroes first';
    b.addEventListener('click', hostDuel);
    box.append(b);
    return;
  }
  if (duel.role === 'host') {
    box.append(el('span', 'lb', `Your challenge · Lv ${duel.cap}`));
    const inp = el('input'); inp.type = 'text'; inp.readOnly = true; inp.value = duelUrl(duel); inp.setAttribute('aria-label', 'Link of the challenge');
    inp.addEventListener('focus', () => inp.select());
    const cp = el('button', 'primary', 'Copy link'); cp.type = 'button';
    cp.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(inp.value); cp.textContent = 'Copied ✓'; } catch (e) { inp.focus(); cp.textContent = 'Selected: copy it'; }
      setTimeout(() => { cp.textContent = 'Copy link'; }, 1800);
    });
    box.append(inp, cp, quiet('cancel', leaveDuel));
    box.append(el('span', `line${duel.err ? ' err' : ''}`, duel.err || (duel.state === 'opening' ? 'Opening the challenge…'
      : duel.state === 'joined' ? 'Your friend is here: the battle starts…'
      : 'Waiting for your friend. Keep this page open: the challenge lives in it.')));
    return;
  }
  box.append(el('span', 'lb', '⚔ Challenge'));
  const info = el('span', 'info');
  info.append('from ', el('b', null, duel.by || 'a friend'), ` · level cap ${duel.cap}. Choose three heroes up to level ${duel.cap} and their skills, then Accept.`);
  box.append(info, quiet('leave the challenge', leaveDuel));
  const line = duel.err || (duel.state === 'connecting' ? 'Connecting to your friend…' : duel.state === 'joined' ? 'Connected: the battle starts…' : null);
  if (line) box.append(el('span', `line${duel.err ? ' err' : ''}`, line));
}

async function hostDuel() {
  const s = readSquad();
  if (!isComplete(s) || duel) return;
  try { await duelLib(); } catch (e) { console.error(e); $('#status').textContent = NO_LIB; return; }
  if (duel) return;
  const it = { role: 'host', code: DUEL.newCode(), cap: s.cap, by: legion.addr ? shortAddr(legion.addr) : '', at: Date.now() };
  intent.set(it);
  duel = { ...it, state: 'opening', link: null, them: null, err: null, busy: false };
  openHost(0);
  renderSetup();
}
async function openHost(tries) {
  const d = duel;
  if (!d || d.role !== 'host') return;
  d.state = 'opening';
  try { await duelLib(); } catch (e) { console.error(e); d.err = NO_LIB; renderDuelBox(); return; }
  if (duel !== d) return;
  d.link = DUEL.open('host', d.code, {
    ready: () => { if (duel !== d) return; d.state = 'waiting'; d.err = null; renderDuelBox(); },
    joined: () => { if (duel !== d) return; d.state = 'joined'; d.err = null; renderDuelBox(); },
    message: (m) => { if (duel === d) onDuelMessage(m); },
    left: (why) => { if (duel === d) friendLeft(why); },
    error: (kind) => {
      if (duel !== d) return;
      // back from the Legion Viewer, the meeting point may still hold the old page's place for a while
      if (kind === 'unavailable-id' && tries < 25) { d.link.close(); d.link = null; d.err = 'Reopening the challenge…'; renderDuelBox(); setTimeout(() => { if (duel === d) openHost(tries + 1); }, 3000); return; }
      d.err = linkError(kind); renderDuelBox();
    },
  });
  renderDuelBox();
}
/* What the battle needs of your squad: each hero as the chain has it, its skills and what it wears. */
async function squadPayload(s) {
  const Ls = await Promise.all(s.teams.A.map((slot) => legionOf(slot.hero)));
  return {
    who: legion.addr || null,
    heroes: s.teams.A.map((slot, i) => {
      const kit = kitOf(slot.hero, chainOf(Ls[i], slot.hero));
      return { hero: plain(slot.hero), loadout: plain({ skills: skillsOf(slot), weapon: kit.weapon, armor: kit.armor, offhand: kit.offhand, accessory: kit.accessory, pet: kit.pet }), look: kit.look ? plain(kit.look) : null };
    }),
  };
}
async function acceptDuel() {
  const d = duel;
  if (!d || d.role !== 'guest' || d.busy) return;
  const s = readSquad();
  if (s.cap !== d.cap) { setCap(d.cap); return; }
  if (!isComplete(s)) return;
  d.busy = true; d.state = 'connecting'; d.err = null;
  renderSetup();
  let squad = null;
  try { squad = await squadPayload(s); } catch (e) { console.error(e); }
  if (duel !== d) return;
  if (!squad) { d.busy = false; d.state = 'choosing'; d.err = 'Your squad could not be read: reload the page.'; renderSetup(); return; }
  try { await duelLib(); } catch (e) { console.error(e); d.busy = false; d.state = 'choosing'; d.err = NO_LIB; renderSetup(); return; }
  if (duel !== d) return;
  d.link = DUEL.open('guest', d.code, {
    joined: () => { if (duel !== d) return; d.state = 'joined'; d.link.send({ t: 'join', proto: DUEL.PROTO, build: BUILD, squad: JSON.stringify(squad) }); renderDuelBox(); },
    message: (m) => { if (duel === d) onDuelMessage(m); },
    left: (why) => { if (duel === d) friendLeft(why); },
    error: (kind) => { if (duel !== d) return; if (d.link) d.link.close(); d.link = null; d.busy = false; d.state = 'choosing'; d.err = linkError(kind); renderSetup(); },
  });
}
function leaveDuel() {
  const d = duel;
  if (!d) return;
  if (d.link) d.link.close();
  duel = null; mySide = 'A';
  intent.set(null);
  stopClock();
  if (!battle) renderSetup();
}
window.addEventListener('pagehide', () => { if (duel && duel.link) duel.link.close(); });

function onDuelMessage(m) {
  const d = duel;
  if (m.t === 'busy' || m.t === 'nope') {
    if (d.link) d.link.close();
    Object.assign(d, { link: null, busy: false, state: 'choosing', err: m.t === 'busy' ? 'Someone else already took this challenge.' : NOPE[m.why] || 'Your friend\'s page said no.' });
    renderSetup();
  } else if (m.t === 'join') hostJoin(m);
  else if (m.t === 'start') launchDuel(m);
  else if (m.t === 'move') { if (battle && m.g === d.game) { d.moves[m.dec] = m; tryRemote(); } }
  else if (m.t === 'sum') { if (battle && m.g === d.game) { d.sums.theirs[m.n] = m.h; checkSum(m.n); } }
  else if (m.t === 'void') { if (m.g === d.game) outOfStep(true); }
  else if (m.t === 'again') {
    if (!battle || m.g !== d.game || !(battle.over || battle.stopped)) return;
    d.again.them = true;
    log(`${cap(d.them)} wants a rematch.`, 'sys');
    rematchButton();
    if (d.role === 'host' && d.again.me) startMatch();
  }
}
async function hostJoin(m) {
  const d = duel;
  if (d.role !== 'host' || battle || !d.link) return;
  const no = (why) => d.link.send({ t: 'nope', why });
  if (m.proto !== DUEL.PROTO || m.build !== BUILD) return no('version');
  const s = readSquad();
  if (!isComplete(s) || s.cap !== d.cap) return no('host');
  let theirs = null;
  try { theirs = JSON.parse(m.squad); } catch (e) { /* not a squad */ }
  const fits = (p) => p && p.hero && p.hero.class && Number(p.hero.level) <= d.cap && p.loadout && Array.isArray(p.loadout.skills);
  if (!theirs || !Array.isArray(theirs.heroes) || theirs.heroes.length !== 3 || !theirs.heroes.every(fits)) return no('squad');
  d.squads = { A: await squadPayload(s), B: { who: isAddr(theirs.who) ? theirs.who : null, heroes: theirs.heroes } };
  if (duel === d && d.link) startMatch();
}
/* The host puts the match together and sends it; both pages start it from the same text. */
function startMatch() {
  const d = duel;
  const setup = { g: (d.game || 0) + 1, seed: newSeed(), cap: d.cap, scene: pickScene().id, A: d.squads.A, B: d.squads.B };
  const json = JSON.stringify(setup);
  d.link.send({ t: 'start', setup: json });
  launchDuel({ setup: json });
}
function launchDuel(m) {
  const d = duel;
  let setup = null;
  try { setup = JSON.parse(m.setup); } catch (e) { return; }
  if (!setup || !setup.A || !setup.B) return;
  if (battle) stopBattle();
  intent.set(null); // the challenge is taken: from here the match lives in the link
  Object.assign(d, { game: setup.g, state: 'battle', busy: false, err: null, moves: {}, wait: null, sums: { mine: {}, theirs: {} }, again: { me: false, them: false } });
  mySide = d.role === 'host' ? 'A' : 'B';
  const foe = setup[mySide === 'A' ? 'B' : 'A'];
  d.them = foe.who && isAddr(foe.who) ? shortAddr(foe.who) : 'your friend';
  const heroes = { A: [], B: [] }, loadouts = {}, looks = {};
  for (const t of ['A', 'B']) setup[t].heroes.forEach((p, i) => {
    heroes[t].push({ ...p.hero, __weaponSet: getHeroWeaponAnimationSet(p.hero, p.loadout.weapon ? { weapon1: p.loadout.weapon } : null) });
    loadouts[`${t}${i + 1}`] = p.loadout;
    if (p.look) looks[`${t}${i + 1}`] = p.look;
  });
  const b = C.createBattle({ heroes, rng: makeRng(setup.seed >>> 0), loadouts });
  Object.assign(b, { seed: setup.seed, stopped: false, turn: null, live: null, busy: false, cap: setup.cap, ai: { A: false, B: false }, remote: mySide === 'A' ? 'B' : 'A', dec: 0, acts: 0 });
  enterBattle(b, SCENES.find((x) => x.id === setup.scene) || SCENES[0], looks);
  log(`Live match against ${d.them}: your squad is on the left. ${TURN_S} seconds for each move.`, 'sys');
  $('#b-eyebrow').textContent = `Live · you vs ${d.them} · level cap ${setup.cap} · average level ${b.avgLvl.toFixed(1)} · ${scene.name} · seed ${setup.seed}`;
}

/* Your friend's turn: wait for the move, check it fits the battle, play it. */
function remoteTurn(f) {
  const b = battle;
  b.turn = f; b.live = null; b.busy = true;
  paint();
  turnLine(f, `${duel.them} is choosing`);
  refreshHand();
  duel.wait = { dec: b.dec, f };
  startClock(f, false);
  tryRemote();
}
function tryRemote() {
  const b = battle, d = duel;
  const w = d && d.wait;
  if (!b || !w || b.stopped) return;
  const m = d.moves[w.dec];
  if (!m) return;
  delete d.moves[w.dec]; d.wait = null;
  stopClock();
  const mv = m.f === w.f.id ? decodeMove(w.f, m) : null;
  if (!mv) { outOfStep(false, `${cap(d.them)}'s move does not fit this battle`); return; }
  b.busy = false;
  apply(w.f, mv);
}
function decodeMove(f, m) {
  const b = battle;
  if (m.kind === 'pass') return { kind: 'pass' };
  if (m.kind === 'move') {
    const o = byIdSafe(m.other);
    return o && o.team === f.team && Math.abs(o.pos - f.pos) === 1 && !C.has(f, 'root') ? { kind: 'move', other: o } : null;
  }
  if (m.kind === 'attack') {
    const t = byIdSafe(m.target);
    return t && C.enemyTargets(b, f, { kind: f.weapon.kind, reach: f.weapon.reach }).includes(t) ? { kind: 'attack', target: t } : null;
  }
  if (m.kind === 'skill') {
    const s = [...f.skills, ...f.traitActives, ...(f.petSkill ? [f.petSkill] : [])].find((x) => x.id === m.skill);
    if (!s || C.skillBlocked(b, f, s)) return null;
    if (!['enemy', 'ally', 'allyOther', 'fallen'].includes(s.target)) return { kind: 'skill', skill: s, target: null };
    const t = byIdSafe(m.target);
    return t && C.skillTargets(b, f, s).includes(t) ? { kind: 'skill', skill: s, target: t } : null;
  }
  return null;
}
const byIdSafe = (id) => (typeof id === 'string' && battle ? battle.fighters.find((x) => x.id === id) || null : null);

/* The clock of a move: yours plays a Basic Attack (or passes) when it runs out; your friend's, long past it, means they are gone. */
function startClock(f, mineTurn) {
  stopClock();
  const end = Date.now() + TURN_S * 1000;
  const box = $('#clock');
  box.hidden = false;
  const tick = () => {
    const b = battle;
    if (!b || b.stopped || b.over || !duel) { stopClock(); return; }
    const left = Math.ceil((end - Date.now()) / 1000);
    box.textContent = mineTurn ? `${Math.max(0, left)}s to choose` : left > 0 ? `${cap(duel.them)} · ${left}s` : `waiting for ${duel.them}…`;
    box.classList.toggle('low', mineTurn && left <= 10);
    if (mineTurn && left <= 0) { stopClock(); autoMove(f); } else if (!mineTurn && left <= -LATE_S) { stopClock(); friendLeft('timeout'); }
  };
  tick();
  clock = setInterval(tick, 250);
}
function stopClock() {
  if (clock) clearInterval(clock);
  clock = null;
  const c = $('#clock');
  if (c) c.hidden = true;
}
function autoMove(f) {
  const b = battle;
  if (!b || b.live !== f || b.busy) return;
  const ts = C.enemyTargets(b, f, { kind: f.weapon.kind, reach: f.weapon.reach });
  log(`Time is up: ${f.name} ${ts.length ? 'attacks' : 'passes'}.`, 'sys');
  mineAct(f, ts.length ? { kind: 'attack', target: ts[0] } : { kind: 'pass' });
}

/* The fingerprint of the battle after an action: turn, dice, and every hero's numbers. */
function fingerprint(b) {
  let s = `${b.tick}|${b.rng.state()}|${b.over ? b.winner : '-'}`;
  for (const f of b.fighters) s += `|${f.id}:${Math.round(f.hp)}:${Math.round(f.mp)}:${Math.round(f.initiative)}:${f.alive ? 1 : 0}:${f.ap || 0}:${f.fx.length}:${f.pos}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
function sendSum(b) {
  b.acts += 1;
  const h = fingerprint(b);
  duel.sums.mine[b.acts] = h;
  if (duel.link) duel.link.send({ t: 'sum', g: duel.game, n: b.acts, h });
  checkSum(b.acts);
}
function checkSum(n) {
  const d = duel;
  const a = d.sums.mine[n], c = d.sums.theirs[n];
  if (a == null || c == null) return;
  delete d.sums.mine[n]; delete d.sums.theirs[n];
  if (a !== c) outOfStep(false, `the two browsers computed different battles (action ${n})`);
}
/* Out of step (or a move that does not fit): the match is void, nobody wins. */
function outOfStep(fromThem, why) {
  const b = battle, d = duel;
  if (!b || !d || b.stopped || b.over) return;
  if (!fromThem && d.link) d.link.send({ t: 'void', g: d.game });
  stopClock();
  b.stopped = true; b.busy = true; b.live = null; b.turn = null;
  clearHand(); $('#groups').hidden = true;
  const t = $('#turnline'); t.className = 'turnline result'; t.textContent = 'Match void';
  const r = $('#result'); r.className = 'banner lose'; r.querySelector('b').textContent = 'Void'; r.hidden = false;
  log(`Match void: ${fromThem ? `${cap(d.them)}'s page found the two battles out of step` : why}. Nobody wins: play a rematch, and if it happens again both reload the page.`, 'ko');
  $('#btn-rematch').hidden = !d.link; $('#btn-next').hidden = true;
}
/* Your friend is gone: before the battle the host keeps waiting; during it, you win. */
function friendLeft(why) {
  const d = duel;
  if (!d) return;
  if (d.role === 'host' && !battle) {
    Object.assign(d, { state: 'waiting', them: null, err: `Your friend ${why === 'timeout' ? 'lost the connection' : 'left'} before the battle. The link still works.` });
    renderSetup();
    return;
  }
  if (d.link) d.link.close();
  d.link = null;
  if (!battle) { Object.assign(d, { busy: false, state: 'choosing', err: 'Your friend closed the challenge.' }); renderSetup(); return; }
  const b = battle;
  if (!b.over && !b.stopped) {
    b.stopped = true; b.over = true; b.winner = mySide;
    finish(why === 'timeout' ? `${cap(d.them)} stopped answering: you win` : `${cap(d.them)} left the match: you win`);
  } else {
    log(`${cap(d.them)} left.`, 'sys');
    $('#btn-rematch').hidden = true;
  }
}
function askRematch() {
  const d = duel;
  if (!d || !d.link || !battle) return;
  d.again.me = true;
  d.link.send({ t: 'again', g: d.game });
  rematchButton();
  if (d.role === 'host' && d.again.them) startMatch();
}
function rematchButton() {
  const bt = $('#btn-rematch'), d = duel;
  if (!d || !d.again) return;
  bt.disabled = d.again.me;
  bt.textContent = d.again.me ? (d.again.them ? 'Starting…' : 'Rematch asked…') : d.again.them ? `Rematch: ${d.them} wants it` : 'Rematch';
}

if (duel && duel.role === 'host') openHost(0);
