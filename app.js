'use strict';
const G = FM, SAVE_KEY = 'touchline-save-v3';
let state, storageWarning = '', page = 'overview', marketPos = 'ALL', marketQuery = '', watchOnly = false, selectedSlot = null, viewedLeague = 0, marketLeague = 'ALL', chosenLeague = 0, chosenNation = 'ENGLAND', marketLimit = 40, viewedCup = 'champions';
let saveDatabase, saveQueue = Promise.resolve(), saveRevision = 0, saveStatus = '저장 불러오는 중…';
function openSaveDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('touchline', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('saves');
    request.onerror = () => reject(request.error);
    let blocked = false;
    request.onblocked = () => { blocked = true; reject(new Error('다른 게임 탭을 닫고 다시 시도하세요.')); };
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
function saveRecord(mode, raw) {
  return new Promise((resolve, reject) => {
    const transaction = saveDatabase.transaction('saves', mode), store = transaction.objectStore('saves');
    const request = mode === 'readonly' ? store.get(SAVE_KEY) : store.put(raw, SAVE_KEY);
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = transaction.onerror = () => reject(transaction.error || request.error || new Error('저장 실패'));
  });
}
const $ = q => document.querySelector(q);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cash = n => `${Number(n).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}<small>억</small>`;
const me = () => state.clubs[0];
const targetFor = i => { const c = G.CLUBS[i], pos = G.LEAGUES[c[4]].teams.indexOf(c[0]); return pos < 5 ? 4 : pos < 13 ? 6 : 9; };
const icons = {
  overview: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  squad: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4a6 6 0 0 1 3 5"/>',
  tactics: '<rect x="3" y="2" width="18" height="20" rx="2"/><path d="M3 12h18M8 2v4h8V2m-8 20v-4h8v4"/><circle cx="12" cy="12" r="3"/>',
  market: '<path d="M4 7h16m-5-5 5 5-5 5M20 17H4m5-5-5 5 5 5"/>',
  league: '<path d="M7 3h10v5a5 5 0 0 1-10 0V3ZM7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4m-5 1v6m-5 2h10"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6m10-6v6M3 11h18"/>',
  search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
  wallet: '<path d="M20 7V4H5a3 3 0 0 0 0 6h16v10H5a3 3 0 0 1-3-3V7m19 5h-5v5h5"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  save: '<path d="M5 3h12l4 4v14H3V3h2Zm2 0v6h10V3M7 21v-8h10v8"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 0c0 3-3 2-3 5m0 3v1"/>'
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.overview}</svg>`;
const badge = (cid, size = '') => `<span class="crest ${size}" style="--club:${(state.clubs[cid]?.color || '#89949a')}"><span>${esc(state.clubs[cid]?.short || 'FA')}</span><i>★</i></span>`;
const posTag = pos => `<span class="position ${pos.toLowerCase()}">${pos}</span>`;
const rating = p => `<span class="rating ${G.ovr(p) >= 80 ? 'elite' : ''}">${G.ovr(p)}</span>`;
const form = c => c.form.length ? c.form.map(x => `<span class="form ${x}">${x}</span>`).join('') : '<span class="muted">시즌 개막 전</span>';
function save() {
  const revision = ++saveRevision, raw = JSON.stringify(state);
  saveStatus = '저장 중…';
  $('#save-state')?.replaceChildren(document.createTextNode(saveStatus));
  // Keep snapshots ordered; a failed write must not prevent later saves.
  saveQueue = saveQueue.then(() => saveRecord('readwrite', raw)).then(() => {
    if (revision === saveRevision) saveStatus = '자동 저장됨';
    return true;
  }, () => {
    if (revision === saveRevision) {
      saveStatus = '저장 실패 · 파일 백업 필요';
      toast('자동 저장에 실패했습니다. 진행 내용은 화면에 유지됩니다. 커리어 메뉴에서 저장 파일을 내려받아 주세요.');
    }
    return false;
  }).then(ok => {
    $('#save-state')?.replaceChildren(document.createTextNode(saveStatus));
    return ok;
  });
  return saveQueue;
}
let toastTimer;
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4500); }
function dateLabel() { const d = new Date(Date.UTC(state.season, 7, 8 + (state.week + (state.summerWeek || 0)) * 7)); return `${d.getUTCFullYear()}. ${String(d.getUTCMonth() + 1).padStart(2, '0')}. ${String(d.getUTCDate()).padStart(2, '0')}`; }
const titles = { overview: ['감독실', '한눈에 보는 우리 팀의 오늘.'], squad: ['스쿼드', '최고의 열한 명을 찾아보세요.'], tactics: ['전술 보드', '당신의 철학이 경기를 바꿉니다.'], market: ['이적시장', '다음 승리를 위한 한 수.'], scouting: ['스카우팅', '숫자 너머에 숨어 있는 가능성.'], training: ['훈련 & 의료', '매일의 훈련이 경기력의 차이를 만듭니다.'], youth: ['유소년 아카데미', '우리 팀의 미래가 자라는 곳.'], office: ['구단 운영', '구단의 미래를 위한 책임 있는 선택.'], league: ['리그 센터', '1부의 정상부터 3부의 도전까지.'], cups: ['컵 & 유럽대항전', '국경을 넘어, 가장 큰 무대로.'] };
function render() {
  const finished = state.week >= state.totalWeeks, leagueEnded = !remainingLeagueGames(), rank = G.standings(state).findIndex(c => c.id === 0) + 1, clubCount = state.clubs.length, leagueCount = state.leagues.length;
  $('#app').innerHTML = `<aside class="sidebar">
    <a class="brand" href="#overview" aria-label="Touchline 감독실"><span class="brand-symbol">t<span>l</span></span>TOUCHLINE<span class="brand-dot">®</span></a>
    <div class="club-box">${badge(0)}<div><strong>${esc(me().name)}</strong><span>${esc(state.leagues[0].name)}</span></div></div>
    <div class="nav-label">MANAGEMENT</div>
    <nav aria-label="주 메뉴">${Object.entries(titles).map(([key, [title]]) => `<button class="nav-item ${page === key ? 'active' : ''}" data-page="${key}" ${page === key ? 'aria-current="page"' : ''}>${icon({scouting:'search',training:'bolt',youth:'star',office:'wallet',cups:'league'}[key] || key)}<span>${title}</span>${key === 'market' && G.windowOpen(state) ? '<span class="nav-pip"></span>' : ''}</button>`).join('')}</nav>
    <div class="sidebar-bottom"><div class="season-box"><span class="eyebrow">${state.season} SEASON</span><strong>당신의 축구, 당신의 철학.</strong><div class="season-progress"><i style="width:${state.week / state.totalWeeks * 100}%"></i></div><span>시즌 ${state.week} / ${state.totalWeeks}주 · 리그 ${me().played}경기 완료</span></div><button class="nav-item" data-action="help">${icon('help')}<span>플레이 가이드</span></button><button class="manager" data-action="settings"><span class="avatar">MS</span><span><strong>나의 감독 커리어</strong><small>${esc(me().name)} 감독</small></span>${icon('chevron')}</button></div>
  </aside><div class="workspace"><header class="topbar"><div class="breadcrumb">나의 커리어 <span>/</span> <b>${titles[page][0]}</b></div><div class="topbar-right"><span class="save-label"><i></i><span id="save-state">${esc(saveStatus)}</span></span>${G.summerOpen(state) ? '<button class="secondary" data-action="summer-week">여름 시장 1주 진행</button>' : ''}<button class="secondary" data-action="batch" ${state.pending ? 'disabled' : ''}>연속 진행</button><span class="date">${icon('calendar')}${dateLabel()}</span><button class="primary" data-action="advance">${finished ? '다음 시즌 시작' : state.pending ? `경기 관전 · ${state.pending.minute ?? 45}′` : leagueEnded ? '남은 시즌 일정 진행' : '다음 경기 진행'}${icon('arrow')}</button></div></header>
  <main><div class="page-heading"><div><div class="eyebrow">${state.season} / ${state.season + 1} SEASON <span class="heading-line"></span> ${finished ? 'SEASON COMPLETE' : `MATCHWEEK ${String(state.week + 1).padStart(2, '0')}`}</div><h1>${titles[page][0]}<span class="title-dot">.</span></h1><p>${titles[page][1]}</p></div><div class="window-status ${G.windowOpen(state) ? 'open' : ''}"><i></i>이적시장 ${G.windowOpen(state) ? 'OPEN' : 'CLOSED'}<span>${G.transferWindowLabel(state)}</span></div></div>
  ${G.summerOpen(state) ? '<div class="match-banner">여름 이적시장: 최대 4주간 협상·AI 이적 진행. 주급과 운영비가 정산됩니다. 준비가 끝나면 다음 시즌을 바로 시작할 수 있습니다.</div>' : ''}${state.pending ? `<div class="match-banner">${state.pending.minute ?? 45}분 · 경기 진행 중. 관전 화면에서 전술과 교체를 지시하세요.</div>` : ''}${page === 'overview' ? overview(rank) : page === 'squad' ? squadPage() : page === 'tactics' ? tacticsPage() : page === 'market' ? marketPage() : page === 'league' ? leaguePage() : managementPage()}
  <footer><span>TOUCHLINE <b>MANAGER SIMULATION</b></span><span>12개국 · ${leagueCount}개 리그 · ${clubCount}개 구단 · 가상 선수 데이터 · 감독 모드</span></footer></main></div>`;
}
function metric(label, value, detail, name) { return `<div class="metric"><div class="metric-top">${label}${icon(name)}</div><strong>${value}</strong><span>${detail}</span></div>`; }
function leagueRounds(league) { return Math.max(...(league.groupSizes || [league.teams.length]).map(size => 2 * (size - 1))); }
function overview(rank) {
  const s = G.strength(state, 0), next = G.nextFixture(state), opponent = next ? state.clubs[next.find(x => x !== 0)] : null, finished = state.week >= state.totalWeeks, rest = !finished && !next, leagueEnded = !remainingLeagueGames(), leagueSize = state.leagues[0].teams.length;
  return `<section class="metrics">${metric('이적 예산', cash(state.budget), '자유롭게 설계하는 다음 영입', 'wallet')}${metric('리그 순위', `${state.week ? rank : '–'}<small> / ${leagueSize}</small>`, `${me().pts} 승점 · ${me().wins}승 ${me().draws}무 ${me().losses}패`, 'league')}${metric('스쿼드 전력', `${Math.round((s.attack + s.defense + s.control) / 3)}<small>OVR</small>`, `${G.roster(state).length}명의 선수 · 선발 및 전술 반영`, 'squad')}${metric('팀 컨디션', `${s.fitness}<small>%</small>`, s.fitness > 80 ? '좋은 몸 상태로 경기를 준비 중' : '로테이션과 압박 조절이 필요합니다', 'bolt')}</section>
  <div class="dashboard-top"><section class="match-hero"><div class="hero-top"><span class="live-label"><i></i>${opponent ? 'NEXT MATCH' : rest ? (leagueEnded ? 'LEAGUE COMPLETE' : 'REST WEEK') : 'SEASON COMPLETE'}</span><span>${esc(state.leagues[0].name)} · ${Math.min(state.week + 1, state.totalWeeks)}R</span></div>${opponent ? `<div class="hero-teams"><div>${badge(0, 'large')}<h2>${esc(me().name)}</h2><span>${next[0] === 0 ? 'HOME' : 'AWAY'}</span></div><div class="versus">VS<span>${dateLabel()}</span></div><div>${badge(opponent.id, 'large')}<h2>${esc(opponent.name)}</h2><span>${next[0] === 0 ? 'AWAY' : 'HOME'}</span></div></div><div class="hero-bottom"><span>${icon('tactics')}${esc(state.clubs[next[0]].stadium)}<b>·</b> 19:00 KICK-OFF</span><button class="light-button" data-action="advance">경기 준비${icon('arrow')}</button></div>` : rest ? `<div class="season-finish"><span class="trophy">${icon('calendar')}</span><h2>${leagueEnded ? '우리 팀 리그 일정 완료' : '이번 주는 휴식 주간'}</h2><p>${leagueEnded ? `${me().played}경기 완료 · 남은 컵 대회와 다른 리그 일정을 마무리하세요.` : '다음 리그 경기까지 휴식 주간을 한 번에 진행합니다.'}</p><button class="primary" data-action="advance">${leagueEnded ? '남은 시즌 일정 진행' : '다음 경기까지 진행'}${icon('arrow')}</button></div>` : `<div class="season-finish"><span class="trophy">${icon('league')}</span><h2>시즌 최종 ${rank}위</h2><p>${me().wins}승 ${me().draws}무 ${me().losses}패, ${me().pts}승점. 다음 이야기는 당신의 손에.</p><button class="primary" data-action="advance">다음 시즌 시작${icon('arrow')}</button></div>`}</section>
  <section class="panel tactic-preview"><div class="panel-head"><h2>우리 팀의 플레이</h2><button class="text-button" data-page="tactics">전술 수정 ${icon('arrow')}</button></div><div class="mini-tactics">${pitch(true)}<div class="tactic-summary"><span class="eyebrow">FORMATION</span><strong>${me().tactics.formation}</strong><span class="tactic-chip">${['수비적으로', '균형 잡힌 플레이', '공격적으로'][me().tactics.mentality + 1]}</span><dl><dt>압박 강도</dt><dd>${['낮음', '보통', '높음'][me().tactics.press]}</dd><dt>패스 템포</dt><dd>${['느리게', '보통', '빠르게'][me().tactics.tempo]}</dd></dl><span class="muted">${s.fitness < 75 ? '피로한 선수의 휴식을 권장합니다' : '우리만의 플레이를 완성하세요'}</span></div></div></section></div>
  <div class="dashboard-bottom"><section class="panel"><div class="panel-head"><h2>이적 레이더 <span class="count">SCOUTING</span></h2><button class="text-button" data-page="market">시장 전체 보기 ${icon('arrow')}</button></div><div class="scout-list">${recommendations().map(p => scoutCard(p)).join('')}</div><div class="panel-note">${icon('market')}선수 교환과 현금을 조합해 최적의 딜을 만들어보세요.</div></section>
  <section class="panel"><div class="panel-head"><h2>리그 테이블</h2><button class="text-button" data-page="league">전체 ${icon('arrow')}</button></div>${table(true)}</section></div>
  ${cupStrip()}<section class="panel inbox"><div class="panel-head"><h2>감독의 인박스 <span class="count">${state.incoming.length + Math.min(state.news.length, 2)}</span></h2><span class="muted">구단의 최신 소식</span></div>${state.incoming.map(offerRow).join('')}${state.news.slice(0, 2).map(n => `<div class="news-row"><span class="news-icon">${icon(n.type === 'transfer' ? 'market' : n.type === 'match' ? 'tactics' : 'squad')}</span><div><strong>${esc(n.title)}</strong><p>${esc(n.text)}</p></div><span class="news-time">${n.week}R</span></div>`).join('')}</section>`;
}
function recommendations() { return state.players.filter(p => p.club !== 0).sort((a, b) => (G.ovr(b) - G.askingPrice(state, b.id) * .17) - (G.ovr(a) - G.askingPrice(state, a.id) * .17)).slice(0,30).filter(p=>G.canRelease(state,p.id)).slice(0, 3); }
function scoutCard(p) { return `<button class="scout-card" data-negotiate="${p.id}"><span class="player-silhouette" style="--club:${(state.clubs[p.club]?.color || '#89949a')}"><span>${p.name.slice(0, 1)}</span><i>${esc(state.clubs[p.club]?.short || 'FA')}</i></span><div class="scout-player"><strong>${esc(p.name)} ${playerPosition(p)}</strong><span>${esc(state.clubs[p.club]?.name || '자유 계약')} · ${p.age}세</span><div><b>${cash(G.askingPrice(state, p.id))}</b><small>예상 요구액</small></div></div>${rating(p)}${icon('chevron')}</button>`; }
function table(compact = false, league = 0) {
  const rows = G.standings(state, league).slice(0, compact ? 5 : state.leagues[league].teams.length);
  return `<div class="table-wrap"><table class="league-table ${compact ? 'compact' : ''}"><thead><tr><th>#</th><th>구단</th><th>경기</th>${compact ? '' : '<th>승</th><th>무</th><th>패</th><th>득실</th>'}<th>승점</th>${compact ? '' : '<th>최근 5경기</th>'}</tr></thead><tbody>${rows.map((c, i) => `<tr class="${c.id === 0 ? 'my-team' : ''}"><td>${i + 1}</td><td><button class="table-club" data-club-roster="${c.id}" aria-label="${esc(c.name)} 로스터 보기">${badge(c.id, 'tiny')}${esc(c.name)}${c.id === 0 ? '<small>MY</small>' : ''}</button></td><td>${c.played}</td>${compact ? '' : `<td>${c.wins}</td><td>${c.draws}</td><td>${c.losses}</td><td>${c.gf - c.ga > 0 ? '+' : ''}${c.gf - c.ga}</td>`}<td class="points">${c.pts}</td>${compact ? '' : `<td><span class="forms">${form(c)}</span></td>`}</tr>`).join('')}</tbody></table></div>`;
}
function pitch(mini = false) {
  const formation = me().tactics.formation, slots = G.FORMATIONS[formation], rows = ['FW', 'MF', 'DF', 'GK'];
  return `<div class="pitch ${mini ? 'mini' : ''}"><div class="pitch-lines"><div class="half-line"></div><div class="center-circle"></div><div class="box top"></div><div class="box bottom"></div><div class="goal top"></div><div class="goal bottom"></div></div><div class="pitch-players">${rows.map(pos => `<div class="pitch-row">${slots.map((x, i) => ({ pos: x, i })).filter(x => x.pos === pos).map(({ i }) => {
    const p = G.player(state, me().lineup[i]);
    return `<button class="pitch-player ${selectedSlot === i ? 'selected' : ''} ${p.pos !== pos ? 'out-of-position' : ''}" data-slot="${i}" title="${esc(p.name)} · ${pos} 슬롯 · ${G.ovr(p)} OVR" aria-label="${esc(p.name)} ${pos} 슬롯 선수 변경"><span class="shirt">${mini ? '' : G.ovr(p)}</span>${mini ? '' : `<strong>${esc(p.name)}</strong><span>${p.injury ? '부상' : p.banned ? '출장 정지' : G.suitability(p,G.SLOTS[formation][i])<1 ? G.SLOTS[formation][i]+' · 적합도 '+Math.round(G.suitability(p,G.SLOTS[formation][i])*100)+'%' : G.SLOTS[formation][i]} <b>${p.fitness}%</b></span>`}</button>`;
  }).join('')}</div>`).join('')}</div></div>`;
}
function squadPage() { return squadScreen(); }
function segmented(field, options) { return `<div class="segmented">${options.map(([v, label]) => `<button data-tactic="${field}" data-value="${v}" class="${String(me().tactics[field]) === String(v) ? 'selected' : ''}" aria-pressed="${String(me().tactics[field]) === String(v)}">${label}</button>`).join('')}</div>`; }
function tacticsPage() {
  const s = G.strength(state, 0);
  return `${tacticWorkshop()}<div class="tactics-layout"><section class="panel pitch-panel"><div class="panel-head"><h2>STARTING XI <span class="count">${me().tactics.formation}</span></h2><button class="text-button" data-action="auto">${icon('bolt')}자동 선정</button></div>${pitch()}<div class="pitch-caption"><span><i></i>${esc(me().name)} · 선발 라인업</span><span>유니폼을 눌러 선수 변경</span></div>${roleControls()}</section><div class="tactics-controls"><section class="panel"><div class="panel-head"><h2>팀 전술</h2><span class="count">LIVE</span></div><div class="control-section"><label>포메이션</label>${segmented('formation', Object.keys(G.FORMATIONS).map(k => [k, k]))}<p>포메이션을 바꾸면 선발을 자동으로 재구성합니다.</p></div><div class="control-section"><label>팀 성향</label>${segmented('mentality', [[-1, '수비적'], [0, '균형'], [1, '공격적']])}<p>공격적일수록 득점 기회와 실점 위험이 함께 증가합니다.</p></div><div class="control-section"><label>압박 강도</label>${segmented('press', [[0, '낮음'], [1, '보통'], [2, '높음']])}<p>강한 압박은 점유율을 높이지만 체력을 더 소모합니다.</p></div><div class="control-section"><label>패스 템포</label>${segmented('tempo', [[0, '느리게'], [1, '보통'], [2, '빠르게']])}<p>빠른 템포는 상대의 강한 압박을 공략하고, 느린 템포는 점유율에 유리합니다.</p></div>${advancedTactics()}</section><section class="panel analysis-panel"><div class="panel-head"><h2>전술 분석</h2></div>${[['공격', s.attack], ['수비', s.defense], ['볼 컨트롤', s.control]].map(([label, n]) => `<div class="stat-bar"><span>${label}</span><div><i style="width:${Math.min(100, n)}%"></i></div><b>${Math.round(n)}</b></div>`).join('')}<div class="tip">${icon('bolt')}선발 평균 체력 ${s.fitness}%. 경기 후 회복량보다 소모량이 많으면 로테이션이 필요합니다.</div></section></div></div>`;
}
function marketPage() {
  const ps = marketPlayers();
  return `<div class="market-summary"><div>${icon('wallet')}<span>사용 가능 예산<strong>${cash(state.budget)}</strong></span></div><p>현금 영입부터 선수 트레이드까지.<br><span>협상 테이블에서 팀의 미래를 만들어보세요.</span></p><button class="secondary" data-action="history">거래 내역 ${icon('arrow')}</button></div>
  ${state.transferList?.length ? `<section class="panel"><div class="panel-head"><h2>우리 팀 이적 명단 <span class="count">${state.transferList.length}명</span></h2><span class="muted">타 구단 영입 제안 유치 중</span></div><div class="scout-list">${state.transferList.map(id => G.player(state, id)).filter(Boolean).map(p => `<div class="news-row" style="padding:0.75rem 1rem;display:flex;align-items:center;justify-content:space-between"><div><strong>${esc(p.name)} ${playerPosition(p)}</strong><p>${p.age}세 · 가치 ${cash(G.value(p))} · ${me().lineup.includes(p.id) ? '선발' : '벤치'}</p></div><div style="display:flex;gap:0.4rem"><button class="secondary small" data-sell="${p.id}" ${!G.windowOpen(state)?'disabled':''}>판매 협상</button><button class="secondary small" data-transfer-list="${p.id}">등록 해제</button></div></div>`).join('')}</div></section>` : ''}
  ${state.incoming.length ? `<section class="panel offer-panel"><div class="panel-head"><h2>도착한 이적 제안 <span class="count">${state.incoming.length}</span></h2><span class="muted">다음 경기 진행 시 만료</span></div>${state.incoming.map(offerRow).join('')}</section>` : ''}
  <section class="panel"><div class="market-leagues"><label for="market-league">스카우팅 지역</label><select id="market-league"><option value="ALL">전 세계 · ${state.clubs.length}개 구단</option>${state.leagues.map((l,i)=>`<option value="${i}" ${String(i)===marketLeague?'selected':''}>${esc(l.name)}</option>`).join('')}<option value="FREE" ${marketLeague==='FREE'?'selected':''}>자유 계약 선수</option></select></div>${marketFiltersUI()}<div class="market-toolbar"><div class="filter-tabs" role="group" aria-label="포지션 필터">${['ALL', 'GK', 'DF', 'MF', 'FW'].map(pos => `<button data-filter="${pos}" class="${marketPos === pos ? 'active' : ''}">${pos === 'ALL' ? '전체 선수' : pos}</button>`).join('')}</div><div class="market-search"><button class="watch-filter ${watchOnly ? 'selected' : ''}" data-action="watch-filter" aria-pressed="${watchOnly}">${icon('star')}관심 선수</button><label class="search-box">${icon('search')}<input id="market-search" placeholder="선수·구단 검색" aria-label="선수 또는 구단 검색" value="${esc(marketQuery)}"></label></div></div><div id="market-results">${marketTable(ps)}</div></section>`;
}
function marketPlayers() { return G.filterPlayers(state, {...marketFilters, position: marketFilters.position === 'ALL' ? marketPos : marketFilters.position}).filter(p => (marketPos === 'ALL' || p.pos === marketPos) && (marketLeague === 'ALL' || (marketLeague === 'FREE' ? p.club === -1 : state.clubs[p.club]?.league === Number(marketLeague))) && (!watchOnly || state.watch.includes(p.id)) && (p.name + (state.clubs[p.club]?.name || '자유 계약')).toLowerCase().includes(marketQuery.toLowerCase())); }

function marketTable(ps) {
  return `<div class="table-wrap"><table class="players-table"><thead><tr><th>관심 / 비교</th><th>선수</th><th>소속 구단</th><th>포지션</th><th>나이</th><th>종합</th><th>시장 가치</th><th>예상 요구액</th><th>${G.DETAILS[marketFilters.stat]}</th><th></th></tr></thead><tbody>${ps.slice(0,marketLimit).map(p => `<tr><td><button class="star-button ${state.watch.includes(p.id) ? 'on' : ''}" data-watch="${p.id}" aria-label="${esc(p.name)} 관심 선수 ${state.watch.includes(p.id) ? '해제' : '등록'}" aria-pressed="${state.watch.includes(p.id)}">${icon('star')}</button><button class="text-button" data-compare-player="${p.id}" aria-pressed="${compareIds.includes(p.id)}">${compareIds.includes(p.id)?'비교 해제':'비교 추가'}</button></td><td><button class="player-name" data-profile="${p.id}"><span class="small-avatar">${p.name[0]}</span>${esc(p.name)}</button></td><td><span class="table-club">${badge(p.club, 'tiny')}${esc(state.clubs[p.club]?.name || '자유 계약')}</span></td><td>${playerPosition(p)}</td><td>${p.age}</td><td>${rating(p)}</td><td>${cash(G.value(p))}</td><td class="price">${cash(G.askingPrice(state, p.id))}</td><td>${G.detail(p).attributes[marketFilters.stat]}</td><td><button class="bid-button" data-negotiate="${p.id}" ${p.loan || !G.windowOpen(state) && p.club !== -1 ? 'disabled' : ''}>협상하기 ${icon('arrow')}</button></td></tr>`).join('')}</tbody></table>${!ps.length ? '<div class="empty-state">조건에 맞는 선수가 없습니다.<span>검색어 또는 포지션 필터를 바꿔보세요.</span></div>' : ''}</div><div class="panel-note">${ps.length}명의 선수 · ${Math.min(ps.length,marketLimit)}명 표시 ${ps.length>marketLimit?'<button class="text-button" data-action="more-market">40명 더 보기 →</button>':''}</div>`;
}
function offerRow(o) {
  const p = G.player(state, o.player);
  return `<div class="news-row offer-row"><span class="news-icon lime">${icon('market')}</span><div><strong>${esc(state.clubs[o.club].name)}의 ${esc(p.name)} 영입 제안 <span class="tag">NEW</span></strong><p>현금 ${o.cash}억 원 · 선수 가치 ${G.value(p)}억 원 · ${me().lineup.includes(p.id) ? '현재 선발 선수' : '현재 벤치 선수'}</p></div><button class="secondary small" data-offer="${o.id}">제안 검토${icon('arrow')}</button></div>`;
}
function leaguePage() {
  const league = state.leagues[viewedLeague], rounds = leagueRounds(league), groupText = league.groupSizes ? ` · ${league.groupSizes.length}개 그룹` : '';
  return `${leagueTabs()}<section class="panel"><div class="panel-head"><h2>${state.season} ${esc(league.name)}</h2><span class="muted">${league.teams.length}개 구단${groupText} · 홈 & 어웨이 · ${rounds}라운드</span></div>${table(false, viewedLeague)}</section><div class="league-bottom"><section class="panel"><div class="panel-head"><h2>${esc(me().name)} 경기 일정</h2></div><div class="fixtures">${state.fixtures.map((f, i) => {
    const fixture = f.find(m => m.includes(0)), result = state.results.find(r => r.week === i && (r.h === 0 || r.a === 0));
    if (!fixture) return `<div class="fixture rest-fixture ${i === state.week ? 'next' : ''}"><span class="round">${String(i + 1).padStart(2, '0')}R</span><span class="muted">우리 팀 리그 휴식 주간</span><span class="muted">${i === state.week ? 'NEXT' : '—'}</span></div>`;
    const [h, a] = fixture;
    return `<div class="fixture ${i === state.week ? 'next' : ''}"><span class="round">${String(i + 1).padStart(2, '0')}R</span><span class="fixture-team">${badge(h, 'tiny')}${esc(state.clubs[h].name)}</span><b>${result ? `${result.hg} : ${result.ag}` : 'vs'}</b><span class="fixture-team">${badge(a, 'tiny')}${esc(state.clubs[a].name)}</span>${result ? `<button class="text-button" data-result="${i}">리포트</button>` : `<span class="muted">${i === state.week ? 'NEXT' : '예정'}</span>`}</div>`;
  }).join('')}</div></section><section class="panel scorers"><div class="panel-head"><h2>득점 순위</h2>${icon('league')}</div>${state.players.filter(p => state.clubs[p.club]?.league === viewedLeague).sort((a, b) => b.goals - a.goals || G.ovr(b) - G.ovr(a)).slice(0, 8).map((p, i) => `<div class="scorer"><span>${i + 1}</span><div><strong>${esc(p.name)}</strong><small>${esc(state.clubs[p.club]?.name || '자유 계약')}</small></div><b>${p.goals}<small>골</small></b></div>`).join('')}</section></div>`;
}
function modal(content, cls = '') { const d = $('#modal'); d.className = cls; d.innerHTML = `<button class="modal-close" data-action="close" aria-label="닫기">${icon('close')}</button>${content}`; if (!d.open) d.showModal(); }
function careerHistoryUI(p) {
  const history = p.history || [];
  if (!history.length) return '';
  return `<div class="career-stats-section" style="margin-top:0.75rem">
    <span class="eyebrow" style="margin-bottom:0.25rem;display:block">CAREER HISTORY (지난 시즌 기록)</span>
    <div class="table-wrap" style="max-height:160px;overflow-y:auto">
      <table class="players-table" style="font-size:0.8rem">
        <thead>
          <tr>
            <th>시즌</th><th>소속</th><th>출전(선발)</th><th>골(컵)</th><th>도움</th><th>공격P</th><th>출전 분</th>
          </tr>
        </thead>
        <tbody>
          ${history.slice().reverse().map(h => `<tr>
            <td>${h.season}</td>
            <td>${esc(h.clubName || '자유 계약')}</td>
            <td>${h.appearances}(${h.starts || 0})</td>
            <td>${h.goals + (h.cupGoals || 0)}${h.cupGoals ? `(${h.cupGoals})` : ''}</td>
            <td>${h.assists || 0}</td>
            <td>${(h.goals + (h.cupGoals || 0)) + (h.assists || 0)}</td>
            <td>${h.minutes ? h.minutes.toLocaleString() + '분' : '-'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}
function clubRoster(id) {
  const club=state.clubs[Number(id)];if(!club)return;
  const squad=G.roster(state,club.id).slice().sort((a,b)=>Object.keys(G.POSITION_GROUPS).indexOf(a.pos)-Object.keys(G.POSITION_GROUPS).indexOf(b.pos)||G.ovr(b)-G.ovr(a));
  const capacity=G.clubMarketCapacity(state,club), starters=new Set(club.lineup);
  modal(`<span class="eyebrow">CLUB ROSTER</span><h2>${esc(club.name)} 로스터</h2><p class="modal-desc">${esc(state.leagues[club.league].name)} · ${club.tactics.formation} · ${squad.length}/25명<br>평균 OVR ${(squad.reduce((n,p)=>n+G.ovr(p),0)/Math.max(1,squad.length)).toFixed(1)} · 선수 주급 합계 ${squad.reduce((n,p)=>n+G.wage(p),0).toFixed(2)}억${club.id!==0?`<br>남은 시즌 영입 예산 ${capacity.budget.toFixed(2)}억 · 선수 1명 주급 한도 ${capacity.wage.toFixed(2)}억`:''}</p><p class="field-help">${Object.entries(G.clubFacilities(state, club.id)).map(([key,level])=>`${({training:'훈련',youth:'아카데미',recovery:'회복',stadium:'구장'})[key]} LV.${level}/${G.upgradeLimit('facilities',key)}`).join(' · ')}${club.id ? '<br>매 시즌 남은 예산의 25% 안에서 시설 한 곳 자동 개선 · 유지비 없음' : ''}</p><div class="table-wrap"><table id="club-roster-table"><thead><tr><th>선수</th><th>포지션</th><th>나이</th><th>OVR</th><th>주급</th><th>계약 만료</th><th>골 / 도움</th><th>기용·상태</th></tr></thead><tbody>${squad.map(p=>`<tr><td><button class="player-name" data-profile="${p.id}">${esc(p.name)}</button></td><td>${playerPosition(p)}</td><td>${p.age}</td><td>${rating(p)}</td><td>${G.wage(p).toFixed(2)}억</td><td>${p.contract}년</td><td>${p.goals} / ${p.leagueStats?.assists||0}</td><td>${starters.has(p.id)?'선발':'벤치'}${p.loan?' · 임대':''}${p.injury?' · 부상':p.banned?' · 출장 정지':''}</td></tr>`).join('')}</tbody></table></div><p class="field-help">현재 소속 1군 명단입니다. 선수 이름을 누르면 상세 능력과 커리어 기록을 볼 수 있습니다.</p>`,'club-roster-modal');
}
function profile(id) {
  const p = G.player(state, id);
  modal(`<span class="eyebrow">PLAYER PROFILE</span><div class="profile-header"><span class="profile-avatar">${p.name[0]}</span><div><h2>${esc(p.name)}</h2><p>${esc(state.clubs[p.club]?.name || '자유 계약')} · ${p.age}세 ${playerPosition(p)}</p></div>${rating(p)}</div>${p.club>=0?`<button class="secondary full" data-club-roster="${p.club}">소속 구단 로스터 보기</button>`:''}${playerDetailsUI(p)}<div class="detail-rows"><p>시장 가치 <b>${cash(G.value(p))}</b></p><p>주급 <b>${G.wage(p).toFixed(2)}억</b></p><p>컨디션 <b>${p.fitness}%</b></p><p>시즌 득점 <b>${p.goals}골 · ${p.appearances}경기</b></p><p>사기 / 계약 만료<b>${p.morale}% / ${p.contract}년</b></p><p>상태<b>${p.injury ? '부상 '+p.injury+'주' : p.banned ? '출장 정지' : '출전 가능'}${p.loan?' · 임대 중':''}</b></p></div>${careerHistoryUI(p)}${profileActions(p)}${p.club !== 0 ? `<button class="primary full" data-negotiate="${p.id}" ${p.loan || !G.windowOpen(state) && p.club !== -1 ? 'disabled' : ''}>이적 협상 시작${icon('arrow')}</button>` : `<button class="primary full" data-action="go-tactics">전술 보드에서 기용하기${icon('arrow')}</button>`}`);
}
function negotiate(id) {
  const p = G.player(state, id);
  if (state.pending) { toast('진행 중인 경기를 먼저 마쳐 주세요.'); return; }
  if (p.club === 0) return;
  if (p.loan) { toast('임대 중인 선수는 합의된 완전이적 옵션으로만 영입할 수 있습니다.'); return; }
  if (!G.windowOpen(state) && p.club !== -1) { toast(G.transferWindowLabel(state)); return; }
  modal(`<span class="eyebrow">TRANSFER NEGOTIATION</span><h2>다음 퍼즐을 맞출 시간.</h2><div class="negotiation-player">${badge(p.club)}<div><strong>${esc(p.name)} ${playerPosition(p)}</strong><span>${esc(state.clubs[p.club]?.name || '자유 계약')} · ${p.age}세</span></div>${rating(p)}</div><form id="deal-form" data-player="${p.id}"><div class="detail-rows"><p>구단의 예상 요구액<b>${cash(G.askingPrice(state, id))}</b></p><p>사용 가능 예산<b>${cash(state.budget)}</b></p></div>${wageOfferUI(p)}<label class="field-label" for="transfer-type">계약 방식</label><select id="transfer-type" name="type"><option value="permanent">완전 이적</option>${p.club>=0?'<option value="loan">시즌 임대 · 요구액 20% + 주급 부담</option>':''}</select><label class="field-label" for="swap-player">트레이드 선수 <span>선택 사항</span></label><select id="swap-player" name="swap" ${p.club===-1?'disabled':''}><option value="">현금으로만 영입</option>${G.roster(state).filter(x => G.canRelease(state, x.id)).map(x => `<option value="${x.id}">${esc(x.name)} · ${x.pos} · OVR ${G.ovr(x)} · 인정 가치 ${Math.floor(G.value(x) * .85)}억</option>`).join('')}</select><label class="field-label" for="bid-cash">현금 제안 <span>억 원</span></label><input id="bid-cash" name="cash" type="number" min="0" max="${Math.max(0, state.budget)}" step="0.1" value="${p.club===-1?0:Math.min(Math.floor(state.budget), G.value(p))}" required><p class="field-help">교환 선수는 시장 가치의 85%를 인정받습니다. 상대 구단은 현금과 선수의 합산 가치로 판단합니다.</p>${optionControls(G.askingPrice(state,p.id),true)}<div id="deal-feedback" role="status"></div><button class="primary full" type="submit">영입 제안 보내기${icon('arrow')}</button></form>`);
}
function choosePlayer(slot) {
  if (state.pending) { openLive(); return; }
  selectedSlot = slot;
  if (page !== 'tactics') { page = 'tactics'; render(); }
  const position = G.SLOTS[me().tactics.formation][slot];
  modal(`<span class="eyebrow">STARTING XI</span><h2>${position} 슬롯 · 선수 선택</h2><p class="modal-desc">이미 선발인 선수를 고르면 두 선수의 자리가 바뀝니다.</p><div class="selection-list">${G.roster(state).slice().sort((a, b) => G.lineupScore(b,position) - G.lineupScore(a,position)).map(p => `<button data-select-player="${p.id}" data-select-slot="${slot}" class="selection-row ${me().lineup[slot] === p.id ? 'selected' : ''}" ${!G.available(p) ? 'disabled' : ''}>${playerPosition(p)}<span><strong>${esc(p.name)}</strong><small>${G.suitability(p,position)<1 ? '보조 포지션 · 적합도 '+Math.round(G.suitability(p,position)*100)+'%' : '적합한 포지션'} · ${me().lineup.includes(p.id) ? '선발' : '벤치'}</small></span><span>${p.fitness}%</span>${rating(p)}</button>`).join('')}</div>`);
}
function previewMatch() {
  if (state.pending) { openLive(true); return; }
  if (state.week >= state.totalWeeks) { closeModal(); G.nextSeason(state); save(); render(); toast(`${state.season} 시즌 시작! 구단 지원금과 계약·임대·성장 결과를 확인하세요.`); return; }
  const fixture = G.nextFixture(state);
  if (!fixture) {
    const remaining=remainingLeagueGames();
    modal(`<span class="eyebrow">SEASON CALENDAR</span><h2>${remaining?'이번 주는 리그 휴식 주간입니다':'우리 팀 리그 일정이 끝났습니다'}</h2><p class="modal-desc">${remaining?`이번 시즌 리그 경기가 ${remaining}경기 남아 있습니다. 다음 경기까지 휴식 주간을 한 번에 진행합니다.`:`리그 ${me().played}경기를 마쳤습니다. 남은 컵 대회와 다른 리그 일정을 마무리하면 다음 시즌을 시작할 수 있습니다.`}</p><p>진행 중 컵 경기 결과·선수 회복·훈련·주급 정산을 반영하고 매주 저장합니다. 도착한 이적 제안은 만료될 수 있습니다.</p><button class="primary full" data-action="kickoff">${remaining?'다음 경기까지 진행':'남은 시즌 일정 진행'}${icon('arrow')}</button>`); return;
  }
  const [h, a] = fixture, enemy = state.clubs[h || a], s = G.strength(state, 0);
  modal(`<span class="eyebrow">MATCHDAY ${state.week + 1}</span><h2>90분, 모든 것을 보여줄 시간.</h2><div class="preview-teams"><div>${badge(h, 'large')}<b>${esc(state.clubs[h].name)}</b></div><span>VS</span><div>${badge(a, 'large')}<b>${esc(state.clubs[a].name)}</b></div></div><div class="detail-rows"><p>우리 팀 전술<b>${me().tactics.formation} · ${['수비적', '균형', '공격적'][me().tactics.mentality + 1]}</b></p><p>상대 전술<b>${enemy.tactics.formation} · ${['낮은', '보통', '강한'][enemy.tactics.press]} 압박</b></p><p>선발 평균 컨디션<b class="${s.fitness < 70 ? 'warning-text' : ''}">${s.fitness}%</b></p><p>예상 주간 주급<b>${G.payroll(state).toFixed(2)}억 원</b></p></div><p class="field-help">모든 리그가 진행되고 주급과 수입이 정산됩니다. 예정된 컵 경기 역시 컵 전술·로테이션 설정으로 자동 진행됩니다. 도착한 이적 제안은 만료됩니다.</p><div class="modal-actions"><button class="secondary" data-action="go-tactics">전술 점검</button><button class="primary" data-action="kickoff">킥오프${icon('arrow')}</button></div>`);
}
function matchReport(m) {
  if (m.rest) { modal(`<div class="report-heading"><span class="eyebrow">WEEK COMPLETE · ${m.season} · MATCHWEEK ${m.week + 1}</span><h2>회복과 준비의 한 주.</h2></div><div class="rest-report">${icon('calendar')}<strong>${esc(me().name)}는 이번 라운드 리그 경기가 없습니다.</strong><p>다른 리그의 일정과 예정된 컵 경기는 정상적으로 진행되었습니다. 벤치 선수는 체력을 회복했고, 주급과 주간 수지가 정산되었습니다.</p><span>주간 수지 ${m.week >= 0 ? '반영 완료' : ''}</span></div><button class="primary full" data-action="close">감독실로 돌아가기${icon('arrow')}</button>`, 'report-modal'); return; }
  const ourGoals = m.h === 0 ? m.hg : m.ag, theirGoals = m.h === 0 ? m.ag : m.hg;
  modal(`<div class="report-heading"><span class="eyebrow">FULL TIME · ${m.season} · ${m.competition ? esc(state.competitions.find(c=>c.id===m.competition)?.name || '컵 경기') : 'MATCHWEEK '+(m.week+1)}</span><h2>${m.h !== 0 && m.a !== 0 ? '90분의 기록.' : ourGoals > theirGoals ? '승리, 우리의 방식으로.' : ourGoals === theirGoals ? '치열했던 90분, 무승부.' : '다음 경기를 향해.'}</h2></div><div class="scoreboard"><div>${badge(m.h, 'large')}<b>${esc(state.clubs[m.h].name)}</b></div><strong>${m.hg}<span>:</span>${m.ag}</strong><div>${badge(m.a, 'large')}<b>${esc(state.clubs[m.a].name)}</b></div></div>${m.penalties?`<p class="penalty-note">승부차기 ${m.penalties[0]} : ${m.penalties[1]}</p>`:''}${m.competition?`<p class="penalty-note">${m.neutral===undefined?'구장 기록 없음':m.neutral?'중립구장':esc(state.clubs[m.h].stadium)}</p>`:''}${m.income?`<div class="tip cup-income">우리 구단 수입 · 방송권·참가 ${m.income.broadcast.toFixed(2)}억 + 홈구장 ${m.income.gate.toFixed(2)}억 + 경기 상금 ${m.income.prize.toFixed(2)}억${m.label==='결승'?' (우승 상금 별도)':''}</div>`:''}<div class="match-stats">${[[m.possession + '%', '점유율', (100 - m.possession) + '%'], [m.shots[0], '슈팅', m.shots[1]], [m.onTarget?.[0] ?? '—', '유효슈팅', m.onTarget?.[1] ?? '—'], [m.homeXg, '기대 득점 (xG)', m.awayXg]].map(([h, label, a]) => `<div><b>${h}</b><span>${label}</span><b>${a}</b></div>`).join('')}</div><div class="timeline"><span class="eyebrow">MATCH EVENTS</span>${m.events.length ? m.events.map(e => `<div><span class="minute">${e.minute}′</span><span class="goal-icon">⚽</span><p><strong>${esc(e.name)} <small>${esc(state.clubs[e.club].short)}</small></strong><span>${esc(e.text)}${e.assistName?' · 도움 '+esc(e.assistName):''}</span></p></div>`).join('') : '<p class="muted">양 팀의 수비가 빛났습니다. 득점 없이 경기가 종료되었습니다.</p>'}</div>${!m.competition?cupRoundSummary(m.week):''}<button class="primary full" data-action="close">감독실로 돌아가기${icon('arrow')}</button>`, 'report-modal');
}
function help() { const rounds = leagueRounds(state.leagues[0]); modal(`<span class="eyebrow">THE MANAGER'S HANDBOOK</span><h2>당신이 만드는 축구.</h2><div class="guide"><div><b>01</b><p><strong>스쿼드를 완성하세요</strong>이적시장에서 현금 영입 또는 선수 + 현금 트레이드를 제안하세요. 제안이 낮으면 구단이 역제안을 보냅니다. 인박스의 매각 제안으로 예산을 확보할 수 있습니다.</p></div><div><b>02</b><p><strong>철학을 세우세요</strong>전술 보드에서 포메이션, 성향, 압박, 템포를 선택하세요. 유니폼을 누르면 선발을 교체합니다. 높은 압박은 점유율을, 빠른 템포는 공격 기회를 높이며 체력을 더 소모합니다.</p></div><div><b>03</b><p><strong>시즌을 이끄세요</strong>다음 경기 진행 → 킥오프로 한 라운드를 진행합니다. 전술·선수 능력·체력·홈 이점과 확률이 결과에 반영됩니다. 주급이 정산되고 벤치 선수는 체력을 회복합니다.</p></div></div><div class="tip">이적시장: 1~5R, 12~14R, 시즌 종료 후 여름 4주 · FA 상시 영입 · 우리 리그: ${rounds}경기 · 등록 인원: 최대 25명 · 시즌 상금 및 새 시즌 지원금 지급 · 5대 리그 1~3부 자동 승강 · 컵 대회는 리그 라운드 후 자동 진행</div><p class="field-help">같은 브라우저에 자동 저장됩니다. 사이드바 하단의 나의 감독 커리어에서 저장 파일을 백업·복원할 수 있습니다. 실제 구단 이름과 가상 선수, 자체 리그 형식을 사용한 독립 게임이며 상용 Football Manager와 관련이 없습니다.</p>`); }
function settings() { modal(`<span class="eyebrow">YOUR CAREER</span><h2>나의 감독 커리어</h2><p class="modal-desc">${state.season} 시즌 · ${state.week}라운드 완료 · ${esc(me().name)}</p><div class="settings-buttons"><button class="secondary" data-action="export">${icon('save')}저장 파일 다운로드</button><label class="secondary file-label">저장 파일 불러오기<input type="file" id="import-save" accept=".json,application/json"></label><button class="danger" data-action="reset-prompt">새 커리어 시작</button></div><p class="field-help">새 커리어를 시작하면 현재 브라우저 저장을 덮어씁니다. 진행 상황을 보관하려면 먼저 저장 파일을 내려받으세요.</p>`); }
function closeModal() { if (batchRunning) { batchStop=true; return; } $('#modal').close(); selectedSlot = null; }
document.addEventListener('click', event => {
  const b = event.target.closest('button, a.brand'); if (!b || b.disabled) return;
  if (b.matches('a.brand')) { event.preventDefault(); page = 'overview'; render(); }
  else if (b.dataset.page) { page = b.dataset.page; selectedSlot = null; render(); window.scrollTo(0, 0); }
  else if (b.dataset.negotiate) negotiate(Number(b.dataset.negotiate));
  else if (b.dataset.profile) profile(Number(b.dataset.profile));
  else if (b.dataset.slot !== undefined) choosePlayer(Number(b.dataset.slot));
  else if (b.dataset.selectPlayer) { G.setLineup(state, b.dataset.selectSlot, b.dataset.selectPlayer); closeModal(); save(); render(); toast('선발 라인업을 변경했습니다.'); }
  else if (b.dataset.tactic) { if (state.pending && b.dataset.tactic === 'formation') { toast('경기 중 포메이션 재편성은 불가합니다. 하프타임에서 지침과 교체를 조절하세요.'); return; } G.setTactics(state, b.dataset.tactic, b.dataset.value); save(); render(); }
  else if (b.dataset.filter) { marketLimit = 40; marketPos = b.dataset.filter; if (marketPos === 'ALL' || !G.POSITION_GROUPS[marketPos].includes(marketFilters.position)) marketFilters.position = 'ALL'; render(); }
  else if (b.dataset.watch) { const id = Number(b.dataset.watch); state.watch = state.watch.includes(id) ? state.watch.filter(x => x !== id) : [...state.watch, id]; save(); $('#market-results').innerHTML = marketTable(marketPlayers()); }
  else if (b.dataset.offer) {
    const o = state.incoming.find(x => x.id === b.dataset.offer), p = G.player(state, o.player);
    modal(`<span class="eyebrow">INCOMING OFFER</span><h2>${esc(p.name)} 이적 제안</h2><p class="modal-desc">${esc(state.clubs[o.club].name)}에서 현금 ${o.cash}억 원을 제안했습니다.</p><div class="detail-rows"><p>시장 가치<b>${G.value(p)}억</b></p><p>매각 후 예산<b>${cash(state.budget + o.cash)}</b></p><p>현재 상태<b>${me().lineup.includes(p.id) ? '선발 · 매각 시 라인업 자동 재편성' : '벤치'}</b></p></div><div class="modal-actions"><button class="secondary" data-reject="${o.id}">거절</button><button class="primary" data-accept="${o.id}">매각 수락${icon('check')}</button></div>`);
  }
  else if (b.dataset.accept) { const r = G.acceptOffer(state, b.dataset.accept); if (r.ok) { closeModal(); save(); render(); } toast(r.message); }
  else if (b.dataset.reject) { state.incoming = state.incoming.filter(o => o.id !== b.dataset.reject); closeModal(); save(); render(); toast('이적 제안을 거절했습니다.'); }
  else if (b.dataset.result !== undefined) matchReport(state.results.find(m => m.week === Number(b.dataset.result) && (m.h === 0 || m.a === 0)));
  else if (b.dataset.counter) { $('#bid-cash').value = b.dataset.counter; $('#deal-feedback').innerHTML = '<p class="success-text">역제안 금액을 입력했습니다. 조건을 확인하고 제안을 보내세요.</p>'; }
  else if (b.dataset.action) {
    const a = b.dataset.action;
    if (a === 'close') { closeModal(); if (page !== 'overview' && $('#modal').classList.contains('report-modal')) { page = 'overview'; render(); } }
    if (a === 'advance') previewMatch();
    if (a === 'summer-week') managementResult(G.advanceSummerWeek(state));
    if (a === 'kickoff') { const match = G.startMatch(state); if (match) { save(); render(); openLive(true); } else { runBatch(true); } }
    if (a === 'auto' && !state.pending) { me().lineup = G.autoLineup(state); save(); render(); toast('능력치와 체력을 고려해 베스트 11을 선정했습니다.'); }
    if (a === 'go-tactics') { closeModal(); page = 'tactics'; render(); }
    if (a === 'help') help();
    if (a === 'settings') settings();
    if (a === 'watch-filter') { watchOnly = !watchOnly; render(); }
    if (a === 'history') modal(`<span class="eyebrow">TRANSFER HISTORY</span><h2>우리가 만든 움직임</h2><div class="history-list">${state.transfers.length ? state.transfers.map(t => `<div><small>${t.season} · ${t.week + 1}R</small><p>${esc(t.text)}</p></div>`).join('') : '<div class="empty-state">아직 완료된 거래가 없습니다.<span>첫 영입으로 새로운 이야기를 시작하세요.</span></div>'}</div>`);
    if (a === 'export') { const url = URL.createObjectURL(new Blob([JSON.stringify(state)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `touchline-${state.season}-R${state.week}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('커리어 저장 파일을 다운로드했습니다.'); }
    if (a === 'reset-prompt') modal('<span class="eyebrow">NEW CAREER</span><h2>새로운 도전을 시작할까요?</h2><p class="modal-desc">현재 진행 상황은 덮어씁니다. 백업하지 않은 커리어는 복구할 수 없습니다.</p><div class="modal-actions"><button class="secondary" data-action="settings">돌아가기</button><button class="danger" data-action="reset">새 커리어 시작</button></div>');
    if (a === 'reset') { closeModal(); careerPicker(); }
  }
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'deal-form') return;
  e.preventDefault();
  const data = new FormData(e.target), r = G.deal(state, Number(e.target.dataset.player), Number(data.get('cash')), data.get('swap') ? Number(data.get('swap')) : null, data.get('type') === 'loan', Number(data.get('salary')), data.get('type') === 'loan' && data.get('purchase-option') ? Number(data.get('option-price')) : null);
  if (r.ok) { closeModal(); save(); render(); toast(r.message); }
  else $('#deal-feedback').innerHTML = `${optionCounter(r)}<p class="warning-text">${esc(r.message)}</p>${r.salaryCounter !== undefined ? `<button type="button" class="secondary small" data-salary-counter="${r.salaryCounter}">요구 주급 적용</button>` : ''}${r.counter !== undefined ? `<button type="button" class="secondary small" data-counter="${r.counter}">역제안 금액 적용</button>` : ''}`;
});
document.addEventListener('input', e => { if (e.target.id === 'market-search') { marketLimit = 40; marketQuery = e.target.value; $('#market-results').innerHTML = marketTable(marketPlayers()); } });
document.addEventListener('change', async e => {
  if (e.target.id !== 'import-save' || !e.target.files[0]) return;
  try {
    if (e.target.files[0].size > 100000000) throw new Error('size');
    const imported = JSON.parse(await e.target.files[0].text());
    if (!G.validSave(imported)) throw new Error('invalid');
    state = G.upgradeSave(imported); closeModal(); page = 'overview'; viewedLeague = 0; marketLeague = 'ALL';
    const saved = save(); render();
    if (await saved) toast('저장된 커리어를 불러오고 자동 저장했습니다.');
  } catch { toast('올바른 TOUCHLINE 저장 파일이 아닙니다. 현재 커리어는 유지됩니다.'); }
});
$('#modal').addEventListener('click', e => { if (e.target === $('#modal')) { const r = e.target.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeModal(); } });
$('#modal').addEventListener('close', () => { selectedSlot = null; });
function leagueTabs() {
  const cur = state.leagues[viewedLeague];
  return `<div class="league-browser"><label for="view-league">리그 탐색</label><select id="view-league">${[...new Set(state.leagues.map(l=>l.country))].map(country=>`<optgroup label="${esc(state.leagues.find(l=>l.country===country).nation)}">${state.leagues.map((l,i)=>({l,i})).filter(x=>x.l.country===country).sort((a,b)=>a.l.tier-b.l.tier).map(({l,i})=>`<option value="${i}" ${viewedLeague===i?'selected':''}>${esc(l.name)} · ${l.tier}부 · ${l.rounds ? `${l.rounds}경기` : `${l.teams.length}팀`}</option>`).join('')}</optgroup>`).join('')}</select><span>${state.leagues.length}개 리그 · ${state.clubs.length}개 구단</span></div><div class="league-rules">${cur.rounds === 38 ? '정규 33R + 파이널 5R (팀당 38경기) · ' : ''}${cur.pyramid===3 ? `${cur.tier>1?'상위 2팀 자동 승격':cur.asian?'AFC 챔피언스 리그 출전권 경쟁':'유럽대항전 출전권 경쟁'}${cur.tier<3?' · 하위 2팀 자동 강등':''} · 국내 FA 컵 전 구단 참가` : `${cur.asian?'AFC 챔피언스 리그 출전권 경쟁 · ':cur.european?'상위 구단 유럽대항전 진출 · ':''}국내 FA 컵 전 구단 참가`}</div>`;
}
function cupStrip() {
  const mine = state.competitions.filter(c => c.participants.includes(0));
  return `<div class="cup-strip">${mine.map(c=>`<button data-cup="${c.id}">${icon('league')}<span><strong>${esc(c.name)}</strong><small>${c.winner===0?'CHAMPIONS':c.winner!==null?esc(state.clubs[c.winner].name)+' 우승':c.next.some(p=>p.includes(0))?`${c.nextWeek}R 후 경기 예정`:c.phase==='groups'?'조별리그 진행 중':'탈락 · 결과 보기'}</small></span>${icon('arrow')}</button>`).join('')}</div>`;
}
function cupRoundSummary(week) {
  const matches = state.cupResults.filter(m=>m.week===week&&(m.h===0||m.a===0));
  return matches.length ? `<div class="round-cups"><span class="eyebrow">이번 주 컵 경기 결과</span>${matches.map(m=>`<button data-cup-result="${state.cupResults.findIndex(x=>x.competition===m.competition&&x.week===m.week&&x.h===m.h&&x.a===m.a)}"><span>${esc(state.competitions.find(c=>c.id===m.competition).name)} · ${esc(m.label)}</span><b>${esc(state.clubs[m.h].name)} ${m.hg} : ${m.ag} ${esc(state.clubs[m.a].name)}${m.penalties?` · 승부차기 ${m.penalties.join(':')}`:''}</b></button>`).join('')}</div>` : '';
}
function cupFixture(pair, result = null, cup = null) {
  const [h,a] = pair;
  const neutral=result?result.neutral:cup?G.cupNeutral(cup):undefined;
  const venue=neutral===undefined?'구장 기록 없음':neutral?'중립구장':state.clubs[h]?.stadium;
  return `<div class="cup-fixture ${(h===0||a===0)?'own-fixture':''}"><span>${h===null?'부전승':`${badge(h,'tiny')}${esc(state.clubs[h].name)}`}</span><b>${result?`${result.hg} : ${result.ag}`:a===null||h===null?'BYE':'VS'}</b><span>${a===null?'부전승':`${badge(a,'tiny')}${esc(state.clubs[a].name)}`}</span>${h!==null&&a!==null?`<small>${esc(venue)}</small>`:''}${result?.penalties?`<small>승부차기 ${result.penalties.join(':')}</small>`:''}</div>`;
}
function cupsPage() {
  const cup = state.competitions.find(c=>c.id===viewedCup) || state.competitions[0];
  viewedCup = cup.id;
  const mine = cup.participants.includes(0), label = cup.phase==='groups'?`조별리그 ${Math.min(cup.round+1,6)}차전`:cup.phase==='complete'?'대회 종료':cup.phase==='inactive'?'비개최 시즌':cup.next.length===1?'결승':cup.next.length===2?'준결승':`${cup.next.length*2}강`;
  const knockout = cup.results.filter(m=>!m.label.startsWith('조별')), stages = [...new Set(knockout.map(m=>m.label))];
  const domCount = state.competitions.filter(c=>c.kind==='domestic').length;
  const leagueCupCount = state.competitions.filter(c=>c.kind==='league-cup').length;
  return `<div class="league-browser"><label for="view-cup">대회 탐색</label><select id="view-cup">${state.competitions.map(c=>`<option value="${c.id}" ${c.id===cup.id?'selected':''}>${esc(c.name)}${c.participants.includes(0)?' · MY CLUB':''}</option>`).join('')}</select><span>${domCount}개 FA 컵 · ${leagueCupCount}개 리그 컵 · 2개 유럽대항전 · 1개 아시아대항전 · FIFA 클럽 월드컵</span></div><div class="cup-hero ${cup.kind==='europe'?'europe':cup.kind==='asia'?'asia':cup.kind==='world'?'world':''}"><div><span class="eyebrow">${cup.kind==='world'?'THE WORLD STAGE (4-YEAR CYCLE)':cup.kind==='europe'?'THE EUROPEAN STAGE':cup.kind==='asia'?'THE ASIAN STAGE':cup.kind==='league-cup'?'DOMESTIC LEAGUE CUP':'THE MAGIC OF THE CUP'}</span><h2>${esc(cup.name)}</h2><p>${cup.phase==='inactive'?'4년 주기로 열리는 세계 최고 권위의 32강 클럽 대항전입니다. (2026, 2030, 2034...)':cup.kind==='europe'||cup.kind==='asia'||cup.kind==='world'?'32개 구단 · 8개 조 · 조별 홈 & 어웨이 · 16강 토너먼트':cup.kind==='league-cup'?`${cup.participants.length}개 1부 구단 · 순수 리그 전용 단판 토너먼트`:`${cup.participants.length}개 구단 · ${cup.participants.length>12?'1~3부 통합':'전 구단 참가'} · 단판 토너먼트`}</p><div class="cup-status"><span>${label}</span><span>${cup.phase==='inactive'?'4년 주기 개최':mine?'우리 구단 참가':'세계 대회 관전'}</span>${cup.winner!==null?`<strong>${badge(cup.winner,'tiny')}${esc(state.clubs[cup.winner].name)} 우승</strong>`:cup.nextWeek?`<span>다음 일정 · ${cup.nextWeek}R 종료 후</span>`:`<span>개최 준비 중</span>`}</div></div><div class="cup-art">${icon('league')}</div></div>
  <section class="panel cup-plan"><div><h2>컵 대회 경기 계획</h2><p>컵 경기는 해당 리그 라운드 종료 후 자동 진행됩니다. 별도 전술과 로테이션을 미리 지정하세요.</p></div><label>선수 기용<select id="cup-rotation"><option value="false" ${!state.cupPlan.rotation?'selected':''}>기존 선발 유지</option><option value="true" ${state.cupPlan.rotation?'selected':''}>체력·벤치 중심 로테이션</option></select></label><label>경기 접근<select id="cup-approach">${[['same','리그 전술 유지'],['balanced','균형 있게'],['defensive','수비 후 역습'],['attacking','공격적 압박']].map(([v,n])=>`<option value="${v}" ${state.cupPlan.approach===v?'selected':''}>${n}</option>`).join('')}</select></label></section>
  ${cup.groups.length?`<div class="cup-section-title"><h2>조별리그</h2><span>각 조 상위 2팀 16강 진출 · 승점 → 득실 → 다득점</span></div><div class="groups-grid">${cup.groups.map((group,i)=>`<section class="panel group-card"><div class="panel-head"><h2>GROUP ${String.fromCharCode(65+i)}</h2><span class="count">${group[0].played} / 6</span></div><table><thead><tr><th>구단</th><th>경기</th><th>득실</th><th>승점</th></tr></thead><tbody>${G.groupTable(group).map((r,j)=>`<tr class="${r.id===0?'my-team':''} ${j<2?'qualify':''}"><td><span class="table-club">${badge(r.id,'tiny')}${esc(state.clubs[r.id].name)}</span></td><td>${r.played}</td><td>${r.gf-r.ga}</td><td><b>${r.pts}</b></td></tr>`).join('')}</tbody></table></section>`).join('')}</div>`:''}
  ${cup.next.length?`<div class="cup-section-title"><h2>${cup.phase==='groups'?'다음 조별 경기':'다음 라운드 대진'}</h2><span>${cup.nextWeek}R 종료 후 · ${cup.next.length}경기${cup.next.some(p=>p.includes(null))?' · 일부 구단 부전승':''}</span></div><div class="cup-fixtures">${cup.next.map(p=>cupFixture(p,null,cup)).join('')}</div>`:''}
  ${stages.length?`<div class="cup-section-title"><h2>토너먼트 진행</h2><span>동점 시 승부차기로 다음 라운드 진출 팀 결정</span></div><div class="bracket">${stages.map(stage=>`<section class="bracket-stage"><h3>${esc(stage)}</h3>${knockout.filter(m=>m.label===stage).map(m=>`<button class="bracket-match" data-cup-result="${state.cupResults.findIndex(x=>x.competition===m.competition&&x.week===m.week&&x.h===m.h&&x.a===m.a)}"><span class="${m.winner===m.h?'winner':''}">${esc(state.clubs[m.h].name)}<b>${m.hg}</b></span><span class="${m.winner===m.a?'winner':''}">${esc(state.clubs[m.a].name)}<b>${m.ag}</b></span>${m.penalties?`<small>PEN ${m.penalties.join(' : ')}</small>`:''}</button>`).join('')}</section>`).join('')}${cup.winner!==null?`<section class="bracket-champion">${icon('league')}${badge(cup.winner,'large')}<h3>${esc(state.clubs[cup.winner].name)}</h3><span>${state.season} CHAMPIONS</span></section>`:''}</div>`:''}
  <div class="tip">${icon('help')}${cup.kind==='world'?'FIFA 클럽 월드컵은 4년마다(2026, 2030, 2034...) 유럽, 남미, 아시아 최상위 32개 구단이 격돌하는 세계 최고 권위의 대회입니다. 우승 상금 500억 원, 경기 승리 수당 최대 40~250억 원.':cup.kind==='asia'?'AFC 챔피언스 리그는 매 시즌 아시아 12개국 1부 리그 최상위 32팀이 조별리그와 16강 토너먼트로 아시아 최강을 가립니다. 우승 상금 140억 원, 경기 승리 수당 3~15억 원.':cup.kind==='europe'?'매 시즌 유럽 1부리그 성적과 국가별 가중치로 상위 32팀은 챔피언스 컵, 다음 32팀은 유로파 컵에 선발됩니다. 조별리그는 홈 & 어웨이, 토너먼트는 단판입니다. 우승 상금 300억/150억 원, 승리 수당 10~200억 원.':cup.kind==='league-cup'?'리그 컵은 해당 리그 1부 구단들만 참가하는 순수 리그 토너먼트 대회입니다. 부족한 대진은 부전승으로 처리하며, 모든 라운드는 단판입니다. 우승 상금 40억 원, 라운드 승리 상금 2~15억 원.':'국내 FA 컵은 국가 내 모든 등록 구단이 참가합니다. 부족한 대진은 부전승으로 처리하며, 모든 라운드는 단판입니다. 우승 상금 30억 원, 라운드 승리 상금 1.5~12억 원.'}</div><p class="field-help">게임 내 구장 규칙: 클럽 월드컵 전 경기와 각 컵 결승은 중립구장입니다. 그 외에는 왼쪽 구단의 홈에서 진행합니다. 실제 홈 경기에는 경기장 확장이 반영된 홈구장 수입을 별도 지급하며, AFC·유럽대항전은 국내 컵보다 25% 높습니다. 원정·중립 경기에도 방송권·참가 수입과 성적에 따른 상금은 지급합니다.</p>
  ${cup.results.length?`<section class="panel"><div class="panel-head"><h2>최근 경기 결과</h2><span class="muted">경기를 눌러 리포트 보기</span></div><div class="cup-fixtures result-fixtures">${cup.results.slice(-12).reverse().map(m=>`<button data-cup-result="${state.cupResults.findIndex(x=>x.competition===m.competition&&x.week===m.week&&x.h===m.h&&x.a===m.a)}">${cupFixture([m.h,m.a],m)}</button>`).join('')}</div></section>`:''}
  ${state.promotionNews.length?`<section class="panel wellbeing"><div class="panel-head"><h2>지난 시즌 승강 소식</h2></div><div class="promotion-list">${state.promotionNews.map(n=>`<div><span class="${n.promoted?'success-text':'warning-text'}">${n.promoted?'↑ 승격':'↓ 강등'}</span><b>${esc(state.clubs[n.club].name)}</b><small>${esc(n.from)} → ${esc(n.to)}</small></div>`).join('')}</div></section>`:''}`;
}
function advancedTactics() {
  return `<div class="control-section"><label>공격 폭</label>${segmented('width', [[0, '좁게'], [1, '균형'], [2, '넓게']])}<p>넓게 전개하면 공격에 유리하지만 수비 간격이 벌어집니다.</p></div><div class="control-section"><label>수비 라인</label>${segmented('line', [[-1, '낮게'], [0, '보통'], [1, '높게']])}<p>높은 라인은 점유율을 높이지만 상대의 다이렉트 패스에 취약합니다.</p></div><div class="control-section"><label>패스 방식</label>${segmented('passing', [[0, '짧게'], [1, '혼합'], [2, '다이렉트']])}<p>짧은 패스는 볼 소유, 다이렉트 패스는 높은 수비 라인 공략에 유리합니다.</p></div><div class="control-section"><label>공격 전개</label>${segmented('focus', [[0, '균형'], [1, '측면'], [2, '중앙']])}<p>선택한 경로에 공격을 집중합니다. 폭과 선수별 임무를 함께 조절하세요.</p></div>`;
}
function roleControls() {
  return `<div class="role-controls"><div class="panel-head"><h2>선수별 임무</h2><span class="muted">공격 / 지원 / 수비</span></div>${me().lineup.map((id, i) => { const p = G.player(state, id); return `<div class="role-row"><span>${posTag(G.SLOTS[me().tactics.formation][i])} ${esc(p.name)}</span><select data-role-slot="${i}" aria-label="${esc(p.name)} 임무">${[['defend', '수비'], ['balanced', '지원'], ['attack', '공격']].map(([v, n]) => `<option value="${v}" ${state.roles[i] === v ? 'selected' : ''}>${n}</option>`).join('')}</select><button class="text-button" data-instructions="${i}">움직임 지시</button></div>`; }).join('')}<label class="field-label" for="captain">주장 선임 <span>선발 출전 시 팀 전력 보너스</span></label><select id="captain">${G.roster(state).map(p => `<option value="${p.id}" ${state.captain === p.id ? 'selected' : ''}>${esc(p.name)} · ${p.age}세</option>`).join('')}</select><div class="preset-row"><button class="secondary small" data-preset="possession">점유율 축구</button><button class="secondary small" data-preset="counter">역습 축구</button><button class="secondary small" data-preset="press">강한 압박</button></div></div>`;
}
function profileActions(p) {
  if (p.club === 0) {
    const isListed = state.transferList?.includes(p.id) || p.transferListed;
    return `<div class="profile-action-grid"><button class="secondary" data-renew="${p.id}" ${p.loan ? 'disabled' : ''}>계약 협상</button><button class="secondary" data-talk="${p.id}">개인 면담</button><button class="secondary" data-transfer-list="${p.id}" ${p.loan ? 'disabled' : ''}>${isListed ? '이적 명단 해제' : '이적 명단 등록'}</button><button class="secondary" data-sell="${p.id}" ${(!G.windowOpen(state) || p.loan) ? 'disabled' : ''}>선수 판매</button>${!p.loan ? `<button class="secondary" data-loan-out="${p.id}" ${!G.windowOpen(state)?'disabled':''}>임대 보내기</button>` : p.loan.purchasePrice!=null ? `<button class="primary" data-buy-loan="${p.id}" ${!G.windowOpen(state)?'disabled':''}>완전 영입 · ${p.loan.purchasePrice}억</button>` : ''}</div>${p.loan?`<p class="field-help">${esc(state.clubs[p.loan.owner].name)}에서 임대 · ${p.loan.until}년 복귀 · ${p.loan.purchasePrice!=null?'합의된 옵션 '+p.loan.purchasePrice+'억':'완전이적 옵션 없음'}</p>`:''}`;
  }
  if(p.loan?.owner===0)return `<div class="scout-report"><b>우리 팀 소속 · ${p.loan.academy?'유스':'1군'} 임대</b><span>${p.loan.until}년 복귀 · 충성도 ${G.loyalty(state,p)}/80 · ${p.loan.purchasePrice!=null?'합의된 완전이적 옵션 '+p.loan.purchasePrice+'억 (상대 구단이 행사 결정)':'완전이적 옵션 없음'}</span></div>`;
  const r = state.scouting.find(x => x.player === p.id);
  return `<div class="scout-report">${r?.remaining === 0 ? `<b>잠재력 ${p.potential} / ${G.MAX_OVR}</b><span>${p.potential - G.ovr(p) > 10 ? '성장 가능성이 큰 선수' : '즉시 전력감'} · 요구 주급 약 ${G.wage(p).toFixed(2)}억</span>` : r ? `<span>스카우팅 진행 중 · ${r.remaining}경기 후 완료</span>` : `<button class="secondary full" data-scout="${p.id}">${icon('search')}정밀 스카우팅 · 0.5억</button>`}</div>`;
}
function managementPage() {
  if (page === 'training') return trainingPage();
  if (page === 'youth') return youthPage();
  if (page === 'office') return officePage();
  if (page === 'cups') return cupsPage();
  return scoutingPage();
}
function trainingPage() {
  const plans = [['balanced', '균형 훈련', '공격·수비·기술·속도를 고르게 발전시킵니다.', 'tactics'], ['attacking', '공격 전개', '공격 능력 성장에 집중합니다.', 'arrow'], ['defending', '수비 조직', '수비 능력 성장에 집중합니다.', 'squad'], ['technique', '볼 테크닉', '기술 능력 성장에 집중합니다.', 'star'], ['fitness', '피지컬', '속도 성장과 체력 회복을 함께 도모합니다.', 'bolt'], ['rest', '회복 & 휴식', '성장 훈련 대신 체력 +10, 사기 +2.', 'check']];
  const unavailable = G.roster(state).filter(p => !G.available(p));
  return `<div class="training-grid">${plans.map(([id, title, desc, name]) => `<button class="training-card ${state.training === id ? 'active' : ''}" data-training="${id}">${icon(name)}<span class="training-check">${state.training === id ? icon('check') : ''}</span><h2>${title}</h2><p>${desc}</p><small>${state.training === id ? '이번 주 훈련 계획' : '계획 선택'}</small></button>`).join('')}</div><div class="management-columns"><section class="panel"><div class="panel-head"><h2>훈련 강도</h2><span class="count">WEEKLY PLAN</span></div><div class="control-section"><div class="segmented">${[[0, '가볍게'], [1, '보통'], [2, '강하게']].map(([v, n]) => `<button data-intensity="${v}" class="${state.intensity === v ? 'selected' : ''}">${n}</button>`).join('')}</div><p>강도가 높을수록 성장 확률과 체력 소모가 증가하고 훈련 중 부상이 발생할 수 있습니다. 경기를 진행할 때 적용됩니다.</p></div><div class="stat-bar"><span>훈련 시설</span><div><i style="width:${state.facilities.training * 20}%"></i></div><b>${state.facilities.training}/5</b></div><div class="stat-bar"><span>코칭 스태프</span><div><i style="width:${state.staff.coach * 20}%"></i></div><b>${state.staff.coach}/5</b></div></section><section class="panel"><div class="panel-head"><h2>의무실 & 징계</h2><span class="count">${unavailable.length}명</span></div>${unavailable.length ? unavailable.map(p => `<div class="news-row"><span class="news-icon">${icon('help')}</span><div><strong>${esc(p.name)} ${playerPosition(p)}</strong><p>${p.injury ? `부상 · ${p.injury}주 회복 예상` : `경고 누적 · ${p.banned}경기 출장 정지`}</p></div><button class="text-button" data-profile="${p.id}">선수 보기</button></div>`).join('') : '<div class="empty-state">모든 선수가 출전 가능합니다.<span>체력 관리와 로테이션을 꾸준히 유지하세요.</span></div>'}</section></div><section class="panel wellbeing"><div class="panel-head"><h2>컨디션 모니터</h2><span class="muted">부상·징계 선수는 다음 경기 선발에서 자동 제외</span></div><div class="wellbeing-grid">${G.roster(state).slice().sort((a, b) => a.fitness - b.fitness).slice(0, 8).map(p => `<button data-profile="${p.id}"><span>${esc(p.name)}</span><b class="${p.fitness < 70 ? 'warning-text' : ''}">${p.fitness}%</b><span class="fitness"><i style="width:${p.fitness}%"></i></span><small>사기 ${p.morale}%</small></button>`).join('')}</div></section>`;
}
function youthPage() {
  const youths=[...state.academy,...state.players.filter(p=>p.loan?.owner===0&&p.loan.academy)];
  return `<div class="youth-hero"><span class="eyebrow">THE NEXT GENERATION</span><h2>미래의 주인공은<br>우리 안에 있습니다.</h2><p>유소년 시설 LV.${state.facilities.youth} · 매 시즌 새 유망주 5명 합류<br>미콜업 유스는 누적 보유하며, 23세가 되면 FA로 풀립니다. 임대 중인 미콜업 유스도 동일합니다.<br>임대를 보내 출전과 성장을 돕거나 1군으로 콜업하세요. 실전 경험이 없는 유스의 가치는 25%부터 시작합니다.</p><span class="youth-watermark">NEXT<br>XI.</span></div><div class="academy-grid">${youths.map(p=>`<section class="panel academy-card"><div class="academy-top"><span class="profile-avatar">${esc(p.name[0])}</span>${playerPosition(p)}<span class="muted">${p.age}세</span></div><h2>${esc(p.name)}</h2><p>${p.loan?'임대 중 · '+esc(state.clubs[p.club].name):'YOUTH ACADEMY · '+esc(me().short)}</p><div class="academy-ratings"><div><strong>${G.ovr(p)}</strong><span>현재 능력</span></div><div><strong>${p.potential}</strong><span>잠재력</span></div></div><p class="field-help">${p.loan?`${p.loan.until}년 복귀 · ${p.loan.purchasePrice!=null?'완전이적 옵션 '+p.loan.purchasePrice+'억':'완전이적 옵션 없음'}`:`23세까지 ${23-p.age}시즌 · 콜업 전 아카데미에 잔류`}</p>${p.loan?`<button class="secondary full" data-profile="${p.id}">임대 선수 보기</button>`:`<button class="primary full" data-promote="${p.id}" ${G.roster(state).length>=25?'disabled':''}>1군 콜업${icon('arrow')}</button><button class="secondary full" data-loan-out="${p.id}" ${!G.windowOpen(state)?'disabled':''}>임대 협상</button>`}</section>`).join('')}</div>`;
}
function loanPanel() {
  const loans=state.players.filter(p=>p.loan?.owner===0);
  return `<section class="panel wellbeing"><div class="panel-head"><h2>임대 보낸 선수</h2><span class="count">${loans.length}명</span></div>${loans.length?loans.map(p=>`<div class="news-row"><div><strong>${esc(p.name)} · ${p.loan.academy?'유스':'1군'} · OVR ${G.ovr(p)}</strong><p>${esc(state.clubs[p.club].name)} · ${p.loan.until}년 복귀 · ${p.loan.purchasePrice!=null?'완전이적 옵션 '+p.loan.purchasePrice+'억':'옵션 없음'} · 주급 상대팀 부담</p></div><button class="text-button" data-profile="${p.id}">선수 보기</button></div>`).join(''):'<p class="empty-state">선수 프로필이나 유스 카드에서 임대를 협상할 수 있습니다.</p>'}</section>`;
}
function optionControls(price,hidden=false) {
  return `<div id="loan-options" ${hidden?'hidden':''}><label class="field-label"><input id="purchase-option" name="purchase-option" type="checkbox"> 완전이적 옵션 협상</label><label class="field-label" for="option-price">완전이적 옵션 제안액 (억)</label><input id="option-price" name="option-price" type="number" min="0.1" step="0.1" value="${price}" disabled><p class="field-help">상대 구단이 제안액을 검토하고 필요하면 역제안합니다. 합의 금액은 고정되며, 임차 구단이 이적시장에 선택해서 행사합니다. 임대료와 별도로 지급합니다.</p></div>`;
}
function optionCounter(r) { return r.purchaseCounter!=null?`<button type="button" class="secondary small" data-option-counter="${r.purchaseCounter}">옵션 역제안 ${r.purchaseCounter}억 적용</button>`:''; }
function loanOutModal(id) {
  const p=G.player(state,id)||state.academy.find(p=>p.id===id),offers=G.loanOffers(state,id);
  if(!p)return;
  modal(`<span class="eyebrow">LOAN NEGOTIATION</span><h2>${esc(p.name)} 임대 협상</h2><p class="modal-desc">상대 구단이 포지션 수요·기량·주급 여력을 검토합니다. 주급은 임차 구단이 부담합니다. ${state.season+(state.week===state.totalWeeks?2:1)}년 복귀 예정${p.club===-2?' · 23세 미콜업 시 FA 전환':''}.</p>${offers.length?`<form id="loan-out-form" data-player="${p.id}"><label class="field-label" for="loan-club">관심 구단 · 제안 임대료</label><select name="club" id="loan-club">${offers.map(o=>`<option value="${o.club}">${esc(state.clubs[o.club].name)} · ${state.leagues[state.clubs[o.club].league].tier}부 · 임대료 ${o.fee}억</option>`).join('')}</select>${optionControls(offers[0].purchasePrice)}<div id="loan-feedback" role="status"></div><button type="submit" class="primary full">임대 조건 제안</button></form>`:'<p class="empty-state">현재 조건에 관심을 보이는 구단이 없습니다. 선수 성장이나 상대 스쿼드 변화 후 다시 확인하세요.</p>'}`);
}
function scoutingPage() {
  const reports = state.scouting.map(r => ({ ...r, p: G.player(state, r.player) }));
  return `<div class="market-summary"><div>${icon('search')}<span>스카우팅 네트워크<strong>22<small>개 리그</small></strong></span></div><p>${state.players.length.toLocaleString()}명 이상의 선수, 아직 발견하지 못한 재능.<br><span>스카우트 LV.${state.staff.scout} · 보고서 ${state.staff.scout >= 4 ? '1' : '2'}경기 소요 · 조사 비용 0.5억</span></p><button class="secondary" data-page="market">선수 찾기${icon('arrow')}</button></div><section class="panel"><div class="panel-head"><h2>선수 분석 보고서</h2><span class="count">${reports.length}</span></div>${reports.length ? `<div class="table-wrap"><table><thead><tr><th>선수</th><th>구단</th><th>포지션</th><th>현재 능력</th><th>잠재력</th><th>진행 상태</th><th></th></tr></thead><tbody>${reports.map(r => `<tr><td><button class="player-name" data-profile="${r.p.id}">${esc(r.p.name)}</button></td><td>${esc(state.clubs[r.p.club]?.name || '자유 계약')}</td><td>${posTag(r.p.pos)}</td><td>${rating(r.p)}</td><td>${r.remaining ? '조사 중' : `<b class="success-text">${r.p.potential}</b>`}</td><td>${r.remaining ? `${r.remaining}경기 후 완료` : r.p.potential - G.ovr(r) > 10 ? '높은 성장 가능성' : '즉시 전력감'}</td><td><button class="text-button" data-profile="${r.p.id}">보고서 보기${icon('arrow')}</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state">당신의 다음 스타를 찾아보세요.<span>이적시장에서 선수 이름을 클릭한 뒤 정밀 스카우팅을 지시하세요.</span></div>'}</section><section class="panel wellbeing"><div class="panel-head"><h2>스카우트 추천</h2><span class="muted">25세 이하 · 성장 가능성 중심</span></div><div class="recommend-grid">${state.players.filter(p => p.club !== 0 && p.age <= 25 && !state.scouting.some(r => r.player === p.id)).sort((a, b) => b.potential - a.potential).slice(0, 6).map(p => `<div class="recommend-card"><div><b>${esc(p.name)}</b>${playerPosition(p)}</div><p>${esc(state.clubs[p.club]?.name || '자유 계약')} · ${p.age}세</p><span>${rating(p)}<small>예상 이적료 ${G.askingPrice(state, p.id)}억</small></span><button class="secondary full" data-scout="${p.id}">스카우팅 지시 · 0.5억</button></div>`).join('')}</div></section>`;
}
function upgradeCard(group, key, name, desc, symbol) {
  const level = state[group][key], cost = G.upgradeCost(state, group, key), limit = G.upgradeLimit(group, key);
  return `<div class="upgrade-card">${icon(symbol)}<div><h3>${name} <span>LV.${level}</span></h3><p>${desc}</p><div class="level-dots">${Array.from({ length: limit }, (_, i) => `<i class="${i < level ? 'filled' : ''}"></i>`).join('')}</div></div><button class="secondary small" data-upgrade="${group}:${key}" ${level >= limit ? 'disabled' : ''}>${level >= limit ? '최고 등급' : `${cost}억 · 개선`}</button></div>`;
}
function officePage() {
  const cost=G.weeklyWages(state)+G.facilityUpkeep(state), home=G.weeklyIncome(state,true), away=G.weeklyIncome(state), net=n=>`${n>=0?'+':''}${n.toFixed(2)}억`;
  const cupHome=G.cupMatchIncome(state,{kind:'asia',phase:'groups'},0,1);
  const renewals=G.roster(state).map(p=>p.loan?{salary:G.wage(p),bonus:0}:G.contractDemand(state,p,3,'rotation'));
  const renewalWages=renewals.reduce((sum,d)=>sum+d.salary,0)+G.weeklyWages(state)-G.payroll(state), renewalBonus=renewals.reduce((sum,d)=>sum+d.bonus,0);
  const annualIncome=away*state.totalWeeks+state.fixtures.filter(round=>round.some(([h])=>h===0)).length*G.homeGate(state);
  const spending = new Map();
  state.ledger.filter(l=>l.amount<0).forEach(l=>spending.set(l.label,(spending.get(l.label)||0)-l.amount));
  const rank = G.standings(state).findIndex(c => c.id === 0) + 1, income = state.ledger.filter(l => l.amount > 0).reduce((n, l) => n + l.amount, 0), expenses = -state.ledger.filter(l => l.amount < 0).reduce((n, l) => n + l.amount, 0);
  return `<section class="metrics">${metric('구단 가용 자금', cash(state.budget), '이적·계약·시설·스태프 통합 예산', 'wallet')}${metric('주간 선수 급여', `${G.payroll(state).toFixed(2)}<small>억</small>`, `스태프 ${(G.weeklyWages(state)-G.payroll(state)).toFixed(2)}억 별도 · 합계 ${G.weeklyWages(state).toFixed(2)}억`, 'squad')}${metric('이사회 신뢰도', `${state.confidence}<small>%</small>`, `다음 시즌 지원금 ${G.boardGrant(state)}억 예상 (현재 리그 기준)`, 'star')}${metric('시즌 목표', `${state.target}<small>위 이내</small>`, `현재 ${rank}위 · 목표와 재정에 따라 신뢰 변화`, 'league')}</section><section class="panel wellbeing" id="finance-outlook"><div class="panel-head"><h2>주간 운영 전망</h2><span class="muted">현재 계약·시설 기준</span></div><div class="detail-rows"><p>전력에 따른 방송권·스폰서 추가 수입<b>+${G.commercialBonus(state).toFixed(2)}억 / 주</b></p><p>선수·스태프 주급<b>${cost.toFixed(2)}억 / 주</b></p><p>홈 리그 경기 주간<b>수입 ${home.toFixed(2)}억 · 수지 ${net(home-cost)}</b></p><p>원정·리그 휴식 주간<b>수입 ${away.toFixed(2)}억 · 수지 ${net(away-cost)}</b></p><p>홈·원정 1경기씩 운영 수지<b>${net(home+away-cost*2)}</b></p><p>재계약 가정 선수·스태프 주급<b>${renewalWages.toFixed(2)}억 / 주</b></p><p>재계약 가정 일시 보너스 합계<b>${renewalBonus.toFixed(2)}억</b></p><p>재계약 후 연간 운영 수지 예상<b>${net(annualIncome-(renewalWages+G.facilityUpkeep(state))*(state.totalWeeks+4))}</b></p><p>AFC·유럽대항전 홈 1경기 추가 수입<b>홈구장 ${cupHome.gate.toFixed(2)}억 + 방송권·참가 ${cupHome.broadcast.toFixed(2)}억</b></p><p>국내 컵 홈 1경기 추가 수입<b>홈구장 ${G.homeGate(state).toFixed(2)}억 + 방송권·참가 2.00억</b></p><p>여름 시장 주간<b>수지 ${net(-cost)}</b></p></div><p class="field-help">1부 방송권·스폰서는 기본 5.5억에 상위 18명 평균 OVR의 75 초과분 × 1.75억을 더하며, 시즌 중 리그 휴식 주간에도 지급됩니다. 주급·컨디션·선발 명단은 수입에 영향을 주지 않습니다. 재계약 가정은 현재 요구 조건으로 전원 3년·로테이션 제안(기존 만료일 유지), 임대 선수는 현재 급여 유지입니다. 연간 전망은 현재 전력·시설과 리그 홈 경기 수, 여름 4주 비용을 반영하며 일시 보너스는 별도입니다. 경기장 레벨당 리그·컵 홈 수입 +1.25억. 컵 수입은 중립구장이 아닌 실제 홈 경기 기준이며 경기 상금은 별도입니다. 상금·이적·재계약 보너스·시설 투자·이사회 지원금은 별도입니다. 지원금은 1부 기준 기본 100억 + 신뢰도 1%당 4억입니다. 2부는 1부의 1/4, 3부는 1/9이며, 새 시즌의 소속 리그 기준으로 지급됩니다.</p></section><div class="management-columns"><section class="panel"><div class="panel-head"><h2>코칭 & 스태프</h2><span class="muted">레벨당 주급 0.05억</span></div>${upgradeCard('staff', 'coach', '수석 코치', '팀 전력과 훈련 성장 확률을 높입니다.', 'tactics')}${upgradeCard('staff', 'scout', '수석 스카우트', 'LV.4부터 분석 기간이 1경기로 단축됩니다.', 'search')}${upgradeCard('staff', 'medic', '의무팀', '경기 부상의 회복 기간을 줄입니다.', 'help')}</section><section class="panel"><div class="panel-head"><h2>구단 시설 투자</h2><span class="count">LONG-TERM</span></div>${upgradeCard('facilities', 'training', '훈련 센터', '매주 선수의 능력 성장 확률을 높입니다.', 'bolt')}${upgradeCard('facilities', 'youth', '유소년 아카데미', '최대 LV.8 · 초기 기량과 잠재력이 높아지며, LV.8에서 잠재력 110까지 가능합니다.', 'star')}${upgradeCard('facilities', 'recovery', '회복 센터', '레벨당 매주 체력 +1, 고강도 훈련 부상 확률 10% 감소.', 'help')}${upgradeCard('facilities', 'stadium', '경기장 확장', '레벨당 리그·국내 컵 홈 수입 +1.25억, AFC·유럽 컵은 25% 추가. 장기 수익에 투자합니다.', 'league')}<p class="field-help">시설은 개선할 때만 비용을 지불하며, 이후 유지비는 없습니다.</p><div class="board-message"><strong>이사회의 메시지</strong><p>${state.confidence >= 70 ? '구단은 감독님의 방향을 신뢰합니다. 지속 가능한 스쿼드를 만들어 주세요.' : state.confidence >= 40 ? '시즌 목표와 예산을 함께 관리해 주세요. 안정적인 성적이 필요합니다.' : '성적과 재정에 대한 우려가 커지고 있습니다. 지원금이 줄어들 수 있습니다.'}</p></div></section></div><section class="panel wellbeing"><div class="panel-head"><h2>재정 장부</h2><span class="muted">최근 ${state.ledger.length}건 합계 · 수입 ${income.toFixed(1)}억 / 지출 ${expenses.toFixed(1)}억</span></div><p class="field-help finance-note">최대 최근 150건의 현금 거래 합계입니다. 선수 영입·재계약·시설 투자도 포함하며, 전체 시즌이나 커리어 누적 손익이 아닙니다. 아래 내역은 최근 20건을 표시합니다.</p><details id="finance-spending"><summary>지출 항목별 합계 보기</summary><div class="detail-rows">${[...spending].sort((a,b)=>b[1]-a[1]).map(([label,amount])=>`<p><span>${esc(label)}</span><b>${amount.toFixed(2)}억</b></p>`).join('')}</div></details>${state.ledger.length ? `<div class="table-wrap"><table><thead><tr><th>시점</th><th>항목</th><th>금액</th></tr></thead><tbody>${state.ledger.slice(0, 20).map(l => `<tr><td>${l.season} · ${l.week + 1}R</td><td>${esc(l.label)}</td><td class="${l.amount >= 0 ? 'success-text' : 'warning-text'}">${l.amount >= 0 ? '+' : ''}${l.amount.toFixed(2)}억</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state">아직 재정 거래가 없습니다.<span>이적, 경기, 계약 및 시설 투자 내역이 기록됩니다.</span></div>'}</section>`;
}
function careerPicker() {
  const countryLeagues = G.LEAGUES.map((l,i)=>({l,i})).filter(x=>x.l.country===chosenNation).sort((a,b)=>a.l.tier-b.l.tier);
  if (!countryLeagues.some(x=>x.i===chosenLeague)) chosenLeague = countryLeagues[0]?.i ?? 0;
  const current = G.LEAGUES[chosenLeague];
  modal(`<div class="career-header"><span class="eyebrow">WELCOME TO TOUCHLINE</span><h2>위대한 축구는,<br>당신의 선택에서 시작됩니다<span>.</span></h2><p>선수를 조작하는 대신, 구단의 모든 결정을 내리는 감독이 되세요.</p><div class="career-facts"><span><b>${state.leagues.length}</b>리그</span><span><b>${state.clubs.length}</b>구단</span><span><b>${state.players.length.toLocaleString()}</b>선수</span><span><b>∞</b>가능성</span></div></div><div class="career-body"><div class="league-tabs">${G.LEAGUES.map((l,i)=>({l,i})).filter(x=>x.l.tier===1).map(({l})=>`<button data-pick-nation="${l.country}" class="${chosenNation===l.country?'active':''}"><span>${l.flag}</span>${esc(l.nation)}</button>`).join('')}</div><div class="career-divisions">${countryLeagues.map(({l,i})=>`<button data-pick-division="${i}" class="${chosenLeague===i?'active':''}">${l.tier}부 · ${esc(l.name)} <small>(${l.teams.length}팀)</small></button>`).join('')}</div><div class="career-clubs">${G.CLUBS.map((c, i) => ({ c, i })).filter(x => x.c[4] === chosenLeague).map(({ c, i }) => `<button class="career-club" data-start-career="${i}"><span class="crest" style="--club:${c[2]}"><span>${c[1]}</span><i>★</i></span><span><strong>${esc(c[0])}</strong><small>이적 예산 ${c[5]}억 · 목표 ${targetFor(i)}위</small></span>${icon('arrow')}</button>`).join('')}</div><p class="field-help">${esc(current.nation)} ${current.tier}부 · ${current.teams.length}개 팀 전체 표시. 실제 구단 이름을 활용한 독립 시뮬레이션이며 선수·능력치·예산은 가상 데이터입니다. 5대 리그는 1~3부 승강제를 적용합니다.</p></div>`, 'career-modal');
  if (!state.careerSelected) $('#modal .modal-close').remove();
}
function halftime() { openLive(); }
function contractQuote(p, years, promised, offered) {
  const d = G.contractDemand(state, p, years, promised);
  const bonus = Math.round(offered * (6 + d.duration * 2) * 100) / 100;
  return `<div class="tip contract-quote"><strong>선수 요구 주급 ${d.salary.toFixed(2)}억 · 실제 ${d.duration}년 계약</strong><p>기량 기준 주급 ${G.marketWage(p).toFixed(2)}억 · ${d.source}${d.games ? ` / 팀 ${d.games}경기, 선수 ${d.minutes}분, ${d.goals}골·${d.assists}도움` : ''}</p><p>${d.factors.map(f => `${f.label} ${f.rate >= 0 ? '+' : ''}${Math.round(f.rate * 100)}%`).join(' · ')}</p><p>구단 충성도 ${d.loyalty}/80 · 장기 재적 시 요구 주급 최대 20% 완화${d.offer ? `<br>${esc(state.clubs[d.offer.club].name)}의 외부 제안: 주급 ${d.offer.salary.toFixed(2)}억 · ${d.offer.years}년 계약` : ''}</p><p>현재 제안 기준: 계약 보너스 ${bonus.toFixed(2)}억 · 1년 주급 약 ${(offered * state.totalWeeks).toFixed(2)}억</p><button type="button" class="secondary small" data-contract-counter="${d.salary}">요구 주급 적용</button></div><p class="field-help">시즌 초 5경기 전에는 지난 시즌 기록을 우선 참고합니다. 수비수는 팀 실점률, 골키퍼는 무실점 비율을 반영합니다. 젊은 선수는 장기 계약에 보상을 요구하고, 베테랑은 계약 보장을 고려해 주급을 낮출 수 있습니다. 재계약 합의 후 12주 동안은 다시 협상할 수 없습니다.</p>`;
}
function refreshContractQuote() {
  const form = $('#contract-form');
  if (!form) return;
  const f = new FormData(form);
  $('#contract-quote').innerHTML = contractQuote(G.player(state, Number(form.dataset.player)), Number(f.get('years')), f.get('promised'), Math.max(0, Number(f.get('salary')) || 0));
}
document.addEventListener('change', e => { if (e.target.matches('#contract-years, #contract-role')) { refreshContractQuote(); $('#contract-feedback').textContent = ''; } });
document.addEventListener('input', e => { if (e.target.id === 'contract-salary') refreshContractQuote(); });
function contractModal(id) {
  const p = G.player(state, id);
  const penalty = G.contractTerminationPenalty(state, id);
  const canRel = G.canRelease(state, id);
  modal(`<span class="eyebrow">CONTRACT NEGOTIATION</span><h2>${esc(p.name)} 계약 관리</h2><p class="modal-desc">현재 계약 ${p.contract}년까지 (${Math.max(1, p.contract - state.season)}년 남음) · 주급 ${G.wage(p).toFixed(2)}억<br>출전·개인 활약·팀 성적과 계약 기간에 따라 주급 유지·인하도 가능합니다. 계약 보너스는 합의 주급 × (6 + 실제 계약 연수 × 2)입니다.</p><form id="contract-form" data-player="${p.id}"><label class="field-label" for="contract-years">새 계약 기간</label><select id="contract-years" name="years">${[1, 2, 3, 4].map(v => `<option value="${v}">${v}년 · ${state.season + v}년까지 (기존 기간보다 짧아지지 않음)</option>`).join('')}</select><label class="field-label" for="contract-role">약속할 출전 비중</label><select id="contract-role" name="promised"><option value="rotation">로테이션</option><option value="key">핵심 선수 · 미출전 시 사기 하락</option><option value="prospect">유망주</option></select><label class="field-label" for="contract-salary">주급 제안 (억)</label><input id="contract-salary" name="salary" type="number" min="0.01" step="0.01" value="${G.wage(p).toFixed(2)}" required><div id="contract-quote" aria-live="polite">${contractQuote(p, 1, 'rotation', G.wage(p))}</div><div id="contract-feedback" role="status"></div><button type="submit" class="primary full">계약 갱신 제안${icon('arrow')}</button></form><div class="termination-box" style="margin-top:1.5rem;padding-top:1rem;border-top:1px solid var(--border)"><h3 style="margin:0 0 0.4rem;font-size:0.95rem;color:var(--danger, #ff5e5e)">선수 계약 해지 (방출)</h3><p class="field-help" style="margin-bottom:0.75rem">상호 합의 하에 즉시 계약을 해지하고 자유 계약(FA)으로 방출합니다.<br>예상 해지 위약금: <b class="warning-text">${penalty.toFixed(1)}억 원</b> (현재 구단 예산: ${state.budget.toFixed(1)}억 원)</p>${!canRel ? '<p class="warning-text" style="font-size:0.85rem;margin-bottom:0.5rem">최소 스쿼드 인원(17명 및 포지션별 필수 인원)을 유지해야 하므로 계약을 해지할 수 없습니다.</p>' : ''}${state.budget < penalty ? '<p class="warning-text" style="font-size:0.85rem;margin-bottom:0.5rem">위약금을 지급할 구단 예산이 부족합니다.</p>' : ''}<button type="button" class="danger full" data-terminate="${p.id}" ${(!canRel || state.budget < penalty || p.loan) ? 'disabled' : ''}>상호 합의 계약 해지 · ${penalty.toFixed(1)}억 원 지급${icon('close')}</button></div>`);
}
function sellModal(id) {
  const p = G.player(state, id);
  if (!p || p.club !== 0) return;
  if (!G.windowOpen(state)) { toast(G.transferWindowLabel(state)); return; }
  if (p.loan) { toast('임대 선수는 판매할 수 없습니다.'); return; }
  if (!G.canRelease(state, id)) { toast('최소 스쿼드 인원(17명 및 포지션별 필수 인원)을 유지해야 합니다.'); return; }
  const offers = G.getTransferOffers(state, id);
  const val = G.value(p);
  const asking = G.askingPrice(state, id);
  modal(`<span class="eyebrow">TRANSFER SALE</span><h2>${esc(p.name)} 선수 매각</h2><div class="negotiation-player">${badge(0)}<div><strong>${esc(p.name)} ${playerPosition(p)}</strong><span>${esc(me().name)} · ${p.age}세 · ${rating(p)}</span></div></div><div class="detail-rows"><p>시장 가치<b>${cash(val)}</b></p><p>권장 이적료<b>${cash(asking)}</b></p><p>현재 상태<b>${state.transferList?.includes(p.id) || p.transferListed ? '이적 명단 등록' : '일반'}</b></p></div><div style="margin-top:1.2rem"><h3 style="font-size:0.95rem;margin-bottom:0.6rem">영입 관심 구단 제안</h3><div style="display:flex;flex-direction:column;gap:0.5rem">${!offers.length?'<p class="empty-state">현재 조건에 맞는 관심 구단이 없습니다.<span>이적 명단에 등록한 뒤 다음 주에 다시 확인하세요.</span></p>':''}${offers.map(o => `<div class="news-row sale-offer" style="padding:0.75rem 1rem;display:flex;align-items:center;justify-content:space-between"><div style="display:flex;align-items:center;gap:0.75rem">${badge(o.club, 'tiny')}<div><button class="player-name" data-club-roster="${o.club}">${esc(o.clubName)} · 로스터 보기</button><small style="display:block;color:var(--muted)">${esc(o.leagueName)}</small><small style="display:block;color:var(--muted)">${esc(o.reason)} · 제안 주급 ${o.salary.toFixed(2)}억</small></div></div><div style="display:flex;align-items:center;gap:0.75rem"><b class="success-text" style="font-size:1.05rem">${cash(o.cash)}</b><button class="primary small" data-accept-sell="${o.player}" data-buyer="${o.club}" data-cash="${o.cash}">즉시 매각</button></div></div>`).join('')}</div></div>${offers.length?`<form id="sell-form" data-player="${p.id}" style="margin-top:1.2rem;padding-top:1rem;border-top:1px solid var(--border)"><h3 style="font-size:0.95rem;margin-bottom:0.6rem">희망 이적료 협상 제안</h3><label class="field-label" for="sell-club">협상 대상 구단</label><select id="sell-club" name="club" required>${offers.map(o => `<option value="${o.club}">${esc(o.clubName)} (${esc(o.leagueName)})</option>`).join('')}</select><label class="field-label" for="sell-cash">제안할 이적료 (억 원)</label><input id="sell-cash" name="cash" type="number" min="1" step="0.5" value="${asking}" required><p class="field-help">상대 구단이 이적료를 검토하고 수락하거나 역제안을 보냅니다. 유스의 시장 가치에는 누적 실전 경험이 반영됩니다.</p><div id="sell-feedback" role="status"></div><button type="submit" class="secondary full">이적료 협상 보내기${icon('arrow')}</button></form>`:''}<p class="field-help">구단 이름을 누르면 상대 로스터를 볼 수 있습니다. 제안은 포지션 수요·이적 예산·주급 한도·선수 이적 의향을 반영하며, 최종 수락 시 다시 확인합니다.</p>`);
}
function managementResult(r) { if (r.ok) { save(); render(); } toast(r.message); }
document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  if (b.dataset.pickNation !== undefined) { chosenNation = b.dataset.pickNation; chosenLeague = G.LEAGUES.findIndex(l => l.country === chosenNation && l.tier === 1); careerPicker(); }
  if (b.dataset.pickDivision !== undefined) { chosenLeague = Number(b.dataset.pickDivision); chosenNation = G.LEAGUES[chosenLeague]?.country || chosenNation; careerPicker(); }
  if (b.dataset.startCareer !== undefined) { state = G.newGame(Date.now(), Number(b.dataset.startCareer)); state.careerSelected = true; page = 'overview'; viewedLeague = 0; marketLeague = 'ALL'; marketQuery = ''; closeModal(); save(); render(); toast(`${me().name}의 새로운 감독으로 부임했습니다.`); }
  if (b.dataset.cup) { viewedCup=b.dataset.cup; page='cups'; render(); }
  if (b.dataset.cupResult !== undefined) { const m=state.cupResults[Number(b.dataset.cupResult)]; if(m) matchReport(m); }
  if (b.dataset.league !== undefined) { viewedLeague = Number(b.dataset.league); render(); }
  if (b.dataset.training) { if (state.pending) return toast('경기를 먼저 마쳐 주세요.'); state.training = b.dataset.training; save(); render(); toast('이번 주 훈련 계획을 변경했습니다.'); }
  if (b.dataset.intensity !== undefined) { if (state.pending) return toast('경기를 먼저 마쳐 주세요.'); state.intensity = Number(b.dataset.intensity); save(); render(); }
  if (b.dataset.upgrade) { const [group, key] = b.dataset.upgrade.split(':'); managementResult(G.upgrade(state, group, key)); }
  if (b.dataset.loanOut) loanOutModal(Number(b.dataset.loanOut));
  if (b.dataset.optionCounter) { $('#option-price').value=b.dataset.optionCounter; }
  if (b.dataset.buyLoan) { const r=G.exerciseLoanOption(state,Number(b.dataset.buyLoan)); if(r.ok)closeModal(); managementResult(r); }
  if (b.dataset.promote) managementResult(G.promote(state, Number(b.dataset.promote)));
  if (b.dataset.scout) { const r = G.scout(state, Number(b.dataset.scout)); managementResult(r); if (r.ok && $('#modal').open) profile(Number(b.dataset.scout)); }
  if (b.dataset.renew) contractModal(Number(b.dataset.renew));
  if (b.dataset.contractCounter) { $('#contract-salary').value = b.dataset.contractCounter; refreshContractQuote(); }
  if (b.dataset.transferList) { const r = G.toggleTransferList(state, Number(b.dataset.transferList)); if (r.ok) { save(); render(); if ($('#modal').open) profile(Number(b.dataset.transferList)); } toast(r.message); }
  if (b.dataset.sell) sellModal(Number(b.dataset.sell));
  if (b.dataset.clubRoster!==undefined) clubRoster(Number(b.dataset.clubRoster));
  if (b.dataset.acceptSell) { const r = G.sellPlayer(state, Number(b.dataset.acceptSell), Number(b.dataset.buyer), Number(b.dataset.cash)); if (r.ok) { closeModal(); save(); render(); } toast(r.message); }
  if (b.dataset.terminate) {
    const pid = Number(b.dataset.terminate), p = G.player(state, pid);
    const penalty = G.contractTerminationPenalty(state, pid);
    if (confirm(`${p.name} 선수와의 계약을 정말 해지하시겠습니까?\n위약금 ${penalty.toFixed(1)}억 원이 구단 예산에서 차감되며 선수는 자유 계약(FA)으로 방출됩니다.`)) {
      const r = G.terminateContract(state, pid);
      if (r.ok) { closeModal(); save(); render(); }
      toast(r.message);
    }
  }
  if (b.dataset.talk) { const p = G.player(state, b.dataset.talk); modal(`<span class="eyebrow">PLAYER CONVERSATION</span><h2>${esc(p.name)} 개인 면담</h2><p class="modal-desc">현재 사기 ${p.morale}% · 선수당 매주 한 번 가능</p><div class="settings-buttons"><button class="secondary" data-talk-id="${p.id}" data-talk-kind="encourage">격려하기 · 항상 사기 +3</button><button class="secondary" data-talk-id="${p.id}" data-talk-kind="praise">칭찬하기 · 사기 60 이상일 때 +7, 그 외 -3</button><button class="secondary" data-talk-id="${p.id}" data-talk-kind="challenge">분발 요구 · 사기 55 이상일 때 +4, 그 외 -6</button></div>`); }
  if (b.dataset.talkId) { const r = G.talk(state, Number(b.dataset.talkId), b.dataset.talkKind); if (r.ok) closeModal(); managementResult(r); }
  if (b.dataset.preset) {
    if (state.pending) return toast('진행 중인 경기는 하프타임에서 지침을 조절하세요.');
    const presets = { possession: { formation: '4-2-3-1', mentality: 0, press: 1, tempo: 0, passing: 0, line: 1, width: 1 }, counter: { formation: '5-3-2', mentality: -1, press: 0, tempo: 2, passing: 2, line: -1, width: 2 }, press: { formation: '4-3-3', mentality: 1, press: 2, tempo: 2, passing: 1, line: 1, width: 1 } };
    Object.entries(presets[b.dataset.preset]).forEach(([k, v]) => G.setTactics(state, k, v)); save(); render(); toast('전술 프리셋을 적용했습니다. 선수별 임무를 더 조정할 수 있습니다.');
  }
  if (b.dataset.action === 'more-market') { marketLimit += 40; $('#market-results').innerHTML = marketTable(marketPlayers()); }
  if (b.dataset.action === 'substitute') {
    const form = new FormData($('#halftime-form')); for (const f of ['mentality', 'press', 'tempo', 'line', 'passing']) G.setTactics(state, f, Number(form.get(f)));
    const r = G.substitute(state, Number($('#sub-out').value), Number($('#sub-in').value)); if (r.ok) { save(); render(); halftime(); } toast(r.message);
  }
});
document.addEventListener('change', e => {
  if (e.target.id === 'view-league') { viewedLeague=Number(e.target.value); render(); }
  if (e.target.id === 'view-cup') { viewedCup=e.target.value; render(); }
  if (e.target.id === 'cup-rotation') { state.cupPlan.rotation=e.target.value==='true'; save(); toast('컵 경기 선수 기용 계획을 저장했습니다.'); }
  if (e.target.id === 'cup-approach') { state.cupPlan.approach=e.target.value; save(); toast('컵 경기 전술 계획을 저장했습니다.'); }
  if (e.target.id === 'market-league') { marketLeague = e.target.value; marketLimit = 40; render(); }
  if (e.target.id === 'captain') { state.captain = Number(e.target.value); save(); toast('주장을 변경했습니다.'); }
  if (e.target.dataset.roleSlot !== undefined) { state.roles[Number(e.target.dataset.roleSlot)] = e.target.value; save(); render(); }
  if (e.target.id === 'purchase-option') $('#option-price').disabled=!e.target.checked;
  if (e.target.id === 'transfer-type') { const loan = e.target.value === 'loan'; $('#loan-options').hidden=!loan; $('#swap-player').disabled = loan; if (loan) $('#swap-player').value = ''; const id = Number($('#deal-form').dataset.player); $('#bid-cash').value = loan ? Math.ceil(G.askingPrice(state, id) * .2) : (G.player(state,id).club===-1?0:G.value(G.player(state, id))); $('#deal-feedback').innerHTML = ''; }
});
document.addEventListener('submit', e => {
  if (e.target.id === 'halftime-form') {
    e.preventDefault(); if (!state.pending) return;
    const form = new FormData(e.target); for (const f of ['mentality', 'press', 'tempo', 'line', 'passing']) G.setTactics(state, f, Number(form.get(f)));
    const talk = form.get('teamtalk'); G.roster(state).forEach(p => { const delta = talk === 'encourage' ? 2 : talk === 'demand' ? (p.morale > 60 ? 4 : -3) : (p.morale < 60 ? 4 : 1); p.morale = Math.max(20, Math.min(100, p.morale + delta)); });
    const m = G.playWeek(state); save(); page = 'overview'; render(); matchReport(m);
  }
  if (e.target.id === 'contract-form') { e.preventDefault(); const f = new FormData(e.target), r = G.renew(state, Number(e.target.dataset.player), Number(f.get('years')), Number(f.get('salary')), f.get('promised')); if (r.ok) { closeModal(); managementResult(r); } else $('#contract-feedback').innerHTML = `<p class="warning-text">${esc(r.message)}</p>${r.counter !== undefined ? `<button type="button" class="secondary small" data-contract-counter="${r.counter}">요구 주급 적용</button>` : ''}`; }
  if (e.target.id === 'loan-out-form') {
    e.preventDefault(); const f=new FormData(e.target),r=G.loanOut(state,Number(e.target.dataset.player),Number(f.get('club')),f.get('purchase-option')?Number(f.get('option-price')):null);
    if(r.ok){closeModal();managementResult(r);}else $('#loan-feedback').innerHTML=`<p class="warning-text">${esc(r.message)}</p>${optionCounter(r)}`;
  }
  if (e.target.id === 'sell-form') {
    e.preventDefault();
    const f = new FormData(e.target), pid = Number(e.target.dataset.player), cid = Number(f.get('club')), cash = Number(f.get('cash'));
    const r = G.negotiateSale(state, pid, cid, cash);
    if (r.ok) { closeModal(); save(); render(); toast(r.message); }
    else if (r.counter) {
      $('#sell-cash').value = r.counter;
      $('#sell-feedback').innerHTML = `<p class="warning-text">${esc(r.message)}</p>`;
    } else {
      $('#sell-feedback').innerHTML = `<p class="warning-text">${esc(r.message)}</p>`;
    }
  }
});
$('#modal').addEventListener('cancel', e => { if (!state?.careerSelected) e.preventDefault(); });
window.addEventListener('beforeunload', e => {
  if (saveRevision && saveStatus !== '자동 저장됨') { e.preventDefault(); e.returnValue = ''; }
});
async function initialize() {
  $('#app').textContent = '커리어를 불러오는 중…';
  try {
    saveDatabase = await openSaveDatabase();
    let raw = await saveRecord('readonly');
    // Read the old localStorage save only when no IndexedDB save exists.
    if (raw === undefined) raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!G.validSave(parsed)) throw new Error('save');
      state = G.upgradeSave(parsed);
    }
  } catch {
    storageWarning = '기존 저장을 불러오지 못했습니다. 원본은 보존됩니다. 커리어 메뉴에서 저장 파일을 불러와 주세요.';
    saveStatus = '저장 불러오기 실패';
  }
  state ||= G.newGame(20260926);
  render();
  if (!state.careerSelected) careerPicker();
  if (storageWarning) toast(storageWarning);
  else save();
}
initialize();
