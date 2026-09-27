'use strict';
// NODE_PATH must contain Playwright. Uses an isolated headless Edge profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require('playwright');
const G = require('./engine.js');
(async () => {
  const s = G.newGame(91);
  const legacy = s.players.find(p => p.pos === 'DF');
  legacy.leagueStats = {matches:1,starts:1,minutes:90,goals:0,assists:0,shots:0,onTarget:0,cleanSheets:4};
  legacy.history = [{season:2025,cleanSheets:3,goals:2}];
  G.upgradeSave(s);
  assert.equal(legacy.leagueStats.cleanSheets, 0);
  assert.equal(legacy.history[0].cleanSheets, 0);
  assert.equal(legacy.history[0].goals, 2);
  const match = G.startMatch(s);
  const keepers = [match.h, match.a].map(cid => G.player(s, s.clubs[cid].lineup[0]));
  for (const cid of [match.h, match.a]) for (const id of s.clubs[cid].lineup) {
    const p = G.player(s, id);
    match.playerStats[id] = {minutes:p.pos==='GK'?(cid===match.h?60:59):90,starts:1,goals:0,assists:0,shots:0,onTarget:0};
  }
  s.pending.minute = 90;
  G.playWeek(s);
  assert.equal(keepers[0].leagueStats.cleanSheets, 1);
  assert.equal(keepers[1].leagueStats.cleanSheets, 0);
  assert(s.players.every(p => p.pos === 'GK' || !p.leagueStats?.cleanSheets));
  assert(G.validSave(JSON.parse(JSON.stringify(s))));

  const server = http.createServer((req,res) => {
    const file = req.url === '/' ? 'index.html' : req.url.slice(1);
    if (!['index.html','world.js','engine.js','manager.js','app.js','style.css'].includes(file)) return res.writeHead(404).end();
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
    res.end(fs.readFileSync(path.join(__dirname,file)));
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser = await chromium.launch({headless:true,channel:process.env.TOUCHLINE_BROWSER||'msedge'});
    const page = await browser.newPage({viewport:{width:1440,height:1080}}), errors=[];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForSelector('[data-start-career]');
    await page.evaluate(() => {
      state.careerSelected=true; closeModal(); page='squad';
      const ps=G.roster(state), fields=ps.filter(p=>p.pos!=='GK'), keeper=ps.find(p=>p.pos==='GK');
      const a=fields[0],b=fields[1];
      a.name='비교 선수 A'; b.name='비교 선수 B';
      a.appearances=2; a.goals=2; a.cupGoals=8;
      a.leagueStats={matches:2,starts:2,minutes:180,goals:2,assists:3,shots:9,onTarget:5,cleanSheets:9};
      a.history=[{season:2025,appearances:5,starts:3,minutes:360,goals:4,cupGoals:6,assists:2,shots:12,onTarget:8,cleanSheets:8}];
      b.appearances=4; b.goals=4; b.cupGoals=0;
      b.leagueStats={matches:4,starts:3,minutes:270,goals:4,assists:0,shots:10,onTarget:6,cleanSheets:7};
      keeper.leagueStats={matches:4,starts:4,minutes:360,goals:0,assists:0,shots:0,onTarget:0,cleanSheets:2};
      keeper.appearances=4;
      G.upgradeSave(state); render();
    });
    await page.locator('[data-squad-option="view"]').selectOption('stats');
    const fields = page.getByRole('region',{name:'필드 선수 시즌 기록'});
    const keepersTable = page.getByRole('region',{name:'골키퍼 시즌 기록'});
    assert.equal(await fields.locator('[data-squad-sort="cleanSheets"]').count(),0);
    assert.equal(await keepersTable.locator('[data-squad-sort="cleanSheets"]').count(),1);
    assert.equal(await fields.locator('tbody tr').first().locator('.player-name').innerText(),'비교 선수 B');
    await fields.locator('[data-squad-sort="goals"]').click();
    assert.equal(await fields.locator('[aria-sort="ascending"]').count(),1);
    assert.equal(await fields.locator('tbody tr').last().locator('.player-name').innerText(),'비교 선수 B');
    await fields.locator('[data-squad-sort="goals"]').click();
    await page.locator('[data-squad-option="detailed"]').check();
    const a = fields.locator('tr').filter({has:page.getByRole('button',{name:'비교 선수 A',exact:true})});
    assert.equal(await a.locator('[data-stat="p90"]').innerText(),'1.00');
    assert.equal(await a.locator('[data-stat="points"]').innerText(),'5');
    assert.equal(await a.locator('[data-stat="cupGoals"]').innerText(),'8');
    await page.locator('[data-squad-option="season"]').selectOption('2025');
    assert.equal(await a.locator('[data-stat="p90"]').innerText(),'1.00');
    assert.equal(await a.locator('[data-stat="points"]').innerText(),'6');
    await page.locator('#squad-search').fill('비교 선수 A');
    assert.equal(await fields.locator('tbody tr').count(),1);
    await page.locator('#squad-search').fill('없는 선수');
    assert(await page.getByText('해당 조건에 맞는 선수가 없습니다.').isVisible());
    await page.locator('#squad-search').fill('');
    await page.locator('[data-squad-option="position"]').selectOption('GK');
    assert.equal(await fields.count(),0);
    assert(await keepersTable.isVisible());
    await page.locator('[data-squad-option="season"]').selectOption('current');
    await page.locator('[data-squad-option="position"]').selectOption('ALL');
    await page.locator('[data-squad-option="detailed"]').uncheck();
    fs.mkdirSync('test-artifacts',{recursive:true});
    await page.screenshot({path:'test-artifacts/squad-season-desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.locator('[data-squad-option="detailed"]').check();
    const sticky = await fields.evaluate(region => {
      region.scrollLeft=region.scrollWidth;
      const r=region.getBoundingClientRect(),name=region.querySelector('tbody td').getBoundingClientRect();
      return {left:r.left,nameLeft:name.left,width:document.documentElement.scrollWidth,viewport:innerWidth};
    });
    assert(Math.abs(sticky.left-sticky.nameLeft)<2,'name remains visible during horizontal scroll');
    assert(sticky.width<=sticky.viewport,'no page-level horizontal overflow');
    await page.screenshot({path:'test-artifacts/squad-season-mobile.png',fullPage:true});
    await fields.locator('tbody .player-name').first().click();
    assert(await page.locator('#modal').evaluate(el=>el.open));
    assert.deepEqual(errors,[]);
    console.log('PASS: GK-only clean sheets (60/59 minutes), legacy cleanup, season stats, sorting, search, filters, correct league rates, sticky names and mobile layout.');
  } finally { if(browser) await browser.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
