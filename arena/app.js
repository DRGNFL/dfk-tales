import { getAssetConfig } from 'https://esm.sh/@defikingdoms/game-sdk@0.1.0?deps=ethers@5.8.0';
import {
  HeroRenderer, HERO_ANIMATIONS, getHeroWeaponAnimationSet, weaponAnimation,
} from 'https://esm.sh/@defikingdoms/game-sdk@0.1.0/renderer?deps=ethers@5.8.0';
import { mountWallet } from '../assets/session.js?v=1';
import { readSquad, onSquadChange, setSkills, isComplete } from '../assets/squad.js?v=2';
import { battleKit, heroLook, SLOTS, onArmoryChange } from '../assets/armory.js?v=1';
import { ACT_AT, makeRng, codexBudget } from './engine.js?v=1';
import * as C from './combat.js?v=4';
import { CLASS_SKILLS } from './skills.js?v=1';
import { traitsOf } from './traits.js?v=2';
import { petInBattle } from './pets.js?v=1';
import { SQUIRE } from './rules.js?v=2';
import { svg, iconOf } from './icons.js?v=1';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const cap = (s) => (s ? String(s)[0].toUpperCase() + String(s).slice(1) : '');
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mountWallet($('#wallet'));

const BG = `${getAssetConfig().assetsBaseUrl}/hero-card/assets/images/hero/backgrounds/`;
$('#field').style.setProperty('--scene', `url("${BG}colosseum.gif")`);

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

/* ================= setup: the squads and the Codex ================= */
const skillsOf = (slot) => slot.skills || C.defaultLoadout(slot.hero);

function renderSetup() {
  const s = readSquad();
  const cols = ['A', 'B'].map((team) => {
    const col = el('div', `squad ${team.toLowerCase()}`);
    const h2 = el('h2');
    h2.append(el('span', null, team === 'A' ? 'Left team' : 'Right team'), el('span', null, `${s.teams[team].filter(Boolean).length} / 3`));
    col.append(h2);
    s.teams[team].forEach((slot, i) => col.append(sheet(team, i, slot)));
    return col;
  });
  $('#squads').replaceChildren(...cols);
  const ok = isComplete(s);
  $('#btn-fight').disabled = !ok;
  const n = ['A', 'B'].reduce((t, k) => t + s.teams[k].filter(Boolean).length, 0);
  $('#status').textContent = ok ? `Level cap ${s.cap}. One skill per tier, then Fight.`
    : n === 0 ? 'No squad yet: open the Legion Viewer and press Arena squad.'
    : `${n} of 6 heroes${n === 6 ? ', but someone is above the level cap' : ''}. Finish the squad in the Legion Viewer.`;
}

function sheet(team, i, slot) {
  if (!slot) return el('div', 'sheet emptyslot', `P${i + 1} · empty`);
  const h = slot.hero;
  const box = el('div', 'sheet');
  const head = el('div', 'sh-head');
  head.append(el('b', null, h.name), el('span', null, `P${i + 1} · ${cap(h.class)} / ${cap(h.subClass)} · Lv ${h.level}`));
  box.append(head);
  const desc = el('div', 'desc');
  const say = (name, text) => { desc.replaceChildren(el('b', null, name), ` ${text || ''}`); };

  // What it wears (seven slots, as on its card), then its traits, all as small icons with a tooltip.
  const line = el('div', 'sh-line');
  const worn = heroLook(h).worn;
  const set = getHeroWeaponAnimationSet(h, worn.weapon1 ? { weapon1: worn.weapon1 } : null);
  for (const sl of SLOTS) {
    const v = worn[sl.key];
    const ic = el('span', `slotic${v ? ' on' : ''}${sl.kind === 'pet' ? ' pet' : ''}`);
    if (v && v.image) { const im = document.createElement('img'); im.src = v.image; im.alt = ''; ic.append(im); } else ic.textContent = sl.kind === 'pet' ? (v ? '◆' : '◇') : '·';
    let text = v ? v.name : sl.kind === 'weapon' && sl.key === 'weapon1' ? `${(SQUIRE[set] || SQUIRE['1H Sword']).name}, on loan` : sl.key === 'armor' ? 'Medium armour, on loan' : 'Empty';
    if (v && sl.kind === 'pet') { const b = petInBattle(v).bonus; text = b ? `${v.name}: ${b.name} ${'★'.repeat(b.tier)}. ${b.text}` : `${v.name}: no combat bonus`; }
    tipOn(ic, () => showTip(ic, sl.label, null, text));
    line.append(ic);
  }
  line.append(el('span', 'gap'));
  const tr = traitsOf(h);
  for (const t of tr.actives) { const c = el('span', 'chip', t.name); tipOn(c, () => showTip(c, t.name, 'Active trait · once per battle', t.text)); line.append(c); }
  for (const t of tr.passives) { const c = el('span', 'chip dim', t.name); tipOn(c, () => showTip(c, t.name, 'Passive trait', t.text)); line.append(c); }
  box.append(line);

  // Codex: one skill per tier
  const list = CLASS_SKILLS[String(h.class).toLowerCase()];
  const { mainTiers, subPoints } = codexBudget(h.level);
  if (!list) box.append(el('div', 'note', `No Codex for the ${cap(h.class)} yet: basic attack, traits and pet.`));
  else {
    const picks = skillsOf(slot).slice();
    const codex = el('div', 'codex');
    for (let tier = 1; tier <= 5; tier++) {
      const row = el('div', `tier${tier > mainTiers ? ' locked' : ''}`);
      row.append(el('em', null, `T${tier}`));
      for (const sk of list.filter((x) => x.tier === tier)) {
        const b = el('button', sk.passive ? 'pas' : null); b.type = 'button';
        b.innerHTML = svg(iconOf(sk.id));
        b.append(sk.name);
        b.setAttribute('aria-pressed', String(picks.includes(sk.id)));
        b.addEventListener('mouseenter', () => say(`${sk.name} · ${sk.branch}${sk.passive ? ' · passive' : ` · ${Math.round(sk.mana[0] + sk.mana[1] * h.level)} MP${sk.amnesia ? ` · Amnesia ${sk.amnesia}` : ''}${sk.channel ? ` · channel ${sk.channel}` : ''}`}`, sk.text + (sk.note ? ` (${sk.note})` : '')));
        b.addEventListener('click', () => {
          const next = picks.filter((id) => !list.some((x) => x.id === id && x.tier === tier));
          next.push(sk.id);
          setSkills(team, i, next);
        });
        row.append(b);
      }
      codex.append(row);
    }
    box.append(codex, desc);
    if (subPoints) box.append(el('div', 'note', `+${subPoints} ${cap(h.subClass)} points: the subclass Codex comes with the second weapon.`));
  }
  return box;
}
onSquadChange(() => { if (!battle) renderSetup(); });
onArmoryChange(() => { if (!battle) renderSetup(); });
renderSetup();

/* ================= battle ================= */
/* One field: the game's colosseum, doubled and mirrored into a wide arena. Heroes stand on the scene's ground row
   (row 48 of 52, as on the game's card): left team P3 P2 P1 facing right, right team P1 P2 P3 facing left. */
const SLOT_X = { A: { 3: 8, 2: 21.5, 1: 35 }, B: { 1: 65, 2: 78.5, 3: 92 } };
const TICK_MS = 45;
/* Hero size: the rig canvas is as tall as the field; at zoom 1.05 the hero stands about 42% of it (Hero Viewer: 50%).
   The head, for the portraits: the hero is 0.404·zoom of the canvas tall with the feet at 93%; the head is its top fifth. */
const ZOOM = 1.05;
const HEAD = { x: 0.5, cy: 0.93 - 0.404 * ZOOM * 0.81, size: 0.404 * ZOOM * 0.42 };
let battle = null;
let pending = null; // { skill } or { skill: null } for the basic attack

$('#btn-fight').addEventListener('click', () => startBattle());
$('#btn-new').addEventListener('click', () => { stopBattle(); $('#battle').hidden = true; $('#setup').hidden = false; renderSetup(); });
$('#btn-rematch').addEventListener('click', () => { stopBattle(); startBattle(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && battle && battle.turn && !battle.busy) setPending(battle.turn, null); });

function stopBattle() {
  if (!battle) return;
  battle.stopped = true;
  battle.fighters.forEach((f) => f.renderer && f.renderer.destroy && f.renderer.destroy());
  battle = null;
}

function startBattle() {
  const s = readSquad();
  if (!isComplete(s)) return;
  const heroes = { A: [], B: [] }, loadouts = {}, looks = {};
  for (const team of ['A', 'B']) for (const slot of s.teams[team]) {
    const kit = battleKit(slot.hero);
    const h = { ...slot.hero, __weaponSet: getHeroWeaponAnimationSet(slot.hero, kit.weapon ? { weapon1: kit.weapon } : null) };
    heroes[team].push(h);
    loadouts[String(h.id)] = { skills: skillsOf(slot), weapon: kit.weapon, armor: kit.armor, offhand: kit.offhand, accessory: kit.accessory, pet: kit.pet };
    looks[String(h.id)] = kit.look;
  }
  const seed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0;
  const b = C.createBattle({ heroes, rng: makeRng(seed), loadouts });
  Object.assign(b, { seed, stopped: false, turn: null, busy: false, cap: s.cap });
  battle = b;
  $('#setup').hidden = true; $('#battle').hidden = false;
  $('#btn-rematch').hidden = true;
  $('#b-eyebrow').textContent = `Level cap ${s.cap} · average level ${b.avgLvl.toFixed(1)} · seed ${seed}`;
  $('#log').replaceChildren();
  log(`Battle starts. Seed ${seed}.`, 'sys');
  b.fighters.filter((f) => f.luckyStart).forEach((f) => log(`${f.name} starts lucky: triple Initiative.`, 'sys'));
  buildField(looks); buildPlates(); buildTimebar(); clearHand(); paint();
  $('#field').scrollIntoView({ block: 'start', behavior: 'smooth' });
  runLoop();
}

const byId = (id) => battle.fighters.find((f) => f.id === id);
const nameOf = (id) => { const f = id && byId(id); return f ? f.name : '?'; };

function buildField(looks) {
  const field = $('#field');
  field.querySelectorAll('.ftr').forEach((n) => n.remove());
  for (const f of battle.fighters) {
    const node = el('div', `ftr ${f.team.toLowerCase()}`);
    const canvas = el('canvas');
    const body = el('button', 'body'); body.type = 'button'; body.setAttribute('aria-label', f.name);
    node.append(canvas, el('span', 'chance'), body);
    body.addEventListener('click', () => onFighterClick(f));
    tipOn(body, () => showTip(body, f.name, `${cap(f.hero.class)} · Lv ${f.level} · ${fmt(f.hp)} / ${fmt(f.hpMax)} HP`, null));
    f.node = node; f.canvas = canvas;
    field.append(node);
    f.idle = weaponAnimation(f.weaponSet, 'Idle');
    const look = looks[String(f.hero.id)];
    f.renderer = new HeroRenderer(canvas, f.hero, { animation: f.idle, mix: 0.12, zoom: ZOOM, ...(look ? { gear: look } : {}), onEvent: (ev) => { if (ev.name === 'hit' && f.onHit) { const fn = f.onHit; f.onHit = null; fn(); } } });
  }
  place();
}
function place() { for (const f of battle.fighters) f.node.style.left = `${SLOT_X[f.team][f.pos] - 6}%`; }

/* Copy the head out of the hero's own canvas: live portraits for the plates and the timebar. */
function drawHead(f, target) {
  const src = f.canvas, ctx = target.getContext('2d');
  const W = src.width, H = src.height;
  if (!W || !H) return;
  const size = HEAD.size * H, sx = HEAD.x * W - size / 2, sy = HEAD.cy * H - size / 2;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.save();
  if (f.team === 'A') { ctx.translate(target.width, 0); ctx.scale(-1, 1); }
  try { ctx.drawImage(src, sx, sy, size, size, 0, 0, target.width, target.height); } catch (e) { /* not drawn yet */ }
  ctx.restore();
}

/* The HUD sides: one plate per hero, stacked P1 to P3, portrait outward. */
function buildPlates() {
  for (const team of ['A', 'B']) $(`#side-${team.toLowerCase()}`).replaceChildren();
  for (const f of battle.fighters) {
    const p = el('button', 'plate'); p.type = 'button';
    const pt = el('div', 'pt'); const pc = el('canvas'); pc.width = 44; pc.height = 44; pt.append(pc);
    const info = el('div');
    const nm = el('div', 'nm');
    nm.append(f.name.split(' ')[0], el('small', null, ''));
    info.append(nm, bar('hp'), bar('mp'));
    if (f.cls === 'wizard') info.append(bar('ap'));
    info.append(el('div', 'tags'));
    p.append(pt, info);
    p.addEventListener('click', () => onFighterClick(f));
    tipOn(p, () => { const sh = C.sheet(battle, f); showTip(p, f.name, `${cap(f.hero.class)} · Lv ${f.level} · P${f.pos} · ${f.weapon.name}${f.weapon.loaned ? ' (loaned)' : ''}`, `HP ${fmt(f.hp)} / ${fmt(f.hpMax)} · MP ${fmt(f.mp)} / ${fmt(f.mpMax)} · ATK ${fmt(sh.attack)} · SPELL ${fmt(sh.spell)} · P.DEF ${fmt(sh.pdef)} · M.DEF ${fmt(sh.mdef)} · EVA ${pct(sh.evasion)} · CRIT ${pct(sh.crit)} · Speed ${sh.speed.toFixed(1)}`); });
    f.plate = p; f.portrait = pc;
    $(`#side-${f.team.toLowerCase()}`).append(p);
  }
}
function bar(cls) { const d = el('div', `bar ${cls}`); d.append(el('i'), el('u')); return d; }
function setBar(node, cls, v, max, extra) {
  const d = node.querySelector(`.bar.${cls}`);
  if (!d) return;
  d.querySelector('i').style.width = `${max ? Math.max(0, Math.min(100, (v / max) * 100)) : 0}%`;
  d.querySelector('u').style.width = `${extra && max ? Math.min(100, (extra / max) * 100) : 0}%`;
}

function buildTimebar() {
  const bar2 = $('#timebar');
  bar2.querySelectorAll('.mk').forEach((m) => m.remove());
  for (const f of battle.fighters) {
    const m = el('div', `mk ${f.team.toLowerCase()}`);
    const c = el('canvas'); c.width = 34; c.height = 34; m.append(c);
    m.title = f.name;
    f.marker = m; f.markerCanvas = c;
    bar2.append(m);
  }
}

function paint() {
  const b = battle;
  const turnId = b.turn && b.turn.id;
  for (const f of b.fighters) {
    const goal = f.channel ? f.channel.need : ACT_AT;
    f.marker.style.left = `${Math.min(100, (Math.max(0, f.initiative) / goal) * 100) * 0.95 + 2.5}%`;
    f.marker.classList.toggle('down', !f.alive);
    f.marker.classList.toggle('turn', f.id === turnId);
    f.marker.classList.toggle('ch', !!f.channel);
    f.marker.title = f.channel ? `${f.name} · channelling ${f.channel.skill.name}` : f.name;
    for (const n of [f.node, f.plate]) { n.classList.toggle('turn', f.id === turnId); n.classList.toggle('down', !f.alive); }
    f.plate.style.order = f.pos;
    const barrier = f.fx.find((e) => e.key === 'barrier');
    setBar(f.plate, 'hp', f.hp, f.hpMax, barrier ? barrier.value : 0);
    setBar(f.plate, 'mp', f.mp, f.mpMax);
    setBar(f.plate, 'ap', f.ap || 0, 100);
    f.plate.querySelector('.nm small').textContent = `${fmt(f.hp)}`;
    f.plate.querySelector('.tags').replaceChildren(...C.tags(f).map((t) => el('span', t.bad ? 'bad' : null, t.text)));
    drawHead(f, f.portrait);
    drawHead(f, f.markerCanvas);
  }
  $('#tick').textContent = `tick ${b.tick}`;
}

function log(text, cls) { $('#log').prepend(el('li', cls || null, text)); }
function floatText(f, text, cls, n = 0) {
  const s = el('span', `float${cls ? ` ${cls}` : ''}`, text);
  s.style.marginTop = `${-n * 3}%`;
  f.node.append(s);
  setTimeout(() => s.remove(), 1300);
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
    if (e.type === 'skill') { if (e.skill !== 'Attack') log(`${nameOf(e.source)}: ${e.skill}${e.target ? ` → ${nameOf(e.target)}` : ''}`, 'hit'); continue; }
    if (e.type === 'damage') {
      floatText(t, `${e.amount}${e.crit ? '!' : ''}`, e.crit ? 'crit' : null, bump(t.id));
      if (t.alive && e.amount > 0) { playAnim(t, HERO_ANIMATIONS.hurt, false); setTimeout(() => t.alive && !b.stopped && playAnim(t, t.idle, true), 700); }
      const bits = [e.crit && 'critical', e.blocked && 'blocked', e.absorbed && `${e.absorbed} absorbed`, e.chance != null && `${Math.round(e.chance * 100)}%`].filter(Boolean);
      log(`${e.label ? `${e.label} ` : ''}→ ${t.name} −${e.amount}${bits.length ? ` (${bits.join(', ')})` : ''}`, 'sub hit');
    } else if (e.type === 'miss') { floatText(t, 'MISS', 'miss', bump(t.id)); log(`${e.label ? `${e.label} ` : ''}→ ${t.name} miss (${Math.round(e.chance * 100)}%)`, 'sub'); }
    else if (e.type === 'heal') { if (e.amount > 0) floatText(t, `+${e.amount}${e.crit ? '!' : ''}`, 'heal', bump(t.id)); log(`${e.label}: ${t.name} +${e.amount}${e.crit ? ' (critical)' : ''}`, 'sub'); }
    else if (e.type === 'status') { if (e.tag && t) floatText(t, e.tag, `st${/resist|Unstoppable|BARRIER|SHIELD|GUARD|MIGHT|SWIFT|BEACON|HASTE|IRON|CRIT|BOND|HARDENED|LAST|SKIN/.test(e.tag + e.text) ? ' good' : ''}`, bump(t.id)); log(e.text, 'sub'); }
    else if (e.type === 'ko') { playAnim(t, HERO_ANIMATIONS.down, false); log(e.rising ? `${t.name} falls…` : `${t.name} is down.`, 'ko'); }
    else if (e.type === 'revive') {
      if (e.tag) floatText(t, e.tag, 'st good', bump(t.id));
      if (hasAnim(t, HERO_ANIMATIONS.getUp)) { playAnim(t, HERO_ANIMATIONS.getUp, false); setTimeout(() => t.alive && !b.stopped && playAnim(t, t.idle, true), (t.renderer.duration(HERO_ANIMATIONS.getUp) || 1) * 1000); }
      else playAnim(t, t.idle, true);
      log(e.text, 'hit');
    }
    else if (e.type === 'move') { place(); log(e.text, 'sub'); }
    else if (e.type === 'channel') log(e.text, 'hit');
  }
}

/* Play the actor's animation and show the results when the blow lands (the rig's hit marker, or about two thirds in). */
async function animate(f, events, anim) {
  const b = battle;
  let landed = false;
  const land = () => { if (landed || b.stopped) return; landed = true; showEvents(events); paint(); };
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
/* Risings (Second Life) after an action: show them and give them a moment. */
async function after(events) { if (!events || !events.length) return; showEvents(events); paint(); await sleep(1100); }

/* The timebar runs: every tick each standing hero gains its Speed; whoever reaches 1000 first acts, channels complete on their own. */
async function runLoop() {
  const b = battle;
  while (b && !b.stopped && !b.over) {
    const f = C.readyFighter(b);
    if (!f) {
      const ev = C.tickOnce(b);
      if (ev.length) { showEvents(ev); if (ev.some((e) => e.type === 'revive')) await sleep(1000); }
      paint();
      await sleep(TICK_MS);
      continue;
    }
    if (f.channel) {
      const s = f.channel.skill;
      b.turn = f; turnLine(f, `completes ${s.name}`); paint();
      const ev = C.completeChannel(b, f);
      await animate(f, ev, animFor(f, s));
      if (ev.some((e) => e.type === 'revive')) await sleep(1000);
      b.turn = null; paint();
      continue;
    }
    const st = C.startTurn(b, f);
    if (st.events.length) { b.turn = f; showEvents(st.events); paint(); await sleep(550); }
    if (b.stopped || b.over) break;
    if (st.lost) { await after(C.endTurn(b, f, 'action')); b.turn = null; paint(); await sleep(250); continue; }
    offerTurn(f);
    return;
  }
  if (b && b.over && !b.stopped) finish();
}

function turnLine(f, extra) {
  const t = $('#turnline');
  t.className = 'turnline';
  t.replaceChildren('Turn · ', el('b', f.team === 'B' ? 'b' : null, f.name), extra ? ` · ${extra}` : '');
}
function clearHand() {
  for (const id of ['#g-actions', '#g-skills', '#g-passives']) $(id).replaceChildren();
  $('#turnline').replaceChildren();
}

function offerTurn(f) {
  const b = battle;
  b.turn = f; b.busy = false;
  paint();
  turnLine(f);
  renderHand(f);
  setPending(f, null);
}

/* The action bar: Actions & abilities (attack, move, pass, active traits, pet skill), Skills (Codex), Passives. */
function renderHand(f) {
  const b = battle;
  const A = $('#g-actions'), K = $('#g-skills'), P = $('#g-passives');
  A.replaceChildren(); K.replaceChildren(); P.replaceChildren();
  const pad = (box) => { while (box.children.length % 4) box.append(el('span', 'tile empty')); };

  // basic attack
  const atk = tile(f.weapon.magic ? 'staff' : f.weapon.kind === 'ranged' ? 'bow' : 'sword', 'primary');
  tipOn(atk, () => showTip(atk, 'Attack', `${f.weapon.name} · ${f.weapon.kind}${f.weapon.reach === 2 ? ' · reach 2' : ''}`, f.weapon.kind === 'melee' ? 'Hits the first enemy standing (reach 2: one of the first two).' : 'Click the enemy to hit.'));
  atk.addEventListener('click', () => {
    if (b.busy) return;
    setPending(f, null);
    const ts = C.enemyTargets(b, f, { kind: f.weapon.kind, reach: f.weapon.reach });
    if (ts.length === 1) doAttack(f, ts[0]);
  });
  A.append(atk);
  // move one place forward or back, pass
  const mates = C.alliesOf(b, f);
  for (const d of [-1, 1]) {
    const other = mates.find((m) => m.pos === f.pos + d);
    const t = tile(f.team === 'A' ? (d < 0 ? 'right' : 'left') : (d < 0 ? 'left' : 'right'));
    if (!other || C.has(f, 'root')) t.disabled = true;
    tipOn(t, () => showTip(t, other ? `Move to P${other.pos}` : 'Move', other ? `Swap places with ${other.name}` : 'Nobody there', 'Gives back 250 Initiative.', C.has(f, 'root') ? 'Rooted' : null));
    t.addEventListener('click', () => { if (b.busy || !other) return; b.busy = true; hideTip(); clearTargets(); showEvents(C.reposition(b, f, other)); place(); finishAction(f, 'reposition'); });
    A.append(t);
  }
  const pass = tile('pass');
  tipOn(pass, () => showTip(pass, 'Pass', null, 'Gives back 400 Initiative.'));
  pass.addEventListener('click', () => { if (b.busy) return; b.busy = true; hideTip(); clearTargets(); log(`${f.name} passes.`); finishAction(f, 'pass'); });
  A.append(pass);
  for (const s of f.traitActives) A.append(actTile(f, s, 'trait'));
  if (f.petSkill) A.append(actTile(f, f.petSkill, 'pet'));
  pad(A);

  for (const s of f.skills) K.append(actTile(f, s));
  if (!CLASS_SKILLS[f.cls]) { const t = tile('ring', 'passive'); tipOn(t, () => showTip(t, `No Codex for the ${cap(f.cls)} yet`, null, 'Its class skills come after Knight, Archer and Priest.')); K.append(t); }
  pad(K);

  for (const p of f.passives) P.append(passiveTile(iconOf(p.id), p.name, 'Codex passive', p.text));
  for (const p of f.traitPassives) P.append(passiveTile('ring', p.name, 'Passive trait', p.text, 'T'));
  if (f.pet && f.pet.bonus && !f.petSkill) { const bn = f.pet.bonus; P.append(passiveTile('paw', `${bn.name} ${'★'.repeat(bn.tier)}`, `${f.pet.name}${bn.kind === 'inactive' ? ' · not in play yet' : ''}`, bn.text, 'P')); }
  pad(P);
}
function tile(icon, cls) { const t = el('button', `tile${cls ? ` ${cls}` : ''}`); t.type = 'button'; t.innerHTML = svg(icon); return t; }
function passiveTile(icon, name, meta, text, tag) {
  const t = tile(icon, 'passive');
  if (tag) t.append(el('span', 'tag', tag));
  tipOn(t, () => showTip(t, name, meta, text));
  return t;
}
function actTile(f, s, kind) {
  const b = battle;
  const t = tile(iconOf(s.id), kind || null);
  const blocked = C.skillBlocked(b, f, s);
  const needs = ['enemy', 'ally', 'fallen'].includes(s.target);
  const targets = needs ? C.skillTargets(b, f, s) : [];
  const noTarget = needs && !targets.length;
  if (kind) t.append(el('span', 'tag', kind === 'pet' ? 'P' : 'T'));
  if (!s.trait) t.append(el('span', 'mp', String(C.manaCost(f, s))));
  if (!s.trait && f.cd[s.id] > 0) t.append(el('span', 'cd', String(f.cd[s.id])));
  if (s.trait && f.used[s.id]) t.append(el('span', 'cd', '×'));
  t.disabled = !!blocked || noTarget;
  t.dataset.skill = s.id;
  const meta = [kind === 'trait' ? 'Active trait · once per battle' : kind === 'pet' ? `${f.pet.name} · pet skill · once per battle` : `${C.manaCost(f, s)} MP${s.amnesia ? ` · Amnesia ${s.amnesia}` : ''}`, s.channel && `channel ${s.channel}`].filter(Boolean).join(' · ');
  const why = blocked || (noTarget ? (s.target === 'fallen' ? 'Nobody is down' : 'No target in reach') : null);
  tipOn(t, () => showTip(t, s.name, meta, `${s.text}${s.note ? ` (${s.note})` : ''}`, why));
  t.addEventListener('click', () => {
    if (b.busy || t.disabled) return;
    hideTip();
    if (pending && pending.skill === s) { setPending(f, null); return; }
    if (!needs) { doSkill(f, s, null); return; }
    if (targets.length === 1 && s.target === 'enemy') { doSkill(f, s, targets[0]); return; }
    setPending(f, s);
  });
  return t;
}

function clearTargets() {
  for (const x of battle.fighters) for (const n of [x.node, x.plate]) n.classList.remove('can', 'ally');
  for (const x of battle.fighters) x.node.querySelector('.chance').textContent = '';
  document.querySelectorAll('.tile.pick').forEach((n) => n.classList.remove('pick'));
}
/* What a click on a hero does now: the basic attack (default) or the chosen skill. */
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
function onFighterClick(t) {
  const b = battle;
  const f = b && b.turn;
  if (!f || b.busy || !t.node.classList.contains('can')) return;
  if (pending && pending.skill) doSkill(f, pending.skill, t);
  else doAttack(f, t);
}

async function doAttack(f, t) {
  const b = battle;
  if (b.busy) return;
  b.busy = true; hideTip(); clearTargets(); lockHand();
  const events = C.basicAttack(b, f, t);
  log(`${f.name} attacks ${t.name}`, 'hit');
  await animate(f, events, animFor(f, null));
  if (b.stopped) return;
  finishAction(f, 'action');
}
async function doSkill(f, s, t) {
  const b = battle;
  if (b.busy) return;
  b.busy = true; hideTip(); clearTargets(); lockHand();
  const events = C.useSkill(b, f, s, t);
  await animate(f, events, animFor(f, s, s.channel ? 'channel' : null));
  if (b.stopped) return;
  finishAction(f, 'action', s);
}
function lockHand() { document.querySelectorAll('.tile').forEach((n) => { if (n.tagName === 'BUTTON') n.disabled = true; }); }
async function finishAction(f, kind, s = null) {
  const b = battle;
  const ev = C.endTurn(b, f, kind, s);
  b.turn = null;
  clearHand();
  paint();
  await after(ev);
  if (b.stopped) return;
  if (b.over) finish(); else runLoop();
}

function finish() {
  const b = battle;
  const w = b.winner;
  b.turn = null;
  paint();
  clearHand();
  const t = $('#turnline');
  t.className = 'turnline result';
  t.textContent = `${w === 'A' ? 'Left' : 'Right'} team wins`;
  $('#btn-rematch').hidden = false;
  log(`${w === 'A' ? 'Left' : 'Right'} team wins after ${b.tick} ticks.`, 'ko');
  C.teamOf(b, w).filter((x) => x.alive).forEach((x) => playAnim(x, weaponAnimation(x.weaponSet, 'Celebrate'), true));
}
