# 배도라지 덕 (Bedorage Duck)

배도라지 크루를 둥글둥글한 치비 캐릭터로 만든 **2~4인 쿼터뷰 슈터**(개인전 · 2v2 팀전). 서버 없이 WebRTC P2P 로 대전하고, 봇 1~3명과 혼자 할 수도 있다.
덕코프식 시야 제한(벽 뒤·시야 밖의 적은 안 보임), 대각선 카메라, 인원에 따라 4배까지 넓어지는 맵, 리스폰 중 Tab 캐릭터 교체.
Three.js 3D · TypeScript · Vite · GitHub Pages. 비공식 팬 프로젝트, 비상업.

- 플레이: https://goormigrm.github.io/bedorage-duck/
- 프리뷰(트레일러 캡처용, 봇 대 봇): https://goormigrm.github.io/bedorage-duck/preview.html
- 저장소: https://github.com/goormigrm/bedorage-duck

## 다른 PC 에서 시작하기

필요한 것: **Node.js 20 이상**(24 권장), **git**, 푸시하려면 **GitHub 로그인**(gh CLI 또는 git 자격증명).

```bash
git clone https://github.com/goormigrm/bedorage-duck.git
cd bedorage-duck
npm install
npm run dev
```

- 브라우저에서 http://localhost:5173/bedorage-duck/ (프리뷰는 `/bedorage-duck/preview.html`)
- 커밋 작성자 설정은 저장소마다 다시 해야 한다:

```bash
git config user.name goormigrm
git config user.email 1117tkdrms@gmail.com
```

- gh CLI 를 쓰면 로그인 한 번으로 push 가 된다: `gh auth login` → 브라우저 인증.

## Claude Code 로 이어서 개발하기

새 세션(어느 PC 든)에서 이 저장소 폴더를 열고 아래 한 줄이면 된다:

> **HANDOVER.md 읽고 이어서 진행해줘**

- [HANDOVER.md](HANDOVER.md) — 현재 상태, 확정된 설계 결정, 다음 할 일, 작업 규칙. **정본.**
- [CHANGELOG.md](CHANGELOG.md) — 커밋 단위 변경 이력.
- [docs/DESIGN.md](docs/DESIGN.md) — 설계서 (v0.3 요약이 본문보다 우선).
- [docs/DECISIONS.md](docs/DECISIONS.md) — 엔진 방향 결정 기록 (답변 완료).
- [docs/PREP.md](docs/PREP.md) — 사용자가 직접 준비할 것 (계정·툴·테스트 환경).
- [docs/공지글-모음.md](docs/공지글-모음.md) — 출시 시 커뮤니티에 올릴 문안.

Claude 의 로컬 메모리는 PC 마다 따로라서 다른 PC 에서는 비어 있다. HANDOVER.md 가 그 역할을 대신하므로 커밋마다 갱신한다.

## 명령

```bash
npm run dev      # 개발 서버 (HMR)
npm test         # vitest — 결정론 테스트
npm run build    # tsc --noEmit + vite build → dist/
npm run preview  # dist/ 미리보기
```

main 에 push 하면 GitHub Actions 가 테스트·빌드 후 GitHub Pages 에 배포한다 (`.github/workflows/deploy.yml`). 상태 확인: `gh run list --repo goormigrm/bedorage-duck --limit 3`.

## 구조

```
src/core/      결정론 시뮬레이션 (이동·사격·부위피해·리스폰), 봇 AI, 맵 레지스트리, 무기표  — 렌더/DOM 금지
src/net/       Trystero 방 목록(로비 방 방송)·게임 방(정원 4, 풀 메시), N인 락스텝 입력 버퍼
src/render/    2D 얼굴 캐리커처(3D 얼굴 텍스처·로비 초상화), HUD 오버레이
src/render3d/  Three.js 렌더러, 카메라(55°/45°), 월드, 둥근 치비 캐릭터, 얼굴 텍스처, 시야 마스크
src/game/      세션 루프(혼자 하기/락스텝 공용), 키보드·마우스 입력, Worker 틱 타이머
src/ui/        로비 (캐릭터·맵 선택, 혼자 하기, 방 만들기, 방 목록/참가, 준비)
src/main.ts    본편 진입점 · src/preview.ts 프리뷰 진입점
tests/         vitest
docs/          설계·결정·준비물·공지 문서
```

핵심 규칙: `src/core/` 는 `Math.random`·삼각함수·시간 함수를 쓰지 않는다 (두 브라우저가 같은 입력으로 같은 결과를 내야 한다). 자세한 것은 HANDOVER.md.

## 조작

WASD 이동(화면 기준) · 마우스 조준 · 좌클릭 사격(꾹 누르면 연사) · 우클릭 정조준 · Space 대시 · R 재장전 · Tab 캐릭터 교체(리스폰 대기·직후 3초) · Esc 메뉴.
프리뷰: H HUD · C 카메라 · M 맵 · 1/2/3 봇 난이도 · R 재시작 · L 레터박스 · F 전체화면 · P 일시정지 · `?n=4` `?teams=1` `?scale=4` `?sheet=1` 캐릭터 시트.

## 고지

비공식 팬 프로젝트이며 배도라지 크루, Escape from Duckov(Team Soda)와 무관하다. 수익화하지 않는다. 문제가 되면 즉시 내린다.
