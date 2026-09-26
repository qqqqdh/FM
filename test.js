'use strict';
// Run with: node test.js (Node's built-in assertions; no dependencies).
const assert = require('node:assert/strict');
const G = require('./engine.js');
const clone = s => JSON.parse(JSON.stringify(s));
const valid = s => assert(G.validSave(clone(s)), 'save must round-trip');
const findTarget = s => s.players.find(p => p.club > 0 && G.canRelease(s, p.id) && G.askingPrice(s, p.id) < s.budget);

// Every division exposed by the career picker has a complete, duplicate-free club list.
assert.equal(new Set(G.LEAGUES.map(l => l.country)).size, 12);
assert.equal(G.LEAGUES.length, 36);
assert(G.LEAGUES.every(l => l.tier >= 1 && l.tier <= 3));
assert.equal(new Set(G.LEAGUES.flatMap(l => l.teams)).size, G.LEAGUES.reduce((n, l) => n + l.teams.length, 0));
const expectedCounts = { ENGLAND: [20, 24, 24], SPAIN: [20, 22, 40], GERMANY: [18, 18, 20], ITALY: [20, 20, 60], FRANCE: [18, 18, 18], PORTUGAL: [18, 15, 19], NETHERLANDS: [18, 20, 18], BELGIUM: [18, 15, 16], TURKEY: [18, 20, 36], SCOTLAND: [12, 10, 10], BRAZIL: [20, 20, 20], KOREA: [12, 17, 15] };
for (const [country, counts] of Object.entries(expectedCounts)) {
  const divisions = G.LEAGUES.filter(l => l.country === country).sort((a, b) => a.tier - b.tier);
  assert.deepEqual(divisions.map(l => l.tier), [1, 2, 3]);
  assert.deepEqual(divisions.map(l => l.teams.length), counts);
}
const leagueOf = (country, tier) => G.LEAGUES.find(l => l.country === country && l.tier === tier);
assert(leagueOf('ENGLAND', 1).teams.includes('선덜랜드'));
assert(leagueOf('ENGLAND', 3).teams.includes('레스터 시티'));
assert(!leagueOf('ENGLAND', 2).teams.includes('레스터 시티'));
assert(leagueOf('KOREA', 1).teams.includes('FC 안양'));
assert.equal(leagueOf('KOREA', 2).teams.length, 17);

let s = G.newGame(42, G.CLUBS.findIndex(c => c[0] === 'FC 서울'));
assert.equal(s.clubs[0].name, 'FC 서울');
assert.equal(s.leagues[0].flag, 'KR');
assert.equal(s.players.length, 15994);
assert.equal(s.clubs.length, 727);
assert.equal(new Set(s.clubs.map(c => c.name)).size, 727);
assert.equal(s.fixtures.length, 46);
for (const fixtures of s.fixtures) {
  assert(fixtures.every(([h, a]) => s.clubs[h].league === s.clubs[a].league));
}
for (const [leagueIndex, league] of s.leagues.entries()) {
  const ids = s.clubs.filter(c => c.league === leagueIndex).map(c => c.id);
  assert.equal(ids.length, league.teams.length);
  const games = s.fixtures.flat().filter(([h, a]) => ids.includes(h) && ids.includes(a));
  const expectedGames = league.groupSizes ? league.groupSizes.reduce((n, size) => n + size * (size - 1), 0) : league.teams.length * (league.teams.length - 1);
  assert.equal(games.length, expectedGames);
}
const pairs = s.fixtures.flat().map(([h, a]) => `${h}-${a}`);
assert.equal(new Set(pairs).size, 12686);
for (const [clubName, playerName] of [['선덜랜드', 'Granit Xhaka'], ['레스터 시티', 'Jakub Stolarczyk'], ['FC 안양', '권경원']]) {
  const club = s.clubs.find(c => c.name === clubName);
  assert(club && G.roster(s, club.id).some(p => p.name === playerName));
}
valid(s);

// Negotiation rejection must never mutate money, ownership, or lineup.
let target = findTarget(s), before = JSON.stringify(s);
assert.equal(G.deal(s, target.id, -1).ok, false);
assert.equal(G.deal(s, target.id, NaN).ok, false);
assert.equal(G.deal(s, target.id, s.budget + 1).ok, false);
assert.equal(G.deal(s, target.id, 0).ok, false);
assert.equal(JSON.stringify(s), before);
let budget = s.budget, price = G.askingPrice(s, target.id);
assert(G.deal(s, target.id, price).ok);
assert.equal(s.budget, budget - price);
assert.equal(target.club, 0);
assert.equal(G.roster(s).length, 23);
valid(s);

// Trades conserve all players and record the actual cash movement.
target = findTarget(s);
const swap = G.roster(s).find(p => G.canRelease(s, p.id)), seller = target.club;
price = Math.max(0, G.askingPrice(s, target.id) - Math.floor(G.value(swap) * .85));
budget = s.budget;
assert(G.deal(s, target.id, price, swap.id).ok);
assert.equal(swap.club, seller); assert.equal(target.club, 0);
assert.equal(s.budget, Math.round((budget - price) * 100) / 100);
valid(s);

const loan = findTarget(s), owner = loan.club;
assert(G.deal(s, loan.id, Math.ceil(G.askingPrice(s, loan.id) * .2), null, true).ok);
assert.equal(loan.loan.owner, owner);
assert.equal(G.deal(s, loan.id, 1).ok, false);
const sold = G.newGame(9), offer = sold.incoming[0];
budget = sold.budget;
assert(G.acceptOffer(sold, offer.id).ok);
assert.equal(sold.budget, budget + offer.cash);
assert.equal(G.player(sold, offer.player).club, offer.club);
assert.equal(G.acceptOffer(sold, offer.id).ok, false);
valid(sold);

// Tactics alter the model; formation swaps keep 11 unique eligible players.
const a = G.strength(s, 0).attack;
G.setTactics(s, 'mentality', 1); assert(G.strength(s, 0).attack > a);
for (const f of Object.keys(G.FORMATIONS)) {
  G.setTactics(s, 'formation', f);
  assert.equal(new Set(s.clubs[0].lineup).size, 11);
  assert(s.clubs[0].lineup.every(id => G.player(s, id).club === 0));
}
const current = s.clubs[0].lineup[0], replacement = s.clubs[0].lineup[1];
assert(G.setLineup(s, 0, replacement)); assert.equal(s.clubs[0].lineup[1], current);
assert.equal(G.setLineup(s, 0, 999999), false);
s.clubs[0].lineup = G.autoLineup(s);

// Scouting, contracts, conversations, youth, and facilities spend funds once.
const candidate = findTarget(s);
assert(G.scout(s, candidate.id).ok); assert.equal(G.scout(s, candidate.id).ok, false);
assert(G.upgrade(s, 'facilities', 'training').ok);
const own = G.roster(s).find(p => !p.loan);
assert.equal(G.renew(s, own.id, 2, .01, 'rotation').ok, false);
assert(G.renew(s, own.id, 3, .4, 'key').ok);
assert.equal(own.promised, 'key');
assert(G.talk(s, own.id, 'encourage').ok); assert.equal(G.talk(s, own.id, 'encourage').ok, false);
assert(G.promote(s, s.academy[0].id).ok);
valid(s);

// Half-time persists, substitutions are bounded, and scores never regress.
const half = G.startMatch(s); assert.equal(s.week, 0);
assert.deepEqual(G.startMatch(s), half); valid(s);
for (let i = 0; i < 5; i++) {
  const incoming = G.roster(s).find(p => G.available(p) && !s.clubs[0].lineup.includes(p.id) && !s.pending.removed.includes(p.id));
  assert(G.substitute(s, s.clubs[0].lineup[i], incoming.id).ok);
}
assert.equal(G.substitute(s, s.clubs[0].lineup[0], current).ok, false);
assert.equal(G.deal(s, candidate.id, 100).ok, false);
G.setTactics(s, 'press', 0); G.setTactics(s, 'tempo', 2);
let match = G.playWeek(s);
assert(match.hg >= half.hg && match.ag >= half.ag);
assert.equal(s.pending, null); assert.equal(s.week, 1);
assert(s.clubs.every(c => c.played <= 1)); valid(s);

// Full leagues, injuries, wages, loan returns, expired contracts and multiple seasons.
const expiry = G.roster(s).find(p => !p.loan && p.id !== own.id); expiry.contract = 2027;
for (let season = 0; season < 3; season++) {
  while (s.week < s.totalWeeks) {
    s.clubs[0].lineup = G.autoLineup(s);
    G.playWeek(s);
    assert(s.clubs.every(c => c.played <= Math.min(s.week, 2 * (s.leagues[c.league].teams.length - 1))));
    assert(s.players.every(p => p.fitness >= 35 && p.fitness <= 100));
    valid(s);
  }
  assert.equal(s.results.length, 12686);
  assert(s.competitions.every(c => c.phase === 'complete' && Number.isInteger(c.winner)));
  assert.equal(s.competitions.find(c=>c.id==='champions').results.length, 111);
  assert(s.competitions.filter(c=>c.kind==='domestic').every(c=>c.results.length===c.participants.length-1));
  assert.equal(s.honors.length, (season+1)*14);
  assert.equal(s.clubs.reduce((n, c) => n + c.gf, 0), s.clubs.reduce((n, c) => n + c.ga, 0));
  const final = JSON.stringify(s); assert.equal(G.playWeek(s), null); assert.equal(JSON.stringify(s), final);
  assert(G.nextSeason(s)); valid(s);
  assert.equal(s.promotionNews.length,96);
  assert(s.leagues.every((l,i)=>s.clubs.filter(c=>c.league===i).length===l.teams.length));
  if (season === 0) { assert.equal(loan.club, owner); assert.equal(loan.loan, null); assert.equal(expiry.club, -1); }
}
const invalid = clone(s); invalid.clubs[0].lineup[0] = -999;
assert.equal(G.validSave(invalid), false);
invalid.clubs[0].lineup = s.clubs[0].lineup; invalid.results = [{ h: 999 }];
assert.equal(G.validSave(invalid), false);
const lower=G.newGame(82,G.CLUBS.findIndex(c=>c[0]==='볼턴'));
assert.equal(lower.leagues[0].tier,3);
assert(lower.competitions.find(c=>c.kind==='domestic'&&c.participants.includes(0)).participants.length===68);
assert(!lower.competitions.find(c=>c.id==='champions').participants.includes(0));
while(lower.week<lower.totalWeeks) G.playWeek(lower);
// Force a clear league-winning ranking to verify controlled-club promotion remaps its league safely.
lower.clubs[0].pts=999; G.nextSeason(lower);
assert.equal(lower.leagues[0].tier,2); assert.equal(lower.clubs[0].league,0); valid(lower);
assert(lower.promotionNews.some(n=>n.club===0&&n.promoted));
console.log('PASS: 36 leagues / 727 clubs / 15,994 players, all 12 nations with three tiers and real-format team counts, refreshed 2026/27 placements and seeded rosters, transfers, trades, loans, contracts, scouting, tactics, half-time, substitutions, youth, finances, 3 complete seasons, 14 cups, 32-team European groups and knockouts, promotion/relegation, save validation.');
