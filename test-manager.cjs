'use strict';
const assert=require('node:assert/strict'), G=require('./engine.js');
const copy=s=>JSON.parse(JSON.stringify(s));
const s=G.newGame(519);
assert.equal(Object.keys(G.DETAILS).length,14);
const old=copy(s); delete old.instructions;
old.players.forEach(p=>{delete p.position;delete p.attributes;delete p.foot;delete p.ambition;});
assert(G.validSave(old)); G.upgradeSave(old); assert(G.validSave(old));
assert.equal(old.players.length,s.players.length);
assert.deepEqual(G.upgradeSave(copy(old)),old,'migration must be idempotent');
const bad=copy(s);bad.players[0].attributes.passing=NaN;assert(!G.validSave(bad));
const tired={...s.players[5],position:'CB',fitness:35,atk:90,def:90,tech:90,pace:90};
const fresh={...tired,id:999,fitness:100,atk:76,def:76,tech:76,pace:76};
assert(G.lineupScore(fresh,'CB')>G.lineupScore(tired,'CB'));
s.players.find(p=>p.club===0 && p.pos!=='GK').injury=4;
const lineup=G.autoLineup(s);assert.equal(new Set(lineup).size,11);
assert(lineup.every(id=>G.available(G.player(s,id))));
assert.equal(G.player(s,lineup[0]).position,'GK');
for(const sort of ['priceAsc','priceDesc','ovr','stat']) {
  const ps=G.filterPlayers(s,{sort,position:'ST',foot:'left',stat:'finishing',minStat:40,maxPrice:90,minOvr:50});
  assert(ps.length>1);
  const score=p=>sort.startsWith('price')?G.askingPrice(s,p.id):sort==='stat'?p.attributes.finishing:G.ovr(p);
  ps.forEach((p,i)=>{assert.equal(p.position,'ST');assert.equal(p.foot,'left');assert(G.askingPrice(s,p.id)<=90);if(i)assert(sort==='priceAsc'?score(ps[i-1])<=score(p):score(ps[i-1])>=score(p));});
}
const lower=G.newGame(14,G.CLUBS.findIndex(c=>G.LEAGUES[c[4]].tier===3));lower.budget=9999;
const target=lower.players.find(p=>p.club>0 && lower.leagues[lower.clubs[p.club].league].tier===1 && G.canRelease(lower,p.id));
const demand=G.wageDemand(lower,target), before=JSON.stringify(lower);
assert(demand.salary>G.wage(target));
assert.equal(G.deal(lower,target.id,G.askingPrice(lower,target.id),null,false,G.wage(target)).ok,false);
assert.equal(JSON.stringify(lower),before,'rejected salary must not move money or ownership');
assert(G.deal(lower,target.id,G.askingPrice(lower,target.id),null,false,demand.salary).ok);
assert.equal(target.salary,demand.salary);assert.equal(target.club,0);
const first=G.startMatch(s);assert.equal(s.pending.minute,0);assert.equal(first.hg+first.ag,0);
const baseline=G.strength(s,0), positions=G.matchPositions(s,0);
assert(G.setInstruction(s,1,'movement','invert'));assert(G.setInstruction(s,1,'runs','forward'));
assert(!G.setInstruction(s,13,'movement','invert'));assert(!G.setInstruction(s,1,'movement','nonsense'));
assert.notDeepEqual(G.strength(s,0),baseline);
assert.notDeepEqual(G.matchPositions(s,0),positions);
assert(G.matchPositions(s,9).every(p=>p.x>=0&&p.x<=100&&p.y>=0&&p.y<=100));
const startIds=s.clubs[0].lineup.slice(); G.setTactics(s,'formation','5-3-2'); assert.deepEqual(s.clubs[0].lineup,startIds);
for(let i=0;i<45;i++)G.advanceMinute(s);
assert.equal(s.week,0);assert.equal(s.pending.minute,45);assert(G.validSave(copy(s)));
const snapshot=copy(s), homeGoals=s.pending.half.hg;
const bench=G.roster(s).find(p=>!startIds.includes(p.id)&&G.available(p));
assert(G.substitute(s,startIds[1],bench.id).ok);assert(!G.substitute(s,bench.id,startIds[1]).ok);
for(let i=45;i<90;i++)G.advanceMinute(s);
assert.equal(G.advanceMinute(s),null);assert(s.pending.half.hg>=homeGoals);
assert(s.pending.half.events.every(e=>e.minute>=1&&e.minute<=90));
const finished=copy(s.pending.half); G.playWeek(s);
assert.equal(s.week,1);assert.equal(s.pending,null);assert.deepEqual(s.lastMatch,finished);assert(G.validSave(copy(s)));
const replay=copy(snapshot);G.playWeek(snapshot);G.playWeek(replay);assert.deepEqual(snapshot,replay,'saved minute and RNG resume deterministically');
for(let i=0;i<3;i++){const week=s.week;assert(G.autoWeek(s));assert.equal(s.week,week+1);assert(G.validSave(copy(s)));}
assert.equal(s.cupPlan.rotation,false,'batch must restore cup preference');
// A bye recovers fitness/injuries without serving a match suspension or inventing a result.
const bye=G.newGame(72,G.CLUBS.findIndex(c=>G.LEAGUES[c[4]].country==='KOREA'&&G.LEAGUES[c[4]].tier===2));
assert.equal(G.nextFixture(bye),undefined);
const resting=G.roster(bye)[0];resting.fitness=50;resting.injury=3;resting.banned=1;
const aiResting=bye.players.find(p=>p.club>0 && !bye.fixtures[0].some(pair=>pair.includes(p.club)));
aiResting.fitness=50;aiResting.injury=3;
assert(G.autoWeek(bye).rest);
assert.equal(bye.clubs[0].played,0);assert.equal(resting.injury,2);assert.equal(resting.fitness,65);assert.equal(resting.banned,1);
assert.equal(aiResting.injury,2);assert.equal(aiResting.fitness,65);
assert(G.nextFixture(bye));assert(!G.autoWeek(bye).rest);assert.equal(bye.clubs[0].played,1);
// Phase targets and named plans persist, reject invalid inputs, and affect the model.
const tactics=G.newGame(901), strengthBefore=G.strength(tactics,0);
assert(G.setTarget(tactics,1,'attack',88,12));assert(G.setTarget(tactics,1,'defend',18,30));
assert.deepEqual(G.tacticalPosition(tactics,0,1,'attack'),{x:88,y:12});
assert.deepEqual(G.tacticalPosition(tactics,0,1,'defend'),{x:18,y:30});
assert.notDeepEqual(G.strength(tactics,0),strengthBefore);
assert(!G.setTarget(tactics,1,'attack',NaN,10));assert(!G.setTarget(tactics,11,'attack',50,50));
for(const [field,value] of Object.entries({dribbling:'takeOn',shooting:'often',crossing:'low',marking:'cover'}))assert(G.setInstruction(tactics,1,field,value));
assert(G.tacticPlan(tactics,0,'save','왼쪽 오버랩'));
const plan=copy(tactics.tacticPlans[0]);G.setTarget(tactics,1,'attack',30,50);G.setInstruction(tactics,1,'shooting','patient');
assert(G.tacticPlan(tactics,0,'load'));assert.deepEqual(tactics.instructions,plan.instructions);
assert(G.validSave(copy(tactics)));const invalidPlan=copy(tactics);invalidPlan.tacticPlans[0].instructions[1].attackX=NaN;assert(!G.validSave(invalidPlan));
const legacyInstructions=copy(tactics);legacyInstructions.instructions.forEach(i=>{for(const k of ['dribbling','shooting','crossing','marking','attackX','attackY','defendX','defendY'])delete i[k];});
assert(G.validSave(legacyInstructions));assert.equal(G.upgradeSave(legacyInstructions).instructions[0].shooting,'balanced');
const filtered=G.filterPlayers(tactics,{minAge:20,maxAge:24,maxWage:.16,maxContract:2,minFitness:95,status:'fit',stat:'passing',minStat:50,stat2:'vision',minStat2:50,sort:'wage'});
assert(filtered.length>0);filtered.forEach((p,i)=>{assert(p.age>=20&&p.age<=24&&G.wage(p)<=.16&&p.contract-tactics.season<=2&&p.fitness>=95&&G.available(p)&&p.attributes.passing>=50&&p.attributes.vision>=50);if(i)assert(G.wage(filtered[i-1])<=G.wage(p));});
// Recorded minutes respect substitutions; goals, shots and assists reconcile to the result.
assert.equal(finished.playerStats[startIds[1]].minutes,45);assert.equal(finished.playerStats[bench.id].minutes,45);
assert.equal(finished.playerStats[bench.id].starts,0);
assert.equal(Object.entries(finished.playerStats).filter(([id])=>G.player(s,id).club===0).reduce((n,[,p])=>n+p.minutes,0),990);
for(const [side,cid] of [finished.h,finished.a].entries()){
  const stats=Object.entries(finished.playerStats).filter(([id])=>G.player(s,id).club===cid).map(([,p])=>p);
  assert.equal(stats.reduce((n,p)=>n+p.goals,0),side?finished.ag:finished.hg);
  assert.equal(stats.reduce((n,p)=>n+p.shots,0),finished.shots[side]);
  assert(stats.every(p=>p.shots>=p.onTarget&&p.onTarget>=p.goals));
}
assert.equal(s.players.reduce((n,p)=>n+(p.leagueStats?.goals||0),0),s.results.reduce((n,m)=>n+m.hg+m.ag,0));
assert.equal(Object.values(finished.playerStats).reduce((n,p)=>n+p.assists,0),finished.events.filter(e=>e.assist).length);
// Watching and assistant simulation resolve our fixture through the same minute model.
const automatic=copy(tactics), watched=copy(tactics);
watched.clubs[0].lineup=G.autoLineup(watched);watched.cupPlan.rotation=true;
G.startMatch(watched);const watchedMatch=G.playWeek(watched), automaticMatch=G.autoWeek(automatic);
assert.deepEqual(automaticMatch,watchedMatch);assert.equal(automatic.seed,watched.seed);
console.log('PASS: migration, detailed stats, fitness selection, position/foot/price/stat filters, ambition salary rejection/payment, instructions, live minutes, substitutions, replay, batch progression.');
