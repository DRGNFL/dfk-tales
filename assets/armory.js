/* DFK Tales — the armory: what each hero wears, set from the slot icons around the portrait of its card.
   On the chain a hero was opened, equipped, and stayed that way; the chain is gone, so it stays in this browser.
   Seven slots, as on the card: weapon 1, weapon 2, armour (left), offhand 1, offhand 2, accessory, pet (right).
   Every slot but the pet also has a visage: an item of the same kind drawn over it, looks only.
   One item, one hero: equipping it elsewhere moves it. Heroes never edited here keep what the chain says. */

const KEY = 'dfk-tales:armory';
export const SLOTS = [
  { key: 'weapon1', label: 'Weapon 1', kind: 'weapon', id: 'weapon1Id' },
  { key: 'weapon2', label: 'Weapon 2', kind: 'weapon', id: 'weapon2Id' },
  { key: 'armor', label: 'Armour', kind: 'armor', id: 'armorId' },
  { key: 'offhand1', label: 'Offhand 1', kind: 'offhand', id: 'offhand1Id' },
  { key: 'offhand2', label: 'Offhand 2', kind: 'offhand', id: 'offhand2Id' },
  { key: 'accessory', label: 'Accessory', kind: 'accessory', id: 'accessoryId' },
  { key: 'pet', label: 'Pet', kind: 'pet', id: 'petId' },
];
const GEAR_KEYS = SLOTS.filter((s) => s.kind !== 'pet').flatMap((s) => [s.key, `${s.key}Visage`]);
const clean = (v) => JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? x.toString() : x)));
export const heroKey = (h) => `${h.chainId}:${h.id}`;
export const itemKey = (x) => `${x.chainId}:${x.kind || 'pet'}:${x.id}`;
export const twoHanded = (e) => !!e && (/^2H /.test(e.typeName) || ['Staff', 'Bow', 'Gloves'].includes(e.typeName));
const kindOf = (x) => x.kind || 'pet';

function read() { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.heroes) return s; } catch (e) {} return { heroes: {} }; }
function write(s, changed) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { return 'This browser would not keep the armory (storage full or blocked).'; }
  window.dispatchEvent(new CustomEvent('dfk-armory', { detail: { changed } }));
  return null;
}
/* fn({ changed: [heroKey...] }) after every change, here or in another tab. */
export function onArmoryChange(fn) {
  window.addEventListener('dfk-armory', (e) => fn(e.detail));
  window.addEventListener('storage', (e) => { if (e.key === KEY) fn({ changed: null }); });
}

/* The hero's own entry, or null when it was never edited here. */
export const entryOf = (h) => read().heroes[heroKey(h)] || null;
/* Who wears an item, among the heroes edited here: { key, slot } or null. */
export function wearerOf(x, s = read()) {
  const k = itemKey(x);
  for (const [hk, e] of Object.entries(s.heroes)) for (const [slot, v] of Object.entries(e)) if (slot !== '__hero' && v && itemKey(v) === k) return { key: hk, slot, hero: e.__hero || null };
  return null;
}

/* What the hero wears: { weapon1, weapon1Visage, ..., pet } of item objects.
   chainGear: the SDK's gear for the hero (equipment.forHero) and chainPet, used until the hero is edited here. */
export function wornBy(h, chainGear = null, chainPet = null) {
  const e = entryOf(h);
  if (e) { const out = {}; for (const k of [...GEAR_KEYS, 'pet']) out[k] = e[k] || null; return out; }
  const out = {};
  for (const k of GEAR_KEYS) out[k] = (chainGear && chainGear[k]) || null;
  out.pet = chainPet || null;
  return out;
}

/* The hero as the card and the rig should draw it: equipment ids from what it wears, and the gear for the renderer. */
export function heroLook(h, chainGear = null, chainPet = null) {
  const w = wornBy(h, chainGear, chainPet);
  const equipment = { ...(h.equipment || {}) };
  for (const s of SLOTS) {
    equipment[s.id] = w[s.key] ? w[s.key].id : null;
    if (s.kind !== 'pet') equipment[`${s.key}VisageId`] = w[`${s.key}Visage`] ? w[`${s.key}Visage`].id : null;
  }
  const gear = {};
  for (const k of GEAR_KEYS) gear[k] = w[k];
  const any = GEAR_KEYS.some((k) => gear[k]);
  return { hero: { ...h, equipment }, gear: any ? gear : null, worn: w };
}

/* Put x (or null) in a slot. visage: the looks-only layer. Returns { ok, msg, changed }. */
export function equip(h, slotKey, x, { visage = false, chainGear = null, chainPet = null } = {}) {
  const slot = SLOTS.find((s) => s.key === slotKey);
  if (!slot) return { ok: false, msg: 'Unknown slot.' };
  if (visage && slot.kind === 'pet') return { ok: false, msg: 'Pets have no visage.' };
  const field = visage ? `${slotKey}Visage` : slotKey;
  const s = read();
  const hk = heroKey(h);
  // First edit: start from what the chain says, so nothing the hero wore disappears.
  if (!s.heroes[hk]) { s.heroes[hk] = {}; const w = wornBy(h, chainGear, chainPet); for (const [k, v] of Object.entries(w)) if (v) s.heroes[hk][k] = clean(v); }
  const me = s.heroes[hk];
  me.__hero = { name: h.name, id: h.id, chainId: h.chainId, owner: h.owner };
  const changed = new Set([hk]);
  let note = '';
  if (x) {
    if (kindOf(x) !== slot.kind) return { ok: false, msg: `${x.name} does not go in ${slot.label}.` };
    if (!visage && slot.kind !== 'pet' && (x.equipRequirement || 0) > h.level) return { ok: false, msg: `${x.name} needs level ${x.equipRequirement}: ${h.name} is level ${h.level}.` };
    const hand = slotKey === 'offhand1' ? me.weapon1 : slotKey === 'offhand2' ? me.weapon2 : null;
    if (!visage && hand && twoHanded(hand)) return { ok: false, msg: `${h.name} holds a two-handed ${hand.typeName} in that hand: no room for an offhand.` };
    // one item, one hero
    for (const [ok, e] of Object.entries(s.heroes)) for (const [k, v] of Object.entries(e)) {
      if (k === '__hero' || !v || itemKey(v) !== itemKey(x)) continue;
      if (ok === hk && k === field) continue;
      e[k] = null; changed.add(ok);
      if (ok !== hk) note = ` Taken from ${e.__hero ? e.__hero.name : 'another hero'}.`;
    }
    if (!visage && (slotKey === 'weapon1' || slotKey === 'weapon2') && twoHanded(x)) {
      const off = slotKey === 'weapon1' ? 'offhand1' : 'offhand2';
      if (me[off]) { note += ` ${me[off].name} comes off: two hands needed.`; me[off] = null; }
    }
  }
  me[field] = x ? clean(x) : null;
  const err = write(s, [...changed]);
  if (err) return { ok: false, msg: err };
  return { ok: true, changed: [...changed], msg: x ? `${x.name} on ${h.name}${visage ? ' (visage)' : ''}.${note}` : `${slot.label}${visage ? ' visage' : ''} of ${h.name} is empty.` };
}

/* What the battle uses: weapon 1, offhand 1, armour, accessory, pet; plus the look for the rig. */
export function battleKit(h) {
  const look = heroLook(h);
  const w = look.worn;
  return { weapon: w.weapon1, offhand: w.offhand1, armor: w.armor, accessory: w.accessory, pet: w.pet, weapon2: w.weapon2, offhand2: w.offhand2, look: look.gear };
}
