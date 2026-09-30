'use strict';
const assert = require('node:assert/strict');
const G = require('./engine.js');
const copy = s => JSON.parse(JSON.stringify(s));
const check = s => { assert(G.validSave(copy(s))); assert(require('node:util').isDeepStrictEqual(G.upgradeSave(copy(s)),copy(s)),'save migration changes current data'); };
const s = G.newGame(42); s.budget=10000;
const youth=s.academy[0], id=youth.id, age=youth.age;
const offer=G.loanOffers(s,id)[0], before=JSON.stringify(s);
const counter=G.loanOut(s,id,offer.club,99999);
assert(!counter.ok&&counter.purchaseCounter>0);
assert.equal(JSON.stringify(s),before,'rejected option cannot move money or player');
assert(G.loanOut(s,id,offer.club,counter.purchaseCounter).ok);
assert.equal(s.budget,10000+offer.fee);
assert.equal(youth.loan.purchasePrice,counter.purchaseCounter);
assert(!s.academy.some(p=>p.id===id)); assert(G.player(s,id));
assert(!G.exerciseLoanOption(s,id).ok,'only borrower decides whether to buy');
assert(!G.deal(s,id,10000).ok,'cannot buy or reloan an already loaned player');
check(s);
// A loan without purchase clause returns to the academy and retains real appearances.
youth.loan.purchasePrice=null; youth.appearances=4;
youth.leagueStats={matches:4,starts:4,minutes:360,goals:0,assists:0,shots:0,onTarget:0,cleanSheets:2};
s.week=s.totalWeeks; G.nextSeason(s);
assert(s.academy.includes(youth)); assert.equal(youth.age,age+1);
assert.equal(youth.history.at(-1).club,offer.club);
assert.equal(s.academy.length,10); assert(!G.player(s,id)); check(s);
// Four callups leave one older youth plus the next intake of five.
const a=G.newGame(44);a.budget=10000;
for(const p of a.academy.slice(0,4)) {
  assert(G.promote(a,p.id).ok);
  assert(G.sellPlayer(a,p.id,G.getTransferOffers(a,p.id)[0].club,G.value(p)).ok);
}
const retained=a.academy[0]; a.week=a.totalWeeks;G.nextSeason(a);
assert.equal(a.academy.length,6);assert(a.academy.includes(retained));check(a);
retained.age=22; a.week=a.totalWeeks; G.nextSeason(a);
assert.equal(retained.age,23);assert(!a.academy.includes(retained));assert(G.player(a,retained.id));assert.notEqual(retained.club,0);check(a);
// AI generates external offers and honors the offered FA salary and duration.
const wanted=G.roster(a).find(p=>G.ovr(p)>=80&&G.canRelease(a,p.id));
G.roster(a).forEach(p=>{p.contract=a.season+4;delete p.contractOffer;});
wanted.contract=a.season+1;wanted.salary=.1;
for(let i=0;i<30&&!G.outsideOffer(a,wanted);i++)G.aiContractMarket(a);
assert(G.outsideOffer(a,wanted),'a suitable expiring player attracts an external offer');
const outside={...wanted.contractOffer};assert(G.toggleTransferList(a,wanted.id).ok);assert(G.terminateContract(a,wanted.id).ok);
for(let i=0;i<30&&wanted.club===-1;i++)G.aiContractMarket(a);
assert(!a.transferList.includes(wanted.id));assert(!wanted.transferListed);assert.equal(wanted.club,outside.club);assert.equal(wanted.salary,outside.salary);assert.equal(wanted.contract,a.season+outside.years);check(a);
// Old saves infer tenure only from uninterrupted known club history.
const old=copy(a), veteran=G.roster(old)[0];delete veteran.joinedAt;delete veteran.joinedClub;
veteran.history=[{season:old.season-2,club:0},{season:old.season-1,club:0}];
G.upgradeSave(old);assert(G.loyalty(old,veteran)>=20);check(old);
// Incoming option is negotiated, then fixed even if market value changes.
const target=s.players.find(p=>p.club>0&&!p.loan&&G.canRelease(s,p.id)&&G.askingPrice(s,p.id)>5);
const from=target.club,fee=Math.ceil(G.askingPrice(s,target.id)*.2),salary=G.wageDemand(s,target).salary;
const rejected=JSON.stringify(s),r=G.deal(s,target.id,fee,null,true,salary,.1);
assert(!r.ok&&r.purchaseCounter);assert.equal(JSON.stringify(s),rejected);
assert(G.deal(s,target.id,fee,null,true,salary,r.purchaseCounter).ok);check(s);
target.atk+=1;const cash=s.budget;
assert(G.exerciseLoanOption(s,target.id).ok);assert.equal(s.budget,cash-r.purchaseCounter);
assert.equal(target.loan,null);assert.equal(target.joinedClub,0);assert.equal(G.loyalty(s,target),0);
assert(!G.exerciseLoanOption(s,target.id).ok);check(s);
// AI can exercise outgoing agreed options, but a pure loan stays a loan.
const outgoing=G.roster(s).find(p=>!p.loan&&G.canRelease(s,p.id)&&G.loanOffers(s,p.id).length);
outgoing.contract=s.season+4;const buyer=G.loanOffers(s,outgoing.id)[0];
assert(G.loanOut(s,outgoing.id,buyer.club,1).ok);const loanBudget=s.budget;
for(let i=0;i<60&&outgoing.loan;i++)G.aiContractMarket(s);
assert.equal(outgoing.loan,null);assert.equal(outgoing.club,buyer.club);assert.equal(s.budget,loanBudget+1);check(s);
// AI recruits affordable FA, leaves unsuitable or expensive players unemployed.
const free=s.players.find(p=>p.club>0&&!p.loan&&G.ovr(p)>80);
free.club=-1;free.joinedClub=-1;free.freeSince=s.season*52+s.week;free.salary=.1;
const weak=s.players.find(p=>p.club>0&&!p.loan&&p!==free);
Object.assign(weak,{club:-1,joinedClub:-1,atk:40,def:40,tech:40,pace:40,potential:40,freeSince:s.season*52+s.week,salary:20});
for(let i=0;i<20&&free.club===-1;i++)G.aiContractMarket(s);
assert(free.club>0);assert.equal(weak.club,-1);
const initialDemand=G.wageDemand(s,weak).salary;s.week=10;assert(G.wageDemand(s,weak).salary<initialDemand);
const fa=s.players.find(p=>p.club>0&&!p.loan&&G.canRelease(s,p.id));fa.club=-1;
assert(!G.windowOpen(s)); assert(G.deal(s,fa.id,0,null,false,G.wageDemand(s,fa).salary).ok);
// Loyalty offsets external wage competition; it cannot be erased by an immediate second renewal.
const loyal=G.roster(s).find(p=>!p.loan);loyal.contract=s.season+1;loyal.joinedClub=0;loyal.joinedAt=(s.season-6)*52;
const base=G.contractDemand(s,loyal,3).salary;
loyal.contractOffer={club:from,salary:base*2,years:3,expires:s.season*52+s.week+6};
const d=G.contractDemand(s,loyal,3);assert(d.salary>base);assert(d.salary<loyal.contractOffer.salary);
assert(G.renew(s,loyal.id,3,d.salary,'rotation').ok);assert(!G.renew(s,loyal.id,3,base,'rotation').ok);check(s);
// Optional summer ticks charge wages, do not advance matches, and preserve summer loans next season.
s.week=s.totalWeeks;s.summerWeek=0;
const summerYouth=s.academy.find(p=>G.loanOffers(s,p.id).length);const summerAge=summerYouth.age;
assert(G.loanOut(s,summerYouth.id,G.loanOffers(s,summerYouth.id)[0].club).ok);
const until=summerYouth.loan.until;assert.equal(until,s.season+2);
for(let i=0;i<4;i++){const cash=s.budget;assert(G.advanceSummerWeek(s).ok);assert(s.budget<cash);assert.equal(s.week,s.totalWeeks);}
assert(!G.advanceSummerWeek(s).ok);assert(!G.windowOpen(s));check(s);
G.nextSeason(s);assert.equal(s.summerWeek,0);assert(summerYouth.loan);assert.equal(summerYouth.age,summerAge+1);check(s);
summerYouth.age=22;s.week=s.totalWeeks;G.nextSeason(s);
assert.equal(summerYouth.loan,null);assert.equal(summerYouth.age,23);assert.notEqual(summerYouth.club,0);assert(!s.academy.includes(summerYouth));check(s);
const bad=copy(s);bad.players[0].loan={owner:1,until:s.season+1,purchasePrice:-1};assert(!G.validSave(bad));
console.log('PASS: summer, FA recruitment, external offers, loyalty, academy retention/age23, negotiated loan options, returns and save migration.');
