'use strict';
// NODE_PATH must contain Playwright. Optional argument: an exported career JSON.
// Uses an isolated headless browser; never touches the player's browser profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const G = require('./engine.js');

(async () => {
  let input;
  if (process.argv[2]) input = fs.readFileSync(process.argv[2], 'utf8');
  else {
    const s = G.newGame(42); s.careerSelected = true;
    while (s.week < 27) G.playWeek(s);
    input = JSON.stringify(s);
  }
  const original = G.upgradeSave(JSON.parse(input));
  assert(G.validSave(original));
  const server = http.createServer((req, res) => {
    const file = req.url === '/' ? 'index.html' : req.url.slice(1);
    if (!['index.html', 'app.js', 'engine.js', 'world.js', 'manager.js', 'style.css'].includes(file)) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(fs.readFileSync(path.join(__dirname, file)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: process.env.TOUCHLINE_BROWSER || 'msedge' });
    const page = await browser.newPage(), errors = [];
    page.setDefaultTimeout(120000);
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    const url = `http://127.0.0.1:${server.address().port}/`;
    const saved = () => page.waitForFunction(() => document.querySelector('#save-state')?.textContent === '자동 저장됨');
    await page.goto(url); await saved();
    await page.locator('[data-start-career]').first().click(); await saved();
    // Reproduce the original quota error in a disposable key.
    assert.equal(await page.evaluate(raw => {
      try { localStorage.setItem('quota-probe', raw); return false; }
      catch (e) { return e.name === 'QuotaExceededError'; }
      finally { localStorage.removeItem('quota-probe'); }
    }, input), true);
    await page.locator('[data-action="settings"]').click();
    await page.locator('#import-save').setInputFiles({ name: 'career.json', mimeType: 'application/json', buffer: Buffer.from(input) });
    await page.waitForFunction(week => state.week === week, original.week); await saved();
    assert.deepEqual(await page.evaluate(() => JSON.parse(JSON.stringify(state))), original);
    // Exercise the actual next-week and half-time buttons.
    await page.locator('[data-action="advance"]').first().click();
    await page.locator('[data-action="kickoff"]').click();
    let expectedWeek = original.week + 1;
    if (!G.nextFixture(original)) {
      // The supplied Anyang save has finished all 22 league matches at week 27.
      await page.waitForFunction(() => !batchRunning);
      assert.equal(await page.evaluate(() => state.week), original.totalWeeks);
      assert.equal(await page.evaluate(() => state.clubs[0].played), original.clubs[0].played);
      assert.match(await page.locator('#batch-progress').textContent(), /시즌 종료/);
      await page.locator('#modal [data-action="advance"]').click();
      assert.equal(await page.evaluate(() => state.season), original.season + 1);
      assert.equal(await page.locator('#modal').evaluate(el => el.open), false);
      await page.locator('[data-action="advance"]').first().click();
      await page.locator('[data-action="kickoff"]').click();
      expectedWeek = 1;
    }
    if (await page.locator('[data-manager="live-finish"]').count()) await page.locator('[data-manager="live-finish"]').click();
    await saved();
    assert.equal(await page.evaluate(() => state.week), expectedWeek);
    const beforeReload = await page.evaluate(() => JSON.stringify(state));
    await page.reload(); await saved();
    assert.equal(await page.evaluate(() => JSON.stringify(state)), beforeReload);
    // A failed transaction leaves the last committed save intact and is never labelled saved.
    await page.evaluate(async () => {
      const realTransaction = saveDatabase.transaction.bind(saveDatabase);
      saveDatabase.transaction = (...args) => { const tx = realTransaction(...args); queueMicrotask(() => tx.abort()); return tx; };
      G.playWeek(state); await save(); render();
      saveDatabase.transaction = realTransaction;
    });
    assert.match(await page.locator('#save-state').textContent(), /저장 실패/);
    assert.equal(await page.evaluate(() => saveRecord('readonly')), beforeReload);
    assert.equal(await page.evaluate(() => save()), true);
    await saved();
    // Rapid queued writes, season end and the next season all survive reload.
    await page.evaluate(async () => {
      while (state.week < state.totalWeeks) G.playWeek(state);
      save(); G.nextSeason(state); await save(); render();
    });
    const final = await page.evaluate(() => JSON.stringify(state));
    assert(G.validSave(JSON.parse(final)));
    await page.reload(); await saved();
    assert.equal(await page.evaluate(() => JSON.stringify(state)), final);
    // Manager UI regression in the same isolated browser.
    await page.evaluate(async()=>{state=G.newGame(619);state.careerSelected=true;render();await save();});
    await page.locator('[data-page="squad"]').first().click();
    await page.locator('[data-profile]').first().click();
    assert.equal(await page.locator('.detail-stats meter').count(),14);
    await page.locator('#modal .modal-close').click();
    await page.locator('[data-page="market"]').first().click();
    for (const group of ['GK','DF','MF','FW']) {
      await page.locator(`[data-filter="${group}"]`).click();
      const options=await page.locator('[data-market-option="position"] option').evaluateAll(els=>els.map(el=>el.value));
      assert.deepEqual(options, ['ALL',...Object.keys(G.POSITIONS).filter(p=>G.POSITION_GROUPS[group].includes(p))]);
      assert.equal(await page.locator('[data-market-option="position"]').inputValue(),'ALL');
      for (const position of options.slice(1)) {
        await page.locator('[data-market-option="position"]').selectOption(position);
        assert(await page.evaluate(({group,position})=>marketPlayers().length>0 && marketPlayers().every(p=>p.pos===group && p.position===position),{group,position}));
      }
    }
    await page.locator('[data-filter="ALL"]').click();
    assert.equal(await page.locator('[data-market-option="position"]').inputValue(),'ALL');
    await page.locator('[data-market-option="position"]').selectOption('ST');
    await page.locator('[data-filter="DF"]').click();
    assert.equal(await page.locator('[data-market-option="position"]').inputValue(),'ALL');
    assert(await page.evaluate(()=>marketPlayers().every(p=>p.pos==='DF')));
    await page.locator('[data-filter="ALL"]').click();
    await page.locator('[data-market-option="position"]').selectOption('ST');
    await page.locator('[data-market-option="foot"]').selectOption('left');
    await page.locator('[data-market-option="sort"]').selectOption('priceAsc');
    assert(await page.evaluate(()=>marketPlayers().every(p=>p.position==='ST'&&p.foot==='left')));
    assert(await page.locator('#market-results tbody tr').count()>0);
    await page.locator('[data-market-option="maxAge"]').fill('24');
    await page.locator('[data-market-option="maxAge"]').press('Tab');
    await page.locator('[data-market-option="status"]').selectOption('fit');
    await page.locator('[data-market-option="minStat2"]').fill('50');
    await page.locator('[data-market-option="minStat2"]').press('Tab');
    assert(await page.evaluate(()=>marketPlayers().length>2&&marketPlayers().every(p=>p.age<=24&&G.available(p)&&p.attributes.vision>=50)));
    await page.locator('[data-compare-player]').nth(0).click();
    await page.locator('[data-compare-player]').nth(1).click();
    await page.locator('[data-manager="compare"]').click();
    assert.equal(await page.locator('#modal tbody tr').count(),20);
    await page.locator('#modal .modal-close').click();
    await page.locator('[data-manager="clear-filters"]').click();
    assert.equal(await page.locator('[data-market-option="maxAge"]').inputValue(),'45');
    await page.locator('[data-page="tactics"]').first().click();
    assert.equal(await page.locator('#tactic-map [data-target-player]').count(),11);
    await page.locator('#tactic-map').click({position:{x:300,y:100}});
    assert(await page.evaluate(()=>state.instructions[1].attackX!==null));
    await page.locator('[data-target-view="defend"]').click();
    await page.locator('#tactic-map').click({position:{x:100,y:180}});
    assert(await page.evaluate(()=>state.instructions[1].defendX!==null));
    await page.locator('#tactic-plan-name').fill('측면 침투');
    await page.locator('[data-tactic-plan="save"]').click();
    const savedPlan=await page.evaluate(()=>JSON.stringify(state.instructions));
    await page.locator('[data-reset-target="1"]').click();
    await page.locator('[data-tactic-plan="load"]').click();
    assert.equal(await page.evaluate(()=>JSON.stringify(state.instructions)),savedPlan);
    if(process.env.TOUCHLINE_TACTICS_SCREENSHOT)await page.screenshot({path:process.env.TOUCHLINE_TACTICS_SCREENSHOT,fullPage:true});
    await page.locator('[data-instructions="1"]').first().click();
    await page.locator('#modal [data-instruction="movement"]').selectOption('invert');
    await page.locator('#modal .modal-close').click();
    assert.equal(await page.evaluate(()=>state.instructions[1].movement),'invert');
    await page.locator('[data-action="advance"]').first().click();
    await page.locator('[data-action="kickoff"]').click();
    assert.equal(await page.evaluate(()=>state.pending.minute),0);
    assert.equal(await page.evaluate(()=>liveRunning),true,'kickoff must autoplay');
    assert.equal(await page.locator('#live-pitch .live-player').count(),22);
    await page.locator('#live-slot').selectOption('1');
    await page.locator('#modal [data-instruction="movement"]').selectOption('overlap');
    assert.equal(await page.evaluate(()=>state.instructions[1].movement),'overlap');
    await page.locator('[data-live-tactic="mentality"]').selectOption('1');
    await page.locator('#live-speed').selectOption('10');
    await page.waitForFunction(()=>state.pending.minute>=1);
    await page.locator('[data-manager="live-toggle"]').click();
    const pausedMinute=await page.evaluate(()=>state.pending.minute);
    await saved(); await page.reload(); await saved();
    assert.equal(await page.evaluate(()=>state.pending.minute),pausedMinute);
    assert.equal(await page.evaluate(()=>liveRunning),false,'reload must not run a hidden match');
    await page.locator('[data-action="advance"]').first().click();
    assert.equal(await page.evaluate(()=>liveRunning),true,'opening the match resumes playback');
    await page.evaluate(()=>{while(state.pending.minute<44)G.advanceMinute(state);paintLive();});
    await page.locator('[data-manager="live-step"]').click();
    assert.equal(await page.evaluate(()=>state.pending.minute),45);
    assert.match(await page.locator('#live-minute').textContent(),/하프타임/);
    assert.equal(await page.evaluate(()=>liveRunning),false);
    await page.locator('[data-manager="live-sub"]').click();
    assert.equal(await page.evaluate(()=>state.pending.substitutions),1);
    await page.locator('[data-manager="live-finish"]').click();
    await saved();assert.equal(await page.evaluate(()=>state.week),1);
    await page.locator('#modal .modal-close').click();
    await page.locator('[data-page="squad"]').first().click();
    await page.locator('[data-squad-option="view"]').selectOption('league');
    await page.locator('[data-squad-option="sort"]').selectOption('minutes');
    assert.match(await page.locator('#squad-table').textContent(),/90분당 득점/);
    assert(await page.evaluate(()=>G.roster(state).reduce((n,p)=>n+(p.leagueStats?.minutes||0),0)===990));
    const squadName=await page.evaluate(()=>G.roster(state)[0].name);
    await page.locator('#squad-search').fill(squadName);
    assert(await page.locator('#squad-table tbody tr').count()>0);
    await page.locator('#squad-search').fill('');
    if(process.env.TOUCHLINE_SQUAD_SCREENSHOT)await page.screenshot({path:process.env.TOUCHLINE_SQUAD_SCREENSHOT,fullPage:true});
    await page.locator('[data-action="batch"]').click();
    await page.locator('#batch-count').fill('3');
    await page.locator('[data-manager="batch-start"]').click();
    await page.waitForFunction(()=>!batchRunning&&state.week===4);
    assert.match(await page.locator('#batch-progress').textContent(),/3경기 완료/);
    await page.locator('#modal .modal-close').click();
    await page.locator('[data-action="batch"]').click();
    await page.locator('#batch-count').fill('20');
    await page.locator('[data-manager="batch-start"]').click();
    await page.locator('[data-manager="batch-stop"]').click();
    await page.waitForFunction(()=>!batchRunning);
    assert(await page.evaluate(()=>state.week<24));
    assert.equal(await page.locator('#modal [data-action="close"]').last().isEnabled(),true);
    await page.locator('#modal .modal-close').click();
    await page.setViewportSize({width:780,height:960});
    await page.locator('[data-action="advance"]').first().click();
    await page.locator('[data-action="kickoff"]').click();
    if (process.env.TOUCHLINE_SCREENSHOT) await page.screenshot({path:process.env.TOUCHLINE_SCREENSHOT,fullPage:true});
    await page.locator('[data-manager="live-finish"]').click();await saved();
    await page.locator('#modal .modal-close').click();
    // An odd-team league has a real bye, then fixtures resume. Do not play past that fixture.
    await page.evaluate(async()=>{
      state=G.newGame(619,G.CLUBS.findIndex(c=>G.LEAGUES[c[4]].country==='KOREA'&&G.LEAGUES[c[4]].tier===2));
      state.careerSelected=true; page='overview'; render(); await save();
    });
    assert.equal(await page.evaluate(()=>!!G.nextFixture(state)),false);
    await page.locator('[data-action="advance"]').first().click();
    await page.locator('[data-action="kickoff"]').click();
    await page.waitForFunction(()=>!batchRunning);
    assert.equal(await page.evaluate(()=>state.week),1);
    assert.equal(await page.evaluate(()=>state.clubs[0].played),0);
    assert.equal(await page.evaluate(()=>!!G.nextFixture(state)),true);
    await page.locator('#modal [data-action="advance"]').click();
    await page.locator('[data-action="kickoff"]').click();
    assert.equal(await page.evaluate(()=>liveRunning),true);
    await page.locator('[data-manager="live-finish"]').click(); await saved();
    assert.equal(await page.evaluate(()=>state.clubs[0].played),1);
    await page.locator('#modal .modal-close').click();
    await page.evaluate(async()=>{while(state.week<17)G.playWeek(state);render();await save();});
    assert.equal(await page.evaluate(()=>!!G.nextFixture(state)),false);
    await page.locator('[data-action="batch"]').click();
    await page.locator('#batch-count').fill('3');
    await page.locator('[data-manager="batch-start"]').click();
    await page.waitForFunction(()=>!batchRunning);
    assert.equal(await page.evaluate(()=>state.week),21);
    assert.match(await page.locator('#batch-progress').textContent(),/3경기 완료.*4주 진행/);
    // Existing small localStorage saves migrate without changing or deleting the original.
    const legacy = G.newGame(3); legacy.careerSelected = true;
    delete legacy.instructions;
    [...legacy.players,...legacy.academy].forEach(p=>{delete p.position;delete p.foot;delete p.ambition;delete p.attributes;});
    const legacyRaw = JSON.stringify(legacy), context = await browser.newContext(), migration = await context.newPage();
    await migration.addInitScript(raw => {
      if (!localStorage.getItem('touchline-save-v3')) localStorage.setItem('touchline-save-v3', raw);
    }, legacyRaw);
    await migration.goto(url);
    await migration.waitForFunction(() => document.querySelector('#save-state')?.textContent === '자동 저장됨');
    assert.equal(await migration.evaluate(() => saveRecord('readonly')), JSON.stringify(G.upgradeSave(JSON.parse(legacyRaw))));
    assert.equal(await migration.evaluate(() => localStorage.getItem('touchline-save-v3')), legacyRaw);
    assert.deepEqual(errors, []);
    console.log(`PASS: ${Buffer.byteLength(input)}-byte career import, quota reproduction, next week, reload, failed transaction recovery, ordered saves, season rollover, legacy migration; position filter consistency, kickoff autoplay, half-time/resume/substitution, batch cancellation, bye skipping and actual match counts.`);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
