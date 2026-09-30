'use strict';
const assert = require('node:assert/strict');
const G = require('./engine.js');
const s = G.newGame(42);
const ai = s.clubs.slice(1);
assert(ai.some(c => c.tactics.formation === '4-2-3-1'));
assert(ai.filter(c => G.SLOTS[c.tactics.formation].includes('AM')).length > 100);
assert(ai.filter(c => G.SLOTS[c.tactics.formation].includes('DM')).length > 100);
const p = G.roster(s).find(p => p.pos === 'MF');
Object.assign(p, {atk:85, def:85, tech:85, pace:85, potential:100, age:23, salary:.2});
for (const position of ['AM','DM']) {
  p.position = position;
  const game = JSON.parse(JSON.stringify(s)), offers = G.getTransferOffers(game,p.id);
  assert(offers.length > 0, `${position} has real buyers`);
  const deal = offers[0];
  assert(G.negotiateSale(game,p.id,deal.club,deal.cash).ok, `${position} can negotiate`);
}
// Isolate specialist attributes: vision helps attack at AM; tackling helps defense at DM.
G.setTactics(s,'formation','4-2-3-1'); s.clubs[0].lineup = G.autoLineup(s);
for (const [slot,stat,output] of [['AM','vision','attack'],['DM','tackling','defense']]) {
  const q = G.player(s,s.clubs[0].lineup[G.SLOTS['4-2-3-1'].indexOf(slot)]);
  q.attributes[stat] = 40; const low = G.strength(s,0)[output];
  q.attributes[stat] = 100; assert(G.strength(s,0)[output] > low);
}
assert(G.validSave(JSON.parse(JSON.stringify(s))));
console.log('PASS: AI uses AM/DM formations, both positions receive bids, and specialist attributes affect matches');
