// 게임 세션: 혼자 하기(봇) 와 대전(락스텝) 을 같은 루프로 돌린다. 렌더는 Three.js. 인원 2~4명.
// 대전: 플레이어 0 = 호스트. 호스트가 해시 비교·리싱크·이탈자 드롭 틱을 정한다.

import { BotMemory, Difficulty, DIFFICULTY_LABEL, botInput, makeBot } from '../core/bot'
import { CHARACTERS, CHARACTER_LIST, CharacterId, displayNames } from '../core/characters'
import { Input } from '../core/input'
import { buildMap } from '../core/map'
import { DEFAULT_MAP, MapId, MapScale, scaleForPlayers } from '../core/maps'
import { createState, dropPlayer, hashState, snapshot, step, syncSandbags } from '../core/sim'
import { angleToRad } from '../core/fixedmath'
import { GameState, TICK_MS, isTeamMatch } from '../core/state'
import { WEAPONS } from '../core/weapons'
import { drawPortrait } from '../render/character'
import { Lockstep } from '../net/lockstep'
import { CtlMessage, RoomLink } from '../net/room'
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
  private syncMute: () => void = () => {}
  private ticker: Ticker
  private lastTick = performance.now()

  constructor(
    host: HTMLElement,
    private cfg: SessionConfig,
  ) {
    this.map = buildMap(cfg.mapId ?? DEFAULT_MAP, cfg.mapScale ?? scaleForPlayers(cfg.chars.length), cfg.seed)
    this.state = createState({ seed: cfg.seed, targetKills: cfg.targetKills, chars: cfg.chars, teams: cfg.teams }, this.map)
    this.prev = snapshot(this.state)
    this.makeBots(cfg.seed)

    host.innerHTML = `
      <div class="game-root">
        <div class="game-stage" id="stage">
          <div class="game-ui">
            <div class="top-right"><button class="btn secondary" id="btn-mute">소리</button><button class="btn secondary" id="btn-lobby">로비로</button></div>
            <div class="keys"><b>WASD</b> 이동 · <b>마우스</b> 조준 · <b>좌클릭</b> 사격 · <b>우클릭</b> 정조준 · <b>Space</b> 대시 · <b>R</b> 재장전 · <b>Tab</b> 캐릭터 교체(리스폰 대기·3초) · <b>N</b> 소리 · <b>Esc</b> 메뉴</div>
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
      ids.forEach((id, i) => this.peerIndex.set(id, i))
      this.lockstep = this.newLockstep()
      cfg.link.onCtl((m, from) => this.onCtl(m, from))
      cfg.link.onPeerLeave((id) => this.onPeerGone(id))
    }

    window.addEventListener('keydown', this.onKey)
    window.addEventListener('resize', this.fit)
    this.fit()
    this.ticker = new Ticker(() => this.tick())
    this.ticker.start()
    this.raf = requestAnimationFrame(this.frame)
    ;(window as unknown as { __bd?: unknown }).__bd = { tick: () => this.state.tick, phase: () => this.state.phase, state: () => this.state }
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
    const ls = new Lockstep(this.cfg.link!, this.cfg.delay ?? 3, this.cfg.localPlayer, this.peerIndex, this.cfg.chars.length)
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
        { label: '계속', primary: true, onClick: () => this.hideOverlay() },
        { label: '로비로', primary: false, onClick: () => this.exit() },
      ],
    )
  }

  private showOverlay(title: string, desc: string, buttons: { label: string; primary: boolean; onClick: () => void }[]): void {
    const box = this.overlay.querySelector('#overlay-box') as HTMLElement
    box.innerHTML = `<h2>${title}</h2><p>${desc}</p><div class="row"></div>`
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
      // 모두가 같은 틱에 제거하도록 앞선 틱을 정해 알린다
      const tick = this.state.tick + (this.cfg.delay ?? 3) + 30
      this.pendingDrops.push({ p: idx, tick })
      this.cfg.link?.sendCtl({ t: 'drop', p: idx, tick })
    }
  }

  /** step 직후 호출: 정해진 틱에 도달한 이탈을 상태에 반영 */
  private applyDrops(): void {
    if (this.pendingDrops.length === 0) return
    const t = this.state.tick
    const keep: PendingDrop[] = []
    for (const d of this.pendingDrops) {
      if (d.tick <= t) dropPlayer(this.state, d.p)
      else keep.push(d)
    }
    this.pendingDrops = keep
    const remaining = this.state.players.filter((p) => !p.left).length
    if (remaining < 2 && this.state.phase !== 'over' && this.overlay.hidden) {
      this.showOverlay('상대가 모두 나갔습니다', '', [{ label: '로비로', primary: true, onClick: () => this.exit() }])
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
    while (this.acc >= TICK_MS && steps < 8) {
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
      for (const e of this.state.events) if (e.type === 'over') this.onOver()
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
    this.renderer.draw(this.prev, this.state, alpha, dt, {
      showHud: true,
      localPlayer: lp,
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
    const desc = teams
      ? `${TEAM_NAMES[w] ?? '?'} 승리 · ` + this.state.players.map((p, i) => `${this.names[i]} ${p.kills}`).join(' · ')
      : this.state.players.length === 2
        ? `${this.names[0]} ${this.state.players[0].kills} : ${this.state.players[1].kills} ${this.names[1]}`
        : this.state.players.map((p, i) => `${this.names[i]} ${p.kills}`).join(' · ')
    setTimeout(() => {
      if (this.disposed) return
      if (this.cfg.mode === 'solo') {
        this.showOverlay(title, desc, [
          { label: '다시 하기', primary: true, onClick: () => this.restart((Math.random() * 0xffffffff) >>> 0) },
          { label: '로비로', primary: false, onClick: () => this.exit() },
        ])
      } else if (this.isHost) {
        this.showOverlay(title, desc, [
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
        this.showOverlay(title, desc + ' · 호스트가 다시 시작하길 기다리는 중', [
          { label: '로비로', primary: false, onClick: () => this.exit() },
        ])
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
