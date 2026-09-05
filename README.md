# 배도라지 덕 (Bedorage Duck)

배도라지 크루 12명을 둥글둥글한 캐릭터로 만든 **2~4인 쿼터뷰 슈터**. 설치도 가입도 서버도 없이 브라우저에서 바로 합니다.
PC 는 키보드+마우스, 모바일은 가로 화면 터치(조준 자동)로 됩니다. 비공식 팬 프로젝트이며 비상업입니다.

**v1.9.0** (2026-09-05) — 기능 개발 종료. **2026-09-06 오픈 베타** 시작. 캐릭터 밸런스는 플레이어 의견(철면수심 다음 카페 게시글 댓글)을 모아 맞춰 갑니다.

**▶ https://goormigrm.github.io/bedorage-duck/**

- 저장소: https://github.com/goormigrm/bedorage-duck

## 이런 게임입니다

- **덕코프식 시야 제한** — 벽 뒤나 멀리 있는 적은 화면에 아예 안 보입니다.
- **모래주머니 엄폐** — 뒤에 붙으면 내 총알은 넘어가고 상대 총알은 막힙니다. 계속 맞으면 부서집니다.
- **헤드샷은 조준 실력** — 조준선이 상대 한가운데를 지나야 머리(2배)입니다. 확률이 아닙니다.
- **저격총은 조준경으로 맞히면 한 방** — 스치면 체력 10 이 남고, 조준경 없이는 개머리판(가까운 적 10)입니다.
- **구르기 회피** — Space 로 구르는 동안은 무적입니다. 기력을 씁니다.
- **빈 자리는 봇으로** — 친구가 셋이면 대기실에서 봇 하나를 채워 4인으로 합니다(호스트가 봇을 굴립니다).
- **죽은 자리에 힐팩** — 쓰러뜨린 자리를 차지하면 체력을 35% 채우고 이어서 싸울 수 있습니다.
- **맞으면 방향이 보입니다** — 화면 가장자리 호가 쏜 쪽을 가리킵니다. 죽으면 나를 죽인 사람 시점이 나옵니다.
- **결과 통계** — 연속 킬·명중률·헤드샷·주고받은 피해를 판이 끝나면 표로 보여 줍니다.
- **소리로 방향을 압니다** — 총성·발소리가 보이는 방향과 같은 쪽에서 들립니다(헤드폰 권장).
- **캐릭터 12명** — 무기 7종(권총·SMG·소총·산탄총·저격총·기관총·**후라이팬**), 각자 다른 패시브.
- **매 판 새로 생성되는 맵**, 인원이 늘면 최대 4배까지 넓어집니다.
- 혼자 하기(봇 1~3, 난이도 3단계) · 방 대전(최대 4명, 개인전/2v2 팀전). **둘만 모여도 시작**하고 남은 자리는 **게임 중 난입**으로 채웁니다. 끊기면 **방 목록에서 다시 난입**하면 됩니다.
- **팀전은 한 명만 나가도 그 자리에서 끝납니다.** 결과표가 바로 뜨고, 팀전에는 난입도 없습니다.

## 문서

| 문서 | 내용 |
|---|---|
| [docs/플레이-가이드.md](docs/플레이-가이드.md) | **처음 하는 사람에게 그대로 보여 줄 문서** (조작·요령·FAQ) |
| [docs/DESIGN.md](docs/DESIGN.md) | 설계서 v1.9 — 규칙·수치·구조·네트워크·결정론 규칙 전부 |
| [HANDOVER.md](HANDOVER.md) | 개발 인수인계 **정본** — 현재 상태, 다음 할 일, 작업 규칙 |
| [CHANGELOG.md](CHANGELOG.md) | 변경 이력 |
| [docs/공지글-모음.md](docs/공지글-모음.md) | 커뮤니티에 올릴 공지 문안 |
| [docs/PREP.md](docs/PREP.md) | 사용자가 직접 해야 하는 준비물·결정 |
| [docs/DECISIONS.md](docs/DECISIONS.md) | 엔진 선택 기록 (2026-09-03, 보관용) |
| [docs/노트북-설정.md](docs/노트북-설정.md) | 두 번째 PC 설정 메모 |

## 조작

`WASD` 이동(화면 기준) · `마우스` 조준 · `좌클릭` 사격(꾹 = 연사) · `우클릭` 정조준(저격총은 조준경) · `Space` 구르기 · `Shift` 달리기(기력 소모) · `R` 재장전 · `Tab` 캐릭터 교체(리스폰 대기·직후 3초) · `V` 팀 신호 · `1`·`2`·`3` 감정 표현(ㅋㅋ · 굿 · 미안) · `N` 소리 · `Esc` 메뉴

모바일은 **가로 화면 전용**입니다. 왼쪽 = 이동 스틱, 오른쪽 = 누르면 사격(사격 버튼도 같음), **조준은 자동**(보이는 적 쪽으로 각속도 제한하며 회전), 오른쪽에 조준·구르기·재장전·교체·**달리기(켜고 끄기)** 버튼. 자동 조준은 일부러 조금 흔들리고, 조준선이 지금 겨누는 곳에 그려집니다. PC 에서 시험하려면 주소 뒤에 `?touch=1`.


## 개발

필요한 것: **Node.js 20 이상**(24 권장), **git**. 푸시하려면 GitHub 로그인(`gh auth login`).

```bash
git clone https://github.com/goormigrm/bedorage-duck.git
cd bedorage-duck
npm install
npm run dev     # http://localhost:5173/bedorage-duck/
```

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 개발 서버 (HMR) |
| `npm test` | vitest — 결정론·카메라·성능·밸런스 |
| `npm run build` | `tsc --noEmit` + vite build → `dist/` |
| `npx vite-node tools/balance.ts` | 봇 1:1 전 조합 밸런스 계측 (`ffa` 붙이면 4인) |

`main` 에 push 하면 GitHub Actions 가 테스트·빌드 후 GitHub Pages 로 배포합니다.
커밋 작성자는 저장소마다 설정해야 합니다: `git config user.name goormigrm` / `git config user.email 1117tkdrms@gmail.com`

### Claude Code 로 이어서 개발하기

저장소 폴더를 열고 **"HANDOVER.md 읽고 이어서 진행해줘"** 한 줄이면 됩니다. Claude 의 로컬 메모리는 PC 마다 다르므로 HANDOVER.md 가 정본입니다.

### 구조

```
src/core/     결정론 시뮬레이션 (sim·bot·map·weapons·characters) — 렌더/DOM 금지
src/net/      Trystero 로비·방, N인 락스텝
src/game/     세션 루프, 입력, Worker 틱 타이머
src/render/   2D 캐리커처, HUD, 미니맵
src/render3d/ Three.js 렌더러, 카메라, 캐릭터, 시야
src/audio/    효과음·배경음 (Web Audio 절차 생성)
src/ui/       로비
tools/        밸런스 계측
tests/        vitest
```

**핵심 규칙**: `src/core/` 에서는 `Math.random`·삼각함수·시간 함수를 쓰지 않습니다. 두 브라우저가 같은 입력으로 같은 결과를 내야 하기 때문입니다. 자세한 것은 [docs/DESIGN.md](docs/DESIGN.md) 10장.

## 만든 것

Three.js · TypeScript · Vite · Trystero(WebRTC) · GitHub Pages. 그래픽·소리는 전부 코드로 생성했고 외부 에셋을 쓰지 않았습니다.

**비용 원칙**: 카드 등록이 필요한 서비스는 무료 티어라도 쓰지 않습니다(TURN 배제). GitHub Pages·Google Fonts·공개 릴레이·무료 STUN·Cloudflare Workers 무료 플랜만 씁니다.

## 고지

비공식 팬 프로젝트이며 배도라지 크루, Escape from Duckov(Team Soda)와 무관합니다. 수익화하지 않습니다. 실명 대신 패러디 명칭을 씁니다. 문제가 되면 즉시 내립니다.

문의·제보는 **철면수심 다음 카페 게시글 댓글**로 받습니다(GitHub Issues 는 받지 않습니다).
