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
/* One field: the game's colosseum, doubled and mirrored into a wide arena. Heroes stand on the scene's ground row
   (row 48 of 52, as on the game's card): left team P3 P2 P1 facing right, right team P1 P2 P3 facing left. */
const SLOT_X = { A: { 3: 10, 2: 22.5, 1: 35 }, B: { 1: 65, 2: 77.5, 3: 90 } };
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
  battle = { seed, rng, avgLvl, fighters, tick: 0, source: { A: teamA, B: teamB }, stopped: false, over: false, turn: null };
  $('#setup').hidden = true; $('#battle').hidden = false;
  $('#btn-rematch').hidden = true;
  $('#b-eyebrow').textContent = `Level cap ${levelCap} · average level ${avgLvl.toFixed(1)} · seed ${seed}`;
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
  field.querySelectorAll('.ftr').forEach((n) => n.remove());
  for (const f of battle.fighters) {
    const node = el('div', `ftr ${f.team.toLowerCase()}`);
    const canvas = el('canvas');
    const tag = el('div', 'tag');
    tag.append(el('div', 'nm', f.name.split(' ')[0]), el('div', 'hp'), el('div', 'meta'));
    tag.title = f.name;
    tag.querySelector('.hp').append(el('i'));
    const body = el('button', 'body'); body.type = 'button'; body.setAttribute('aria-label', f.name);
    const chance = el('span', 'chance');
    node.append(canvas, tag, chance, body);
    body.addEventListener('click', () => onFighterClick(f));
    f.node = node;
    field.append(node);
    const idle = weaponAnimation(f.weaponSet, 'Idle');
    f.idle = idle;
    f.renderer = new HeroRenderer(canvas, f.hero, { animation: idle, mix: 0.12, zoom: 1.12, onEvent: (ev) => { if (ev.name === 'hit' && f.onHit) { const fn = f.onHit; f.onHit = null; fn(); } } });
  }
  place();
}
function place() {
  for (const f of battle.fighters) f.node.style.left = `${SLOT_X[f.team][f.pos] - 6}%`;
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

function paint() {
  const turnId = battle.turn && battle.turn.id;
  for (const f of battle.fighters) {
    f.marker.style.left = `${Math.min(100, (Math.max(0, f.initiative) / ACT_AT) * 100) * 0.97 + 1}%`;
    f.marker.classList.toggle('down', !f.alive);
    f.marker.classList.toggle('turn', f.id === turnId);
    f.node.classList.toggle('turn', f.id === turnId);
    f.node.classList.toggle('down', !f.alive);
    f.node.querySelector('.hp i').style.width = `${(f.hp / f.hpMax) * 100}%`;
    f.node.querySelector('.meta').textContent = `${fmt(f.hp)} / ${fmt(f.hpMax)} · P${f.pos}`;
  }
  $('#tick').textContent = `tick ${battle.tick}`;
}

function log(text, cls) { $('#log').prepend(el('li', cls || null, text)); }

function floatText(f, text, cls) {
  const s = el('span', `float${cls ? ` ${cls}` : ''}`, text);
  f.node.append(s);
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

/* Who the attacker can hit: melee goes to the first standing enemy by itself; ranged lets you choose. */
const reachable = (f) => targetable(teamOf(enemyOf(f)), { kind: f.weapon.kind, reach: f.weapon.reach });

function clearTargets() {
  for (const x of battle.fighters) { x.node.classList.remove('can'); x.node.querySelector('.chance').textContent = ''; }
}
function showTargets(f) {
  clearTargets();
  const opts = f.weapon.kind === 'melee' ? reachable(f).slice(0, 1) : reachable(f);
  for (const t of opts) {
    t.node.classList.add('can');
    t.node.querySelector('.chance').textContent = `${Math.round(basicHitChance(f, t) * 100)}%`;
  }
  return opts;
}

function onFighterClick(t) {
  const f = battle && battle.turn;
  if (!f || battle.busy || !t.node.classList.contains('can')) return;
  doAttack(f, t);
}

function offerTurn(f) {
  const b = battle;
  b.turn = f; b.busy = false;
  paint();
  $('#who').textContent = f.name;
  $('#who').className = `who ${f.team.toLowerCase()}`;
  $('#who-facts').textContent = `${f.team === 'A' ? 'Left' : 'Right'} team · P${f.pos} · ${cap(f.hero.class)} · ${f.weapon.name} (${f.weapon.kind}) · ATK ${f.attack.toFixed(0)} · Initiative ${fmt(f.initiative)}`;
  const acts = $('#acts');
  acts.replaceChildren();
  const opts = showTargets(f);
  $('#act-hint').textContent = f.weapon.kind === 'melee'
    ? `Melee: Attack hits ${opts[0] ? opts[0].name : 'the first enemy standing'}. You can also click it.`
    : 'Ranged: click the enemy you want to hit. The number over each one is the chance to hit.';

  const attack = el('button', 'primary', f.weapon.kind === 'melee' ? 'Attack' : 'Attack: click an enemy'); attack.type = 'button';
  attack.addEventListener('click', () => {
    if (f.weapon.kind === 'melee') { const t = reachable(f)[0]; if (t) doAttack(f, t); }
    else $('#act-hint').textContent = 'Click the enemy you want to hit.';
  });
  acts.append(attack);

  const mates = teamOf(f.team);
  for (const d of [-1, 1]) {
    const other = mates.find((m) => m.pos === f.pos + d);
    if (!other) continue;
    const r = el('button', null, `Move to P${other.pos}`); r.type = 'button';
    r.title = `Swap places with ${other.name}; gives back 250 Initiative`;
    r.addEventListener('click', () => {
      if (b.busy) return;
      clearTargets();
      const p = f.pos; f.pos = other.pos; other.pos = p; place();
      log(`${f.name} moves to P${f.pos}.`);
      endTurn(f, 'reposition');
    });
    acts.append(r);
  }
  const pass = el('button', null, 'Pass'); pass.type = 'button';
  pass.title = 'Gives back 400 Initiative';
  pass.addEventListener('click', () => { if (b.busy) return; clearTargets(); log(`${f.name} passes.`); endTurn(f, 'pass'); });
  acts.append(pass);
}

async function doAttack(f, t) {
  const b = battle;
  if (b.busy) return;
  b.busy = true;
  clearTargets();
  $('#acts').replaceChildren();
  $('#act-hint').textContent = '';
  const res = basicAttack(f, t, b.rng, b.avgLvl);
  const parts = [`${f.name} → ${t.name}`, `${Math.round(res.chance * 100)}%`];
  if (!res.hit) parts.push('miss');
  else { parts.push(`${res.damage} damage`); if (res.crit) parts.push('critical'); if (res.blocked) parts.push('blocked'); }
  log(parts.join(' · '), res.hit ? 'hit' : null);
  const anim = weaponAnimation(f.weaponSet, 'Hit');
  const dur = (f.renderer.animations.includes(anim) && f.renderer.duration(anim)) || 1.5;
  let landed = false;
  const land = () => {
    if (landed || b.stopped) return; landed = true;
    if (!res.hit) floatText(t, 'MISS', 'miss');
    else {
      floatText(t, `${res.damage}${res.crit ? '!' : ''}`, res.crit ? 'crit' : null);
      play(t, res.ko ? HERO_ANIMATIONS.down : HERO_ANIMATIONS.hurt, false);
      if (!res.ko) setTimeout(() => t.alive && !b.stopped && play(t, t.idle, true), 700);
    }
    paint();
    if (res.ko) log(`${t.name} is down.`, 'ko');
  };
  f.onHit = land;
  play(f, anim, false);
  setTimeout(land, dur * 700); // if the animation carries no hit marker
  await sleep(dur * 1000);
  if (b.stopped) return;
  land();
  play(f, f.idle, true);
  endTurn(f, 'action');
}

function endTurn(f, kind) {
  const b = battle;
  spendTurn(f, kind);
  b.turn = null;
  const w = winner();
  if (w) {
    b.over = true;
    paint();
    $('#who').textContent = `${w === 'A' ? 'Left' : 'Right'} team wins`;
    $('#who').className = `who result ${w.toLowerCase()}`;
    $('#who-facts').textContent = `After ${b.tick} ticks.`;
    $('#acts').replaceChildren();
    $('#act-hint').textContent = '';
    $('#btn-rematch').hidden = false;
    log(`${w === 'A' ? 'Left' : 'Right'} team wins after ${b.tick} ticks.`, 'ko');
    teamOf(w).filter((x) => x.alive).forEach((x) => play(x, weaponAnimation(x.weaponSet, 'Celebrate'), true));
    return;
  }
  paint();
  runUntilTurn();
}
