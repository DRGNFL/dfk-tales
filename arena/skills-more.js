/* DFK Tales Arena — Warrior, Seer, Berserker, Wizard and Pirate Codex (tiers 1-5), state after patch 2.8.2.
   Numbers from the project doc "dfk-abilita-classi" (patch notes and class pages); where it leaves a gap, the game
   client's own skill texts (game.defikingdoms.com, read November 2026). Same shape as skills.js. */

const sk = (cls, o) => ({ cls, id: `${cls}.${o.key}`, target: 'enemy', reach: 3, amnesia: 0, channel: 0, magic: false, ...o });
const bleed = { key: 'bleed', label: 'Bleed', tag: 'BLEED', turns: 3, stackMax: 5 };
const stun = { key: 'stun', label: 'Stun', tag: 'STUN' };
const daze = { key: 'daze', label: 'Daze' };
const slow = (v, ticks) => ({ key: 'slow', value: v, ticks, label: `Slow ${v}%`, tag: 'SLOW' });

/* ---------------- Warrior ---------------- */
const wa = (o) => sk('warrior', { reach: 1, anim: 'WEAPONS/1H Sword/1H Sword Hit', ...o });
const WARRIOR = [
  wa({ key: 'gladiatorStrike', tier: 1, branch: 'Gladiator', name: 'Gladiator Strike', anim: 'CLASS/Knight/Mighty Strike', mana: [1.4, 0.6],
    text: '1.1·ATTACK + 0.6·STR + 0.6·END. Combo after a basic attack: (50 + 3.5·DEX.S)% Bleed.',
    run(c, t) {
      const r = c.strike(t, 1.1 * c.ATK + 0.6 * c.stat('STR') + 0.6 * c.stat('END'));
      if (r.hit && c.lastWas('basic') && c.chance(50 + 3.5 * c.S('DEX'))) c.fx(r.target, bleed);
    } }),
  wa({ key: 'ruff', tier: 1, branch: 'Juggernaut', name: 'Ruff', mana: [2.25, 0.75], target: 'self', amnesia: 2, anim: 'WEAPONS/1H Sword/1H Sword Charge',
    text: '+30% Riposte for 3 turns. Combo with Tuff: +30% P.DEF for 1 turn.',
    run(c) {
      c.fx(c.src, { key: 'riposte', value: 30, turns: 3, label: 'Riposte 30%', tag: 'RIPOSTE' });
      if (c.hasPassive('warrior.tuff')) c.fx(c.src, { key: 'pdef', value: 30, turns: 1, label: 'Ruff P.DEF', tag: 'P.DEF +30%' });
    } }),
  wa({ key: 'warCry', tier: 1, branch: 'Bloodthirst', name: 'War Cry', mana: [2.4, 0.6], target: 'none', reach: 3, anim: 'WEAPONS/1H Sword/1H Sword Charge',
    text: 'Party: +(1·STR.S + 1·END.S)% damage and +(0.3·STR.S + 0.3·END.S)% accuracy for 2 turns. Each enemy: (50 + 3·STR.S)% Intimidate 15% for 1 turn (stacks 2). Combo after Punish: (30 + 6·STR.S)% Silence for 1 turn.',
    run(c) {
      for (const a of c.allies()) {
        c.fx(a, { key: 'dmgOut', value: c.S('STR') + c.S('END'), turns: 2, label: 'War Cry damage', tag: 'WAR CRY' });
        c.fx(a, { key: 'acc', value: 0.3 * c.S('STR') + 0.3 * c.S('END'), turns: 2, label: 'War Cry accuracy' });
      }
      const punish = c.lastWas('warrior.punish');
      for (const t of c.enemies()) {
        const r = c.strike(t, 0, { noDamage: true, label: 'War Cry' });
        if (!r.hit) continue;
        if (c.chance(50 + 3 * c.S('STR'))) c.fx(r.target, { key: 'intimidate', value: 15, turns: 1, stackMax: 2, label: 'Intimidate 15%', tag: 'INTIMIDATE' });
        if (punish && c.chance(30 + 6 * c.S('STR'))) c.fx(r.target, { key: 'silence', turns: 1, label: 'Silence', tag: 'SILENCE' });
      }
    } }),
  wa({ key: 'gladiator', tier: 2, branch: 'Gladiator', name: 'Gladiator', passive: true, text: 'Passive: basic attacks deal +10%.' }),
  wa({ key: 'buff', tier: 2, branch: 'Juggernaut', name: 'Buff', passive: true, text: 'Passive: +40% P.DEF, −10% damage dealt.' }),
  wa({ key: 'bloodthirst', tier: 2, branch: 'Bloodthirst', name: 'Bloodthirst', passive: true, text: 'Passive: +10% Lifesteal, +15% more on Bleeding targets.' }),
  wa({ key: 'whirlwind', tier: 3, branch: 'Gladiator', name: 'Whirlwind', mana: [3.8, 0.7], target: 'none', amnesia: 1, anim: 'CLASS/Warrior/Whirlwind',
    text: '1.4·ATTACK to each enemy, ignoring barriers and Wards; (50 + 3·END.S)% Slow 15% for 25 ticks. 90% Slow 25% on himself for 25 ticks. −600 Initiative.',
    run(c) {
      for (const t of c.enemies()) {
        const r = c.strike(t, 1.4 * c.ATK, { ignoreBarrier: true, ignoreWard: true, label: 'Whirlwind' });
        if (r.hit && c.chance(50 + 3 * c.S('END'))) c.fx(r.target, slow(15, 25));
      }
      if (c.chance(90)) c.fx(c.src, { ...slow(25, 25), self: true });
      c.initiative(-600);
    } }),
  wa({ key: 'gruff', tier: 3, branch: 'Juggernaut', name: 'Gruff', mana: [3.8, 0.7], reach: 3, amnesia: 4,
    text: '0.5·ATTACK + 1.3·STR; (50 + 2·STR.S)% Taunt for 2 turns; (5·END.S)% Unstoppable on himself for 2 turns.',
    run(c, t) {
      const r = c.strike(t, 0.5 * c.ATK + 1.3 * c.stat('STR'));
      if (r.hit && c.chance(50 + 2 * c.S('STR'))) c.fx(r.target, { key: 'taunt', by: c.src.id, turns: 2, label: 'Taunt', tag: 'TAUNT', ignoreBarrier: true });
      if (c.chance(5 * c.S('END'))) c.fx(c.src, { key: 'unstoppable', turns: 2, label: 'Unstoppable', tag: 'UNSTOPPABLE' });
    } }),
  wa({ key: 'brutalRend', tier: 3, branch: 'Bloodthirst', name: 'Brutal Rend', anim: 'CLASS/Warrior/Blade Flurry Alt', mana: [3.8, 0.7], amnesia: 2,
    text: '1.2·ATTACK + 1.0·DEX; (60 + 2·DEX.S)% chance of 15% Lifesteal. Combo on a Bleeding target: +(0.5·ATTACK + 0.3·STR) and (50 + 3·DEX.S)% Bleed.',
    run(c, t) {
      const combo = c.has(t, 'bleed');
      const r = c.strike(t, 1.2 * c.ATK + 1.0 * c.stat('DEX') + (combo ? 0.5 * c.ATK + 0.3 * c.stat('STR') : 0), { lifesteal: c.chance(60 + 2 * c.S('DEX')) ? 15 : 0 });
      if (r.hit && combo && c.chance(50 + 3 * c.S('DEX'))) c.fx(r.target, bleed);
    } }),
  wa({ key: 'rapidOnslaught', tier: 4, branch: 'Gladiator', name: 'Rapid Onslaught', anim: 'CLASS/Warrior/Blade Flurry', mana: [8, 0.7], amnesia: 2,
    text: '3 basic attacks, each −25%; combo after Gladiator Strike: 4.',
    run(c, t) { const n = c.lastWas('warrior.gladiatorStrike') ? 4 : 3; for (let i = 0; i < n && t.alive; i++) c.basic(t, { mult: 0.75, label: 'Onslaught' }); } }),
  wa({ key: 'tuff', tier: 4, branch: 'Juggernaut', name: 'Tuff', passive: true, text: 'Passive: +10% Block, −5% damage dealt.' }),
  wa({ key: 'punish', tier: 4, branch: 'Bloodthirst', name: 'Punish', anim: 'CLASS/Knight/Mighty Strike', mana: [8, 0.7], amnesia: 2,
    text: '1.0·ATTACK + 0.7·STR; (20 + 2.5·STR.S + 2.5·DEX.S)% Bleed. Combo on a target Bleeding, Dazed, Stunned or Intimidated: +(0.9·ATTACK + 1.2·DEX).',
    run(c, t) {
      const combo = ['bleed', 'dazedMark', 'stun', 'intimidate'].some((k) => c.has(t, k));
      const r = c.strike(t, 1.0 * c.ATK + 0.7 * c.stat('STR') + (combo ? 0.9 * c.ATK + 1.2 * c.stat('DEX') : 0));
      if (r.hit && c.chance(20 + 2.5 * c.S('STR') + 2.5 * c.S('DEX'))) c.fx(r.target, bleed);
    } }),
  wa({ key: 'furiousCleave', tier: 5, branch: 'Gladiator', name: 'Furious Cleave', passive: true, text: 'Passive: basic attacks Cleave (they also hit the enemy behind), −25% damage, −10% accuracy.' }),
  wa({ key: 'nuff', tier: 5, branch: 'Juggernaut', name: 'Nuff', mana: [10.5, 0.7], target: 'self', amnesia: 2, anim: 'WEAPONS/1H Sword/1H Sword Charge',
    text: 'For 25 ticks he takes 100% of the physical damage aimed at the ally behind him. Combo with Buff: +30% P.DEF.',
    run(c) {
      const a = c.behind(c.src);
      if (a) c.fx(a, { key: 'guarded', by: c.src.id, value: 100, ticks: 25, label: `Covered by ${c.src.name.split(' ')[0]}`, tag: 'GUARDED' });
      else c.log('Nobody behind to cover.');
      if (c.hasPassive('warrior.buff')) c.fx(c.src, { key: 'pdef', value: 30, ticks: 25, label: 'Nuff P.DEF', tag: 'P.DEF +30%' });
    } }),
  wa({ key: 'finalBlow', tier: 5, branch: 'Bloodthirst', name: 'Final Blow', anim: 'CLASS/Knight/Mighty Strike', mana: [12, 0.8], amnesia: 4, channel: 500, acc: -30,
    text: 'Channel 500, −30% accuracy. 2.0·ATTACK + 3.0·STR; if the target is left under 10% of max HP, it is executed.',
    run(c, t) { c.strike(t, 2.0 * c.ATK + 3.0 * c.stat('STR'), { accBonus: -30, execute: 0.10 }); } }),
];

/* ---------------- Seer ---------------- */
const se = (o) => sk('seer', { magic: true, target: 'ally', anim: 'WEAPONS/1H Wand/1H Wand Hit2', ...o });
const stone = { tauntBreak: true };
const SEER = [
  se({ key: 'futureSight', tier: 1, branch: 'Oracle', name: 'Future Sight', mana: [4.5, 1.5],
    text: '+(1 + 1·WIS.S)% Evasion for 20 ticks; Delay 10: heals 1.3·SPELL + 1.0·WIS.',
    run(c, t) {
      c.fx(t, { key: 'eva', value: 1 + c.S('WIS'), ticks: 20, label: 'Future Sight', tag: 'FUTURE SIGHT' });
      c.delay(10, 'Future Sight', (d, x) => d.heal(x, 1.3 * d.SPELL + 1.0 * d.stat('WIS'), 'Future Sight'), t);
    } }),
  se({ key: 'timeSwell', tier: 1, branch: 'Astrologer', name: 'Time Swell', mana: [4.5, 1.5],
    text: '+(5 + 0.3·WIS + 0.2·INT) AGI for 40 ticks; +50% Slow resistance for 40 ticks.',
    run(c, t) {
      c.fx(t, { key: 'agi', stat: 'AGI', value: Math.ceil(5 + 0.3 * c.stat('WIS') + 0.2 * c.stat('INT')), ticks: 40, label: 'Time Swell', tag: 'TIME SWELL' });
      c.fx(t, { key: 'resSlow', value: 50, ticks: 40, label: 'Slow resistance' });
    } }),
  se({ key: 'warStone', tier: 1, branch: 'Artificer', name: 'War Stone', mana: [2.75, 1.25], target: 'enemy', channel: 800, anim: 'WEAPONS/1H Wand/1H Wand Special1',
    text: 'Channel 800. 1.5·SPELL + 1.0·WIS + 1.0·INT pure damage. Combo after Chrono Purge in the last two turns: (35 + 6.5·INT.S)% Dispel.',
    run(c, t) {
      const r = c.strike(t, 1.5 * c.SPELL + 1.0 * c.stat('WIS') + 1.0 * c.stat('INT'), { type: 'pure', label: 'War Stone' });
      if (r.hit && c.usedRecently('seer.chronoPurge', 2) && c.chance(35 + 6.5 * c.S('INT'))) c.dispel(r.target);
    } }),
  se({ key: 'theOracle', tier: 2, branch: 'Oracle', name: 'The Oracle', passive: true, text: 'Passive: deals no damage of any kind; +15% Haste; skills cost 10% less MP.' }),
  se({ key: 'theAstrologer', tier: 2, branch: 'Astrologer', name: 'The Astrologer', passive: true, text: 'Passive: every ally +5% Haste.' }),
  se({ key: 'theArtificer', tier: 2, branch: 'Artificer', name: 'The Artificer', passive: true, text: 'Passive: at the start of his 1st and every 7th turn, a barrier on the whole party of (1.5·WIS.S)% of his max HP.' }),
  se({ key: 'sanctuary', tier: 3, branch: 'Oracle', name: 'Sanctuary', mana: [14, 2.0], target: 'none', amnesia: 2, channel: 500, ...stone,
    text: 'Channel 500 (+50% Taunt resistance; a Taunt breaks it). Barrier on everyone, 0.4·SPELL + 1.0·WIS; Delay 10: heals everyone 1.0·SPELL + 1.0·WIS.',
    run(c) {
      for (const a of c.allies()) c.barrier(a, 0.4 * c.SPELL + 1.0 * c.stat('WIS'), 'Sanctuary');
      c.delay(10, 'Sanctuary', (d) => { for (const a of d.allies()) d.heal(a, 1.0 * d.SPELL + 1.0 * d.stat('WIS'), 'Sanctuary'); });
    } }),
  se({ key: 'timeSink', tier: 3, branch: 'Astrologer', name: 'Time Sink', mana: [3.0, 2.0], target: 'enemy', amnesia: 1, anim: 'WEAPONS/1H Wand/1H Wand Special2',
    text: '(60 + 2·INT.S)% Slow 20% for 25 ticks; Delay 30: 1.0·SPELL + 2.0·the target\'s AGI pure damage (1.2·SPELL + 2.5·AGI after Time Swell).',
    run(c, t) {
      const r = c.strike(t, 0, { noDamage: true, type: 'magic', label: 'Time Sink' });
      if (!r.hit) return;
      const x = r.target;
      if (c.chance(60 + 2 * c.S('INT'))) c.fx(x, slow(20, 25));
      const big = c.lastWas('seer.timeSwell');
      c.delay(30, 'Time Sink', (d, y) => d.strike(y, (big ? 1.2 : 1.0) * d.SPELL + (big ? 2.5 : 2.0) * y.base.AGI, { type: 'pure', noMiss: true, label: 'Time Sink' }), x);
    } }),
  se({ key: 'purificationStone', tier: 3, branch: 'Artificer', name: 'Purification Stone', mana: [1.0, 1.5], channel: 800, ...stone, anim: 'WEAPONS/1H Wand/1H Wand Hit',
    text: 'Channel 800 (+50% Taunt resistance; a Taunt breaks it). Purify; heals 1.5·SPELL + 2.0·WIS + 1.0·INT; (7·WIS.S)% Unstoppable for 1 turn.',
    run(c, t) {
      c.purify(t);
      c.heal(t, 1.5 * c.SPELL + 2.0 * c.stat('WIS') + 1.0 * c.stat('INT'), 'Purification Stone');
      if (c.chance(7 * c.S('WIS'))) c.fx(t, { key: 'unstoppable', turns: 1, label: 'Unstoppable', tag: 'UNSTOPPABLE' });
    } }),
  se({ key: 'osmoticWard', tier: 4, branch: 'Oracle', name: 'Osmotic Ward', mana: [5.0, 1.5], amnesia: 4,
    text: 'A pure Ward for 2 turns (the next hit does nothing and brings no statuses); when it pops, heals 1.0·SPELL + 4.0·WIS + 1.0·LCK and the bearer is Slowed 20% for 25 ticks.',
    run(c, t) {
      c.ward(t, { kind: 'pure', turns: 2, onBreak: (d, x) => { d.heal(x, 1.0 * d.SPELL + 4.0 * d.stat('WIS') + 1.0 * d.stat('LCK'), 'Osmotic Ward'); d.fx(x, { ...slow(20, 25), self: true }); } });
    } }),
  se({ key: 'chronoPurge', tier: 4, branch: 'Astrologer', name: 'Chrono Purge', mana: [5.0, 2.0], target: 'enemy', amnesia: 3, anim: 'WEAPONS/1H Wand/1H Wand Special1',
    text: '(70 + 2·INT.S)% Dispel; (40 + 3·WIS.S)% Negate (one of its delayed actions goes); Delay 30: 1.5·SPELL + 2.0·INT magic damage.',
    run(c, t) {
      const r = c.strike(t, 0, { noDamage: true, type: 'magic', label: 'Chrono Purge' });
      if (!r.hit) return;
      if (c.chance(70 + 2 * c.S('INT'))) c.dispel(r.target);
      if (c.chance(40 + 3 * c.S('WIS'))) c.negate(r.target);
      c.delay(30, 'Chrono Purge', (d, y) => d.strike(y, 1.5 * d.SPELL + 2.0 * d.stat('INT'), { type: 'magic', noMiss: true, label: 'Chrono Purge' }), r.target);
    } }),
  se({ key: 'rejuvenationStone', tier: 4, branch: 'Artificer', name: 'Rejuvenation Stone', mana: [4, 1.5], amnesia: 1, channel: 800, ...stone, anim: 'WEAPONS/1H Wand/1H Wand Hit',
    text: 'Channel 800 (+50% Taunt resistance; a Taunt breaks it). Heals 1.5·SPELL + 3.0·WIS + 1.0·INT; Delay 15 and 30: heals 0.5·SPELL + 1.5·WIS.',
    run(c, t) {
      c.heal(t, 1.5 * c.SPELL + 3.0 * c.stat('WIS') + 1.0 * c.stat('INT'), 'Rejuvenation Stone');
      for (const n of [15, 30]) c.delay(n, 'Rejuvenation Stone', (d, x) => d.heal(x, 0.5 * d.SPELL + 1.5 * d.stat('WIS'), 'Rejuvenation Stone'), t);
    } }),
  se({ key: 'divination', tier: 5, branch: 'Oracle', name: 'Divination', mana: [5.0, 2.0], amnesia: 4,
    text: 'The ally\'s next skill costs 80% less MP; +(1·WIS.S)% accuracy for 2 turns. +500 Initiative.',
    run(c, t) { c.mpCut(t, 80, 1); c.fx(t, { key: 'acc', value: c.S('WIS'), turns: 2, label: 'Divination accuracy', tag: 'ACCURACY' }); c.initiative(500); } }),
  se({ key: 'clairvoyance', tier: 5, branch: 'Astrologer', name: 'Clairvoyance', mana: [5.0, 2.0], amnesia: 4,
    text: 'The ally\'s next 2 skills cost 40% less MP; +(35 + 3·INT.S)% Pierce for 2 turns. +500 Initiative.',
    run(c, t) { c.mpCut(t, 40, 2); c.fx(t, { key: 'pierce', value: 35 + 3 * c.S('INT'), turns: 2, label: 'Clairvoyance Pierce', tag: 'PIERCE' }); c.initiative(500); } }),
  se({ key: 'barrierStone', tier: 5, branch: 'Artificer', name: 'Barrier Stone', mana: [5, 2], amnesia: 5, teamAmnesia: 5, channel: 1000, ...stone,
    text: 'Channel 1000 (+50% Taunt resistance; a Taunt breaks it). Barrier of 3.0·SPELL + 1.0·WIS; Delay 30: the target\'s barrier doubles, up to 150% of its max HP. Amnesia 5 for every Seer of the party.',
    run(c, t) {
      c.barrier(t, 3.0 * c.SPELL + 1.0 * c.stat('WIS'), 'Barrier Stone');
      c.delay(30, 'Barrier Stone', (d, x) => { const bar = x.fx.find((e) => e.key === 'barrier'); if (bar) d.barrier(x, Math.max(0, Math.min(bar.value, 1.5 * x.hpMax - bar.value)), 'Barrier Stone doubles'); }, t);
    } }),
];

/* ---------------- Berserker ---------------- */
const be = (o) => sk('berserker', { reach: 1, anim: 'WEAPONS/2H Axe/2H Axe Hit', ...o });
const BERSERKER = [
  be({ key: 'berserkir', tier: 1, branch: 'Bear', name: 'Berserkir Mushroom', passive: true, text: 'Passive: +ATTACK up to 50%, as much as the share of HP missing; at the start of each turn (not while channelling), a chance of Berserk for 30 ticks of 30% × the share of HP missing. After hurting allies: +10% ATTACK for 2 turns.' }),
  be({ key: 'ulfhednar', tier: 1, branch: 'Wolf', name: 'Ulfheðnar Mushroom', passive: true, text: 'Passive: every instance of damage dealt +1.5% ATTACK (30% at most) and 25% Berserk for 30 ticks. After hurting allies: 10% Haste for 20 ticks.' }),
  be({ key: 'jofurr', tier: 1, branch: 'Boar', name: 'Jöfurr Mushroom', passive: true, text: 'Passive: every instance of damage taken +2.5% ATTACK (30% at most) and 25% Berserk for 30 ticks. After hurting allies: 25% Lifesteal for 30 ticks.' }),
  be({ key: 'bearSkin', tier: 2, branch: 'Bear', name: 'Bear Skin', passive: true, text: 'Passive: −8% physical and magic damage taken.' }),
  be({ key: 'wolfPelt', tier: 2, branch: 'Wolf', name: 'Wolf Pelt', passive: true, text: 'Passive: +5% Evasion.' }),
  be({ key: 'boarHide', tier: 2, branch: 'Boar', name: 'Boar Hide', passive: true, text: 'Passive: +10% ATTACK.' }),
  be({ key: 'bloodlust', tier: 3, branch: 'Bear', name: 'Bloodlust', mana: [2.0, 0.75], target: 'self', anim: 'CLASS/Berserker/Bloodlust',
    text: 'Takes 15% of his max HP as pure damage; +(10 + 2·VIT.S)% ATTACK for 4 turns; +15% Haste for 40 ticks.',
    run(c) {
      c.selfPure(0.15 * c.src.hpMax, 'Bloodlust');
      c.fx(c.src, { key: 'attack', value: 10 + 2 * c.S('VIT'), turns: 4, label: 'Bloodlust', tag: 'BLOODLUST' });
      c.fx(c.src, { key: 'haste', value: 15, ticks: 40, label: 'Bloodlust haste', tag: 'HASTE' });
    } }),
  be({ key: 'howl', tier: 3, branch: 'Wolf', name: 'Howl', mana: [4.0, 0.75], target: 'none', reach: 3, amnesia: 2, anim: 'WEAPONS/2H Axe/2H Axe Special1',
    text: 'Each enemy: (25 + 6·STR.S)% Intimidate 20% for 4 turns; (3·STR.S + 3·LCK.S)% Berserker\'s Mark for 40 ticks. +300 Initiative.',
    run(c) {
      for (const t of c.enemies()) {
        const r = c.strike(t, 0, { noDamage: true, label: 'Howl' });
        if (!r.hit) continue;
        if (c.chance(25 + 6 * c.S('STR'))) c.fx(r.target, { key: 'intimidate', value: 20, turns: 4, label: 'Intimidate 20%', tag: 'INTIMIDATE' });
        if (c.chance(3 * c.S('STR') + 3 * c.S('LCK'))) c.mark(r.target, 40);
      }
      c.initiative(300);
    } }),
  be({ key: 'blindRage', tier: 3, branch: 'Boar', name: 'Blind Rage', anim: 'WEAPONS/2H Axe/2H Axe Combo', mana: [2.0, 1.0], target: 'none', reach: 3, amnesia: 1,
    text: '4 to 8 attacks of 0.3·ATTACK on random enemies; an enemy with Berserker\'s Mark takes at least half of them.',
    run(c) {
      const n = c.rng.int(4, 8);
      const marked = c.enemies().find((x) => c.has(x, 'bmark'));
      for (let i = 0; i < n; i++) {
        const foes = c.enemies(); if (!foes.length) break;
        const t = marked && marked.alive && i < Math.floor(n / 2) ? marked : c.rng.pick(foes);
        c.strike(t, 0.3 * c.ATK, { label: 'Blind Rage' });
      }
    } }),
  be({ key: 'primalStrength', tier: 4, branch: 'Bear', name: 'Primal Strength', passive: true, text: 'Passive: +10% ATTACK; in Berserk another +20%, −5% accuracy, and critical hits have 50% to Push 2.' }),
  be({ key: 'wolfPack', tier: 4, branch: 'Wolf', name: 'Wolf Pack', passive: true, text: 'Passive: +10% ATTACK for every ally standing; 5% Berserk for 25 ticks when an ally takes damage; Berserk for 40 ticks when an ally falls. If an enemy kills him, You Are My Enemy: (5·STR.S + 5·LCK.S)% Berserker\'s Mark on it for 50 ticks.' }),
  be({ key: 'wildFrenzy', tier: 4, branch: 'Boar', name: 'Wild Frenzy', passive: true, text: 'Passive: (5 + 2.5·LCK.S)% that his Attack spends ceil(1 + 0.5·level) MP and becomes 3 attacks, each −30%.' }),
  be({ key: 'sporeCoatedBlade', tier: 5, branch: 'Bear', name: 'Spore-Coated Blade', anim: 'WEAPONS/2H Axe/2H Axe Special2', mana: [4.0, 1.0], amnesia: 4,
    text: '1.2·ATTACK + 0.8·STR; if it deals damage: (70 + 2·DEX.S)% Poison, (40 + 2·STR.S)% the target takes +20% damage from him for 4 turns, (3·STR.S + 3·LCK.S)% Berserker\'s Mark for 30 ticks; then (95 − 2·DEX.S)% Poison on himself, ignoring barriers and Wards.',
    run(c, t) {
      const r = c.strike(t, 1.2 * c.ATK + 0.8 * c.stat('STR'), { label: 'Spore-Coated Blade' });
      if (!r.hit || !(r.damage > 0)) return;
      if (c.chance(70 + 2 * c.S('DEX'))) c.fx(r.target, { key: 'poison', label: 'Poison', tag: 'POISON' });
      if (c.chance(40 + 2 * c.S('STR'))) c.fx(r.target, { key: 'vuln', by: c.src.id, value: 20, turns: 4, label: `Spores (+20% from ${c.src.name.split(' ')[0]})`, tag: 'SPORES' });
      if (c.chance(3 * c.S('STR') + 3 * c.S('LCK'))) c.mark(r.target, 30);
      if (c.chance(95 - 2 * c.S('DEX'))) c.fx(c.src, { key: 'poison', label: 'Poison', tag: 'POISON', self: true, ignoreBarrier: true });
    } }),
  be({ key: 'brutalAct', tier: 5, branch: 'Wolf', name: 'Brutal Act', anim: 'CLASS/Berserker/Brutal Act', mana: [4.0, 1.0], target: 'none', reach: 2, amnesia: 4,
    text: '1.5·ATTACK + 2.0·STR to a random enemy; if it deals damage, 1.0·ATTACK + 1.0·STR to a random ally.',
    run(c) {
      const t = c.randomEnemy(); if (!t) return;
      const r = c.strike(t, 1.5 * c.ATK + 2.0 * c.stat('STR'), { label: 'Brutal Act' });
      const a = c.randomAlly();
      if (r.hit && r.damage > 0 && a) c.strike(a, 1.0 * c.ATK + 1.0 * c.stat('STR'), { label: 'Brutal Act', noMiss: true });
    } }),
  be({ key: 'bloodRage', tier: 5, branch: 'Boar', name: 'Blood Rage', mana: [2.25, 1.25], target: 'none', reach: 3, channel: 500, anim: 'CLASS/Berserker/Bloodrage',
    text: 'Channel 500. Moves to P1; each enemy 1.0·ATTACK + 1.0·STR + 0.5·LCK; each ally 0.5·ATTACK + 1.0·STR − 0.5·LCK; Berserk for 40 ticks.',
    run(c) {
      c.moveTo(c.src, 1);
      for (const t of c.enemies()) c.strike(t, 1.0 * c.ATK + 1.0 * c.stat('STR') + 0.5 * c.stat('LCK'), { label: 'Blood Rage' });
      for (const a of c.allies()) if (a !== c.src) c.strike(a, Math.max(0, 0.5 * c.ATK + 1.0 * c.stat('STR') - 0.5 * c.stat('LCK')), { label: 'Blood Rage', noMiss: true });
      c.berserk(c.src, 40);
    } }),
];

/* ---------------- Wizard ---------------- */
/* Arcane Power (AP): skills make it, some spend it. ap: fixed cost; apX: spends up to 30, X in the formula.
   ASSUMPTION on the UNLOCK N lines: they work if the Wizard holds at least N AP when casting (for X skills, if X ≥ N). */
const wz = (o) => sk('wizard', { magic: true, anim: 'WEAPONS/1H Wand/1H Wand Hit', ...o });
const WIZARD = [
  wz({ key: 'fireBolt', tier: 1, branch: 'Pyromancer', name: 'Fire Bolt', mana: [2.75, 1.25],
    text: '1.0·SPELL + 0.5·INT magic damage; (30 + 6.5·INT.S)% Burn and another (15 + 3·INT.S)%. +3 AP. Combo on a Burning target: half the MP back.',
    run(c, t) {
      const combo = c.has(t, 'burn');
      const r = c.strike(t, 1.0 * c.SPELL + 0.5 * c.stat('INT'), { type: 'magic', label: 'Fire Bolt' });
      if (r.hit) { if (c.chance(30 + 6.5 * c.S('INT'))) c.burn(r.target); if (c.chance(15 + 3 * c.S('INT'))) c.burn(r.target); }
      c.apGain(3);
      if (combo) { const back = Math.round((2.75 + 1.25 * c.src.level) / 2); c.src.mp = Math.min(c.src.mpMax, c.src.mp + back); c.log(`${c.src.name} gets ${back} MP back`); }
    } }),
  wz({ key: 'frostBolt', tier: 1, branch: 'Cryomancer', name: 'Frost Bolt', mana: [2.75, 1.25],
    text: '1.0·SPELL + 0.5·INT magic damage; (30 + 6.5·INT.S)% Chill and another (15 + 3·INT.S)%. +3 AP. Combo on a Chilled target: half the MP back.',
    run(c, t) {
      const combo = c.has(t, 'chill');
      const r = c.strike(t, 1.0 * c.SPELL + 0.5 * c.stat('INT'), { type: 'magic', label: 'Frost Bolt' });
      if (r.hit) { if (c.chance(30 + 6.5 * c.S('INT'))) c.chill(r.target); if (c.chance(15 + 3 * c.S('INT'))) c.chill(r.target); }
      c.apGain(3);
      if (combo) { const back = Math.round((2.75 + 1.25 * c.src.level) / 2); c.src.mp = Math.min(c.src.mpMax, c.src.mp + back); c.log(`${c.src.name} gets ${back} MP back`); }
    } }),
  wz({ key: 'rawArcana', tier: 1, branch: 'Arcanist', name: 'Raw Arcana', mana: [2.75, 1.25], target: 'self', anim: 'WEAPONS/1H Wand/1H Wand Special2',
    text: 'Barrier of 0.6·SPELL on himself; +10% SPELL for 3 turns; +5 AP, +2 more if he already had a barrier.',
    run(c) {
      const had = c.has(c.src, 'barrier');
      c.barrier(c.src, 0.6 * c.SPELL, 'Raw Arcana');
      c.fx(c.src, { key: 'spell', value: 10, turns: 3, label: 'Raw Arcana SPELL', tag: 'SPELL +10%' });
      c.apGain(had ? 7 : 5);
    } }),
  wz({ key: 'pyroMastery', tier: 2, branch: 'Pyromancer', name: 'Pyro Mastery', passive: true, text: 'Passive: +5 AP at the first turn; +(1·LCK.S)% critical chance on Burning targets; after each hit +1 AP per Burn stack on the target (3 at most).' }),
  wz({ key: 'cryoMastery', tier: 2, branch: 'Cryomancer', name: 'Cryo Mastery', passive: true, text: 'Passive: +5 AP at the first turn; +(1·LCK.S)% critical chance on Chilled targets; after each hit +1 AP per Chill stack on the target (3 at most).' }),
  wz({ key: 'arcaneMastery', tier: 2, branch: 'Arcanist', name: 'Arcane Mastery', passive: true, text: 'Passive: +(3.5·WIS.S)% Silence resistance; his barriers and Walls +10% HP; +10 AP at the first turn; +1 AP for every hit; +2 AP if he has a barrier when his turn starts.' }),
  wz({ key: 'fireball', tier: 3, branch: 'Pyromancer', name: 'Fireball', mana: [3.0, 1.5], ap: 5, amnesia: 2,
    text: 'Spends 5 AP. 1.8·SPELL + 1.0·INT, +10% on a Burning target; (30 + 6.5·INT.S)% Burn. SHOCK (10 AP): (5·INT.S)% Daze. AWE (15 AP): (2.5·INT.S)% Stun for 1 turn.',
    run(c, t) {
      const r = c.strike(t, (1.8 * c.SPELL + 1.0 * c.stat('INT')) * (c.has(t, 'burn') ? 1.1 : 1), { type: 'magic', label: 'Fireball' });
      if (!r.hit) return;
      if (c.chance(30 + 6.5 * c.S('INT'))) c.burn(r.target);
      if (c.unlock(10) && c.chance(5 * c.S('INT'))) c.fx(r.target, daze);
      if (c.unlock(15) && c.chance(2.5 * c.S('INT'))) c.fx(r.target, stun);
    } }),
  wz({ key: 'iceRain', tier: 3, branch: 'Cryomancer', name: 'Ice Rain', anim: 'WEAPONS/1H Wand/1H Wand Special1', mana: [3.5, 1.75], ap: 5, amnesia: 2, target: 'none',
    text: 'Spends 5 AP. 1.2·SPELL + 1.0·INT to the enemy in P1, (30 + 6.5·INT.S)% Chill. SHOWER (10 AP, not taunted): 0.8·SPELL + 0.5·INT to P2, (20 + 5·INT.S)% Chill. STORM (15 AP, not taunted): the same to P3. +20% Pierce, +20% more on Chilled targets.',
    run(c) {
      const foes = c.enemies().sort((a, b) => a.pos - b.pos);
      const free = !c.tauntedBy();
      foes.forEach((t, i) => {
        if (i === 1 && !(c.unlock(10) && free)) return;
        if (i === 2 && !(c.unlock(15) && free)) return;
        const raw = i === 0 ? 1.2 * c.SPELL + 1.0 * c.stat('INT') : 0.8 * c.SPELL + 0.5 * c.stat('INT');
        const r = c.strike(t, raw, { type: 'magic', label: 'Ice Rain', pierce: 20 + (c.has(t, 'chill') ? 20 : 0) });
        if (r.hit && c.chance(i === 0 ? 30 + 6.5 * c.S('INT') : 20 + 5 * c.S('INT'))) c.chill(r.target);
      });
    } }),
  wz({ key: 'arcaneBarrier', tier: 3, branch: 'Arcanist', name: 'Arcane Barrier', mana: [10, 2], ap: 10, amnesia: 5, target: 'none', anim: 'WEAPONS/1H Wand/1H Wand Special2',
    text: 'Spends 10 AP. Barrier on everyone of (3.5·SPELL + 1.0·INT + 1.0·WIS) / the number of party members; he gets +(5 + 1.5·WIS.S)% status resistance for 30 ticks. PROTECTION (15 AP): party +(3·WIS.S)% Silence, Fear and Confuse resistance for 30 ticks. MIRROR IMAGE (20 AP): party +(0.7·WIS.S)% Evasion for 30 ticks.',
    run(c) {
      const team = c.allies();
      for (const a of team) c.barrier(a, (3.5 * c.SPELL + 1.0 * c.stat('INT') + 1.0 * c.stat('WIS')) / team.length, 'Arcane Barrier');
      c.fx(c.src, { key: 'resAll', value: 5 + 1.5 * c.S('WIS'), ticks: 30, label: 'Arcane Barrier resistance' });
      if (c.unlock(15)) for (const a of team) c.fx(a, { key: 'resMind', value: 3 * c.S('WIS'), ticks: 30, label: 'Protection' });
      if (c.unlock(20)) for (const a of team) c.fx(a, { key: 'eva', value: 0.7 * c.S('WIS'), ticks: 30, label: 'Mirror Image', tag: 'MIRROR IMAGE' });
    } }),
  wz({ key: 'fireStorm', tier: 4, branch: 'Pyromancer', name: 'Fire Storm', anim: 'WEAPONS/1H Wand/1H Wand Special1', mana: [5, 2], ap: 12, amnesia: 6, channel: 1000, target: 'none',
    text: 'Spends 12 AP. Channel 1000. 1.8·SPELL + 1.0·INT to each enemy; (30 + 6.5·INT.S)% Burn. FLAME (15 AP) and BLAZE (20 AP): another (20 + 5·INT.S)% Burn each; INFERNO (25 AP): two more. +3 AP for every hit.',
    run(c) {
      const extra = (c.unlock(15) ? 1 : 0) + (c.unlock(20) ? 1 : 0) + (c.unlock(25) ? 2 : 0);
      for (const t of c.enemies()) {
        const r = c.strike(t, 1.8 * c.SPELL + 1.0 * c.stat('INT'), { type: 'magic', label: 'Fire Storm' });
        if (!r.hit) continue;
        c.apGain(3);
        if (c.chance(30 + 6.5 * c.S('INT'))) c.burn(r.target);
        for (let i = 0; i < extra; i++) if (c.chance(20 + 5 * c.S('INT'))) c.burn(r.target);
      }
    } }),
  wz({ key: 'frostLance', tier: 4, branch: 'Cryomancer', name: 'Frost Lance', anim: 'WEAPONS/1H Wand/1H Wand Special1', mana: [5, 2], ap: 12, amnesia: 6, channel: 500, tauntBreak: true, target: 'none',
    text: 'Spends 12 AP. Channel 500 (a Taunt breaks it). 1.8 / 1.6 / 1.4·SPELL + 1.0·INT to P1 / P2 / P3; (30 + 6.5·INT.S)% Chill; +20% Pierce; stops if blocked. FROSTBITE (15 AP) and SUBZERO (20 AP): another (20 + 5·INT.S)% Chill each. HONED (25 AP): +40% Pierce, cannot be blocked, (20 + 4·INT.S)% Bleed. +4 AP for every hit.',
    run(c) {
      const mult = [1.8, 1.6, 1.4];
      const honed = c.unlock(25);
      const extra = (c.unlock(15) ? 1 : 0) + (c.unlock(20) ? 1 : 0);
      for (const [i, t] of c.enemies().sort((a, b) => a.pos - b.pos).entries()) {
        const r = c.strike(t, mult[i] * c.SPELL + 1.0 * c.stat('INT'), { type: 'magic', label: 'Frost Lance', pierce: honed ? 60 : 20 });
        if (r.hit) {
          c.apGain(4);
          if (c.chance(30 + 6.5 * c.S('INT'))) c.chill(r.target);
          for (let k = 0; k < extra; k++) if (c.chance(20 + 5 * c.S('INT'))) c.chill(r.target);
          if (honed && c.chance(20 + 4 * c.S('INT'))) c.fx(r.target, bleed);
        }
        if (r.blocked && !honed) break;
      }
    } }),
  wz({ key: 'mindBreak', tier: 4, branch: 'Arcanist', name: 'Mind Break', mana: [9, 2], amnesia: 4,
    text: '1.0·SPELL + 1.0·INT, +5% for each Burn or Chill stack on the target. MUDDLE (15 AP): +0.5·SPELL and (4·WIS.S)% Confuse. ADDLE (20 AP): (6·WIS.S)% Amnesia 3 on one of its skills. +5 AP.',
    run(c, t) {
      const stacks = c.stacks(t, 'burn') + c.stacks(t, 'chill');
      const r = c.strike(t, (1.0 * c.SPELL + 1.0 * c.stat('INT') + (c.unlock(15) ? 0.5 * c.SPELL : 0)) * (1 + 0.05 * stacks), { type: 'magic', label: 'Mind Break' });
      if (r.hit) {
        if (c.unlock(15) && c.chance(4 * c.S('WIS'))) c.fx(r.target, { key: 'confuse', turns: 1, label: 'Confuse', tag: 'CONFUSE' });
        if (c.unlock(20) && c.chance(6 * c.S('WIS'))) c.amnesiaRandom(r.target, 3);
      }
      c.apGain(5);
    } }),
  wz({ key: 'pyroclast', tier: 5, branch: 'Pyromancer', name: 'Pyroclast Explosion', anim: 'WEAPONS/1H Wand/1H Wand Special1', mana: [10.25, 2.25], apX: true, amnesia: 4, channel: (X) => 50 + 50 * X, target: 'none',
    text: 'Spends X AP (30 at most). Channel 50 + 50·X. 0.15·X·SPELL + 1.0·INT to each enemy, +5% for each Chill stack (the Chill goes); (20 + 5·INT.S)% Burn. TERRIFYING (15): (2·X + 2·INT.S)% Fear for 1 turn on each. SHOCKWAVE (30): (1·X + 1.5·INT.S)% Stun for 1 turn on a random enemy.',
    run(c) {
      for (const t of c.enemies()) {
        const ch = c.stacks(t, 'chill');
        if (ch) t.fx = t.fx.filter((e) => e.key !== 'chill');
        const r = c.strike(t, (0.15 * c.X * c.SPELL + 1.0 * c.stat('INT')) * (1 + 0.05 * ch), { type: 'magic', label: 'Pyroclast Explosion' });
        if (!r.hit) continue;
        if (c.chance(20 + 5 * c.S('INT'))) c.burn(r.target);
        if (c.unlock(15) && c.chance(2 * c.X + 2 * c.S('INT'))) c.fx(r.target, { key: 'fear', turns: 1, label: 'Fear', tag: 'FEAR' });
      }
      const x = c.randomEnemy();
      if (x && c.unlock(30) && c.chance(1 * c.X + 1.5 * c.S('INT'))) c.fx(x, stun);
    } }),
  wz({ key: 'frostGrip', tier: 5, branch: 'Cryomancer', name: 'Frost Grip', anim: 'WEAPONS/1H Wand/1H Wand Hit2', mana: [10.25, 2.25], apX: true, amnesia: 4, channel: (X) => 50 + 50 * X,
    text: 'Spends X AP (30 at most). Channel 50 + 50·X. 0.2·X·SPELL + 1.5·INT to the target, +5% for each Burn stack (the Burn goes); (30 + 6.5·INT.S)% Chill. HOLD FAST (15): (2·X + 3.5·INT.S)% Root for 20 ticks and (2·X + 2.5·INT.S)% Daze. GIANT GRIP (35, not taunted): also the enemy in front, −20% each.',
    run(c, t) {
      const list = [t];
      const fr = c.front(t);
      if (c.unlock(35) && !c.tauntedBy() && fr) list.push(fr);
      for (const x of list) {
        const bu = c.stacks(x, 'burn');
        if (bu) x.fx = x.fx.filter((e) => e.key !== 'burn');
        const r = c.strike(x, (0.2 * c.X * c.SPELL + 1.5 * c.stat('INT')) * (1 + 0.05 * bu) * (list.length > 1 ? 0.8 : 1), { type: 'magic', label: 'Frost Grip' });
        if (!r.hit) continue;
        if (c.chance(30 + 6.5 * c.S('INT'))) c.chill(r.target);
        if (c.unlock(15)) {
          if (c.chance(2 * c.X + 3.5 * c.S('INT'))) c.fx(r.target, { key: 'root', ticks: 20, label: 'Root', tag: 'ROOT' });
          if (c.chance(2 * c.X + 2.5 * c.S('INT'))) c.fx(r.target, daze);
        }
      }
    } }),
  wz({ key: 'wallOfReflection', tier: 5, branch: 'Arcanist', name: 'Wall of Reflection', mana: [3, 2], apX: true, amnesia: 5, noWall: true, target: 'none', anim: 'WEAPONS/1H Wand/1H Wand Special2',
    text: 'Not while the party has a Wall. Spends X AP (30 at most). A Wall of 0.18·X·SPELL + 1.0·WIS + 1.0·VIT for 10 ticks or until broken: damage to any member hits it first. REFLECTION (15): Delay 20, (1·X + 3.5·WIS.S)% of the damage it took goes back, split among the enemies. AFTERSHOCK (35): Delay 30, once more. If it fades having taken less than half its HP: Arcane Burst, (20 + 5·WIS.S)% Dispel and Negate on each enemy, +5 AP.',
    run(c) {
      const X = c.X;
      const pct = 1 * X + 3.5 * c.S('WIS');
      const wall = c.wall(0.18 * X * c.SPELL + 1.0 * c.stat('WIS') + 1.0 * c.stat('VIT'), 10, (d, w) => {
        if (w.taken >= 0.5 * w.max) return;
        d.log(`${d.src.name}: Arcane Burst`);
        for (const t of d.enemies()) { if (d.chance(20 + 5 * d.S('WIS'))) d.dispel(t); if (d.chance(20 + 5 * d.S('WIS'))) d.negate(t); }
        d.apGain(5);
      });
      const reflect = (d) => {
        const taken = wall.taken;
        const foes = d.enemies();
        if (!taken || !foes.length) { d.log('Reflection: nothing to send back'); return; }
        for (const t of foes) d.strike(t, taken * pct / 100 / foes.length, { type: 'pure', noMiss: true, label: 'Reflection' });
      };
      if (c.unlock(15)) c.delay(20, 'Reflection', reflect);
      if (c.unlock(35)) c.delay(30, 'Aftershock', reflect);
    } }),
];

/* ---------------- Pirate ---------------- */
/* D20 and D6 are dice rolls. Each skill belongs to a discipline (its branch): Busster, Pirate Code, Luck of the Sea. */
const pi = (o) => sk('pirate', { anim: 'WEAPONS/1H Sword/1H Sword Gun', ...o });
const PIRATE = [
  pi({ key: 'warningShot', tier: 1, branch: 'Busster', name: 'Warning Shot', mana: [1.5, 0.5], reach: 2,
    text: '1.0·ATTACK + 1.0·DEX. Combo after a Busster skill: (20 + 4·DEX.S)% Daze, at most once every two turns.',
    run(c, t) {
      const r = c.strike(t, 1.0 * c.ATK + 1.0 * c.stat('DEX'));
      const ready = (c.src.turns - (c.src.warnTurn ?? -9)) >= 2;
      if (r.hit && ready && c.lastBranch('Busster') && c.chance(20 + 4 * c.S('DEX'))) { c.fx(r.target, daze); c.src.warnTurn = c.src.turns; }
    } }),
  pi({ key: 'unluckyJenkins', tier: 1, branch: 'Pirate Code', name: 'Unlucky Jenkins', mana: [1.5, 0.5], reach: 1, anim: 'WEAPONS/1H Sword/1H Sword Hit',
    text: '0.09·D20·ATTACK + 0.5·STR + 0.5·LCK; 40% Pierce; critical damage −0.2x. Combo after a Pirate Code skill: (20 + 4·STR.S)% Bleed.',
    run(c, t) {
      const roll = c.d20();
      c.log(`${c.src.name} rolls a D20: ${roll}`);
      const r = c.strike(t, 0.09 * roll * c.ATK + 0.5 * c.stat('STR') + 0.5 * c.stat('LCK'), { pierce: 40, critMultBonus: -0.2, label: 'Unlucky Jenkins' });
      if (r.hit && c.lastBranch('Pirate Code') && c.chance(20 + 4 * c.S('STR'))) c.fx(r.target, bleed);
    } }),
  pi({ key: 'fullSail', tier: 1, branch: 'Luck of the Sea', name: 'Full Sail', mana: [1.5, 0.5], target: 'none', anim: 'WEAPONS/1H Sword/1H Sword Charge',
    text: 'A coin. Heads: allies +(0.3·LCK) AGI for 30 ticks. Tails: allies +(5 + 1.5·LCK.S)% damage for 30 ticks. +400 Initiative. Combo after a Luck of the Sea skill: (20 + 4·LCK.S)% it lasts 40 ticks.',
    run(c) {
      const ticks = c.lastBranch('Luck of the Sea') && c.chance(20 + 4 * c.S('LCK')) ? 40 : 30;
      const heads = c.coin();
      c.log(`${c.src.name} flips a coin: ${heads ? 'heads' : 'tails'}`);
      for (const a of c.allies()) {
        if (heads) c.fx(a, { key: 'agi', stat: 'AGI', value: Math.round(0.3 * c.stat('LCK')), ticks, label: 'Full Sail AGI', tag: 'FULL SAIL' });
        else c.fx(a, { key: 'dmgOut', value: 5 + 1.5 * c.S('LCK'), ticks, label: 'Full Sail damage', tag: 'FULL SAIL' });
      }
      c.initiative(400);
    } }),
  pi({ key: 'busster', tier: 2, branch: 'Busster', name: 'Busster', passive: true, text: 'Passive: a D20 at the first turn and every 7 turns: DEX +(2 + D20·0.01·DEX, rounded up) until the next roll.' }),
  pi({ key: 'pirateCode', tier: 2, branch: 'Pirate Code', name: 'The Pirate Code', passive: true, text: 'Passive: a D20 at the first turn and every 7 turns: STR +(2 + D20·0.01·STR, rounded up) until the next roll.' }),
  pi({ key: 'luckOfTheSea', tier: 2, branch: 'Luck of the Sea', name: 'Luck of the Sea', passive: true, text: 'Passive: a D20 at the first turn and every 7 turns: LCK +(2 + D20·0.01·LCK, rounded up) until the next roll.' }),
  pi({ key: 'blunderbusster', tier: 3, branch: 'Busster', name: 'Blunderbusster', mana: [2.9, 0.85], reach: 2, amnesia: 4,
    text: 'The target and the one behind it. (3·DEX.S)% to destroy the enemy Wall; (6.5·DEX.S)% to destroy each one\'s barrier; 1.0·ATTACK + 0.5·LCK each; (5·DEX.S)% Daze.',
    run(c, t) {
      const w = c.wallOf(t.team);
      if (w && c.chance(3 * c.S('DEX'))) { c.b.walls[t.team] = null; c.log(`${w.src.name}'s Wall is blown apart`); }
      for (const x of [t, c.behind(t)].filter(Boolean)) {
        if (c.has(x, 'barrier') && c.chance(6.5 * c.S('DEX'))) { x.fx = x.fx.filter((e) => e.key !== 'barrier'); c.log(`${x.name}'s barrier is blown apart`); }
        const r = c.strike(x, 1.0 * c.ATK + 0.5 * c.stat('LCK'), { label: 'Blunderbusster' });
        if (r.hit && c.chance(5 * c.S('DEX'))) c.fx(r.target, daze);
      }
    } }),
  pi({ key: 'disablingBlow', tier: 3, branch: 'Pirate Code', name: 'Disabling Blow', mana: [1, 0.75], reach: 1, amnesia: 3, anim: 'CLASS/Pirate/Disabling Blow',
    text: '1.3·ATTACK + 0.7·STR; (10 + 2.5·LCK.S)% Dispel; (20 + 4.5·STR.S)% Intimidate 20% for 2 turns; if Intimidated, (5 + 1·STR.S)% Stun. Combo after Unlucky Jenkins: (30 + 4·STR.S)% Bleed.',
    run(c, t) {
      const r = c.strike(t, 1.3 * c.ATK + 0.7 * c.stat('STR'), { label: 'Disabling Blow' });
      if (!r.hit) return;
      const x = r.target;
      if (c.chance(10 + 2.5 * c.S('LCK'))) c.dispel(x);
      if (c.chance(20 + 4.5 * c.S('STR'))) c.fx(x, { key: 'intimidate', value: 20, turns: 2, label: 'Intimidate 20%', tag: 'INTIMIDATE' });
      if (c.has(x, 'intimidate') && c.chance(5 + c.S('STR'))) c.fx(x, stun);
      if (c.lastWas('pirate.unluckyJenkins') && c.chance(30 + 4 * c.S('STR'))) c.fx(x, bleed);
    } }),
  pi({ key: 'starboardCannons', tier: 3, branch: 'Luck of the Sea', name: 'Starboard Cannons', mana: [2, 0.75], amnesia: 3, channel: 800,
    text: 'Channel 800. 1.2·ATTACK + 1.0·LCK to the target and another random enemy; (15 + 3.5·LCK.S)% −35% P.DEF for 25 ticks on each; (15 + 3.5·LCK.S)% Repeat 1, once per turn.',
    run(c, t) {
      const others = c.enemies().filter((x) => x !== t);
      for (const x of [t, others.length ? c.rng.pick(others) : null].filter(Boolean)) {
        const r = c.strike(x, 1.2 * c.ATK + 1.0 * c.stat('LCK'), { label: 'Starboard Cannons' });
        if (r.hit && c.chance(15 + 3.5 * c.S('LCK'))) c.fx(r.target, { key: 'pdef', value: -35, neg: true, ticks: 25, label: 'Cannons −35% P.DEF', tag: 'P.DEF −35%' });
      }
      if (c.chance(15 + 3.5 * c.S('LCK'))) c.repeat();
    } }),
  pi({ key: 'cheapshot', tier: 4, branch: 'Busster', name: 'Cheapshot', mana: [2, 0.85], amnesia: 3,
    text: '1.3·ATTACK + 1.0·DEX; (25 + 4.5·DEX.S)% Slow 25% for 25 ticks; critical damage +0.5x. Combo after Warning Shot: +0.3·ATTACK and (15 + 2.5·DEX.S)% Stun for 1 turn.',
    run(c, t) {
      const combo = c.lastWas('pirate.warningShot');
      const r = c.strike(t, 1.3 * c.ATK + 1.0 * c.stat('DEX') + (combo ? 0.3 * c.ATK : 0), { critMultBonus: 0.5, label: 'Cheapshot' });
      if (!r.hit) return;
      if (c.chance(25 + 4.5 * c.S('DEX'))) c.fx(r.target, slow(25, 25));
      if (combo && c.chance(15 + 2.5 * c.S('DEX'))) c.fx(r.target, stun);
    } }),
  pi({ key: 'allHandsOnDeck', tier: 4, branch: 'Pirate Code', name: 'All Hands On Deck', mana: [5, 1], reach: 1, amnesia: 4, teamAmnesia: 4, anim: 'WEAPONS/1H Sword/1H Sword Hit',
    text: 'Everyone in the party makes a basic attack on the target at once (not those channelling, stunned, or taunted by another enemy); it is not their turn and does not break their combos. He gets +20% Haste for 20 ticks.',
    run(c, t) {
      for (const a of c.allies()) {
        if (!t.alive) break;
        if (a.channel || c.has(a, 'stun')) continue;
        const tb = a.fx.find((e) => e.key === 'taunt');
        if (tb && tb.by !== t.id) continue;
        c.events.push({ type: 'status', target: a.id, text: `${a.name} joins the attack` });
        c.basicBy(a, t);
      }
      c.fx(c.src, { key: 'haste', value: 20, ticks: 20, label: 'All Hands haste', tag: 'HASTE' });
    } }),
  pi({ key: 'curseOfTheSea', tier: 4, branch: 'Luck of the Sea', name: 'Curse of the Sea', mana: [5, 1], target: 'none', reach: 1, amnesia: 2, anim: 'WEAPONS/1H Sword/1H Sword Charge',
    text: 'Delay 5·D6 ticks: 1.3·ATTACK + 1.0·LCK to each enemy; (15 + 3.5·LCK.S)% Fear on the enemy with the least HP. Combo after Starboard Cannons: (25 + 4.5·LCK.S)% Slow 20% for 15 ticks on each.',
    run(c) {
      const roll = c.d6();
      const combo = c.lastWas('pirate.starboardCannons');
      c.log(`${c.src.name} rolls a D6: ${roll}`);
      c.delay(5 * roll, 'Curse of the Sea', (d) => {
        for (const t of d.enemies()) {
          const r = d.strike(t, 1.3 * d.ATK + 1.0 * d.stat('LCK'), { label: 'Curse of the Sea' });
          if (r.hit && combo && d.chance(25 + 4.5 * d.S('LCK'))) d.fx(r.target, slow(20, 15));
        }
        const low = d.enemies().sort((a, b) => a.hp - b.hp)[0];
        if (low && d.chance(15 + 3.5 * d.S('LCK'))) d.fx(low, { key: 'fear', turns: 1, label: 'Fear', tag: 'FEAR' });
      });
    } }),
  pi({ key: 'firstMate', tier: 5, branch: 'Busster', name: 'First Mate', mana: [1, 1], target: 'allyOther', amnesia: 3, anim: 'WEAPONS/1H Sword/1H Sword Charge',
    text: 'The ally gets +(0.7·DEX.S + 0.7·LCK.S)% Evasion for 30 ticks; the next ceil(D6 / 2) attacks aimed at the pirate go to that ally instead.',
    run(c, t) {
      const n = Math.ceil(c.d6() / 2);
      c.fx(t, { key: 'eva', value: 0.7 * c.S('DEX') + 0.7 * c.S('LCK'), ticks: 30, label: 'First Mate', tag: 'FIRST MATE' });
      c.fx(c.src, { key: 'firstMate', to: t.id, n, label: `First Mate: ${t.name.split(' ')[0]} takes ${n}`, tag: `MATE ×${n}` });
    } }),
  pi({ key: 'walkThePlank', tier: 5, branch: 'Pirate Code', name: 'Walk the Plank', mana: [3, 1], reach: 1, amnesia: 3, anim: 'CLASS/Knight/Mighty Strike',
    text: '1.5·ATTACK + 0.5·STR + 0.5·DEX; (10 + 2.5·STR.S)% Push 2, otherwise (25 + 5·STR.S)% Push 1; if the target is under (10 + 5·places pushed)% of its HP, (5·STR.S)% Execute; if it dies, +30% Haste for 20 ticks.',
    run(c, t) {
      const r = c.strike(t, 1.5 * c.ATK + 0.5 * c.stat('STR') + 0.5 * c.stat('DEX'), { label: 'Walk the Plank' });
      if (!r.hit) return;
      const x = r.target;
      const p0 = x.pos;
      if (c.chance(10 + 2.5 * c.S('STR'))) c.push(x, 2);
      if (x.pos === p0 && c.chance(25 + 5 * c.S('STR'))) c.push(x, 1);
      const moved = x.pos - p0;
      if (x.alive && x.hp < (10 + 5 * moved) / 100 * x.hpMax && c.chance(5 * c.S('STR'))) c.execute(x);
      if (!x.alive) c.fx(c.src, { key: 'haste', value: 30, ticks: 20, label: 'Plank haste', tag: 'HASTE' });
    } }),
  pi({ key: 'parley', tier: 5, branch: 'Luck of the Sea', name: 'Parley', mana: [2, 1], amnesia: 3,
    text: '1.6·ATTACK + 0.5·WIS + 0.5·LCK; he and the target each roll a D20: the lower D20·LCK.S has 95% to take +(10 + 2·LCK.S)% damage for 30 ticks.',
    run(c, t) {
      const r = c.strike(t, 1.6 * c.ATK + 0.5 * c.stat('WIS') + 0.5 * c.stat('LCK'), { label: 'Parley' });
      if (!r.hit || !r.target.alive) return;
      const x = r.target;
      const mine = c.d20(), theirs = c.d20();
      const a = mine * c.S('LCK'), d = theirs * (x.dyn ? x.dyn.S.LCK * 100 : 0);
      const loser = a < d ? c.src : x;
      c.log(`Parley: ${c.src.name} ${mine}, ${x.name} ${theirs}`);
      if (c.chance(95)) c.fx(loser, { key: 'dmgIn', value: 10 + 2 * c.S('LCK'), ticks: 30, neg: true, label: 'Parley', tag: 'PARLEY', self: loser === c.src, stackMax: 1 });
    } }),
];
export const MORE = { warrior: WARRIOR, seer: SEER, berserker: BERSERKER, wizard: WIZARD, pirate: PIRATE };
