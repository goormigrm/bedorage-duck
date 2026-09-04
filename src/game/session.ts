// 게임 세션: 혼자 하기(봇) 와 대전(락스텝) 을 같은 루프로 돌린다. 렌더는 Three.js. 인원 2~4명.

import { BotMemory, Difficulty, DIFFICULTY_LABEL, botInput, makeBot } from '../core/bot'
import { CHARACTERS, CharacterId, displayNames } from '../core/characters'
import { Input } from '../core/input'
import { buildMap } from '../core/map'
import { DEFAULT_MAP, MapId } from '../core/maps'
import { createState, hashState, snapshot, step } from '../core/sim'
import { GameState, TICK_MS, isTeamMatch } from '../core/state'
import { Lockstep } from '../net/lockstep'
import { CtlMessage, RoomLink } from '../net/room'
import { TEAM_NAMES, VIEW_H, VIEW_W } from '../render/hud'
import { Renderer3D } from '../render3d/renderer3d'
import { LocalInput } from './localInput'
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
  difficulty?: Difficulty
  link?: RoomLink
  delay?: number
  onExit: () => void
}

export class Session {
  private map
  private state: GameState
  private prev: GameState
  private renderer: Renderer3D
  private input = new LocalInput()
  private bots: BotMemory[] = []
  private lockstep: Lockstep | null = null
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
  private ticker: Ticker
  private lastTick = performance.now()

  constructor(
    host: HTMLElement,
    private cfg: SessionConfig,
  ) {
    this.map = buildMap(cfg.mapId ?? DEFAULT_MAP)
    this.state = createState({ seed: cfg.seed, targetKills: cfg.targetKills, chars: cfg.chars, teams: cfg.teams }, this.map)
    this.prev = snapshot(this.state)
    this.makeBots(cfg.seed)

    host.innerHTML = `
      <div class="game-root">
        <div class="game-stage" id="stage">
          <div class="game-ui">
            <div class="top-right"><button class="btn secondary" id="btn-lobby">로비로</button></div>
            <div class="keys"><b>WASD</b> 이동 · <b>마우스</b> 조준 · <b>좌클릭</b> 사격 · <b>우클릭</b> 정조준 · <b>Space</b> 대시 · <b>R</b> 재장전 · <b>Esc</b> 메뉴</div>
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
    this.input.attach(this.stage)
    ;(host.querySelector('#btn-lobby') as HTMLButtonElement).onclick = () => this.exit()

    this.names = displayNames(cfg.chars)

    if (cfg.mode === 'p2p' && cfg.link) {
      this.lockstep = new Lockstep(cfg.link, cfg.delay ?? 3)
      cfg.link.onCtl((m) => this.onCtl(m))
      cfg.link.onPeerLeave(() => {
        if (this.disposed) return
        this.showOverlay('상대가 나갔습니다', '연결이 끊겼습니다.', [{ label: '로비로', primary: true, onClick: () => this.exit() }])
        this.paused = true
      })
    }

    window.addEventListener('keydown', this.onKey)
    window.addEventListener('resize', this.fit)
    this.fit()
    this.ticker = new Ticker(() => this.tick())
    this.ticker.start()
    this.raf = requestAnimationFrame(this.frame)
    ;(window as unknown as { __bd?: unknown }).__bd = { tick: () => this.state.tick, phase: () => this.state.phase, state: () => this.state }
  }

  private makeBots(seed: number): void {
    this.bots = this.cfg.chars.map((_, i) => makeBot((seed ^ 0x9e37) + i * 7919))
  }

  private fit = (): void => {
    const s = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H)
    this.stage.style.transform = `scale(${s})`
    this.renderer.resize()
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      if (this.state.phase === 'over') return
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
  }

  private hideOverlay(): void {
    this.overlay.hidden = true
    if (this.cfg.mode === 'solo' && this.state.phase !== 'over') this.paused = false
  }

  private onCtl(m: CtlMessage): void {
    if (this.disposed) return
    switch (m.t) {
      case 'hash': {
        const mine = this.hashes.get(m.tick)
        if (mine === undefined) return
        if (mine !== m.h && this.cfg.link?.role === 'host') {
          this.cfg.link.sendCtl({ t: 'resync', tick: this.state.tick, state: snapshot(this.state) })
        }
        break
      }
      case 'resync': {
        if (this.cfg.link?.role !== 'guest' || !this.lockstep) return
        const target = this.state.tick
        const snap = m.state as GameState
        this.state = snap
        this.state.events = []
        while (this.state.tick < target && this.lockstep.hasBoth(this.state.tick)) {
          const [l, r] = this.lockstep.get(this.state.tick)
          step(this.state, this.map, this.cfg.localPlayer === 0 ? [l, r] : [r, l])
        }
        this.prev = snapshot(this.state)
        this.message = '동기화됨'
        setTimeout(() => (this.message = ''), 1200)
        break
      }
      case 'rematch':
        this.restart(m.seed)
        break
      case 'leave':
        this.showOverlay('상대가 나갔습니다', '', [{ label: '로비로', primary: true, onClick: () => this.exit() }])
        this.paused = true
        break
      default:
        break
    }
  }

  private restart(seed: number): void {
    this.state = createState({ seed, targetKills: this.cfg.targetKills, chars: this.cfg.chars, teams: this.cfg.teams }, this.map)
    this.prev = snapshot(this.state)
    this.makeBots(seed)
    this.hashes.clear()
    this.acc = 0
    this.paused = false
    this.hideOverlay()
    if (this.cfg.link) this.lockstep = new Lockstep(this.cfg.link, this.cfg.delay ?? 3)
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
      const localIn = this.input.sample(this.renderer, me.x, me.y)
      const inputs: Input[] = new Array(n)
      if (this.lockstep) {
        this.lockstep.pushLocal(t, localIn)
        if (!this.lockstep.hasBoth(t)) {
          if (this.stallSince < 0) this.stallSince = now
          break
        }
        this.stallSince = -1
        const [l, r] = this.lockstep.get(t)
        inputs[lp] = l
        inputs[1 - lp] = r
      } else {
        for (let i = 0; i < n; i++) {
          inputs[i] = i === lp ? localIn : botInput(this.state, this.map, i, this.bots[i], this.cfg.difficulty ?? 'normal')
        }
      }
      this.prev = snapshot(this.state)
      step(this.state, this.map, inputs)
      this.renderer.onEvents(this.state.events, this.state, lp, this.names)
      if (this.lockstep && this.state.tick % 60 === 0) {
        const h = hashState(this.state)
        this.hashes.set(this.state.tick, h)
        if (this.hashes.size > 10) this.hashes.delete(Math.min(...this.hashes.keys()))
        this.cfg.link?.sendCtl({ t: 'hash', tick: this.state.tick, h })
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
    const alpha = Math.min(1, this.acc / TICK_MS)
    const sub = this.cfg.chars.map((_, i) => this.subLabel(i))
    this.renderer.draw(this.prev, this.state, alpha, dt, {
      showHud: true,
      localPlayer: lp,
      cameraMode: 'follow',
      names: this.names,
      subLabels: sub,
      ping: this.cfg.link ? this.cfg.link.rtt : undefined,
      message,
      cursor: this.input.mouse,
    })
    this.raf = requestAnimationFrame(this.frame)
  }

  private subLabel(i: number): string {
    const c = CHARACTERS[this.cfg.chars[i]]
    if (i === this.cfg.localPlayer) return `나 · ${c.basedOn}`
    if (this.cfg.mode === 'solo') return `AI · ${DIFFICULTY_LABEL[this.cfg.difficulty ?? 'normal']}`
    return `상대 · ${c.basedOn}`
  }

  private onOver(): void {
    const w = this.state.winner
    const lp = this.cfg.localPlayer
    const iWon = this.state.players[lp].team === w
    const title = iWon ? '승리!' : '패배'
    const teams = isTeamMatch(this.state)
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
      } else if (this.cfg.link?.role === 'host') {
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
    window.removeEventListener('keydown', this.onKey)
    window.removeEventListener('resize', this.fit)
    this.renderer.dispose()
    this.root.remove()
  }
}
