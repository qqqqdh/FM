/* Local, dependency-free game rules. Also loaded by the Node smoke test. */
(function (root) {
  'use strict';
  const LEAGUES = typeof module !== 'undefined' && module.exports ? require('./world.js') : root.TOUCHLINE_WORLD;
  const ROSTERS = LEAGUES.rosters || {};
  const COLORS = ['#ed8b85', '#f47e87', '#87c9ef', '#ef8e81', '#82a8fc', '#e0e6ed', '#b8c4c7', '#d29fae', '#87b5f4', '#c3a0c2', '#7ca5e5', '#ecd586', '#96d18e', '#e1a96d', '#87d2c8', '#c992d1', '#d4b17d', '#84a6d8', '#ef9b9b', '#9cb8a4'];
  const CLUBS = LEAGUES.flatMap((l, li) => l.teams.map((name, i) => [name, `${l.flag}${String(i + 1).padStart(2, '0')}`, COLORS[i % COLORS.length], name + ' 파크', li, Math.round((90 + (l.teams.length - 1 - i) * 8) * (l.tier === 1 ? (li < 15 ? 1 : .6) : l.tier === 2 ? .32 : .12))]));
  const FORMATIONS = {
    '4-3-3': ['GK', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'FW', 'FW', 'FW'],
    '4-4-2': ['GK', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'MF', 'FW', 'FW'],
    '3-5-2': ['GK', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'MF', 'MF', 'FW', 'FW'],
    '4-2-3-1': ['GK', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'MF', 'MF', 'FW'],
    '5-3-2': ['GK', 'DF', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'FW', 'FW']
  };
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const round = n => Math.round(n * 100) / 100;
  function rng(s) {
    s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
    return s.seed / 4294967296;
  }
  const roster = (s, team = 0) => s.players.filter(p => p.club === team);
  const ovr = p => Math.round(p.pos === 'GK' ? p.def * .7 + p.tech * .2 + p.pace * .1 : p.pos === 'DF' ? p.def * .55 + p.pace * .2 + p.tech * .25 : p.pos === 'MF' ? p.tech * .55 + p.def * .2 + p.atk * .25 : p.atk * .6 + p.pace * .25 + p.tech * .15);
  const value = p => Math.round((ovr(p) - 45) * (ovr(p) - 45) / 27 * (p.age < 24 ? 1.22 : p.age > 30 ? .75 : 1));
  const wage = p => p.salary ?? round(ovr(p) * .002);
  const payroll = s => round(roster(s).reduce((a, p) => a + wage(p), 0));
  const windowOpen = s => s.week < 5 || (s.week >= 11 && s.week < 14);
  const indexes = new WeakMap();
  function player(s, id) {
    let index = indexes.get(s);
    if (!index || index.size !== s.players.length) { index = new Map(s.players.map(p => [p.id, p])); indexes.set(s, index); }
    return index.get(Number(id));
  }
  function singleRoundRobin(ids) {
    const rotation = ids.slice(), rounds = [];
    if (rotation.length % 2) rotation.push(null);
    for (let r = 0; r < rotation.length - 1; r++) {
      const matches = [];
      for (let i = 0; i < rotation.length / 2; i++) {
        const h = rotation[i], a = rotation[rotation.length - 1 - i];
        if (h !== null && a !== null) matches.push(r % 2 ? [a, h] : [h, a]);
      }
      rounds.push(matches);
      rotation.splice(1, 0, rotation.pop());
    }
    return rounds;
  }
  function roundRobin(ids) {
    const rounds = singleRoundRobin(ids);
    return rounds.concat(rounds.map(r => r.map(([h, a]) => [a, h])));
  }
  function scheduleFor12Teams(ids) {
    const single = singleRoundRobin(ids);
    const r1 = single;
    const r2 = single.map(r => r.map(([h, a]) => [a, h]));
    const r3 = single.map((r, i) => r.map(([h, a]) => i % 2 === 0 ? [h, a] : [a, h]));
    const top6 = ids.slice(0, 6), bot6 = ids.slice(6, 12);
    const topRounds = singleRoundRobin(top6), botRounds = singleRoundRobin(bot6);
    const finalRounds = Array.from({ length: 5 }, (_, w) => [...topRounds[w], ...botRounds[w]]);
    return [...r1, ...r2, ...r3, ...finalRounds];
  }
  function schedule(clubs, leagues = LEAGUES) {
    const leagueRounds = leagues.map((league, group) => {
      const ids = Array.isArray(clubs) ? clubs.filter(c => c.league === group).map(c => c.id) : Array.from({ length: league.teams.length }, (_, i) => i);
      if (league.rounds === 38 || (ids.length === 12 && league.tier === 1)) return scheduleFor12Teams(ids);
      const sizes = Array.isArray(league.groupSizes) && league.groupSizes.reduce((a, n) => a + n, 0) === ids.length ? league.groupSizes : [ids.length];
      let offset = 0;
      const groupedRounds = sizes.map(size => { const rounds = roundRobin(ids.slice(offset, offset + size)); offset += size; return rounds; });
      const total = Math.max(0, ...groupedRounds.map(rounds => rounds.length));
      return Array.from({ length: total }, (_, week) => groupedRounds.flatMap(rounds => rounds[week] || []));
    });
    const total = Math.max(0, ...leagueRounds.map(r => r.length));
    return Array.from({ length: total }, (_, week) => leagueRounds.flatMap(rounds => rounds[week] || []));
  }
  const available = p => p.injury === 0 && p.banned === 0;
  const DETAILS = { finishing: '골 결정력', passing: '패스', vision: '시야', dribbling: '드리블', crossing: '크로스', tackling: '태클', marking: '마킹', positioning: '위치 선정', acceleration: '가속력', stamina: '지구력', strength: '몸싸움', heading: '헤더', reflexes: '반사신경', handling: '볼 처리' };
  const POSITIONS = { GK: '골키퍼', CB: '센터백', LB: '왼쪽 풀백', RB: '오른쪽 풀백', DM: '수비형 미드필더', CM: '중앙 미드필더', AM: '공격형 미드필더', LW: '왼쪽 윙어', RW: '오른쪽 윙어', ST: '스트라이커' };
  const POSITION_GROUPS = { GK:['GK'], DF:['LB','CB','CB','RB'], MF:['DM','CM','AM','CM'], FW:['LW','ST','RW','ST'] };
  const SLOTS = {
    '4-3-3': ['GK','LB','CB','CB','RB','DM','CM','CM','LW','ST','RW'],
    '4-4-2': ['GK','LB','CB','CB','RB','LW','CM','CM','RW','ST','ST'],
    '3-5-2': ['GK','CB','CB','CB','LB','DM','CM','AM','RB','ST','ST'],
    '4-2-3-1': ['GK','LB','CB','CB','RB','DM','DM','LW','AM','RW','ST'],
    '5-3-2': ['GK','LB','CB','CB','CB','RB','DM','CM','AM','ST','ST']
  };
  const INSTRUCTIONS = { movement: { hold: '자리 유지', overlap: '바깥으로 오버랩', invert: '안으로 좁히기', channel: '채널 침투', roam: '자유롭게 이동' }, runs: { hold: '후방 대기', support: '상황에 맞춰 전진', forward: '적극적으로 전진' }, passing: { short: '짧은 패스', mixed: '혼합 패스', direct: '직선적인 패스' }, pressing: { contain: '지역 지키기', normal: '균형 압박', intense: '적극 압박' } };
  Object.assign(INSTRUCTIONS, { dribbling: { safe:'패스 우선', balanced:'상황 판단', takeOn:'돌파 우선' }, shooting: { patient:'좋은 기회만', balanced:'상황 판단', often:'적극 슈팅' }, crossing: { low:'낮은 크로스', mixed:'혼합', high:'높은 크로스' }, marking: { zonal:'지역 수비', tight:'밀착 수비', cover:'뒷공간 커버' } });
  const defaultInstruction = () => ({ movement:'hold', runs:'support', passing:'mixed', pressing:'normal', dribbling:'balanced', shooting:'balanced', crossing:'mixed', marking:'zonal', attackX:null, attackY:null, defendX:null, defendY:null });
  const emptyLeagueStats = () => ({ matches:0, starts:0, minutes:0, goals:0, assists:0, shots:0, onTarget:0, cleanSheets:0 });
  function detail(p) {
    if (!p.attributes) {
      const bases = [p.atk,p.tech,p.tech,p.tech,p.tech,p.def,p.def,p.def,p.pace,(p.pace+p.def)/2,(p.atk+p.def)/2,p.atk,p.def,p.def];
      p.attributes = Object.fromEntries(Object.keys(DETAILS).map((k, i) => [k, clamp(Math.round(bases[i] + ((p.id * 7 + i * 11) % 17) - 8), 1, 99)]));
    }
    p.position ||= POSITION_GROUPS[p.pos][p.id % POSITION_GROUPS[p.pos].length];
    p.foot ||= p.id % 10 < 3 ? 'left' : p.id % 10 === 3 ? 'both' : 'right';
    p.ambition ??= 40 + p.id % 61;
    return p;
  }
  function upgradeSave(s) {
    [...s.players, ...s.academy].forEach(detail);
    s.instructions = Array.from({length:11}, (_,i) => ({...defaultInstruction(),...s.instructions?.[i]}));
    s.tacticPlans ||= [null,null,null];
    s.transferList ||= [];
    s.players.forEach(p => { p.transferListed ??= s.transferList.includes(p.id); p.history ||= []; });
    if (s.pending) s.pending.minute ??= 45;
    return s;
  }
  function suitability(p, slot) {
    const position = detail(p).position;
    if (position === slot) return 1;
    if ([position,slot].includes('GK')) return .3;
    const group = x => ['CB','LB','RB'].includes(x) ? 'back' : ['DM','CM','AM'].includes(x) ? 'mid' : 'front';
    return group(position) === group(slot) ? .88 : .68;
  }
  function lineupScore(p, slot) { return ovr(p) * (.35 + p.fitness / 100 * .65) * suitability(p, slot) + detail(p).attributes.stamina * .06; }
  function autoLineup(s, club = 0) {
    let pool = roster(s, club).filter(available);
    if (pool.length < 11) pool = roster(s, club).slice();
    return SLOTS[s.clubs[club].tactics.formation].map(pos => {
      pool.sort((a, b) => lineupScore(b,pos) - lineupScore(a,pos));
      return pool.shift().id;
    });
  }
  const NAME_POOLS = {
    KR: {
      last: ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '전', '홍', '고', '문', '양', '손', '배', '백', '허', '유', '남', '심', '노', '하', '곽', '성', '차', '주', '우', '구', '라', '민'],
      first: ['도윤', '시우', '지훈', '민재', '서준', '현우', '준혁', '태양', '건우', '우진', '승호', '정우', '유찬', '민혁', '성민', '태준', '진우', '승현', '하준', '도현', '지안', '이준', '태오', '민규', '동현', '예준', '준서', '시환', '로운', '서진', '시원', '준석', '재원', '윤우', '은우', '수호', '준영', '태민', '지환', '승우']
    },
    JP: {
      last: ['사토', '스즈키', '다나카', '다카하시', '와타나베', '이토', '나카무라', '고바야시', '야마모토', '가토', '요시다', '야마다', '사사키', '야마구치', '사이토', '마츠모토', '이노우에', '기무라', '하야시', '시미즈', '야마자키', '모리', '아베', '이케다', '하시모토', '야마시타', '이시카와', '나카지마', '마에다', '오가와'],
      first: ['렌', '하루토', '미나토', '유토', '아오이', '리쿠', '소타', '유키', '하야토', '히로토', '다쿠미', '켄타', '쇼타', '다이키', '료', '켄토', '소마', '카즈키', '신지', '타케히로', '코타로', '유마', '케이타', '다이치', '소라', '슌', '카이토', '츠바사', '하야테', '류세이']
    },
    CN: {
      last: ['왕', '리', '장', '류', '천', '양', '황', '자오', '우', '저우', '쉬', '쑨', '마', '주', '후', '궈', '허', '가오', '린', '뤄'],
      first: ['하오', '레이', '웨이', '밍', '쥔', '펑', '양', '보', '타오', '신', '롱', '첸', '린', '진', '카이', '차오', '빈', '저', '위안', '샹']
    },
    ARAB: {
      last: ['알도사리', '알셰흐리', '알파라지', '알힐랄리', '알오와이스', '알불라이히', '알간남', '알하이바리', '알탐바크티', '알말키', '알감디', '알하르비', '알오타이비', '알카타니', '알콰르니', '알모와샤르', '알하산', '알주바이디', '알나스르', '알아리피'],
      first: ['살렘', '살만', '모하메드', '압둘라', '사우드', '파하드', '술탄', '야세르', '압둘라흐만', '하산', '나와프', '알리', '파이살', '칼리드', '아흐메드', '오마르', '지아드', '바데르', '타리크', '마지드']
    },
    IR: {
      last: ['타레미', '아즈문', '자한바크시', '베이란반드', '호세이니', '에자톨라히', '하지사피', '모하마디', '토라비', '모헤비', '레자이안', '고도스', '골리자데', '아미리', '안사리파르드'],
      first: ['메흐디', '사르다르', '알리레자', '알리', '사데그', '사만', '사에드', '에흐산', '밀라드', '오미드', '페즈만', '바히드', '카림', '모하마드', '레자']
    },
    TH: {
      last: ['송크라신', '당다', '차이디드', '헴비분', '분마탄', '유옌', '사라찻', '차이뎃', '참랏사미', '통송'],
      first: ['차나팁', '테라실', '수파차이', '판사', '티라톤', '사라치', '수파촉', '피라돈', '쑤파낫', '위라텝']
    },
    MY: {
      last: ['라시드', '샤룰', '코빈', '쿨스', '파자일', '하킴', '나짐', '다비드', '사파위', '아리프'],
      first: ['사파위', '아리프', '샤룰', '라시드', '파자일', '하킴', '루크만', '브렌던', '모하마두', '아크햐르']
    },
    UZ: {
      last: ['쇼무로도프', '마샤리포프', '슈쿠로프', '아슈르마토프', '우루노프', '나스룰라예프', '유수포프', '에쉬무로도프', '사이피예프', '함로베코프'],
      first: ['엘도르', '잘롤리딘', '오타베크', '루스탐', '오스톤', '셰르조드', '우트키르', '우마르', '파루흐', '오딜']
    },
    WEST: {
      first: ['루카', '마테오', '다니엘', '레오', '마르코', '니코', '알렉스', '오스카', '에릭', '가브리엘', '빅토르', '토마스', '율리안', '파블로', '루이스', '엔조', '노아', '엘리엇', '카이', '펠릭스', '하비', '안드레', '다비드', '세바스티안', '올리버', '펠리페', '테오', '아담', '에밀', '리암'],
      last: ['실바', '마르틴', '로시', '베르너', '산토스', '코스타', '뮐러', '스미스', '모레노', '클라크', '슈미트', '로페스', '페레이라', '워커', '콘티', '슈나이더', '페레즈', '브라운', '디아스', '베커', '에반스', '로메로', '벨', '카터', '라르센', '레예스', '베르디', '얀센', '폰테', '모랄레스']
    }
  };
  function randomName(s, flag) {
    const key = ['SA', 'QA', 'AE', 'IQ'].includes(flag) ? 'ARAB' : (NAME_POOLS[flag] ? flag : 'WEST');
    const pool = NAME_POOLS[key];
    const last = pool.last[Math.floor(rng(s) * pool.last.length)];
    const first = pool.first[Math.floor(rng(s) * pool.first.length)];
    if (['KR', 'CN'].includes(flag)) return last + first;
    if (['JP'].includes(flag)) return last + ' ' + first;
    return first + ' ' + last;
  }
  function newGame(seed = Date.now(), chosen = 0) {
    if (!Number.isInteger(chosen) || !CLUBS[chosen]) chosen = 0;
    const chosenLeague = CLUBS[chosen][4], leagueOrder = [chosenLeague, ...LEAGUES.map((_,i)=>i).filter(i => i !== chosenLeague)];
    const orderedClubs = leagueOrder.flatMap(li => [CLUBS[chosen], ...CLUBS.filter((c, i) => c[4] === li && i !== chosen)].filter(c => c[4] === li));
    const chosenPosition = LEAGUES[CLUBS[chosen][4]].teams.indexOf(CLUBS[chosen][0]);
    const s = { version: 3, seed: seed >>> 0, season: 2026, week: 0, totalWeeks: 0, budget: CLUBS[chosen][5], players: [], clubs: [], leagues: leagueOrder.map(i => ({ ...LEAGUES[i], source: i })), fixtures: [], results: [], news: [], incoming: [], watch: [], transfers: [], transferList: [], lastMatch: null, pending: null, careerSelected: false, training: 'balanced', intensity: 1, staff: { coach: 2, scout: 2, medic: 2 }, facilities: { training: 1, youth: 1 }, confidence: 70, target: chosenPosition < 5 ? 4 : chosenPosition < 13 ? 6 : 9, scouting: [], academy: [], ledger: [], roles: Array(11).fill('balanced'), captain: null, competitions: [], cupResults: [], honors: [], promotionNews: [] };
    s.clubs = orderedClubs.map(([name, short, color, stadium, origin], i) => ({ id: i, name, short, color, stadium, origin, league: leagueOrder.indexOf(origin), pts: 0, gf: 0, ga: 0, played: 0, wins: 0, draws: 0, losses: 0, form: [], tactics: { formation: i % 2 ? '4-4-2' : '4-3-3', mentality: 0, press: i % 3, tempo: 1, width: 1, line: 0, passing: 1, focus: 0 }, lineup: [] }));
    s.fixtures = schedule(s.clubs, s.leagues); s.totalWeeks = s.fixtures.length;
    const positions = ['GK', 'GK', 'GK', ...Array(7).fill('DF'), ...Array(7).fill('MF'), ...Array(5).fill('FW')];
    for (let c = 0; c < CLUBS.length; c++) positions.forEach((pos, i) => {
      const originLeague = LEAGUES[s.clubs[c].origin], originPosition = originLeague.teams.indexOf(s.clubs[c].name);
      const base = 62 + Math.floor(rng(s) * 16) + (originPosition < Math.min(4, originLeague.teams.length) ? 4 : 0) - (s.leagues[s.clubs[c].league].tier - 1) * 8;
      const stat = bonus => clamp(base + Math.floor(rng(s) * 12) - 5 + bonus, 40, 92);
      const rosterNames = ROSTERS[s.clubs[c].name];
      const generatedName = randomName(s, originLeague.flag);
      const p = { id: c * 22 + i + 1, name: rosterNames?.[i] || generatedName, club: c, pos, age: 19 + Math.floor(rng(s) * 15), atk: stat(pos === 'FW' ? 5 : -5), def: stat(pos === 'DF' || pos === 'GK' ? 6 : -6), tech: stat(pos === 'MF' ? 6 : 0), pace: stat(2), fitness: 93 + Math.floor(rng(s) * 8), morale: 75, injury: 0, banned: 0, yellows: 0, goals: 0, appearances: 0, potential: Math.min(95, base + 10 + Math.floor(rng(s) * 9)), contract: 2027 + Math.floor(rng(s) * 3), promised: 'rotation', loan: null };
      p.salary = round(ovr(p) * .002); s.players.push(p);
    });
    s.clubs.forEach(c => { c.lineup = autoLineup(s, c.id); });
    s.captain = s.clubs[0].lineup[1];
    s.news.push({ title: '당신의 철학으로, 새로운 시즌을.', text: `${s.clubs[0].name}의 감독으로 부임했습니다. ${s.leagues.length}개 리그, ${s.clubs.length}개 구단이 기다립니다. 이사회 목표는 ${s.target}위 이내입니다.`, type: 'club', week: 0 });
    youthIntake(s); initCompetitions(s);
    makeOffer(s);
    return upgradeSave(s);
  }
  function standings(s, league = 0) { return s.clubs.filter(c => c.league === Number(league)).sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.id - b.id); }
  function nextFixture(s) { return s.fixtures[s.week]?.find(m => m.includes(0)); }
  function canRelease(s, id) {
    const p = player(s, id);
    return p && !p.loan && (p.club === -1 || (roster(s, p.club).length > 16 && roster(s, p.club).filter(x => x.pos === p.pos && available(x)).length > (p.pos === 'GK' ? 1 : 3)));
  }
  function fixLineups(s) {
    s.clubs.forEach(c => {
      if (c.id !== 0 || c.lineup.length !== 11 || c.lineup.some(id => player(s, id)?.club !== c.id || !available(player(s, id)))) c.lineup = autoLineup(s, c.id);
    });
  }
  function setTactics(s, field, v) {
    const t = s.clubs[0].tactics;
    if (field === 'formation' && FORMATIONS[v] && !s.pending) { t.formation = v; s.clubs[0].lineup = autoLineup(s); s.roles = Array(11).fill('balanced'); }
    else if (['mentality', 'press', 'tempo', 'width', 'line', 'passing', 'focus'].includes(field) && Number.isInteger(Number(v)) && Number(v) >= (['mentality', 'line'].includes(field) ? -1 : 0) && Number(v) <= (['mentality', 'line'].includes(field) ? 1 : 2)) t[field] = Number(v);
  }
  function setTarget(s, slot, phase, x, y) {
    if (!Number.isInteger(slot) || slot<0 || slot>10 || !['attack','defend'].includes(phase)) return false;
    if (!((x===null && y===null) || [x,y].every(n=>Number.isFinite(n)&&n>=5&&n<=95))) return false;
    if (!s.instructions) upgradeSave(s);
    s.instructions[slot][phase+'X']=x; s.instructions[slot][phase+'Y']=y; return true;
  }
  function tacticPlan(s, index, action, name='') {
    if (!Number.isInteger(index)||index<0||index>2||!['save','load'].includes(action)||s.pending) return false;
    s.tacticPlans ||= [null,null,null];
    if(action==='save') s.tacticPlans[index]=JSON.parse(JSON.stringify({name:String(name).trim().slice(0,40)||`전술 ${index+1}`,tactics:s.clubs[0].tactics,instructions:s.instructions,roles:s.roles}));
    else {
      const plan=s.tacticPlans[index]; if(!plan)return false;
      s.clubs[0].tactics={...plan.tactics}; s.instructions=plan.instructions.map(i=>({...defaultInstruction(),...i})); s.roles=plan.roles.slice(); s.clubs[0].lineup=autoLineup(s);
    }
    return true;
  }
  function setLineup(s, slot, id) {
    id = Number(id); slot = Number(slot);
    if (!Number.isInteger(slot) || slot < 0 || slot > 10 || player(s, id)?.club !== 0 || !available(player(s, id))) return false;
    const ids = s.clubs[0].lineup, other = ids.indexOf(id);
    if (other >= 0) [ids[slot], ids[other]] = [ids[other], ids[slot]];
    else ids[slot] = id;
    return true;
  }
  function askingPrice(s, id) {
    const p = player(s, id);
    if (p.club === -1) return 0;
    return Math.ceil(value(p) * (1.1 + (p.id % 5) * .045));
  }
  function wageDemand(s, p, buyer = 0) {
    const gap = Math.max(0, s.leagues[s.clubs[buyer].league].tier - (p.club >= 0 ? s.leagues[s.clubs[p.club].league].tier : s.leagues[s.clubs[buyer].league].tier));
    const premium = gap * detail(p).ambition / 100 * .8;
    return { gap, premium, salary: round(wage(p) * (1 + premium)) };
  }
  function deal(s, id, cash, swapId = null, loan = false, salary = null) {
    if (s.pending) return { ok: false, message: '진행 중인 경기를 먼저 마쳐 주세요.' };
    if (!windowOpen(s)) return { ok: false, message: '현재 이적시장이 닫혀 있습니다. 12라운드에 다시 열립니다.' };
    const p = player(s, id), swap = swapId ? player(s, swapId) : null;
    if (!p || p.club === 0 || !Number.isFinite(cash) || cash < 0 || (swapId && (!swap || swap.club !== 0))) return { ok: false, message: '제안 조건을 확인해 주세요.' };
    if (cash > s.budget) return { ok: false, message: '이적 예산이 부족합니다.' };
    if ((loan && (swap || p.club === -1)) || (swap && p.club === -1)) return { ok: false, message: '임대 및 자유 계약에는 선수 교환을 사용할 수 없습니다.' };
    if (!canRelease(s, p.id)) return { ok: false, message: '상대 구단이 해당 포지션의 선수 부족으로 판매를 거절했습니다.' };
    if (swap && !canRelease(s, swap.id)) return { ok: false, message: '우리 팀의 최소 인원(17명)과 포지션별 선수 수를 유지해야 합니다.' };
    if (!swap && roster(s).length >= 25) return { ok: false, message: '최대 등록 인원은 25명입니다. 먼저 선수를 매각하세요.' };
    const credit = swap ? Math.floor(value(swap) * .85) : 0, required = loan ? Math.ceil(askingPrice(s, id) * .2) : askingPrice(s, id);
    if (cash + credit < required) return { ok: false, counter: Math.max(0, required - credit), message: `${s.clubs[p.club]?.name || '선수 에이전트'}의 역제안: 현금 ${Math.max(0, required - credit)}억 원${swap ? ' + 교환 선수' : ''}.` };
    const demand = wageDemand(s,p), offered = salary === null ? wage(p) : Number(salary);
    if (!Number.isFinite(offered) || offered < demand.salary) return { ok:false, salaryCounter:demand.salary, message:`${demand.gap ? '더 높은 리그에서 뛰고 싶어 하는 선수입니다. 하부리그 이적 보상으로 ' : ''}최소 주급 ${demand.salary.toFixed(2)}억을 원합니다.` };
    if (swap) { const swapDemand = wageDemand(s,swap,p.club); if (wage(swap) < swapDemand.salary) return {ok:false,message:'교환 대상 선수가 하부리그 이적을 거절했습니다. 현금 영입으로 협상하세요.'}; }
    const from = p.club;
    if (swap) swap.club = from;
    p.salary = round(offered); p.club = 0; p.contract = Math.max(p.contract, s.season + 2); p.morale = 85;
    if (loan) p.loan = { owner: from, until: s.season + 1 };
    transact(s, -cash, loan ? '임대 영입' : '선수 영입');
    const text = `${p.name} ${loan ? '시즌 임대' : '영입'} · ${cash}억 원${swap ? ` + ${swap.name} 교환` : ''}`;
    s.transfers.unshift({ text, week: s.week, season: s.season });
    s.news.unshift({ title: '영입 오피셜', text, type: 'transfer', week: s.week });
    s.incoming = s.incoming.filter(o => o.player !== swap?.id);
    fixLineups(s);
    return { ok: true, message: `${p.name} 선수가 ${s.clubs[0].name}에 합류했습니다.` };
  }
  function makeOffer(s) {
    if (!windowOpen(s)) { s.incoming = []; return; }
    s.transferList ||= [];
    const available = roster(s).filter(p => canRelease(s, p.id));
    if (!available.length) return;
    const listed = available.filter(p => s.transferList.includes(p.id) || p.transferListed);
    const chosenPool = (listed.length && rng(s) < 0.75) ? listed : available;
    const p = chosenPool[Math.floor(rng(s) * chosenPool.length)], club = 1 + Math.floor(rng(s) * (s.clubs.length - 1));
    s.incoming = [{ id: `${s.season}-${s.week}`, player: p.id, club, cash: Math.ceil(value(p) * (.95 + rng(s) * .35)) }];
  }
  function acceptOffer(s, id) {
    if (s.pending) return { ok: false, message: '진행 중인 경기를 먼저 마쳐 주세요.' };
    const o = s.incoming.find(x => x.id === id);
    if (!o || !windowOpen(s) || player(s, o.player)?.club !== 0 || !canRelease(s, o.player)) return { ok: false, message: '이 제안을 수락할 수 없습니다. 최소 스쿼드 인원을 확인하세요.' };
    const p = player(s, o.player); p.club = o.club; p.transferListed = false; transact(s, o.cash, '선수 매각');
    const text = `${p.name} → ${s.clubs[o.club].name} · ${o.cash}억 원`;
    s.transfers.unshift({ text, season: s.season, week: s.week });
    s.news.unshift({ title: '선수 매각 완료', text, type: 'transfer', week: s.week });
    s.incoming = s.incoming.filter(x => x.id !== id);
    s.transferList = (s.transferList || []).filter(x => x !== p.id);
    fixLineups(s);
    return { ok: true, message: `${p.name} 매각 완료. ${o.cash}억 원이 입금되었습니다.` };
  }
  function toggleTransferList(s, id) {
    s.transferList ||= [];
    const p = player(s, id);
    if (!p || p.club !== 0) return { ok: false, message: '우리 팀 소속 선수만 이적 명단에 등록할 수 있습니다.' };
    if (p.loan) return { ok: false, message: '임대 선수는 이적 명단에 등록할 수 없습니다.' };
    p.transferListed = !p.transferListed;
    if (p.transferListed) {
      if (!s.transferList.includes(p.id)) s.transferList.push(p.id);
      return { ok: true, listed: true, message: `${p.name} 선수를 이적 명단에 등록했습니다. 타 구단의 영입 제안을 받습니다.` };
    } else {
      s.transferList = s.transferList.filter(x => x !== p.id);
      return { ok: true, listed: false, message: `${p.name} 선수를 이적 명단에서 제외했습니다.` };
    }
  }
  function getTransferOffers(s, id) {
    const p = player(s, id);
    if (!p || p.club !== 0 || p.loan) return [];
    const val = value(p);
    const offers = [];
    const seedBase = (s.season * 1000 + s.week * 50 + p.id) >>> 0;
    for (let i = 0; i < 3; i++) {
      const cid = 1 + ((seedBase + i * 97) % (s.clubs.length - 1));
      if (!offers.some(c => c.club === cid)) {
        const factor = 0.9 + ((seedBase + i * 31) % 35) / 100;
        const offerCash = Math.max(1, Math.round(val * factor));
        offers.push({
          id: `offer-${p.id}-${cid}`,
          player: p.id,
          club: cid,
          cash: offerCash,
          clubName: s.clubs[cid].name,
          clubColor: s.clubs[cid].color,
          leagueName: s.leagues[s.clubs[cid].league]?.name || ''
        });
      }
    }
    return offers;
  }
  function sellPlayer(s, id, buyerClubId, cash) {
    if (s.pending) return { ok: false, message: '진행 중인 경기를 먼저 마쳐 주세요.' };
    if (!windowOpen(s)) return { ok: false, message: '현재 이적시장이 닫혀 있습니다. 1~5라운드 및 12~14라운드에 협상할 수 있습니다.' };
    const p = player(s, id);
    if (!p || p.club !== 0) return { ok: false, message: '우리 팀 소속 선수만 매각할 수 있습니다.' };
    if (p.loan) return { ok: false, message: '임대 선수는 판매할 수 없습니다.' };
    if (!canRelease(s, id)) return { ok: false, message: '최소 스쿼드 인원(17명 및 포지션별 필수 인원)을 유지해야 합니다.' };
    buyerClubId = Number(buyerClubId); cash = Number(cash);
    if (!s.clubs[buyerClubId] || buyerClubId === 0) return { ok: false, message: '매각 대상 구단이 올바르지 않습니다.' };
    if (!Number.isFinite(cash) || cash <= 0) return { ok: false, message: '이적료 금액을 확인해 주세요.' };

    p.club = buyerClubId;
    p.transferListed = false;
    transact(s, cash, '선수 매각');
    const text = `${p.name} → ${s.clubs[buyerClubId].name} · ${cash}억 원`;
    s.transfers.unshift({ text, season: s.season, week: s.week });
    s.news.unshift({ title: '선수 매각 완료', text, type: 'transfer', week: s.week });
    s.incoming = (s.incoming || []).filter(o => o.player !== id);
    s.transferList = (s.transferList || []).filter(x => x !== id);
    fixLineups(s);
    return { ok: true, message: `${p.name} 매각 완료. ${cash}억 원이 구단 예산에 입금되었습니다.` };
  }
  function negotiateSale(s, id, buyerClubId, asking) {
    if (s.pending) return { ok: false, message: '진행 중인 경기를 먼저 마쳐 주세요.' };
    if (!windowOpen(s)) return { ok: false, message: '현재 이적시장이 닫혀 있습니다.' };
    const p = player(s, id);
    if (!p || p.club !== 0) return { ok: false, message: '우리 팀 소속 선수만 매각할 수 있습니다.' };
    if (!canRelease(s, id)) return { ok: false, message: '최소 스쿼드 인원(17명 및 포지션별 필수 인원)을 유지해야 합니다.' };
    buyerClubId = Number(buyerClubId); asking = Number(asking);
    const buyer = s.clubs[buyerClubId];
    if (!buyer || buyerClubId === 0) return { ok: false, message: '상대 구단을 확인해 주세요.' };
    const val = value(p);
    const maxAcceptable = Math.ceil(val * 1.25);
    const counterOffer = Math.max(1, Math.round(val * 1.05));
    if (asking <= maxAcceptable) {
      return sellPlayer(s, id, buyerClubId, asking);
    } else if (asking <= Math.ceil(val * 1.6)) {
      return { ok: false, counter: counterOffer, message: `${buyer.name}의 역제안: ${asking}억 원은 너무 높습니다. ${counterOffer}억 원에 영입을 제안합니다.` };
    } else {
      return { ok: false, message: `${buyer.name}에서 요구 이적료가 너무 과도하여 협상을 거절했습니다.` };
    }
  }
  function contractTerminationPenalty(s, id) {
    const p = player(s, id);
    if (!p || p.club !== 0 || p.loan) return 0;
    const remainingYears = Math.max(1, p.contract - s.season);
    const w = wage(p);
    const discount = p.morale < 50 ? 0.5 : 1.0;
    const penalty = Math.round(remainingYears * w * 12 * discount * 10) / 10;
    return Math.max(0.1, penalty);
  }
  function terminateContract(s, id) {
    if (s.pending) return { ok: false, message: '진행 중인 경기를 먼저 마쳐 주세요.' };
    const p = player(s, id);
    if (!p || p.club !== 0) return { ok: false, message: '우리 팀 소속 선수만 계약을 해지할 수 있습니다.' };
    if (p.loan) return { ok: false, message: '임대 선수는 계약을 해지할 수 없습니다. 원 소속 구단으로 복귀해야 합니다.' };
    if (!canRelease(s, id)) return { ok: false, message: '최소 스쿼드 인원(17명 및 포지션별 필수 인원)을 유지해야 하므로 계약을 해지할 수 없습니다.' };
    const penalty = contractTerminationPenalty(s, id);
    if (s.budget < penalty) return { ok: false, message: `계약 해지 위약금(${penalty.toFixed(1)}억 원)을 지급할 구단 예산이 부족합니다. (현재 예산: ${s.budget.toFixed(1)}억 원)` };

    transact(s, -penalty, '계약 해지 위약금');
    p.club = -1;
    p.transferListed = false;
    p.contract = s.season + 1;
    const text = `${p.name} 계약 해지 (위약금 ${penalty.toFixed(1)}억 원 정산 후 FA 방출)`;
    s.transfers.unshift({ text, season: s.season, week: s.week });
    s.news.unshift({ title: '계약 해지 발표', text: `${p.name} 선수와 상호 합의 하에 계약을 해지했습니다.`, type: 'club', week: s.week });
    s.incoming = (s.incoming || []).filter(o => o.player !== id);
    s.transferList = (s.transferList || []).filter(x => x !== id);
    fixLineups(s);
    return { ok: true, penalty, message: `${p.name} 선수와의 계약을 해지했습니다. (위약금 ${penalty.toFixed(1)}억 원 정산 완료)` };
  }
  function strength(s, cid) {
    const c = s.clubs[cid], t = c.tactics, slots = FORMATIONS[t.formation];
    const ps = c.lineup.map(id => player(s, id));
    let attack = 0, defense = 0, control = 0;
    ps.forEach((p, i) => {
      const d = detail(p).attributes, instruction = cid === 0 ? s.instructions?.[i] : null;
      const personalEffort = instruction?.pressing === 'intense' ? 1.25 : instruction?.pressing === 'contain' ? .9 : 1;
      const fatigue = s.pending && [s.pending.half.h,s.pending.half.a].includes(cid) ? Math.max(0,(s.pending.minute || 0)-(s.pending.enteredAt?.[p.id]||0)) * (t.press + 1) * .055 * personalEffort * (1.5 - d.stamina / 100) : 0;
      const fit = (.65 + Math.max(30,p.fitness-fatigue) * .0035) * (.9 + p.morale * .0013), match = suitability(p, SLOTS[t.formation][i]);
      const role = cid === 0 ? s.roles[i] : 'balanced';
      const forward = instruction?.runs === 'forward', inverted = instruction?.movement === 'invert', direct = instruction?.passing === 'direct';
      const baseX=({GK:7,CB:25,LB:29,RB:29,DM:40,CM:50,AM:64,LW:70,RW:70,ST:80})[SLOTS[t.formation][i]];
      const advance=((instruction?.attackX ?? baseX)-baseX)/100, highLine=((instruction?.defendX ?? baseX)-baseX)/100;
      const takeOn=instruction?.dribbling==='takeOn', safe=instruction?.dribbling==='safe';
      const attackIntent=1+advance*.28+(takeOn?(d.dribbling-50)/450:0);
      const defenseIntent=1-advance*.12-highLine*.22+(instruction?.marking==='cover'?.06:instruction?.marking==='tight'?(d.marking-60)/500:0);
      const controlIntent=1+highLine*.12+(safe?.04:takeOn?-.05:0);
      attack += attackIntent * (p.atk*.25 + d.finishing*.25 + d.dribbling*.15 + d.acceleration*.2 + d.heading*.15) * fit * match * (slots[i] === 'FW' ? 1.6 : slots[i] === 'GK' ? .1 : .8) * (role === 'attack' ? 1.17 : role === 'defend' ? .88 : 1) * (forward ? 1.12 : instruction?.runs === 'hold' ? .92 : 1) * (direct ? 1.04 : 1) * (instruction?.movement === 'overlap' ? 1+d.crossing/1200 : instruction?.movement === 'channel' ? 1+d.positioning/1200 : 1);
      defense += defenseIntent * (p.def*.3 + (slots[i] === 'GK' ? d.reflexes*.4+d.handling*.3 : d.tackling*.25+d.marking*.2+d.positioning*.15+d.strength*.1)) * fit * match * (slots[i] === 'GK' ? 1.8 : slots[i] === 'DF' ? 1.3 : .6) * (role === 'defend' ? 1.15 : role === 'attack' ? .85 : 1) * (forward ? .9 : 1) * (inverted ? 1.04 : ['channel','roam'].includes(instruction?.movement) ? .96 : 1);
      control += controlIntent * (p.tech*.25+d.passing*.4+d.vision*.35) * fit * match * (slots[i] === 'MF' ? 1.5 : .65) * (inverted ? 1.15 : instruction?.movement === 'roam' ? 1+d.vision/1400 : 1) * (direct ? .93 : instruction?.passing === 'short' ? 1.06 : 1) * (instruction?.pressing === 'intense' ? 1.06 : instruction?.pressing === 'contain' ? .97 : 1);
    });
    const coach = cid === 0 ? 1 + (s.staff.coach - 2) * .012 : 1;
    const captain = cid === 0 && c.lineup.includes(s.captain) ? 1.015 : 1;
    return { attack: attack / 10 * (1 + t.mentality * .13 + (t.tempo - 1) * .05 + (t.width - 1) * .025 + t.focus * .012) * coach * captain, defense: defense / 10 * (1 - t.mentality * .1 - (t.press === 2 ? .025 : 0) - t.line * .03 - (t.width - 1) * .025) * coach * captain, control: control / 10 * (1 + t.press * .045 - (t.tempo - 1) * .06 - (t.passing - 1) * .055 + t.line * .035) * coach, fitness: Math.round(ps.reduce((a, p) => a + p.fitness, 0) / 11) };
  }
  // ponytail: tactical 2D positions and minute-level probability; no collision/ball physics solver.
  function poisson(s, mean) {
    let p = 1, n = 0;
    do { n++; p *= rng(s); } while (p > Math.exp(-mean) && n < 100);
    return n - 1;
  }
  function weightedPlayer(s, ps, weight) {
    const weights=ps.map(p=>Math.max(.1,weight(p))), total=weights.reduce((a,b)=>a+b,0);
    let choice=rng(s)*total;
    return ps.find((_,i)=>(choice-=weights[i])<=0)||ps[ps.length-1];
  }
  function simulate(s, h, a, period = 1, offset = 0) {
    const hs=strength(s,h), as=strength(s,a), ht=s.clubs[h].tactics, at=s.clubs[a].tactics;
    const expectations=[clamp(1.25+(hs.attack-as.defense)*.039+.2+(at.line===1&&ht.passing===2?.22:0),.25,3.8),clamp(1.25+(as.attack-hs.defense)*.039+(ht.line===1&&at.passing===2?.22:0),.25,3.8)];
    const events=[], shots=[0,0], onTarget=[0,0], goals=[0,0], xg=[0,0], playerStats={};
    const instruction=p=>p.club===0?s.instructions?.[s.clubs[0].lineup.indexOf(p.id)]:null;
    for(const cid of [h,a])for(const id of s.clubs[cid].lineup)playerStats[id]={minutes:Math.round(90*period),starts:offset===0?1:0,goals:0,assists:0,shots:0,onTarget:0};
    let lastAction;
    [h,a].forEach((cid,side)=>{
      const pool=s.clubs[cid].lineup.map(id=>player(s,id)).filter(p=>p.pos!=='GK');
      const location=p=>tacticalPosition(s,cid,s.clubs[cid].lineup.indexOf(p.id),'attack');
      const defenders=s.clubs[cid===h?a:h].lineup.slice(1).map((id,i)=>({p:player(s,id),pos:tacticalPosition(s,cid===h?a:h,i+1,'defend')}));
      const volume=pool.reduce((n,p)=>n+(instruction(p)?.shooting==='often'?1.25:instruction(p)?.shooting==='patient'?.8:1),0)/pool.length;
      shots[side]=poisson(s,expectations[side]/.16*period*volume);
      for(let i=0;i<shots[side];i++){
        const scorer=weightedPlayer(s,pool,p=>(p.pos==='FW'?5:p.pos==='MF'?2:1)*(detail(p).attributes.finishing/60)*(.5+location(p).x/100)*(s.clubs[cid].tactics.focus===1&&Math.abs(location(p).y-50)>25?1.3:s.clubs[cid].tactics.focus===2&&Math.abs(location(p).y-50)<25?1.3:1)*(instruction(p)?.shooting==='often'?1.5:instruction(p)?.shooting==='patient'?.7:1));
        const ins=instruction(scorer), fin=detail(scorer).attributes.finishing, shotPosition=location(scorer);
        const pressure=defenders.reduce((n,d)=>n+Math.max(0,1-Math.hypot(shotPosition.x-(100-d.pos.x),shotPosition.y-(100-d.pos.y))/22)*detail(d.p).attributes.marking/100,0);
        const passer=weightedPlayer(s,pool.filter(p=>p!==scorer),p=>(detail(p).attributes.passing+detail(p).attributes.vision+(instruction(p)?.dribbling==='safe'?20:0))*(1-Math.min(.6,Math.hypot(location(p).x-shotPosition.x,location(p).y-shotPosition.y)/180)));
        const cross=Math.abs(location(passer).y-50)>22?instruction(passer)?.crossing:null;
        const chance=clamp(.16+clamp((.6-pressure)*.035,-.04,.03)+(fin-70)/600+(ins?.shooting==='patient'?.035:ins?.shooting==='often'?-.03:0)+(cross==='high'?(scorer.attributes.heading-65)/800:cross==='low'?(fin-65)/900:0),.05,.38);
        const target=rng(s)<.38+(fin-65)/400, goal=target&&rng(s)<chance/(.38+(fin-65)/400);
        const minute=offset+1+Math.floor(rng(s)*90*period);
        playerStats[scorer.id].shots++;playerStats[scorer.id].onTarget+=+target;onTarget[side]+=+target;xg[side]+=chance;
        const assisted=goal&&rng(s)<.78;
        if(goal){goals[side]++;playerStats[scorer.id].goals++;if(assisted)playerStats[passer.id].assists++;
          events.push({minute,club:cid,player:scorer.id,kind:'goal',name:scorer.name,assist:assisted?passer.id:null,assistName:assisted?passer.name:'',text:ins?.dribbling==='takeOn'?'돌파 후 마무리':cross==='high'?'높은 크로스에 이은 마무리':cross==='low'?'낮은 크로스를 받아 슈팅':ins?.shooting==='patient'?'박스 안 기회를 기다린 마무리':'패스 연결 후 슈팅'});
        }
        lastAction={club:cid,player:scorer.id,receiver:null,type:goal?'goal':'shot'};
      }
    });
    const possession=Math.round(clamp(50+(hs.control-as.control)*.7,28,72));
    if(!lastAction){const cid=rng(s)<possession/100?h:a, pool=s.clubs[cid].lineup.map(id=>player(s,id));
      const p=weightedPlayer(s,pool,p=>p.pos==='GK'?5:detail(p).attributes.passing);
      const receiver=weightedPlayer(s,pool.filter(q=>q!==p),q=>q.pos==='GK'?5:detail(q).attributes.positioning);
      lastAction={club:cid,player:p.id,receiver:receiver.id,type:instruction(p)?.dribbling==='takeOn'?'carry':'pass'};
    }
    events.sort((x,y)=>x.minute-y.minute);
    return {h,a,hg:goals[0],ag:goals[1],events,homeXg:round(xg[0]),awayXg:round(xg[1]),possession,shots,onTarget,playerStats,lastAction,week:s.week,season:s.season};
  }
  function applyMatch(s, m) {
    for(const [id,record] of Object.entries(m.playerStats||{})) {
      const p=player(s,id); if(!p||!record.minutes)continue;
      const stats=p.leagueStats ||= emptyLeagueStats(); stats.matches++;
      for(const key of ['starts','minutes','goals','assists','shots','onTarget'])stats[key]+=record[key]||0;
      if((p.club===m.h?m.ag:m.hg)===0&&record.minutes>=60)stats.cleanSheets++;
    }
    m.events.filter(e => e.kind === 'goal').forEach(e => { player(s, e.player).goals++; });
    [[m.h, m.hg, m.ag], [m.a, m.ag, m.hg]].forEach(([cid, gf, ga]) => {
      const c = s.clubs[cid], won = gf > ga, draw = gf === ga;
      c.played++; c.gf += gf; c.ga += ga; c.pts += won ? 3 : draw ? 1 : 0;
      c.wins += +won; c.draws += +draw; c.losses += +(!won && !draw);
      c.form.push(won ? 'W' : draw ? 'D' : 'L'); c.form = c.form.slice(-5);
      const participants = m.playerStats ? Object.keys(m.playerStats).filter(id=>m.playerStats[id].minutes>0).map(Number) : cid === 0 && s.pending ? [...new Set([...s.pending.startLineup, ...c.lineup])] : c.lineup;
      roster(s, cid).forEach(p => {
        const played = participants.includes(p.id);
        p.injury = Math.max(0, p.injury - 1); p.banned = Math.max(0, p.banned - 1);
        p.fitness = clamp(p.fitness + (played ? 10 - (12 + c.tactics.press * 4 + c.tactics.tempo * 2 + Math.floor(rng(s) * 4)) : 15), 35, 100);
        p.morale = clamp(p.morale + (won ? 3 : draw ? 0 : -3) + (p.promised === 'key' && !played ? -5 : played ? 1 : 0), 20, 100);
        if (played) {
          p.appearances++;
          if (rng(s) < .09) { p.yellows++; if (p.yellows % 3 === 0) p.banned = 1; }
          if (rng(s) < .012 + (p.fitness < 65 ? .035 : 0)) {
            p.injury = Math.max(1, 2 + Math.floor(rng(s) * 4) - (cid === 0 ? Math.floor(s.staff.medic / 2) : 1));
            if (cid === 0) s.news.unshift({ title: '의무팀 보고', text: `${p.name} 부상 · ${p.injury}주 결장 예상`, type: 'club', week: s.week });
          }
        }
      });
    });
  }
  function startMatch(s) {
    if (s.pending) return s.pending.half;
    if (s.week >= s.totalWeeks) return null;
    fixLineups(s);
    const fixture = nextFixture(s);
    if (!fixture) return null;
    const [h, a] = fixture;
    s.pending = { minute:0, enteredAt:{}, half: { h,a,hg:0,ag:0,events:[],homeXg:0,awayXg:0,possession:50,shots:[0,0],onTarget:[0,0],playerStats:{},week:s.week,season:s.season }, startLineup: s.clubs[0].lineup.slice(), removed: [], substitutions: 0 };
    return s.pending.half;
  }
  function advanceMinute(s) {
    if (!s.pending || s.pending.minute >= 90) return null;
    s.pending.minute ??= 45;
    const m = s.pending.half, elapsed = s.pending.minute;
    const part = simulate(s,m.h,m.a,1/90,elapsed);
    m.hg += part.hg; m.ag += part.ag; m.events.push(...part.events);
    m.homeXg += part.homeXg; m.awayXg += part.awayXg;
    m.onTarget ||= [0,0]; m.playerStats ||= {};
    for(let i=0;i<2;i++){m.shots[i]+=part.shots[i];m.onTarget[i]+=part.onTarget[i];}
    for(const [id,stats] of Object.entries(part.playerStats)) {
      m.playerStats[id] ||= {minutes:0,starts:0,goals:0,assists:0,shots:0,onTarget:0};
      for(const key of Object.keys(stats))m.playerStats[id][key]+=stats[key];
    }
    m.lastAction=part.lastAction;
    m.possession = Math.round((m.possession*elapsed+part.possession)/(elapsed+1));
    s.pending.minute++;
    if (s.pending.minute===90) { m.homeXg=round(m.homeXg); m.awayXg=round(m.awayXg); }
    return m;
  }
  function setInstruction(s, slot, field, value) {
    if (!Number.isInteger(Number(slot)) || slot < 0 || slot > 10 || !Object.hasOwn(INSTRUCTIONS,field) || !Object.hasOwn(INSTRUCTIONS[field],value)) return false;
    if (!s.instructions) upgradeSave(s);
    s.instructions[slot][field] = value; return true;
  }
  function tacticalPosition(s, cid, slot, phase='attack') {
    const slots=SLOTS[s.clubs[cid].tactics.formation], pos=slots[slot];
    const n=slots.slice(0,slot).filter(x=>x===pos).length, count=slots.filter(x=>x===pos).length;
    let x=({GK:7,CB:25,LB:29,RB:29,DM:40,CM:50,AM:64,LW:70,RW:70,ST:80})[pos];
    let y=['LB','LW'].includes(pos)?15:['RB','RW'].includes(pos)?85:50+(n-(count-1)/2)*20;
    const ins=cid===0?s.instructions?.[slot]:null;
    if(phase==='attack') {
      if(ins?.movement==='invert'){y=50+(y-50)*.3;x+=9;}
      if(ins?.movement==='overlap'){y=y<50?7:93;x+=12;}
      if(ins?.movement==='channel'){y=y<50?32:68;x+=10;}
      x+=ins?.runs==='forward'?12:ins?.runs==='hold'?-6:0;
    } else {x-=pos==='GK'?0:10; if(ins?.marking==='cover')x-=6;}
    y=50+(y-50)*(1+(s.clubs[cid].tactics.width-1)*.2);
    x+=s.clubs[cid].tactics.line*3;
    return {x:clamp(ins?.[phase+'X']??x,5,95),y:clamp(ins?.[phase+'Y']??y,5,95)};
  }
  function matchPositions(s, clock = s.pending?.minute || 0) {
    if (!s.pending) return [];
    const home=s.pending.half.h, possession=s.pending.half.lastAction?.club??home;
    return [home,s.pending.half.a].flatMap(cid => s.clubs[cid].lineup.map((id,i)=>{
      const phase=cid===possession?'attack':'defend', position=tacticalPosition(s,cid,i,phase);
      const activity=i===0?1:3, x=clamp(position.x+Math.sin(clock*.7+i)*activity,4,96),y=clamp(position.y+Math.sin(clock*1.2+i)*activity,5,95);
      return {id,cid,slot:i,x:cid===home?x:100-x,y:cid===home?y:100-y};
    }));
  }
  function substitute(s, out, incoming) {
    if (!s.pending || s.pending.substitutions >= 5) return { ok: false, message: '교체는 최대 5명까지 가능합니다.' };
    const p = player(s, incoming), slot = s.clubs[0].lineup.indexOf(Number(out));
    if (slot < 0 || !p || p.club !== 0 || !available(p) || s.clubs[0].lineup.includes(p.id) || s.pending.removed.includes(p.id)) return { ok: false, message: '교체 선수를 확인하세요. 교체된 선수는 재투입할 수 없습니다.' };
    s.pending.enteredAt ||= {}; s.pending.enteredAt[p.id]=s.pending.minute??45;
    s.clubs[0].lineup[slot] = p.id; s.pending.removed.push(Number(out)); s.pending.substitutions++;
    return { ok: true, message: `${player(s, out).name} OUT → ${p.name} IN` };
  }
  function transact(s, amount, label) {
    s.budget = round(s.budget + amount);
    s.ledger.unshift({ amount: round(amount), label, season: s.season, week: s.week });
    s.ledger = s.ledger.slice(0, 150);
  }
  function train(s) {
    const focus = { attacking: 'atk', defending: 'def', technique: 'tech', fitness: 'pace' }[s.training];
    roster(s).forEach(p => {
      if (p.injury) return;
      if (s.training === 'rest') { p.fitness = clamp(p.fitness + 10, 0, 100); p.morale = clamp(p.morale + 2, 0, 100); return; }
      p.fitness = clamp(p.fitness - s.intensity * 2 + (s.training === 'fitness' ? 4 : 0), 35, 100);
      const chance = .04 + s.staff.coach * .012 + s.facilities.training * .015 + s.intensity * .025;
      if (ovr(p) < p.potential && rng(s) < chance) { const stat = focus || ['atk', 'def', 'tech', 'pace'][Math.floor(rng(s) * 4)]; p[stat] = clamp(p[stat] + 1, 40, 95); }
      if (s.intensity === 2 && rng(s) < .012) p.injury = 1;
    });
  }
  function aiTransfers(s) {
    if (!windowOpen(s)) return;
    for (let i = 0; i < 3; i++) {
      const buyer = 1 + Math.floor(rng(s) * (s.clubs.length - 1)), seller = 1 + Math.floor(rng(s) * (s.clubs.length - 1));
      if (buyer === seller || roster(s, buyer).length >= 25) continue;
      const candidates = roster(s, seller).filter(p => canRelease(s, p.id) && !s.clubs[seller].lineup.includes(p.id));
      const p = candidates[Math.floor(rng(s) * candidates.length)];
      if (p) { p.salary = wageDemand(s,p,buyer).salary; p.club = buyer; s.transfers.unshift({ text: `[세계 이적] ${p.name}: ${s.clubs[seller].name} → ${s.clubs[buyer].name} · ${value(p)}억`, season: s.season, week: s.week }); }
    }
  }
  function playWeek(s) {
    if (s.week >= s.totalWeeks) return null;
    if (s.pending) { s.pending.minute ??= 45; while (s.pending.minute < 90) advanceMinute(s); }
    if (!s.pending) fixLineups(s);
    const results = s.fixtures[s.week].map(([h, a]) => {
      if (s.pending && (h === 0 || a === 0)) {
        return s.pending.half;
      }
      return simulate(s, h, a);
    });
    results.forEach(m => applyMatch(s, m));
    // Clubs without a league fixture still recover during the calendar week.
    const playedClubs = new Set(results.flatMap(m => [m.h, m.a]));
    s.players.filter(p => p.club >= 0 && !playedClubs.has(p.club)).forEach(p => {
      p.injury = Math.max(0, p.injury - 1);
      p.fitness = clamp(p.fitness + 15, 35, 100);
    });
    s.pending = null;
    const mine = results.find(m => m.h === 0 || m.a === 0);
    const featured = mine || { h: 0, a: 0, hg: 0, ag: 0, homeXg: 0, awayXg: 0, possession: 50, shots: [0, 0], events: [], week: s.week, season: s.season, rest: true };
    const revenue = mine ? (mine.h === 0 ? 6.5 : 3.5) : 1.2, salary = payroll(s) + Object.values(s.staff).reduce((a, b) => a + b * .05, 0), net = round(revenue - salary);
    transact(s, revenue, mine ? (mine.h === 0 ? '홈 경기 수입 + 스폰서' : '방송권 + 스폰서') : '휴식 주간 수입'); transact(s, -salary, '선수 및 스태프 주급');
    results.forEach(m => { if (m.h !== 0 && m.a !== 0) { m.events = []; delete m.playerStats; delete m.lastAction; } });
    s.results.push(...results); s.lastMatch = featured; s.week++;
    processCups(s);
    train(s);
    s.scouting.forEach(r => { r.remaining = Math.max(0, r.remaining - 1); });
    const rank = standings(s).findIndex(c => c.id === 0) + 1;
    s.confidence = clamp(s.confidence + (rank <= s.target ? 2 : -2) - (s.budget < 0 ? 4 : 0), 0, 100);
    s.news.unshift(mine ? { title: `${s.week}라운드 경기 종료`, text: `${s.clubs[mine.h].name} ${mine.hg} : ${mine.ag} ${s.clubs[mine.a].name} · 주간 수지 ${net >= 0 ? '+' : ''}${net}억`, type: 'match', week: s.week } : { title: `${s.week}라운드 휴식 주간`, text: `${s.clubs[0].name}은 이번 주 리그 경기가 없습니다. 회복과 컵 준비에 집중했습니다 · 주간 수지 ${net >= 0 ? '+' : ''}${net}억`, type: 'club', week: s.week });
    if (s.week === s.totalWeeks) {
      const prize = 15 + Math.max(0, s.leagues[0].teams.length - rank) * 5;
      transact(s, prize, '리그 순위 상금');
      s.news.unshift({ title: `${s.season} 시즌 ${rank}위로 마무리`, text: `시즌 상금 ${prize}억 원이 지급되었습니다. 새 시즌에 다시 도전하세요.`, type: 'club', week: s.week });
    }
    aiTransfers(s); fixLineups(s); makeOffer(s); s.news = s.news.slice(0, 30);
    return featured;
  }
  function nextSeason(s) {
    if (s.week !== s.totalWeeks || s.pending) return false;
    const qualification = europeanOrder(s);
    const grant = Math.round((s.confidence >= 60 ? 60 : 25) / s.leagues[0].tier);
    resolvePromotions(s);
    const finishedSeason = s.season;
    s.season++; s.week = 0; transact(s, grant, '새 시즌 구단 지원금'); s.results = []; s.lastMatch = null;
    s.players.forEach(p => { if (p.loan) { p.club = p.loan.owner; p.loan = null; } });
    s.clubs.forEach(c => { Object.assign(c, { pts: 0, gf: 0, ga: 0, played: 0, wins: 0, draws: 0, losses: 0, form: [] }); });
    s.players.forEach(p => {
      p.history ||= [];
      if (p.appearances > 0 || (p.leagueStats && p.leagueStats.matches > 0) || p.goals > 0) {
        p.history.push({
          season: finishedSeason,
          club: p.club,
          clubName: s.clubs[p.club]?.name || '자유 계약',
          appearances: p.appearances,
          starts: p.leagueStats?.starts || 0,
          subIn: Math.max(0, p.appearances - (p.leagueStats?.starts || 0)),
          goals: p.goals,
          cupGoals: p.cupGoals || 0,
          assists: p.leagueStats?.assists || 0,
          minutes: p.leagueStats?.minutes || 0,
          shots: p.leagueStats?.shots || 0,
          onTarget: p.leagueStats?.onTarget || 0,
          cleanSheets: p.leagueStats?.cleanSheets || 0
        });
      }
      p.leagueStats=emptyLeagueStats(); p.cupGoals=0;
      p.age++; p.goals = 0; p.appearances = 0; p.fitness = 100; p.injury = 0; p.banned = 0; p.yellows = 0;
      const change = p.age <= 24 && ovr(p) < p.potential ? 1 : p.age >= 32 ? -1 : 0;
      for (const stat of ['atk', 'def', 'tech', 'pace']) p[stat] = clamp(p[stat] + change, 40, 95);
      if (p.contract <= s.season) {
        if (p.club === 0) { p.club = -1; s.news.unshift({ title: '계약 만료', text: `${p.name} 선수가 자유 계약으로 떠났습니다. 유소년 보충 선수가 합류합니다.`, type: 'transfer', week: 0 }); }
        else p.contract = s.season + 2;
      }
    });
    for (const pos of ['GK', 'DF', 'MF', 'FW']) {
      const min = pos === 'GK' ? 2 : pos === 'DF' || pos === 'MF' ? 6 : 4;
      while (roster(s).filter(p => p.pos === pos).length < min) { const p = youngPlayer(s, pos); p.club = 0; s.players.push(p); }
    }
    s.news.unshift({ title: `${s.season} 시즌 개막`, text: `이적시장 재개장 · 지원금 ${grant}억 원 · 성장, 노화, 계약 만료, 임대 복귀 반영`, type: 'club', week: 0 });
    youthIntake(s); s.fixtures = schedule(s.clubs, s.leagues); s.totalWeeks = s.fixtures.length; initCompetitions(s, qualification);
    fixLineups(s); makeOffer(s); return true;
  }
  function shuffle(s, xs) {
    const a = xs.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng(s) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function autoWeek(s) {
    if (s.pending || s.week >= s.totalWeeks) return null;
    s.clubs[0].lineup = autoLineup(s);
    const rotation = s.cupPlan.rotation;
    s.cupPlan.rotation = true;
    try { startMatch(s); return playWeek(s); } finally { s.cupPlan.rotation = rotation; }
  }
  function filterPlayers(s, filters = {}) {
    const {position='ALL',foot='ALL',sort='ovr',stat='passing',minStat=0,maxPrice=Infinity,minOvr=0,minAge=0,maxAge=99,maxWage=Infinity,maxContract=99,minFitness=0,status='ALL',stat2='vision',minStat2=0}=filters;
    const score=p=>sort.startsWith('price')?askingPrice(s,p.id):sort==='stat'?detail(p).attributes[stat]||0:sort==='age'?p.age:sort==='wage'?wage(p):sort==='goals'?p.goals:sort==='assists'?p.leagueStats?.assists||0:sort==='fitness'?p.fitness:ovr(p);
    return s.players.filter(p=>p.club!==0&&(position==='ALL'||detail(p).position===position||p.pos===position)&&(foot==='ALL'||detail(p).foot===foot)&&askingPrice(s,p.id)<=maxPrice&&ovr(p)>=minOvr&&(detail(p).attributes[stat]||0)>=minStat&&(detail(p).attributes[stat2]||0)>=minStat2&&p.age>=minAge&&p.age<=maxAge&&wage(p)<=maxWage&&p.contract-s.season<=maxContract&&p.fitness>=minFitness&&(status==='ALL'||status==='fit'&&available(p)||status==='free'&&p.club===-1||status==='transferable'&&canRelease(s,p.id)))
      .sort((a,b)=>(score(a)-score(b))*(['priceAsc','age','wage'].includes(sort)?1:-1)||a.id-b.id);
  }
  function cupPairs(s, ids) {
    const entries = shuffle(s, ids), size = 2 ** Math.ceil(Math.log2(ids.length));
    while (entries.length < size) entries.push(null);
    return Array.from({ length: size / 2 }, (_, i) => [entries[i], entries[size - 1 - i]]);
  }
  function europeanOrder(s) {
    return s.leagues.flatMap((l, li) => l.european && l.tier === 1 ? standings(s, li).map((c, i) => ({ id: c.id, score: (i + 1) * 10 - (l.pyramid === 3 ? 18 : 0) })) : []).sort((a, b) => a.score - b.score || a.id - b.id).map(x => x.id);
  }
  function asianOrder(s) {
    return s.leagues.flatMap((l, li) => l.asian && l.tier === 1 ? standings(s, li).map((c, i) => ({ id: c.id, score: (i + 1) * 10 - (['KR', 'JP', 'SA'].includes(l.flag) ? 14 : ['CN', 'AE', 'QA', 'IR'].includes(l.flag) ? 7 : 0) })) : []).sort((a, b) => a.score - b.score || a.id - b.id).map(x => x.id);
  }
  function worldClubOrder(s) {
    const euro = europeanOrder(s).slice(0, 14);
    const brLeague = s.leagues.findIndex(l => l.flag === 'BR' && l.tier === 1);
    const southAmerica = brLeague >= 0 ? standings(s, brLeague).slice(0, 6).map(c => c.id) : [];
    const asia = asianOrder(s).slice(0, 12);
    return [...euro, ...southAmerica, ...asia];
  }
  function initCompetitions(s, qualified = europeanOrder(s)) {
    s.cupPlan ||= { rotation: false, approach: 'same' };
    s.cupResults = [];
    const prevHonors = s.honors || [];

    // 1-1. 국내 FA 컵 (23개국)
    s.competitions = [...new Set(s.leagues.map(l => l.country))].map((country, i) => {
      const league = s.leagues.find(l => l.country === country), participants = s.clubs.filter(c => s.leagues[c.league].country === country).map(c => c.id);
      const rounds = Math.ceil(Math.log2(Math.max(2, participants.length))), weeks = Array.from({ length: rounds }, (_, i) => Math.min(3 + i * 4, Math.max(3, s.totalWeeks - 1)));
      return { id: `cup-${i}`, name: `${league.nation} FA 컵`, kind: 'domestic', phase: 'knockout', country, participants, weeks, round: 0, nextWeek: weeks[0], next: cupPairs(s, participants), results: [], winner: null, groups: [] };
    });

    // 1-2. 각 리그 전용 토너먼트 컵 (23개국 1부 리그 구단 전용)
    const tier1Leagues = s.leagues.filter(l => l.tier === 1);
    tier1Leagues.forEach((l, i) => {
      const li = s.leagues.indexOf(l);
      const participants = s.clubs.filter(c => c.league === li).map(c => c.id);
      const rounds = Math.ceil(Math.log2(Math.max(2, participants.length)));
      const weeks = Array.from({ length: rounds }, (_, k) => Math.min(2 + k * 4, Math.max(2, s.totalWeeks - 1)));
      s.competitions.push({
        id: `league-cup-${i}`,
        name: `${l.name} 리그 컵`,
        kind: 'league-cup',
        phase: 'knockout',
        country: l.country,
        participants,
        weeks,
        round: 0,
        nextWeek: weeks[0],
        next: cupPairs(s, participants),
        results: [],
        winner: null,
        groups: []
      });
    });

    const pattern = [[[0, 3], [1, 2]], [[0, 2], [3, 1]], [[0, 1], [2, 3]]];

    // 2. 유럽 대항전 (2개: 유럽 챔피언스 컵, 유로파 컵)
    for (let k = 0; k < 2; k++) {
      const participants = qualified.slice(k * 32, k * 32 + 32);
      const groups = Array.from({ length: 8 }, (_, i) => participants.filter((_, j) => j % 8 === i).map(id => ({ id, pts: 0, gf: 0, ga: 0, played: 0 })));
      const groupRounds = [...pattern, ...pattern.map(p => p.map(([h, a]) => [a, h]))].map(p => groups.flatMap(g => p.map(([h, a]) => [g[h].id, g[a].id])));
      s.competitions.unshift({ id: k === 0 ? 'champions' : 'europa', name: k === 0 ? '유럽 챔피언스 컵' : '유로파 컵', kind: 'europe', phase: 'groups', country: 'EUROPE', participants, groups, groupRounds, weeks: [1, 3, 5, 7, 9, 11, 13, 16, 19, 22], round: 0, nextWeek: 1, next: groupRounds[0], results: [], winner: null });
    }

    // 3. 아시아 대항전 (1개: AFC 챔피언스 리그, 32팀)
    const asianQualified = asianOrder(s);
    const asianParticipants = asianQualified.slice(0, 32);
    const asianGroups = Array.from({ length: 8 }, (_, i) => asianParticipants.filter((_, j) => j % 8 === i).map(id => ({ id, pts: 0, gf: 0, ga: 0, played: 0 })));
    const asianGroupRounds = [...pattern, ...pattern.map(p => p.map(([h, a]) => [a, h]))].map(p => asianGroups.flatMap(g => p.map(([h, a]) => [g[h].id, g[a].id])));
    s.competitions.push({ id: 'afc-champions', name: 'AFC 챔피언스 리그', kind: 'asia', phase: 'groups', country: 'ASIA', participants: asianParticipants, groups: asianGroups, groupRounds: asianGroupRounds, weeks: [1, 3, 5, 7, 9, 11, 13, 16, 19, 22], round: 0, nextWeek: 1, next: asianGroupRounds[0], results: [], winner: null });

    // 4. FIFA 클럽 월드컵 (1개: 4년 주기 대규모 32강 세계 대항전)
    const isWorldCupYear = (s.season - 2026) % 4 === 0;
    if (isWorldCupYear) {
      const worldParticipants = worldClubOrder(s).slice(0, 32);
      const worldGroups = Array.from({ length: 8 }, (_, i) => worldParticipants.filter((_, j) => j % 8 === i).map(id => ({ id, pts: 0, gf: 0, ga: 0, played: 0 })));
      const worldGroupRounds = [...pattern, ...pattern.map(p => p.map(([h, a]) => [a, h]))].map(p => worldGroups.flatMap(g => p.map(([h, a]) => [g[h].id, g[a].id])));
      s.competitions.push({ id: 'club-world-cup', name: 'FIFA 클럽 월드컵', kind: 'world', phase: 'groups', country: 'WORLD', participants: worldParticipants, groups: worldGroups, groupRounds: worldGroupRounds, weeks: [2, 4, 6, 8, 10, 12, 15, 17, 20, 23], round: 0, nextWeek: 2, next: worldGroupRounds[0], results: [], winner: null });
    } else {
      const lastWorldWinner = prevHonors.find(h => h.competition === 'FIFA 클럽 월드컵')?.winner ?? null;
      s.competitions.push({ id: 'club-world-cup', name: 'FIFA 클럽 월드컵', kind: 'world', phase: 'inactive', country: 'WORLD', participants: [], groups: [], groupRounds: [], weeks: [], round: 0, nextWeek: null, next: [], results: [], winner: lastWorldWinner });
    }

    const order = { 'club-world-cup': 0, 'champions': 1, 'afc-champions': 2, 'europa': 3 };
    s.competitions.sort((a, b) => (order[a.id] ?? 99) - (order[b.id] ?? 99));
  }
  const groupTable = group => group.slice().sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.id - b.id);
  function cupMatchPrize(cup, roundLabel, won, draw) {
    if (!won && !draw) return 0;
    const isCWC = cup.id === 'club-world-cup';
    const isUCL = cup.id === 'champions';
    const isUEL = cup.id === 'europa';
    const isACL = cup.id === 'afc-champions';
    const isLeagueCup = cup.kind === 'league-cup';
    if (cup.phase === 'groups') {
      if (draw) return isCWC ? 15 : isUCL ? 10 : isUEL ? 3.5 : isACL ? 1 : 0;
      return isCWC ? 40 : isUCL ? 30 : isUEL ? 10 : isACL ? 3 : 0;
    }
    if (!won || roundLabel === '결승') return 0;
    if (roundLabel === '준결승') return isCWC ? 250 : isUCL ? 200 : isUEL ? 80 : isACL ? 15 : isLeagueCup ? 15 : 12;
    if (roundLabel === '8강') return isCWC ? 200 : isUCL ? 160 : isUEL ? 60 : isACL ? 10 : isLeagueCup ? 8 : 6;
    if (roundLabel === '16강') return isCWC ? 150 : isUCL ? 120 : isUEL ? 40 : isACL ? 6 : isLeagueCup ? 4 : 3;
    return isLeagueCup ? 2 : 1.5;
  }
  function processCups(s) {
    for (const cup of s.competitions.filter(c => c.nextWeek === s.week && c.winner === null)) {
      const winners = [], roundLabel = cup.phase === 'groups' ? `조별리그 ${cup.round + 1}차전` : cup.next.length === 1 ? '결승' : cup.next.length === 2 ? '준결승' : `${cup.next.length * 2}강`;
      for (const [h, a] of cup.next) {
        if (h === null || a === null) { winners.push(h ?? a); continue; }
        const ownGame = h === 0 || a === 0, savedLineup = s.clubs[0].lineup.slice(), savedTactics = { ...s.clubs[0].tactics };
        for (const cid of [h, a]) {
          const club = s.clubs[cid];
          if (cid !== 0 || club.lineup.some(id => !available(player(s, id)))) club.lineup = autoLineup(s, cid);
        }
        if (ownGame) {
          const presets = { defensive: { mentality: -1, press: 0, tempo: 2, line: -1, passing: 2 }, attacking: { mentality: 1, press: 2, tempo: 2, line: 1 }, balanced: { mentality: 0, press: 1, tempo: 1 } };
          Object.assign(s.clubs[0].tactics, presets[s.cupPlan.approach] || {});
          if (s.cupPlan.rotation) {
            const pool = roster(s).filter(available);
            if (pool.length >= 11) s.clubs[0].lineup = FORMATIONS[s.clubs[0].tactics.formation].map(pos => {
              pool.sort((a, b) => (ovr(b) + b.fitness * .6 + (savedLineup.includes(b.id) ? 0 : 9) - (b.pos === pos ? 0 : 30)) - (ovr(a) + a.fitness * .6 + (savedLineup.includes(a.id) ? 0 : 9) - (a.pos === pos ? 0 : 30)));
              return pool.shift().id;
            });
          }
        }
        const m = simulate(s, h, a); m.week = s.week - 1; m.competition = cup.id; m.label = roundLabel;
        if (cup.phase === 'groups') {
          const table = cup.groups.find(g => g.some(row => row.id === h));
          [[h, m.hg, m.ag], [a, m.ag, m.hg]].forEach(([id, gf, ga]) => { const row = table.find(x => x.id === id); row.played++; row.gf += gf; row.ga += ga; row.pts += gf > ga ? 3 : gf === ga ? 1 : 0; });
        } else {
          let winner = m.hg > m.ag ? h : a;
          if (m.hg === m.ag) { winner = rng(s) > .5 ? h : a; m.penalties = winner === h ? [5, 4] : [4, 5]; }
          winners.push(winner); m.winner = winner;
        }
        m.events.forEach(e => { const p = player(s, e.player); p.cupGoals = (p.cupGoals || 0) + 1; });
        for (const cid of [h, a]) s.clubs[cid].lineup.forEach(id => { const p = player(s, id); p.fitness = clamp(p.fitness - 4 - s.clubs[cid].tactics.press, 35, 100); });
        if (h === 0 || a === 0) {
          const myGoals = h === 0 ? m.hg : m.ag, oppGoals = h === 0 ? m.ag : m.hg;
          const isGroup = cup.phase === 'groups';
          const won = isGroup ? (myGoals > oppGoals) : (m.winner === 0);
          const draw = isGroup && (myGoals === oppGoals);
          const matchPrize = cupMatchPrize(cup, roundLabel, won, draw);
          const matchIncome = (cup.kind === 'europe' || cup.kind === 'asia' || cup.kind === 'world') ? 4 : 2;
          transact(s, matchIncome, `${cup.name} 경기 수입`);
          let prizeNote = '';
          if (matchPrize > 0) {
            transact(s, matchPrize, `${cup.name} ${roundLabel} ${won ? '승리 상금' : '무승부 상금'}`);
            s.confidence = clamp(s.confidence + (won ? 2 : 1), 0, 100);
            prizeNote = ` · ${won ? '승리' : '무승부'} 상금 ${matchPrize}억 원 획득!`;
          }
          s.news.unshift({ title: `${cup.name} · ${roundLabel}${won ? ' 승리!' : draw ? ' 무승부' : ''}`, text: `${s.clubs[h].name} ${m.hg} : ${m.ag} ${s.clubs[a].name}${m.penalties ? ` (승부차기 ${m.penalties.join(':')})` : ''}${prizeNote}`, type: 'match', week: s.week });
        } else m.events = [];
        delete m.playerStats; delete m.lastAction;
        cup.results.push(m); s.cupResults.push(m);
        if (ownGame) { s.clubs[0].lineup = savedLineup; s.clubs[0].tactics = savedTactics; }
      }
      cup.round++;
      if (cup.phase === 'groups') {
        if (cup.round < 6) cup.next = cup.groupRounds[cup.round];
        else {
          cup.phase = 'knockout';
          const tops = cup.groups.map(groupTable);
          cup.next = tops.map((g, i) => [g[0].id, tops[(i + 1) % 8][1].id]);
        }
      } else if (winners.length === 1) {
        cup.winner = winners[0]; cup.phase = 'complete'; cup.next = []; cup.nextWeek = null;
        s.honors.unshift({ season: s.season, competition: cup.name, winner: cup.winner });
        if (cup.winner === 0) {
          const prize = cup.id === 'club-world-cup' ? 500 : cup.id === 'champions' ? 300 : cup.id === 'afc-champions' ? 140 : cup.id === 'europa' ? 150 : cup.kind === 'league-cup' ? 40 : 30;
          transact(s, prize, `${cup.name} 우승 상금`);
          s.confidence = clamp(s.confidence + 15, 0, 100);
        }
      } else cup.next = cupPairs(s, winners);
      if (cup.phase !== 'complete') cup.nextWeek = cup.weeks[cup.round];
    }
  }
  function resolvePromotions(s) {
    const movements = [];
    for (const country of [...new Set(s.leagues.filter(l => l.pyramid === 3).map(l => l.country))]) {
      for (let tier = 1; tier < 3; tier++) {
        const upper = s.leagues.findIndex(l => l.country === country && l.tier === tier), lower = s.leagues.findIndex(l => l.country === country && l.tier === tier + 1);
        movements.push(...standings(s, upper).slice(-2).map(c => ({ id: c.id, from: upper, to: lower, promoted: false })), ...standings(s, lower).slice(0, 2).map(c => ({ id: c.id, from: lower, to: upper, promoted: true })));
      }
    }
    s.promotionNews = movements.map(m => ({ club: m.id, from: s.leagues[m.from].name, to: s.leagues[m.to].name, promoted: m.promoted, season: s.season }));
    movements.forEach(m => {
      s.clubs[m.id].league = m.to;
      if (m.id === 0) { transact(s, m.promoted ? 20 : -5, m.promoted ? '승격 특별 지원금' : '강등 후원금 감소'); s.target = m.promoted ? 10 : 3; s.news.unshift({ title: m.promoted ? '새로운 무대로, 승격 확정!' : '다음 시즌 강등 확정', text: `${s.leagues[m.from].name} → ${s.leagues[m.to].name}`, type: 'club', week: s.totalWeeks }); }
    });
    const myLeague = s.clubs[0].league;
    if (myLeague !== 0) {
      [s.leagues[0], s.leagues[myLeague]] = [s.leagues[myLeague], s.leagues[0]];
      s.clubs.forEach(c => { if (c.league === 0) c.league = myLeague; else if (c.league === myLeague) c.league = 0; });
    }
  }
  function youngPlayer(s, pos, index = 0, existingNames = []) {
    const base = 51 + s.facilities.youth * 3 + Math.floor(rng(s) * 9);
    const id = Math.max(0, ...s.players.map(p => p.id), ...s.academy.map(p => p.id)) + 1 + index;
    const flag = LEAGUES[s.clubs[0].origin].flag;
    let name = randomName(s, flag);
    let attempts = 0;
    while ((existingNames.includes(name) || s.academy.some(p => p.name === name) || s.players.some(p => p.club === 0 && p.name === name)) && attempts < 25) {
      name = randomName(s, flag);
      attempts++;
    }
    return detail({ id, name, club: -2, pos, age: 16 + Math.floor(rng(s) * 3), atk: base + (pos === 'FW' ? 10 : 0), def: base + (pos === 'GK' || pos === 'DF' ? 10 : 0), tech: base + (pos === 'MF' ? 10 : 0), pace: base + 5, fitness: 100, morale: 85, injury: 0, banned: 0, yellows: 0, goals: 0, appearances: 0, potential: clamp(base + 14 + Math.floor(rng(s) * 15), 60, 95), contract: s.season + 3, salary: .08, promised: 'prospect', loan: null });
  }
  function youthIntake(s) {
    const fresh = [];
    const positions = ['GK', 'DF', 'MF', 'FW', 'MF'];
    for (let i = 0; i < positions.length; i++) {
      fresh.push(youngPlayer(s, positions[i], i, fresh.map(p => p.name)));
    }
    s.academy = fresh;
  }
  function promote(s, id) {
    const p = s.academy.find(x => x.id === Number(id));
    if (s.pending || !p || roster(s).length >= 25) return { ok: false, message: '경기 종료 후, 1군 등록 인원 25명 이내에서 승격할 수 있습니다.' };
    p.club = 0; s.players.push(p); s.academy = s.academy.filter(x => x.id !== p.id);
    return { ok: true, message: `${p.name} 선수가 1군에 합류했습니다.` };
  }
  function renew(s, id, years, salary, promised) {
    const p = player(s, id);
    if (s.pending || !p || p.club !== 0 || p.loan || ![1, 2, 3, 4].includes(years) || !Number.isFinite(salary) || salary < 0 || !['key', 'rotation', 'prospect'].includes(promised)) return { ok: false, message: '계약 조건을 확인하세요. 임대 선수는 재계약할 수 없습니다.' };
    const demand = round(Math.max(p.salary, ovr(p) * .002) * (promised === 'key' ? 1.05 : 1.2));
    if (salary < demand) return { ok: false, message: `선수의 요구 주급은 ${demand}억 원입니다.`, counter: demand };
    const bonus = round(salary * 3);
    if (s.budget < bonus) return { ok: false, message: `계약 보너스 ${bonus}억 원을 지급할 예산이 부족합니다.` };
    p.salary = round(salary); p.contract = Math.max(p.contract, s.season + years); p.promised = promised; p.morale = clamp(p.morale + 12, 0, 100);
    transact(s, -bonus, `${p.name} 재계약 보너스`);
    return { ok: true, message: `${p.name} · ${p.contract}년까지 재계약 · 주급 ${p.salary}억` };
  }
  function scout(s, id) {
    const p = player(s, id);
    if (s.pending || !p || p.club === 0 || s.scouting.some(r => r.player === p.id) || s.budget < .5) return { ok: false, message: '이미 조사 중이거나, 예산이 부족합니다. 진행 중인 경기도 확인하세요.' };
    transact(s, -.5, `${p.name} 스카우팅`);
    s.scouting.push({ player: p.id, remaining: s.staff.scout >= 4 ? 1 : 2 });
    return { ok: true, message: '스카우팅을 지시했습니다. 1~2경기 후 잠재력과 추천도를 확인하세요.' };
  }
  function upgrade(s, group, key) {
    if (!['staff', 'facilities'].includes(group) || !Object.hasOwn(s[group], key) || s[group][key] >= 5 || s.pending) return { ok: false, message: '현재는 업그레이드할 수 없습니다.' };
    const cost = (s[group][key] + 1) * (group === 'staff' ? 3 : 7);
    if (s.budget < cost) return { ok: false, message: '구단 예산이 부족합니다.' };
    transact(s, -cost, group === 'staff' ? '스태프 영입' : '시설 확충'); s[group][key]++;
    return { ok: true, message: `${cost}억 원 투자 완료. 레벨 ${s[group][key]}로 개선되었습니다.` };
  }
  function talk(s, id, kind) {
    const p = player(s, id);
    if (!p || p.club !== 0 || s.pending || p.talked === `${s.season}-${s.week}` || !['encourage', 'praise', 'challenge'].includes(kind)) return { ok: false, message: '면담은 선수당 매주 한 번, 경기 종료 후 진행할 수 있습니다.' };
    p.talked = `${s.season}-${s.week}`;
    const effect = kind === 'encourage' ? 3 : kind === 'praise' ? (p.morale >= 60 ? 7 : -3) : (p.morale >= 55 ? 4 : -6);
    p.morale = clamp(p.morale + effect, 20, 100);
    return { ok: true, message: `${p.name} 면담 완료 · 사기 ${effect > 0 ? '+' : ''}${effect}` };
  }
  function validSave(s) {
    try {
      const validInstructions=xs=>Array.isArray(xs)&&xs.length===11&&xs.every(ins=>ins&&Object.entries(INSTRUCTIONS).every(([k,values])=>ins[k]===undefined||Object.hasOwn(values,ins[k]))&&['attack','defend'].every(phase=>[ins[phase+'X'],ins[phase+'Y']].every(v=>v==null||Number.isFinite(v)&&v>=5&&v<=95)));
      if(s?.instructions!==undefined&&!validInstructions(s.instructions))return false;
      if(s?.tacticPlans!==undefined&&(!Array.isArray(s.tacticPlans)||s.tacticPlans.length!==3||!s.tacticPlans.every(p=>p===null||p&&typeof p.name==='string'&&p.name.length<=40&&FORMATIONS[p.tactics?.formation]&&['mentality','line'].every(k=>[-1,0,1].includes(p.tactics[k]))&&['press','tempo','width','passing','focus'].every(k=>[0,1,2].includes(p.tactics[k]))&&validInstructions(p.instructions)&&Array.isArray(p.roles)&&p.roles.length===11&&p.roles.every(r=>['attack','balanced','defend'].includes(r)))))return false;
      if(s?.players?.some(p=>p.leagueStats!==undefined&&(!p.leagueStats||!Object.keys(emptyLeagueStats()).every(k=>Number.isInteger(p.leagueStats[k])&&p.leagueStats[k]>=0))))return false;
      if (s?.pending?.minute !== undefined && (!Number.isInteger(s.pending.minute) || s.pending.minute<0 || s.pending.minute>90 || s.pending.half.events.some(e=>e.minute>s.pending.minute))) return false;
      if (s?.players?.some(p => (p.position !== undefined && !Object.hasOwn(POSITIONS,p.position)) || (p.foot !== undefined && !['left','right','both'].includes(p.foot)) || (p.ambition !== undefined && (!Number.isFinite(p.ambition)||p.ambition<0||p.ambition>100)) || (p.attributes !== undefined && !Object.keys(DETAILS).every(k=>Number.isFinite(p.attributes?.[k])&&p.attributes[k]>=1&&p.attributes[k]<=99)))) return false;
      if (!s || s.version !== 3 || !Number.isFinite(s.budget) || !Number.isInteger(s.seed) || !Number.isInteger(s.season) || !Number.isInteger(s.week) || s.week < 0 || !Number.isInteger(s.totalWeeks) || s.week > s.totalWeeks || s.totalWeeks !== schedule(s.clubs, s.leagues).length || s.clubs?.length !== CLUBS.length || s.leagues?.length !== LEAGUES.length || !Number.isFinite(s.confidence) || !Number.isFinite(s.target)) return false;
      if (!s.cupPlan || typeof s.cupPlan.rotation !== 'boolean' || !['same', 'balanced', 'defensive', 'attacking'].includes(s.cupPlan.approach)) return false;
      if (!['players', 'news', 'incoming', 'watch', 'results', 'transfers', 'fixtures', 'scouting', 'academy', 'ledger', 'roles', 'competitions', 'cupResults', 'honors', 'promotionNews'].every(k => Array.isArray(s[k])) || (s.transferList !== undefined && !Array.isArray(s.transferList)) || JSON.stringify(s.fixtures) !== JSON.stringify(schedule(s.clubs, s.leagues)) || s.roles.length !== 11 || !s.roles.every(r => ['attack', 'balanced', 'defend'].includes(r)) || !['balanced', 'attacking', 'defending', 'technique', 'fitness', 'rest'].includes(s.training) || ![0, 1, 2].includes(s.intensity)) return false;
      if (!['coach', 'scout', 'medic'].every(k => Number.isInteger(s.staff?.[k]) && s.staff[k] >= 1 && s.staff[k] <= 5) || !['training', 'youth'].every(k => Number.isInteger(s.facilities?.[k]) && s.facilities[k] >= 1 && s.facilities[k] <= 5)) return false;
      const validPlayer = (p, academy = false) => Number.isInteger(p.id) && typeof p.name === 'string' && p.name.length < 100 && Number.isInteger(p.club) && p.club >= (academy ? -2 : -1) && p.club < CLUBS.length && ['GK', 'DF', 'MF', 'FW'].includes(p.pos) && ['age', 'atk', 'def', 'tech', 'pace', 'fitness', 'morale', 'injury', 'banned', 'yellows', 'goals', 'appearances', 'potential', 'contract', 'salary'].every(k => Number.isFinite(p[k]) && p[k] >= 0) && (!p.loan || (Number.isInteger(p.loan.owner) && p.loan.owner >= 0 && p.loan.owner < CLUBS.length));
      if (s.players.length < CLUBS.length * 22 || s.players.length > 35000 || new Set(s.players.map(p => p.id)).size !== s.players.length || !s.players.every(p => validPlayer(p)) || !s.academy.every(p => validPlayer(p, true)) || new Set([...s.players, ...s.academy].map(p => p.id)).size !== s.players.length + s.academy.length) return false;
      if (!s.leagues.every(l => typeof l.name === 'string' && typeof l.country === 'string' && typeof l.flag === 'string') || !s.news.every(n => typeof n.title === 'string' && typeof n.text === 'string') || !s.transfers.every(t => typeof t.text === 'string') || !s.ledger.every(l => Number.isFinite(l.amount) && typeof l.label === 'string') || !s.scouting.every(r => player(s, r.player) && Number.isFinite(r.remaining))) return false;
      if (!s.incoming.every(o => player(s, o.player)?.club === 0 && Number.isInteger(o.club) && o.club > 0 && o.club < CLUBS.length && Number.isFinite(o.cash) && o.cash >= 0 && /^\d+-\d+$/.test(o.id))) return false;
      const validMatchStats=m=>m.playerStats===undefined||m.playerStats&&Object.entries(m.playerStats).every(([id,stats])=>player(s,id)&&stats&&['minutes','starts','goals','assists','shots','onTarget'].every(k=>Number.isInteger(stats[k])&&stats[k]>=0)&&stats.minutes<=90&&stats.starts<=1&&stats.goals<=stats.onTarget&&stats.onTarget<=stats.shots);
      if(s?.pending?.enteredAt!==undefined&&(!s.pending.enteredAt||!Object.entries(s.pending.enteredAt).every(([id,n])=>player(s,id)&&Number.isInteger(n)&&n>=0&&n<=90)))return false;
      const validMatch = m => m && validMatchStats(m) && [m.h, m.a].every(id => Number.isInteger(id) && id >= 0 && id < CLUBS.length) && ['hg', 'ag', 'homeXg', 'awayXg', 'possession', 'week', 'season'].every(k => Number.isFinite(m[k])) && Array.isArray(m.shots) && m.shots.length === 2 && m.shots.every(Number.isFinite) && Array.isArray(m.events) && m.events.every(e => player(s, e.player) && Number.isFinite(e.minute) && Number.isInteger(e.club) && e.club >= 0 && e.club < CLUBS.length && typeof e.name === 'string' && typeof e.text === 'string');
      if (!s.results.every(validMatch) || (s.lastMatch && !validMatch(s.lastMatch)) || (s.pending && (!validMatch(s.pending.half) || s.pending.half.week !== s.week || !Array.isArray(s.pending.startLineup) || !s.pending.startLineup.every(id => player(s, id)?.club === 0) || !Array.isArray(s.pending.removed) || !Number.isInteger(s.pending.substitutions) || s.pending.substitutions < 0 || s.pending.substitutions > 5))) return false;
      const validClubId = id => Number.isInteger(id) && id >= 0 && id < CLUBS.length;
      if (s.clubs[0].league !== 0 || !s.leagues.every((l, li) => [1, 2, 3].includes(l.tier) && typeof l.nation === 'string' && s.clubs.filter(c => c.league === li).length === l.teams.length) || !s.cupResults.every(validMatch)) return false;
      if (s.competitions.length !== 50 || !s.competitions.every(c => /^[a-z0-9-]+$/.test(c.id) && typeof c.name === 'string' && ['europe', 'domestic', 'asia', 'world', 'league-cup'].includes(c.kind) && ['groups', 'knockout', 'complete', 'inactive'].includes(c.phase) && Array.isArray(c.participants) && c.participants.every(validClubId) && Array.isArray(c.next) && c.next.every(p => Array.isArray(p) && p.length === 2 && p.every(id => id === null || validClubId(id))) && Array.isArray(c.weeks) && c.weeks.every(Number.isInteger) && Number.isInteger(c.round) && c.round >= 0 && (c.winner === null || validClubId(c.winner)) && Array.isArray(c.results) && c.results.every(validMatch) && Array.isArray(c.groups) && c.groups.every(g => Array.isArray(g) && g.every(r => validClubId(r.id) && ['pts', 'gf', 'ga', 'played'].every(k => Number.isFinite(r[k])))) && (!['europe', 'asia', 'world'].includes(c.kind) || c.phase === 'inactive' || (Array.isArray(c.groupRounds) && c.groupRounds.length === 6 && c.groupRounds.every(r => Array.isArray(r) && r.every(pair => pair.length === 2 && pair.every(validClubId))))))) return false;
      if (!s.honors.every(h => validClubId(h.winner) && typeof h.competition === 'string' && Number.isInteger(h.season)) || !s.promotionNews.every(n => validClubId(n.club) && typeof n.from === 'string' && typeof n.to === 'string')) return false;
      return s.clubs.every((c, i) => c.id === i && Number.isInteger(c.league) && c.league >= 0 && c.league < LEAGUES.length && typeof c.name === 'string' && typeof c.short === 'string' && /^#[a-f0-9]{6}$/i.test(c.color) && typeof c.stadium === 'string' && FORMATIONS[c.tactics?.formation] && ['mentality', 'line'].every(k => [-1, 0, 1].includes(c.tactics[k])) && ['press', 'tempo', 'width', 'passing', 'focus'].every(k => [0, 1, 2].includes(c.tactics[k])) && Array.isArray(c.lineup) && c.lineup.length === 11 && new Set(c.lineup).size === 11 && c.lineup.every(id => player(s, id)?.club === c.id) && Array.isArray(c.form) && c.form.every(x => ['W', 'D', 'L'].includes(x)) && ['pts', 'gf', 'ga', 'played', 'wins', 'draws', 'losses'].every(k => Number.isFinite(c[k])) && roster(s, i).length >= 11);
    } catch { return false; }
  }
  const api = { defaultInstruction, tacticalPosition, setTarget, tacticPlan, DETAILS, POSITIONS, POSITION_GROUPS, SLOTS, INSTRUCTIONS, detail, upgradeSave, suitability, lineupScore, wageDemand, advanceMinute, setInstruction, matchPositions, autoWeek, filterPlayers, CLUBS, LEAGUES, FORMATIONS, newGame, roster, ovr, value, wage, payroll, windowOpen, player, available, autoLineup, standings, nextFixture, canRelease, setTactics, setLineup, askingPrice, deal, acceptOffer, toggleTransferList, getTransferOffers, sellPlayer, negotiateSale, contractTerminationPenalty, terminateContract, strength, startMatch, substitute, playWeek, nextSeason, validSave, promote, renew, scout, upgrade, talk, groupTable, asianOrder, worldClubOrder };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FM = api;
})(globalThis);
