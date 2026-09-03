# CHANGELOG

새것이 위. 날짜 · 커밋 단위. 인수인계 요약은 [HANDOVER.md](HANDOVER.md).

## 2026-09-03

### 캐릭터를 실제 멤버 이모지풍 캐리커처로 전면 교체
- `src/render/character.ts` 신설: 머리(피부·머리카락·눈썹·눈·코·입·수염·안경·귀)와 몸(셔츠·가운·바지·신발)을 데이터(`Look`)로 그린다.
- `src/core/characters.ts` 에 `look` 필드 추가. 침착덕(짧은 검은 머리·무표정·옅은 수염·회색 티), 주펄덕(삭발·실눈·두툼한 입술·콧수염+턱수염·곤색 티), 철면덕(스포츠머리·두꺼운 눈썹·턱수염·검은 옷·큰 덩치), 매직덕(큰 머리·사각 안경·웃는 얼굴·흰 가운+파란 셔츠).
- 얼굴이 조준 방향을 따라 3/4 시점으로 돌아간다. 오리 드로잉 코드 삭제.
- 프리뷰 `?sheet=1` 캐릭터 시트 모드 추가 (정면·측면 크게).

### 프리뷰 동작 확인 · 배포 수정
- 물리: 원-타일 충돌을 모서리 법선 슬라이딩으로 교체. 봇이 벽 모서리에 걸려 영원히 멈추던 버그 수정.
- 프리뷰: 타이틀 카드 동안 sim 정지·HUD 숨김. 시네마틱 줌 1.25~1.9, 둘이 멀면 P1 추적.
- 테스트: `tests/determinism.test.ts` (해시 일치, 시드 분기, 스냅샷, 경기 종료, atan2A 근사).
- 배포: `package-lock.json` 재생성(npm ci 실패 원인: phaser 제거 후 lock 불일치), setup-node 24, `.gitattributes`(LF).
- GitHub Pages 를 API 로 활성화(`build_type=workflow`).
- 문서: `docs/PREP.md` (사용자가 직접 준비할 것 체크리스트).

### 코어 · 렌더러 · 프리뷰 골격
- Vite + TypeScript 스캐폴드, GitHub Pages 배포 워크플로(`.github/workflows/deploy.yml`).
- 결정론 시뮬레이션 `src/core/`: 고정 60Hz 틱, 이동·대시·사격·투사체·부위 피해·리스폰·목표 킬 승리.
- 봇 AI `src/core/bot.ts`: 쉬움/보통/어려움, BFS 경로 탐색, 리드샷, 회피 대시, 끼임 탈출.
- Canvas 2D 렌더러 `src/render/canvas.ts`: 3/4 시점 벽, 말랑 스프링 스케일, 탄·머즐·파티클·깃털, HUD(점수판·플레이어 카드·카운트다운·킬 배너·승리 화면), 시네마틱 카메라.
- 프리뷰 페이지 `preview.html` 골격.
- 설계 결정 변경: Phaser → Canvas 2D 자체 렌더러. 탈출 모드 제외, 혼자 하기(봇) 모드 추가.
- 문서: `HANDOVER.md`, `CHANGELOG.md` 시작.
