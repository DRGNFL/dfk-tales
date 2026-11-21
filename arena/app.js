import { getAssetConfig } from 'https://esm.sh/@defikingdoms/game-sdk@0.1.0?deps=ethers@5.8.0';
import {
  HeroRenderer, HERO_ANIMATIONS, getHeroWeaponAnimationSet, weaponAnimation,
} from 'https://esm.sh/@defikingdoms/game-sdk@0.1.0/renderer?deps=ethers@5.8.0';
import { mountWallet, getWallet, readLegion, shortAddr } from '../assets/session.js?v=1';
import { heroScoreX } from '../assets/heroscore.js?v=1';
import { LEVEL_CAPS, ACT_AT, makeRng, targetable, spendTurn } from './engine.js?v=1';
import { makeFighter, basicHitChance, basicAttack } from './rules.js?v=1';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const cap = (s) => (s ? String(s)[0].toUpperCase() + String(s).slice(1) : '');
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mountWallet($('#wallet'));
// Play an animation if the rig has it; a missing one must never stop the battle.
const play = (f, anim, loop) => { const list = f.renderer.animations; if (list.length && !list.includes(anim)) anim = f.idle; return f.renderer.play(anim, { loop }).catch(() => {}); };

const BG = `${getAssetConfig().assetsBaseUrl}/hero-card/assets/images/hero/backgrounds/`;
$('#field').style.setProperty('--scene', `url("${BG}colosseum.gif")`);

/* ================= setup ================= */
let heroes = [];
let levelCap = Number(store.get('dfk-tales:arena-cap')) || 20;
if (!LEVEL_CAPS.includes(levelCap)) levelCap = 20;
const teams = { A: [], B: [] };
let editing = 'A';

async function loadHeroes() {
  const addr = store.get('dfk-tales:addr') || getWallet();
  const chain = Number(store.get('dfk-tales:chain')) || 43114;
  if (!addr) return null;
  const kept = await readLegion(chain, addr);
  return kept && kept.heroes ? { addr, heroes: kept.heroes } : { addr, heroes: null };
}

function renderCaps() {
  $('#caps').replaceChildren(...LEVEL_CAPS.map((c) => {
    const b = el('button', null, `Lv ${c}`); b.type = 'button';
    b.setAttribute('aria-pressed', String(c === levelCap));
    b.addEventListener('click', () => {
      levelCap = c; store.set('dfk-tales:arena-cap', String(c));
      for (const t of ['A', 'B']) teams[t] = teams[t].filter((h) => h.level <= c);
      renderCaps(); renderTeams(); renderList();
    });
    return b;
  }));
}

function renderTeams() {
  for (const t of ['A', 'B']) {
    const box = $(`#slots-${t.toLowerCase()}`);
    box.replaceChildren(...[0, 1, 2].map((i) => {
      const h = teams[t][i];
      const s = el('button', `slot${h ? ' full' : ''}`); s.type = 'button';
      s.append(el('em', null, `P${i + 1}`));
      if (h) {
        s.append(el('b', null, h.name), el('span', null, `${cap(h.class)} · Lv ${h.level} · ${cap(h.rarity)}`));
        s.title = 'Remove from the team';
        s.addEventListener('click', (e) => { e.stopPropagation(); teams[t].splice(i, 1); renderTeams(); renderList(); });
      } else s.append(el('span', null, 'empty'));
      return s;
    }));
    $(`#count-${t.toLowerCase()}`).textContent = `${teams[t].length} / 3`;
    $(`#team-${t.toLowerCase()}`).classList.toggle('on', editing === t);
  }
  $('#btn-fight').disabled = !(teams.A.length === 3 && teams.B.length === 3);
}
for (const t of ['A', 'B']) $(`#team-${t.toLowerCase()}`).addEventListener('click', () => { editing = t; renderTeams(); });

function renderList() {
  const q = $('#q').value.trim().toLowerCase();
  const used = new Set([...teams.A, ...teams.B].map((h) => String(h.id)));
  const eligible = heroes.filter((h) => h.level <= levelCap);
  const match = eligible.filter((h) => !q || h.name.toLowerCase().includes(q) || String(h.id).includes(q) || String(h.displayId).includes(q) || h.class.toLowerCase().includes(q));
  $('#found').textContent = `${match.length} of ${eligible.length} heroes at level ${levelCap} or below`;
  const rows = match.slice(0, 200).map((h) => {
    const b = el('button', `pick${used.has(String(h.id)) ? ' used' : ''}`); b.type = 'button';
    b.append(
      el('span', 'n', h.name),
      el('span', 'm', `${cap(h.class)} / ${cap(h.subClass)}`),
      el('span', `m r-${h.rarity}`, `${cap(h.rarity)} · Lv ${h.level}`),
      el('span', 'm', `#${h.displayId}`),
    );
    b.addEventListener('click', () => {
      const other = editing === 'A' ? 'B' : 'A';
      if (teams[editing].length >= 3) { if (teams[other].length < 3) editing = other; else return; }
      teams[editing].push(h);
      if (teams[editing].length === 3 && teams[other].length < 3) editing = other;
      renderTeams(); renderList();
    });
    return b;
  });
  $('#list').replaceChildren(...rows);
}
$('#q').addEventListener('input', renderList);

loadHeroes().then((r) => {
  if (!r) { $('#status').replaceChildren('No legion yet. Open your legion in the ', Object.assign(el('a', null, 'Legion Viewer'), { href: '../legion-viewer/' }), ' first: the Arena takes its heroes from there.'); return; }
  if (!r.heroes) { $('#status').replaceChildren(`The legion of ${shortAddr(r.addr)} is not kept in this browser yet. Open it once in the `, Object.assign(el('a', null, 'Legion Viewer'), { href: '../legion-viewer/' }), '.'); return; }
  heroes = [...r.heroes].sort((a, b) => heroScoreX(b) - heroScoreX(a));
  $('#status').textContent = `${heroes.length} heroes from the legion of ${shortAddr(r.addr)}, strongest first.`;
  renderCaps(); renderTeams(); renderList();
}).catch((e) => { console.error(e); $('#status').textContent = 'Could not open the legion kept in this browser.'; $('#status').classList.add('err'); });

/* ================= battle ================= */
let battle = null;

$('#btn-fight').addEventListener('click', () => startBattle(teams.A.slice(), teams.B.slice()));
$('#btn-new').addEventListener('click', () => { stopBattle(); $('#battle').hidden = true; $('#setup').hidden = false; });
$('#btn-rematch').addEventListener('click', () => { const t = battle.source; stopBattle(); startBattle(t.A, t.B); });

function stopBattle() {
  if (!battle) return;
  battle.stopped = true;
  battle.fighters.forEach((f) => f.renderer && f.renderer.destroy && f.renderer.destroy());
  battle = null;
}

function startBattle(teamA, teamB) {
  const seed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0;
  const rng = makeRng(seed);
  const all = [...teamA, ...teamB];
  const avgLvl = all.reduce((t, h) => t + h.level, 0) / all.length;
  const fighters = [];
  for (const [t, list] of [['A', teamA], ['B', teamB]]) {
    list.forEach((h, i) => fighters.push(makeFighter(h, { team: t, pos: i + 1, weaponSet: getHeroWeaponAnimationSet(h, null), avgLvl, rng })));
  }
  battle = { seed, rng, avgLvl, fighters, tick: 0, source: { A: teamA, B: teamB }, stopped: false, over: false };
  $('#setup').hidden = true; $('#battle').hidden = false;
  $('#btn-rematch').hidden = true;
  $('#b-eyebrow').textContent = `Level cap ${levelCap} · average level ${avgLvl.toFixed(1)} · seed ${seed}`;
  $('#b-title').textContent = 'Arena';
  $('#log').replaceChildren();
  log(`Battle starts. Seed ${seed}.`, 'sys');
  fighters.filter((f) => f.luckyStart).forEach((f) => log(`${f.name} starts lucky: triple Initiative.`, 'sys'));
  buildField(); buildTimebar(); paint();
  runUntilTurn();
}

const teamOf = (t) => battle.fighters.filter((f) => f.team === t).sort((a, b) => a.pos - b.pos);
const enemyOf = (f) => (f.team === 'A' ? 'B' : 'A');

function buildField() {
  const field = $('#field');
  field.replaceChildren();
  // left team shows P3 P2 P1 facing right, right team P1 P2 P3 facing left
  const order = [...teamOf('A').reverse(), ...teamOf('B')];
  for (const f of order) {
    const card = el('div', `ft ${f.team.toLowerCase()}`);
    const canvas = el('canvas');
    const tgt = el('div', 'tgt');
    card.append(el('span', 'pos', `P${f.pos}`), canvas, tgt, el('div', 'nm', f.name), el('div', 'hp'), el('div', 'meta'));
    card.querySelector('.hp').append(el('i'));
    f.card = card;
    field.append(card);
    const idle = weaponAnimation(f.weaponSet, 'Idle');
    f.renderer = new HeroRenderer(canvas, f.hero, { animation: idle, mix: 0.12, zoom: 1.05, onEvent: (ev) => { if (ev.name === 'hit' && f.onHit) { const fn = f.onHit; f.onHit = null; fn(); } } });
    f.idle = idle;
  }
}
function relayout() {
  const field = $('#field');
  const order = [...teamOf('A').reverse(), ...teamOf('B')];
  for (const f of order) { f.card.querySelector('.pos').textContent = `P${f.pos}`; field.append(f.card); }
}

function buildTimebar() {
  const bar = $('#timebar');
  bar.querySelectorAll('.mk').forEach((m) => m.remove());
  for (const f of battle.fighters) {
    const m = el('div', `mk ${f.team.toLowerCase()}`);
    m.append(el('i'), el('b', null, f.name.split(' ')[0]));
    m.title = f.name;
    f.marker = m;
    bar.append(m);
  }
}

function paint(turnId = null) {
  for (const f of battle.fighters) {
    f.marker.style.left = `${Math.min(100, (Math.max(0, f.initiative) / ACT_AT) * 100) * 0.97 + 1}%`;
    f.marker.classList.toggle('down', !f.alive);
    f.marker.classList.toggle('turn', f.id === turnId);
    f.card.classList.toggle('turn', f.id === turnId);
    f.card.classList.toggle('down', !f.alive);
    f.card.querySelector('.hp i').style.width = `${(f.hp / f.hpMax) * 100}%`;
    f.card.querySelector('.meta').replaceChildren(el('span', null, `${fmt(f.hp)} / ${fmt(f.hpMax)} HP`), el('span', null, `SPD ${f.speed.toFixed(0)}`));
  }
  $('#tick').textContent = `tick ${battle.tick}`;
}

function log(text, cls) {
  const li = el('li', cls || null, text);
  $('#log').prepend(li);
}

function floatText(f, text, cls) {
  const s = el('span', `float${cls ? ` ${cls}` : ''}`, text);
  f.card.append(s);
  setTimeout(() => s.remove(), 1200);
}

function winner() {
  for (const t of ['A', 'B']) if (teamOf(t).every((f) => !f.alive)) return t === 'A' ? 'B' : 'A';
  return null;
}

/* The timebar runs: every tick each standing hero gains its Speed; whoever passes 1000 first acts. */
async function runUntilTurn() {
  const b = battle;
  while (!b.stopped) {
    const ready = b.fighters.filter((f) => f.alive && f.initiative >= ACT_AT)
      .sort((x, y) => y.initiative - x.initiative || y.speed - x.speed || (x.id < y.id ? -1 : 1));
    if (ready.length) { offerTurn(ready[0]); return; }
    b.tick += 1;
    for (const f of b.fighters) if (f.alive) f.initiative += f.speed;
    paint();
    await sleep(45);
  }
}

function offerTurn(f) {
  const b = battle;
  paint(f.id);
  $('#who').textContent = f.name;
  $('#who').className = `who ${f.team.toLowerCase()}`;
  $('#who-facts').textContent = `${f.team === 'A' ? 'Left' : 'Right'} team · P${f.pos} · ${cap(f.hero.class)} · ${f.weapon.name} (${f.weapon.kind}${f.weapon.kind === 'melee' ? `, reach ${f.weapon.reach}` : ''}) · ATK ${f.attack.toFixed(0)} · Initiative ${fmt(f.initiative)}`;
  const acts = $('#acts');
  acts.replaceChildren();
  $('#act-hint').textContent = '';
  const clearTargets = () => b.fighters.forEach((x) => { x.card.classList.remove('can'); x.card.querySelector('.tgt').replaceChildren(); });

  const attack = el('button', 'primary', 'Attack'); attack.type = 'button';
  attack.addEventListener('click', () => {
    clearTargets();
    const options = targetable(teamOf(enemyOf(f)), { kind: f.weapon.kind, reach: f.weapon.reach });
    $('#act-hint').textContent = `Choose the target: ${f.weapon.kind === 'melee' ? `melee, the first ${f.weapon.reach} standing` : 'ranged, anyone'}. The number is the chance to hit.`;
    for (const t of options) {
      const btn = el('button', null, `${Math.round(basicHitChance(f, t) * 100)}%`); btn.type = 'button';
      btn.title = `Attack ${t.name}`;
      btn.addEventListener('click', () => { clearTargets(); doAttack(f, t); });
      t.card.classList.add('can');
      t.card.querySelector('.tgt').append(btn);
    }
  });
  acts.append(attack);

  const mates = teamOf(f.team);
  for (const d of [-1, 1]) {
    const other = mates.find((m) => m.pos === f.pos + d);
    if (!other) continue;
    const r = el('button', null, `Move to P${other.pos}`); r.type = 'button';
    r.title = `Swap places with ${other.name}; gives back 250 Initiative`;
    r.addEventListener('click', () => { clearTargets(); const p = f.pos; f.pos = other.pos; other.pos = p; relayout(); log(`${f.name} moves to P${f.pos}.`); endTurn(f, 'reposition'); });
    acts.append(r);
  }
  const pass = el('button', null, 'Pass'); pass.type = 'button';
  pass.title = 'Gives back 400 Initiative';
  pass.addEventListener('click', () => { clearTargets(); log(`${f.name} passes.`); endTurn(f, 'pass'); });
  acts.append(pass);
}

async function doAttack(f, t) {
  const b = battle;
  $('#acts').replaceChildren();
  $('#act-hint').textContent = '';
  const res = basicAttack(f, t, b.rng, b.avgLvl);
  const anim = weaponAnimation(f.weaponSet, 'Hit');
  const dur = (f.renderer.animations.includes(anim) && f.renderer.duration(anim)) || 1.5;
  let landed = false;
  const land = () => {
    if (landed) return; landed = true;
    if (!res.hit) { floatText(t, 'MISS', 'miss'); }
    else {
      floatText(t, `${res.damage}${res.crit ? '!' : ''}`, res.crit ? 'crit' : null);
      play(t, res.ko ? HERO_ANIMATIONS.down : HERO_ANIMATIONS.hurt, false);
      if (!res.ko) setTimeout(() => t.alive && play(t, t.idle, true), 700);
    }
    paint(f.id);
  };
  f.onHit = land;
  play(f, anim, false);
  const parts = [`${f.name} → ${t.name}`, `${Math.round(res.chance * 100)}%`];
  if (!res.hit) parts.push('miss');
  else { parts.push(`${res.damage} damage`); if (res.crit) parts.push('critical'); if (res.blocked) parts.push('blocked'); }
  setTimeout(land, dur * 700); // if the animation carries no hit marker
  await sleep(dur * 1000);
  if (b.stopped) return;
  land();
  log(parts.join(' · '), res.hit ? 'hit' : null);
  if (res.ko) log(`${t.name} is down.`, 'ko');
  play(f, f.idle, true);
  endTurn(f, 'action');
}

function endTurn(f, kind) {
  const b = battle;
  spendTurn(f, kind);
  const w = winner();
  if (w) {
    b.over = true;
    paint();
    $('#who').textContent = `${w === 'A' ? 'Left' : 'Right'} team wins`;
    $('#who').className = `who result ${w.toLowerCase()}`;
    $('#who-facts').textContent = `After ${b.tick} ticks.`;
    $('#acts').replaceChildren();
    $('#btn-rematch').hidden = false;
    log(`${w === 'A' ? 'Left' : 'Right'} team wins after ${b.tick} ticks.`, 'ko');
    teamOf(w).filter((x) => x.alive).forEach((x) => play(x, weaponAnimation(x.weaponSet, 'Celebrate'), true));
    return;
  }
  paint();
  runUntilTurn();
}
