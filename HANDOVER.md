# HANDOVER — 세션 인수인계

> 새 세션에서 이 문서만 읽으면 이어서 개발할 수 있어야 한다.
> 커밋마다 "현재 상태"와 "다음 할 일"을 갱신한다. 변경 이력은 [CHANGELOG.md](CHANGELOG.md).

## 프로젝트 한 줄

배도라지 크루를 작고 말랑한 오리로 만든 1:1 쿼터뷰 슈터. 서버 없이 WebRTC P2P 대전 + 봇 대전. GitHub Pages 배포.
설계서: [docs/DESIGN.md](docs/DESIGN.md).

- 저장소: https://github.com/goormigrm/bedorage-duck
- 배포 주소: https://goormigrm.github.io/bedorage-duck/ (게임) · https://goormigrm.github.io/bedorage-duck/preview.html (프리뷰)
- 로컬 폴더(메인 PC): `C:\Users\tkdrm\OneDrive\Desktop\철FPS` (폴더명은 한글이지만 저장소명은 bedorage-duck). 다른 PC 는 clone 한 곳이 작업 폴더.

## 다른 PC 에서 이어가기 (노트북 등)

1. `git clone https://github.com/goormigrm/bedorage-duck.git` → `cd bedorage-duck` → `npm install` → `npm run dev`
2. 커밋 작성자는 저장소별 설정이라 다시: `git config user.name goormigrm` · `git config user.email 1117tkdrms@gmail.com`
3. 푸시 권한: `gh auth login` (또는 git 자격증명 관리자로 GitHub 로그인). `gh` 는 배포 상태 확인(`gh run list`)에도 쓴다.
4. Claude Code 새 세션에서 **"HANDOVER.md 읽고 이어서 진행해줘"**. Claude 의 로컬 메모리는 PC 마다 따로라 새 PC 에선 비어 있고, 이 문서가 정본이다.
5. 작업 후에는 반드시 커밋·푸시. 두 PC 를 오가므로 세션 시작 시 `git pull` 부터 (Claude 에게 시키면 된다).
6. 메인 PC 는 OneDrive 폴더 안이라 `.git` 이 동기화 충돌을 겪을 수 있다. 다른 PC 에서 푸시한 뒤 메인 PC 로 돌아오면 `git pull` 을 먼저 하고, 충돌 시 원격(main) 을 기준으로 맞춘다.
7. 준비물·권한 체크는 `docs/PREP.md`. 브라우저 자동 검증용 `.claude/launch.json` 은 저장소에 포함돼 있다.

## 실행

```bash
npm install
npm run dev          # http://localhost:5173/bedorage-duck/  (프리뷰는 /bedorage-duck/preview.html)
npm test             # vitest — 결정론 테스트
npm run build        # tsc --noEmit + vite build → dist/
```

## ✅ 방향 결정 완료 (2026-09-03 밤) — Three.js 3D 전환 진행 중

[docs/DECISIONS.md](docs/DECISIONS.md) 의 10개 질문에 사용자가 답했다:
1. **Three.js 3D** 2. 캔버스 얼굴 텍스처 + 프리미티브 몸 3. 고정 피치 55°, 회전 없음 4. **2D 프리뷰는 3D 로 대체 후 삭제** 5. 3D 렌더러 먼저 → P2P 검증 (사용자가 선택지를 그대로 붙여 보내 기본안 적용) 6. 노출 우선순위 대신 **캐릭터 선택칸 동일 크기, '배도라지장' 같은 설명 배지 제거, 철면덕 공격력 상승(산탄총 거리별 피해)** 7. **맵 2종**(스튜디오·마당) + 언제든 추가·변경 가능한 구조 8. 이름 유지 9. 나머지 멤버는 게임 완성 후 순차 추가 10. 키보드·마우스만.

진행 순서: 3D 렌더러(`src/render3d/`) → 3D 프리뷰로 캡처 가능 상태 → 세션·로비를 3D 로 → 2D `render/canvas.ts` 삭제 → P2P 두 브라우저 검증.

## 현재 상태 (2026-09-03)

| 영역 | 상태 | 비고 |
|---|---|---|
| 3D 렌더러 (`src/render3d/`) | ✅ 동작 | Three.js. 카메라 55° 고정. 캐릭터 = 얼굴 텍스처 + 프리미티브. 2D 렌더러는 삭제됨 |
| 맵 (`src/core/maps.ts`) | ✅ 2종 | 스튜디오·마당. 추가는 MAPS 에 항목 추가 |
| 방 목록·준비 (`src/ui/lobby.ts`, `src/net/room.ts`) | ✅ 같은 PC 탭 2개로 검증 | 공용 로비 방 방송 방식. Firebase 등 외부 서비스 없음. 다른 네트워크 간 검증은 사용자 몫 |
| 틱 타이머 (`src/game/ticker.ts`) | ✅ | Web Worker. 탭이 뒤에 있어도 시뮬 진행 |
| 결정론 sim (`src/core/`) | ✅ 구현 | 이동·대시·사격·투사체·부위피해(산탄총 거리 감쇠)·리스폰·목표킬 승리 |
| 봇 AI (`src/core/bot.ts`) | ✅ 구현 | easy/normal/hard, BFS 경로, 리드샷, 회피 대시 |
| Canvas 렌더러 (`src/render/canvas.ts`) | ✅ 구현 | 맵·오리·탄·이펙트·HUD·시네마틱 카메라 |
| 프리뷰 페이지 (`preview.html`, `src/preview.ts`) | ✅ 동작 | 봇 vs 봇 자동 플레이, 슬로모션, 타이틀 카드, 레터박스. 브라우저 탭이 앞에 있어야 애니메이션이 돈다 |
| 게임 본편 (`index.html`, `src/main.ts`) | ✅ 3D 로 동작 | 로비(캐릭터 5칸·맵·혼자 하기·방 만들기·방 목록/코드 참가·준비) + `src/game/session.ts` |
| P2P (`src/net/`) | ✅ 검증 (같은 PC) | Trystero 방 + 락스텝 + 해시/리싱크. 리싱크 경로는 실전 미검증 |
| 배포 워크플로 | ✅ 설정 | Pages 활성화됨(build_type=workflow). 배포 성공 여부는 `gh run list` 로 확인 |
| 유저 배포 문서 | ⏳ 예정 | `docs/공지글-모음.md` |
| 준비물 문서 | ✅ 작성 | `docs/PREP.md` |
| 테스트 | ✅ 5개 통과 | `tests/determinism.test.ts` |

## 핵심 설계 결정 (바꾸려면 설계서도 같이 수정)

1. **렌더러는 Phaser 대신 Canvas 2D 자체 구현.** 의존성 0, 프리뷰와 본편이 같은 렌더러를 쓴다. (설계서 초안의 Phaser 항목은 폐기)
2. **`src/core/` 는 결정론.** `Math.sin/cos/atan2/random`, `Date.now` 금지. 삼각함수는 `fixedmath.ts` 테이블, 난수는 `rng.ts`. 렌더/DOM import 금지.
3. **봇도 core 안에 있고 결정론적.** 봇은 `Input` 을 만들어 sim 에 넣는 입력 생성기일 뿐이다. 같은 시드면 같은 경기.
4. **모드는 두 가지.** 혼자 하기(봇 난이도 3단계), 1:1 대전(방 만들기 / 방 참가, 목표 킬 수 설정). 탈출 모드는 하지 않는다.
5. **죽으면 3초 뒤 상대에게서 먼 스폰 지점 상위 3곳 중 무작위 리스폰.** 스폰 보호 1.5초.
6. **캐릭터 이름은 패러디 명칭** (침착덕·주펄덕·철면덕·매직덕). 비상업 팬게임 고지 유지.
7. **캐릭터 외형은 실제 멤버를 이모지화한 캐리커처** (사용자 지시, 2026-09-03). 오리가 아니다. 외형은 `characters.ts` 의 `look` 데이터로만 정의하고 `render/character.ts` 가 그린다. 새 멤버 추가 = `look` 한 줄 추가. 확인은 `preview.html?sheet=1`.
8. **주인공은 철면수심.** 노출 우선순위 철면수심 > 침착맨 > 단군 > 매직박 > 주펄 (`prominence`). 로비 기본 선택·프리뷰 P1·시트 순서·카드 크기에 반영한다. 외형 근거(2026-09-03 사용자 지정): 철면수심 = 공식 마스코트(철면수심 쇼핑몰 로고, 빨간 얼굴·삐죽 머리·별), 침착맨 = 유튜브 배너 캐릭터(자주색 "침착" 모자·콧수염), 단군 = 사용자가 준 무대 사진(물방울 재킷·파란 선글라스·마이크), 매직박 = 대두 강조 + 최고 체력, 주펄 = 승인됨. 참고 이미지는 저작권 때문에 저장소에 넣지 않는다.
9. **쿼터뷰는 2D 투영으로.** `render/canvas.ts` 의 `PITCH` 상수(0.72)가 카메라 기울기. 월드 좌표는 그대로, 그릴 때만 y × PITCH, 높이는 -z. 3D 엔진·유료 서비스 사용 금지(사용자 조건).

## 코드 지도

```
src/core/fixedmath.ts   sin/cos 테이블(1024단계), atan2A, angleDiff
src/core/rng.ts         mulberry32
src/core/input.ts       Input {mx,my,aim,buttons}, 5바이트 직렬화
src/core/map.ts         문자 그리드 맵 "스튜디오" 40x30, 스폰 지점, DDA 레이캐스트
src/core/physics.ts     원-타일 충돌(축 분리), 선분-원 판정
src/core/weapons.ts     무기 5종 테이블, 부위 확률
src/core/characters.ts  캐릭터 4종 (스탯·패시브·색·액세서리)
src/core/state.ts       GameState/PlayerState/Bullet/SimEvent 타입, 상수
src/core/sim.ts         createState / step / snapshot / hashState
src/core/bot.ts         makeBot / botInput (난이도 테이블 DIFFS)
src/render/canvas.ts    Renderer: onEvents(이펙트 생성) + draw(prev,curr,alpha,dt,opts)
src/preview.ts          프리뷰 루프 (봇 vs 봇, 슬로모션, 타이틀 카드, 레터박스)
```

## 작업 규칙

- 커밋은 기능 단위로 자주. 커밋 전 `npm run build` 통과 확인.
- 커밋마다 `CHANGELOG.md` 에 한 줄 이상, 이 문서의 "현재 상태"와 "다음 할 일" 갱신.
- 설계 변경은 `docs/DESIGN.md` 에도 반영.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## 다음 할 일 (우선순위 순) — 결정은 끝났고 3D 전환·P2P 검증까지 완료. 아래는 남은 것.

- [ ] 사용자: 다른 네트워크의 두 PC 로 실제 대전 (NAT 통과 확인). 실패하면 `docs/PREP.md` C 항목(TURN).
- [ ] 캐릭터 3D 다듬기: 팔·총 위치 미세 조정, 걷기 애니 자연스럽게, 사망 연출, 피격 흔들림. 얼굴 텍스처 해상도.
- [ ] 이펙트·사운드: 효과음(무기·피격·리스폰), 총구 화염 스프라이트, 탄피, 바닥 데칼. 사운드 파일은 사용자가 `public/sfx/` 에 넣어 주기로(PREP B).
- [ ] 프리뷰 타이틀 카드에 3D 캐릭터 회전 연출, 카메라 컷 다양화.
- [ ] 봇: 마당 맵에서의 경로·교전 거리 튜닝(상자 엄폐 활용).
- [ ] 로비: 닉네임 입력(선택), 방 목록에 핑 표시, 새로고침 없이 재접속.
- [ ] 문서: `docs/DESIGN.md` 를 3D 기준으로 정리(현재는 v0.2 요약 + 초안), `docs/공지글-모음.md` 출시 문안 확정, 설계서 아티팩트 갱신.
- [ ] 나머지 멤버 7명 (게임 완성 후).

(이전 목록 — 참고용)

0. **docs/DECISIONS.md 의 10개 결정을 사용자에게 받는다.** 받으면 그 답을 이 문서 "핵심 설계 결정"에 옮겨 적는다.
1. (결정 B라면) Three.js 렌더러: `src/render3d/` 신설, 카메라·월드·치비 캐릭터(얼굴 텍스처)·이펙트. 프리뷰를 3D 로 먼저 만들어 캡처 가능 상태로 → 커밋·푸시 → 검토 요청.
2. `index.html` + `src/main.ts`: 로비 UI(혼자 하기 / 방 만들기 / 방 참가), 키보드·마우스 입력, 혼자 하기 모드 완성.
3. `src/net/`: Trystero 방 생성/참가, 락스텝, 해시 검증, 리싱크.
4. 첫 배포 성공 확인 (`gh run list --repo goormigrm/bedorage-duck`), https://goormigrm.github.io/bedorage-duck/preview.html 접속 확인.
5. `docs/공지글-모음.md`, 설계서 갱신(탈출 모드 삭제, AI 모드 추가, Canvas 렌더러, 방 흐름).

## 알려진 이슈 / 주의

- OneDrive 폴더 안에서 git 을 쓴다. 동기화 충돌이 나면 `.git` 이 깨질 수 있으니 커밋 직후 push 를 습관화.
- 브라우저 탭이 백그라운드면 rAF 가 멈춘다. 대전 중에는 탭을 앞에 둬야 한다.
