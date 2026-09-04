# HANDOVER — 세션 인수인계

> 새 세션에서 이 문서만 읽으면 이어서 개발할 수 있어야 한다. **개발 상태의 정본.**
> 커밋마다 "현재 상태"와 "다음 할 일"을 갱신한다. 변경 이력은 [CHANGELOG.md](CHANGELOG.md), 게임 설계는 [docs/DESIGN.md](docs/DESIGN.md).

## 프로젝트 한 줄

배도라지 크루 12명을 둥글둥글한 캐릭터로 만든 **2~4인 쿼터뷰 슈터**(개인전 · 2v2 팀전). 서버 없이 WebRTC P2P + 봇 대전. 덕코프식 시야 제한·모래주머니 엄폐·정확도 기반 헤드샷. GitHub Pages 배포.

- 저장소: https://github.com/goormigrm/bedorage-duck
- 배포: https://goormigrm.github.io/bedorage-duck/
- 작업 폴더: 메인 PC `C:\Users\tkdrm\OneDrive\Desktop\철FPS` · 노트북 `C:\Users\tkdrm\OneDrive\바탕 화면\철FPS\bedorage-duck`. 둘 다 OneDrive 안이라 커밋 직후 푸시.

## 다른 PC 에서 이어받기 (이것만 하면 된다)

```bash
git clone https://github.com/goormigrm/bedorage-duck.git   # 이미 있으면 git pull
cd bedorage-duck
npm ci
npm run dev        # http://localhost:5173/bedorage-duck/
```

필요한 것은 **Node.js 20 이상(24 권장)** 과 **git** 뿐이다. 계정·키·환경변수·`.env` 가 하나도 없다.
서버도 DB 도 안 쓰므로 로컬에서 바로 전 기능이 돈다(방 대전은 브라우저 탭을 2~4개 열어 시험한다).
푸시하려면 GitHub 로그인이 필요하고, 배포 상태를 `gh run list` 로 보려면 `gh auth login`. 둘 다 없어도 개발은 된다.

새 Claude 세션이라면 저장소 폴더에서 **"HANDOVER.md 읽고 이어서 진행해줘"** 한 줄이면 된다.

## 실행

```bash
npm run dev                        # 개발 서버
npm test                           # vitest 53개
npx vite-node tools/melee.ts       # 후라이팬 정면 대치 (봇 표가 못 잡는 부분)
npm run build                      # tsc --noEmit + vite build → dist/
npx vite-node tools/balance.ts     # 밸런스 계측 (ffa 붙이면 4인)
```

PowerShell 에서 `npm` 이 실행 정책에 막히면 `npm.cmd` 또는 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
PC 에서 모바일 조작을 시험하려면 주소 뒤에 `?touch=1`, 스크린샷을 뜨려면 `?shot=1`.

## 현재 상태 (2026-09-04 · v1.0)

| 영역 | 상태 | 비고 |
|---|---|---|
| core 결정론 sim | ✅ 2~4인 | `players[]`, `team`, `left`, `choosing`, `streak`, `stamina`, `sandbags` |
| 전투 규칙 | ✅ | 체력 190~290, 기력(대시 34·근접 방어), 대시 중 무적, **정확도 기반 부위 판정**(중심 0.28r 머리) |
| 무기 7종 | ✅ | 권총·SMG·소총·산탄총·저격총·기관총·후라이팬. 저격총만 한 방. 전부 꾹 = 연사 |
| 모래주머니 | ✅ | 중앙 진지(8칸) + 짧은 줄 1~2개. 엄폐 사격·머리 조준 탄만 넘어감. 내구도 240. 자루 3-2-3 세 단 |
| 캐릭터 12명 | ✅ | 전원 참고 사진 반영. 실제 인물 기준 **키 순서**(`look.tall` — 다리 길이까지 늘려 위에서도 보인다)·몸 폭(`look.slim`) |
| 맵 | ✅ 랜덤 생성 | `buildMap(id, scale, seed)` — 테두리만 고정, 안쪽은 매 판 생성. **3종**(방·야외·기둥) × 3배율, 연결 보정 |
| 봇 | ✅ | 3단계(예전 '쉬움'이 지금 '보통'), 다중 표적, 근접 무기는 굴러서 접근 |
| 3D 렌더 | ✅ | 피치 55°·요 45°, 부드러운 시야, **저격 조준경(커서 + 내 주변 두 구멍)**, 미니맵, 구르기·걷기·사망 연출 |
| HUD | ✅ | 상대 정보 숨김(피격 2.5초만), 머리 위 체력 + 오른쪽 세로 기력, 조작 안내와 겹치지 않음 |
| 소리 | ✅ | 절차 생성 효과음 + 132BPM 추격 배경음(교전 시 레이어 증가). `N`/버튼 음소거 |
| 네트워크 | ✅ 탭 3개 검증 | 정원 4, 호스트 방송이 정본, N인 락스텝, 드롭 틱 합의, 리싱크(모래주머니 포함) |
| 로비 | ✅ | 닉네임 필수, 봇 1~3·개인전/2v2, 목표 킬 5~50, 맵 미리보기, 방 목록 n/4 |
| 밸런스 | 🔧 계측 기반 | 봇 1:1 528판 승률 **38.6~61.4%** (v1.0.2 후라이팬 50% 방어 반영). 승빠덕 38.6%·우원덕 40.9% 가 하단, 주우재덕 61.4% 가 상단 — 좁히려면 재조정 필요. 후라이팬은 `tools/melee.ts` 로 따로 본다 |
| 성능 | ✅ | 4인·4배맵·봇4 틱당 0.023~0.033ms (60Hz 예산 16.6ms) |
| 문서 | ✅ v1.0 | DESIGN·플레이 가이드·공지글·PREP 모두 v1.0 기준 |
| 모바일 | ✅ 가로 전용 | 왼쪽 이동 스틱 + 오른쪽 누르면 사격, **조준 자동**(각속도 제한), 세로면 안내. `?touch=1` 로 PC 시험 |
| 전적 기록 | ✅ 로컬 | 판이 끝나면 브라우저에 최근 50판. 로비 "최근 전적" + 복사 글. **전체 순위표는 없다**(서버·DB 안 씀) |

## 핵심 설계 결정 (바꾸려면 DESIGN.md 도 같이 수정)

1. **`src/core/` 는 결정론.** `Math.sin/cos/atan2/random`·시간 함수 금지, 렌더/DOM import 금지. 플레이어 의사는 반드시 `Input` 에 실어 보낸다. 자세한 규칙은 DESIGN.md 10장.
2. **인원 2~4, 팀은 숫자.** 개인전은 `team[i] = i`. 승리는 `teamKills`.
3. **호스트 = 플레이어 0.** 방 상태·시작·이탈 틱·리싱크를 호스트가 정한다. Trystero 는 훅마다 리스너 하나뿐이라 `room.ts` 안에서만 등록하고 콜백 배열로 나눈다.
4. **카메라 피치 55°·요 45° 고정.** WASD 는 화면 기준(`render3d/camera.ts`).
5. **시야는 렌더 전용.** sim 은 전부 안다. 치트 방지는 P2P 라 원래 불가능.
6. **맵은 시드 생성.** 모래주머니가 부서지면 `map.tiles` 를 바꾸지만 정본은 `state.sandbags`, `createState`/`syncSandbags` 가 복원한다.
7. **헤드샷은 정확도.** 확률 추첨을 쓰지 않는다.
8. **캐릭터 외형은 `characters.ts` 의 `look` 데이터만으로 정의**하고 `render/character.ts`(2D 이목구비) + `render3d/character3d.ts`(3D 조립)가 그린다.
9. **유료·카드 등록 서비스 금지.** TURN 배제. (docs/PREP.md C)
10. **비상업 팬 프로젝트 고지 유지.** 패러디 명칭 사용.
11. **전적은 각자 브라우저에만.** 결정적 락스텝이라 같은 방 사람들이 같은 기록을 갖는다. 전체 순위표는 저장소가 필요해서 만들지 않는다. (DESIGN 8.4)
12. **모바일은 이동만 손으로, 조준은 자동.** 각속도를 제한해 즉시 겨누지 않는다. 조준각은 다른 입력과 똑같이 `Input` 에 실린다. (DESIGN 7.1)
13. **후라이팬 방어는 자원이지 방패가 아니다.** 막는 동안 기력이 차면 안 되고(`BLOCK_LOCK_TICKS`), 앞에서 온 탄도 **절반만** 막는다(`BLOCK_CHANCE = 0.5`). 둘 중 하나라도 없애면 서서 막기만 해도 무적이 된다 — v1.0 에서 실제로 그랬다. 추첨은 반드시 sim 의 `rand(state.rng)` 로 한다(양쪽 브라우저 일치).
14. **봇 표만 믿지 않는다.** 봇은 의도적인 막기·엄폐를 못 하므로 사람이 쓸 때만 강한 것을 못 잡는다. 후라이팬은 `tools/melee.ts` 로 따로 본다.
15. **캐릭터 키는 다리 길이로 표현한다.** 쿼터뷰에서 몸통만 늘리면 안 보인다. `look.tall` 이 다리와 걸음 폭까지 키운다. 판정에는 영향이 없다.

## 코드 지도

```
src/core/state.ts        GameState/PlayerState/Bullet/SimEvent, 상수(기력·대시), 팀 판정
src/core/sim.ts          createState / step / 사격·근접·피해·리스폰 / 모래주머니 / dropPlayer / syncSandbags
src/core/bot.ts          봇 AI (표적 선택, BFS, 리드샷, 근접 돌진)
src/core/map.ts          시드 맵 생성 · 타일 조회 · rayCast(sight|bullet)
src/core/maps.ts         맵 레지스트리 · 생성 파라미터 · 인원별 확장
src/core/weapons.ts      무기표 · headMult · partForOffset(HEAD_FRAC)
src/core/characters.ts   캐릭터 12명 · Look · displayNames
src/core/input.ts        Input 6바이트 (mx,my,aim,buttons,char)
src/net/room.ts          로비 방송 · 게임 방(풀 메시) · CtlMessage · Member
src/net/lockstep.ts      N인 입력 버퍼 · drop
src/game/session.ts      세션 루프 · 캐릭터 선택 창 · 이탈 · 리싱크 · 소리 연결
src/game/ticker.ts       Worker 타이머 (탭이 뒤에 있어도 시뮬이 계속 돈다)
src/game/localInput.ts   키·마우스 → Input (화면 기준 WASD, Tab, 1~9) · 터치 상태 · 자동 조준
src/game/touch.ts        모바일 터치 조작(가로 전용) · 전체화면·방향 잠금
src/game/records.ts      전적 기록 저장·불러오기·공유글 (localStorage, 서버 없음)
src/render3d/camera.ts   PITCH·YAW·moveDirFromScreen
src/render3d/renderer3d.ts  리그·탄·이펙트·카메라·이름표·시야·미니맵·조준경
src/render3d/vision.ts   시야 마스크 · canSee
src/render3d/character3d.ts 달걀형 캐릭터 조립
src/render3d/faceTexture.ts 몸통 한 장 텍스처(얼굴·옷)
src/render3d/world3d.ts  바닥·벽·상자·모래주머니 더미·조명
src/render/hud.ts        HUD 오버레이
src/render/minimap.ts    맵 타일 캔버스 (미니맵·로비 미리보기 공용)
src/render/character.ts  2D 캐리커처 (이목구비·로비 초상)
src/audio/sfx.ts         효과음·배경음 절차 생성
src/ui/lobby.ts          로비·대기실
tools/balance.ts         밸런스 계측 (봇 1:1 528판)
tools/melee.ts           후라이팬 정면 대치 계측 (사람이 막기를 유지하는 상황)
tests/                   determinism · camera · perf · balance · records · autoaim · sandbag · block (53개)
docs/img/                공지용 스크린샷 4장 (전투·조준경·캐릭터·결과)
```

## 작업 규칙

- 커밋은 기능 단위로 자주. 커밋 전 `npm test` + `npm run build` 통과 확인. 화면이 바뀌면 브라우저로 확인.
- 커밋마다 `CHANGELOG.md` 한 줄 이상, 이 문서의 "현재 상태"·"다음 할 일" 갱신. 게임 규칙이 바뀌면 `docs/DESIGN.md` 도.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Bash heredoc 은 8191자 제한에 걸린다 → 큰 파일은 Write 도구, 여러 곳 수정은 scratchpad 에 python 스크립트를 쓰고 실행. heredoc 안에서는 역슬래시 이스케이프가 한 겹 벗겨지므로 \n 이나 경로의 \ 는 chr(10)·chr(92) 로 만든다.
- 주석과 문서는 **한국어**로, '무엇을' 이 아니라 '왜' 를 적는다. 커밋 메시지도 한국어.

### 사용자(goormigrm) 진행 방식

- 굵직한 요청을 여러 개 **연달아** 보낸다. 하나씩 기능 단위로 쪼개 커밋하고 브라우저로 확인한 뒤 다음으로 넘어간다.
- 도구 설치는 **승인 후 Claude 가 winget 으로** 한다. 브라우저 로그인처럼 사람이 직접 해야 하는 것은 **별도 문서로 만들어 건네면 병렬로 처리**한다(`docs/노트북-설정.md` 가 그 예).
- 보안 설정(PowerShell 실행 정책 등)은 **바꾸지 말고 안내만** 한다.
- UI 톤은 개리그 매니저(`km/index.html` — 남색 유리 패널·금색 선·초록 유리 버튼)를 좋아한다. 로비·대기실이 그 톤이다. 저장소 밖 파일이라 없으면 지금 `src/ui/style.css` 를 기준으로 삼는다.
- 비용은 핵심 설계 결정 9 가 절대 기준이다. 카드 등록이 필요한 서비스는 아예 제안하지 않는다.

## 다음 할 일

**개발 1차는 v1.0 으로 끝났다.** 기능을 더 넣지 않고도 공개할 수 있는 상태다.
남은 것은 사람이 직접 해 봐야 알 수 있는 것들이라, 피드백이 오면 그때 손본다.

- [ ] **사용자 확인** (docs/PREP.md A) — 실제 폰에서 가로 조작 감각, **다른 네트워크에서 실제 대전**(가장 중요), 실제 FPS, 체감 밸런스
- [ ] **공개 준비** (docs/PREP.md B) — 공지 채널, 연락 수단 정하기. 문안과 스크린샷은 `docs/공지글-모음.md` 에 다 있다
- [ ] **밸런스 밴드 되좁히기(v1.0.2 여파)** — 후라이팬 50% 방어로 승빠덕 38.6%·주우재덕 61.4% 가 됐다. 승빠덕은 굴러서 붙는 캐릭터라 정면 대치 0/10 은 의도대로지만, 승률까지 하단인지는 **사람이 직접 써 보고** 정한다. 손본다면 승빠덕 체력·속도나 후라이팬 피해부터.
- [ ] 피드백이 오면: 체감 밸런스 수정(`tools/balance.ts` 로 재측정), 모바일 조작 미세 조정
- [ ] 여유가 되면: 방 목록 핑 표시, 짧은 홍보 영상, CC0 실제 음원 교체
- [ ] 하지 않기로 한 것: 전체 순위표, 음량 슬라이더, 관전 모드, TURN 서버 (이유는 DESIGN 15·17장)

## 알려진 이슈 / 주의

- OneDrive 폴더 안에서 git 을 쓴다. 커밋 직후 push 습관화.
- 브라우저 탭이 뒤에 있으면 화면이 멈춘다(시뮬은 Worker 로 계속 돈다).
- Claude Code 브라우저 도구: 패널이 숨겨지면 `requestAnimationFrame` 이 멈춰 애니메이션·FPS 측정이 안 된다. 스크린샷 한 장은 정상. 키 입력은 `window.dispatchEvent(new KeyboardEvent(...))` 가 확실하다.
- 공용 로비 방은 접속자 전원이 하나의 메시다(수십 명 규모부터 부담).
- 스크린샷을 다시 뜨려면: 개발 서버에서 주소 뒤에 `?shot=1` 을 붙여 열고(캔버스 버퍼가 보존된다), 캔버스 두 장(`canvas.gl` + `canvas.hud`)을 합쳐 `POST /__shot` 하면 `docs/img/` 에 떨어진다. 이 엔드포인트는 개발 서버 전용이라 배포물에는 없다.
