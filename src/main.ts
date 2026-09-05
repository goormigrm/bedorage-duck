// 게임 본편 진입점. 로비 ↔ 게임 세션 전환.

import { Session, SessionConfig } from './game/session'
import { setFavicon } from './ui/favicon'
import { Lobby } from './ui/lobby'

const app = document.getElementById('app')!
let lobby: Lobby | null = null
let session: Session | null = null

function showLobby(): void {
  session?.dispose()
  session = null
  // 게임에서 돌아왔으면 주소의 #room= 을 지운다. 남겨 두면 로비가 초대 링크로 알고 이전 방에 다시 들어가
  // "방 상태" 가 보여서 헷갈린다(2026-09-05 제보). 로비에 오면 방 목록부터.
  if (session === null && location.hash.startsWith('#room=')) history.replaceState(null, '', location.pathname + location.search)
  app.innerHTML = ''
  document.body.style.cursor = ''
  lobby = new Lobby(app, {
    onStart: (cfg: Omit<SessionConfig, 'onExit'>) => {
      lobby?.dispose()
      lobby = null
      app.innerHTML = ''
      session = new Session(app, { ...cfg, onExit: showLobby })
      // 스크린샷·GIF 를 뜰 때(?shot=1)만 세션을 밖에 내놓는다 — 장면 연출용(자리 옮기기, 조준점 계산). 평소엔 없다
      if (location.search.includes('shot=1')) (window as unknown as { __session: Session }).__session = session
    },
  })
}

setFavicon()
showLobby()
