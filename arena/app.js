import { getAssetConfig } from 'https://esm.sh/@defikingdoms/game-sdk@0.1.0?deps=ethers@5.8.0';
import {
  HeroRenderer, HERO_ANIMATIONS, getHeroWeaponAnimationSet, weaponAnimation,
} from 'https://esm.sh/@defikingdoms/game-sdk@0.1.0/renderer?deps=ethers@5.8.0';
import { mountWallet } from '../assets/session.js?v=1';
import { readSquad, onSquadChange, setSkills, isComplete } from '../assets/squad.js?v=1';
import { ACT_AT, makeRng, codexBudget } from './engine.js?v=1';
import * as C from './combat.js?v=3';
import { CLASS_SKILLS } from './skills.js?v=1';
import { traitsOf } from './traits.js?v=1';
import { petInBattle } from './pets.js?v=1';
import { weaponFromGear } from './gear.js?v=1';
import { SQUIRE } from './rules.js?v=2';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const cap = (s) => (s ? String(s)[0].toUpperCase() + String(s).slice(1) : '');
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const first = (name) => String(name).split(' ')[0];
mountWallet($('#wallet'));

const BG = `${getAssetConfig().assetsBaseUrl}/hero-card/assets/images/hero/backgrounds/`;
$('#field').style.setProperty('--scene', `url("${BG}colosseum.gif")`);

/* ================= setup: the squads and the Codex ================= */
const gearOfSlot = (slot) => ({ weapon1: slot.weapon || null, offhand1: slot.offhand || null, armor: slot.armor || null, accessory: slot.accessory || null });
const hasGear = (g) => !!(g.weapon1 || g.offhand1 || g.armor || g.accessory);
const weaponSetFor = (slot) => getHeroWeaponAnimationSet(slot.hero, slot.weapon ? gearOfSlot(slot) : null);
const skillsOf = (slot) => slot.skills || C.defaultLoadout(slot.hero);

function renderSetup() {
  const s = readSquad();
  const cols = ['A', 'B'].map((team) => {
    const col = el('div', `squad ${team.toLowerCase()}`);
    const h2 = el('h2');
    h2.append(el('span', null, team === 'A' ? 'Left team' : 'Right team'), el('span', null, `${s.teams[team].filter(Boolean).length} / 3`));
    col.append(h2);
    s.teams[team].forEach((slot, i) => col.append(sheet(s, team, i, slot)));
    return col;
  });
  $('#squads').replaceChildren(...cols);
  const ok = isComplete(s);
  $('#btn-fight').disabled = !ok;
  const n = ['A', 'B'].reduce((t, k) => t + s.teams[k].filter(Boolean).length, 0);
  $('#status').textContent = ok ? `Level cap ${s.cap}. Pick one skill per tier for every hero, then Fight.`
    : n === 0 ? 'No squad yet. Open the Legion Viewer, press Arena squad, and add three heroes a side.'
    : `${n} of 6 heroes${n === 6 ? ', but someone is above the level cap' : ''}. Finish the squad in the Legion Viewer.`;
}

function sheet(s, team, i, slot) {
  if (!slot) return el('div', 'sheet emptyslot', `P${i + 1} · empty: add a hero in the Legion Viewer`);
  const h = slot.hero;
  const box = el('div', 'sheet');
  const head = el('div', 'sh-head');
  head.append(el('b', null, h.name), el('span', null, `P${i + 1} · ${cap(h.class)} / ${cap(h.subClass)} · Lv ${h.level} · ${cap(h.rarity)}`));
  box.append(head);
  const desc = el('div', 'desc', 'Point at a skill, trait or bonus to read it.');
  const say = (name, text) => { desc.replaceChildren(el('b', null, name), ` ${text || ''}`); };

  // kit: weapon, armour, offhand, accessory, pet
  const kit = el('div', 'sh-kit');
  const line = (label, text, loan, title) => { const d = el('div', loan ? 'loan' : null); d.append(el('i', null, label), text); if (title) d.title = title; kit.append(d); };
  const set = weaponSetFor(slot);
  if (slot.weapon) { const w = weaponFromGear(slot.weapon); line('WPN', `${slot.weapon.name} · ${slot.weapon.typeName} · ${w.kind}${w.reach === 2 ? ' reach 2' : ''}`, false, w.mods.map((m) => m.text).join('\n')); }
  else { const w = SQUIRE[set] || SQUIRE['1H Sword']; line('WPN', `${w.name} · ${w.kind} (loaned)`, true); }
  line('ARM', slot.armor ? `${slot.armor.name} · ${slot.armor.typeName}` : 'Medium armour (loaned)', !slot.armor);
  line('OFF', slot.offhand ? slot.offhand.name : String(h.class).toLowerCase() === 'knight' ? "Squire's Shield (loaned)" : '—', !slot.offhand);
  if (slot.accessory) line('ACC', slot.accessory.name);
  const pet = slot.pet ? petInBattle(slot.pet) : null;
  if (pet) {
    const b = pet.bonus;
    line('PET', b ? `${pet.name} · ${b.name} ${'★'.repeat(b.tier)}${b.kind === 'activatable' ? ' · skill' : b.kind === 'inactive' ? ' · not in play' : ''}` : `${pet.name} · no combat bonus`, !b, b ? b.text : '');
  } else line('PET', '—', true);
  box.append(kit);

  // traits
  const tr = traitsOf(h);
  box.append(el('div', 'sh-sub', 'Traits'));
  const chips = el('div', 'chips');
  for (const t of tr.actives) { const c = el('span', 'chip', `▲ ${t.name}`); c.addEventListener('mouseenter', () => say(`${t.name} (active, once)`, t.text)); chips.append(c); }
  for (const t of tr.passives) { const c = el('span', 'chip dim', t.name); c.addEventListener('mouseenter', () => say(`${t.name} (passive)`, t.text)); chips.append(c); }
  if (pet && pet.bonus) { const c = el('span', `chip${pet.bonus.kind === 'activatable' ? '' : ' dim'}`, `◆ ${pet.bonus.name}`); c.addEventListener('mouseenter', () => say(`${pet.bonus.name} (pet${pet.bonus.kind === 'activatable' ? ' skill, once' : ''})`, pet.bonus.text)); chips.append(c); }
  box.append(chips);

  // Codex
  const list = CLASS_SKILLS[String(h.class).toLowerCase()];
  const { mainTiers, subPoints } = codexBudget(h.level);
  box.append(el('div', 'sh-sub', `Codex · ${mainTiers} tier${mainTiers === 1 ? '' : 's'} at level ${h.level}`));
  if (!list) box.append(el('div', 'note', `No Codex for the ${cap(h.class)} yet: basic attack, traits and pet. Its skills come next.`));
  else {
    const picks = skillsOf(slot).slice();
    const codex = el('div', 'codex');
    for (let tier = 1; tier <= 5; tier++) {
      const row = el('div', `tier${tier > mainTiers ? ' locked' : ''}`);
      row.append(el('em', null, `T${tier}`));
      for (const sk of list.filter((x) => x.tier === tier)) {
        const b = el('button'); b.type = 'button';
        b.append(sk.name, el('small', null, sk.passive ? 'passive' : `${sk.branch}${sk.channel ? ` · channel ${sk.channel}` : ''}`));
        b.setAttribute('aria-pressed', String(picks.includes(sk.id)));
        b.addEventListener('mouseenter', () => say(`${sk.name} · ${sk.branch} T${tier}${sk.passive ? ' (passive)' : ` · ${Math.round(sk.mana[0] + sk.mana[1] * h.level)} MP${sk.amnesia ? ` · Amnesia ${sk.amnesia}` : ''}`}`, sk.text + (sk.note ? ` (${sk.note})` : '')));
        b.addEventListener('click', () => {
          const next = picks.filter((id) => !list.some((x) => x.id === id && x.tier === tier));
          next.push(sk.id);
          setSkills(team, i, next);
        });
        row.append(b);
      }
      codex.append(row);
    }
    box.append(codex);
    if (subPoints) box.append(el('div', 'note', `${subPoints} subclass point${subPoints === 1 ? '' : 's'}: the ${cap(h.subClass)} Codex needs the second weapon, it comes later.`));
  }
  box.append(desc);
  return box;
}
onSquadChange(() => { if (!battle) renderSetup(); });
renderSetup();

/* ================= battle ================= */
/* One field: the game's colosseum, doubled and mirrored into a wide arena. Heroes stand on the scene's ground row
   (row 48 of 52, as on the game's card): left team P3 P2 P1 facing right, right team P1 P2 P3 facing left. */
const SLOT_X = { A: { 3: 10, 2: 22.5, 1: 35 }, B: { 1: 65, 2: 77.5, 3: 90 } };
const TICK_MS = 45;
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
    const h = { ...slot.hero, __weaponSet: weaponSetFor(slot) };
    heroes[team].push(h);
    loadouts[String(h.id)] = { skills: skillsOf(slot), weapon: slot.weapon, armor: slot.armor, offhand: slot.offhand, accessory: slot.accessory, pet: slot.pet };
    looks[String(h.id)] = gearOfSlot(slot);
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
  buildField(looks); buildPlates(); buildTimebar(); paint();
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
    const body = el('button', 'body'); body.type = 'button'; body.setAttribute('aria-label', f.name); body.title = f.name;
    node.append(canvas, el('span', 'chance'), body);
    body.addEventListener('click', () => onFighterClick(f));
    f.node = node;
    field.append(node);
    f.idle = weaponAnimation(f.weaponSet, 'Idle');
    const look = looks[String(f.hero.id)];
    f.renderer = new HeroRenderer(canvas, f.hero, { animation: f.idle, mix: 0.12, zoom: 1.12, ...(hasGear(look) ? { gear: look } : {}), onEvent: (ev) => { if (ev.name === 'hit' && f.onHit) { const fn = f.onHit; f.onHit = null; fn(); } } });
  }
  place();
}
function place() { for (const f of battle.fighters) f.node.style.left = `${SLOT_X[f.team][f.pos] - 6}%`; }

/* Plates under the field: name, HP, MP (and AP for the Wizard), statuses. Same order as on the field. */
function buildPlates() {
  const box = $('#plates');
  box.replaceChildren();
  for (const f of battle.fighters) {
    const p = el('button', `plate ${f.team.toLowerCase()}`); p.type = 'button';
    p.append(el('div', 'nm', f.name), el('div', 'cl', `${cap(f.hero.class)} · Lv ${f.level} · ${f.weapon.name}`));
    const bar = (cls, label) => { const d = el('div', `bar ${cls}`); d.append(el('i'), el('u'), el('span')); d.querySelector('span').append(el('b', null, label), el('em')); return d; };
    p.append(bar('hp', 'HP'), bar('mp', 'MP'));
    if (f.cls === 'wizard') p.append(bar('ap', 'AP'));
    p.append(el('div', 'tags'));
    p.addEventListener('click', () => onFighterClick(f));
    f.plate = p;
    box.append(p);
  }
}
function setBar(node, cls, v, max, extra) {
  const d = node.querySelector(`.bar.${cls}`);
  if (!d) return;
  d.querySelector('i').style.width = `${max ? Math.max(0, Math.min(100, (v / max) * 100)) : 0}%`;
  d.querySelector('u').style.width = `${extra && max ? Math.min(100, (extra / max) * 100) : 0}%`;
  d.querySelector('em').textContent = `${fmt(v)} / ${fmt(max)}${extra ? ` +${fmt(extra)}` : ''}`;
}

function buildTimebar() {
  const bar = $('#timebar');
  bar.querySelectorAll('.mk').forEach((m) => m.remove());
  for (const f of battle.fighters) {
    const m = el('div', `mk ${f.team.toLowerCase()}`);
    m.append(el('i'), el('b', null, first(f.name)));
    m.title = f.name;
    f.marker = m;
    bar.append(m);
  }
}

function paint() {
  const b = battle;
  const turnId = b.turn && b.turn.id;
  for (const f of b.fighters) {
    const goal = f.channel ? f.channel.need : ACT_AT;
    f.marker.style.left = `${Math.min(100, (Math.max(0, f.initiative) / goal) * 100) * 0.97 + 1}%`;
    f.marker.classList.toggle('down', !f.alive);
    f.marker.classList.toggle('turn', f.id === turnId);
    f.marker.classList.toggle('ch', !!f.channel);
    f.marker.title = f.channel ? `${f.name} · channelling ${f.channel.skill.name}` : f.name;
    for (const n of [f.node, f.plate]) { n.classList.toggle('turn', f.id === turnId); n.classList.toggle('down', !f.alive); }
    f.plate.style.order = f.team === 'A' ? 4 - f.pos : 3 + f.pos;
    const bar = f.fx.find((e) => e.key === 'barrier');
    setBar(f.plate, 'hp', f.hp, f.hpMax, bar ? bar.value : 0);
    setBar(f.plate, 'mp', f.mp, f.mpMax);
    setBar(f.plate, 'ap', f.ap || 0, 100);
    f.plate.querySelector('.cl').textContent = `P${f.pos} · ${cap(f.hero.class)} · Lv ${f.level}`;
    f.plate.querySelector('.tags').replaceChildren(...C.tags(f).map((t) => el('span', t.bad ? 'bad' : null, t.text)));
  }
  $('#tick').textContent = `tick ${b.tick}`;
}

function log(text, cls) { $('#log').prepend(el('li', cls || null, text)); }
function floatText(f, text, cls, n = 0) {
  const s = el('span', `float${cls ? ` ${cls}` : ''}`, text);
  s.style.marginTop = `${-n * 4}%`;
  f.node.append(s);
  setTimeout(() => s.remove(), 1300);
}
const playAnim = (f, anim, loop) => { const list = f.renderer.animations; if (list.length && !list.includes(anim)) anim = f.idle; return f.renderer.play(anim, { loop }).catch(() => {}); };
const hasAnim = (f, a) => !!a && f.renderer.animations.includes(a);
const pickAnim = (f, list) => list.find((a) => hasAnim(f, a)) || null;

/* Show what an action did: floats on the field, the log, hurt and fall animations. */
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
    else if (e.type === 'status') { if (e.tag && t) floatText(t, e.tag, `st${/resist|Unstoppable|BARRIER|SHIELD|GUARD|MIGHT|SWIFT|BEACON|HASTE|IRON|CRIT|BOND|HARDENED|LAST|SECOND|SKIN/.test(e.tag + e.text) ? ' good' : ''}`, bump(t.id)); log(e.text, 'sub'); }
    else if (e.type === 'ko') { playAnim(t, HERO_ANIMATIONS.down, false); log(`${t.name} is down.`, 'ko'); }
    else if (e.type === 'revive') { playAnim(t, t.idle, true); log(e.text, 'sub'); }
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
  const hits = s.target === 'enemy' || s.target === 'none' && !/heal|barrier|shell/i.test(s.text);
  return pickAnim(f, [s.anim, hits ? weaponAnimation(set, 'Hit') : weaponAnimation(set, 'Cast'), hits ? null : HERO_ANIMATIONS.shout].filter(Boolean));
}

/* The timebar runs: every tick each standing hero gains its Speed; whoever reaches 1000 first acts, channels complete on their own. */
async function runLoop() {
  const b = battle;
  while (b && !b.stopped && !b.over) {
    const f = C.readyFighter(b);
    if (!f) {
      const ev = C.tickOnce(b);
      if (ev.length) showEvents(ev);
      paint();
      await sleep(TICK_MS);
      continue;
    }
    if (f.channel) {
      const s = f.channel.skill;
      b.turn = f; paint();
      const ev = C.completeChannel(b, f);
      await animate(f, ev, animFor(f, s));
      b.turn = null; paint();
      continue;
    }
    const st = C.startTurn(b, f);
    if (st.events.length) { b.turn = f; showEvents(st.events); paint(); await sleep(550); }
    if (b.stopped || b.over) break;
    if (st.lost) { C.endTurn(b, f, 'action'); b.turn = null; paint(); await sleep(250); continue; }
    offerTurn(f);
    return;
  }
  if (b && b.over && !b.stopped) finish();
}

function offerTurn(f) {
  const b = battle;
  b.turn = f; b.busy = false;
  paint();
  $('#who').textContent = f.name;
  $('#who').className = `who ${f.team.toLowerCase()}`;
  const sh = C.sheet(b, f);
  $('#who-facts').textContent = `${f.team === 'A' ? 'Left' : 'Right'} team · P${f.pos} · ${cap(f.hero.class)} · ${f.weapon.name} (${f.weapon.kind}${f.weapon.loaned ? ', loaned' : ''}) · ATK ${fmt(sh.attack)} · SPELL ${fmt(sh.spell)} · P.DEF ${fmt(sh.pdef)} · M.DEF ${fmt(sh.mdef)} · EVA ${pct(sh.evasion)} · CRIT ${pct(sh.crit)} · Speed ${sh.speed.toFixed(1)}`;
  renderHand(f);
  setPending(f, null);
}

/* The hand: Codex skills, the two active traits (once each), the pet's skill; passives shown beside them. */
function renderHand(f) {
  const b = battle;
  const hand = $('#hand');
  hand.replaceChildren();
  const row = (label, nodes) => { if (!nodes.length) return; const r = el('div', 'hrow'); const c = el('div', 'cards'); c.append(...nodes); r.append(el('em', null, label), c); hand.append(r); };
  const codex = [...f.skills.map((s) => actButton(f, s)), ...f.passives.map((p) => passiveChip(p.name, `${p.name} (Codex passive)`, p.text))];
  if (!CLASS_SKILLS[f.cls]) codex.push(passiveChip(`No Codex for the ${cap(f.cls)} yet`, 'Coming next', 'Its class skills come after Knight, Archer and Priest.'));
  row('Codex', codex);
  row('Traits', [...f.traitActives.map((s) => actButton(f, s)), ...f.traitPassives.map((p) => passiveChip(p.name, `${p.name} (passive trait)`, p.text))]);
  if (f.pet) {
    const bn = f.pet.bonus;
    row('Pet', [f.petSkill ? actButton(f, f.petSkill, f.pet.name) : passiveChip(bn ? `${f.pet.name} · ${bn.name}` : `${f.pet.name} · no combat bonus`, bn ? `${bn.name} ${'★'.repeat(bn.tier)} (pet${bn.kind === 'inactive' ? ', not in play yet' : ''})` : f.pet.name, bn ? bn.text : '')]);
  } else row('Pet', [passiveChip('No pet', 'No pet', 'Give this hero a pet in the Legion Viewer squad.')]);

  const basics = $('#basics');
  basics.replaceChildren();
  const atk = el('button', 'primary', f.weapon.kind === 'melee' ? 'Attack' : 'Attack: click an enemy'); atk.type = 'button';
  atk.title = 'Basic attack with the weapon';
  atk.addEventListener('click', () => {
    if (b.busy) return;
    setPending(f, null);
    const ts = C.enemyTargets(b, f, { kind: f.weapon.kind, reach: f.weapon.reach });
    if (ts.length === 1) doAttack(f, ts[0]);
  });
  basics.append(atk);
  const mates = C.alliesOf(b, f);
  for (const d of [-1, 1]) {
    const other = mates.find((m) => m.pos === f.pos + d);
    if (!other) continue;
    const r = el('button', null, `Move to P${other.pos}`); r.type = 'button';
    r.title = `Swap places with ${other.name}; gives back 250 Initiative`;
    if (C.has(f, 'root')) { r.disabled = true; r.title = 'Rooted'; }
    r.addEventListener('click', () => { if (b.busy) return; b.busy = true; clearTargets(); showEvents(C.reposition(b, f, other)); place(); finishAction(f, 'reposition'); });
    basics.append(r);
  }
  const pass = el('button', null, 'Pass'); pass.type = 'button';
  pass.title = 'Gives back 400 Initiative';
  pass.addEventListener('click', () => { if (b.busy) return; b.busy = true; clearTargets(); log(`${f.name} passes.`); finishAction(f, 'pass'); });
  basics.append(pass);
}
function passiveChip(label, name, text) {
  const c = el('button', 'act passive'); c.type = 'button';
  c.append(label, el('small', null, 'passive'));
  c.addEventListener('mouseenter', () => hint(name, text));
  c.addEventListener('focus', () => hint(name, text));
  return c;
}
function hint(name, text) { $('#act-hint').replaceChildren(el('b', null, name), ` ${text || ''}`); }

function actButton(f, s, owner) {
  const b = battle;
  const btn = el('button', 'act'); btn.type = 'button';
  const blocked = C.skillBlocked(b, f, s);
  const needs = ['enemy', 'ally', 'fallen'].includes(s.target);
  const targets = needs ? C.skillTargets(b, f, s) : [];
  const noTarget = needs && !targets.length;
  const meta = [s.trait ? (s.pet ? 'pet · once' : 'trait · once') : `${C.manaCost(f, s)} MP`, s.channel && `channel ${s.channel}`, !s.trait && s.amnesia && `A${s.amnesia}`, blocked || (noTarget && (s.target === 'fallen' ? 'nobody down' : 'no target'))].filter(Boolean).join(' · ');
  btn.append(owner ? `${s.name}` : s.name, el('small', null, meta));
  btn.disabled = !!blocked || noTarget;
  btn.dataset.skill = s.id;
  const text = `${s.text}${s.note ? ` (${s.note})` : ''}`;
  const title = `${s.name}${owner ? ` (${owner})` : ''}`;
  btn.addEventListener('mouseenter', () => hint(title, text));
  btn.addEventListener('focus', () => hint(title, text));
  btn.addEventListener('click', () => {
    if (b.busy || btn.disabled) return;
    if (pending && pending.skill === s) { setPending(f, null); return; }
    if (!needs) { doSkill(f, s, null); return; }
    if (targets.length === 1 && s.target === 'enemy') { doSkill(f, s, targets[0]); return; }
    setPending(f, s);
    hint(title, `${text} Now click ${s.target === 'enemy' ? 'the enemy' : s.target === 'fallen' ? 'the fallen ally' : 'the ally'} on the field or on the plates.`);
  });
  return btn;
}

function clearTargets() {
  for (const x of battle.fighters) for (const n of [x.node, x.plate]) n.classList.remove('can', 'ally');
  for (const x of battle.fighters) x.node.querySelector('.chance').textContent = '';
  document.querySelectorAll('#hand .act.pick').forEach((n) => n.classList.remove('pick'));
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
  if (s) { const btn = document.querySelector(`#hand .act[data-skill="${CSS.escape(s.id)}"]`); if (btn) btn.classList.add('pick'); }
  else $('#act-hint').textContent = f.weapon.kind === 'melee'
    ? `Melee: Attack hits ${targets.length > 1 ? 'one of the first two enemies standing: click which' : targets[0] ? targets[0].name : 'the first enemy standing'}. Or pick a skill. The number over an enemy is the chance to hit.`
    : 'Ranged: click the enemy you want to hit, or pick a skill. The number over each one is the chance to hit.';
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
  b.busy = true; clearTargets(); lockHand();
  const events = C.basicAttack(b, f, t);
  log(`${f.name} attacks ${t.name}`, 'hit');
  await animate(f, events, animFor(f, null));
  if (b.stopped) return;
  finishAction(f, 'action');
}
async function doSkill(f, s, t) {
  const b = battle;
  if (b.busy) return;
  b.busy = true; clearTargets(); lockHand();
  const events = C.useSkill(b, f, s, t);
  await animate(f, events, animFor(f, s, s.channel ? 'channel' : null));
  if (b.stopped) return;
  finishAction(f, 'action', s);
}
function lockHand() { document.querySelectorAll('#hand button, #basics button').forEach((n) => { n.disabled = true; }); }
function finishAction(f, kind, s = null) {
  const b = battle;
  C.endTurn(b, f, kind, s);
  b.turn = null;
  $('#hand').replaceChildren(); $('#basics').replaceChildren(); $('#act-hint').textContent = '';
  paint();
  if (b.over) finish(); else runLoop();
}

function finish() {
  const b = battle;
  const w = b.winner;
  b.turn = null;
  paint();
  $('#who').textContent = `${w === 'A' ? 'Left' : 'Right'} team wins`;
  $('#who').className = `who result ${w.toLowerCase()}`;
  $('#who-facts').textContent = `After ${b.tick} ticks.`;
  $('#hand').replaceChildren(); $('#basics').replaceChildren(); $('#act-hint').textContent = '';
  $('#btn-rematch').hidden = false;
  log(`${w === 'A' ? 'Left' : 'Right'} team wins after ${b.tick} ticks.`, 'ko');
  C.teamOf(b, w).filter((x) => x.alive).forEach((x) => playAnim(x, weaponAnimation(x.weaponSet, 'Celebrate'), true));
}
