'use strict';
// Manager controls share the existing game state and save path.
const marketFilters = { position:'ALL', foot:'ALL', sort:'ovr', stat:'passing', minStat:0, maxPrice:100000, minOvr:0 };
const footNames = {left:'왼발',right:'오른발',both:'양발'};
function playerPosition(p) { G.detail(p); return `<span class="position ${p.pos.toLowerCase()}" title="${G.POSITIONS[p.position]}">${p.position}</span><small> ${footNames[p.foot]}</small>`; }
function playerDetailsUI(p) {
  G.detail(p);
  return `<p class="muted">${G.POSITIONS[p.position]} · ${footNames[p.foot]} · 상위리그 열망 ${p.ambition}/100</p><div class="detail-stats">${Object.entries(G.DETAILS).map(([k,n])=>`<div><span>${n}</span><b>${p.attributes[k]}</b><meter min="0" max="100" value="${p.attributes[k]}"></meter></div>`).join('')}</div>`;
}
function selectOptions(options, current) { return Object.entries(options).map(([v,n])=>`<option value="${v}" ${String(v)===String(current)?'selected':''}>${n}</option>`).join(''); }
function marketFiltersUI() {
  return `<div class="manager-filters">${Object.entries({position:['세부 포지션',{ALL:'전체 포지션',...G.POSITIONS}],foot:['주발',{ALL:'모든 주발',...footNames}],sort:['정렬',{ovr:'오버롤 높은 순',priceAsc:'요구액 낮은 순',priceDesc:'요구액 높은 순',stat:'선택 능력치 높은 순'}],stat:['능력치',G.DETAILS]}).map(([k,[n,opts]])=>`<label>${n}<select data-market-option="${k}">${selectOptions(opts,marketFilters[k])}</select></label>`).join('')}${[['maxPrice','최대 요구액 (억)',100000],['minOvr','최소 오버롤',100],['minStat','선택 능력치 최소',99]].map(([k,n,max])=>`<label>${n}<input type="number" min="0" max="${max}" data-market-option="${k}" value="${marketFilters[k]}"></label>`).join('')}<button class="secondary" data-manager="clear-filters">필터 초기화</button></div>`;
}
function wageOfferUI(p) {
  const d=G.wageDemand(state,p);
  return `<div class="tip">${d.gap ? `상위리그 열망 ${p.ambition}/100 · ${d.gap}단계 아래 리그로 이동하므로 주급 ${Math.round(d.premium*100)}% 보상 요구` : '선수 개인 계약 · 주급은 매주 구단 자금에서 지출됩니다.'}<br>요구 주급 ${d.salary.toFixed(2)}억 / 현재 ${G.wage(p).toFixed(2)}억</div><label class="field-label" for="bid-salary">선수에게 제안할 주급 (억)</label><input id="bid-salary" name="salary" type="number" min="0" step="0.01" value="${G.wage(p).toFixed(2)}" required>`;
}
function instructionFields(slot) {
  if (!state.instructions) G.upgradeSave(state);
  return Object.entries(G.INSTRUCTIONS).map(([field,opts])=>`<label>${{movement:'이동 경로',runs:'전진 성향',passing:'개인 패스',pressing:'개인 압박'}[field]}<select data-instruction="${field}" data-instruction-slot="${slot}">${selectOptions(opts,state.instructions[slot][field])}</select></label>`).join('');
}
function instructionModal(slot) {
  const p=G.player(state,me().lineup[slot]);
  modal(`<span class="eyebrow">INDIVIDUAL INSTRUCTIONS</span><h2>${esc(p.name)} · ${G.SLOTS[me().tactics.formation][slot]}</h2><div class="manager-filters">${instructionFields(slot)}</div><p>안으로 좁히기는 중앙 지원과 볼 소유를, 오버랩은 측면 공격을 강화합니다. 적극적인 전진은 공격에 힘을 더하고 수비 복귀 공간을 남깁니다. 패스와 압박도 경기력에 반영됩니다.</p><p class="muted">지시는 전술 자리별로 저장되어 교체 선수에게 이어집니다.</p><button class="primary" data-action="close">완료</button>`);
}

let batchRunning=false, batchStop=false;
function batchDialog() {
  if (state.pending || batchRunning) return;
  modal(`<span class="eyebrow">ASSISTANT MANAGER</span><h2>연속 경기 진행</h2><label class="field-label" for="batch-count">진행할 리그 경기 수 (1~20)</label><input id="batch-count" type="number" min="1" max="20" value="3"><p>매 경기 체력·기량·세부 포지션을 고려해 선발을 자동 선정합니다. 컵 대회도 자동 로테이션으로 진행됩니다. 휴식 주간은 건너뛰며 시즌 종료 시 멈춥니다.</p><p class="muted">도착한 이적 제안은 주간 진행 중 만료될 수 있습니다. 매주 저장하며 중지 버튼으로 다음 주 진행을 멈출 수 있습니다.</p><button class="primary" data-manager="batch-start">자동 진행 시작</button>`);
}
async function runBatch() {
  const count=Number($('#batch-count')?.value);
  if (batchRunning || state.pending || !Number.isInteger(count)||count<1||count>20) return toast('1~20경기를 입력하세요.');
  batchRunning=true; batchStop=false;
  let completed=0, weeks=0;
  modal(`<h2>수석코치가 경기를 진행합니다</h2><p id="batch-progress" role="status"></p><div id="batch-results"></div><button class="secondary" data-manager="batch-stop">진행 중지</button>`);
  const results=[];
  try {
    while (!batchStop && completed<count && state.week<state.totalWeeks) {
      const m=G.autoWeek(state); if (!m) break;
      weeks++; if (!m.rest) { completed++; results.push(`${esc(state.clubs[m.h].name)} ${m.hg} : ${m.ag} ${esc(state.clubs[m.a].name)}`); }
      render(); $('#batch-progress').textContent=`${completed}/${count}경기 완료 · ${weeks}주 진행`;
      $('#batch-results').innerHTML=results.map(r=>`<p>${r}</p>`).join('');
      if (!await save()) { batchStop=true; break; }
      await new Promise(resolve=>setTimeout(resolve,120));
    }
  } catch { toast('자동 진행을 중단했습니다. 현재 커리어를 확인해 주세요.'); }
  finally {
    batchRunning=false;
    $('#batch-progress').textContent=`${completed}경기 완료 · ${weeks}주 진행${state.week>=state.totalWeeks?' · 시즌 종료':batchStop?' · 중지됨':''}`;
    const stop=$('[data-manager="batch-stop"]'); if(stop) { stop.textContent='감독실로 돌아가기'; stop.dataset.action='close'; delete stop.dataset.manager; }
  }
}

let liveRunning=false, liveTimer=null, liveLast=0, liveFraction=0, liveSpeed=1, liveSlot=0;
function pauseLive() { liveRunning=false; if(liveTimer) { clearInterval(liveTimer); liveTimer=null; } }
function openLive() {
  if (!state.pending) return;
  pauseLive(); liveFraction=0; G.upgradeSave(state);
  const m=state.pending.half;
  modal(`<div class="live-heading"><span class="eyebrow">2D TACTICAL MATCH · 감독 관전</span><h2>${esc(state.clubs[m.h].name)} <span id="live-score"></span> ${esc(state.clubs[m.a].name)}</h2><div class="live-toolbar"><b id="live-minute"></b><button class="primary" data-manager="live-toggle">재생</button><button class="secondary" data-manager="live-step">1분 진행</button><label>배속 <select id="live-speed">${selectOptions({1:'1× · 전후반 각각 5분',3:'3×',10:'10×'},liveSpeed)}</select></label><button class="secondary" data-manager="live-finish">남은 경기 자동 진행</button></div></div><div class="live-layout"><section><div class="live-pitch" id="live-pitch"><div class="live-center"></div><div class="live-box left"></div><div class="live-box right"></div>${G.matchPositions(state).map(q=>`<button class="live-player ${q.cid===0?'own':'opponent'}" data-live-player="${q.slot}" data-live-club="${q.cid}" data-player-dot="${q.id}" title="${esc(G.player(state,q.id).name)}"><b>${q.slot+1}</b><small>${esc(G.player(state,q.id).name)}</small></button>`).join('')}<span class="live-ball"></span></div><p class="muted">공격 방향: 홈 → / 원정 ← · 우리 선수 점을 눌러 개인 지시 · 선수 이동은 전술 위치를 보여주는 시뮬레이션입니다.</p><div id="live-summary"></div><div id="live-events" aria-live="polite"></div></section><aside class="live-instructions"><h3>경기 중 팀 지시</h3><div class="manager-filters">${[['mentality','성향',{'-1':'수비',0:'균형',1:'공격'}],['press','압박',{0:'낮게',1:'보통',2:'높게'}],['tempo','템포',{0:'느리게',1:'보통',2:'빠르게'}],['passing','패스',{0:'짧게',1:'혼합',2:'다이렉트'}],['line','수비 라인',{'-1':'낮게',0:'보통',1:'높게'}]].map(([k,n,o])=>`<label>${n}<select data-live-tactic="${k}">${selectOptions(o,me().tactics[k])}</select></label>`).join('')}</div><h3>선수별 움직임</h3><select id="live-slot">${me().lineup.map((id,i)=>`<option value="${i}" ${i===liveSlot?'selected':''}>${G.SLOTS[me().tactics.formation][i]} · ${esc(G.player(state,id).name)}</option>`).join('')}</select><div id="live-personal" class="manager-filters">${instructionFields(liveSlot)}</div><h3>선수 교체 <small>${state.pending.substitutions}/5</small></h3><label>OUT<select id="live-out">${me().lineup.map(id=>`<option value="${id}">${esc(G.player(state,id).name)}</option>`).join('')}</select></label><label>IN<select id="live-in">${G.roster(state).filter(p=>G.available(p)&&!me().lineup.includes(p.id)&&!state.pending.removed.includes(p.id)).map(p=>`<option value="${p.id}">${esc(p.name)} · ${p.position} · ${p.fitness}%</option>`).join('')}</select></label><button class="secondary" data-manager="live-sub" ${state.pending.substitutions>=5?'disabled':''}>교체 지시</button><p class="muted">지시 변경은 이후 경기 계산에 반영됩니다. 창을 닫거나 다른 탭으로 이동하면 일시정지합니다.</p></aside></div>`, 'live-modal');
  paintLive();
}
function paintLive() {
  if (!state.pending || !$('#live-minute')) return;
  const m=state.pending.half, minute=state.pending.minute;
  $('#live-score').textContent=`${m.hg} : ${m.ag}`;
  $('#live-minute').textContent=`${minute}′ ${minute===45&&!liveRunning?'하프타임':liveRunning?'진행 중':'일시정지'}`;
  $('[data-manager="live-toggle"]').textContent=liveRunning?'일시정지':minute===45?'후반전 시작':'재생';
  const dots=G.matchPositions(state,minute+liveFraction);
  dots.forEach(q=>{const el=$(`[data-player-dot="${q.id}"]`);if(el){el.style.left=q.x+'%';el.style.top=q.y+'%';}});
  const carrier=dots[Math.floor((minute+liveFraction)*2)%dots.length];
  if (carrier) { $('.live-ball').style.left=(carrier.x+1)+'%'; $('.live-ball').style.top=(carrier.y+1)+'%'; }
  $('#live-summary').textContent=`점유율 ${m.possession}% : ${100-m.possession}% · 슈팅 ${m.shots.join(' : ')} · xG ${m.homeXg.toFixed(2)} : ${m.awayXg.toFixed(2)}`;
  $('#live-events').innerHTML=m.events.slice(-6).reverse().map(e=>`<p>${e.minute}′ ⚽ ${esc(e.name)} · ${esc(e.text)}</p>`).join('') || '<p class="muted">양 팀이 공간을 탐색하고 있습니다.</p>';
}
function completeLive() {
  pauseLive(); const m=G.playWeek(state); save(); render(); matchReport(m);
}
function stepLive() {
  if (!state.pending) return;
  G.advanceMinute(state);
  if(state.pending.minute===90) { completeLive(); return; }
  if(state.pending.minute===45) pauseLive();
  if(state.pending.minute%5===0) save();
  paintLive();
}
function toggleLive() {
  if(liveRunning) {pauseLive();save();paintLive();return;}
  liveRunning=true; liveLast=performance.now();
  liveTimer=setInterval(()=>{
    if (!state.pending || !$('#modal').open || !$('#live-minute')) {pauseLive();return;}
    const now=performance.now(); liveFraction+=Math.min(1000,now-liveLast)/1000*.15*liveSpeed; liveLast=now;
    while(liveFraction>=1 && liveRunning) {liveFraction-=1;stepLive();}
    paintLive();
  },100);
  paintLive();
}
document.addEventListener('click', async e=>{
  const b=e.target.closest('button'); if(!b) return;
  if(b.dataset.action==='batch') batchDialog();
  if(b.dataset.instructions!==undefined) instructionModal(Number(b.dataset.instructions));
  if(b.dataset.salaryCounter) $('#bid-salary').value=b.dataset.salaryCounter;
  if(b.dataset.livePlayer!==undefined && b.dataset.liveClub==='0') { liveSlot=Number(b.dataset.livePlayer); $('#live-slot').value=liveSlot; $('#live-personal').innerHTML=instructionFields(liveSlot); }
  if(b.dataset.manager==='clear-filters') {Object.assign(marketFilters,{position:'ALL',foot:'ALL',sort:'ovr',stat:'passing',minStat:0,maxPrice:100000,minOvr:0});marketPos='ALL';marketQuery='';marketLeague='ALL';watchOnly=false;render();}
  if(b.dataset.manager==='batch-start') await runBatch();
  if(b.dataset.manager==='batch-stop') {batchStop=true;b.disabled=true;b.textContent='현재 주 저장 후 중지…';}
  if(b.dataset.manager==='live-toggle') toggleLive();
  if(b.dataset.manager==='live-step') {pauseLive();liveFraction=0;stepLive();save();}
  if(b.dataset.manager==='live-finish') completeLive();
  if(b.dataset.manager==='live-sub') {pauseLive();const r=G.substitute(state,Number($('#live-out').value),Number($('#live-in').value));if(r.ok){save();render();openLive();}toast(r.message);}
});
document.addEventListener('change', e=>{
  const el=e.target;
  if(el.dataset.marketOption) {const k=el.dataset.marketOption;marketFilters[k]=['maxPrice','minStat','minOvr'].includes(k)?Math.max(0,Number(el.value)||0):el.value;marketLimit=40;render();}
  if(el.dataset.instruction) {G.setInstruction(state,Number(el.dataset.instructionSlot),el.dataset.instruction,el.value);save();render();paintLive();}
  if(el.dataset.liveTactic) {G.setTactics(state,el.dataset.liveTactic,Number(el.value));save();render();paintLive();}
  if(el.id==='live-speed') liveSpeed=Number(el.value);
  if(el.id==='live-slot') {liveSlot=Number(el.value);$('#live-personal').innerHTML=instructionFields(liveSlot);}
});
document.addEventListener('click', e=>{if(batchRunning && e.target.closest('[data-action="close"]')){e.stopImmediatePropagation();batchStop=true;}},true);
document.addEventListener('visibilitychange',()=>{if(document.hidden && liveRunning){pauseLive();save();paintLive();}});
document.querySelector('#modal').addEventListener('close',()=>{if(liveRunning){pauseLive();save();}if(batchRunning)batchStop=true;});
document.querySelector('#modal').addEventListener('cancel',e=>{if(batchRunning){e.preventDefault();batchStop=true;}});
