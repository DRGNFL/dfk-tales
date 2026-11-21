/* The DFK Tales session, shared by every page.
   - The wallet you connect stays connected on every page until you disconnect it. The site only ever asks the
     wallet for its address: no signature, no transaction, no approval.
   - A legion read from the chain is kept in this browser (IndexedDB), so going back to it does not read it again. */

const WALLET = 'dfk-tales:wallet';
const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
  del: (k) => { try { localStorage.removeItem(k); } catch (e) {} },
};

export const sameAddr = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
export const shortAddr = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const legionUrl = (addr, chainId) => {
  const u = new URL('../legion-viewer/', import.meta.url);
  if (addr) u.searchParams.set('legion', addr);
  if (addr && chainId && Number(chainId) !== 43114) u.searchParams.set('chain', String(chainId));
  return u.href;
};

/* ---------- wallet ---------- */
const subs = new Set();
export const getWallet = () => ls.get(WALLET);
export const hasProvider = () => !!window.ethereum;
export const onWalletChange = (fn) => { subs.add(fn); return () => subs.delete(fn); };
const emit = () => { const w = getWallet(); subs.forEach((fn) => fn(w)); };
const setWallet = (a) => { ls.set(WALLET, a); emit(); };

export async function connectWallet() {
  if (!window.ethereum) throw new Error('No wallet in this browser');
  const [a] = await window.ethereum.request({ method: 'eth_requestAccounts' });
  if (!a) throw new Error('The wallet did not share an address');
  setWallet(a);
  return a;
}
export function disconnectWallet() { ls.del(WALLET); emit(); }

// Another tab connected or disconnected; or the wallet switched account while we are connected.
window.addEventListener('storage', (e) => { if (e.key === WALLET) emit(); });
if (window.ethereum && typeof window.ethereum.on === 'function') {
  window.ethereum.on('accountsChanged', (accs) => {
    const a = accs && accs[0];
    if (getWallet() && a && !sameAddr(a, getWallet())) setWallet(a);
  });
}

/* The wallet chip for the top bar: "Connect wallet" before, the address and × after. */
export function mountWallet(slot, { onOpen, onConnect } = {}) {
  const render = (w) => {
    slot.replaceChildren();
    if (w) {
      const a = document.createElement('a');
      a.className = 'wallet-chip';
      a.href = legionUrl(w);
      a.title = `Connected: ${w}. Opens your legion.`;
      a.textContent = shortAddr(w);
      if (onOpen) a.addEventListener('click', (e) => { e.preventDefault(); onOpen(w); });
      const x = document.createElement('button');
      x.type = 'button'; x.className = 'wallet-x'; x.textContent = '×';
      x.title = 'Disconnect this wallet from DFK Tales'; x.setAttribute('aria-label', 'Disconnect wallet');
      x.addEventListener('click', disconnectWallet);
      slot.append(a, x);
    } else if (hasProvider()) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'wallet-connect'; b.textContent = 'Connect wallet';
      b.title = 'Asks your wallet for its address only: no signature, no transaction, no approval.';
      b.addEventListener('click', async () => {
        try { const a = await connectWallet(); if (onConnect) onConnect(a); } catch (e) { console.warn('wallet', e); }
      });
      slot.append(b);
    }
    slot.hidden = !slot.childElementCount;
  };
  render(getWallet());
  return onWalletChange(render);
}

/* ---------- legions kept in this browser ---------- */
const KEEP = 4; // legions remembered; the oldest goes first
const INDEX = 'dfk-tales:legions';
const legionKey = (chainId, addr) => `${chainId}:${addr.toLowerCase()}`;
let dbp = null;
function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const r = indexedDB.open('dfk-tales', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('legions');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  return dbp;
}
const tx = (mode, fn) => db().then((d) => new Promise((resolve, reject) => {
  const t = d.transaction('legions', mode);
  const req = fn(t.objectStore('legions'));
  t.oncomplete = () => resolve(req && req.result);
  t.onerror = () => reject(t.error);
  t.onabort = () => reject(t.error);
}));

export async function saveLegion(chainId, addr, data) {
  const key = legionKey(chainId, addr);
  const savedAt = Date.now();
  await tx('readwrite', (s) => s.put({ ...data, savedAt }, key));
  let index = [];
  try { index = JSON.parse(ls.get(INDEX) || '[]'); } catch (e) {}
  index = [{ key, savedAt }, ...index.filter((x) => x.key !== key)];
  const drop = index.slice(KEEP);
  ls.set(INDEX, JSON.stringify(index.slice(0, KEEP)));
  for (const x of drop) await tx('readwrite', (s) => s.delete(x.key)).catch(() => {});
  return savedAt;
}
export const readLegion = (chainId, addr) => tx('readonly', (s) => s.get(legionKey(chainId, addr))).catch(() => null);

export function ago(t) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
