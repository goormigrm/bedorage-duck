# HANDOVER — 세션 인수인계

> 새 세션에서 이 문서만 읽으면 이어서 개발할 수 있어야 한다. **개발 상태의 정본.**
> 커밋마다 "현재 상태"와 "다음 할 일"을 갱신한다. 변경 이력은 [CHANGELOG.md](CHANGELOG.md), 게임 설계는 [docs/DESIGN.md](docs/DESIGN.md).

## 프로젝트 한 줄

배도라지 크루 12명을 둥글둥글한 캐릭터로 만든 **2~4인 쿼터뷰 슈터**(개인전 · 2v2 팀전). 서버 없이 WebRTC P2P + 봇 대전. 덕코프식 시야 제한·모래주머니 엄폐·정확도 기반 헤드샷. GitHub Pages 배포.

- 저장소: https://github.com/goormigrm/bedorage-duck
- 배포: https://goormigrm.github.io/bedorage-duck/ (프리뷰 `/preview.html`)
- 작업 폴더: 메인 PC `C:\Users\tkdrm\OneDrive\Desktop\철FPS` · 노트북 `C:\Users\tkdrm\OneDrive\바탕 화면\철FPS\bedorage-duck`. 둘 다 OneDrive 안이라 커밋 직후 푸시.

## 실행

```bash
npm install
npm run dev                        # http://localhost:5173/bedorage-duck/
npm test                           # vitest 31개 (결정론·카메라·성능·밸런스)
npm run build                      # tsc --noEmit + vite build → dist/
npx vite-node tools/balance.ts     # 밸런스 계측 (ffa 붙이면 4인)
```

PowerShell 에서 `npm` 이 실행 정책에 막히면 `npm.cmd` 또는 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

## 현재 상태 (2026-09-04 · v1.0)

| 영역 | 상태 | 비고 |
|---|---|---|
| core 결정론 sim | ✅ 2~4인 | `players[]`, `team`, `left`, `choosing`, `streak`, `stamina`, `sandbags` |
| 전투 규칙 | ✅ | 체력 190~290, 기력(대시 34·근접 방어), 대시 중 무적, **정확도 기반 부위 판정**(중심 0.28r 머리) |
| 무기 7종 | ✅ | 권총·SMG·소총·산탄총·저격총·기관총·후라이팬. 저격총만 한 방. 전부 꾹 = 연사 |
| 모래주머니 | ✅ | 중앙 진지 + 흩어진 줄. 엄폐 사격·머리 조준 탄은 넘어감. 내구도 240, 파괴 시 색 변화 후 소멸 |
| 캐릭터 12명 | ✅ | 전원 참고 사진 반영. 실제 인물 기준 **키 순서**(`look.tall`)·몸 폭(`look.slim`) 반영. 주우재덕이 제일 크고 가늘다 |
| 맵 | ✅ 랜덤 생성 | `buildMap(id, scale, seed)` — 테두리만 고정, 안쪽은 매 판 생성. **3종**(방·야외·기둥) × 3배율, 연결 보정 |
| 봇 | ✅ | 3단계(예전 '쉬움'이 지금 '보통'), 다중 표적, 근접 무기는 굴러서 접근 |
| 3D 렌더 | ✅ | 피치 55°·요 45°, 부드러운 시야, **저격 조준경(커서 + 내 주변 두 구멍)**, 미니맵, 구르기·걷기·사망 연출 |
| HUD | ✅ | 상대 정보 숨김(피격 2.5초만), 머리 위 체력 + 오른쪽 세로 기력, 조작 안내와 겹치지 않음 |
| 소리 | ✅ | 절차 생성 효과음 + 132BPM 추격 배경음(교전 시 레이어 증가). `N`/버튼 음소거 |
| 네트워크 | ✅ 탭 3개 검증 | 정원 4, 호스트 방송이 정본, N인 락스텝, 드롭 틱 합의, 리싱크(모래주머니 포함) |
| 로비 | ✅ | 닉네임 필수, 봇 1~3·개인전/2v2, 목표 킬 5~50, 맵 미리보기, 방 목록 n/4 |
| 밸런스 | ✅ 계측 기반 | 봇 1:1 528판 승률 42~58%. `tools/balance.ts` 로 재측정 |
| 성능 | ✅ | 4인·4배맵·봇4 틱당 0.023ms (60Hz 예산 16.6ms) |
| 문서 | ✅ v1.0 | DESIGN 전면 재작성, 플레이 가이드 신설, 공지글 확정 |
| 모바일 | ✅ 가로 전용 | 플로팅 스틱 2개 + 버튼 4개, 세로면 안내, 전체화면·방향 잠금 시도. `?touch=1` 로 PC 시험 |
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
src/game/localInput.ts   키·마우스 → Input (화면 기준 WASD, Tab, 1~9) · 터치 상태 합치기
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
tools/balance.ts         밸런스 계측
```

## 작업 규칙

- 커밋은 기능 단위로 자주. 커밋 전 `npm test` + `npm run build` 통과 확인. 화면이 바뀌면 브라우저로 확인.
- 커밋마다 `CHANGELOG.md` 한 줄 이상, 이 문서의 "현재 상태"·"다음 할 일" 갱신. 게임 규칙이 바뀌면 `docs/DESIGN.md` 도.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Bash heredoc 은 8191자 제한에 걸린다 → 큰 파일은 Write 도구, 여러 곳 수정은 scratchpad 에 python 스크립트를 쓰고 실행.

## 다음 할 일 (우선순위 순)

- [ ] **사용자 확인 항목** ← 지금 남은 것: 실제 폰에서 가로 조작 감각, 다른 네트워크 실제 대전, 실제 FPS, 체감 밸런스 (docs/PREP.md A)
- [ ] 짧은 홍보 영상 캡처(`preview.html?n=4&ff=600` + `L` 레터박스). 스크린샷 4장은 `docs/img/` 에 있고 공지글에 붙어 있다
- [ ] 로비: 방 목록 핑 표시, 접속자 수십 명 규모에서 공용 로비 메시 부담 완화 (지금 규모에서는 문제 없음)
- [ ] (원하면) CC0 실제 음원 교체. 음량 슬라이더는 만들지 않기로 했다

## 알려진 이슈 / 주의

- OneDrive 폴더 안에서 git 을 쓴다. 커밋 직후 push 습관화.
- 브라우저 탭이 뒤에 있으면 화면이 멈춘다(시뮬은 Worker 로 계속 돈다).
- Claude Code 브라우저 도구: 패널이 숨겨지면 `requestAnimationFrame` 이 멈춰 애니메이션·FPS 측정이 안 된다. 스크린샷 한 장은 정상. 키 입력은 `window.dispatchEvent(new KeyboardEvent(...))` 가 확실하다.
- 공용 로비 방은 접속자 전원이 하나의 메시다(수십 명 규모부터 부담).
- 스크린샷을 다시 뜨려면: 개발 서버에서 `preview.html?shot=1&...` 을 열고 `window.__cap` 으로 틱·그리기를 직접 돌린 뒤, 캔버스 두 장(`canvas.gl` + `canvas.hud`)을 합쳐 `POST /__shot` 하면 `docs/img/` 에 떨어진다. 배포 빌드에는 들어가지 않는다.
