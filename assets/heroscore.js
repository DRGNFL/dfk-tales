/* Heroscore X, shared by every DFK Tales page.
   Heroscore from the Hero Transcendence & Divine Essence deck (burn multiplier left at 1).
   Heroscore X = Heroscore × (1 + trait counter): Hubert's Heroscore + Trait Multiplier, Ge's rule.
   Trait counter on the four dominant abilities: Basic 0, Advanced 1, Elite 2, Exalted 3.
   Gen 0 heroes get ×3 even though their traits are Basic (never less than their trait multiplier). */
import { getClassTier } from 'https://esm.sh/@defikingdoms/game-sdk@0.1.0?deps=ethers@5.8.0';

export const tierOf = (r) => (r < 16 ? 0 : r < 24 ? 1 : r < 28 ? 2 : 3);
export const traitScore = (h) => ['active1', 'active2', 'passive1', 'passive2'].reduce((t, k) => t + tierOf(h.statGenes.raw[k].d), 0);

const RANK = { basic: 0, advanced: 1, elite: 2, exalted: 3, transcendent: 4 };
const C_BASE = [150, 3000, 9000, 25000, 75000];
const S_BASE = [150, 450, 1400, 10000, 30000];
const R_BASE = { common: 0, uncommon: 1000, rare: 3000, legendary: 8000, mythic: 16000 };
const levelScore = (l) => (l <= 5 ? l + 1 : l <= 8 ? 2 * (l - 6) + 8 : l <= 15 ? 4 * (l - 9) + 16 : l <= 35 ? 5 * (l - 16) + 45 : l <= 55 ? 7.5 * (l - 36) + 147.5 : 10 * (l - 56) + 300);

const memo = new Map();
export const clearHeroScores = () => memo.clear();

export function heroScore(h) {
  const key = `${h.chainId}:${h.id}`;
  if (memo.has(key)) return memo.get(key);
  const c = RANK[getClassTier(h.statGenes.raw.class.d)] || 0;
  const s = RANK[getClassTier(h.statGenes.raw.subClass.d)] || 0;
  const classScore = C_BASE[c] + 0.25 * C_BASE[s];
  const rarityScore = (R_BASE[h.rarity] || 0) * (1 + c + 0.25 * (1 + s));
  const summonScore = 0.005 * h.summonsRemaining * (100 + h.level) * (S_BASE[c] + 0.25 * S_BASE[s]);
  const base = classScore + rarityScore + summonScore;
  const v = (0.01 + 0.00007 * h.level) * (base * levelScore(h.level)) + base;
  memo.set(key, v);
  return v;
}

export const heroMult = (h) => (h.generation === 0 ? Math.max(3, 1 + traitScore(h)) : 1 + traitScore(h));
export const heroScoreX = (h) => heroScore(h) * heroMult(h);
