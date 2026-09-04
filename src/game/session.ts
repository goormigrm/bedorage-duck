// 게임 세션: 혼자 하기(봇) 와 대전(락스텝) 을 같은 루프로 돌린다. 렌더는 Three.js. 인원 2~4명.
// 대전: 플레이어 0 = 호스트. 호스트가 해시 비교·리싱크·이탈자 드롭 틱을 정한다.

import { BotMemory, Difficulty, DIFFICULTY_LABEL, botInput, makeBot } from '../core/bot'
import { CHARACTERS, CHARACTER_LIST, CharacterId, displayNames } from '../core/characters'
import { Input } from '../core/input'
import { buildMap } from '../core/map'
import { DEFAULT_MAP, MapId, MapScale, scaleForPlayers } from '../core/maps'
import { createState, dropPlayer, hashState, joinPlayer, snapshot, step, syncSandbags } from '../core/sim'
import { angleToRad } from '../core/fixedmath'
import { GameState, TICK_MS, isTeamMatch } from '../core/state'
import { WEAPONS } from '../core/weapons'
import { drawPortrait } from '../render/character'
import { Lockstep } from '../net/lockstep'
import { CtlMessage, LobbyLink, RoomLink } from '../net/room'
import { TEAM_NAMES, VIEW_H, VIEW_W, setViewAspect } from '../render/hud'
import { worldDirToScreen } from '../render3d/camera'
import { Renderer3D } from '../render3d/renderer3d'
import { Sfx } from '../audio/sfx'
import { LocalInput } from './localInput'
import { saveRecord } from './records'
import { TouchControls, enterLandscape, isTouchDevice } from './touch'
import { Ticker } from './ticker'

export interface SessionConfig {
  mode: 'solo' | 'p2p'
  /** 인원 = 길이. 인덱스가 플레이어 번호 */
  chars: CharacterId[]
  /** 팀 배정 (없으면 개인전) */
  teams?: number[]
  targetKills: number
  seed: number
  localPlayer: number
  mapId?: MapId
  /** 맵 확장 배율. 생략하면 인원수로 정한다 */
  mapScale?: MapScale
  difficulty?: Difficulty
  link?: RoomLink
  delay?: number
  /** 대전: 플레이어 인덱스 순 피어 id (내 것 포함) */
  peerIds?: string[]
  /** 닉네임 (인덱스 순, 빈 문자열이면 캐릭터 이름) */
  names?: string[]
  /** 아직 아무도 없는 자리 (난입으로 채워진다) */
  absent?: boolean[]
  /**
   * 호스트만: 로비 방송 통로. **게임 중에도 방을 계속 알려야** 남들이 난입할 수 있다.
   * 세션이 끝나면 세션이 정리한다.
   */
  lobby?: LobbyLink
  /** 방 정보 (난입 안내용) */
  roomInfo?: { map: string; mode: string; targetKills: number; size: number }
  /** 재접속: 호스트가 보내 준 그 시점의 판. 있으면 처음부터가 아니라 여기서 이어서 시작한다 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resumeState?: any
  resumeTick?: number
  onExit: () => void
}

interface PendingDrop {
  p: number
  tick: number
}

export class Session {
  private map
  private state: GameState
  private prev: GameState
  private renderer: Renderer3D
  private input = new LocalInput()
  private touch: TouchControls | null = null
  private sfx = new Sfx()
  private bots: BotMemory[] = []
  private lockstep: Lockstep | null = null
  private peerIndex = new Map<string, number>()
  private pendingDrops: PendingDrop[] = []
  private dropped = new Set<number>()
  private acc = 0
  private last = performance.now()
  private raf = 0
  private root: HTMLElement
  private stage: HTMLElement
  private overlay: HTMLElement
  private paused = false
  private stallSince = -1
  private message = ''
  private disposed = false
  private hashes = new Map<number, number>()
  private names: string[]
  private pickerOpen = false
  /** 죽어서 기다리는 동안 보고 있는 사람. -1 = 내 시점 */
  private spectate = -1
  /** 나간 사람의 자리를 없애기까지 (짧게 — 자리가 비어야 남들이 난입할 수 있다) */
  private static readonly DROP_DELAY_TICKS = 60 * 3
  /** 혼자 남은 뒤 방을 닫기까지 기다리는 시간 */
  private static readonly ALONE_GRACE_TICKS = 60 * 30
  /** 혼자 남기 시작한 틱 (-1 = 혼자가 아니다) */
  private aloneSince = -1
  /** 호스트만: 돌아오기로 한 사람 (틱이 되면 상태를 보낸다) */
  private pendingRejoin: { peerId: string; p: number; tick: number } | null = null
  /** 정해진 틱에 자리를 채울 사람들 (난입) */
  private pendingJoins: { p: number; tick: number; char: CharacterId; team: number; name: string }[] = []
  private syncMute: () => void = () => {}
  private ticker: Ticker
  private lastTick = performance.now()
  private lobbyBeacon = 0

  constructor(
    host: HTMLElement,
    private cfg: SessionConfig,
  ) {
    this.map = buildMap(cfg.mapId ?? DEFAULT_MAP, cfg.mapScale ?? scaleForPlayers(cfg.chars.length), cfg.seed)
    this.state = createState(
      { seed: cfg.seed, targetKills: cfg.targetKills, chars: cfg.chars, teams: cfg.teams, absent: cfg.absent },
      this.map,
    )
    // 재접속: 호스트가 보내 준 판으로 갈아 끼운다. 맵의 모래주머니 상태도 그때로 맞춘다
    if (cfg.resumeState) {
      this.state = cfg.resumeState as GameState
      this.state.events = []
      syncSandbags(this.state, this.map)
      // 아무도 없는 자리(나갔거나 아직 안 온 자리)는 입력을 기다리면 안 된다.
      // 이걸 빠뜨려 난입한 사람이 빈 자리 입력을 기다리다 멈추고, 그 사람이 멈추니
      // 락스텝 특성상 방 전체가 함께 멈췄다(2026-09-06 제보).
      this.state.players.forEach((p, i) => {
        if (p.left && i !== cfg.localPlayer) this.dropped.add(i)
      })
    }
    // 아직 아무도 없는 자리도 같은 취급 (다시 하기로 판을 새로 짜도 유지된다)
    cfg.absent?.forEach((a, i) => {
      if (a && i !== cfg.localPlayer) this.dropped.add(i)
    })
    this.prev = snapshot(this.state)
    this.makeBots(cfg.seed)

    host.innerHTML = `
      <div class="game-root">
        <div class="game-stage" id="stage">
          <div class="game-ui">
            <div class="top-right"><button class="btn secondary" id="btn-mute">소리</button><button class="btn secondary" id="btn-lobby">로비로</button></div>
            <div class="keys"><b>WASD</b> 이동 · <b>마우스</b> 조준 · <b>좌클릭</b> 사격 · <b>우클릭</b> 정조준 · <b>Space</b> 대시 · <b>R</b> 재장전 · <b>Tab</b> 캐릭터 교체(리스폰 대기·3초) · <b>V</b> 팀 신호 · <b>N</b> 소리 · <b>Esc</b> 메뉴</div>
            <div class="overlay" id="overlay" hidden><div class="box" id="overlay-box"></div></div>
          </div>
        </div>
      </div>`
    this.root = host.querySelector('.game-root') as HTMLElement
    this.stage = host.querySelector('#stage') as HTMLElement
    this.overlay = host.querySelector('#overlay') as HTMLElement
    this.renderer = new Renderer3D(this.stage, this.map)
    // 캔버스가 UI 아래에 오도록 UI 를 맨 뒤로
    const ui = this.stage.querySelector('.game-ui') as HTMLElement
    this.stage.appendChild(ui)
    if (isTouchDevice()) {
      this.touch = new TouchControls(this.root)
      this.touch.setMarkVisible(isTeamMatch(this.state))
      this.root.classList.add('touching')
      void enterLandscape()
    }
    this.input.attach(this.stage, this.touch)
    ;(host.querySelector('#btn-lobby') as HTMLButtonElement).onclick = () => this.exit()
    const muteBtn = host.querySelector('#btn-mute') as HTMLButtonElement
    const syncMute = () => (muteBtn.textContent = this.sfx.muted ? '소리 꺼짐' : '소리 켜짐')
    muteBtn.onclick = () => {
      this.sfx.toggle()
      syncMute()
    }
    syncMute()
    this.syncMute = syncMute
    this.sfx.startBgm()

    this.names = this.computeNames()

    if (cfg.mode === 'p2p' && cfg.link) {
      const ids = cfg.peerIds ?? []
      ids.forEach((id, i) => {
        if (id) this.peerIndex.set(id, i)
      })
      this.lockstep = this.newLockstep()
      cfg.link.onCtl((m, from) => this.onCtl(m, from))
      cfg.link.onPeerLeave((id) => this.onPeerGone(id))
    }

    window.addEventListener('keydown', this.onKey)
    window.addEventListener('resize', this.fit)
    this.fit()
    this.startLobbyBeacon()
    this.ticker = new Ticker(() => this.tick())
    this.ticker.start()
    this.raf = requestAnimationFrame(this.frame)
    ;(window as unknown as { __bd?: unknown }).__bd = { tick: () => this.state.tick, phase: () => this.state.phase, state: () => this.state }
  }

  /**
   * 게임 중에도 방을 방송한다(호스트만). 이게 없으면 시작하는 순간 방이 목록에서 사라져
   * 아무도 난입할 수 없다. 자리가 차면 'full', 세션이 끝나면 방송을 멈춘다.
   */
  private startLobbyBeacon(): void {
    const lobby = this.cfg.lobby
    const info = this.cfg.roomInfo
    if (!lobby || !info || !this.isHost) return
    const beat = () => {
      if (this.disposed) return
      const count = this.state.players.filter((p) => !p.left).length
      lobby.announce({
        code: this.cfg.link?.code ?? '',
        hostChar: this.state.players[0].char,
        map: info.map,
        mode: info.mode as never,
        targetKills: info.targetKills,
        count,
        max: info.size,
        state: this.state.phase === 'over' || count >= info.size ? 'full' : 'playing',
      })
    }
    beat()
    this.lobbyBeacon = window.setInterval(beat, 2000)
  }

  /** 표시 이름: 닉네임이 있으면 닉네임, 없으면 캐릭터 이름(중복이면 번호) */
  private computeNames(): string[] {
    const base = displayNames(this.state.players.map((p) => p.char))
    return base.map((n, i) => {
      const nick = this.cfg.names?.[i]?.trim()
      return nick ? nick.slice(0, 8) : n
    })
  }

  private newLockstep(): Lockstep {
    const start = this.cfg.resumeTick ?? 0
    const ls = new Lockstep(
      this.cfg.link!,
      this.cfg.delay ?? 3,
      this.cfg.localPlayer,
      this.peerIndex,
      this.cfg.chars.length,
      start,
    )
    // 이어서 시작하는 경우(난입), 지나간 틱은 빈 입력으로 메워 둔다.
    // **먼저** 해야 한다 — rejoin 은 기다림을 되살리므로 drop 뒤에 부르면 빈 자리를 다시 기다린다.
    if (start > 0) for (let i = 0; i < this.cfg.chars.length; i++) ls.rejoin(i, start)
    // 나간 자리 · 아직 아무도 없는 자리는 입력을 기다리지 않는다 (둘 다 dropped 에 들어 있다)
    for (const d of this.dropped) ls.drop(d)
    return ls
  }

  private makeBots(seed: number): void {
    this.bots = this.cfg.chars.map((_, i) => makeBot((seed ^ 0x9e37) + i * 7919))
  }

  private get isHost(): boolean {
    return this.cfg.mode === 'p2p' && this.cfg.link?.role === 'host'
  }

  private fit = (): void => {
    const w = window.innerWidth
    const h = window.innerHeight
    // 화면 비율에 맞춰 논리 폭을 바꾼다 → 폰 가로에서 좌우 검은 여백이 거의 사라진다
    if (setViewAspect(w / h)) this.renderer.resize()
    this.stage.style.width = `${VIEW_W}px`
    this.stage.style.height = `${VIEW_H}px`
    // flex 로 가운데 두면 화면보다 큰 요소가 한쪽으로 쏠린다(폰에서 오른쪽으로 붙던 원인).
    // 절반씩 되돌리는 translate 로 정확히 가운데에 놓는다.
    const s = Math.min(w / VIEW_W, h / VIEW_H)
    this.stage.style.transform = `translate(-50%, -50%) scale(${s})`
    this.renderer.resize()
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.key === 'n' || e.key === 'N') {
      this.sfx.toggle()
      this.syncMute()
      return
    }
    // 관전 중 대상 바꾸기 (A/D 와 좌우 화살표 둘 다)
    const k = e.key.toLowerCase()
    if (this.spectate >= 0 && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || k === 'a' || k === 'd')) {
      const next = this.nextAlive(e.key === 'ArrowLeft' || k === 'a' ? this.spectate - 2 : this.spectate)
      if (next >= 0) this.spectate = next
      e.preventDefault()
      return
    }
    // 팀 신호 (팀전에서만). 커서가 가리키는 곳에 "여기" 를 찍는다
    if ((e.key === 'v' || e.key === 'V') && isTeamMatch(this.state)) {
      this.sendMark()
      e.preventDefault()
      return
    }
    if (e.key === 'Escape') {
      if (this.state.phase === 'over') return
      if (this.pickerOpen) {
        // 취소 = 지금 캐릭터 그대로
        this.input.pendingChar = CHARACTER_LIST.findIndex((c) => c.id === this.state.players[this.cfg.localPlayer].char) + 1
        e.preventDefault()
        return
      }
      if (this.overlay.hidden) this.showMenu()
      else this.hideOverlay()
      e.preventDefault()
    }
  }

  private showMenu(): void {
    const solo = this.cfg.mode === 'solo'
    if (solo) this.paused = true
    this.showOverlay(
      solo ? '일시정지' : '메뉴',
      solo ? '봇은 기다려 줍니다.' : '대전 중에는 게임이 멈추지 않습니다.',
      [
        // 모바일은 화면 위쪽에 ≡ 하나만 두고 소리·로비로를 이 안에 넣는다
        {
          label: this.sfx.muted ? '소리 켜기' : '소리 끄기',
          primary: false,
          onClick: () => {
            this.sfx.toggle()
            this.syncMute()
            this.showMenu() // 라벨 갱신
          },
        },
        { label: '계속', primary: true, onClick: () => this.hideOverlay() },
        { label: '로비로', primary: false, onClick: () => this.exit() },
      ],
    )
  }

  private showOverlay(
    title: string,
    desc: string,
    buttons: { label: string; primary: boolean; onClick: () => void }[],
    extraHtml = '',
  ): void {
    const box = this.overlay.querySelector('#overlay-box') as HTMLElement
    box.innerHTML = `<h2>${title}</h2><p>${desc}</p>${extraHtml}<div class="row"></div>`
    const row = box.querySelector('.row') as HTMLElement
    for (const b of buttons) {
      const btn = document.createElement('button')
      btn.className = 'btn' + (b.primary ? '' : ' secondary')
      btn.textContent = b.label
      btn.onclick = b.onClick
      row.appendChild(btn)
    }
    this.overlay.hidden = false
    this.touch?.setVisible(false)
  }

  private hideOverlay(): void {
    this.overlay.hidden = true
    this.touch?.setVisible(true)
    if (this.cfg.mode === 'solo' && this.state.phase !== 'over') this.paused = false
  }

  // ---------- 캐릭터 교체 창 ----------
  /** 터치 메뉴 버튼 */
  private pollTouchMenu(): void {
    if (this.touch?.takeMark() && isTeamMatch(this.state)) this.sendMark()
    if (this.touch?.takeMenu()) {
      if (this.overlay.hidden) this.showMenu()
      else this.hideOverlay()
    }
  }

  private showPicker(): void {
    const box = this.overlay.querySelector('#overlay-box') as HTMLElement
    box.classList.add('picker')
    const cur = this.state.players[this.cfg.localPlayer].char
    box.innerHTML = `<h2>캐릭터 교체</h2><p>고르는 동안은 소환되지 않습니다. 고르면 상대에게서 먼 곳에 리스폰. <b>1~9</b> 키 또는 클릭 · <b>Esc</b> 그대로</p><div class="pick-grid"></div>`
    const grid = box.querySelector('.pick-grid') as HTMLElement
    CHARACTER_LIST.forEach((c, i) => {
      const el = document.createElement('button')
      el.className = 'pick' + (c.id === cur ? ' on' : '')
      el.innerHTML = `<canvas></canvas><b>${c.name}</b><small>${WEAPONS[c.weapon].name} · HP ${c.maxHp}<br>${c.passiveName}</small>${i < 9 ? `<span class="key">${i + 1}</span>` : ''}`
      el.onclick = () => (this.input.pendingChar = i + 1)
      grid.appendChild(el)
      const cv = el.querySelector('canvas') as HTMLCanvasElement
      requestAnimationFrame(() => drawPortrait(cv, c))
    })
    this.overlay.hidden = false
    this.pickerOpen = true
    this.input.pickerOpen = true
    this.touch?.setVisible(false)
  }

  private hidePicker(): void {
    const box = this.overlay.querySelector('#overlay-box') as HTMLElement
    box.classList.remove('picker')
    box.innerHTML = ''
    this.overlay.hidden = true
    this.pickerOpen = false
    this.input.pickerOpen = false
    this.touch?.setVisible(true)
  }

  // ---------- 대전: 피어 ----------

  /** 피어가 나갔다 (연결 끊김 또는 leave 메시지) */
  private onPeerGone(id: string): void {
    if (this.disposed) return
    const idx = this.peerIndex.get(id)
    if (idx === undefined || this.dropped.has(idx)) return
    this.dropped.add(idx)
    this.lockstep?.drop(idx)
    if (idx === 0) {
      // 호스트가 나가면 방은 끝
      this.showOverlay('호스트가 나갔습니다', '방이 닫혔습니다.', [{ label: '로비로', primary: true, onClick: () => this.exit() }])
      this.paused = true
      return
    }
    if (this.isHost) {
      // 나가면 곧 자리를 비운다. 비어야 남들이 **난입**으로 들어올 수 있다.
      // (락스텝은 이미 그 사람 입력을 빈 입력으로 채우므로 경기는 멈추지 않는다)
      const tick = this.state.tick + Session.DROP_DELAY_TICKS
      this.pendingDrops.push({ p: idx, tick })
      this.cfg.link?.sendCtl({ t: 'drop', p: idx, tick })
      this.message = `${this.names[idx]} 나감 · 빈 자리는 난입으로 채워집니다`
      setTimeout(() => {
        if (this.message.startsWith(this.names[idx])) this.message = ''
      }, 4000)
    }
  }

  /** step 직후 호출: 정해진 틱에 도달한 이탈을 상태에 반영하고, 혼자 남았는지 본다 */
  private applyDrops(): void {
    if (this.pendingDrops.length === 0) {
      this.checkAlone()
      return
    }
    const t = this.state.tick
    const keep: PendingDrop[] = []
    for (const d of this.pendingDrops) {
      if (d.tick <= t) dropPlayer(this.state, d.p)
      else keep.push(d)
    }
    this.pendingDrops = keep
    this.checkAlone()
  }

  /**
   * 혼자 남았을 때. 바로 끝내지 않고 **30초 기다린다** — 그동안 누가 난입하면 그대로 이어서 한다.
   * 방은 계속 방송되고 있으므로 목록에서 "게임 중 · 난입 가능" 으로 보인다.
   */
  private checkAlone(): void {
    if (this.cfg.mode !== 'p2p' || this.state.phase === 'over') return
    const remaining = this.state.players.filter((p) => !p.left).length
    if (remaining >= 2) {
      if (this.aloneSince >= 0) {
        this.aloneSince = -1
        this.message = ''
      }
      return
    }
    if (this.aloneSince < 0) this.aloneSince = this.state.tick
    const left = Session.ALONE_GRACE_TICKS - (this.state.tick - this.aloneSince)
    if (left > 0) {
      this.message = `혼자 남았습니다 · ${Math.ceil(left / 60)}초 안에 아무도 안 들어오면 방이 닫힙니다`
      return
    }
    if (this.overlay.hidden) {
      this.message = ''
      this.showOverlay('아무도 들어오지 않았습니다', '방을 닫습니다.', [
        { label: '로비로', primary: true, onClick: () => this.exit() },
      ])
      this.paused = true
    }
  }

  private onCtl(m: CtlMessage, from: string): void {
    if (this.disposed) return
    switch (m.t) {
      case 'hash': {
        if (!this.isHost) return
        const mine = this.hashes.get(m.tick)
        if (mine === undefined) return
        if (mine !== m.h) this.cfg.link?.sendCtl({ t: 'resync', tick: this.state.tick, state: snapshot(this.state) }, from)
        break
      }
      case 'resync': {
        if (this.isHost || !this.lockstep || this.peerIndex.get(from) !== 0) return
        const target = this.state.tick
        const snap = m.state as GameState
        this.state = snap
        this.state.events = []
        syncSandbags(this.state, this.map)
        while (this.state.tick < target && this.lockstep.hasAll(this.state.tick)) {
          step(this.state, this.map, this.lockstep.get(this.state.tick))
          this.applyDrops()
        }
        this.prev = snapshot(this.state)
        this.message = '동기화됨'
        setTimeout(() => (this.message = ''), 1200)
        break
      }
      case 'drop': {
        if (this.peerIndex.get(from) !== 0) return
        this.dropped.add(m.p)
        this.lockstep?.drop(m.p)
        this.pendingDrops.push({ p: m.p, tick: m.tick })
        break
      }
      case 'joinAsk': {
        if (!this.isHost) break
        this.onJoinAsk(m.char as CharacterId, m.name, from)
        break
      }
      case 'joinAt': {
        // 난입자의 피어 id 를 모두가 기록한다 (없으면 그 사람 입력을 버려 방 전체가 멈춘다)
        if (m.id) {
          this.peerIndex.set(m.id, m.p)
          if (this.cfg.peerIds) this.cfg.peerIds[m.p] = m.id
        }
        this.pendingJoins.push({ p: m.p, tick: m.tick, char: m.char as CharacterId, team: m.team, name: m.name })
        break
      }
      case 'mark': {
        // 같은 편이 찍은 것만 본다
        const from = this.state.players[m.p]
        const me = this.state.players[this.cfg.localPlayer]
        if (from && me && from.team === me.team && m.p !== this.cfg.localPlayer) {
          this.renderer.addMark(m.x, m.y)
          this.sfx.mark()
        }
        break
      }
      case 'rematch':
        if (this.peerIndex.get(from) === 0) this.restart(m.seed)
        break
      case 'leave':
        this.onPeerGone(from)
        break
      default:
        break
    }
  }

  private restart(seed: number): void {
    // 맵도 시드로 새로 생성한다 (매 판 구조물이 달라진다)
    this.map = buildMap(this.cfg.mapId ?? DEFAULT_MAP, this.cfg.mapScale ?? scaleForPlayers(this.cfg.chars.length), seed)
    this.renderer.setMap(this.map)
    this.state = createState({ seed, targetKills: this.cfg.targetKills, chars: this.cfg.chars, teams: this.cfg.teams }, this.map)
    // 이미 나간 사람은 처음부터 빠진 채로
    for (const d of this.dropped) dropPlayer(this.state, d)
    this.state.events = []
    this.prev = snapshot(this.state)
    this.makeBots(seed)
    this.hashes.clear()
    this.pendingDrops = []
    this.acc = 0
    this.paused = false
    this.hideOverlay()
    if (this.cfg.link) this.lockstep = this.newLockstep()
  }

  /** 시뮬레이션 진행 (워커 타이머가 16ms 마다 호출, 탭이 뒤에 있어도 돈다) */
  private tick(): void {
    if (this.disposed) return
    const now = performance.now()
    const dt = Math.min(0.25, (now - this.lastTick) / 1000)
    this.lastTick = now
    if (this.paused || this.state.phase === 'over') return
    const lp = this.cfg.localPlayer
    const me = this.state.players[lp]
    const n = this.state.players.length
    this.acc += dt * 1000
    let steps = 0
    // 멈췄다 풀리면 밀린 틱을 몰아서 처리한다. 너무 많이 몰면 화면이 튀므로
    // 한 번에 최대 4틱만 따라잡는다(나머지는 다음 호출에서). 렌더 쪽 스무딩과 짝이다.
    while (this.acc >= TICK_MS && steps < 4) {
      const t = this.state.tick
      const localIn = this.input.sample(
        this.renderer,
        me.x,
        me.y,
        // 터치 조작이면 조준을 대신 해 준다 (스틱 두 개는 폰에서 무리)
        this.touch ? { state: this.state, map: this.map, me: this.cfg.localPlayer } : undefined,
      )
      let inputs: Input[]
      if (this.lockstep) {
        this.lockstep.pushLocal(t, localIn)
        if (!this.lockstep.hasAll(t)) {
          if (this.stallSince < 0) this.stallSince = now
          break
        }
        this.stallSince = -1
        inputs = this.lockstep.get(t)
      } else {
        inputs = new Array(n)
        for (let i = 0; i < n; i++) {
          inputs[i] = i === lp ? localIn : botInput(this.state, this.map, i, this.bots[i], this.cfg.difficulty ?? 'normal')
        }
      }
      this.prev = snapshot(this.state)
      step(this.state, this.map, inputs)
      this.applyDrops()
      for (const e of this.state.events) if (e.type === 'swap') this.names = this.computeNames()
      this.renderer.onEvents(this.state.events, this.state, lp, this.names)
      this.sfx.onEvents(this.state.events, this.state, lp)
      if (this.lockstep && this.state.tick % 60 === 0) {
        const h = hashState(this.state)
        this.hashes.set(this.state.tick, h)
        if (this.hashes.size > 10) this.hashes.delete(Math.min(...this.hashes.keys()))
        if (!this.isHost) this.cfg.link?.sendCtl({ t: 'hash', tick: this.state.tick, h }, this.cfg.peerIds?.[0])
        this.lockstep.prune(this.state.tick)
      }
      this.applyJoins()
      if (this.isHost) this.servePendingRejoin()
      for (const e of this.state.events) {
        if (e.type === 'over') this.onOver()
        // 내가 죽으면 나를 죽인 사람을 본다 (자살·이탈이면 살아 있는 아무나)
        else if (e.type === 'death' && e.p === this.cfg.localPlayer) {
          // 개인전이면 나를 죽인 사람, 팀전이면 아군만 (상대 시점은 적 위치를 그대로 알려 준다)
          const teams = isTeamMatch(this.state)
          this.spectate = !teams && e.by !== e.p ? e.by : this.nextAlive(-1)
        } else if (e.type === 'respawn' && e.p === this.cfg.localPlayer) {
          this.spectate = -1
        }
      }
      this.acc -= TICK_MS
      steps++
    }
    if (this.acc > TICK_MS * 8) this.acc = TICK_MS * 8
  }

  private frame = (now: number): void => {
    if (this.disposed) return
    const dt = Math.min(0.1, (now - this.last) / 1000)
    this.last = now
    const lp = this.cfg.localPlayer
    let message = this.message
    if (this.lockstep && this.stallSince >= 0 && now - this.stallSince > 400) message = '상대 입력 대기 중…'
    this.pollTouchMenu()
    // 발소리는 sim 이벤트가 아니라 이동 상태로 낸다(틱마다 이벤트를 만들면 패킷이 무거워진다)
    this.sfx.updateSteps(this.state, lp, dt)
    const alpha = Math.min(1, this.acc / TICK_MS)
    const choosing = this.state.players[lp].choosing && this.state.phase === 'playing'
    if (choosing && !this.pickerOpen) this.showPicker()
    else if (!choosing && this.pickerOpen) this.hidePicker()
    const sub = this.cfg.chars.map((_, i) => this.subLabel(i))
    // 죽어서 기다리는 동안만 남의 시점. 살아 있으면 언제나 내 시점
    const me = this.state.players[lp]
    // 팀전에서 상대는 못 본다. 보던 사람이 죽었으면 다음 아군으로 넘긴다
    if (this.spectate >= 0) {
      const t = this.state.players[this.spectate]
      const teams = isTeamMatch(this.state)
      const okTeam = !teams || t.team === this.state.players[lp].team
      if (!t || !t.alive || t.left || !okTeam) this.spectate = this.nextAlive(this.spectate)
    }
    const spec = !me.alive && !me.choosing && this.spectate >= 0 && this.state.players[this.spectate]?.alive ? this.spectate : -1
    if (spec < 0 && this.spectate >= 0 && me.alive) this.spectate = -1
    this.renderer.draw(this.prev, this.state, alpha, dt, {
      showHud: true,
      localPlayer: lp,
      viewer: spec >= 0 ? spec : undefined,
      spectateLabel:
        spec >= 0
          ? this.spectateCandidates() > 1
            ? `${this.names[spec]} 시점 · ◀ A · D ▶ 로 바꾸기`
            : `${this.names[spec]} 시점`
          : undefined,
      cameraMode: 'follow',
      names: this.names,
      subLabels: sub,
      ping: this.cfg.link ? this.cfg.link.rtt : undefined,
      message,
      cursor: this.aimCursor(),
      touch: this.touch !== null,
    })
    this.raf = requestAnimationFrame(this.frame)
  }

  /** 조준선 화면 좌표. 터치면 화면 중앙에서 조준 방향으로 띄운다 */
  private aimCursor(): { x: number; y: number } {
    if (!this.touch) return this.input.mouse
    const me = this.state.players[this.cfg.localPlayer]
    const r = angleToRad(me.aim)
    const d = worldDirToScreen(Math.cos(r), Math.sin(r))
    const len = Math.hypot(d.x, d.y) || 1
    return { x: VIEW_W / 2 + (d.x / len) * 190, y: VIEW_H / 2 + (d.y / len) * 190 }
  }

  private subLabel(i: number): string {
    const c = CHARACTERS[this.state.players[i].char]
    if (i === this.cfg.localPlayer) return `나 · ${c.basedOn}`
    if (this.cfg.mode === 'solo') return `AI · ${DIFFICULTY_LABEL[this.cfg.difficulty ?? 'normal']}`
    const ally = this.cfg.teams && this.cfg.teams[i] === this.cfg.teams[this.cfg.localPlayer]
    return `${ally ? '아군' : '상대'} · ${c.basedOn}`
  }

  /** 버튼이 여러 개인 분기에서 통계 표를 붙이기 쉽게 */
  private showOverlayWithStats(
    title: string,
    desc: string,
    stats: string,
    buttons: { label: string; primary: boolean; onClick: () => void }[],
  ): void {
    this.showOverlay(title, desc, buttons, stats)
  }

  /**
   * 결과 화면 통계표. 수치는 전부 sim 안에서 센 것이라 모두의 화면에서 같다.
   * 명중률은 **탄 단위**(산탄총 한 발 = 탄 7개)라 무기가 달라도 비교가 된다.
   */
  private statsTable(): string {
    const teams = isTeamMatch(this.state)
    const rows = this.state.players
      .map((p, i) => ({ p, i }))
      .sort((a, b) => b.p.kills - a.p.kills || a.p.deaths - b.p.deaths)
      .map(({ p, i }) => {
        const acc = p.shots > 0 ? Math.round((p.hits / p.shots) * 100) : 0
        const headPct = p.hits > 0 ? Math.round((p.heads / p.hits) * 100) : 0
        const me = i === this.cfg.localPlayer ? ' class="me"' : ''
        const team = teams ? `<td>${TEAM_NAMES[p.team] ?? '?'}</td>` : ''
        return `<tr${me}><td class="nick">${this.names[i]}</td>${team}<td>${CHARACTERS[p.char].name}</td>
          <td class="n">${p.kills}</td><td class="n">${p.deaths}</td><td class="n">${p.bestStreak}</td>
          <td class="n">${acc}%</td><td class="n">${headPct}%</td>
          <td class="n">${Math.round(p.dmgDealt)}</td><td class="n">${Math.round(p.dmgTaken)}</td></tr>`
      })
      .join('')
    return `<div class="stats"><table>
      <thead><tr><th>이름</th>${teams ? '<th>팀</th>' : ''}<th>캐릭터</th><th>킬</th><th>데스</th><th>연속</th><th>명중</th><th>헤드</th><th>준 피해</th><th>받은 피해</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <p class="statsnote">명중률은 탄 단위입니다 (산탄총 한 발 = 탄 7개). 연속은 죽지 않고 이어 간 최다 킬.</p></div>`
  }

  /**
   * 팀 신호를 찍는다. 커서(=조준하는 지면)를 같은 편에게 알린다.
   * sim 밖(컨트롤 메시지)이라 결정론에 영향이 없고, 봇전에서는 내 화면에만 남는다.
   */
  private sendMark(): void {
    const lp = this.cfg.localPlayer
    const me = this.state.players[lp]
    if (!me || !me.alive) return
    const c = this.input.mouse
    const w = this.renderer.screenToWorld(c.x, c.y)
    this.renderer.addMark(w.x, w.y)
    this.sfx.mark()
    this.cfg.link?.sendCtl({ t: 'mark', p: lp, x: Math.round(w.x), y: Math.round(w.y) })
  }

  /**
   * 진행 중인 방에 새로 들어오겠다는 요청(호스트만 처리).
   * 비어 있는 자리를 찾아 **앞선 틱 T** 를 정해 모두에게 알리고, T 에 그 자리를 채운다.
   * 그 사람에게는 T 시점의 판 전체를 보내 준다(재입장과 같은 길).
   */
  private onJoinAsk(char: CharacterId, name: string, peerId: string): void {
    if (this.state.phase === 'over') {
      this.cfg.link?.sendCtl({ t: 'rejoinNo', why: '이미 끝난 판입니다' }, peerId)
      return
    }
    if (this.pendingRejoin || this.pendingJoins.length > 0) {
      this.cfg.link?.sendCtl({ t: 'rejoinNo', why: '다른 사람이 먼저 들어오는 중입니다' }, peerId)
      return
    }
    // 아무도 없는 자리 찾기
    let slot = -1
    for (let i = 0; i < this.state.players.length; i++) {
      if (this.state.players[i].left) {
        slot = i
        break
      }
    }
    if (slot < 0) {
      this.cfg.link?.sendCtl({ t: 'rejoinNo', why: '자리가 없습니다' }, peerId)
      return
    }
    // 팀전이면 사람이 적은 팀으로
    let team = slot
    if (isTeamMatch(this.state)) {
      const count = [0, 0]
      for (const p of this.state.players) if (!p.left && p.team < 2) count[p.team]++
      team = count[0] <= count[1] ? 0 : 1
    }
    const tick = this.state.tick + 120
    this.peerIndex.set(peerId, slot)
    // 다음에 난입하는 사람에게 넘겨줄 목록에도 넣는다 (빠지면 그 사람이 이 사람 입력을 못 받는다)
    if (this.cfg.peerIds) this.cfg.peerIds[slot] = peerId
    this.cfg.link?.sendCtl({ t: 'joinAt', p: slot, tick, char, team, name, id: peerId })
    this.pendingJoins.push({ p: slot, tick, char, team, name })
    this.pendingRejoin = { peerId, p: slot, tick }
    this.lockstep?.rejoin(slot, tick)
  }

  /** 정해진 틱이 되면 자리를 채운다 (모두가 같은 틱에) */
  private applyJoins(): void {
    if (this.pendingJoins.length === 0) return
    const t = this.state.tick
    const keep: typeof this.pendingJoins = []
    for (const j of this.pendingJoins) {
      if (j.tick <= t) {
        joinPlayer(this.state, this.map, j.p, j.char, j.team)
        this.cfg.chars[j.p] = j.char
        if (this.cfg.names) this.cfg.names[j.p] = j.name
        if (this.cfg.teams) this.cfg.teams[j.p] = j.team
        this.names = this.computeNames()
        this.makeBotFor(j.p)
        this.dropped.delete(j.p)
        this.lockstep?.rejoin(j.p, j.tick)
      } else keep.push(j)
    }
    this.pendingJoins = keep
  }

  /** 난입한 자리의 봇 기억을 새로 만든다 (봇이 조종하던 자리였을 수 있다) */
  private makeBotFor(idx: number): void {
    this.bots[idx] = makeBot((this.cfg.seed ^ 0x9e37) + idx * 7919 + this.state.tick)
  }

  /** 호스트: 약속한 틱에 도달하면 판 전체를 보내 준다 */
  private servePendingRejoin(): void {
    const r = this.pendingRejoin
    if (!r || this.state.tick < r.tick) return
    this.pendingRejoin = null
    const cfg = {
      chars: this.cfg.chars,
      teams: this.cfg.teams,
      names: this.cfg.names ?? [],
      targetKills: this.cfg.targetKills,
      seed: this.cfg.seed,
      map: this.cfg.mapId ?? DEFAULT_MAP,
      scale: this.map.scale,
      delay: this.cfg.delay ?? 3,
      peerIds: this.cfg.peerIds ?? [],
    }
    this.cfg.link?.sendCtl(
      { t: 'resume', p: r.p, tick: this.state.tick, state: snapshot(this.state), cfg },
      r.peerId,
    )
  }

  /**
   * 관전 대상 후보: 나를 뺀 살아 있는 사람 중 from 다음 사람.
   * **팀전에서는 아군만** 본다 — 상대 시점을 보면 적 위치가 그대로 드러나 팀전이 성립하지 않는다.
   * 개인전은 누구든 볼 수 있다(어차피 곧 리스폰하고, 배우는 재미가 있다).
   */
  private nextAlive(from: number): number {
    const n = this.state.players.length
    const teams = isTeamMatch(this.state)
    const myTeam = this.state.players[this.cfg.localPlayer].team
    for (let k = 1; k <= n; k++) {
      const i = (from + k + n) % n
      const p = this.state.players[i]
      if (i === this.cfg.localPlayer || !p.alive || p.left) continue
      if (teams && p.team !== myTeam) continue
      return i
    }
    return -1
  }

  /** 지금 볼 수 있는 사람 수 (안내 문구에 "바꾸기" 를 넣을지 정한다) */
  private spectateCandidates(): number {
    const teams = isTeamMatch(this.state)
    const myTeam = this.state.players[this.cfg.localPlayer].team
    let c = 0
    for (const p of this.state.players) {
      if (p.id === this.cfg.localPlayer || !p.alive || p.left) continue
      if (teams && p.team !== myTeam) continue
      c++
    }
    return c
  }

  private onOver(): void {
    const w = this.state.winner
    const lp = this.cfg.localPlayer
    const iWon = this.state.players[lp].team === w
    const title = iWon ? '승리!' : '패배'
    const teams = isTeamMatch(this.state)
    // 결정적 시뮬이라 방에 있던 모두가 똑같은 내용을 각자 브라우저에 남긴다 (서버·DB 없음)
    saveRecord({
      at: Date.now(),
      mode: this.cfg.mode,
      teams,
      map: this.cfg.mapId ?? DEFAULT_MAP,
      target: this.cfg.targetKills,
      winner: w,
      me: lp,
      players: this.state.players.map((p, i) => ({
        nick: this.names[i],
        char: p.char,
        kills: p.kills,
        deaths: p.deaths,
        team: p.team,
        left: p.left,
      })),
    })
    const stats = this.statsTable()
    const desc = teams
      ? `${TEAM_NAMES[w] ?? '?'} 승리 · ` + this.state.players.map((p, i) => `${this.names[i]} ${p.kills}`).join(' · ')
      : this.state.players.length === 2
        ? `${this.names[0]} ${this.state.players[0].kills} : ${this.state.players[1].kills} ${this.names[1]}`
        : this.state.players.map((p, i) => `${this.names[i]} ${p.kills}`).join(' · ')
    setTimeout(() => {
      if (this.disposed) return
      if (this.cfg.mode === 'solo') {
        this.showOverlay(
          title,
          desc,
          [
            { label: '다시 하기', primary: true, onClick: () => this.restart((Math.random() * 0xffffffff) >>> 0) },
            { label: '로비로', primary: false, onClick: () => this.exit() },
          ],
          stats,
        )
      } else if (this.isHost) {
        this.showOverlayWithStats(title, desc, stats, [
          {
            label: '다시 하기',
            primary: true,
            onClick: () => {
              const seed = (Math.random() * 0xffffffff) >>> 0
              this.cfg.link?.sendCtl({ t: 'rematch', seed })
              this.restart(seed)
            },
          },
          { label: '로비로', primary: false, onClick: () => this.exit() },
        ])
      } else {
        this.showOverlay(
          title,
          desc + ' · 호스트가 다시 시작하길 기다리는 중',
          [{ label: '로비로', primary: false, onClick: () => this.exit() }],
          stats,
        )
      }
    }, 2200)
  }

  private exit(): void {
    if (this.cfg.link) this.cfg.link.sendCtl({ t: 'leave' })
    this.dispose()
    this.cfg.onExit()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    clearInterval(this.lobbyBeacon)
    if (this.cfg.lobby) {
      this.cfg.lobby.announce(null)
      this.cfg.lobby.leave()
    }
    cancelAnimationFrame(this.raf)
    this.ticker.stop()
    this.input.dispose()
    this.touch?.dispose()
    this.sfx.dispose()
    window.removeEventListener('keydown', this.onKey)
    window.removeEventListener('resize', this.fit)
    this.renderer.dispose()
    this.root.remove()
  }
}
