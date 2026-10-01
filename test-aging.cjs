'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), G = require('./engine.js');
const copy = x => JSON.parse(JSON.stringify(x));
const s = G.newGame(42), core = ['atk','def','tech','pace'];
for(const [age,physical] of [[29,0],[30,1],[31,1],[32,3],[34,3],[35,6],[37,6],[38,8]]) {
  assert.equal(G.agingLoss({pos:'DF',age}).physical,physical);
  assert.deepEqual(G.agingLoss({pos:'GK',age:age+1}),G.agingLoss({pos:'DF',age}));
}
G.roster(s).forEach(p => { p.contract = 2060; });
function rated(p, age, rating) {
  Object.assign(p,{age,potential:110,contract:2060,fitness:100,injury:0});
  core.forEach(k => { p[k] = rating; });
  Object.keys(p.attributes).forEach(k => { p.attributes[k] = rating; });
  return p;
}
const veterans = ['GK','DF','MF','FW'].map(pos => rated(G.roster(s).find(p => p.pos === pos),34,95));
const young = rated(G.roster(s).find(p => p.pos==='DF' && !veterans.includes(p)),20,82);
const old = veterans.find(p => p.pos==='DF');
young.position = old.position;
const ai = rated(G.roster(s,1).find(p => p.pos==='DF'),34,95);
const injured = G.roster(s).find(p => !veterans.includes(p) && p!==young);
injured.injury = 20; injured.fitness = 60;
assert(G.lineupScore(old,old.position)>G.lineupScore(young,young.position));
const unchanged = JSON.stringify(veterans);
G.upgradeSave(s); G.upgradeSave(s);
assert.equal(JSON.stringify(veterans),unchanged,'load must not repeatedly age or nerf existing players');
const trail = [];
for(let year=0;year<4;year++) {
  s.week=s.totalWeeks; assert(G.nextSeason(s));
  trail.push(veterans.map(p => ({pos:p.pos,age:p.age,ovr:G.ovr(p)})));
  assert(veterans.every(p => p.club===0 && !p.retired),'retirement still requires approval');
  assert(G.validSave(copy(s)));
  if(year===0) {
    assert.equal(injured.injury,14,'new season only advances six offseason weeks');
    assert(injured.fitness<=65,'ongoing rehab is not fully fit');
    assert.equal(old.attributes.acceleration,89);
    assert.equal(old.attributes.stamina,89);
    assert.equal(old.attributes.strength,89);
    assert.equal(old.attributes.reflexes,89);
    assert.equal(old.attributes.passing,93,'technical skills decline slower');
    core.forEach(k=>assert.equal(old[k],ai[k],'same aging for user and AI'));
    assert.equal(G.ovr(young),83,'young player still grows');
    assert(G.ovr(veterans[0])>G.ovr(old),'GK decline starts later');
  }
}
assert(veterans.filter(p=>p.pos!=='GK').every(p=>G.ovr(p)<85),'95 OVR field veterans drop below 85 by age 38');
assert(G.lineupScore(young,young.position)>G.lineupScore(old,old.position),'young player earns the place on ability');
assert(G.autoLineup(s).includes(young.id));
console.log('Annual OVR:',JSON.stringify(trail));

const health = G.newGame(77), p = G.roster(health)[0];
const duration = age => G.injuryDuration(health,{...p,age},5);
assert(duration(36)>duration(24));
assert(duration(39)>duration(36));
const untreated = duration(36); health.staff.medic=5; assert(duration(36)<untreated,'medics still help');
p.age=36; p.injury=3; p.fitness=60;
health.week=health.totalWeeks;
const skippedSummer=copy(health);
assert(G.nextSeason(skippedSummer));
for(let i=0;i<3;i++) assert(G.advanceSummerWeek(health).ok);
assert.equal(p.injury,0); assert(p.fitness<=75,'rehab ends below match fitness');
const recovered = p.fitness;
assert(G.advanceSummerWeek(health).ok);assert(p.fitness>recovered);
const completedSummer=copy(health);assert(G.nextSeason(completedSummer));
assert.equal(G.player(completedSummer,p.id).fitness,G.player(skippedSummer,p.id).fitness,'six recovery weeks are identical whether summer is played or skipped');
p.injury=20;
assert(G.nextSeason(health));assert.equal(p.injury,18,'summer weeks are not counted twice');
assert(G.validSave(copy(health)));

// Match/training progression must not restore the physical decline of 35+ players.
const training = G.newGame(22);
const oldSquad = G.roster(training).map(p => rated(p,36,90));
const stats = oldSquad.map(p=>core.map(k=>p[k]));
training.staff.coach=5;training.facilities.training=5;training.training='fitness';training.intensity=2;
for(let i=0;i<6;i++) G.autoWeek(training);
assert.deepEqual(oldSquad.map(p=>core.map(k=>p[k])),stats,'35+ cannot train away aging');
assert(G.validSave(copy(training)));

// Apply one ordinary season transition to a real legacy world, without editing the save file.
const saved=JSON.parse(fs.readFileSync('touchline-2035-R0-youth-fixed.json','utf8'));
G.upgradeSave(saved);
const cohort=saved.players.filter(p=>p.age>=35 && G.ovr(p)>=85), ratings=new Map(cohort.map(p=>[p.id,G.ovr(p)]));
saved.week=saved.totalWeeks;saved.pending=null;assert(G.nextSeason(saved));
assert(cohort.every(p=>G.ovr(p)<ratings.get(p.id)),'existing high-rated veterans also decline');
assert(G.validSave(copy(saved)));
console.log(`PASS: aging, physical attributes, youth selection, longer injuries, rehab, offseason, saves and ${cohort.length} legacy veterans.`);
