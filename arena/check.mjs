import * as E from './engine.js';
const pct = (x) => (x * 100).toFixed(2) + '%';
let fails = 0;
const expect = (name, got, want, tol) => { const ok = Math.abs(got - want) <= tol; if (!ok) fails++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: ${got.toFixed(4)} (Hubert ${want})`); };

// Hubert's control case: avgLVL 20; STR 64, DEX 22, AGI 60, VIT 33, END 29, INT 60, WIS 79, LCK 50
const d = E.dynamicStats({ STR: 64, DEX: 22, AGI: 60, VIT: 33, END: 29, INT: 60, WIS: 79, LCK: 50 }, 20);
expect('Speed', d.speed, 109.53, 0.01);
expect('Evasion %', d.evasion * 100, 9.62, 0.01);
expect('Crit %', d.crit * 100, 8.51, 0.01);
expect('Recovery %', d.recovery * 100, 4.45, 0.01);
expect('SER %', d.ser * 100, 6.42, 0.01);
expect('Block %', d.block * 100, 9.99, 0.01);
expect('Spell Block %', d.spellBlock * 100, 9.30, 0.01);
// Speed of AGI 60 at other average levels (combat sources): 123.6 at avgLVL 5, 82.9 at avgLVL 100
expect('Speed AGI60 avg5', E.dynamicStats({ STR: 1, DEX: 1, AGI: 60, VIT: 1, END: 1, INT: 1, WIS: 1, LCK: 1 }, 5).speed, 123.6, 0.1);
expect('Speed AGI60 avg100', E.dynamicStats({ STR: 1, DEX: 1, AGI: 60, VIT: 1, END: 1, INT: 1, WIS: 1, LCK: 1 }, 100).speed, 82.9, 0.1);

// Accuracy sheet: requirement DEX 20, AaR 90%, curve 150 below / 400 above
for (const [dex, want] of [[5, 36], [10, 54], [15, 77.1], [20, 90], [25, 93.4], [30, 98.3], [40, 107.2], [50, 112.7], [70, 117.4], [100, 119.7]]) {
  expect(`Accuracy DEX ${dex}`, E.accuracy({ stat: dex, requirement: 20, aar: 0.9 }) * 100, want, 0.06);
}

// Codex budget: 4 skills at 10, 5 at 15, 5 + 5 subclass points at 20, 4 + 2 at 12
for (const [lvl, tiers, sub] of [[10, 4, 0], [12, 4, 2], [15, 5, 0], [20, 5, 5], [6, 3, 0], [3, 2, 0]]) {
  const b = E.codexBudget(lvl); const ok = b.mainTiers === tiers && b.subPoints === sub; if (!ok) fails++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} Codex level ${lvl}: ${b.mainTiers} tiers + ${b.subPoints} subclass points`);
}

// Dice and timebar are reproducible: the same seed gives the same battle start
const fighters = (seed) => {
  const r = E.makeRng(seed);
  return [60, 45, 30, 50, 40, 70].map((agi, i) => {
    const dyn = E.dynamicStats({ STR: 30, DEX: 30, AGI: agi, VIT: 30, END: 30, INT: 30, WIS: 30, LCK: 40 }, 15);
    return { id: `h${i}`, speed: dyn.speed, initiative: E.startInitiative(dyn, r).value, alive: true };
  });
};
const order = (seed) => { const bar = E.createTimebar(fighters(seed)); const out = []; for (let i = 0; i < 12; i++) { const f = E.nextToAct(bar); out.push(f.id); E.spendTurn(f); } return out.join(' '); };
const o1 = order(42), o2 = order(42), o3 = order(43);
console.log(o1 === o2 ? 'OK  ' : 'FAIL', 'same seed, same turn order:', o1); if (o1 !== o2) fails++;
console.log('     another seed:', o3);
console.log(fails ? `\n${fails} FAILED` : '\nall checks pass');
