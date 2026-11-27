/* DFK Tales — Legions: every wallet with heroes on Avalanche, ranked by Heroscore X.
   Runs on GitHub Actions (.github/workflows/legions.yml), never in the browser.
   1. Reads every Transfer of the hero contract since the last run: the last one of each hero is its owner.
   2. Reads the heroes it has not scored yet (getHeroesV3 through the SDK) and scores them with assets/heroscore.js,
      the same file the Legion Viewer uses, so the number is the same.
   3. Heroes listed in the Tavern count for their seller (as in the Legion Viewer). Heroes held by other contracts
      (bridge, claim, markets) are counted apart and not ranked. Burned heroes (to 0x0 or 0x…dEaD) are dropped.
   4. Names: the player's DFK profile name, read from the profile contracts of the old realms (DFK Chain, Metis,
      Kaia, Harmony: the same address is the same player). Avalanche has no profile contract yet.
   5. Working Class: for each profession gene (4 gathering, 8 crafting), per legion, how many heroes have it, the sum of
      each of their 8 stats and, for gathering, the sum of their skill in it and how many are at 10 or more. The page
      picks the profession's two stats from these sums (working.json).
   With the game off, heroes do not level or get summoned, so only the owners change: a run reads only the new
   transfers. FULL=true scores every hero again.
   Usage: node tools/legions/index.mjs <data dir>. Writes state.json.gz (for the next run), legions.json (for the
   page) and run.log. */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ethers } from 'ethers';
import { createDFKClient, getContractAddress, HERO_AUCTION_ABI, PROFILES_ABI } from '@defikingdoms/game-sdk';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(process.argv[2] || 'data');
const T0 = Date.now();
const BUDGET = (Number(process.env.BUDGET_MIN) || 300) * 60e3;
const FULL = process.env.FULL === 'true';
const CHAIN = 43114;
const RPCS = (process.env.RPCS || [
  'https://api.avax.network/ext/bc/C/rpc',
  'https://avalanche-c-chain-rpc.publicnode.com',
  'https://avax.meowrpc.com',
  'https://1rpc.io/avax/c',
].join(',')).split(',').map((s) => s.trim()).filter(Boolean);
const CORE = getContractAddress('heroCore', CHAIN).toLowerCase();
const AUCTION = String(getContractAddress('heroAuction', CHAIN) || '').toLowerCase();
const TRANSFER = ethers.utils.id('Transfer(address,address,uint256)');
const BURN = new Set(['0x0000000000000000000000000000000000000000', '0x000000000000000000000000000000000000dead']);

fs.mkdirSync(DATA, { recursive: true });
const lines = [];
const log = (...a) => { const s = `[${((Date.now() - T0) / 60e3).toFixed(1)}m] ${a.join(' ')}`; lines.push(s); console.log(s); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const left = () => BUDGET - (Date.now() - T0);

/* Heroscore X from the site's own file: only its SDK import changes (esm.sh in the browser, npm here). */
const hsSrc = fs.readFileSync(path.join(HERE, '../../assets/heroscore.js'), 'utf8')
  .replace(/from\s+'https:\/\/esm\.sh\/@defikingdoms\/game-sdk[^']*'/, "from '@defikingdoms/game-sdk'");
if (!hsSrc.includes("from '@defikingdoms/game-sdk'")) throw new Error('heroscore.js: SDK import not found');
fs.writeFileSync(path.join(HERE, '.heroscore.mjs'), hsSrc);
const { heroScoreX } = await import(pathToFileURL(path.join(HERE, '.heroscore.mjs')).href);

/* ---------- nodes: public, so every call is tried on the next node when one fails ---------- */
const nodes = RPCS.map((u) => ({ u, p: new ethers.providers.StaticJsonRpcProvider(u, CHAIN), fails: 0 }));
let cur = 0;
async function rpc(method, params, tries = nodes.length * 3) {
  let err;
  for (let i = 0; i < tries; i++) {
    const n = nodes[(cur + i) % nodes.length];
    try { const r = await n.p.send(method, params); cur = (cur + i) % nodes.length; return r; }
    catch (e) { err = e; n.fails++; await sleep(400 * (1 + Math.floor(i / nodes.length))); }
  }
  throw err;
}
const provider = () => nodes[cur].p;

/* ---------- state ---------- */
const STATE = path.join(DATA, 'state.json.gz');
let st = { v: 1, block: 0, heroes: {}, code: {}, names: {} };
if (fs.existsSync(STATE)) st = JSON.parse(zlib.gunzipSync(fs.readFileSync(STATE)).toString());
const saveState = () => fs.writeFileSync(STATE, zlib.gzipSync(JSON.stringify(st)));
st.names = st.names || {};
log(`state: block ${st.block}, ${Object.keys(st.heroes).length} heroes, nodes ${RPCS.length}`);

/* ---------- where the contract starts ---------- */
async function firstBlock() {
  if (process.env.START_BLOCK) return Number(process.env.START_BLOCK);
  for (const base of ['https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan/api', 'https://api.snowtrace.io/api']) {
    try {
      const r = await fetch(`${base}?module=contract&action=getcontractcreation&contractaddresses=${CORE}`).then((x) => x.json());
      const tx = r && r.result && r.result[0] && r.result[0].txHash;
      if (tx) {
        const rc = await rpc('eth_getTransactionReceipt', [tx]);
        if (rc) { log(`contract created at block ${Number(rc.blockNumber)} (${base.split('/')[2]})`); return Number(rc.blockNumber); }
      }
    } catch (e) { log(`creation lookup failed on ${base.split('/')[2]}: ${e.message}`); }
  }
  throw new Error('Could not find where the hero contract starts: set START_BLOCK.');
}

/* ---------- 1. transfers ---------- */
async function scan() {
  const head = Number(await rpc('eth_blockNumber', [])) - 3;
  let from = st.block ? st.block + 1 : await firstBlock();
  log(`transfers: blocks ${from} → ${head} (${head - from + 1} blocks)`);
  let size = 2048, bad = Infinity, ok = 0, seen = 0, calls = 0, lastSave = Date.now();
  while (from <= head) {
    if (left() < BUDGET * 0.45) { log(`time: stopping the scan at block ${from - 1}, the next run goes on`); break; }
    const to = Math.min(head, from + size - 1);
    let logs;
    try {
      logs = await rpc('eth_getLogs', [{ address: CORE, topics: [TRANSFER], fromBlock: ethers.utils.hexValue(from), toBlock: ethers.utils.hexValue(to) }], 2);
    } catch (e) {
      bad = size; size = Math.max(16, Math.floor(size / 2)); ok = 0;
      if (size === 16) await sleep(2000);
      continue;
    }
    calls++;
    for (const l of logs) {
      if (!l.topics || l.topics.length < 4) continue;
      const id = BigInt(l.topics[3]).toString();
      const owner = '0x' + l.topics[2].slice(26).toLowerCase();
      const h = st.heroes[id];
      if (h) h[0] = owner; else st.heroes[id] = [owner, null];
    }
    seen += logs.length;
    st.block = to;
    from = to + 1;
    if (++ok % 25 === 0) bad *= 2;
    size = Math.min(size * 2, bad - 1, 500000);
    if (Date.now() - lastSave > 5 * 60e3) { saveState(); lastSave = Date.now(); log(`  … block ${to}, ${seen} transfers, ${Object.keys(st.heroes).length} heroes`); }
  }
  log(`transfers: ${seen} read in ${calls} calls, now at block ${st.block} of ${head}`);
  saveState();
  return st.block >= head;
}

/* ---------- 2. scores ---------- */
/* What a hero brings to work: [gathering gene, crafting gene 1, crafting gene 2, STR, INT, WIS, LCK, AGI, VIT, END, DEX,
   mining, gardening, fishing, foraging skill × 10]. Stats in the HeroCore order. */
const STATS = ['strength', 'intelligence', 'wisdom', 'luck', 'agility', 'vitality', 'endurance', 'dexterity'];
const GATHER = ['mining', 'gardening', 'fishing', 'foraging'];
const dom = (g) => (g && typeof g === 'object' ? g.d : g); // the SDK gives { d, r1, r2, r3 }: the dominant gene counts
const work = (h) => [dom(h.statGenes.profession), dom(h.statGenes.crafting1), dom(h.statGenes.crafting2),
  ...STATS.map((k) => Number(h.stats[k]) || 0), ...GATHER.map((k) => Math.round((Number(h.skills && h.skills[k]) || 0) * 10))];

async function score() {
  const ids = Object.keys(st.heroes).filter((id) => !BURN.has(st.heroes[id][0]) && (FULL || st.heroes[id][1] == null || !st.heroes[id][2]));
  log(`scores: ${ids.length} heroes to read`);
  const client = createDFKClient({ chainId: CHAIN, provider: provider() });
  let done = 0, broken = 0, lastSave = Date.now();
  async function batch(list) {
    for (let t = 0; t < 4; t++) {
      try {
        const hs = await client.heroes.getMany(list);
        for (const h of hs) { const r = st.heroes[String(h.id)]; if (r) { r[1] = Math.round(heroScoreX(h)); r[2] = work(h); } }
        return;
      } catch (e) { await sleep(700 * (t + 1) * (t + 1)); }
    }
    if (list.length > 1) { const m = list.length >> 1; await batch(list.slice(0, m)); await batch(list.slice(m)); return; }
    broken++; log(`  hero ${list[0]} could not be read`);
  }
  const queue = [];
  for (let i = 0; i < ids.length; i += 60) queue.push(ids.slice(i, i + 60));
  const worker = async () => {
    while (queue.length) {
      if (left() < BUDGET * 0.08) return;
      const b = queue.shift();
      await batch(b);
      done += b.length;
      if (Date.now() - lastSave > 5 * 60e3) { lastSave = Date.now(); saveState(); log(`  … ${done} / ${ids.length} scored`); }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  log(`scores: ${done} read, ${broken} unreadable, ${queue.length * 60} left for the next run`);
  saveState();
}

/* ---------- 3. who owns what ---------- */
async function sellers(ids) {
  const out = new Map();
  if (!AUCTION || !ids.length) return out;
  const c = new ethers.Contract(AUCTION, HERO_AUCTION_ABI, provider());
  for (let i = 0; i < ids.length; i += 100) {
    const part = ids.slice(i, i + 100);
    try {
      const list = await c.getAuctions(part);
      list.forEach((a, k) => { if (a && a.seller && a.seller !== ethers.constants.AddressZero) out.set(part[k], a.seller.toLowerCase()); });
    } catch (e) { log(`  tavern sellers ${i}: ${e.message.slice(0, 80)}`); }
  }
  return out;
}
async function isContract(addrs) {
  const todo = addrs.filter((a) => st.code[a] == null);
  log(`wallets: ${todo.length} new addresses to check`);
  const q = [...todo];
  const worker = async () => {
    while (q.length) {
      const a = q.shift();
      try {
        const code = await rpc('eth_getCode', [a, 'latest']);
        /* A wallet with an EIP-7702 delegation has code 0xef0100…: still a person. */
        st.code[a] = code && code !== '0x' && !code.startsWith('0xef0100') ? 1 : 0;
      } catch (e) { /* asked again next run */ }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
}

async function rank(caughtUp) {
  const held = Object.entries(st.heroes).filter(([, h]) => !BURN.has(h[0]));
  const listed = held.filter(([, h]) => h[0] === AUCTION).map(([id]) => id);
  const sell = await sellers(listed);
  const owner = (id, h) => (h[0] === AUCTION && sell.has(id) ? sell.get(id) : h[0]);
  await isContract([...new Set(held.map(([id, h]) => owner(id, h)))]);
  const by = new Map();
  let pending = 0;
  for (const [id, h] of held) {
    const o = owner(id, h);
    const e = by.get(o) || [o, 0, 0];
    e[1]++; if (h[1] == null) pending++; else e[2] += h[1];
    by.set(o, e);
  }
  const all = [...by.values()].sort((a, b) => b[2] - a[2] || b[1] - a[1]);
  const legions = all.filter((e) => st.code[e[0]] !== 1);
  if (left() > 60e3) await names(legions.map((e) => e[0]));
  for (const e of legions) { const n = st.names[e[0]]; if (n && n[0]) e.push(n[0]); }
  const contracts = all.filter((e) => st.code[e[0]] === 1);
  const out = {
    v: 1, chainId: CHAIN, contract: CORE, updatedAt: new Date().toISOString(), block: st.block, caughtUp, pending,
    heroes: legions.reduce((t, e) => t + e[1], 0), listed: listed.length,
    legions, contracts,
  };
  fs.writeFileSync(path.join(DATA, 'legions.json'), JSON.stringify(out));
  workingClass(held, owner, legions);
  log(`ranking: ${legions.length} legions, ${out.heroes} heroes; ${contracts.length} contracts hold ${contracts.reduce((t, e) => t + e[1], 0)}; ${listed.length} in the Tavern; ${pending} not scored yet`);
  return legions;
}

/* ---------- names: first profile found on the old realms; asked again after a week ---------- */
const REALMS = [[53935, 'DFK Chain'], [1088, 'Metis'], [8217, 'Kaia'], [1666600000, 'Harmony', 'https://api.harmony.one']];
async function names(addrs) {
  const realms = [];
  for (const [id, label, url] of REALMS) {
    try {
      const prov = url ? new ethers.providers.StaticJsonRpcProvider(url, id) : createDFKClient({ chainId: id }).provider;
      realms.push({ label, id, c: new ethers.Contract(getContractAddress('profiles', id), PROFILES_ABI, prov) });
    } catch (e) { log(`names: ${label} not usable (${e.message.slice(0, 60)})`); }
  }
  const week = 7 * 864e5;
  const q = addrs.filter((a) => !st.names[a] || !st.names[a][0] || Date.now() - st.names[a][2] > week);
  const found = {}, down = {}, why = {}, asked = q.length;
  const worker = async () => {
    while (q.length) {
      const a = q.shift();
      let got = null, failed = 0;
      for (const r of realms) {
        let p = null;
        for (let t = 0; t < 2 && !p; t++) {
          try { p = await r.c.getProfileByAddress(a); }
          catch (e) {
            /* A wallet with no profile makes the contract revert: that is an answer, not a failure. */
            if (e.code === 'CALL_EXCEPTION') { p = { _name: '' }; break; }
            if (t === 1) { failed++; down[r.label] = (down[r.label] || 0) + 1; why[r.label] = why[r.label] || String(e.code || e.message).slice(0, 80); }
            else await sleep(800);
          }
        }
        if (p && p._name) { got = [p._name, r.id]; found[r.label] = (found[r.label] || 0) + 1; break; }
      }
      if (got) st.names[a] = [got[0], got[1], Date.now()];
      else if (failed < realms.length) st.names[a] = ['', 0, Date.now()];
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  log(`names: ${asked} asked; found ${JSON.stringify(found)}; errors ${JSON.stringify(down)} ${JSON.stringify(why)}`);
}

/* ---------- Working Class ---------- */
function workingClass(held, owner, legions) {
  const ranked = new Set(legions.map((e) => e[0]));
  const prof = {};
  const add = (p, o, w, gather) => {
    if (!p || /unknown/i.test(p)) return;
    const m = prof[p] || (prof[p] = new Map());
    const e = m.get(o) || m.set(o, [o, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).get(o);
    e[1]++;
    for (let k = 0; k < 8; k++) e[2 + k] += w[3 + k];
    if (gather) { const g = GATHER.indexOf(p); e[10] += w[11 + g]; if (w[11 + g] >= 100) e[11]++; }
  };
  let pending = 0;
  for (const [id, h] of held) {
    const o = owner(id, h);
    if (!ranked.has(o)) continue;
    const w = h[2];
    if (!w) { pending++; continue; }
    const [p, c1, c2] = [dom(w[0]), dom(w[1]), dom(w[2])];
    add(p, o, w, true);
    add(c1, o, w, false);
    if (c2 !== c1) add(c2, o, w, false);
  }
  const names = {};
  for (const e of legions) if (e[3]) names[e[0]] = e[3];
  const out = { v: 1, updatedAt: new Date().toISOString(), block: st.block, pending, stats: ['STR', 'INT', 'WIS', 'LCK', 'AGI', 'VIT', 'END', 'DEX'], names, professions: {} };
  for (const [p, m] of Object.entries(prof)) out.professions[p] = [...m.values()].map((e) => (GATHER.includes(p) ? e : e.slice(0, 10)));
  fs.writeFileSync(path.join(DATA, 'working.json'), JSON.stringify(out));
  log(`working class: ${Object.entries(prof).map(([p, m]) => `${p} ${[...m.values()].reduce((t, e) => t + e[1], 0)}`).join(', ')}; ${pending} heroes not read yet`);
}

/* ---------- 4. check: the top legions, counted the Legion Viewer's way ---------- */
async function check(legions) {
  const client = createDFKClient({ chainId: CHAIN, provider: provider() });
  for (const [a, n] of legions.slice(0, 3)) {
    try {
      const ids = await client.heroes.idsByOwner(a, { includeListed: true });
      log(`check ${a.slice(0, 6)}…${a.slice(-4)}: ${n} here, ${ids.length} by the Legion Viewer's reading ${n === ids.length ? 'OK' : 'DIFFERENT'}`);
    } catch (e) { log(`check ${a.slice(0, 6)}: ${e.message.slice(0, 80)}`); }
  }
}

try {
  const caughtUp = await scan();
  await score();
  const legions = await rank(caughtUp);
  if (caughtUp) await check(legions);
  log(`nodes: ${nodes.map((n) => `${n.u.split('/')[2]} ${n.fails} fails`).join(', ')}`);
} catch (e) {
  log(`ERROR ${e.stack || e.message}`);
  saveState();
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(DATA, 'run.log'), lines.join('\n') + '\n');
}
