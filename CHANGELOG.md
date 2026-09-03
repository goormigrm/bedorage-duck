# CHANGELOG

새것이 위. 날짜 · 커밋 단위. 인수인계 요약은 [HANDOVER.md](HANDOVER.md).

## 2026-09-03

### 코어 · 렌더러 · 프리뷰 골격
- Vite + TypeScript 스캐폴드, GitHub Pages 배포 워크플로(`.github/workflows/deploy.yml`).
- 결정론 시뮬레이션 `src/core/`: 고정 60Hz 틱, 이동·대시·사격·투사체·부위 피해·리스폰·목표 킬 승리.
- 봇 AI `src/core/bot.ts`: 쉬움/보통/어려움, BFS 경로 탐색, 리드샷, 회피 대시, 끼임 탈출.
- Canvas 2D 렌더러 `src/render/canvas.ts`: 3/4 시점 벽, 말랑 스프링 스케일, 탄·머즐·파티클·깃털, HUD(점수판·플레이어 카드·카운트다운·킬 배너·승리 화면), 시네마틱 카메라.
- 프리뷰 페이지 `preview.html` 골격.
- 설계 결정 변경: Phaser → Canvas 2D 자체 렌더러. 탈출 모드 제외, 혼자 하기(봇) 모드 추가.
- 문서: `HANDOVER.md`, `CHANGELOG.md` 시작.
