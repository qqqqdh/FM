'use strict';
// node test-youth.cjs [save.json]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const G = require('./engine.js');
const s = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : G.newGame(42);
if (!process.argv[2]) { s.season = 2035; s.players.forEach(p => { p.age += 9; }); }
const squadSnapshot = () => JSON.stringify(G.roster(s).map(({retirementRequestSeason, ...p}) => p));
const own = squadSnapshot(), budget = s.budget;
const ids = new Set(s.players.map(p => p.id));
G.upgradeSave(s);
assert.equal(squadSnapshot(), own, 'preserve our squad apart from retirement requests');
assert.equal(s.budget, budget);
const fresh = s.players.filter(p => !ids.has(p.id));
assert.equal(fresh.length, (s.clubs.length - 1) * 2);
for (const position of Object.keys(G.POSITIONS)) assert(fresh.filter(p => p.position === position).length > 200, position);
assert(fresh.every(p => p.age >= 16 && p.age <= 18 && G.POSITION_GROUPS[p.pos].includes(p.position)));
const snapshot = JSON.stringify(s);
G.upgradeSave(s);
assert.equal(JSON.stringify(s), snapshot, 'loading twice must not create more players');
assert(G.validSave(JSON.parse(snapshot)), 'repaired save round-trip');
for (const p of s.retiredPlayers) { assert.equal(G.player(s, p.id), p); assert(!G.canRelease(s, p.id)); }
const retired = s.retiredPlayers[0];
assert(!G.deal(s, retired.id, 0).ok);
assert(!G.scout(s, retired.id).ok);
const broken = JSON.parse(snapshot); broken.retiredPlayers[0].id = broken.players[0].id;
assert(!G.validSave(broken), 'retired IDs cannot collide');
const count = fresh.length;
const previousMax = Math.max(...s.players.map(p => p.id), ...s.academy.map(p => p.id), ...s.retiredPlayers.map(p => p.id));
s.week = s.totalWeeks;
assert(G.nextSeason(s));
assert.equal(s.players.filter(p => p.id > previousMax && p.club > 0).length, count, 'annual AI intake');
assert(G.validSave(JSON.parse(JSON.stringify(s))), 'next season save remains valid');
console.log('Youth intake, positions, migration, retirement and next season: OK');
