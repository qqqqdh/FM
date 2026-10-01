'use strict';
const assert = require('node:assert/strict'), G = require('./engine.js');
const copy = s => JSON.parse(JSON.stringify(s));
const s = G.newGame(42); s.budget = 10000;
const seller = s.clubs.find(c => c.name === '대구 FC');
const target = G.roster(s,seller.id).find(p => G.canRelease(s,p.id));
const initial = G.clubMarketCapacity(s,seller), cash = s.budget;
const snapshot = JSON.stringify(s);
assert(!G.deal(s,target.id,0,null,false,G.wageDemand(s,target).salary).ok);
assert.equal(JSON.stringify(s),snapshot,'rejected offer moves no money');
assert(G.deal(s,target.id,3900,null,false,G.wageDemand(s,target).salary).ok);
assert.equal(s.budget,cash-3900);
assert.equal(G.clubMarketCapacity(s,seller).budget,initial.budget+3900);
assert.equal(G.clubMarketCapacity(s,seller).income,3900);
assert.equal(s.transfers[0].from,seller.id);
assert.equal(s.transfers[0].fee,3900);
const loaded = G.upgradeSave(copy(s));
G.upgradeSave(loaded);
assert.equal(G.clubMarketCapacity(loaded,loaded.clubs[seller.id]).budget,initial.budget+3900,'reload cannot credit twice');
assert(G.validSave(loaded));

// Income remains available after spending and is combined with the annual grant.
const spent = copy(s), spentClub = spent.clubs[seller.id];
spentClub.marketSpending.amount = 1000;
assert.equal(G.clubMarketCapacity(spent,spentClub).budget,initial.budget+2900);
G.manageAIFacilities(spent);
assert.equal(spentClub.marketSpending.income,3900,'facility spending preserves receipts');
const account = G.clubMarketCapacity(spent,spentClub);
assert.equal(account.budget,account.baseBudget+account.income-account.spent);
spent.season++;
assert.equal(G.clubMarketCapacity(spent,spentClub).income,0,'annual accounts reset together');
assert.equal(G.clubMarketCapacity(spent,spentClub).spent,0);

const loan = G.roster(s,seller.id).find(p => G.canRelease(s,p.id));
const option = G.askingPrice(s,loan.id), fee = Math.ceil(option*.2);
assert(G.deal(s,loan.id,fee,null,true,G.wageDemand(s,loan).salary,option).ok);
assert.equal(seller.marketSpending.income,3900+fee,'loan fee credits the owner');
assert(G.exerciseLoanOption(s,loan.id).ok);
assert.equal(seller.marketSpending.income,3900+fee+option,'option is a separate receipt');
assert(!G.exerciseLoanOption(s,loan.id).ok);
assert.equal(seller.marketSpending.income,3900+fee+option,'option cannot be credited twice');
assert(G.validSave(copy(s)));

// Swap credit is not cash income, including a zero-cash swap.
const trade = G.newGame(42); trade.budget = 10000;
const other = trade.clubs[1], swap = G.roster(trade).find(p => p.pos === 'MF' && G.canRelease(trade,p.id));
swap.salary = 100;
const bought = G.roster(trade,other.id).filter(p => G.canRelease(trade,p.id)).sort((a,b)=>G.value(a)-G.value(b))[0];
const paid = Math.max(0,G.askingPrice(trade,bought.id)-Math.floor(G.value(swap)*.85));
const base = G.clubMarketCapacity(trade,other).budget;
assert(G.deal(trade,bought.id,paid,swap.id,false,G.wageDemand(trade,bought).salary).ok);
assert.equal(G.clubMarketCapacity(trade,other).budget,base+paid);
assert.equal(G.clubMarketCapacity(trade,other).income,paid);
assert.equal(swap.club,other.id);

const legacy = copy(s); delete legacy.clubs[seller.id].marketSpending.income;
assert(G.validSave(legacy));
const legacyBudget = G.clubMarketCapacity(legacy,legacy.clubs[seller.id]).budget;
G.upgradeSave(legacy);
assert.equal(G.clubMarketCapacity(legacy,legacy.clubs[seller.id]).budget,legacyBudget,'legacy receipts are not guessed from names');
for (const amount of [-1, '3900', Infinity]) {
  const broken = copy(s); broken.clubs[seller.id].marketSpending.income = amount;
  assert(!G.validSave(broken));
}
console.log('PASS: 3900억 receipt, rejected deals, loan fees/options, cash-only swaps, spending, reload, annual reset and legacy validation.');
