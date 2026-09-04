# 준비물 · 권한 체크리스트 (사용자가 직접 할 일)

> 개발은 Claude 세션이 진행하고, 아래 항목은 계정 권한이나 로컬 설치가 필요해 사용자가 직접 해야 하는 것들이다.
> 하나씩 끝내면 체크박스를 채우고 커밋해 두면 다음 세션이 상태를 안다.
> 작성일 2026-09-03

## A. 지금 당장 필요한 것 (없으면 배포·대전이 안 됨)

- [x] **GitHub 저장소** `goormigrm/bedorage-duck` 생성 — 완료.
- [x] **gh CLI 로그인** (`gh auth status` 에서 goormigrm 확인) — 완료. 커밋·푸시·Pages 설정에 사용.
- [x] **GitHub Pages 활성화** — API 로 `build_type=workflow` 설정 완료. 확인: 저장소 Settings → Pages → Source 가 "GitHub Actions" 인지.
- [x] **첫 배포 확인** — 2026-09-03 성공 (Actions 초록, Pages 200). 이후 커밋마다 자동 배포.
- [ ] **다른 네트워크 대전 검증** — 2026-09-04 기준 같은 PC 탭 3개로 3인 대전은 확인. 다른 네트워크의 PC 2~4대로 실제 대전은 아직. 다음 중 하나:
  - 다른 PC 또는 노트북 (같은 Wi-Fi 말고 **다른 네트워크**가 이상적)
  - 폰 핫스팟에 연결한 PC (NAT 통과 실패 케이스 재현)
  - 최소한: 같은 PC 에서 브라우저 두 개 (Chrome + Edge, 또는 시크릿 창). 같은 PC 면 항상 연결되므로 NAT 문제는 못 잡는다.

## B. 곧 필요한 것 (캐릭터·사운드 작업 시작 전)

- [ ] **픽셀아트 도구** (선택). 현재 캐릭터는 코드로 그린 벡터 오리다. 손그림 스프라이트로 바꾸려면:
  - Aseprite ($19.99, Steam/공식) 또는 무료 LibreSprite / Piskel(웹)
  - 없으면 코드 벡터 캐릭터로 계속 간다. 지금도 캡처 가능한 수준.
- [ ] **효과음·음악 소스 결정**. 무료 후보: Kenney.nl (CC0 사운드 팩), freesound.org (라이선스 확인), OpenGameArt (CC0 BGM). 다운로드해서 `public/sfx/` 에 넣어 주면 연결한다. 파일명은 알려 주기만 하면 된다.
- [ ] **폰트 라이선스 확인**. Black Han Sans, IBM Plex Sans KR, IBM Plex Mono 는 모두 OFL (자유 사용). Google Fonts 에서 로드하므로 별도 준비 불필요.

## C. P2P 연결 품질을 올리고 싶을 때 (선택)

- [ ] **TURN 서버**. STUN 만으로 연결 실패(대칭 NAT, 회사망, LTE)가 잦으면 필요.
  - 가장 쉬운 것: [metered.ca Open Relay](https://www.metered.ca/tools/openrelay/) 무료 계정 → 자격증명(username/credential)을 받아 이 세션에 전달. 정적 사이트에 넣어도 되는 공개용 자격증명이다.
  - Cloudflare Realtime TURN 은 토큰 발급 서버가 필요해 "서버 없음" 원칙과 충돌. 후순위.
- [ ] **시그널링 릴레이 상태 확인**. Trystero 는 공개 Nostr 릴레이를 쓴다. 회사/학교망에서 WebSocket 이 막히면 시그널링부터 실패한다. 이 경우 `#room=` 링크 대신 수동 복붙 모드를 쓴다(구현 예정).

## D. 공개 전에 결정할 것

- [ ] **캐릭터 표기.** 현재 패러디 명칭(침착덕·주펄덕·철면덕·매직덕) + 작은 글씨로 원본 활동명. 원본 활동명을 크게 쓰려면 멤버 측 확인을 권장.
- [ ] **고지 문구 확정.** 로비 하단 "비공식 팬 프로젝트 · 비상업 · 문의 시 즉시 삭제". 연락 수단(이메일 또는 GitHub Issues)을 어디로 할지.
- [ ] **저장소 공개 여부.** GitHub Pages 무료 사용 조건상 공개 저장소여야 한다. 현재 공개.
- [ ] **공지글 배포 채널.** `docs/공지글-모음.md` 의 문안을 어느 커뮤니티/방송에 올릴지.

## E. 로컬 환경 (확인됨)

| 항목 | 상태 |
|---|---|
| Node.js | v24.19.0 ✅ |
| npm | 11.17.0 ✅ |
| git | 2.55.0 ✅ (`user.name goormigrm`, 이메일은 저장소 로컬 설정) |
| gh CLI | 2.97.0, goormigrm 로그인 ✅ |
| 작업 폴더 | `C:\Users\tkdrm\OneDrive\Desktop\철FPS` — OneDrive 동기화 폴더. `.git` 충돌 방지를 위해 커밋 직후 푸시 습관 |

## E-2. 노트북 (BOOK-K87ADP9N6K, 2026-09-04 설정 완료)

| 항목 | 상태 |
|---|---|
| Node.js | v24.19.0 ✅ (winget, Claude 가 설치) |
| npm | 11.17.0 ✅ — PowerShell 에서 `npm` 이 실행 정책에 막히면 `npm.cmd` 또는 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| git | 2.42.0 ✅ (저장소 로컬 작성자 설정 완료) |
| gh CLI | 2.100.0 ✅ goormigrm 로그인 완료 |
| 작업 폴더 | `C:\Users\tkdrm\OneDrive\바탕 화면\철FPS\bedorage-duck` (하위 폴더). 자세한 것은 `docs/노트북-설정.md` |

## F-1. 다른 PC(노트북)에서 작업할 때 준비할 것

- [x] Node.js 20 이상 설치 — 노트북 완료 (24.19.0)
- [x] git 설치, 저장소 로컬 작성자 설정 — 완료
- [x] GitHub CLI 설치 후 `gh auth login` — 완료
- [x] `git clone` → `npm install` → `npm run dev` 로 로컬 실행 확인 — 완료
- [x] Claude Code 설치·로그인. 프로젝트 폴더에서 열고 "HANDOVER.md 읽고 이어서 진행해줘" — 완료
- [ ] 두 PC 를 오갈 때 규칙: 시작은 `git pull`, 끝은 커밋·푸시. 메인 PC(OneDrive) 는 돌아온 뒤 `git pull` 먼저.

## F. 세션이 끊겼을 때 이어가는 법

1. 새 Claude Code 세션을 같은 폴더에서 연다.
2. "HANDOVER.md 읽고 이어서 진행해줘" 라고만 하면 된다. 현재 상태·다음 할 일·규칙이 모두 그 문서에 있다.
3. 로컬에 커밋 안 된 변경이 있으면 `git status` 로 확인하고, 먼저 커밋·푸시하게 한다.
