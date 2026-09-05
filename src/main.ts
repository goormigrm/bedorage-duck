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
  app.innerHTML = ''
  document.body.style.cursor = ''
  lobby = new Lobby(app, {
    onStart: (cfg: Omit<SessionConfig, 'onExit'>) => {
      lobby?.dispose()
      lobby = null
      app.innerHTML = ''
      session = new Session(app, { ...cfg, onExit: showLobby })
    },
  })
}

setFavicon()
showLobby()
