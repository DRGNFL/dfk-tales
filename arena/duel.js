/* DFK Tales Arena — two players, browser to browser (the real arena, first version).
   Nothing of ours runs on a server: the two browsers find each other through PeerJS's free meeting point (0.peerjs.com),
   then talk directly over WebRTC (through PeerJS's relay when a network blocks direct links).
   The battle is deterministic (combat.js and one seed), so only the choices travel and both browsers compute the same
   fight; after every action each one sends a fingerprint of the battle, and if the two differ the match stops.
   Messages are JSON text. Tests can point PeerJS somewhere else with window.DFK_PEER (its options). */
import { Peer } from 'https://esm.sh/peerjs@1.5.4?bundle';

export const PROTO = 1;
const PREFIX = 'dfktales-arena-1-';
const CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
export const newCode = () => { const a = new Uint32Array(6); crypto.getRandomValues(a); return Array.from(a, (n) => CHARS[n % CHARS.length]).join(''); };
export const isCode = (c) => /^[a-z0-9]{6}$/.test(String(c || ''));
const options = () => (typeof window !== 'undefined' && window.DFK_PEER) || {};
const BEAT_MS = 4000, GONE_MS = 30000;

/* Open a link. role 'host': opens the challenge `code` and waits for one friend (another can come if that one leaves
   before the battle). role 'guest': joins the challenge `code`.
   on: { ready() the meeting point knows us, joined() the friend is connected, message(msg), left(why) the friend is gone,
         error(kind) a PeerJS error type: 'unavailable-id', 'peer-unavailable', 'network', 'server-error', … }
   Returns { send(msg), close() }. */
export function open(role, code, on) {
  const peer = role === 'host' ? new Peer(PREFIX + code, options()) : new Peer(options());
  let conn = null, beat = null, seen = 0, shut = false;
  const send = (msg) => { if (conn && conn.open) { try { conn.send(JSON.stringify(msg)); } catch (e) { /* closing */ } } };
  const drop = (why) => {
    if (!conn) return;
    const c = conn; conn = null;
    clearInterval(beat); beat = null;
    try { c.close(); } catch (e) { /* gone */ }
    if (role === 'guest') { shut = true; try { peer.destroy(); } catch (e) { /* gone */ } }
    if (on.left) on.left(why);
  };
  const attach = (c) => {
    conn = c;
    c.on('open', () => {
      if (conn !== c) return;
      seen = Date.now();
      beat = setInterval(() => { if (Date.now() - seen > GONE_MS) drop('timeout'); else send({ t: 'beat' }); }, BEAT_MS);
      if (on.joined) on.joined();
    });
    c.on('data', (d) => {
      if (conn !== c) return;
      seen = Date.now();
      let m = null;
      try { m = typeof d === 'string' ? JSON.parse(d) : d; } catch (e) { return; }
      if (!m || m.t === 'beat') return;
      if (m.t === 'bye') { drop('left'); return; }
      if (on.message) on.message(m);
    });
    c.on('close', () => { if (conn === c) drop('closed'); });
    c.on('error', () => { if (conn === c) drop('error'); });
  };
  peer.on('open', () => {
    if (shut) return;
    if (role === 'host') { if (on.ready) on.ready(); return; }
    attach(peer.connect(PREFIX + code, { reliable: true }));
  });
  peer.on('connection', (c) => {
    if (conn || shut) { c.on('open', () => { try { c.send(JSON.stringify({ t: 'busy' })); } catch (e) { /* gone */ } setTimeout(() => c.close(), 400); }); return; }
    attach(c);
  });
  // The meeting point can drop us while we wait: knock again (the link between the two browsers does not need it).
  peer.on('disconnected', () => { if (!shut && role === 'host') setTimeout(() => { try { if (!shut && peer.disconnected) peer.reconnect(); } catch (e) { /* destroyed */ } }, 2000); });
  peer.on('error', (e) => { if (!shut && on.error) on.error(e && e.type ? e.type : 'error'); });
  return {
    send,
    close() {
      if (shut) return;
      shut = true;
      send({ t: 'bye' });
      clearInterval(beat);
      setTimeout(() => { try { if (conn) conn.close(); } catch (e) { /* gone */ } try { peer.destroy(); } catch (e) { /* gone */ } }, 200);
    },
  };
}
