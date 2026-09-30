'use strict';
const assert = require('node:assert/strict');
const G = require('./engine.js');
const copy = s => JSON.parse(JSON.stringify(s));
const s = G.newGame(42);
s.budget = 10000;
while (s.facilities.youth < 8) {
  const cost = G.upgradeCost(s, 'facilities', 'youth'), before = s.budget;
  assert(G.upgrade(s, 'facilities', 'youth').ok);
  assert.equal(s.budget, before-cost);
  assert.equal(G.facilityUpkeep(s), 0);
}
assert(!G.upgrade(s, 'facilities', 'youth').ok);
assert.equal(G.upgradeLimit('facilities', 'training'), 5);
assert(G.validSave(copy(s)));
const malformed = copy(s); malformed.facilities.youth = 9;
assert(!G.validSave(malformed));
const poor = s.clubs[1]; poor.marketSpending = {season:s.season, amount:100000};
const before = s.clubs.map(c => ({facilities:{...c.facilities}, budget:G.clubMarketCapacity(s,c).budget}));
G.manageAIFacilities(s);
assert.deepEqual(poor.facilities, before[1].facilities);
let improved = 0;
for (const c of s.clubs.slice(1)) {
  const changes = Object.keys(c.facilities).filter(k => c.facilities[k] !== before[c.id].facilities[k]);
  assert(changes.length <= 1);
  if (changes.length) {
    improved++;
    const cost = G.upgradeCost({facilities:before[c.id].facilities}, 'facilities', changes[0]);
    assert(cost <= before[c.id].budget * .25);
    assert.equal(c.marketSpending.amount, cost, 'only the construction cost is paid');
  }
}
assert(improved > 0);
const snapshot = JSON.stringify(s.clubs);
G.manageAIFacilities(s); assert.equal(JSON.stringify(s.clubs), snapshot);
const legacy = copy(s); legacy.clubs.forEach(c => { delete c.facilities; delete c.facilitySeason; });
const players = JSON.stringify(legacy.players), budget = legacy.budget;
G.upgradeSave(legacy);
assert.equal(JSON.stringify(legacy.players), players); assert.equal(legacy.budget, budget);
assert(G.validSave(legacy));
// Both academies use the same generator; AI's larger cohort exercises the upper tail.
s.clubs.slice(1).forEach(c => { c.facilities.youth = 8; });
const p = G.roster(s)[0];
Object.assign(p, {age:20, atk:109, def:109, tech:109, pace:109, potential:110, contract:2040});
Object.keys(p.attributes).forEach(k => { p.attributes[k] = 109; });
s.week = s.totalWeeks; assert(G.nextSeason(s));
assert.equal(G.ovr(p), 110);
assert(Object.values(p.attributes).every(n => n <= 110));
const rookies = s.players.filter(p => p.id > G.CLUBS.length*22 && p.club > 0);
assert(rookies.some(p => p.potential === 110));
assert(rookies.every(p => p.potential <= 110));
assert(G.validSave(copy(s)));
const badRating = copy(s); badRating.players[0].atk = 111;
assert(!G.validSave(badRating));
const badAI = copy(s); badAI.clubs[1].facilities.youth = 9;
assert(!G.validSave(badAI));
console.log('PASS: one-time facility costs, AI investment, academy LV.8, OVR 110 growth/generation and legacy saves');
