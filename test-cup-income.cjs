'use strict';
const assert=require('node:assert/strict'),G=require('./engine.js');
const copy=s=>JSON.parse(JSON.stringify(s));
const chosen=G.CLUBS.findIndex(c=>G.LEAGUES[c[4]].country==='KOREA'&&G.LEAGUES[c[4]].tier===1);
const base=G.newGame(92,chosen);base.facilities.stadium=3;
assert.equal(G.homeGate(base),11.75);
for(const kind of ['asia','europe','domestic','league-cup','world']) {
  const cup={kind,phase:'knockout',next:[[0,1],[2,3]]};
  const continental=['asia','europe'].includes(kind),neutral=kind==='world';
  const home=G.cupMatchIncome(base,cup,0,1),away=G.cupMatchIncome(base,cup,1,0);
  assert.equal(home.gate,neutral?0:continental?14.69:11.75);assert.equal(away.gate,0);
  assert.equal(home.broadcast,continental||neutral?4:2);assert.equal(home.broadcast,away.broadcast);
  assert.deepEqual(G.cupMatchIncome(base,cup,0,null),{broadcast:0,gate:0});
  assert.deepEqual(G.cupMatchIncome(base,cup,1,2),{broadcast:0,gate:0});
  cup.next=[[0,1]];assert(G.cupNeutral(cup));assert.equal(G.cupMatchIncome(base,cup,0,1).gate,0);
  cup.phase='groups';assert.equal(G.cupNeutral(cup),neutral,'a group match is not a final');
  const upgraded=copy(base);upgraded.facilities.stadium++;
  const delta=G.cupMatchIncome(upgraded,cup,0,1).gate-G.cupMatchIncome(base,cup,0,1).gate;
  assert.equal(Number(delta.toFixed(2)),neutral?0:continental?1.56:1.25);
}
// Exercise actual weekly settlement for an AFC group game, domestic semi-final,
// neutral league-cup final and neutral World Cup semi-final in the same week.
const setup=copy(base);setup.competitions.forEach(c=>c.nextWeek=null);
const afc=setup.competitions.find(c=>c.kind==='asia');
assert(afc.participants.includes(0));
const pair=afc.next.find(p=>p.includes(0));assert(pair);
pair.sort((a,b)=>a===0?-1:b===0?1:0);afc.nextWeek=1;
const selected=[afc];
for(const kind of ['domestic','league-cup','world']) {
  const cup=setup.competitions.find(c=>c.kind===kind&&(kind==='world'||c.participants.includes(0)));
  assert(cup,kind);const other=cup.participants.filter(id=>id!==0).slice(0,3);
  cup.phase='knockout';cup.next=kind==='league-cup'?[[0,other[0]]]:[[0,other[0]],[other[1],other[2]]];
  cup.round=cup.weeks.length-(kind==='league-cup'?1:2);cup.nextWeek=1;
  selected.push(cup);
}
for(const away of [false,true]) {
  const s=copy(setup),budget=s.budget;s.ledger=[];
  for(const original of selected) {
    const cup=s.competitions.find(c=>c.id===original.id),pair=cup.next.find(p=>p.includes(0));
    if(away)pair.reverse();
  }
  G.autoWeek(s);
  assert.equal(s.ledger.filter(l=>l.label==='선수 및 스태프 주급').length,1,'several cup games do not charge extra weeks of wages');
  for(const original of selected) {
    const cup=s.competitions.find(c=>c.id===original.id),m=cup.results.find(m=>m.h===0||m.a===0);
    assert(m&&m.income);const neutral=['league-cup','world'].includes(cup.kind);
    assert.equal(m.neutral,neutral);
    const expectedGate=away||neutral?0:cup.kind==='asia'?14.69:11.75;
    assert.equal(m.income.gate,expectedGate);
    const gateRows=s.ledger.filter(l=>l.label===`${cup.name} 홈구장 수입`);
    assert.equal(gateRows.length,expectedGate?1:0);if(expectedGate)assert.equal(gateRows[0].amount,expectedGate);
    assert.equal(s.ledger.filter(l=>l.label===`${cup.name} 방송권·참가 수입`).length,1);
    const won=m.winner===0||original.phase==='groups'&&(m.h===0?m.hg>m.ag:m.ag>m.hg);
    assert.equal(m.income.prize,G.cupMatchPrize(original,m.label,won,original.phase==='groups'&&m.hg===m.ag));
  }
  assert.equal(s.budget,Math.round((budget+s.ledger.reduce((n,l)=>n+l.amount,0))*100)/100);
  assert(G.validSave(copy(s)));
  const restored=G.upgradeSave(copy(s));assert.equal(restored.budget,s.budget);assert.deepEqual(restored.cupResults,s.cupResults);
  const invalid=copy(s);invalid.cupResults.find(m=>m.income).income.gate=-1;assert(!G.validSave(invalid));
}
console.log('PASS: AFC/Europe/domestic/league-cup/world venue rules, gate scaling, actual home/away/neutral settlement, no bye/duplicate payments, unchanged prizes and save round-trip.');
