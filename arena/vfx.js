/* DFK Tales Arena — the game's visual effects on the field: sprite strips played over a hero's box.
   A hero's box (.ftr) is u x u px with the feet at (50%, 93%), as the rig draws them; one sprite pixel is one rig unit,
   so an effect is drawn at u / 100 * zoom px per pixel. Its pivot sits on the feet (or on another anchor): the pivot is
   in PERCENT of the sprite (the game hands it to PIXI as anchor / 100), and the sprite mirrors around it.
   Data: ./vfx-data.js (read from the game client). */
import DATA from './vfx-data.js?v=1';

const RIG_H = 100.03; // the rig's bounds height, in rig units (SDK hero-rig/baked/rig.json)
const url = (p) => (p.startsWith('R/') ? `${DATA.base.R}/${p.slice(2)}` : p.startsWith('C/') ? `${DATA.base.C}/${p.slice(2)}` : p);
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const SKILLS = new Map(Object.entries(DATA.skills).map(([k, v]) => [norm(k), v]));

/* The effects of an ability by its name (Codex skills, traits, pet skills), or null. */
export const skillFx = (name) => SKILLS.get(norm(name)) || null;
export const STATUS = DATA.status;
export const LOOPS = DATA.loops;

/* Load a few sheets ahead, so the first time they play they do not blink. */
const seen = new Set();
export function preload(ids) {
  for (const id of ids) {
    const sh = DATA.sheets[id];
    if (!sh || seen.has(id)) continue;
    seen.add(id);
    const im = new Image(); im.src = url(sh[0]);
  }
}
export function preloadSkill(name) {
  const d = skillFx(name);
  if (d) preload(Object.values(d).map((fx) => fx[0]));
}

/* Play an effect in a hero's box.
   fx: [sheet, speed, blend, delay s, pivot x, pivot y, defaultFlip, disableFlip, zIndexOffset, flags].
   o: { u, zoom, side ('A' left, 'B' right), back (behind the hero), loop, delay (ms, instead of the effect's own), at {x, y} }.
   Returns the element (for loops), or null. */
export function play(node, fx, o) {
  const [id, speed, blend, delay, px, py, dflip, noflip] = fx;
  const sh = DATA.sheets[id];
  if (!sh || !node) return null;
  const [path, fw, fh, n] = sh;
  const s = (o.u / RIG_H) * o.zoom;
  const W = fw * s, H = fh * s;
  const e = document.createElement('i');
  e.className = `vfx${o.back ? ' back' : ''}`;
  const ax = o.at ? o.at.x : o.u / 2, ay = o.at ? o.at.y : o.u * 0.93;
  const pX = (px / 100) * W, pY = (py / 100) * H;
  Object.assign(e.style, {
    left: `${ax - pX}px`, top: `${ay - pY}px`, width: `${W}px`, height: `${H}px`,
    backgroundImage: `url("${url(path)}")`, backgroundSize: `${n * W}px ${H}px`,
  });
  // As in the game (CombatApp): mirrored when defaultFlip and on your side, or not defaultFlip and on the other side.
  const flip = !noflip && (dflip ? o.side === 'A' : o.side !== 'A');
  if (flip) { e.style.transformOrigin = `${pX}px ${pY}px`; e.style.transform = 'scaleX(-1)'; }
  if (blend === 'ADD') e.style.mixBlendMode = 'plus-lighter';
  else if (blend === 'SCREEN') e.style.mixBlendMode = 'screen';
  const start = () => {
    if (!node.isConnected) return;
    node.append(e);
    const dur = (n / (60 * (speed || 0.2))) * 1000;
    const a = e.animate([{ backgroundPosition: '0px 0px' }, { backgroundPosition: `${-n * W}px 0px` }], { duration: dur, easing: `steps(${n})`, iterations: o.loop ? Infinity : 1 });
    if (!o.loop) a.finished.then(() => e.remove(), () => e.remove());
  };
  const wait = o.delay != null ? o.delay : (delay || 0) * 1000;
  if (wait > 0) setTimeout(start, wait); else start();
  return e;
}
