// 게임 본편 진입점. 로비 → 게임. (프리뷰는 preview.ts)
// 현재: 로비 골격. 혼자 하기 / 방 만들기 / 방 참가는 순차 구현 중.

const app = document.getElementById('app')!
app.innerHTML = `
  <div class="lobby">
    <h1>배도라지 <span>덕</span></h1>
    <p class="tag"><b>1:1 쿼터뷰 슈터</b> · 서버 없는 P2P 대전 · 비공식 팬게임</p>
    <div class="modes">
      <div class="mode">
        <h2>프리뷰 <span class="k">PREVIEW</span></h2>
        <p>봇 대 봇 자동 플레이. 트레일러·플레이 영상 캡처용 화면입니다.</p>
        <div class="row"><a class="btn" href="./preview.html">프리뷰 열기</a></div>
      </div>
      <div class="mode">
        <h2>혼자 하기</h2>
        <p>AI 난이도 3단계. 준비 중입니다.</p>
        <div class="row"><button class="btn" disabled>준비 중</button></div>
      </div>
      <div class="mode">
        <h2>1:1 대전</h2>
        <p>방 만들기 / 방 코드로 참가. 준비 중입니다.</p>
        <div class="row"><button class="btn" disabled>준비 중</button></div>
      </div>
    </div>
    <div class="foot">비공식 팬 프로젝트 · 비상업 · 문의 시 즉시 삭제 · <a href="https://github.com/goormigrm/bedorage-duck">github.com/goormigrm/bedorage-duck</a></div>
  </div>
`
