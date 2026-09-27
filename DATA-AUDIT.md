# 선수 포지션 데이터 검수 — 2026-09-27

실명 시드가 있는 선덜랜드·레스터 시티·FC 안양의 66명을 대상으로 포지션 생성 경로와 저장 복원을 점검했다. 기존 GK/DF/MF/FW 분류는 선수 정보가 아니라 명단 순서로 결정됐으며, 아래 대표 포지션과 비교하면 47명이 다른 포지션 그룹에 들어갔다. CB/LB/RB 등의 세부 포지션도 선수 ID에 따라 달라져 선택한 구단에 따라 같은 선수가 다른 자리로 생성됐다.

| 구단 | 실명 선수 | 기존 그룹 오류 |
| --- | ---: | ---: |
| 선덜랜드 | 22 | 19 |
| 레스터 시티 | 22 | 15 |
| FC 안양 | 22 | 13 |
| 합계 | 66 | 47 |

`world.js`에 이름과 대표 포지션을 함께 기록하고 새 게임 생성 시 능력치·급여·자동 선발 계산 전에 적용한다. 가상 선수에게만 기존 생성 규칙을 사용한다. 복수 포지션 선수는 게임에서 사용하는 대표 자리 하나로 정리했으며, 모든 출전 가능 위치를 수록한 데이터베이스는 아니다.

기존 커리어는 불러오기 또는 JSON 복원 시 원래 선수 ID와 이름을 함께 확인하여 `pos`와 `position`만 교정한다. 이적·임대·방출 뒤에도 적용하며 동명이인 유소년은 건드리지 않는다. 성장한 능력치, 나이, 주발, 계약, 급여, 기록, 선발 명단, 진행 중 경기는 보존한다. 기존 잘못된 선발 배치까지 바꾸려면 전술 화면에서 **자동 선정**을 실행한다.

## 대조 자료

- [레스터 공식 파에스 영입 발표](https://www.lcfc.com/media-article/Leicester-City-Sign-Wout-Faes-From-Reims): 센터백.
- [레스터 공식 마비디디 임대 발표](https://www.lcfc.com/media-article/stephy-mavididi-watford-wfc-leicester-city-lcfc--loan): 윙어. 최신 소속에 대해서는 아래 유의사항 참조.
- [레스터 공식 선수단/경기 명단](https://www.lcfc.com/match-centre-lineups?gameId=2642018), [조지프](https://www.lcfc.com/media-article/leicester-city-lcfc-new-contract-jayden-joseph-2030-four-years), [맥팔레인](https://www.mancity.com/players/christian-mcfarlane), [하월](https://www.lcfc.com/media-article/leicester-city-lcfc-harry-howell-loan-deal-signing-brighton-hove-albion), [라비촐리](https://www.lcfc.com/media-article/leicester-city-lcfc-franco-ravizzoli-transfer-signing-blackpool).
- [UEFA 선덜랜드 선수단](https://www.uefa.com/uefaeuropaleague/clubs/53360--sunderland/squad/): 골키퍼·수비·중원·공격 분류. [툴루즈 공식 메탈리 이적 발표](https://www.toulousefc.com/play/blog/2026/08/le-toulouse-football-club-annonce-le-transfert-de-dayann-methalie-a-sunderland): 왼쪽 수비수.
- [프리미어리그 공식 전술 분석](https://www.premierleague.com/en/news/4431438/analysis-granit-xhaka-role-in-sunderland-brilliant-start-to-2025-26-season): 자카·사디키의 중원, 리그의 공격형 미드필더 역할.
- [FC 안양 공식 선수단](https://fc-anyang.com/player/player.asp), [신인 선수 소개](https://www.fc-anyang.com/news/newsDetail.asp?menu=TNews&seq=1075): 강지완은 중원, 김강은 윙포워드, 김재현은 왼발 사이드백.
- [문성우](https://www.fc-anyang.com/player/player_view.asp?idx=113&pos=MF), [김지훈](https://www.fc-anyang.com/player/player_view.asp?idx=151), [박정훈](https://www.fc-anyang.com/player/player_view.asp?idx=129&pos=FW), [대니 바커](https://www.fc-anyang.com/news/newsDetail.asp?menu=TNews&seq=1124), [블레이즈](https://www.fc-anyang.com/news/newsDetail.asp?menu=TNews&seq=1125): 구단 공식 소개.
- 세부 위치 보조 대조: [선덜랜드](https://www.transfermarkt.co.uk/afc-sunderland/startseite/verein/289/saison_id/2026), [안양 김지훈](https://www.transfermarkt.com/fc-anyang/kadernachposition/verein/38898), [아일톤](https://www.transfermarkt.com/airton-moises/profil/spieler/696604), [아호카](https://www.transfermarkt.co.uk/jules-ahoka/profil/spieler/1401779), [브리스트리치](https://www.transfermarkt.us/admir-bristric/profil/spieler/678606).

## 추가로 확인된 데이터 한계

- 실명 선수는 위 세 구단 66명뿐이다. 나머지는 국가별 이름 풀에서 생성한 가상 선수이므로 실제 선수 전수 검증 대상과 구별해야 한다.
- 실명 선수도 나이(시작 시 19~33세), 주발, 능력치, 잠재력, 급여, 계약 기간은 게임용 생성 값이다. 예를 들어 청소년 선수에게도 30대 나이가 배정될 수 있다. 이번 수정은 포지션에 한정하며 다른 항목을 실제 정보라고 보장하지 않는다.
- 실명 명단은 구단별 22명을 잘라 담은 일부 명단이다. 최신 완전한 선수단이 아니며 이적·임대 상태를 반영하지 않은 사례도 있다. 마비디디는 [2026-09-01 구단 발표](https://www.lcfc.com/media-article/stephy-mavididi-watford-wfc-leicester-city-lcfc--loan)에서 왓퍼드 임대로 확인되지만, 기존 게임 시드는 레스터 소속이다. 이번 수정으로 진행 중 커리어의 소속이나 계약을 현실 이적 내역으로 덮어쓰지는 않는다.
- `node test-rosters.cjs`는 66명 포지션 적용, 세 구단에서 시작했을 때의 ID 변화, 실제 GK 자동 선발, 기존 저장 교정, 이적·임대·방출·동명이인 보호, 반복 적용 시 동일 결과를 검증한다. 외부 사이트와 실시간 동기화하는 검증은 아니다.

## 선수별 대조표

기존 열은 명단 순서로 고정되던 포지션 그룹이다. 세부 위치는 ID에 따라 바뀌었으므로 기존 세부 위치를 하나로 단정하지 않는다.

| 구단 | 선수 | 기존 그룹 | 수정 대표 포지션 |
| --- | --- | --- | --- |
| 선덜랜드 | Kevin Danso | GK | CB |
| 선덜랜드 | Dan Ballard | GK | CB |
| 선덜랜드 | Dayann Methalie | GK | LB |
| 선덜랜드 | Chemsdine Talbi | DF | RW |
| 선덜랜드 | Alan Browne | DF | CM |
| 선덜랜드 | Brian Brobbey | DF | ST |
| 선덜랜드 | Nilson Angulo | DF | LW |
| 선덜랜드 | Chris Rigg | DF | AM |
| 선덜랜드 | Thomas Meunier | DF | RB |
| 선덜랜드 | Luke O'Nien | DF | CB |
| 선덜랜드 | Romaine Mundle | MF | LW |
| 선덜랜드 | Omar Alderete | MF | CB |
| 선덜랜드 | Reinildo Mandava | MF | LB |
| 선덜랜드 | Wilson Isidor | MF | ST |
| 선덜랜드 | Habib Diarra | MF | CM |
| 선덜랜드 | Nordi Mukiele | MF | RB |
| 선덜랜드 | Simon Moore | MF | GK |
| 선덜랜드 | Robin Roefs | FW | GK |
| 선덜랜드 | Noah Sadiki | FW | DM |
| 선덜랜드 | Enzo Le Fee | FW | CM |
| 선덜랜드 | Jules Ahoka | FW | DM |
| 선덜랜드 | Granit Xhaka | FW | DM |
| 레스터 시티 | Jakub Stolarczyk | GK | GK |
| 레스터 시티 | Jayden Joseph | GK | RB |
| 레스터 시티 | Wout Faes | GK | CB |
| 레스터 시티 | Ben Nelson | DF | CB |
| 레스터 시티 | Caleb Okoli | DF | CB |
| 레스터 시티 | Wes Burns | DF | RW |
| 레스터 시티 | Conor Chaplin | DF | AM |
| 레스터 시티 | Admir Bristrić | DF | ST |
| 레스터 시티 | Stephy Mavididi | DF | LW |
| 레스터 시티 | Liam Cullen | DF | ST |
| 레스터 시티 | Bobby De Cordova-Reid | MF | LW |
| 레스터 시티 | Harry Souttar | MF | CB |
| 레스터 시티 | Hamza Choudhury | MF | DM |
| 레스터 시티 | Christian McFarlane | MF | LB |
| 레스터 시티 | Harry Howell | MF | AM |
| 레스터 시티 | Franco Ravizzoli | MF | GK |
| 레스터 시티 | Oliver Skipp | MF | DM |
| 레스터 시티 | Tommy Watson | FW | LW |
| 레스터 시티 | Louis Page | FW | CM |
| 레스터 시티 | Woyo Coulibaly | FW | RB |
| 레스터 시티 | Alex McCarthy | FW | GK |
| 레스터 시티 | Luke Thomas | FW | LB |
| FC 안양 | 강지완 | GK | DM |
| FC 안양 | 강지훈 | GK | RB |
| FC 안양 | 권경원 | GK | CB |
| FC 안양 | 김강 | DF | RW |
| FC 안양 | 김다솔 | DF | GK |
| FC 안양 | 김동진 | DF | LB |
| FC 안양 | 김보경 | DF | AM |
| FC 안양 | 김성동 | DF | GK |
| FC 안양 | 김영찬 | DF | CB |
| FC 안양 | 김운 | DF | ST |
| FC 안양 | 김재현 | MF | LB |
| FC 안양 | 김정현 | MF | DM |
| FC 안양 | 김정훈 | MF | GK |
| FC 안양 | 김지훈 | MF | CB |
| FC 안양 | 대니 바커 | MF | CB |
| FC 안양 | 마테우스 | MF | AM |
| FC 안양 | 문성우 | MF | CM |
| FC 안양 | 박정훈 | FW | ST |
| FC 안양 | 박종현 | FW | CB |
| FC 안양 | 블레이즈 | FW | ST |
| FC 안양 | 아일톤 | FW | LW |
| FC 안양 | 엘쿠라노 | FW | ST |
