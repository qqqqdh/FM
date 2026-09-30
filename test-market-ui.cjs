'use strict';
// Isolated browser profile and temporary localhost server; never touches a live career.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
  const server=http.createServer((req,res)=>{
    const file=req.url==='/'?'index.html':req.url.slice(1);
    if(!['index.html','world.js','engine.js','manager.js','app.js','style.css'].includes(file))return res.writeHead(404).end();
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
    res.end(fs.readFileSync(path.join(__dirname,file)));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  try{
    browser=await chromium.launch({headless:true,channel:'msedge'});
    const tab=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];
    tab.on('pageerror',e=>errors.push(e.message));
    await tab.goto(`http://127.0.0.1:${server.address().port}`);
    await tab.waitForSelector('[data-start-career]');
    const youth=await tab.evaluate(()=>{state=G.newGame(42);state.careerSelected=true;state.budget=10000;closeModal();page='youth';render();return state.academy[0].id;});
    await tab.locator(`[data-loan-out="${youth}"]`).click();
    await tab.locator('#purchase-option').check();
    await tab.locator('#option-price').fill('99999');
    await tab.locator('#loan-out-form [type=submit]').click();
    assert(await tab.locator('[data-option-counter]').isVisible());
    assert.equal(await tab.evaluate(()=>state.academy.length),5);
    fs.mkdirSync('test-artifacts',{recursive:true});
    await tab.screenshot({path:'test-artifacts/loan-negotiation-desktop.png',fullPage:true});
    await tab.setViewportSize({width:390,height:844});
    assert(await tab.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await tab.screenshot({path:'test-artifacts/loan-negotiation-mobile.png',fullPage:true});
    await tab.locator('[data-option-counter]').click();
    const price=Number(await tab.locator('#option-price').inputValue());
    await tab.locator('#loan-out-form [type=submit]').click();
    assert.equal(await tab.locator('.academy-card').count(),5,'loaned youth still shown');
    assert.equal(await tab.evaluate(id=>G.player(state,id).loan.purchasePrice,youth),price);
    await tab.locator(`[data-profile="${youth}"]`).click();
    assert(await tab.locator('#modal .scout-report').getByText(/우리 팀 소속/).isVisible());
    assert.equal(await tab.locator(`#modal [data-scout="${youth}"]`).count(),0);
    const target=await tab.evaluate(()=>{
      const p=state.players.find(p=>p.club>0&&!p.loan&&G.canRelease(state,p.id)&&G.askingPrice(state,p.id)>5);
      negotiate(p.id);return {id:p.id,price:G.askingPrice(state,p.id)};
    });
    await tab.locator('#transfer-type').selectOption('loan');
    await tab.locator('#purchase-option').check();
    await tab.locator('#option-price').fill('0.1');
    await tab.locator('#deal-form [type=submit]').click();
    assert(await tab.locator('[data-option-counter]').isVisible());
    await tab.locator('[data-option-counter]').click();
    assert.equal(Number(await tab.locator('#option-price').inputValue()),target.price);
    await tab.locator('#deal-form [type=submit]').click();
    assert.equal(await tab.evaluate(id=>G.player(state,id).loan.purchasePrice,target.id),target.price);
    await tab.evaluate(async()=>{await save();});
    await tab.reload();await tab.waitForSelector('.nav-item');
    assert.equal(await tab.evaluate(id=>G.player(state,id).loan.purchasePrice,target.id),target.price);
    await tab.evaluate(id=>profile(id),target.id);
    await tab.locator(`[data-buy-loan="${target.id}"]`).click();
    assert.equal(await tab.evaluate(id=>G.player(state,id).loan,target.id),null);
    await tab.evaluate(()=>{state.week=state.totalWeeks;page='market';render();});
    assert(await tab.locator('[data-action="summer-week"]').isVisible());
    assert(await tab.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'summer header fits mobile');
    await tab.locator('[data-action="summer-week"]').click();
    assert.equal(await tab.evaluate(()=>state.summerWeek),1);
    assert(await tab.evaluate(()=>G.validSave(state)));
    assert.deepEqual(errors,[]);
    console.log('PASS: mobile/desktop option counters, outgoing youth visibility, incoming purchase, IndexedDB reload and summer UI.');
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
