'use strict';
// Manager controls share the existing game state and save path.
const marketDefaults = {position:'ALL',foot:'ALL',sort:'ovr',stat:'passing',minStat:0,maxPrice:100000,minOvr:0,minAge:15,maxAge:45,maxWage:1000,maxContract:10,minFitness:0,status:'ALL',stat2:'vision',minStat2:0};
const marketFilters = {...marketDefaults};
let compareIds=[], tacticSlot=1, tacticPhase='attack', tacticPlanSlot=0;
let squadView='ability', squadPos='ALL', squadSort='position', squadQuery='', squadAvailable=false, squadSeason='current';
let squadSortAsc=false, squadStatsDetailed=false;
const footNames = {left:'왼발',right:'오른발',both:'양발'};
function playerPosition(p) { G.detail(p); return `<span class="position ${p.pos.toLowerCase()}" title="${G.POSITIONS[p.position]}">${p.position}</span><small> ${footNames[p.foot]}</small>`; }
function playerDetailsUI(p) {
  G.detail(p);
  return `<p class="muted">${G.POSITIONS[p.position]} · ${footNames[p.foot]} · 상위리그 열망 ${p.ambition}/100</p>${G.prospectFactor(p)<1 ? `<p class="field-help">유스 실전 검증: 리그·컵 누적 ${G.seniorMinutes(p).toLocaleString()} / 2,700분 · 시장 가치 ${Math.round(G.prospectFactor(p)*100)}% 반영</p>` : ''}<div class="detail-stats">${Object.entries(G.DETAILS).map(([k,n])=>`<div><span>${n}</span><b>${p.attributes[k]}</b><meter min="0" max="100" value="${p.attributes[k]}"></meter></div>`).join('')}</div>`;
}
function selectOptions(options, current) { return Object.entries(options).map(([v,n])=>`<option value="${v}" ${String(v)===String(current)?'selected':''}>${n}</option>`).join(''); }
function marketFiltersUI() {
  const positions=Object.fromEntries(Object.entries(G.POSITIONS).filter(([p])=>marketPos==='ALL'||G.POSITION_GROUPS[marketPos].includes(p)));
  const selects={position:['세부 포지션',{ALL:marketPos==='ALL'?'전체 포지션':marketPos+' 전체',...positions}],foot:['주발',{ALL:'모든 주발',...footNames}],sort:['정렬',{ovr:'오버롤 높은 순',priceAsc:'요구액 낮은 순',priceDesc:'요구액 높은 순',stat:'선택 능력치 높은 순',age:'어린 순',wage:'주급 낮은 순',goals:'리그 득점 순',assists:'리그 도움 순',fitness:'체력 높은 순'}],status:['영입·출전 상태',{ALL:'전체',fit:'출전 가능',free:'자유 계약',transferable:'협상 가능'}],stat:['능력치 1',G.DETAILS],stat2:['능력치 2',G.DETAILS]};
  return '<div class="manager-filters">'+Object.entries(selects).map(([k,[label,opts]])=>`<label>${label}<select data-market-option="${k}">${selectOptions(opts,marketFilters[k])}</select></label>`).join('')+
    [['minAge','최소 나이',45],['maxAge','최대 나이',45],['maxWage','최대 현재 주급 (억)',1000],['maxContract','계약 잔여 기간 (년 이하)',10],['minFitness','최소 체력',100],['maxPrice','최대 요구액 (억)',100000],['minOvr','최소 오버롤',100],['minStat','능력치 1 최소',99],['minStat2','능력치 2 최소',99]].map(([k,label,max])=>`<label>${label}<input type="number" min="0" max="${max}" step="${k==='maxWage'?'0.01':'1'}" data-market-option="${k}" value="${marketFilters[k]}"></label>`).join('')+
    '<button class="secondary" data-manager="clear-filters">필터 초기화</button></div>'+`<div class="scout-tools"><button class="secondary small" data-market-quick="budget">현재 예산 이내</button><button class="secondary small" data-market-quick="youth">23세 이하 유망주</button><button class="secondary small" data-market-quick="free">자유 계약</button><button class="secondary small" data-manager="compare" ${compareIds.length<2?'disabled':''}>선수 비교 (${compareIds.length}/3)</button><span class="muted">도움은 업데이트 이후 기록 · 계약 기간은 현재 시즌 기준</span></div>`;
}
function wageOfferUI(p) {
  const d=G.wageDemand(state,p);
  return `<div class="tip">${d.gap ? `상위리그 열망 ${p.ambition}/100 · ${d.gap}단계 아래 리그로 이동하므로 주급 ${Math.round(d.premium*100)}% 보상 요구` : '선수 개인 계약 · 주급은 매주 구단 자금에서 지출됩니다.'}<br>요구 주급 ${d.salary.toFixed(2)}억 / 현재 ${G.wage(p).toFixed(2)}억</div><label class="field-label" for="bid-salary">선수에게 제안할 주급 (억)</label><input id="bid-salary" name="salary" type="number" min="0" step="0.01" value="${G.wage(p).toFixed(2)}" required>`;
}
function instructionFields(slot) {
  if (!state.instructions) G.upgradeSave(state);
  return Object.entries(G.INSTRUCTIONS).map(([field,opts])=>`<label>${{movement:'이동 경로',runs:'전진 성향',passing:'개인 패스',pressing:'개인 압박',dribbling:'드리블',shooting:'슈팅 판단',crossing:'크로스',marking:'마킹'}[field]}<select data-instruction="${field}" data-instruction-slot="${slot}">${selectOptions(opts,state.instructions[slot][field])}</select></label>`).join('');
}
function instructionModal(slot) {
  const p=G.player(state,me().lineup[slot]);
  modal(`<span class="eyebrow">INDIVIDUAL INSTRUCTIONS</span><h2>${esc(p.name)} · ${G.SLOTS[me().tactics.formation][slot]}</h2><div class="manager-filters">${instructionFields(slot)}</div>${targetFields(slot)}<p>안으로 좁히기는 중앙 지원과 볼 소유를, 오버랩은 측면 공격을 강화합니다. 적극적인 전진은 공격에 힘을 더하고 수비 복귀 공간을 남깁니다. 패스와 압박도 경기력에 반영됩니다.</p><p class="muted">지시는 전술 자리별로 저장되어 교체 선수에게 이어집니다.</p><button class="primary" data-action="close">완료</button>`);
}

let batchRunning=false, batchStop=false;
function remainingLeagueGames() { return state.fixtures.slice(state.week).filter(round => round.some(pair => pair.includes(0))).length; }
function batchDialog() {
  if (state.pending || batchRunning) return;
  const remaining=remainingLeagueGames();
  if (!remaining) { previewMatch(); return; }
  const max=Math.min(20,remaining);
  modal(`<span class="eyebrow">ASSISTANT MANAGER</span><h2>연속 경기 진행</h2><label class="field-label" for="batch-count">진행할 리그 경기 수 (1~${max} · 시즌 잔여 ${remaining}경기)</label><input id="batch-count" type="number" min="1" max="${max}" value="${Math.min(3,max)}"><p>매 경기 체력·기량·세부 포지션을 고려해 선발을 자동 선정합니다. 컵 대회도 자동 로테이션으로 진행됩니다. 휴식 주간은 건너뛰며 시즌 종료 시 멈춥니다.</p><p class="muted">도착한 이적 제안은 주간 진행 중 만료될 수 있습니다. 매주 저장하며 중지 버튼으로 다음 주 진행을 멈출 수 있습니다.</p><button class="primary" data-manager="batch-start">자동 진행 시작</button>`);
}
async function runBatch(restOnly = false) {
  if (batchRunning || state.pending) return;
  const max=Math.min(20,remainingLeagueGames()), count=restOnly?1:Number($('#batch-count')?.value);
  if (!restOnly && (!Number.isInteger(count)||count<1||count>max)) return toast(`1~${max}경기를 입력하세요.`);
  batchRunning=true; batchStop=false;
  let completed=0, weeks=0, cups=0, failed=false;
  modal(`<h2>${restOnly?'다음 경기까지 일정을 진행합니다':'수석코치가 경기를 진행합니다'}</h2><p id="batch-progress" role="status">일정 확인 중…</p><div id="batch-results"></div><button class="secondary" data-manager="batch-stop">진행 중지</button>`);
  const results=[];
  try {
    while (!batchStop && completed<count && state.week<state.totalWeeks && (!restOnly || !G.nextFixture(state))) {
      const cupStart=state.cupResults.length, m=G.autoWeek(state); if (!m) break;
      weeks++;
      const ownCups=state.cupResults.slice(cupStart).filter(m=>m.h===0 || m.a===0);
      cups+=ownCups.length;
      if (!m.rest) completed++;
      for (const game of [...(!m.rest?[m]:[]),...ownCups]) {
        const competition=game.competition?state.competitions.find(c=>c.id===game.competition).name:'리그';
        results.push(`${m.week+1}주 · ${esc(competition)} · ${esc(state.clubs[game.h].name)} ${game.hg} : ${game.ag} ${esc(state.clubs[game.a].name)}${game.penalties?` (승부차기 ${game.penalties.join(':')})`:''}`);
      }
      render(); $('#batch-progress').textContent=`${restOnly?'휴식 일정 처리 중':`${completed}/${count}경기 완료`} · 컵 ${cups}경기 · ${weeks}주 진행`;
      $('#batch-results').innerHTML=results.map(r=>`<p>${r}</p>`).join('');
      if (!await save()) { failed=true; break; }
      await new Promise(resolve=>setTimeout(resolve,120));
    }
  } catch { failed=true; toast('자동 진행을 중단했습니다. 현재 커리어를 확인해 주세요.'); }
  finally {
    batchRunning=false;
    const ended=state.week>=state.totalWeeks, leagueEnded=!remainingLeagueGames();
    $('#batch-progress').textContent=`${restOnly?'휴식 일정 처리':`${completed}경기 완료`} · 컵 ${cups}경기 · ${weeks}주 진행${failed?' · 오류로 중단됨':batchStop?' · 중지됨':ended?' · 시즌 종료':leagueEnded?' · 우리 팀 리그 일정 완료':''}`;
    if (ended && !failed) $('#modal h2').textContent=`${state.season} 시즌 일정이 끝났습니다`;
    if (!results.length) $('#batch-results').textContent='이 기간에는 우리 팀 경기가 없었습니다. 다른 리그 일정·회복·주급 정산을 처리했습니다.';
    const stop=$('[data-manager="batch-stop"]');
    if(stop) {
      stop.disabled=false;
      const next=!failed && !batchStop && (restOnly || leagueEnded);
      stop.textContent=next?(ended?'다음 시즌 시작':leagueEnded?'남은 시즌 일정 진행':'다음 경기 준비'):'감독실로 돌아가기';
      stop.dataset.action=next?'advance':'close'; delete stop.dataset.manager;
    }
  }
}

let liveRunning=false, liveTimer=null, liveLast=0, liveFraction=0, liveSpeed=1, liveSlot=0;
function pauseLive() { liveRunning=false; if(liveTimer) { clearInterval(liveTimer); liveTimer=null; } }
function openLive(autoplay = false) {
  if (!state.pending) return;
  pauseLive(); liveFraction=0; G.upgradeSave(state);
  const m=state.pending.half;
  modal(`<div class="live-heading"><span class="eyebrow">2D TACTICAL MATCH · 감독 관전</span><h2>${esc(state.clubs[m.h].name)} <span id="live-score"></span> ${esc(state.clubs[m.a].name)}</h2><div class="live-toolbar"><b id="live-minute"></b><button class="primary" data-manager="live-toggle">재생</button><button class="secondary" data-manager="live-step">1분 진행</button><label>배속 <select id="live-speed">${selectOptions({1:'1× · 전후반 각각 5분',3:'3×',10:'10×'},liveSpeed)}</select></label><button class="secondary" data-manager="live-finish">남은 경기 자동 진행</button></div></div><div class="live-layout"><section><div class="live-pitch" id="live-pitch"><div class="live-center"></div><div class="live-box left"></div><div class="live-box right"></div>${G.matchPositions(state).map(q=>`<button class="live-player ${q.cid===0?'own':'opponent'}" data-live-player="${q.slot}" data-live-club="${q.cid}" data-player-dot="${q.id}" title="${esc(G.player(state,q.id).name)}"><b>${q.slot+1}</b><small>${esc(G.player(state,q.id).name)}</small></button>`).join('')}<span class="live-ball"></span></div><p class="muted">공격 방향: 홈 → / 원정 ← · 우리 선수 점을 눌러 개인 지시 · 선수 이동은 전술 위치를 보여주는 시뮬레이션입니다.</p><p id="live-action" role="status"></p><div id="live-summary"></div><div id="live-events" aria-live="polite"></div></section><aside class="live-instructions"><h3>경기 중 팀 지시</h3><div class="manager-filters">${[['mentality','성향',{'-1':'수비',0:'균형',1:'공격'}],['press','압박',{0:'낮게',1:'보통',2:'높게'}],['tempo','템포',{0:'느리게',1:'보통',2:'빠르게'}],['passing','패스',{0:'짧게',1:'혼합',2:'다이렉트'}],['line','수비 라인',{'-1':'낮게',0:'보통',1:'높게'}]].map(([k,n,o])=>`<label>${n}<select data-live-tactic="${k}">${selectOptions(o,me().tactics[k])}</select></label>`).join('')}</div><h3>선수별 움직임</h3><select id="live-slot">${me().lineup.map((id,i)=>`<option value="${i}" ${i===liveSlot?'selected':''}>${G.SLOTS[me().tactics.formation][i]} · ${esc(G.player(state,id).name)}</option>`).join('')}</select><div id="live-personal" class="manager-filters">${instructionFields(liveSlot)}${targetFields(liveSlot)}</div><h3>선수 교체 <small>${state.pending.substitutions}/5</small></h3><label>OUT<select id="live-out">${me().lineup.map(id=>`<option value="${id}">${esc(G.player(state,id).name)}</option>`).join('')}</select></label><label>IN<select id="live-in">${G.roster(state).filter(p=>G.available(p)&&!me().lineup.includes(p.id)&&!state.pending.removed.includes(p.id)).map(p=>`<option value="${p.id}">${esc(p.name)} · ${p.position} · ${p.fitness}%</option>`).join('')}</select></label><button class="secondary" data-manager="live-sub" ${state.pending.substitutions>=5?'disabled':''}>교체 지시</button><p class="muted">지시 변경은 이후 경기 계산에 반영됩니다. 창을 닫거나 다른 탭으로 이동하면 일시정지합니다.</p></aside></div>`, 'live-modal');
  paintLive();
  if (autoplay && state.pending.minute !== 45) toggleLive();
}
function paintLive() {
  if (!state.pending || !$('#live-minute')) return;
  const m=state.pending.half, minute=state.pending.minute;
  $('#live-score').textContent=`${m.hg} : ${m.ag}`;
  $('#live-minute').textContent=`${minute}′ ${minute===45&&!liveRunning?'하프타임':liveRunning?'진행 중':'일시정지'}`;
  $('[data-manager="live-toggle"]').textContent=liveRunning?'일시정지':minute===45?'후반전 시작':'재생';
  const dots=G.matchPositions(state,minute+liveFraction);
  dots.forEach(q=>{const el=$(`[data-player-dot="${q.id}"]`);if(el){el.style.left=q.x+'%';el.style.top=q.y+'%';}});
  const action=m.lastAction, carrier=dots.find(p=>p.id===action?.player)||dots[0], receiver=dots.find(p=>p.id===action?.receiver);
  if(carrier){const goal=['goal','shot'].includes(action?.type), target=goal?{x:action.club===m.h?99:1,y:50}:action?.type==='carry'?carrier:receiver||carrier;
    $('.live-ball').style.left=(carrier.x+(target.x-carrier.x)*Math.min(1,liveFraction))+'%';$('.live-ball').style.top=(carrier.y+(target.y-carrier.y)*Math.min(1,liveFraction))+'%';}
  if($('#live-action'))$('#live-action').textContent=action?G.player(state,action.player).name+' · '+({pass:'패스 연결',carry:'공을 몰고 전진',shot:'슈팅',goal:'득점'})[action.type]:'킥오프 준비';
  $('#live-summary').textContent=`점유율 ${m.possession}% : ${100-m.possession}% · 슈팅 ${m.shots.join(' : ')} · 유효슈팅 ${(m.onTarget||[0,0]).join(' : ')} · xG ${m.homeXg.toFixed(2)} : ${m.awayXg.toFixed(2)}`;
  $('#live-events').innerHTML=m.events.slice(-6).reverse().map(e=>`<p>${e.minute}′ ⚽ ${esc(e.name)}${e.assistName?' (도움 '+esc(e.assistName)+')':''} · ${esc(e.text)}</p>`).join('') || '<p class="muted">양 팀이 공간을 탐색하고 있습니다.</p>';
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
  const b=e.target.closest('button'); if(!b || b.disabled) return;
  if(b.dataset.action==='batch') batchDialog();
  if(b.dataset.instructions!==undefined) instructionModal(Number(b.dataset.instructions));
  if(b.dataset.salaryCounter) $('#bid-salary').value=b.dataset.salaryCounter;
  if(b.dataset.livePlayer!==undefined && b.dataset.liveClub==='0') { liveSlot=Number(b.dataset.livePlayer); $('#live-slot').value=liveSlot; $('#live-personal').innerHTML=instructionFields(liveSlot)+targetFields(liveSlot); }
  if(b.dataset.manager==='clear-filters') {Object.assign(marketFilters,marketDefaults);marketPos='ALL';marketQuery='';marketLeague='ALL';watchOnly=false;render();}
  if(b.dataset.manager==='batch-start') await runBatch();
  if(b.dataset.manager==='batch-stop') {batchStop=true;b.disabled=true;b.textContent='현재 주 저장 후 중지…';}
  if(b.dataset.manager==='live-toggle') toggleLive();
  if(b.dataset.manager==='live-step') {pauseLive();liveFraction=0;stepLive();save();}
  if(b.dataset.manager==='live-finish') completeLive();
  if(b.dataset.manager==='live-sub') {pauseLive();const r=G.substitute(state,Number($('#live-out').value),Number($('#live-in').value));if(r.ok){save();render();openLive();}toast(r.message);}
});
document.addEventListener('change', e=>{
  const el=e.target;
  if(el.dataset.marketOption) {const k=el.dataset.marketOption;marketFilters[k]=typeof marketDefaults[k]==='number'?Math.max(0,Number(el.value)||0):el.value;marketLimit=40;render();}
  if(el.dataset.instruction) {G.setInstruction(state,Number(el.dataset.instructionSlot),el.dataset.instruction,el.value);save();render();paintLive();}
  if(el.dataset.liveTactic) {G.setTactics(state,el.dataset.liveTactic,Number(el.value));save();render();paintLive();}
  if(el.id==='live-speed') liveSpeed=Number(el.value);
  if(el.id==='live-slot') {liveSlot=Number(el.value);$('#live-personal').innerHTML=instructionFields(liveSlot)+targetFields(liveSlot);}
});
document.addEventListener('click', e=>{if(batchRunning && e.target.closest('[data-action="close"]')){e.stopImmediatePropagation();batchStop=true;}},true);
document.addEventListener('visibilitychange',()=>{if(document.hidden && liveRunning){pauseLive();save();paintLive();}});
document.querySelector('#modal').addEventListener('close',()=>{if(liveRunning){pauseLive();save();}if(batchRunning)batchStop=true;});
document.querySelector('#modal').addEventListener('cancel',e=>{if(batchRunning){e.preventDefault();batchStop=true;}});

// Tactical targets use the same coordinates as the match model: own goal on the left.
function targetFields(slot) {
  return '<details class="target-fields" open><summary>정확한 이동 위치 (5~95 · 공격 방향 →)</summary><div class="manager-filters">'+['attack','defend'].map(phase=>{
    const pos=G.tacticalPosition(state,0,slot,phase);
    return ['x','y'].map(axis=>`<label>${phase==='attack'?'공 소유':'수비'} · ${axis==='x'?'전진 위치':'측면 위치'}<input type="number" min="5" max="95" value="${Math.round(pos[axis])}" data-target-slot="${slot}" data-target-phase="${phase}" data-target-axis="${axis}"></label>`).join('');
  }).join('')+'</div></details>';
}
function tacticWorkshop() {
  const plan=state.tacticPlans?.[tacticPlanSlot];
  return `<section class="panel tactic-workshop"><div class="panel-head"><h2>움직임 설계</h2><span>공격 방향 →</span></div><div class="scout-tools"><label>선수 <select id="tactic-slot">${me().lineup.map((id,i)=>`<option value="${i}" ${i===tacticSlot?'selected':''}>${i+1}. ${esc(G.player(state,id).name)} · ${G.SLOTS[me().tactics.formation][i]}</option>`).join('')}</select></label><button class="${tacticPhase==='attack'?'primary':'secondary'} small" data-target-view="attack">공 소유 시</button><button class="${tacticPhase==='defend'?'primary':'secondary'} small" data-target-view="defend">수비 시</button><button class="secondary small" data-instructions="${tacticSlot}">선수 플레이 지시</button><button class="secondary small" data-reset-target="${tacticSlot}">선택 선수 위치 초기화</button></div>
  <div class="tactic-workspace"><div><p class="field-help">선수를 선택한 뒤 피치의 원하는 지점을 누르세요. 선은 수비 위치에서 공격 위치로 이어집니다. 위쪽은 왼쪽 측면입니다.</p><div id="tactic-map" class="live-pitch tactic-map"><div class="live-center"></div><div class="live-box left"></div><div class="live-box right"></div><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${me().lineup.map((id,i)=>{const a=G.tacticalPosition(state,0,i,'attack'),d=G.tacticalPosition(state,0,i,'defend');return `<line x1="${d.x}" y1="${d.y}" x2="${a.x}" y2="${a.y}" class="${i===tacticSlot?'selected':''}"/><circle cx="${tacticPhase==='attack'?d.x:a.x}" cy="${tacticPhase==='attack'?d.y:a.y}" r="1.2"/>`;}).join('')}</svg>${me().lineup.map((id,i)=>{const pos=G.tacticalPosition(state,0,i,tacticPhase);return `<button class="live-player ${i===tacticSlot?'selected':''}" data-target-player="${i}" style="left:${pos.x}%;top:${pos.y}%" aria-label="${esc(G.player(state,id).name)} 위치 편집"><b>${i+1}</b><small>${esc(G.player(state,id).name)}</small></button>`;}).join('')}</div></div><div><h3>${esc(G.player(state,me().lineup[tacticSlot]).name)}</h3><div class="manager-filters">${instructionFields(tacticSlot)}</div>${targetFields(tacticSlot)}<p class="field-help">높은 공격 위치는 공격 지원과 수비 복귀 부담을 함께 늘립니다. 밀착 수비·돌파·슈팅 빈도는 선수 능력과 함께 계산됩니다.</p></div></div>
  <div class="scout-tools"><label>전술 보관함 <select id="tactic-plan-slot">${selectOptions(Object.fromEntries([0,1,2].map(i=>[i,state.tacticPlans?.[i]?.name||'빈 전술 '+(i+1)])),tacticPlanSlot)}</select></label><label>이름 <input id="tactic-plan-name" maxlength="40" value="${esc(plan?.name||'')}"></label><button class="secondary small" data-tactic-plan="save" ${state.pending?'disabled':''}>현재 전술 저장</button><button class="secondary small" data-tactic-plan="load" ${!plan||state.pending?'disabled':''}>불러오기</button><span class="muted">팀 전술·개인 지시·이동 위치를 보관합니다. 불러올 때 선발을 자동 선정합니다.</span></div></section>`;
}
function playerStatsForSeason(p, season = 'current') {
  if (season === 'current') {
    const st = p.leagueStats || {};
    const leagueGoals = p.goals || 0, cupGoals = p.cupGoals || 0, totalGoals = leagueGoals + cupGoals;
    const assists = st.assists || 0, points = leagueGoals + assists;
    const starts = st.starts || 0, apps = p.appearances || 0, subIn = Math.max(0, apps - starts);
    const minutes = st.minutes || 0, shots = st.shots || 0, onTarget = st.onTarget || 0, cleanSheets = p.pos === 'GK' ? st.cleanSheets || 0 : 0;
    return { season: state.season, apps, starts, subIn, leagueGoals, cupGoals, totalGoals, assists, points, minutes, shots, onTarget, cleanSheets };
  }
  const h = p.history?.find(x => String(x.season) === String(season));
  if (!h) return { season, apps: 0, starts: 0, subIn: 0, leagueGoals: 0, cupGoals: 0, totalGoals: 0, assists: 0, points: 0, minutes: 0, shots: 0, onTarget: 0, cleanSheets: 0 };
  const apps = h.appearances || 0, starts = h.starts || 0, subIn = h.subIn || Math.max(0, apps - starts);
  const leagueGoals = h.goals || 0, cupGoals = h.cupGoals || 0, totalGoals = leagueGoals + cupGoals;
  const assists = h.assists || 0, points = leagueGoals + assists;
  const minutes = h.minutes || 0, shots = h.shots || 0, onTarget = h.onTarget || 0, cleanSheets = p.pos === 'GK' ? h.cleanSheets || 0 : 0;
  return { season: h.season, apps, starts, subIn, leagueGoals, cupGoals, totalGoals, assists, points, minutes, shots, onTarget, cleanSheets };
}
function squadPlayers() {
  const ps = G.roster(state).filter(p => (squadPos === 'ALL' || p.pos === squadPos) && (!squadAvailable || G.available(p)) && p.name.toLowerCase().includes(squadQuery.toLowerCase()));
  const score = p => {
    if (squadView === 'stats') {
      const st = playerStatsForSeason(p, squadSeason);
      if (squadSort === 'goals') return st.leagueGoals;
      if (squadSort === 'p90') return st.minutes ? st.leagueGoals * 90 / st.minutes : -1;
      if (Object.hasOwn(st, squadSort)) return st[squadSort];
      return G.ovr(p);
    }
    return squadSort === 'goals' ? p.goals : squadSort === 'assists' ? p.leagueStats?.assists || 0 : squadSort === 'minutes' ? p.leagueStats?.minutes || 0 : squadSort === 'fitness' ? p.fitness : squadSort === 'wage' ? G.wage(p) : G.ovr(p);
  };
  return ps.sort((a, b) => squadSort === 'position' ? ['GK', 'DF', 'MF', 'FW'].indexOf(a.pos) - ['GK', 'DF', 'MF', 'FW'].indexOf(b.pos) || G.ovr(b) - G.ovr(a) : (score(b) - score(a)) * (squadView === 'stats' && squadSortAsc ? -1 : 1) || a.id - b.id);
}
function squadScreen() {
  const roster = G.roster(state);
  const avgAge = (roster.reduce((a, p) => a + p.age, 0) / Math.max(1, roster.length)).toFixed(1);
  const bestOvr = Math.round(me().lineup.reduce((a, id) => a + G.ovr(G.player(state, id)), 0) / 11);
  const pastSeasons = [...new Set(roster.flatMap(p => p.history?.map(h => h.season) || []))].sort((a, b) => b - a);

  const seasonOptions = { current: `${state.season} 시즌 (현재)` };
  pastSeasons.forEach(s => { seasonOptions[s] = `${s} 시즌 (지난 시즌)`; });

  const viewOptions = { ability: '능력·컨디션', stats: '시즌 성적 (기록)', contract: '계약 & 재정' };
  const sortOptions = squadView === 'stats'
    ? { goals: '리그 득점', assists: '리그 도움', points: '리그 공격포인트', minutes: '출전 시간', apps: '출전 경기', starts: '선발 경기', cupGoals: '컵 득점', p90: '리그 90분당 골', shots: '슈팅', onTarget: '유효슈팅', cleanSheets: 'GK 클린시트', position: '포지션', ovr: '오버롤' }
    : squadView === 'contract'
    ? { wage: '주급 높은 순', ovr: '오버롤 높은 순', position: '포지션' }
    : { position: '포지션', ovr: '오버롤 높은 순', fitness: '체력 높은 순', wage: '주급 높은 순' };

  let totalTeamGoals = 0, totalTeamAssists = 0, totalCupGoals = 0, topScorer = null;
  roster.forEach(p => {
    const st = playerStatsForSeason(p, squadSeason);
    totalTeamGoals += st.leagueGoals;
    totalCupGoals += st.cupGoals;
    totalTeamAssists += st.assists;
    if (!topScorer || st.leagueGoals > topScorer.goals) topScorer = { name: p.name, goals: st.leagueGoals };
  });

  return `<section class="panel">
    <div class="panel-head">
      <div>
        <h2>스쿼드 관리 · <span class="count">${roster.length} / 25명</span></h2>
        <span class="muted">평균 ${avgAge}세 · 베스트11 ${bestOvr} OVR · 주간 급여 ${cash(G.payroll(state))}</span>
      </div>
      <button class="secondary small" data-action="auto" ${state.pending ? 'disabled' : ''}>베스트 11 자동 선정</button>
    </div>
    ${squadView === 'stats' ? `
      <div class="squad-season-bar">
        <label>시즌 선택 <select data-squad-option="season">${selectOptions(seasonOptions, squadSeason)}</select></label>
        <label class="squad-detail-toggle"><input type="checkbox" data-squad-option="detailed" ${squadStatsDetailed ? 'checked' : ''}> 상세 기록 표시 <span class="muted">슈팅 · 유효슈팅 · 90분당 골</span></label>
      </div>
      <div class="squad-season-summary" aria-label="현재 스쿼드의 선택 시즌 기록 합계">
        <div><span>리그 득점</span><strong>${totalTeamGoals}<small>골</small></strong></div>
        <div><span>리그 도움</span><strong>${totalTeamAssists}<small>도움</small></strong></div>
        <div><span>컵 득점</span><strong>${totalCupGoals}<small>골</small></strong></div>
        <div><span>리그 최다 득점</span><strong class="squad-top-scorer">${topScorer?.goals > 0 ? esc(topScorer.name) : '기록 없음'}</strong><small>${topScorer?.goals > 0 ? topScorer.goals + '골 · ' : ''}현재 스쿼드 기준</small></div>
      </div>
    ` : ''}
    <div class="manager-filters">
      <label>보기<select data-squad-option="view">${selectOptions(viewOptions, squadView)}</select></label>
      <label>포지션<select data-squad-option="position">${selectOptions({ ALL: '전체', GK: 'GK', DF: 'DF', MF: 'MF', FW: 'FW' }, squadPos)}</select></label>
      <label>정렬<select data-squad-option="sort">${selectOptions(sortOptions, squadSort)}</select></label>
      <label>선수 검색<input id="squad-search" value="${esc(squadQuery)}" placeholder="선수 이름"></label>
      <label>상태<select data-squad-option="available">${selectOptions({ all: '전체 선수', fit: '출전 가능만' }, squadAvailable ? 'fit' : 'all')}</select></label>
    </div>
    <div id="squad-table">${squadTable()}</div>
  </section>${loanPanel()}`;
}
function squadTable() {
  const ps = squadPlayers();
  if (squadView === 'stats') {
    if (!ps.length) return '<p class="empty-state">해당 조건에 맞는 선수가 없습니다.</p>';
    const common = [['apps', '출전'], ['starts', '선발'], ['minutes', '출전 시간']];
    const attack = [['goals', '리그 골'], ['assists', '도움'], ['points', '공격포인트'], ['cupGoals', '컵 골']];
    const extra = [['shots', '슈팅'], ['onTarget', '유효슈팅'], ['p90', '90분당 골']];
    const groups = [[false, '필드 선수'], [true, '골키퍼']];
    return `<p class="squad-stat-help">열 제목을 누르면 정렬됩니다 · ${squadSort === 'position' ? '포지션 순' : squadSortAsc ? '낮은 순 ↑' : '높은 순 ↓'} · 컵 골을 제외한 모든 기록은 리그 기준</p>` + groups.map(([keeper, title]) => {
      const players = ps.filter(p => (p.pos === 'GK') === keeper);
      if (!players.length) return '';
      const columns = keeper ? [...common, ['cleanSheets', '클린시트'], ...(squadStatsDetailed ? [...attack, ...extra] : [])] : [...common, ...attack, ...(squadStatsDetailed ? extra : [])];
      return `<section class="squad-stat-group"><h3>${title} <span>${players.length}명</span></h3><div class="table-wrap squad-stats-scroll" tabindex="0" role="region" aria-label="${title} 시즌 기록"><table class="players-table squad-stats-table"><caption class="sr-only">${squadSeason === 'current' ? state.season : squadSeason} 시즌 ${title} 기록</caption><thead><tr><th scope="col">선수 / 포지션</th>${columns.map(([key, label]) => `<th scope="col" aria-sort="${squadSort === key ? squadSortAsc ? 'ascending' : 'descending' : 'none'}"><button data-squad-sort="${key}" aria-label="${label} ${squadSort === key && !squadSortAsc ? '낮은' : '높은'} 순 정렬">${label}<span aria-hidden="true">${squadSort === key ? squadSortAsc ? '↑' : '↓' : '↕'}</span></button></th>`).join('')}</tr></thead><tbody>${players.map(p => {
        const st = playerStatsForSeason(p, squadSeason);
        const values = {...st, goals: st.leagueGoals, minutes: st.minutes.toLocaleString() + '분', p90: st.minutes ? (st.leagueGoals * 90 / st.minutes).toFixed(2) : '—'};
        return `<tr data-stat-player="${p.id}"><td><button class="player-name" data-profile="${p.id}" title="${esc(p.name)}">${esc(p.name)}</button><small><span class="position ${p.pos.toLowerCase()}">${p.position}</span> ${G.POSITIONS[p.position]}</small></td>${columns.map(([key]) => `<td data-stat="${key}" class="${squadSort === key ? 'stat-sorted' : ''} ${values[key] === 0 ? 'stat-zero' : ''}">${values[key]}</td>`).join('')}</tr>`;
      }).join('')}</tbody></table></div></section>`;
    }).join('') + `<p class="panel-note">${ps.length}명 표시 · 공격포인트 = 리그 골 + 도움 · 클린시트 = 60분 이상 출전한 골키퍼의 팀 무실점 경기<br>선수 이름을 누르면 프로필을 확인할 수 있습니다. 과거 저장에 누락된 세부 기록은 소급되지 않습니다.</p>`;
  }

  if (squadView === 'contract') {
    const headers = ['나이', 'OVR', '주급', '계약 만료', '잔여 기간', '예상 위약금', '이적 명단', '관리'];
    return `<div class="table-wrap"><table class="players-table"><thead><tr><th>선수</th><th>포지션</th>${headers.map(h => '<th>' + h + '</th>').join('')}</tr></thead><tbody>${ps.map(p => {
      const penalty = G.contractTerminationPenalty(state, p.id);
      const isListed = state.transferList?.includes(p.id) || p.transferListed;
      return `<tr>
        <td><button class="player-name" data-profile="${p.id}">${esc(p.name)}</button></td>
        <td>${playerPosition(p)}</td>
        <td>${p.age}세</td>
        <td>${rating(p)}</td>
        <td>${G.wage(p).toFixed(2)}억</td>
        <td>${p.contract}년</td>
        <td>${Math.max(1, p.contract - state.season)}년</td>
        <td class="warning-text">${penalty.toFixed(1)}억</td>
        <td>${isListed ? '<span class="tag" style="background:var(--accent);color:#000">등록 중</span>' : '<span class="muted">미등록</span>'}</td>
        <td><div style="display:flex;gap:0.3rem"><button class="secondary small" data-renew="${p.id}">계약 관리</button><button class="secondary small" data-transfer-list="${p.id}">${isListed ? '해제' : '이적 등록'}</button></div></td>
      </tr>`;
    }).join('')}</tbody></table>${ps.length ? '' : '<p class="empty-state">해당 조건에 맞는 선수가 없습니다.</p>'}</div><p class="panel-note">${ps.length}명 표시 · 계약 관리에서 재계약 제안 및 상호 합의 계약 해지를 진행할 수 있습니다.</p>`;
  }

  const headers = ['나이', 'OVR', '공격', '수비', '기술', '속도', '체력', '시장 가치', '사기', '주급', '계약', '상태'];
  return `<div class="table-wrap"><table class="players-table"><thead><tr><th>선수</th><th>포지션</th>${headers.map(h => '<th>' + h + '</th>').join('')}</tr></thead><tbody>${ps.map(p => {
    const status = p.injury ? '부상 ' + p.injury + '주' : p.banned ? '출장 정지' : (state.transferList?.includes(p.id) || p.transferListed) ? '이적 명단' : me().lineup.includes(p.id) ? '선발' : '벤치';
    const values = [p.age, G.ovr(p), p.atk, p.def, p.tech, p.pace, p.fitness + '%', G.value(p) + '억', p.morale + '%', G.wage(p).toFixed(2) + '억', p.contract + '년', status];
    return `<tr><td><button class="player-name" data-profile="${p.id}">${esc(p.name)}</button></td><td>${playerPosition(p)}</td>${values.map(v => '<td>' + v + '</td>').join('')}</tr>`;
  }).join('')}</tbody></table>${ps.length ? '' : '<p class="empty-state">조건에 맞는 선수가 없습니다.</p>'}</div><p class="panel-note">${ps.length}명 표시 · 선수 이름을 눌러 능력·계약·개인 면담을 확인하세요.</p>`;
}
function comparePlayers() {
  const ps=compareIds.map(id=>G.player(state,id)).filter(Boolean);
  if(ps.length<2)return;
  const rows=[['나이',p=>p.age],['오버롤',p=>G.ovr(p)],['요구액 (억)',p=>G.askingPrice(state,p.id)],['현재 주급 (억)',p=>G.wage(p).toFixed(2)],['체력',p=>p.fitness],['리그 득점',p=>p.goals],...Object.entries(G.DETAILS).map(([k,label])=>[label,p=>G.detail(p).attributes[k]])];
  modal(`<h2>선수 비교</h2><div class="table-wrap"><table><thead><tr><th>항목</th>${ps.map(p=>'<th>'+esc(p.name)+'<br>'+playerPosition(p)+'</th>').join('')}</tr></thead><tbody>${rows.map(([label,get])=>'<tr><th>'+label+'</th>'+ps.map(p=>'<td>'+get(p)+'</td>').join('')+'</tr>').join('')}</tbody></table></div><p class="field-help">이적료와 현재 주급을 비교합니다. 이적 시 요구 주급은 협상 화면에서 확인하세요.</p>`);
}
function repaintTactics() { render(); if($('#modal').open && !$('#live-minute') && $('#modal [data-target-axis]'))instructionModal(Number($('#modal [data-target-slot]').dataset.targetSlot)); }
document.addEventListener('click',e=>{
 const b=e.target.closest('button'); if(b?.disabled)return;
 if(b?.dataset.squadSort){const key=b.dataset.squadSort;squadSortAsc=squadSort===key?!squadSortAsc:false;squadSort=key;const region=b.closest('.squad-stats-scroll'),left=region.scrollLeft,label=region.getAttribute('aria-label');render();const next=[...document.querySelectorAll('.squad-stats-scroll')].find(x=>x.getAttribute('aria-label')===label);if(next){next.scrollLeft=left;next.querySelector(`[data-squad-sort="${key}"]`)?.focus({preventScroll:true});}return;}
 if(b?.dataset.targetPlayer!==undefined){tacticSlot=Number(b.dataset.targetPlayer);render();return;}
 if(b?.dataset.targetView){tacticPhase=b.dataset.targetView;render();}
 if(b?.dataset.resetTarget!==undefined){const slot=Number(b.dataset.resetTarget);G.setTarget(state,slot,'attack',null,null);G.setTarget(state,slot,'defend',null,null);save();render();}
 if(b?.dataset.tacticPlan){const ok=G.tacticPlan(state,tacticPlanSlot,b.dataset.tacticPlan,$('#tactic-plan-name').value);if(ok){save();render();toast(b.dataset.tacticPlan==='save'?'전술을 보관했습니다.':'전술을 불러오고 선발을 재선정했습니다.');}}
 if(b?.dataset.comparePlayer){const id=Number(b.dataset.comparePlayer);if(compareIds.includes(id))compareIds=compareIds.filter(x=>x!==id);else if(compareIds.length<3)compareIds.push(id);else return toast('비교는 최대 3명까지 가능합니다.');render();}
 if(b?.dataset.manager==='compare')comparePlayers();
 if(b?.dataset.marketQuick){const kind=b.dataset.marketQuick;if(kind==='budget')marketFilters.maxPrice=Math.max(0,state.budget);if(kind==='youth')marketFilters.maxAge=23;if(kind==='free')marketFilters.status='free';marketLimit=40;render();}
 const pitch=e.target.closest('#tactic-map');
 if(pitch&&!b){const r=pitch.getBoundingClientRect();G.setTarget(state,tacticSlot,tacticPhase,Math.max(5,Math.min(95,Math.round((e.clientX-r.left)/r.width*100))),Math.max(5,Math.min(95,Math.round((e.clientY-r.top)/r.height*100))));save();render();}
});
document.addEventListener('change',e=>{
 const el=e.target;
 if(el.id==='tactic-slot'){tacticSlot=Number(el.value);render();}
 if(el.id==='tactic-plan-slot'){tacticPlanSlot=Number(el.value);render();}
 if(el.dataset.targetAxis){const slot=Number(el.dataset.targetSlot),phase=el.dataset.targetPhase,p=G.tacticalPosition(state,0,slot,phase);p[el.dataset.targetAxis]=Number(el.value);if(!G.setTarget(state,slot,phase,p.x,p.y))toast('위치는 5~95 사이로 지정하세요.');else save();repaintTactics();paintLive();}
 if(el.dataset.squadOption){const k=el.dataset.squadOption;if(k==='view'){squadView=el.value;squadSort=squadView==='stats'?'goals':'position';squadSortAsc=false;}if(k==='season')squadSeason=el.value;if(k==='position')squadPos=el.value;if(k==='sort'){squadSort=el.value;squadSortAsc=false;}if(k==='detailed')squadStatsDetailed=el.checked;if(k==='available')squadAvailable=el.value==='fit';render();}
});
document.addEventListener('input',e=>{if(e.target.id==='squad-search'){squadQuery=e.target.value;$('#squad-table').innerHTML=squadTable();}});
