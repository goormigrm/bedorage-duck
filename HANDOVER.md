# HANDOVER — 세션 인수인계

> 새 세션에서 이 문서만 읽으면 이어서 개발할 수 있어야 한다.
> 커밋마다 "현재 상태"와 "다음 할 일"을 갱신한다. 변경 이력은 [CHANGELOG.md](CHANGELOG.md).

## 프로젝트 한 줄

배도라지 크루를 둥글둥글한 치비 캐릭터로 만든 **2~4인 쿼터뷰 슈터**(개인전 · 2v2 팀전). 서버 없이 WebRTC P2P 대전 + 봇 대전. 덕코프식 시야 제한·대각선 카메라. GitHub Pages 배포.
설계서: [docs/DESIGN.md](docs/DESIGN.md).

- 저장소: https://github.com/goormigrm/bedorage-duck
- 배포 주소: https://goormigrm.github.io/bedorage-duck/ (게임) · https://goormigrm.github.io/bedorage-duck/preview.html (프리뷰)
- 작업 폴더: 메인 PC `C:\Users\tkdrm\OneDrive\Desktop\철FPS` (저장소가 바로) · 노트북 `C:\Users\tkdrm\OneDrive\바탕 화면\철FPS\bedorage-duck` (하위 폴더). 둘 다 OneDrive 안이라 커밋 직후 푸시.

## 다른 PC 에서 이어가기

1. `git clone https://github.com/goormigrm/bedorage-duck.git` → `cd bedorage-duck` → `npm install` → `npm run dev`
2. 커밋 작성자는 저장소별 설정: `git config user.name goormigrm` · `git config user.email 1117tkdrms@gmail.com`
3. 푸시 권한: `gh auth login` (또는 git 자격증명 관리자). `gh run list` 로 배포 확인.
4. Claude Code 새 세션에서 **"HANDOVER.md 읽고 이어서 진행해줘"**. Claude 의 로컬 메모리는 PC 마다 따로라 이 문서가 정본이다.
5. 세션 시작은 `git pull`, 끝은 커밋·푸시. 노트북 설정 상태는 [docs/노트북-설정.md](docs/노트북-설정.md).
6. 브라우저 자동 검증용 `.claude/launch.json` 은 저장소 루트에 있다(노트북은 상위 폴더 `철FPS/.claude/launch.json` 에 node 절대경로 버전이 따로 있음 — 저장소 밖).

## 실행

```bash
npm install
npm run dev          # http://localhost:5173/bedorage-duck/  (프리뷰는 /bedorage-duck/preview.html)
npm test             # vitest — 결정론·맵·카메라 테스트 18개
npm run build        # tsc --noEmit + vite build → dist/
```

PowerShell 에서 `npm` 이 실행 정책에 막히면 `npm.cmd` 를 쓰거나 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

## 현재 상태 (2026-09-04 2차, 노트북 세션)

| 영역 | 상태 | 비고 |
|---|---|---|
| core 결정론 sim (`src/core/`) | ✅ 2~4인 | `players[]`, `team`, `left`, `choosing`. 팀 킬 합계 승리, 아군 피해 없음 |
| 캐릭터 교체 | ✅ | 리스폰 대기·직후 3초 `Tab` → 선택 창 → 대기 뒤 먼 곳 리스폰. Input 6바이트째 `char` |
| 무기 | ✅ | 전부 연사 + 자동 재장전. **산탄총 22×7**(최대 154), 감쇠 170→470px 35% |
| 봇 (`core/bot.ts`) | ✅ | 다중 표적, 기억 600틱, 보통 난이도는 상대 근처 배회(넓은 맵 대비) |
| 맵 (`core/maps.ts`) | ✅ 2종 × 3배율 | 2명 1배, 3명 2배, 4명 4배(거울) |
| 캐릭터 3D (`render3d/character3d.ts`) | ✅ 덕코프식 일체형 | **달걀 몸통 한 장 텍스처**(얼굴·옷·넥타이·명찰, `faceTexture.ts bodyTexture`), 달걀을 따라가는 머리카락·모자 캡, 옆구리 팔 + 총, 작은 다리. 매직덕은 실제 사진 반영(앞머리·V넥 스크럽) |
| 3D 렌더 | ✅ | 피치 55°·요 45°, 시야 제한(바닥·벽 윗면·**벽 옆면**), 걷기 뒤뚱, 사망 넘어짐, 단군덕 총성 표시 |
| HUD | ✅ | 상대 정보 숨김(피격 2.5초만), 내 머리 위 체력·기력, 내 카드 + 상대 목록, 팀 점수판 |
| 소리 (`src/audio/sfx.ts`) | ✅ 절차 생성 | 무기별 총성·피격·사망·리스폰·대시·재장전·카운트다운·시작/종료, BGM 루프. `N`/버튼 음소거. 파일 없음 |
| 네트워크 (`src/net/`) | ✅ 탭 3개 검증 | 정원 4, 호스트 방 상태 방송, N인 락스텝, 드롭 틱 합의, 리싱크. `Member.name` 닉네임 |
| 로비·대기실 (`ui/`) | ✅ | km 스타일, 닉네임 입력, 봇 1~3·개인전/2v2, 방 목록 n/4, 슬롯 4칸·팀 바꾸기 |
| 프리뷰 | ✅ | `?n= ?teams=1 ?scale= ?map= ?sheet=1&focus=` |
| 배포 | ✅ | main 푸시 → Pages. 다른 네트워크 실제 대전은 미검증 |
| 테스트 | ✅ 18개 | determinism·camera |

## 핵심 설계 결정 (바꾸려면 설계서도 같이 수정)

1. **`src/core/` 는 결정론.** `Math.sin/cos/atan2/random`, `Date.now` 금지. 삼각함수는 `fixedmath.ts` 테이블, 난수는 `rng.ts`. 렌더/DOM import 금지. 캐릭터 교체처럼 플레이어 의사가 sim 에 들어가야 하면 **반드시 Input 에 실어** 보낸다.
2. **인원 2~4, 팀은 숫자.** 개인전 = `team[i] = i`. 팀전 = 0/1. `isEnemy(a,b) = a.team !== b.team`. 승리는 `teamKills`.
3. **호스트 = 플레이어 0.** 방 상태(`room` 메시지)·시작(`start`)·이탈 틱(`drop`)·리싱크는 호스트가 정한다. 호스트가 나가면 방 종료. Trystero 는 훅마다 리스너 하나만 갖는다 → `room.ts` 안에서만 등록하고 콜백 배열로 나눠 준다.
4. **카메라 피치 55°, 요 45° 고정** (`render3d/camera.ts`). WASD 는 화면 기준이고 `moveDirFromScreen()` 이 월드 8방향으로 대응. 봇·탄·조준은 월드 좌표.
5. **시야는 렌더 전용.** sim 은 전부 알고, `vision.ts` 가 내(팀) 시야 다각형 밖을 가리고 적을 숨긴다. 치트 방지는 원래 불가(P2P).
6. **캐릭터 외형은 데이터(`characters.ts look`) + 3D 조립(`character3d.ts`).** 얼굴 이목구비는 2D 캐리커처(`render/character.ts featuresOnly`)를 구 표면에 감는다. 새 멤버 = `look` 한 줄 + (필요하면) 머리카락 케이스.
7. **맵 확장은 거울.** `expandRows()` 가 테두리 한 줄을 빼고 뒤집어 붙여 이음새가 열린 통로. 인원별 배율은 `scaleForPlayers()`.
8. **모드는 혼자 하기(봇 1~3)와 방(2~4명).** 탈출 모드는 하지 않는다. 죽으면 3초 뒤 적에게서 먼 스폰 상위 3곳 중 무작위, 스폰 보호 1.5초.
9. **캐릭터 이름은 패러디 명칭**, 비상업 팬게임 고지 유지. 주인공 철면수심(로비 기본 선택·프리뷰 P1).
10. **카드 등록이 필요한 서비스는 전부 배제** (2026-09-04 사용자 결정). 무료 티어라도 사용량 과금 가능성이 있으면 안 쓴다 → TURN(metered·Cloudflare Realtime 등) 배제, NAT 실패는 핫스팟 안내로 끝. 허용: GitHub Pages, Google Fonts, 공개 Nostr 릴레이, 무료 STUN, **Cloudflare Workers 무료 플랜**(카드 없음, 한도 초과 시 차단 — 시그널링 용도만 가능).

## 코드 지도

```
src/core/state.ts        GameState/PlayerState(team·left·choosing)/SimEvent, 상수, teamKills/isEnemy
src/core/sim.ts          createState(N인 스폰) / step / dropPlayer / 캐릭터 교체 / snapshot / hashState
src/core/bot.ts          makeBot / botInput (다중 표적, BFS, 리드샷, 회피 대시)
src/core/input.ts        Input {mx,my,aim,buttons,char}, 6바이트 직렬화, BTN_SWAP
src/core/maps.ts         맵 레지스트리 + expandRows/scaleForPlayers
src/core/map.ts          buildMap(id, scale), DDA 레이캐스트
src/core/weapons.ts      무기 5종(전부 auto), 부위 확률, 거리 감쇠
src/core/characters.ts   캐릭터 5종, displayNames
src/net/room.ts          로비 방 목록 방송, 게임 방(풀 메시), CtlMessage, Member
src/net/lockstep.ts      N인 입력 버퍼, drop
src/game/session.ts      세션 루프(솔로/락스텝), 캐릭터 선택 창, 이탈 처리, 리싱크
src/game/localInput.ts   키·마우스 → Input (화면 기준 WASD, Tab, 1~5)
src/render3d/camera.ts   PITCH·YAW·moveDirFromScreen
src/render3d/renderer3d.ts  Three 렌더러: 리그·탄·이펙트·카메라·이름표·시야 연동
src/render3d/vision.ts   시야 마스크·canSee
src/render3d/character3d.ts 둥근 치비 조립
src/render3d/faceTexture.ts 이목구비 텍스처
src/render3d/world3d.ts  바닥·벽·상자·조명
src/render/hud.ts        HUD 오버레이
src/render/character.ts  2D 캐리커처(로비 초상·얼굴 텍스처)
src/ui/lobby.ts          로비·대기실
src/preview.ts           프리뷰
```

## 작업 규칙

- 커밋은 기능 단위로 자주. 커밋 전 `npm run build`(또는 `npx tsc --noEmit` + `npm test`) 통과 확인. 화면이 바뀌면 브라우저로 확인.
- 커밋마다 `CHANGELOG.md` 에 한 줄 이상, 이 문서의 "현재 상태"와 "다음 할 일" 갱신.
- 설계 변경은 `docs/DESIGN.md` 에도 반영.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Bash 도구로 큰 파일을 heredoc 으로 쓰면 8191자 제한에 걸린다 → 큰 파일은 Write 도구, 부분 수정은 python 스크립트.

## 다음 할 일 (우선순위 순)

- [ ] **사용자**: 다른 네트워크의 PC 2~4대로 실제 대전 (NAT·4인 락스텝 체감 지연). 실패해도 TURN 은 안 쓴다(비용 원칙) — 핫스팟 재시도 안내가 최종. 소리도 실제로 들어 보고 음량·느낌 피드백.
- [ ] 캐릭터: 실제 사진 기준으로 나머지(철면·침착·단군·주펄)도 다듬기 요청이 오면 `look` 조정. 2D 로비 초상(`render/character.ts drawPortrait`)은 아직 예전 분리형 그림 — 달걀형 초상으로 바꾸면 통일감.
- [ ] 시야 반경(13타일)·어둡기 튜닝, 팀전 아군 시야 공유 실전 확인.
- [ ] 소리: 실제 음원으로 교체하려면 `public/sfx/` + `sfx.ts` 메서드 교체. 음량 슬라이더.
- [ ] 로비: 방 목록 핑(연결 전 RTT 불가 → 호스트 지역/릴레이 지연 표시 검토), 게임 HUD 를 로비 톤으로.
- [ ] 문서: `docs/DESIGN.md` 본문(v0.1 초안 부분) 정리, `docs/공지글-모음.md` 최종 확정.
- [ ] 나머지 멤버 7명 (게임 완성 후). `look` 한 줄 + 필요하면 머리카락 케이스(`hair`)와 3D 캡.

## 알려진 이슈 / 주의

- OneDrive 폴더 안에서 git 을 쓴다. 커밋 직후 push 습관화.
- 브라우저 탭이 백그라운드면 rAF 가 멈춘다(시뮬은 Worker 로 계속 돈다). 대전 중에는 탭을 앞에 둬야 화면이 갱신된다.
- Claude Code 브라우저 도구: 백그라운드 탭의 스크린샷은 갱신되지 않을 수 있다 → `tabs_select` 로 앞에 두거나 `resize_window` 로 긴 화면을 찍는다. 키 입력은 `window.dispatchEvent(new KeyboardEvent(...))` 가 확실하다.
- 상대 캐릭터 교체 시 그 사람 리그만 다시 만든다. 같은 캐릭터가 여럿이면 이름에 번호("철면덕 2").
