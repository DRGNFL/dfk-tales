/* DFK Tales — reading a legion from the chain, for the pages that are not the Legion Viewer (the Arena).
   Same reads as the Legion Viewer: heroes (in batches of 60), gear, pets, items, tokens; the public node drops calls
   when busy, so every read is tried again a few times. The result is kept in this browser (session.js). */
import { createDFKClient } from 'https://esm.sh/@defikingdoms/game-sdk@0.1.0?deps=ethers@5.8.0';
import { readLegion, saveLegion } from './session.js?v=1';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function retry(fn, tries = 4) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) { if (i >= tries - 1) throw e; await sleep(700 * (i + 1) * (i + 1)); }
  }
}
const num = (v) => Number(String(v).replace(/,/g, '')) || 0;
export const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || '').trim());
export const CHAINS = { 43114: 'Avalanche', 8217: 'Kaia' };

/* The legion of an address: kept in this browser when it is there (and not asked fresh), else read from the chain.
   onProgress(text) tells what it is doing. Returns { heroes, gear, pets, items, tokens, savedAt }. */
export async function loadLegion(addr, chainId = 43114, { fresh = false, onProgress = () => {} } = {}) {
  addr = String(addr).trim();
  if (!isAddr(addr)) throw new Error('That is not a wallet address: 0x followed by 40 characters.');
  if (!fresh) {
    const saved = await readLegion(chainId, addr);
    if (saved && saved.heroes && saved.pets && saved.gear) return saved;
  }
  const client = createDFKClient({ chainId });
  onProgress('Reading the legion from the chain…');
  const pGear = retry(() => client.equipment.byOwner(addr, { includeListed: true }));
  const pPets = retry(() => client.pets.byOwner(addr, { includeListed: true }));
  const pItems = retry(() => client.items.balances(addr)).then((l) => l.filter((b) => num(b.formatted) > 0)).catch(() => []);
  const pTokens = retry(() => client.tokens.balances(addr)).catch(() => []);
  const ids = await retry(() => client.heroes.idsByOwner(addr, { includeListed: true }));
  const heroes = [];
  onProgress(`Reading heroes 0 / ${ids.length}`);
  for (let i = 0; i < ids.length; i += 60) {
    heroes.push(...(await retry(() => client.heroes.getMany(ids.slice(i, i + 60)))));
    onProgress(`Reading heroes ${heroes.length} / ${ids.length}`);
  }
  const [gear, pets, items, tokens] = await Promise.all([pGear, pPets, pItems, pTokens]);
  const data = { heroes, gear, pets, items, tokens };
  const savedAt = await saveLegion(chainId, addr, data).catch(() => Date.now());
  return { ...data, savedAt };
}
