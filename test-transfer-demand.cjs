'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),G=require('./engine.js');
const copy=s=>JSON.parse(JSON.stringify(s));
function setup(){
  const s=G.newGame(92,G.CLUBS.findIndex(c=>c[1]==='KR07'&&G.LEAGUES[c[4]].tier===1));
  const p=G.roster(s).find(p=>p.pos==='FW'&&G.canRelease(s,p.id));
  Object.assign(p,{atk:92,def:92,tech:92,pace:92,age:26,salary:.22,position:'RW',contract:s.season+1,history:[1,2,3].map(y=>({season:s.season-y,goals:14,assists:4}))});
  return {s,p};
}
function rules(){
  const {s,p}=setup(),poor=s.clubs.find(c=>s.leagues[c.league].flag==='MY'&&s.leagues[c.league].tier===3);
  assert(G.clubMarketCapacity(s,poor).budget<20);
  const before=JSON.stringify(s);
  assert(!G.sellPlayer(s,p.id,poor.id,885).ok);assert.equal(JSON.stringify(s),before);
  assert(!G.negotiateSale(s,p.id,poor.id,985).ok);assert.equal(JSON.stringify(s),before);
  const offers=G.getTransferOffers(s,p.id);assert(offers.length>0&&offers.length<=3);
  for(const offer of offers){assert.notEqual(offer.club,poor.id);assert(offer.cash<=G.clubMarketCapacity(s,s.clubs[offer.club]).budget);assert(offer.salary>=G.marketWage(p));assert(offer.reason.includes('RW'));}
  // A club with better players already covering the position has no reason to buy him.
  const crowded=copy(s),buyer=offers[0].club,peers=G.roster(crowded,buyer).filter(q=>q.pos==='FW').slice(0,2);
  peers.forEach(q=>Object.assign(q,{position:'RW',atk:95,def:95,tech:95,pace:95}));
  assert(!G.sellPlayer(crowded,p.id,buyer,offers[0].cash).ok);
  const wrongSystem=copy(s);wrongSystem.clubs[buyer].tactics.formation='5-3-2';
  assert(!G.sellPlayer(wrongSystem,p.id,buyer,offers[0].cash).ok,'formation without RW does not buy a specialist RW');
  // Saved or displayed offers are checked again when accepted, even if the club spent its budget.
  const stale=copy(s);stale.incoming=[{id:`${s.season}-0`,player:p.id,club:buyer,cash:offers[0].cash}];
  stale.clubs[buyer].marketSpending={season:s.season,amount:1800};const staleBefore=JSON.stringify(stale);
  assert(!G.acceptOffer(stale,stale.incoming[0].id).ok);assert.equal(JSON.stringify(stale),staleBefore);
  assert(!G.negotiateSale(stale,p.id,buyer,985).counter,'cannot counter beyond the remaining budget');
  assert.equal(G.upgradeSave(copy(stale)).incoming.length,0);
  const bought=copy(s),bp=G.player(bought,p.id),money=bought.budget,capacity=G.clubMarketCapacity(bought,bought.clubs[buyer]).budget;
  assert(G.sellPlayer(bought,p.id,buyer,offers[0].cash).ok);
  assert.equal(bp.club,buyer);assert.equal(bp.salary,offers[0].salary);
  assert.equal(bought.budget,money+offers[0].cash);
  assert.equal(G.clubMarketCapacity(bought,bought.clubs[buyer]).budget,capacity-offers[0].cash);
  assert(G.validSave(copy(bought)));assert.equal(G.clubMarketCapacity(G.upgradeSave(copy(bought)),bought.clubs[buyer]).budget,capacity-offers[0].cash);
  bought.season++;assert.equal(G.clubMarketCapacity(bought,bought.clubs[buyer]).budget,capacity);
  const bad=copy(bought);bad.clubs[buyer].marketSpending.amount=-1;assert(!G.validSave(bad));
  // Outstanding random legacy bids disappear without changing existing balances/contracts.
  const old=copy(s);old.incoming=[{id:`${s.season}-0`,player:p.id,club:poor.id,cash:885}];
  const upgraded=G.upgradeSave(old);assert.equal(upgraded.incoming.length,0);assert.equal(upgraded.budget,s.budget);assert.equal(G.player(upgraded,p.id).salary,.22);
  console.log('PASS: poor-club rejection, actual positional need, wage reset, shared final checks, season spending, rollover and legacy offers.');
}
async function ui(){
  const http=require('node:http'),path=require('node:path'),{chromium}=require('playwright');
  const server=http.createServer((req,res)=>{const file=req.url==='/'?'index.html':req.url.slice(1);if(!['index.html','world.js','engine.js','manager.js','app.js','style.css'].includes(file))return res.writeHead(404).end();res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(path.join(__dirname,file)));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  try{
    browser=await chromium.launch({headless:true,channel:'msedge'});const tab=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];tab.on('pageerror',e=>errors.push(e.message));
    await tab.goto(`http://127.0.0.1:${server.address().port}`);await tab.waitForSelector('[data-start-career]');
    const {s,p}=setup();s.careerSelected=true;
    await tab.evaluate(({s,id})=>{state=s;closeModal();page='league';render();sellModal(id);},{s,id:p.id});
    assert((await tab.locator('#modal').innerText()).includes('RW 보강'));
    fs.mkdirSync('test-artifacts',{recursive:true});await tab.screenshot({path:'test-artifacts/transfer-demand-desktop.png',fullPage:true});
    await tab.setViewportSize({width:390,height:844});
    assert(await tab.locator('#modal').evaluate(el=>el.scrollWidth<=el.clientWidth),'mobile bid rows fit the dialog');
    await tab.locator('#modal').screenshot({path:'test-artifacts/transfer-demand-mobile.png'});
    await tab.setViewportSize({width:1440,height:1000});
    const buyer=Number(await tab.locator('#modal [data-club-roster]').first().getAttribute('data-club-roster'));
    await tab.locator('#modal [data-club-roster]').first().click();
    assert.equal(await tab.locator('#club-roster-table tbody tr').count(),G.roster(s,buyer).length);
    assert((await tab.locator('#modal').innerText()).includes('남은 시즌 영입 예산'));
    await tab.screenshot({path:'test-artifacts/club-roster-desktop.png',fullPage:true});
    await tab.setViewportSize({width:390,height:844});
    assert(await tab.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await tab.screenshot({path:'test-artifacts/club-roster-mobile.png',fullPage:true});
    await tab.locator('#club-roster-table [data-profile]').first().click();
    await tab.locator('#modal [data-club-roster]').click();assert(await tab.locator('#club-roster-table').isVisible());
    await tab.evaluate(()=>closeModal());await tab.locator('.league-table [data-club-roster]').first().click();assert(await tab.locator('#club-roster-table').isVisible());
    // No fake filler bids and no empty negotiation form when all eligible clubs are full.
    await tab.evaluate(id=>{state.clubs.slice(1).forEach(c=>c.marketSpending={season:state.season,amount:100000});sellModal(id);},p.id);
    assert((await tab.locator('#modal').innerText()).includes('현재 조건에 맞는 관심 구단이 없습니다'));assert.equal(await tab.locator('#sell-form').count(),0);
    assert.deepEqual(errors,[]);console.log('PASS: relevant offers, roster from bid/league/profile, player details, empty offers and mobile layout.');
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
(process.argv.includes('--ui')?ui():Promise.resolve().then(rules)).catch(e=>{console.error(e);process.exitCode=1;});
