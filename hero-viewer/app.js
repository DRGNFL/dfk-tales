import {
  createDFKClient, ACTIVE_SKILLS, PASSIVE_SKILLS, getAssetConfig, getDisplayHeroId,
} from 'https://esm.sh/@defikingdoms/game-sdk@0.1.0?deps=ethers@5.8.0';
import {
  HeroRenderer, createAnimatedHeroCard, HERO_ANIMATIONS, getHeroWeaponAnimationSet, professionAnimation, weaponAnimation,
} from 'https://esm.sh/@defikingdoms/game-sdk@0.1.0/renderer?deps=ethers@5.8.0';
import { heroScore, heroMult, heroScoreX, tierOf } from '../assets/heroscore.js?v=1';
import { mountWallet, onWalletChange, getWallet, sameAddr, shortAddr, legionUrl } from '../assets/session.js?v=1';

mountWallet(document.querySelector('#wallet'));

/* ================= vocab ================= */
const DEFAULT_ID = '1000000523445'; // Hotoyor Longfollower
const CHAINS = [[43114, 'Avalanche C-Chain'], [8217, 'Kaia']];
const REALMS = { serendale: 'Serendale 1.0', crystalvale: 'Crystalvale', serendale2: 'Serendale 2.0', sunderedisles: 'Sundered Isles', avalanche: 'Avalanche' };
const STATS = [['strength', 'STR'], ['dexterity', 'DEX'], ['agility', 'AGI'], ['vitality', 'VIT'], ['endurance', 'END'], ['intelligence', 'INT'], ['wisdom', 'WIS'], ['luck', 'LCK']];
const TIER_TAG = ['', 'ADV', 'ELITE', 'EXALT'];
const cap = (s) => (s ? String(s)[0].toUpperCase() + String(s).slice(1) : '');
const className = (c) => ({ darkKnight: 'Dark Knight', spellBow: 'SpellBow', dreadKnight: 'DreadKnight' })[c] || cap(c);
const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
const fmtDate = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function retry(fn, tries = 4) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) { if (i >= tries - 1) throw e; await sleep(700 * (i + 1) * (i + 1)); }
  }
}
function setStatus(t, err = false) { const s = $('#status'); s.textContent = t; s.classList.toggle('err', err); }

/* ================= scenes =================
   The game's card scenes, 55x52 pixel art. Base layer behind the hero, front layer over the feet,
   in their animated (hover) versions like the game's card. */
const BG = `${getAssetConfig().assetsBaseUrl}/hero-card/assets/images/hero/backgrounds/`;
const SCENES = [
  ['plains', 'Plains', 'plains.png', 'plains-front.gif'],
  ['island', 'Island', 'island.gif', null],
  ['swamp', 'Swamp', 'swamp.gif', 'swamp-front.png'],
  ['mountains', 'Mountains', 'mountain.gif', null],
  ['city', 'City', 'city.gif', null],
  ['arctic', 'Arctic', 'arctic.gif', null],
  ['desert', 'Desert', 'desert.gif', 'desert-front.png'],
  ['forest', 'Forest', 'forest.gif', 'forest-front.png'],
  ['colosseum', 'Colosseum', 'colosseum.gif', null],
  ['fishing', 'Fishing', 'fishing.gif', null],
  ['mining', 'Mining', 'mining.gif', 'mining-front-gold.png'],
  ['gardening', 'Gardening', 'gardening.gif', 'gardening-front.gif'],
  ['foraging', 'Foraging', 'foraging.png', 'foraging-front.gif'],
];
const WORK_SCENES = new Set(['fishing', 'mining', 'gardening', 'foraging']);

/* ================= reading the hero ================= */
const clients = new Map();
const client = (chainId) => clients.get(chainId) || (clients.set(chainId, createDFKClient({ chainId })), clients.get(chainId));

/* A hero id with its realm offset, or a short in-game id tried in every realm. */
function candidates(raw) {
  const s = String(raw).replace(/[^0-9]/g, '');
  if (!s) return [];
  const n = BigInt(s);
  if (n >= 500000000000n) return [s];
  return [n + 1000000000000n, n + 2000000000000n, n + 3000000000000n, n + 500000000000n, n].map(String);
}

/* The hero where it lives now: Avalanche first, then Kaia. */
async function findHero(id) {
  const found = await Promise.all(CHAINS.map(([chainId]) => retry(() => client(chainId).heroes.get(id)).catch(() => null)));
  const i = found.findIndex(Boolean);
  return i < 0 ? null : { hero: found[i], chainId: CHAINS[i][0] };
}

async function loadAll(raw) {
  if (window.__HV_FIXTURE) return window.__HV_FIXTURE; // local tests only
  let hit = null;
  for (const id of candidates(raw)) { hit = await findHero(id); if (hit) break; }
  if (!hit) return null;
  const { hero, chainId } = hit;
  const [gear, parents] = await Promise.all([
    retry(() => client(chainId).equipment.forHero(hero)).catch(() => null),
    hero.generation > 0 && hero.summonerId && hero.summonerId !== '0'
      ? Promise.all([hero.summonerId, hero.assistantId].map((pid) => findHero(pid).then((r) => r && r.hero)))
      : Promise.resolve([]),
  ]);
  return { hero, chainId, gear, parents };
}

/* There is no dark-summon flag on chain. A parent that could never summon (0 max summons)
   can only have been used by the Dark Summoning ritual. */
const darkParent = (hero, parents) => (hero.generation > 0 ? parents.find((p) => p && p.maxSummons === 0) || null : null);

/* ================= page ================= */
const query = new URLSearchParams(location.search).get('id') || DEFAULT_ID;
$('#hero-id').value = query === DEFAULT_ID && !location.search ? '' : query;
$('#form').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('#hero-id').value.replace(/[^0-9]/g, '');
  if (v) location.search = `?id=${v}`;
});

setStatus(`Reading hero ${query} from the chain…`);
loadAll(query).then((data) => {
  if (!data) {
    $('#name').textContent = 'Hero not found';
    setStatus(`No hero ${query} on Avalanche or Kaia. Paste the full id, e.g. 1000000523445.`, true);
    return;
  }
  setStatus('');
  render(data);
}).catch((e) => {
  console.error(e);
  $('#name').textContent = 'Could not read the hero';
  setStatus(`The chain did not answer: ${e && e.message ? e.message : e}. Reload to try again.`, true);
});

function render({ hero, chainId, gear, parents }) {
  const chainName = (CHAINS.find((c) => c[0] === chainId) || [0, `chain ${chainId}`])[1];
  const dark = darkParent(hero, parents || []);
  document.title = `${hero.name} · Hero Viewer · DFK Tales`;
  $('#eyebrow').textContent = `Hero #${hero.displayId} · ${chainName} · born in ${REALMS[hero.originRealm] || cap(hero.originRealm)}`;
  $('#name').textContent = hero.name;

  const tags = $('#tags');
  const tag = (text, cls) => tags.append(el('span', `tag${cls ? ` ${cls}` : ''}`, text));
  tag(`${className(hero.class)} / ${className(hero.subClass)}`);
  tag(`Level ${hero.level}`);
  tag(cap(hero.rarity), `r-${hero.rarity}`);
  tag(`Gen ${hero.generation}`);
  tag(cap(hero.element));
  if (hero.profession) tag(`${cap(hero.profession)} ${hero.skills[hero.profession]}`);
  tag(cap(hero.gender));
  if (hero.shiny) tag('Shiny', 'r-legendary');
  if (dark) tag('Dark summon', 'dark');
  // The owner's legion, one click away; yours if this wallet is connected.
  const own = el('a', 'tag');
  own.href = legionUrl(hero.owner, chainId);
  const paintOwner = () => {
    const mine = sameAddr(getWallet(), hero.owner);
    own.classList.toggle('mine', mine);
    own.textContent = mine ? 'Your hero' : `Owner ${shortAddr(hero.owner)}`;
    own.title = mine ? 'Open your legion' : `Open the legion of ${hero.owner}`;
  };
  paintOwner(); onWalletChange(paintOwner);
  tags.append(own);

  renderFacts(hero, gear);
  renderLineage(hero, parents || [], dark);
  $('#grid').hidden = false;
  mountCard(hero, gear, !!dark);
  mountStage(hero, gear);
}

/* ================= facts ================= */
function skillLine(map, a, b) {
  const dd = el('dd');
  [a, b].forEach((raw, i) => {
    if (i) dd.append(' · ');
    dd.append(map[raw] || `#${raw}`);
    const t = tierOf(raw);
    if (t) dd.append(el('span', 'tier', TIER_TAG[t]));
  });
  return dd;
}

function renderFacts(hero, gear) {
  const a = el('span'); a.append('HEROSCORE ', el('b', null, fmtInt(heroScore(hero))));
  const b = el('span', 'x'); b.append(`×${heroMult(hero)} · HSX `, el('b', null, fmtInt(heroScoreX(hero))));
  $('#hs').replaceChildren(a, b);

  const top = Math.max(...STATS.map(([k]) => hero.stats[k]));
  $('#stats').replaceChildren(...STATS.map(([k, abbr]) => {
    const d = el('div', `stat${hero.stats[k] === top ? ' hi' : ''}`);
    d.append(el('span', null, abbr), el('b', null, String(hero.stats[k])));
    return d;
  }));

  const raw = hero.statGenes.raw;
  const items = gear ? ['weapon1', 'weapon2', 'offhand1', 'offhand2', 'armor', 'accessory'].map((k) => gear[k]).filter(Boolean) : [];
  const rows = [
    ['HP', el('dd', null, String(hero.stats.hp))],
    ['MP', el('dd', null, String(hero.stats.mp))],
    ['Actives', skillLine(ACTIVE_SKILLS, raw.active1.d, raw.active2.d)],
    ['Passives', skillLine(PASSIVE_SKILLS, raw.passive1.d, raw.passive2.d)],
    ['Stat boosts', el('dd', null, `${hero.statGenes.statBoost1.d} · ${hero.statGenes.statBoost2.d}`)],
    ['Summons', el('dd', null, `${hero.summonsRemaining} / ${hero.maxSummons}`)],
    ['Gear', el('dd', null, items.length ? items.map((g) => g.name).join(' · ') : gear ? 'None' : 'Not read')],
  ];
  $('#facts').replaceChildren(...rows.flatMap(([k, dd]) => [el('dt', null, k), dd]));
}

function parentLink(p, fallbackId) {
  if (!p) {
    const d = el('div', 'parent');
    d.append(el('b', null, `#${fallbackId}`), el('span', null, 'Not found on Avalanche or Kaia'));
    return d;
  }
  const a = el('a', 'parent');
  a.href = `?id=${p.id}`;
  a.append(
    el('b', null, `${p.name} #${p.displayId}`),
    el('span', null, `${className(p.class)} / ${className(p.subClass)} · ${cap(p.rarity)} · Gen ${p.generation} · Lv ${p.level} · ${p.summonsRemaining}/${p.maxSummons} summons`),
  );
  return a;
}

function renderLineage(hero, parents, dark) {
  if (dark) {
    const role = dark.id === hero.summonerId ? 'summoner' : 'assistant';
    const box = $('#dark');
    const p1 = el('p');
    p1.append(`Summoned on ${fmtDate(hero.summonedAt)}. Its ${role} `, el('b', null, `${dark.name} #${dark.displayId}`),
      ` could never summon (${dark.summonsRemaining} of ${dark.maxSummons}): only the Dark Summoning ritual takes parents at zero, and the child is born with ${hero.maxSummons} summons.`);
    box.replaceChildren(
      el('h2', null, 'Born from a Dark Summoning'),
      el('p', null, 'The skull at the top right of the card is the mark the game puts on dark summons.'),
      p1,
    );
    box.hidden = false;
  }
  if (hero.generation > 0 && hero.summonerId && hero.summonerId !== '0') {
    const box = $('#parents');
    box.replaceChildren(el('h2', null, 'Parents'),
      parentLink(parents[0], getDisplayHeroId(hero.summonerId)),
      parentLink(parents[1], getDisplayHeroId(hero.assistantId)));
    box.hidden = false;
  }
}

/* ================= card ================= */
function mountCard(hero, gear, dark) {
  const PAGES = ['front', 'stats', 'growth', 'genes', 'recessiveGenes', 'recessiveVisualGenes', 'history'];
  const handle = createAnimatedHeroCard(hero, { flipOnClick: false, renderer: gear ? { gear } : {} });
  const card = $('#card');
  card.prepend(handle.element);
  $('#badge').hidden = !dark;
  let page = 'front';
  const show = (p) => {
    page = p;
    if (p === 'front') handle.flip(false);
    else { handle.setPage(p); handle.flip(true); }
    card.dataset.page = p;
    document.querySelectorAll('.pages [data-page]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.page === p)));
  };
  document.querySelectorAll('.pages [data-page]').forEach((b) => b.addEventListener('click', () => show(b.dataset.page)));
  const next = () => show(PAGES[(PAGES.indexOf(page) + 1) % PAGES.length]);
  card.addEventListener('click', next);
  card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); next(); } });
}

/* ================= stage ================= */
function mountStage(hero, gear) {
  const stage = $('#stage');
  const canvas = $('#stage-canvas');
  const note = $('#note');
  const FRAME = 1 / 30;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Scenes: the hero's own background gene first in mind, marked with the red diamond.
  const home = hero.visualGenes && hero.visualGenes.background ? hero.visualGenes.background.d : 'plains';
  function setScene(key) {
    const s = SCENES.find((x) => x[0] === key) || SCENES[0];
    $('#scene-bg').style.backgroundImage = `url("${BG}${s[2]}")`;
    $('#scene-front').style.backgroundImage = s[3] ? `url("${BG}${s[3]}")` : 'none';
    stage.dataset.scene = s[0];
    document.querySelectorAll('[data-scene]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.scene === s[0])));
  }
  for (const [key, label] of SCENES) {
    const b = el('button', key === home ? 'is-home' : null, label);
    b.type = 'button'; b.dataset.scene = key;
    if (key === home) b.title = "The hero's background gene";
    b.addEventListener('click', () => setScene(key));
    $('#scenes').append(b);
  }
  setScene(home);

  // The animation catalog for this hero: its weapon's set, its class skills, the generic moves.
  const set = getHeroWeaponAnimationSet(hero, gear);
  const W = (a) => weaponAnimation(set, a);
  const log = $('#event-log');
  let renderer;

  const showEvent = (ev, anim) => {
    const li = el('li', null, `${pretty(anim)} · ${ev.time.toFixed(2)} s · ${ev.name}`);
    if (ev.name === 'hit') {
      li.className = 'is-hit';
      stage.classList.remove('flash'); void stage.offsetWidth; stage.classList.add('flash');
    } else if (ev.name === 'move') li.className = 'is-move';
    log.prepend(li);
    while (log.children.length > 7) log.lastChild.remove();
  };

  // zoom 1.238: the hero stands half the stage tall, as on the Hotoyor page.
  renderer = new HeroRenderer(canvas, hero, { gear: gear || null, autoplay: false, zoom: 1.238, mix: 0.12, onEvent: showEvent });

  const pretty = (name) => name.split('/').pop();
  const WEAPON_LABELS = {
    Hit: set === 'Bow' ? 'Shot' : 'Attack', 'Hit Angled': 'Angled shot', 'Hit Alt': 'Attack (alt)', Hit2: 'Attack 2',
    Multishot: 'Multishot', Channel: 'Channel', Charge: 'Charge', Combo: 'Combo', Melee: 'Melee', Gun: 'Gun',
    Special1: 'Special 1', Special2: 'Special 2', MoveForward: 'Step in', MoveBackward: 'Step back', Celebrate: 'Celebrate',
  };
  const ORDER = ['Hit', 'Hit Angled', 'Hit Alt', 'Hit2', 'Multishot', 'Draw', 'Channel', 'Charge', 'Combo', 'Melee', 'Gun', 'Special1', 'Special2', 'MoveForward', 'MoveBackward', 'Celebrate'];

  renderer.ready.then(async () => {
    const all = renderer.animations;
    const has = (n) => all.includes(n);
    const prefix = `WEAPONS/${set}/${set} `;
    const weaponMoves = all.filter((n) => n.startsWith(prefix)).map((n) => n.slice(prefix.length));

    const ACTIONS = [];
    for (const m of ORDER) {
      if (!weaponMoves.includes(m)) continue;
      if (m === 'Draw') { if (weaponMoves.includes('Release')) ACTIONS.push(['draw', 'Draw & release', [W('Draw'), W('Release')]]); continue; }
      ACTIONS.push([m.toLowerCase().replace(/\s+/g, '-'), WEAPON_LABELS[m] || m, [W(m)]]);
    }
    ACTIONS.push(
      ['hurt', 'Get hit', [HERO_ANIMATIONS.hurt]],
      ['down', 'Fall & get up', [HERO_ANIMATIONS.down, HERO_ANIMATIONS.getUp]],
      ['shout', 'Shout', [HERO_ANIMATIONS.shout]],
      ['item', 'Use item', [HERO_ANIMATIONS.useItem]],
    );
    const classes = [hero.class, hero.subClass].map((c) => String(c).toLowerCase());
    const CLASS_ACTIONS = all.filter((n) => n.startsWith('CLASS/') && classes.includes(n.split('/')[1].toLowerCase()) && !/-Loop$/.test(n))
      .map((n) => [`class-${n}`, `${pretty(n)}${hero.class.toLowerCase() === n.split('/')[1].toLowerCase() ? '' : ' (sub)'}`, [n]]);

    const work = hero.profession ? professionAnimation(hero.profession) : null;
    const POSES = [
      ['casual', 'Rest', W('Casual'), null],
      ['idle', 'On guard', W('Idle'), 'colosseum'],
      ['walk', 'Walk', HERO_ANIMATIONS.walk, null],
      ['town', 'In town', HERO_ANIMATIONS.overworldIdle, null],
      ['talk', 'Talk', HERO_ANIMATIONS.overworldTalk, null],
      ['spectator', 'Spectator', HERO_ANIMATIONS.spectator, 'colosseum'],
      work && has(work) ? ['work', cap(hero.profession), work, hero.profession] : null,
      ['training', 'Training', HERO_ANIMATIONS.training, null],
    ].filter((p) => p && has(p[2]));
    const CALM = new Set(['walk', 'town', 'talk', 'work', 'training']);

    // State: the player's own clock (t), and a view clock for frame stepping while paused.
    let speed = 1, paused = reduceMotion, mirrored = false;
    let loopPose = POSES[0], cur = loopPose[2], curLoop = true, t = 0, view = null, queue = [];

    const dur = () => renderer.duration(cur);
    const nowTime = () => {
      const d = dur(), at = view == null ? t : view;
      const n = Math.max(1, Math.round(d / FRAME));
      const i = Math.min(n, Math.floor(at / FRAME + 1e-6) + 1);
      $('#now-time').textContent = d > 0 ? `${at.toFixed(2)} / ${d.toFixed(2)} s · frame ${i}/${n}` : '';
    };

    async function start(name, loop) {
      cur = name; curLoop = loop; t = 0; view = null;
      $('#now-name').textContent = pretty(name);
      await renderer.play(name, { loop });
    }
    function markActions(id) { document.querySelectorAll('button.act').forEach((b) => b.classList.toggle('is-on', b.dataset.act === id)); }

    function setPose(id) {
      const p = POSES.find((x) => x[0] === id);
      loopPose = p; queue = [];
      markActions(null);
      if (p[3]) setScene(p[3]); else if (WORK_SCENES.has(stage.dataset.scene)) setScene(home);
      document.querySelectorAll('[data-pose]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pose === id)));
      start(p[2], true);
    }
    function runAction([id, , seq]) {
      if (CALM.has(loopPose[0])) {
        loopPose = POSES.find((x) => x[0] === 'idle') || POSES[0];
        document.querySelectorAll('[data-pose]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pose === loopPose[0])));
      }
      if (WORK_SCENES.has(stage.dataset.scene)) setScene('colosseum');
      markActions(id);
      queue = seq.slice(1);
      start(seq[0], false);
      if (paused) setPaused(false);
    }

    function setPaused(p) {
      paused = p;
      $('#btn-pause').textContent = p ? 'Play' : 'Pause';
      $('#btn-pause').setAttribute('aria-pressed', String(p));
      $('#btn-prev').disabled = !p;
      $('#btn-next').disabled = !p;
      if (!p) view = null; // carry on from where the player really is
    }
    function step(dir) {
      const d = dur();
      let v = (view == null ? t : view) + dir * FRAME;
      v = curLoop ? ((v % d) + d) % d : Math.min(Math.max(0, v), d);
      view = v;
      renderer.renderAt(cur, v, { loop: curLoop });
      nowTime();
    }
    function setSpeed(s) {
      speed = s;
      document.querySelectorAll('[data-speed]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === s)));
    }

    // Buttons
    for (const a of ACTIONS) {
      const b = el('button', 'act', a[1]); b.type = 'button'; b.dataset.act = a[0]; b.title = a[2].map(pretty).join(' → ');
      b.addEventListener('click', () => runAction(a));
      $('#actions').append(b);
    }
    for (const a of CLASS_ACTIONS) {
      const b = el('button', 'act', a[1]); b.type = 'button'; b.dataset.act = a[0]; b.title = a[2][0];
      b.addEventListener('click', () => runAction(a));
      $('#class-actions').append(b);
    }
    $('#class-group').hidden = CLASS_ACTIONS.length === 0;
    $('#actions-title').textContent = `Actions · ${set}`;
    for (const [id, label, anim] of POSES) {
      const b = el('button', null, label); b.type = 'button'; b.dataset.pose = id; b.title = pretty(anim);
      b.setAttribute('aria-pressed', String(id === loopPose[0]));
      b.addEventListener('click', () => setPose(id));
      $('#poses').append(b);
    }
    document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => setSpeed(Number(b.dataset.speed))));
    $('#btn-pause').addEventListener('click', () => setPaused(!paused));
    $('#btn-prev').addEventListener('click', () => step(-1));
    $('#btn-next').addEventListener('click', () => step(1));
    $('#btn-mirror').addEventListener('click', () => {
      mirrored = !mirrored;
      canvas.classList.toggle('mirror', mirrored);
      $('#btn-mirror').setAttribute('aria-pressed', String(mirrored));
    });

    // Load what the buttons play, then run the clock.
    note.textContent = 'Loading the animations…';
    const needed = [...new Set([...POSES.map((p) => p[2]), ...ACTIONS.flatMap((a) => a[2]), ...CLASS_ACTIONS.flatMap((a) => a[2])])];
    await renderer.preload(loopPose[2]);
    await start(loopPose[2], true);
    renderer.tick(0);
    note.hidden = true;
    setPaused(paused);
    setSpeed(1);
    renderer.preload(...needed).catch((e) => console.warn('preload', e));

    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (!paused) {
        const adv = dt * speed;
        renderer.tick(adv);
        t += adv;
        const d = dur();
        if (!curLoop && d > 0 && t >= d) {
          if (queue.length) start(queue.shift(), false);
          else { markActions(null); start(loopPose[2], true); }
        } else if (curLoop && d > 0 && t >= d) t %= d;
      }
      nowTime();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame((n) => { last = n; frame(n); });
    // Keep the still frame sharp when the window changes size while paused.
    new ResizeObserver(() => { if (paused) { if (view == null) renderer.tick(0); else renderer.renderAt(cur, view, { loop: curLoop }); } }).observe(canvas);
  }).catch((e) => {
    console.error(e);
    note.hidden = false;
    note.textContent = 'The rig did not load: reload the page.';
  });
}
