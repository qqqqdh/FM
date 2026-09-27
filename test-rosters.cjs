'use strict';
// node test-rosters.cjs — real-player positions, career ordering and legacy saves.
const assert = require('node:assert/strict');
const G = require('./engine.js');
const copy = value => JSON.parse(JSON.stringify(value));
const seeds = Object.values(G.LEAGUES.rosters).flat();
const seedNames = new Set(seeds.map(([name]) => name));
assert.equal(seeds.length, 66);
assert.equal(new Set(seeds.map(([name]) => name)).size, seeds.length);
for (const [club, entries] of Object.entries(G.LEAGUES.rosters)) {
  assert(G.CLUBS.some(c => c[0] === club));
  assert.equal(entries.length, 22);
  assert(entries.every(([name, position]) => typeof name === 'string' && Object.hasOwn(G.POSITIONS, position)));
  assert(entries.filter(([, position]) => position === 'GK').length >= 2);
}

// Starting in another league changes IDs; explicit positions must stay the same.
for (const chosen of ['레스터 시티', '선덜랜드', 'FC 안양']) {
  const s = G.newGame(42, G.CLUBS.findIndex(c => c[0] === chosen));
  for (const [club, entries] of Object.entries(G.LEAGUES.rosters)) {
    const team = s.clubs.find(c => c.name === club);
    for (const [name, position] of entries) {
      const p = G.roster(s, team.id).find(p => p.name === name);
      assert(p, name);
      assert.equal(p.position, position, name);
      assert(G.POSITION_GROUPS[p.pos].includes(position), name);
    }
    assert.equal(G.player(s, team.lineup[0]).position, 'GK', club);
  }
  const faes = s.players.find(p => p.name === 'Wout Faes');
  const mavididi = s.players.find(p => p.name === 'Stephy Mavididi');
  assert.equal(faes.position, 'CB');
  assert.equal(mavididi.position, 'LW');
  assert(G.suitability(faes, 'CB') > G.suitability(faes, 'GK'));
  assert(G.filterPlayers(s, {position: 'LW'}).every(p => p.position === 'LW'));

  // Reproduce the old order-based groups and ID-based positions for all 66 players.
  for (const p of s.players) {
    if (!seedNames.has(p.name)) continue;
    const i = (p.id - 1) % 22;
    p.pos = i < 3 ? 'GK' : i < 10 ? 'DF' : i < 17 ? 'MF' : 'FW';
    p.position = G.POSITION_GROUPS[p.pos][p.id % G.POSITION_GROUPS[p.pos].length];
  }
  // Transfers, loans, released players and namesakes must not confuse migration.
  const origin = faes.club;
  faes.club = (origin + 1) % s.clubs.length;
  faes.loan = {owner: origin};
  mavididi.club = -1;
  const namesake = s.players.find(p => !seedNames.has(p.name));
  namesake.name = 'Wout Faes';
  const youth = s.academy[0]; youth.name = '김정훈';
  const before = copy(s);
  const previousPlayers = new Map(before.players.map(p => [p.id, p]));
  G.upgradeSave(s);
  for (const p of s.players) {
    const original = s.clubs[Math.floor((p.id - 1) / 22)];
    const seed = G.LEAGUES.rosters[original?.name]?.[(p.id - 1) % 22];
    if (seed && seed[0] === p.name) assert.equal(p.position, seed[1], p.name);
  }
  assert.equal(faes.position, 'CB'); assert.equal(faes.pos, 'DF');
  assert.equal(mavididi.position, 'LW'); assert.equal(mavididi.pos, 'FW');
  assert.deepEqual(namesake, before.players.find(p => p.id === namesake.id));
  assert.deepEqual(youth, before.academy[0]);
  for (const p of s.players) {
    const previous = previousPlayers.get(p.id);
    previous.position = p.position; previous.pos = p.pos;
  }
  assert.deepEqual(s, before, 'only positions change: retain statistics, attributes, money, contracts and lineups');
  assert.deepEqual(G.upgradeSave(copy(s)), s, 'migration must be idempotent');
  // Restore valid lineups after the synthetic transfers, then validate a save round-trip.
  s.clubs.forEach(c => { c.lineup = G.autoLineup(s, c.id); });
  s.incoming = [];
  assert(G.validSave(copy(s)));
  if (chosen === '레스터 시티') {
    G.startMatch(s);
    faes.pos = 'GK'; faes.position = 'GK';
    const pending = copy(s.pending), lineups = s.clubs.map(c => c.lineup.slice());
    G.upgradeSave(s);
    assert.equal(faes.position, 'CB');
    assert.deepEqual(s.pending, pending, 'loading a live match must retain match progress');
    assert.deepEqual(s.clubs.map(c => c.lineup), lineups, 'loading must not change live substitutions');
    assert(G.validSave(copy(s)));
  }
}
console.log('Roster audit passed: 66 explicit positions, 3 starting clubs, legacy migration and namesake protection.');
