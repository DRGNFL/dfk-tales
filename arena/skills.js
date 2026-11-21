/* DFK Tales Arena — class skills (Skill Codex tiers 1-5), state after patch 2.8.2. Knight, Archer and Priest here;
   Warrior, Seer, Berserker, Wizard and Pirate in skills-more.js.
   Numbers from the patch notes and the class pages (see the project doc "dfk-abilita-classi").
   mana: [base, growth] -> cost = base + growth x level. amnesia: turns the skill stays locked after use.
   channel: Initiative the hero must gather before the skill resolves. Stat scores (STR.S...) are in percent points.
   Each skill's run(c, target) uses the battle context from combat.js. "note" lists what is not simulated yet. */

import { MORE } from './skills-more.js?v=2';

const sk = (cls, o) => ({ cls, id: `${cls}.${o.key}`, target: 'enemy', reach: 3, amnesia: 0, channel: 0, magic: false, ...o });
const bleed = { key: 'bleed', label: 'Bleed', tag: 'BLEED', turns: 3, stackMax: 5 };
const stun = { key: 'stun', label: 'Stun', tag: 'STUN' };

/* ---------------- Knight ---------------- */
const KNIGHT = [
  sk('knight', { key: 'challenge', tier: 1, branch: 'Honor', name: 'Challenge', mana: [1.25, 0.75], reach: 3, amnesia: 2, anim: 'CLASS/Knight/1H Cast',
    text: 'Taunt for 2 turns at (25 + 3·STR.S + 3·END.S)%; (30 + 6·STR.S)% Intimidate 10% for 2 turns. If it does not taunt: +400 Initiative. (5·END.S)% Unstoppable on himself for 2 turns.',
    note: 'Does not yet cancel the target\'s taunts on allies.',
    run(c, t) {
      let taunted = false;
      if (c.chance(25 + 3 * c.S('STR') + 3 * c.S('END'))) { c.fx(t, { key: 'taunt', by: c.src.id, turns: 2, label: 'Taunt', tag: 'TAUNT' }); taunted = true; }
      if (c.chance(30 + 6 * c.S('STR'))) c.fx(t, { key: 'intimidate', value: 10, turns: 2, label: 'Intimidate 10%' });
      if (!taunted) c.initiative(400);
      if (c.chance(5 * c.S('END'))) c.fx(c.src, { key: 'unstoppable', turns: 2, label: 'Unstoppable' });
    } }),
  sk('knight', { key: 'mightyStrike', tier: 1, branch: 'Valor', name: 'Mighty Strike', mana: [3.25, 0.75], reach: 1, anim: 'CLASS/Knight/Mighty Strike',
    text: '1.4·ATTACK + 1.0·STR; (30 + 6·STR.S)% −25% P.DEF for 2 turns (stacks 2).',
    run(c, t) {
      const r = c.strike(t, 1.4 * c.ATK + 1.0 * c.stat('STR'));
      if (r.hit && c.chance(30 + 6 * c.S('STR'))) c.fx(t, { key: 'pdef', value: -25, neg: true, turns: 2, stackMax: 2, label: 'P.DEF −25%' });
    } }),
  sk('knight', { key: 'shieldUp', tier: 1, branch: 'Iron', name: 'Shield Up', mana: [1.25, 0.75], target: 'self', amnesia: 2, anim: 'CLASS/Knight/1H Cast',
    text: 'For 3 turns: +10% Block, +50% P.DEF, −20% damage dealt. +300 Initiative.',
    run(c) {
      c.fx(c.src, { key: 'block', value: 10, turns: 3, label: 'Shield Up Block' });
      c.fx(c.src, { key: 'pdef', value: 50, turns: 3, label: 'Shield Up P.DEF', tag: 'SHIELD UP' });
      c.fx(c.src, { key: 'dmgOut', value: -20, turns: 3, label: 'Shield Up damage' });
      c.initiative(300);
    } }),
  sk('knight', { key: 'forHonor', tier: 2, branch: 'Honor', name: 'For Honor', passive: true, text: 'Passive: allies behind him get (20 + 2·END.S)% of his P.DEF.' }),
  sk('knight', { key: 'forValor', tier: 2, branch: 'Valor', name: 'For Valor', passive: true, text: 'Passive: +(10 + 3·END.S)% P.DEF.' }),
  sk('knight', { key: 'forTheKing', tier: 2, branch: 'Iron', name: 'For the King', passive: true, text: 'Passive: STR and END count +3 + 0.15·stat.' }),
  sk('knight', { key: 'foreverVigilant', tier: 3, branch: 'Honor', name: 'Forever Vigilant', mana: [4.5, 0.75], reach: 2, amnesia: 3, anim: 'CLASS/Knight/Mighty Strike',
    text: '1.6·ATTACK; (30 + 2·STR.S + 2·END.S)% Daze; allies behind +40% Daze resistance for 3 turns (+60% with For Honor).',
    run(c, t) {
      const r = c.strike(t, 1.6 * c.ATK);
      if (r.hit && c.chance(30 + 2 * c.S('STR') + 2 * c.S('END'))) c.fx(t, { key: 'daze', label: 'Daze' });
      for (const a of c.alliesBehind()) c.fx(a, { key: 'resDazeAlly', value: c.hasPassive('knight.forHonor') ? 60 : 40, turns: 3, label: 'Daze resistance' });
    } }),
  sk('knight', { key: 'holdTheLine', tier: 3, branch: 'Valor', name: 'Hold the Line', mana: [4.5, 0.75], reach: 2, amnesia: 3, anim: 'CLASS/Knight/Mighty Strike',
    text: '1.6·ATTACK; (30 + 4·STR.S)% Push 1; allies behind +40% Push/Pull resistance for 3 turns (+60% with For Valor); if he pushes, +50% Push resistance on himself for 3 turns.',
    run(c, t) {
      const r = c.strike(t, 1.6 * c.ATK);
      let pushed = false;
      if (r.hit && c.chance(30 + 4 * c.S('STR'))) pushed = c.push(t, 1);
      for (const a of c.alliesBehind()) c.fx(a, { key: 'resPush', value: c.hasPassive('knight.forValor') ? 60 : 40, turns: 3, label: 'Push resistance' });
      if (pushed) c.fx(c.src, { key: 'resPush', value: 50, turns: 3, label: 'Push resistance' });
    } }),
  sk('knight', { key: 'ironWill', tier: 3, branch: 'Iron', name: 'Iron Will', mana: [4.5, 0.75], reach: 1, amnesia: 3, anim: 'CLASS/Knight/Mighty Strike',
    text: '1.6·ATTACK; (30 + 4·END.S)% Silence for 2 turns; allies behind +40% Silence resistance for 3 turns (+60% with For the King).',
    run(c, t) {
      const r = c.strike(t, 1.6 * c.ATK);
      if (r.hit && c.chance(30 + 4 * c.S('END'))) c.fx(t, { key: 'silence', turns: 2, label: 'Silence', tag: 'SILENCE' });
      for (const a of c.alliesBehind()) c.fx(a, { key: 'resSilenceAlly', value: c.hasPassive('knight.forTheKing') ? 60 : 40, turns: 3, label: 'Silence resistance' });
    } }),
  sk('knight', { key: 'interception', tier: 4, branch: 'Honor', name: 'Interception', mana: [10.5, 0.75], reach: 1, amnesia: 4, anim: 'CLASS/Knight/Mighty Strike',
    text: '1.3·ATTACK; for 40 ticks he takes 50% of the physical damage aimed at the ally behind him. Combo after Forever Vigilant: +30% P.DEF for 30 ticks.',
    run(c, t) {
      c.strike(t, 1.3 * c.ATK);
      const a = c.behind(c.src);
      if (a) c.fx(a, { key: 'guarded', by: c.src.id, value: 50, ticks: 40, label: `Intercepted by ${c.src.name.split(' ')[0]}`, tag: 'GUARDED' });
      if (c.lastWas('knight.foreverVigilant')) c.fx(c.src, { key: 'pdef', value: 30, ticks: 30, label: 'Interception P.DEF' });
    } }),
  sk('knight', { key: 'shieldSmash', tier: 4, branch: 'Valor', name: 'Shield Smash', mana: [8, 1.0], reach: 1, amnesia: 2, anim: 'CLASS/Knight/Shield Smash',
    text: '1.0·ATTACK; (15 + 3·STR.S)% Stun 1 turn; (60 + 2·STR.S)% Push 1 (Push 2 after Hold the Line); if pushed, (20 + 6·END.S)% Root for 2 turns.',
    run(c, t) {
      const r = c.strike(t, 1.0 * c.ATK);
      if (!r.hit) return;
      if (c.chance(15 + 3 * c.S('STR'))) c.fx(t, stun);
      if (c.chance(60 + 2 * c.S('STR')) && c.push(t, c.lastWas('knight.holdTheLine') ? 2 : 1) && c.chance(20 + 6 * c.S('END'))) c.fx(t, { key: 'root', turns: 2, label: 'Root', tag: 'ROOT' });
    } }),
  sk('knight', { key: 'ironclad', tier: 4, branch: 'Iron', name: 'Ironclad Defense', passive: true, text: 'Passive: −(3 + 1.0·END.S)% damage from enemies in P2 and P3.' }),
  sk('knight', { key: 'royalGuard', tier: 5, branch: 'Honor', name: 'Royal Guard', mana: [17.75, 0.75], target: 'self', amnesia: 3, anim: 'CLASS/Knight/1H Cast',
    text: '+(30 + 3·END.S)% P.DEF for 40 ticks; for 40 ticks he takes the negative statuses aimed at the ally behind him. +400 Initiative.',
    run(c) {
      c.fx(c.src, { key: 'pdef', value: 30 + 3 * c.S('END'), ticks: 40, label: 'Royal Guard', tag: 'ROYAL GUARD' });
      const a = c.behind(c.src);
      if (a) c.fx(a, { key: 'royalGuarded', by: c.src.id, ticks: 40, label: `Guarded by ${c.src.name.split(' ')[0]}` });
      c.initiative(400);
    } }),
  sk('knight', { key: 'battleReady', tier: 5, branch: 'Valor', name: 'Battle Ready', passive: true, text: 'Passive: +5% Block, +5% Spell Block, +15% ATTACK.' }),
  sk('knight', { key: 'ironShield', tier: 5, branch: 'Iron', name: 'Iron Shield', mana: [8, 1.0], target: 'self', amnesia: 3, anim: 'CLASS/Knight/1H Cast',
    text: '+(30 + 4·END.S)% P.DEF and +(1.0·END.S)% Block for 40 ticks; with an Iron passive, 75% Push/Pull resistance for 40 ticks. +400 Initiative.',
    run(c) {
      c.fx(c.src, { key: 'pdef', value: 30 + 4 * c.S('END'), ticks: 40, label: 'Iron Shield', tag: 'IRON SHIELD' });
      c.fx(c.src, { key: 'block', value: c.S('END'), ticks: 40, label: 'Iron Shield Block' });
      if (c.hasPassive('knight.forTheKing') || c.hasPassive('knight.ironclad')) c.fx(c.src, { key: 'resPush', value: 75, ticks: 40, label: 'Push resistance' });
      c.initiative(400);
    } }),
];

/* ---------------- Archer ---------------- */
const pierceOf = (c, base) => base + (c.hasPassive('archer.marksmanship') ? 15 + 1.5 * c.S('STR') : 0);
const ARCHER = [
  sk('archer', { key: 'multiShot', tier: 1, branch: 'Flurry', name: 'Multi-Shot', mana: [1.25, 0.75], anim: 'WEAPONS/Bow/Bow Multishot',
    text: '3 arrows of 0.7·ATTACK, +20% critical chance each.',
    run(c, t) { for (let i = 0; i < 3; i++) c.strike(t, 0.7 * c.ATK, { critBonus: 20 }); } }),
  sk('archer', { key: 'precisionStrike', tier: 1, branch: 'Precision', name: 'Precision Strike', mana: [2.25, 0.75], channel: 700, anim: 'WEAPONS/Bow/Bow Release',
    text: 'Channel 700. 2.0·ATTACK + 2.0·DEX; (5 + 3.5·DEX.S)% Stun 1 turn; +10% accuracy for 2 turns.',
    run(c, t) {
      const r = c.strike(t, 2.0 * c.ATK + 2.0 * c.stat('DEX'));
      if (r.hit && c.chance(5 + 3.5 * c.S('DEX'))) c.fx(t, stun);
      c.fx(c.src, { key: 'acc', value: 10, turns: 2, label: 'Accuracy +10%' });
    } }),
  sk('archer', { key: 'piercingShot', tier: 1, branch: 'Marksmanship', name: 'Piercing Shot', mana: [3.25, 0.75], amnesia: 1, anim: 'WEAPONS/Bow/Bow Hit Angled',
    text: '1.4·ATTACK + 1.0·DEX, 65% Pierce.',
    run(c, t) { c.strike(t, 1.4 * c.ATK + 1.0 * c.stat('DEX'), { pierce: pierceOf(c, 65) }); } }),
  sk('archer', { key: 'flurry', tier: 2, branch: 'Flurry', name: 'Flurry', passive: true, text: 'Passive: +(1.0·DEX.S)% critical chance; +10% damage taken.' }),
  sk('archer', { key: 'shroud', tier: 2, branch: 'Precision', name: 'Shroud', passive: true, text: 'Passive: +20% Evasion while channelling.' }),
  sk('archer', { key: 'marksmanship', tier: 2, branch: 'Marksmanship', name: 'Marksmanship', passive: true, text: 'Passive: +(15 + 1.5·STR.S)% Pierce.' }),
  sk('archer', { key: 'rapidShot', tier: 3, branch: 'Flurry', name: 'Rapid Shot', mana: [5.0, 1.0], target: 'none', amnesia: 2, anim: 'WEAPONS/Bow/Bow Multishot',
    text: '3 arrows of 1.5·ATTACK on random enemies, −20% for each extra arrow on the same one; each critical (28 + 2·LCK.S)% Daze. Combo after Multi-Shot: +30% critical chance.',
    run(c) {
      const critBonus = c.lastWas('archer.multiShot') ? 30 : 0;
      const seen = new Map();
      for (let i = 0; i < 3; i++) {
        const foes = c.enemies(); if (!foes.length) break;
        const t = c.rng.pick(foes);
        const n = seen.get(t.id) || 0; seen.set(t.id, n + 1);
        const r = c.strike(t, 1.5 * c.ATK * Math.max(0, 1 - 0.2 * n), { critBonus });
        if (r.crit && c.chance(28 + 2 * c.S('LCK'))) c.fx(t, { key: 'daze', label: 'Daze' });
      }
    } }),
  sk('archer', { key: 'sharpshooter', tier: 3, branch: 'Precision', name: 'Sharpshooter', mana: [10.0, 1.0], channel: 1100, amnesia: 3, anim: 'WEAPONS/Bow/Bow Release',
    text: 'Channel 1100. 2.8·ATTACK + 1.5·DEX. Combo with Shroud: basic attacks made in the Archer\'s turn +2.0·ATTACK for 1 turn.',
    run(c, t) {
      c.strike(t, 2.8 * c.ATK + 1.5 * c.stat('DEX'));
      if (c.hasPassive('archer.shroud')) c.fx(c.src, { key: 'sharpBasic', value: 2.0 * c.ATK, turns: 1, label: 'Sharpshooter: basic attacks +2.0·ATTACK', tag: 'SHARPSHOOTER' });
    } }),
  sk('archer', { key: 'piercingArrow', tier: 3, branch: 'Marksmanship', name: 'Piercing Arrow', mana: [6.0, 1.0], target: 'none', amnesia: 1, anim: 'WEAPONS/Bow/Bow Hit Angled',
    text: '1.7 / 1.0 / 0.7·ATTACK to P1 / P2 / P3; 40% Pierce; (30 + 2·STR.S + 3·LCK.S)% Bleed on each hit; stops if blocked.',
    run(c) {
      const mult = { 1: 1.7, 2: 1.0, 3: 0.7 };
      for (const t of c.enemies().sort((a, b) => a.pos - b.pos)) {
        const r = c.strike(t, mult[t.pos] * c.ATK, { pierce: pierceOf(c, 40) });
        if (r.hit && c.chance(30 + 2 * c.S('STR') + 3 * c.S('LCK'))) c.fx(t, bleed);
        if (r.blocked) break;
      }
    } }),
  sk('archer', { key: 'repeatingShot', tier: 4, branch: 'Flurry', name: 'Repeating Shot', mana: [10.0, 1.0], anim: 'WEAPONS/Bow/Bow Multishot',
    text: '2 arrows of 1.3·ATTACK; combo after Rapid Shot: 3 arrows, +0.8·DEX each (the client\'s text). The Archer is Exhausted for 1 turn.',
    run(c, t) {
      const combo = c.lastWas('archer.rapidShot');
      for (let i = 0; i < (combo ? 3 : 2); i++) c.strike(t, 1.3 * c.ATK + (combo ? 0.8 * c.stat('DEX') : 0));
      c.fx(c.src, { key: 'exhaust', turns: 1, noSkills: true, label: 'Exhausted', tag: 'EXHAUST' });
    } }),
  sk('archer', { key: 'deadAim', tier: 4, branch: 'Precision', name: 'Dead Aim', mana: [2.0, 1.0], channel: 1000, anim: 'WEAPONS/Bow/Bow Release',
    text: 'Channel 1000. 2.5·ATTACK + 2.0·DEX. Combo with Shroud: +400 Initiative when it resolves.',
    run(c, t) { c.strike(t, 2.5 * c.ATK + 2.0 * c.stat('DEX')); if (c.hasPassive('archer.shroud')) c.initiative(400); } }),
  sk('archer', { key: 'oneSmallStone', tier: 4, branch: 'Marksmanship', name: 'One Small Stone', mana: [2.0, 1.0], amnesia: 2, anim: 'WEAPONS/Bow/Bow Hit',
    text: '0.7·ATTACK + 2.0·LCK; 40% Pierce, +15% critical chance, +1.2x critical damage; (20 + 4·LCK.S)% Bleed on criticals. Combo after Piercing Shot on the same target: also hits the one behind.',
    run(c, t) {
      const list = [t];
      if (c.lastWas('archer.piercingShot') && c.src.lastTarget === t.id && c.behind(t)) list.push(c.behind(t));
      for (const x of list) {
        const r = c.strike(x, 0.7 * c.ATK + 2.0 * c.stat('LCK'), { pierce: pierceOf(c, 40), critBonus: 15, critMultBonus: 1.2 });
        if (r.crit && c.chance(20 + 4 * c.S('LCK'))) c.fx(x, bleed);
      }
    } }),
  sk('archer', { key: 'barrage', tier: 5, branch: 'Flurry', name: 'Barrage', mana: [15.25, 1.25], target: 'none', channel: 500, amnesia: 2, anim: 'WEAPONS/Bow/Bow Multishot',
    text: 'Channel 500. 6 arrows of 0.7·ATTACK on random positions; from the second on the same position, +2.0·LCK.',
    run(c) {
      const seen = new Map();
      for (let i = 0; i < 6; i++) {
        const foes = c.enemies(); if (!foes.length) break;
        const t = c.rng.pick(foes);
        const n = seen.get(t.pos) || 0; seen.set(t.pos, n + 1);
        c.strike(t, 0.7 * c.ATK + (n ? 2.0 * c.stat('LCK') : 0));
      }
    } }),
  sk('archer', { key: 'twinArrows', tier: 5, branch: 'Precision', name: 'Twin Arrows', mana: [13.25, 1.25], channel: 1100, anim: 'WEAPONS/Bow/Bow Release',
    text: 'Channel 1100. 2.0·ATTACK + 1.5·DEX to the target and to the one behind it (the second arrow fails if nobody is behind); after Dead Aim in the last 2 turns, 3.0·ATTACK + 2.0·DEX.',
    run(c, t) {
      const big = c.usedRecently('archer.deadAim', 2);
      const raw = big ? 3.0 * c.ATK + 2.0 * c.stat('DEX') : 2.0 * c.ATK + 1.5 * c.stat('DEX');
      c.strike(t, raw);
      const b = c.behind(t);
      if (b) c.strike(b, raw); else c.log('The second arrow finds nobody behind.');
    } }),
  sk('archer', { key: 'huntersMark', tier: 5, branch: 'Marksmanship', name: "Hunter's Mark", mana: [10.0, 1.0], target: 'none', anim: 'WEAPONS/Bow/Bow Hit',
    text: 'Every enemy, 95% for 3 turns: 0.5·ATTACK + 0.5·LCK physical damage at the start of its turn, −5% Evasion, −15% P.DEF (stacks 2).',
    run(c) {
      for (const t of c.enemies()) {
        if (!c.chance(95)) continue;
        c.fx(t, { key: 'hunterMark', value: 0.5 * c.ATK + 0.5 * c.stat('LCK'), turns: 3, stackMax: 2, label: "Hunter's Mark", tag: 'MARK' });
        c.fx(t, { key: 'eva', value: -5, neg: true, turns: 3, label: 'Mark −5% EVA' });
        c.fx(t, { key: 'pdef', value: -15, neg: true, turns: 3, label: 'Mark −15% P.DEF' });
      }
    } }),
];

/* ---------------- Priest ---------------- */
const pr = (o) => sk('priest', { magic: true, target: 'ally', anim: 'WEAPONS/2H Staff/2H Staff Charge', ...o });
const PRIEST = [
  pr({ key: 'prayerOfHealing', tier: 1, branch: 'Prayer', name: 'Prayer of Healing', mana: [5.6, 1.4],
    text: 'Heals 2.0·SPELL + 1.0·WIS + 0.5·INT.',
    run(c, t) { c.heal(t, 2.0 * c.SPELL + 1.0 * c.stat('WIS') + 0.5 * c.stat('INT'), 'Prayer of Healing'); } }),
  pr({ key: 'holyLight', tier: 1, branch: 'Holy', name: 'Holy Light', mana: [4.0, 1.0], target: 'enemy', anim: 'WEAPONS/2H Staff/2H Staff Hit',
    text: '0.5·SPELL + 0.5·INT magic damage; (70 + 2·INT.S)% for 3 turns: 0.3·SPELL at the start of its turn and +5% damage taken from attacks (stacks 2).',
    run(c, t) {
      const r = c.strike(t, 0.5 * c.SPELL + 0.5 * c.stat('INT'), { type: 'magic' });
      if (r.hit && c.chance(70 + 2 * c.S('INT'))) c.fx(t, { key: 'holyLight', value: 0.3 * c.SPELL, turns: 3, stackMax: 2, label: 'Holy Light', tag: 'HOLY LIGHT' });
    } }),
  pr({ key: 'cleansingGift', tier: 1, branch: 'Blessing', name: 'Cleansing Gift', mana: [5, 1.0],
    text: 'Heals 1.0·SPELL + 1.0·WIS + 0.5·VIT and Cleanses.',
    run(c, t) { c.heal(t, 1.0 * c.SPELL + 1.0 * c.stat('WIS') + 0.5 * c.stat('VIT'), 'Cleansing Gift'); c.cleanse(t, 1); } }),
  pr({ key: 'divinePrayer', tier: 2, branch: 'Prayer', name: 'Divine Prayer', passive: true, text: 'Passive: +5% SPELL.' }),
  pr({ key: 'holyGuardian', tier: 2, branch: 'Holy', name: 'Holy Guardian', passive: true, text: 'Passive: +10% healing power.' }),
  pr({ key: 'blessingsOfLight', tier: 2, branch: 'Blessing', name: 'Blessings of Light', passive: true, text: 'Passive: (1.0·WIS.S)% Cleanse on each target healed; critical heals (3.0·WIS.S)% Unstoppable for 2 turns.' }),
  pr({ key: 'prayerOfMight', tier: 3, branch: 'Prayer', name: 'Prayer of Might', mana: [6.0, 1.5],
    text: 'Heals 1.0·SPELL + 1.0·WIS + 0.5·INT; +(15 + 3·INT.S)% ATTACK for 1 turn.',
    run(c, t) { c.heal(t, 1.0 * c.SPELL + 1.0 * c.stat('WIS') + 0.5 * c.stat('INT'), 'Prayer of Might'); c.fx(t, { key: 'attack', value: 15 + 3 * c.S('INT'), turns: 1, label: 'Might', tag: 'MIGHT' }); } }),
  pr({ key: 'holyCircle', tier: 3, branch: 'Holy', name: 'Holy Circle', mana: [13.5, 2.0], target: 'allies', amnesia: 3,
    text: 'Heals the whole party 1.6·SPELL + 1.0·WIS. −500 Initiative.',
    run(c) { for (const a of c.allies()) c.heal(a, 1.6 * c.SPELL + 1.0 * c.stat('WIS'), 'Holy Circle'); c.initiative(-500); } }),
  pr({ key: 'freedom', tier: 3, branch: 'Blessing', name: 'Freedom', mana: [12.5, 1.25], amnesia: 2,
    text: 'Heals 1.0·SPELL + 1.5·WIS + 0.5·VIT; Purify; (6·WIS.S)% Unstoppable for 2 turns.',
    run(c, t) { c.heal(t, 1.0 * c.SPELL + 1.5 * c.stat('WIS') + 0.5 * c.stat('VIT'), 'Freedom'); c.purify(t); if (c.chance(6 * c.S('WIS'))) c.fx(t, { key: 'unstoppable', turns: 2, label: 'Unstoppable' }); } }),
  pr({ key: 'prayerOfProtection', tier: 4, branch: 'Prayer', name: 'Prayer of Protection', mana: [12, 1.5], amnesia: 2,
    text: 'Pure barrier of 1.5·SPELL + 2.0·WIS.',
    run(c, t) { c.barrier(t, 1.5 * c.SPELL + 2.0 * c.stat('WIS'), 'Prayer of Protection'); } }),
  pr({ key: 'holyBeacon', tier: 4, branch: 'Holy', name: 'Holy Beacon', mana: [13.5, 1.75], amnesia: 1,
    text: 'Heals 1.0·SPELL + 2.0·WIS; for 4 turns heals 0.25·SPELL + 1.0·WIS at the start of the turn (stacks 2).',
    run(c, t) { c.heal(t, 1.0 * c.SPELL + 2.0 * c.stat('WIS'), 'Holy Beacon'); c.fx(t, { key: 'beacon', value: 0.25 * c.SPELL + 1.0 * c.stat('WIS'), turns: 4, stackMax: 2, label: 'Beacon', tag: 'BEACON' }); } }),
  pr({ key: 'swiftness', tier: 4, branch: 'Blessing', name: 'Swiftness', mana: [13.5, 1.75],
    text: 'Heals 1.0·SPELL + 1.0·WIS + 0.5·VIT; +(1.0·VIT) AGI for 4 turns (stacks 2).',
    run(c, t) { c.heal(t, 1.0 * c.SPELL + 1.0 * c.stat('WIS') + 0.5 * c.stat('VIT'), 'Swiftness'); c.fx(t, { key: 'agi', stat: 'AGI', value: c.stat('VIT'), turns: 4, label: 'Swiftness', tag: 'SWIFT' }); } }),
  pr({ key: 'divineBarrier', tier: 5, branch: 'Prayer', name: 'Divine Barrier', mana: [20.5, 2.5], target: 'allies', amnesia: 4,
    text: 'Pure barrier on the whole party, 1.2·SPELL + 1.5·WIS each.',
    run(c) { for (const a of c.allies()) c.barrier(a, 1.2 * c.SPELL + 1.5 * c.stat('WIS'), 'Divine Barrier'); } }),
  pr({ key: 'holyWrath', tier: 5, branch: 'Holy', name: 'Holy Wrath', mana: [9.0, 2.0], target: 'enemy', amnesia: 1, anim: 'WEAPONS/2H Staff/2H Staff Hit',
    text: '1.0·SPELL + 2.0·INT + 1.0·WIS magic damage. Combo on a target with Holy Light: (20 + 4.5·WIS.S)% Stun 1 turn and +0.7·SPELL.',
    run(c, t) {
      const combo = t.fx.some((e) => e.key === 'holyLight');
      const r = c.strike(t, 1.0 * c.SPELL + 2.0 * c.stat('INT') + 1.0 * c.stat('WIS') + (combo ? 0.7 * c.SPELL : 0), { type: 'magic' });
      if (r.hit && combo && c.chance(20 + 4.5 * c.S('WIS'))) c.fx(t, stun);
    } }),
  pr({ key: 'fullHeal', tier: 5, branch: 'Blessing', name: 'Full Heal', mana: [24.5, 2.5], amnesia: 3,
    text: 'Heals 100% of the missing HP; Purify; +300 Initiative; the Priest is Exhausted for 1 turn.',
    run(c, t) { c.heal(t, t.hpMax - t.hp, 'Full Heal'); c.purify(t); c.initiative(300); c.fx(c.src, { key: 'exhaust', turns: 1, noSkills: true, label: 'Exhausted', tag: 'EXHAUST' }); } }),
];

export const CLASS_SKILLS = { knight: KNIGHT, archer: ARCHER, priest: PRIEST, ...MORE };
export const SKILLS = Object.fromEntries(Object.values(CLASS_SKILLS).flat().map((s) => [s.id, s]));
export const READY_CLASSES = Object.keys(CLASS_SKILLS);
