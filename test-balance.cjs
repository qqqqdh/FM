'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const G = require('./engine.js');
const copy = x => JSON.parse(JSON.stringify(x));
const s = G.newGame(42);
const sample = (rating, age = 26) => ({id:1, pos:'FW', atk:rating, def:rating, tech:rating, pace:rating, age});
assert(G.value(sample(85)) > G.value(sample(75)) * 4);
assert(G.marketWage(sample(85)) > G.marketWage(sample(75)) * 2);

// Five immediate youth sales cannot fund even one established OVR 75 player.
let sales = 0;
for (const id of s.academy.map(p => p.id)) {
  assert(G.promote(s, id).ok);
  const p = G.player(s, id), offer = G.getTransferOffers(s, id).sort((a,b) => b.cash-a.cash)[0];
  assert.equal(G.prospectFactor(p), .25);
  const before = s.budget;
  assert(!G.sellPlayer(s, id, offer.club, 99999).ok);
  assert.equal(s.budget, before);
  assert(G.sellPlayer(s, id, offer.club, offer.cash).ok);
  sales += offer.cash;
}
assert(sales < G.value(sample(75)));
const youth = s.players.at(-1), unproven = G.value(youth);
youth.history = [{appearances:10, minutes:900}]; youth.cupMinutes = 450;
assert.equal(G.prospectFactor(youth), .625);
youth.cupMinutes += 1350;
assert.equal(G.prospectFactor(youth), 1);
assert(G.value(youth) > unproven * 3);

// Cup rewards are deliberately unchanged, including group draws and finals.
for (const [id, kind, win, draw, semi, champion] of [
  ['champions','europe',30,10,200,300], ['europa','europe',10,3.5,80,150],
  ['afc-champions','asia',3,1,15,140], ['club-world-cup','world',40,15,250,500],
  ['domestic','domestic',0,0,12,30], ['league-cup','league-cup',0,0,15,40]
]) {
  const cup = {id,kind,phase:'groups'};
  assert.equal(G.cupMatchPrize(cup,'조별리그',true,false),win);
  assert.equal(G.cupMatchPrize(cup,'조별리그',false,true),draw);
  cup.phase = 'knockout';
  assert.equal(G.cupMatchPrize(cup,'준결승',true,false),semi);
  assert.equal(G.cupMatchPrize(cup,'결승',true,false),0);
  assert.equal(G.cupWinnerPrize(cup),champion);
}

// Identical ability, different performance: a bench veteran can accept a pay cut.
const p = G.roster(s).find(p => p.pos === 'FW');
Object.assign(p, sample(75,31), {id:p.id, club:0, contract:s.season+1, salary:.4, appearances:1, goals:0, history:[]});
p.leagueStats = {matches:1,starts:0,minutes:90,goals:0,assists:0,shots:0,onTarget:0,cleanSheets:0};
Object.assign(s.clubs[0], {played:20,pts:12,ga:35});
const low = G.contractDemand(s,p,3,'rotation');
assert(low.salary < p.salary);
assert(low.salary < G.contractDemand(s,p,1,'rotation').salary,'veteran values job security');
const before = JSON.stringify(s);
assert(!G.renew(s,p.id,3,low.salary-.01,'rotation').ok);
assert.equal(JSON.stringify(s), before,'rejected renewal must be atomic');
s.budget = low.bonus-.01;
assert(!G.renew(s,p.id,3,low.salary,'rotation').ok);
s.budget = 500;
assert(G.renew(s,p.id,3,low.salary,'rotation').ok);
assert.equal(p.salary,low.salary);
assert.equal(p.contract,s.season+3);
assert.equal(s.budget,500-low.bonus);
assert.equal(G.contractDemand(s,p,3,'rotation').salary,low.salary,'repeating a negotiation cannot compound a discount');
p.appearances=20; Object.assign(p.leagueStats,{matches:20,starts:20,minutes:1800,goals:20,assists:8});
const star = G.contractDemand(s,p,3,'rotation');
assert(star.salary > low.salary);
s.clubs[0].pts=52;
assert(G.contractDemand(s,p,3,'rotation').salary > star.salary,'team success must affect demands');
p.age=21; p.contract=s.season+1;
assert(G.contractDemand(s,p,4,'rotation').salary > G.contractDemand(s,p,1,'rotation').salary,'young stars price long commitments');
assert(G.contractDemand(s,p,4,'key').salary < G.contractDemand(s,p,4,'rotation').salary);
// Previous season remains relevant in August, with no fabricated old match statistics.
p.history=[{season:s.season-1,clubGames:38,appearances:38,minutes:3420,goals:25,assists:8}];
s.clubs[0].lastSeason={season:s.season-1,played:38,pts:80,ga:30}; s.clubs[0].played=0;
assert.equal(G.contractDemand(s,p).source,'지난 시즌');
assert.equal(G.contractDemand(s,p).minutes,3420);

const fresh = G.newGame(99);
const old = copy(fresh); delete old.facilities.stadium; delete old.facilities.recovery; delete old.economyVersion;
assert(G.validSave(old));
const budget = old.budget;
G.upgradeSave(old); assert.equal(old.budget,budget); assert.deepEqual(G.upgradeSave(copy(old)),old);
for (const filename of ['touchline-2028-R3.json','touchline-2029-R20.json']) {
  const saved = JSON.parse(fs.readFileSync(filename,'utf8'));
  const balance = saved.budget, players = saved.players.length;
  assert(G.validSave(saved),filename);
  G.upgradeSave(saved);
  assert(G.validSave(saved)); assert.equal(saved.budget,balance); assert.equal(saved.players.length,players);
}
fresh.budget=10000;
for (const key of ['recovery','stadium']) {
  for (let level=0;level<5;level++) {
    const cost=G.upgradeCost(fresh,'facilities',key), money=fresh.budget, upkeep=G.facilityUpkeep(fresh);
    assert(G.upgrade(fresh,'facilities',key).ok);
    assert.equal(fresh.budget,money-cost); assert(G.facilityUpkeep(fresh)>upkeep);
  }
  assert(!G.upgrade(fresh,'facilities',key).ok);
}
assert(G.validSave(copy(fresh)));
const ai = fresh.players.filter(p=>p.club>0 && p.age<=23 && G.ovr(p)<p.potential);
const sum = () => ai.reduce((n,p)=>n+p.atk+p.def+p.tech+p.pace,0);
const initial = sum();
G.autoWeek(fresh);
assert(sum()>initial,'AI must train during the same weekly progression');
assert(fresh.ledger.some(l=>l.label==='시설 주간 운영비' && l.amount===-G.facilityUpkeep(fresh)));
assert(G.validSave(copy(fresh)));
fresh.facilities.youth=5; fresh.week=fresh.totalWeeks;
assert(G.nextSeason(fresh));
assert(fresh.academy.reduce((n,p)=>n+Math.ceil(G.value(p)*1.3),0)<G.value(sample(75))*2,'max-level academy still requires development');
assert.deepEqual(G.upgradeSave(copy(fresh)),fresh,'new-season recruits must round-trip unchanged');
const legacyYouth=fresh.academy[0]; delete legacyYouth.history; delete legacyYouth.transferListed;
assert(G.promote(fresh,legacyYouth.id).ok);
assert.deepEqual(G.upgradeSave(copy(fresh)),fresh,'legacy academy promotion must round-trip unchanged');
console.log(`PASS: five youth sales ${sales}억; player prices, unchanged cups, performance/term negotiations, facilities, AI training, both legacy saves.`);
