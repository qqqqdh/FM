'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),G=require('./engine.js');
const copy=s=>JSON.parse(JSON.stringify(s));
function reportedClub(s) {
  s.staff={coach:5,scout:5,medic:5};
  s.facilities={training:5,youth:5,recovery:4,stadium:3};
  const squad=G.roster(s);squad.forEach(p=>Object.assign(p,{salary:.2,atk:75,def:75,tech:75,pace:75}));squad.at(-1).salary=.13;
  s.confidence=100;return s;
}
function eliteClub() {
  const s=reportedClub(G.newGame(92,G.CLUBS.findIndex(c=>G.LEAGUES[c[4]].country==='KOREA'&&c[1]==='KR07')));
  for(const p of s.academy.slice(0,3))assert(G.promote(s,p.id).ok);
  const ratings=[86,83,94,93,92,86,85,83,80,80,91,91,90,89,89,87,84,83,92,92,91,91,90,87,81];
  const ages=[19,18,24,24,25,20,26,19,27,18,24,25,25,23,25,21,19,21,26,25,27,25,23,25,18];
  G.roster(s).forEach((p,i)=>Object.assign(p,{atk:ratings[i],def:ratings[i],tech:ratings[i],pace:ratings[i],age:ages[i],salary:i===24?.45:.5,contract:s.season+1,history:[]}));
  return s;
}
async function rules() {
  const s=reportedClub(G.newGame(51));
  assert.equal(G.payroll(s),4.33);assert.equal(G.weeklyWages(s),5.08);assert.equal(G.facilityUpkeep(s),1.88);
  assert.equal(G.weeklyIncome(s,true),17.25);assert.equal(G.weeklyIncome(s),5.5);
  const cost=G.weeklyWages(s)+G.facilityUpkeep(s);
  assert.equal(Number((G.weeklyIncome(s,true)+G.weeklyIncome(s)-cost*2).toFixed(2)),8.83);
  // A 38-game league and 8 bye weeks can cover this squad, including four summer weeks,
  // before prizes, player sales or board money. Expensive squads still require extra revenue.
  const income=19*G.weeklyIncome(s,true)+27*G.weeklyIncome(s);
  assert.equal(Number((income-50*cost).toFixed(2)),128.25);
  assert(income<50*(cost+5),'an extra 5억 payroll must not be automatically subsidized');
  const elite=eliteClub();
  assert.equal(G.weeklyWages(elite),13.2);assert.equal(G.commercialBonus(elite),25.86);
  assert.equal(G.weeklyIncome(elite),31.36);assert.equal(G.weeklyIncome(elite,true),43.11);
  const inflated=copy(elite);G.roster(inflated).forEach(p=>{p.salary=10;p.fitness=35;p.injury=5;});inflated.clubs[0].lineup.reverse();
  assert.equal(G.weeklyIncome(inflated),G.weeklyIncome(elite),'income cannot be inflated by wages or lineups, nor collapse from fatigue/injury');
  inflated.academy.forEach(p=>Object.assign(p,{atk:99,def:99,tech:99,pace:99}));
  assert.equal(G.commercialBonus(inflated),25.86,'uncalled academy players do not generate commercial income');
  const lowerElite=copy(elite);lowerElite.leagues[0].tier=2;
  assert.equal(G.commercialBonus(lowerElite),0);assert.equal(G.weeklyIncome(lowerElite),3.5);
  // Renew every player at the new wage scale, pay every bonus, and budget four summer weeks.
  // Also stress-test a successful team demanding 30% more than the normal quoted salary.
  for(const multiplier of [1,1.3]) {
    const game=copy(elite);game.budget=10000;let bonuses=0;
    for(const p of G.roster(game)) {
      const d=G.contractDemand(game,p,3,'rotation'),salary=Math.round(d.salary*multiplier*100)/100,before=game.budget;
      assert(G.renew(game,p.id,3,salary,'rotation').ok);bonuses+=before-game.budget;
    }
    const homes=game.fixtures.filter(r=>r.some(([h])=>h===0)).length;
    const annual=G.weeklyIncome(game)*game.totalWeeks+homes*G.homeGate(game);
    const afterOperating=annual-(G.weeklyWages(game)+G.facilityUpkeep(game))*(game.totalWeeks+4);
    assert(afterOperating-bonuses>0,'regular revenue covers renewed wages, facilities, summer and all 25 signing bonuses without cups or board support');
    assert(afterOperating-bonuses-(homes-11)*G.homeGate(game)>0,'a short 22-game league still covers this scenario with only 11 home games');
    assert.equal(G.commercialBonus(game),25.86,'renewing does not change income');
    assert(G.validSave(copy(game)));
    console.log(`Renewal scenario ${multiplier}x: weekly wages ${G.weeklyWages(game)}, annual income ${annual.toFixed(2)}, bonuses ${bonuses.toFixed(2)}, remainder ${(afterOperating-bonuses).toFixed(2)}억`);
  }
  for(const kind of ['home','away','bye']) {
    const game=copy(elite);game.week=game.fixtures.findIndex(r=>kind==='bye'?!r.some(m=>m.includes(0)):r.some(m=>m[kind==='home'?0:1]===0));
    assert(game.week>=0);game.ledger=[];const before=game.budget;G.autoWeek(game);
    assert.equal(game.ledger.find(l=>l.label===(kind==='home'?'홈 경기 수입 + 방송권·스폰서':'방송권 + 스폰서')).amount,kind==='home'?43.11:31.36);
    assert.equal(game.ledger.find(l=>l.label==='선수 및 스태프 주급').amount,-13.2);
    assert.equal(game.budget,Math.round((before+game.ledger.reduce((n,l)=>n+l.amount,0))*100)/100);
  }
  for(const [confidence,expected] of [[0,100],[59,336],[60,340],[80,420],[100,500]]) {
    s.confidence=confidence;assert.equal(G.boardGrant(s),expected);
  }
  // Tie the budget to real asking prices, so price inflation cannot silently erase recruitment power.
  for(const [lo,hi,count] of [[75,77,4],[80,82,2]]) {
    const prices=s.players.filter(p=>p.club>0&&s.leagues[s.clubs[p.club].league].tier===1&&G.ovr(p)>=lo&&G.ovr(p)<=hi&&G.canRelease(s,p.id)).map(p=>G.askingPrice(s,p.id)).sort((a,b)=>a-b);
    const median=prices[Math.floor(prices.length/2)];
    assert(G.boardGrant(s)>=count*median,`support should fund ${count} OVR ${lo}-${hi} transfer fees`);
    assert(G.boardGrant(s)<11*median,'rebuilding the entire starting eleven still takes multiple seasons');
  }
  for(const kind of ['home','away','bye']) {
    const game=copy(s),week=game.fixtures.findIndex(round=>kind==='bye'?!round.some(m=>m.includes(0)):round.some(m=>m[kind==='home'?0:1]===0));
    assert(week>=0);game.week=week;
    const before=game.budget;game.ledger=[];
    G.autoWeek(game);
    const label=kind==='home'?'홈 경기 수입 + 방송권·스폰서':'방송권 + 스폰서';
    assert.equal(game.ledger.find(l=>l.label===label).amount,kind==='home'?17.25:5.5);
    assert.equal(game.ledger.find(l=>l.label==='선수 및 스태프 주급').amount,-5.08);
    assert.equal(game.ledger.find(l=>l.label==='시설 주간 운영비').amount,-1.88);
    assert.equal(game.budget,Math.round((before+game.ledger.reduce((sum,l)=>sum+l.amount,0))*100)/100);
    assert(G.validSave(copy(game)));
  }
  s.week=s.totalWeeks;s.confidence=100;const before=s.budget;
  assert(G.advanceSummerWeek(s).ok);assert.equal(s.budget,Math.round((before-cost)*100)/100);
  assert(!s.ledger.some(l=>l.label==='방송권 + 스폰서'));
  s.clubs[0].pts=999;assert(G.nextSeason(s));
  assert.equal(s.ledger.find(l=>l.label==='새 시즌 구단 지원금').amount,500);
  const lower=G.newGame(51,G.CLUBS.findIndex(c=>G.LEAGUES[c[4]].tier===2));
  lower.confidence=100;assert.equal(G.boardGrant(lower),125);
  const third=copy(lower);third.leagues[0].tier=3;assert.equal(G.boardGrant(third),56);
  assert.equal(G.weeklyIncome(lower),3.5);assert.equal(G.weeklyIncome(lower,true),6.5);
  lower.clubs[0].pts=999;lower.week=lower.totalWeeks;assert(G.nextSeason(lower));
  assert.equal(lower.leagues[0].tier,1);
  assert.equal(lower.ledger.find(l=>l.label==='새 시즌 구단 지원금').amount,500,'grant uses promoted division');
  for(const file of ['touchline-2028-R3.json','touchline-2029-R20.json']) {
    const old=JSON.parse(fs.readFileSync(file,'utf8')),budget=old.budget,ledger=copy(old.ledger);
    G.upgradeSave(old);assert.equal(old.budget,budget);assert.deepEqual(old.ledger,ledger);assert(G.validSave(old));
  }
  console.log('PASS: reported and fully renewed elite squads, wage-independent commercial income, home/away/bye settlement, summer, grants and legacy balances.');
}
async function ui() {
  const http=require('node:http'),path=require('node:path'),{chromium}=require('playwright');
  const server=http.createServer((req,res)=>{
    const file=req.url==='/'?'index.html':req.url.slice(1);
    if(!['index.html','world.js','engine.js','manager.js','app.js','style.css'].includes(file))return res.writeHead(404).end();
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
    res.end(fs.readFileSync(path.join(__dirname,file)));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  try {
    browser=await chromium.launch({headless:true,channel:'msedge'});
    const tab=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];
    tab.on('pageerror',e=>errors.push(e.message));
    await tab.goto(`http://127.0.0.1:${server.address().port}`);await tab.waitForSelector('[data-start-career]');
    const s=reportedClub(G.newGame(51));s.careerSelected=true;
    s.ledger=[{amount:370.9,label:'방송권 + 스폰서',season:2029,week:37},{amount:-1000,label:'시설 확충',season:2029,week:37},{amount:-100,label:'선수 및 스태프 주급',season:2029,week:37},{amount:-12.6,label:'시설 주간 운영비',season:2029,week:37}];
    await tab.evaluate(data=>{state=data;closeModal();page='office';render();},s);
    const text=await tab.locator('#finance-outlook').innerText();
    for(const value of ['6.96억','17.25억','+10.29억','5.50억','-1.46억','+8.83억','14.69억'])assert(text.includes(value),value);
    assert(await tab.getByText('다음 시즌 지원금 500억 예상 (현재 리그 기준)',{exact:true}).isVisible());
    assert(await tab.getByText('최근 4건 합계 · 수입 370.9억 / 지출 1112.6억',{exact:true}).isVisible());
    await tab.locator('#finance-spending summary').click();
    assert((await tab.locator('#finance-spending').innerText()).includes('1000.00억'));
    fs.mkdirSync('test-artifacts',{recursive:true});
    await tab.screenshot({path:'test-artifacts/finance-desktop.png',fullPage:true});
    await tab.setViewportSize({width:390,height:844});
    assert(await tab.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'office fits mobile');
    await tab.screenshot({path:'test-artifacts/finance-mobile.png',fullPage:true});
    const elite=eliteClub();elite.careerSelected=true;
    await tab.evaluate(data=>{state=data;render();},elite);
    const eliteText=await tab.locator('#finance-outlook').innerText();
    for(const value of ['25.86억','31.36억','43.11억','18.44억','212.28억','재계약 후 연간 운영 수지 예상'])assert(eliteText.includes(value),`${value}: ${eliteText}`);
    assert(await tab.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'renewal forecast fits mobile');
    await tab.screenshot({path:'test-artifacts/finance-renewal-mobile.png',fullPage:true});
    await tab.setViewportSize({width:1440,height:1080});
    await tab.screenshot({path:'test-artifacts/finance-renewal-desktop.png',fullPage:true});
    await tab.setViewportSize({width:390,height:844});
    await tab.evaluate(data=>{state=data;render();},s);
    await tab.evaluate(()=>{
      state.competitions.forEach(c=>c.nextWeek=null);
      const cup=state.competitions.find(c=>c.kind==='europe'&&c.participants.includes(0));
      const pair=cup.next.find(p=>p.includes(0));if(pair[0]!==0)pair.reverse();cup.nextWeek=1;
      G.autoWeek(state);page='cups';viewedCup=cup.id;render();
      matchReport(cup.results.find(m=>m.h===0||m.a===0));
    });
    assert((await tab.locator('.cup-income').innerText()).includes('홈구장 14.69억'));
    assert((await tab.locator('.cup-income').innerText()).includes('방송권·참가 4.00억'));
    assert(await tab.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await tab.screenshot({path:'test-artifacts/cup-home-income-mobile.png',fullPage:true});
    await tab.evaluate(()=>{
      closeModal();const cup=state.competitions.find(c=>c.id===viewedCup),other=cup.participants.find(id=>id!==0);
      cup.phase='knockout';cup.next=[[0,other]];cup.round=cup.weeks.length-1;cup.nextWeek=state.week+1;render();
    });
    assert((await tab.locator('.cup-fixtures').first().innerText()).includes('중립구장'));
    await tab.evaluate(()=>{
      const cup=state.competitions.find(c=>c.id===viewedCup);G.autoWeek(state);render();matchReport(cup.results.at(-1));
    });
    assert((await tab.locator('.cup-income').innerText()).includes('홈구장 0.00억'));
    assert(await tab.locator('#modal').getByText('중립구장',{exact:true}).isVisible());
    await tab.screenshot({path:'test-artifacts/cup-neutral-income-mobile.png',fullPage:true});
    assert(await tab.evaluate(()=>G.validSave(state)));
    assert.deepEqual(errors,[]);
    console.log('PASS: office forecast, itemized spending, cup home/neutral venues and income reports, desktop/mobile layout.');
  } finally {if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
(process.argv.includes('--ui')?ui():rules()).catch(e=>{console.error(e);process.exitCode=1;});
