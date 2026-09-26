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
    if (await page.locator('[data-manager="live-finish"]').count()) await page.locator('[data-manager="live-finish"]').click();
    await saved();
    assert.equal(await page.evaluate(() => state.week), original.week + 1);
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
    await page.locator('[data-market-option="position"]').selectOption('ST');
    await page.locator('[data-market-option="foot"]').selectOption('left');
    await page.locator('[data-market-option="sort"]').selectOption('priceAsc');
    assert(await page.evaluate(()=>marketPlayers().every(p=>p.position==='ST'&&p.foot==='left')));
    assert(await page.locator('#market-results tbody tr').count()>0);
    await page.locator('[data-page="tactics"]').first().click();
    await page.locator('[data-instructions="1"]').click();
    await page.locator('[data-instruction="movement"]').selectOption('invert');
    await page.locator('#modal .modal-close').click();
    assert.equal(await page.evaluate(()=>state.instructions[1].movement),'invert');
    await page.locator('[data-action="advance"]').first().click();
    await page.locator('[data-action="kickoff"]').click();
    assert.equal(await page.evaluate(()=>state.pending.minute),0);
    assert.equal(await page.locator('.live-player').count(),22);
    await page.locator('#live-slot').selectOption('1');
    await page.locator('[data-instruction="movement"]').selectOption('overlap');
    assert.equal(await page.evaluate(()=>state.instructions[1].movement),'overlap');
    await page.locator('[data-live-tactic="mentality"]').selectOption('1');
    await page.locator('#live-speed').selectOption('10');
    await page.locator('[data-manager="live-toggle"]').click();
    await page.waitForFunction(()=>state.pending.minute>=1);
    await page.locator('[data-manager="live-toggle"]').click();
    const pausedMinute=await page.evaluate(()=>state.pending.minute);
    await saved(); await page.reload(); await saved();
    assert.equal(await page.evaluate(()=>state.pending.minute),pausedMinute);
    await page.locator('[data-action="advance"]').first().click();
    await page.evaluate(()=>{while(state.pending.minute<44)G.advanceMinute(state);paintLive();});
    await page.locator('[data-manager="live-step"]').click();
    assert.equal(await page.evaluate(()=>state.pending.minute),45);
    assert.match(await page.locator('#live-minute').textContent(),/하프타임/);
    await page.locator('[data-manager="live-sub"]').click();
    assert.equal(await page.evaluate(()=>state.pending.substitutions),1);
    await page.locator('[data-manager="live-finish"]').click();
    await saved();assert.equal(await page.evaluate(()=>state.week),1);
    await page.locator('#modal .modal-close').click();
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
    await page.locator('#modal .modal-close').click();
    await page.setViewportSize({width:780,height:960});
    await page.locator('[data-action="advance"]').first().click();
    await page.locator('[data-action="kickoff"]').click();
    await page.screenshot({path:path.join(__dirname,'manager-preview.png'),fullPage:true});
    await page.locator('[data-manager="live-finish"]').click();await saved();
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
    console.log(`PASS: ${Buffer.byteLength(input)}-byte career import, quota reproduction, next week, reload, failed transaction recovery, ordered saves, season rollover, legacy migration; manager profiles, filters, instructions, live timing/resume/substitution, batch and cancellation.`);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
