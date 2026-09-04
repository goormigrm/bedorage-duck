// 효과음·배경음. 파일 없이 Web Audio 로 절차 생성한다 (오실레이터 + 노이즈 + 필터).
// sim 을 바꾸지 않는다: SimEvent 를 받아 소리만 낸다. 나중에 public/sfx/ 에 파일이 생기면 여기서 교체하면 된다.
// 브라우저 자동재생 정책: 첫 클릭/키 입력 전에는 소리가 나지 않는다 (그 전 이벤트는 버린다).

import { GameState, SimEvent } from '../core/state'
import { PART_HEAD, WeaponId } from '../core/weapons'

const STORAGE_KEY = 'bd.muted'
const MASTER = 0.8
const BGM_LEVEL = 0.16

interface Spatial {
  gain: number
  pan: number
}

export class Sfx {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private bgmGain: GainNode | null = null
  private noise: AudioBuffer | null = null
  private mutedFlag: boolean
  private lastWall = 0
  private lastCountdownSec = -1
  private unlockOff: (() => void) | null = null
  private bgmTimer = 0
  private bgmNextBeat = 0
  private bgmBeatIndex = 0
  private bgmOn = false

  constructor() {
    let m = false
    try {
      m = localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      /* 저장소 없음 */
    }
    this.mutedFlag = m
    const unlock = () => {
      if (this.ensure() && this.ctx && this.ctx.state !== 'running') void this.ctx.resume()
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    this.unlockOff = () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }

  get muted(): boolean {
    return this.mutedFlag
  }

  setMuted(v: boolean): void {
    this.mutedFlag = v
    try {
      localStorage.setItem(STORAGE_KEY, v ? '1' : '0')
    } catch {
      /* 무시 */
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v ? 0 : MASTER, this.ctx.currentTime, 0.02)
  }

  toggle(): boolean {
    this.setMuted(!this.mutedFlag)
    return this.mutedFlag
  }

  private ensure(): boolean {
    if (this.ctx) return true
    if (typeof AudioContext === 'undefined') return false
    const ctx = new AudioContext()
    const master = ctx.createGain()
    master.gain.value = this.mutedFlag ? 0 : MASTER
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.knee.value = 18
    comp.ratio.value = 6
    comp.attack.value = 0.003
    comp.release.value = 0.16
    master.connect(comp)
    comp.connect(ctx.destination)
    const bgm = ctx.createGain()
    bgm.gain.value = BGM_LEVEL
    bgm.connect(master)
    const len = ctx.sampleRate
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    this.ctx = ctx
    this.master = master
    this.bgmGain = bgm
    this.noise = buf
    if (this.bgmOn) this.startBgmScheduler()
    return true
  }

  private ready(): boolean {
    return this.ensure() && this.ctx !== null && this.ctx.state === 'running' && !this.mutedFlag
  }

  // ---------- 이벤트 ----------
  onEvents(events: SimEvent[], state: GameState, localPlayer: number): void {
    // 카운트다운 초 알림은 이벤트가 아니라 상태에서
    if (state.phase === 'countdown') {
      const sec = Math.ceil(state.phaseTimer / 60)
      if (sec !== this.lastCountdownSec) {
        this.lastCountdownSec = sec
        if (sec > 0 && sec <= 3 && this.ready()) this.tick(sec)
      }
    } else {
      this.lastCountdownSec = -1
    }
    if (events.length === 0 || !this.ready()) return
    // 듣는 위치: 나, 관전이면 산 사람들의 중심
    let lx = 0
    let ly = 0
    if (localPlayer >= 0 && state.players[localPlayer]) {
      lx = state.players[localPlayer].x
      ly = state.players[localPlayer].y
    } else {
      let n = 0
      for (const p of state.players) {
        if (!p.alive) continue
        lx += p.x
        ly += p.y
        n++
      }
      if (n > 0) {
        lx /= n
        ly /= n
      }
    }
    const sp = (x: number, y: number): Spatial => {
      const dx = x - lx
      const dy = y - ly
      const d = Math.hypot(dx, dy)
      return { gain: Math.max(0.25, 1 - d / 1100), pan: Math.max(-0.8, Math.min(0.8, dx / 600)) }
    }
    const at = (p: number) => {
      const q = state.players[p]
      return sp(q.x, q.y)
    }
    for (const e of events) {
      switch (e.type) {
        case 'fire':
          this.gun(e.weapon, sp(e.x, e.y), e.p === localPlayer)
          break
        case 'hit':
          this.hit(sp(e.x, e.y), e.part === PART_HEAD)
          break
        case 'death':
          this.death(sp(e.x, e.y))
          break
        case 'respawn':
          this.respawn(sp(e.x, e.y))
          break
        case 'dash':
          this.dash(at(e.p))
          break
        case 'reload':
          this.reload(at(e.p))
          break
        case 'wall': {
          const now = performance.now()
          if (now - this.lastWall > 40) {
            this.lastWall = now
            this.wall(sp(e.x, e.y))
          }
          break
        }
        case 'choose':
        case 'swap':
          if (e.p === localPlayer) this.blip()
          break
        case 'start':
          this.start()
          break
        case 'over':
          this.over()
          break
        default:
          break
      }
    }
  }

  // ---------- 기본 부품 ----------
  private bus(s: Spatial, vol: number): { node: GainNode; t0: number } {
    const ctx = this.ctx!
    const g = ctx.createGain()
    g.gain.value = vol * s.gain
    const pan = ctx.createStereoPanner()
    pan.pan.value = s.pan
    g.connect(pan)
    pan.connect(this.master!)
    return { node: g, t0: ctx.currentTime }
  }

  private env(g: GainNode, t0: number, peak: number, attack: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.linearRampToValueAtTime(peak, t0 + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay)
  }

  private noiseBurst(bus: AudioNode, t0: number, dur: number, type: BiquadFilterType, f0: number, f1: number, peak: number, q = 1): void {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    const flt = ctx.createBiquadFilter()
    flt.type = type
    flt.Q.value = q
    flt.frequency.setValueAtTime(f0, t0)
    flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur)
    const g = ctx.createGain()
    this.env(g, t0, peak, 0.003, dur)
    src.connect(flt)
    flt.connect(g)
    g.connect(bus)
    src.start(t0)
    src.stop(t0 + dur + 0.05)
  }

  private tone(bus: AudioNode, t0: number, dur: number, type: OscillatorType, f0: number, f1: number, peak: number, attack = 0.003): void {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(f0, t0)
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur)
    const g = ctx.createGain()
    this.env(g, t0, peak, attack, dur)
    osc.connect(g)
    g.connect(bus)
    osc.start(t0)
    osc.stop(t0 + attack + dur + 0.05)
  }

  // ---------- 소리들 ----------
  private gun(w: WeaponId, s: Spatial, mine: boolean): void {
    const { node, t0 } = this.bus(s, mine ? 1 : 0.85)
    switch (w) {
      case 'pistol':
        this.noiseBurst(node, t0, 0.09, 'bandpass', 1800, 600, 0.9, 0.8)
        this.tone(node, t0, 0.07, 'sine', 320, 80, 0.7)
        break
      case 'smg':
        this.noiseBurst(node, t0, 0.06, 'highpass', 1200, 800, 0.6)
        this.tone(node, t0, 0.05, 'square', 420, 120, 0.22)
        break
      case 'rifle':
        this.noiseBurst(node, t0, 0.1, 'bandpass', 1400, 400, 0.8, 0.7)
        this.tone(node, t0, 0.09, 'sine', 240, 60, 0.8)
        break
      case 'shotgun':
        this.noiseBurst(node, t0, 0.24, 'lowpass', 1600, 300, 1.0)
        this.tone(node, t0, 0.18, 'sine', 140, 40, 1.0)
        this.noiseBurst(node, t0, 0.05, 'highpass', 3000, 2000, 0.5)
        break
      case 'sniper':
        this.noiseBurst(node, t0, 0.06, 'highpass', 2500, 1500, 0.9)
        this.tone(node, t0, 0.32, 'sine', 100, 30, 1.0)
        this.noiseBurst(node, t0 + 0.02, 0.3, 'lowpass', 800, 150, 0.6)
        break
      default:
        break
    }
  }

  private hit(s: Spatial, head: boolean): void {
    const { node, t0 } = this.bus(s, 0.9)
    this.tone(node, t0, 0.06, 'triangle', 900, 300, 0.7)
    this.noiseBurst(node, t0, 0.04, 'bandpass', 2200, 1200, 0.4, 1.5)
    if (head) this.tone(node, t0 + 0.01, 0.12, 'sine', 1500, 1100, 0.5)
  }

  private death(s: Spatial): void {
    const { node, t0 } = this.bus(s, 1)
    this.tone(node, t0, 0.45, 'sawtooth', 500, 70, 0.45)
    this.noiseBurst(node, t0, 0.3, 'lowpass', 1200, 200, 0.7)
    this.tone(node, t0 + 0.05, 0.4, 'square', 250, 50, 0.18)
  }

  private respawn(s: Spatial): void {
    const { node, t0 } = this.bus(s, 0.6)
    this.tone(node, t0, 0.18, 'sine', 520, 520, 0.5, 0.01)
    this.tone(node, t0 + 0.12, 0.25, 'sine', 780, 780, 0.5, 0.01)
  }

  private dash(s: Spatial): void {
    const { node, t0 } = this.bus(s, 0.7)
    this.noiseBurst(node, t0, 0.2, 'bandpass', 500, 2400, 0.5, 0.6)
  }

  private reload(s: Spatial): void {
    const { node, t0 } = this.bus(s, 0.7)
    this.tone(node, t0, 0.03, 'square', 1800, 900, 0.25)
    this.tone(node, t0 + 0.13, 0.04, 'square', 1200, 600, 0.3)
  }

  private wall(s: Spatial): void {
    const { node, t0 } = this.bus(s, 0.5)
    this.noiseBurst(node, t0, 0.03, 'highpass', 3000, 2000, 0.35)
  }

  private blip(): void {
    const { node, t0 } = this.bus({ gain: 1, pan: 0 }, 0.5)
    this.tone(node, t0, 0.08, 'sine', 880, 1320, 0.4, 0.005)
  }

  private tick(sec: number): void {
    const { node, t0 } = this.bus({ gain: 1, pan: 0 }, 0.5)
    this.tone(node, t0, 0.12, 'sine', sec === 1 ? 880 : 660, sec === 1 ? 880 : 660, 0.5, 0.005)
  }

  private start(): void {
    const { node, t0 } = this.bus({ gain: 1, pan: 0 }, 0.6)
    for (const f of [440, 554, 659, 880]) this.tone(node, t0, 0.35, 'triangle', f, f, 0.3, 0.005)
  }

  private over(): void {
    const { node, t0 } = this.bus({ gain: 1, pan: 0 }, 0.7)
    for (const f of [392, 494, 587, 784]) this.tone(node, t0, 0.9, 'triangle', f, f, 0.28, 0.02)
    this.tone(node, t0, 0.8, 'sine', 98, 98, 0.35, 0.02)
  }

  // ---------- 배경음 (절차 생성 루프) ----------
  /** 게임 중 낮게 깔리는 루프: Am – F – C – G, 96 BPM. 베이스 + 아르페지오 + 하이햇 */
  startBgm(): void {
    this.bgmOn = true
    if (this.ctx) this.startBgmScheduler()
  }

  stopBgm(): void {
    this.bgmOn = false
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer)
      this.bgmTimer = 0
    }
  }

  private startBgmScheduler(): void {
    if (this.bgmTimer || !this.ctx) return
    this.bgmNextBeat = this.ctx.currentTime + 0.1
    this.bgmBeatIndex = 0
    this.bgmTimer = window.setInterval(() => this.scheduleBgm(), 90)
  }

  private scheduleBgm(): void {
    const ctx = this.ctx
    if (!ctx || !this.bgmGain || ctx.state !== 'running') return
    const beat = 60 / 96 / 2 // 8분음표
    // 4마디 진행, 마디당 8개의 8분음표
    const chords = [
      [220, 261.6, 329.6], // Am
      [174.6, 220, 261.6], // F
      [130.8 * 2, 164.8 * 2, 196 * 2], // C (한 옥타브 위)
      [196, 246.9, 293.7], // G
    ]
    while (this.bgmNextBeat < ctx.currentTime + 0.25) {
      const t = this.bgmNextBeat
      const i = this.bgmBeatIndex
      const bar = Math.floor(i / 8) % 4
      const step = i % 8
      const chord = chords[bar]
      // 베이스: 마디 첫 박과 5번째 박
      if (step === 0 || step === 4) this.bgmNote(t, chord[0] / 2, 'triangle', beat * 3.6, 0.5)
      // 아르페지오: 8분음표마다 코드 톤 순환
      const note = chord[(step + (bar % 2)) % 3] * (step >= 4 ? 2 : 1)
      this.bgmNote(t, note, 'sine', beat * 1.6, 0.28)
      // 하이햇: 홀수 박에 짧은 노이즈
      if (step % 2 === 1) this.bgmHat(t, 0.06)
      this.bgmNextBeat += beat
      this.bgmBeatIndex++
    }
  }

  private bgmNote(t0: number, f: number, type: OscillatorType, dur: number, peak: number): void {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.value = f
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.linearRampToValueAtTime(peak, t0 + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(g)
    g.connect(this.bgmGain!)
    osc.start(t0)
    osc.stop(t0 + dur + 0.05)
  }

  private bgmHat(t0: number, peak: number): void {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const flt = ctx.createBiquadFilter()
    flt.type = 'highpass'
    flt.frequency.value = 6000
    const g = ctx.createGain()
    g.gain.setValueAtTime(peak, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05)
    src.connect(flt)
    flt.connect(g)
    g.connect(this.bgmGain!)
    src.start(t0)
    src.stop(t0 + 0.06)
  }

  dispose(): void {
    this.stopBgm()
    this.unlockOff?.()
    this.unlockOff = null
    if (this.ctx) {
      void this.ctx.close()
      this.ctx = null
    }
  }
}
