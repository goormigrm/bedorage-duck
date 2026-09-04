// HUD 오버레이 (2D 캔버스). 3D 씬 위에 투명하게 겹친다. sim 을 바꾸지 않는다.
// 2명이면 좌우 카드, 3~4명이면 내 카드 + 오른쪽 아래 상대 목록. 팀전은 위 점수판이 A팀 : B팀.

import { CHARACTERS, CharacterDef } from '../core/characters'
import { GameState, PlayerState, STAMINA_MAX, isTeamMatch, teamKills } from '../core/state'
import { WEAPONS } from '../core/weapons'

export const VIEW_W = 1280
export const VIEW_H = 720

export const TEAM_NAMES = ['A팀', 'B팀']
export const TEAM_COLORS = ['#5aa9ff', '#ff6a5a']

export interface RenderOptions {
  showHud: boolean
  /** -1 이면 관전(시네마틱) */
  localPlayer: number
  cameraMode: 'follow' | 'both'
  names: string[]
  subLabels: string[]
  ping?: number
  message?: string
  /** 화면 좌표 커서 (로컬 플레이어용 조준선) */
  cursor?: { x: number; y: number }
  timeScale?: number
  /** 시야 제한 (기본 true, 관전이면 무시) */
  fog?: boolean
}

export interface ScreenText {
  x: number
  y: number
  text: string
  k: number
  color: string
  big: boolean
}

interface Banner {
  text: string
  life: number
  max: number
  color: string
}

export class Hud {
  readonly ctx: CanvasRenderingContext2D
  private banner: Banner | null = null
  private overT = 0
  private countdownPulse = 0
  private lastCountdownSec = -1
  private dpr = 1

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('HUD 캔버스를 만들 수 없습니다')
    this.ctx = ctx
    this.resize()
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    this.canvas.width = Math.round(VIEW_W * this.dpr)
    this.canvas.height = Math.round(VIEW_H * this.dpr)
  }

  showKill(state: GameState, killer: number, victim: number, names: string[]): void {
    const k = CHARACTERS[state.players[killer].char]
    this.banner = { text: `${names[killer] ?? k.name}  ▶  ${names[victim] ?? CHARACTERS[state.players[victim].char].name}`, life: 1.6, max: 1.6, color: hex(k.bodyColor) }
  }

  showOver(): void {
    this.overT = 0
  }

  /** 프레임 시작: 변환 초기화 + 지우기 */
  begin(dt: number): void {
    const ctx = this.ctx
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, VIEW_W, VIEW_H)
    if (this.banner) {
      this.banner.life -= dt
      if (this.banner.life <= 0) this.banner = null
    }
    this.overT += dt
  }

  drawTexts(texts: ScreenText[]): void {
    const ctx = this.ctx
    for (const t of texts) {
      ctx.globalAlpha = Math.min(1, t.k * 2)
      ctx.font = `${t.big ? 800 : 700} ${t.big ? 20 : 15}px "IBM Plex Sans KR", "Malgun Gothic", sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'
      ctx.strokeText(t.text, t.x, t.y)
      ctx.fillStyle = t.color
      ctx.fillText(t.text, t.x, t.y)
    }
    ctx.globalAlpha = 1
  }

  drawVignette(): void {
    const ctx = this.ctx
    const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.5, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.78)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, 'rgba(0,0,0,0.35)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  }

  drawMain(s: GameState, opts: RenderOptions): void {
    if (opts.showHud) this.drawPanels(s, opts)
    this.drawBanner(s, opts)
    const lp = opts.localPlayer
    if (opts.cursor && lp !== -1) this.drawCursor(opts.cursor, s.players[lp])
  }

  private drawPanels(s: GameState, opts: RenderOptions): void {
    const ctx = this.ctx
    const n = s.players.length
    const teams = isTeamMatch(s)

    if (teams) this.drawTeamScore(s, opts)
    else this.drawFfaScore(s, opts)

    // 아래: 내 카드(체력·기력·탄약) + 다른 사람 목록 (상대 체력은 숨김, 관전·아군만 표시)
    const lp = opts.localPlayer
    if (lp !== -1) this.drawPlayerCard(s.players[lp], CHARACTERS[s.players[lp].char], opts.names[lp], 24, VIEW_H - 46, 'left', true)
    this.drawOthersList(s, opts)
    void n

    if (s.phase === 'countdown') {
      const sec = Math.ceil(s.phaseTimer / 60)
      if (sec !== this.lastCountdownSec) {
        this.lastCountdownSec = sec
        this.countdownPulse = 1
      }
      this.countdownPulse = Math.max(0, this.countdownPulse - 0.03)
      const scale = 1 + this.countdownPulse * 0.5
      ctx.save()
      ctx.translate(VIEW_W / 2, VIEW_H / 2 - 20)
      ctx.scale(scale, scale)
      ctx.font = '400 120px "Black Han Sans", "IBM Plex Sans KR", sans-serif'
      ctx.textAlign = 'center'
      ctx.lineWidth = 8
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'
      ctx.strokeText(`${sec}`, 0, 0)
      ctx.fillStyle = '#ffd84a'
      ctx.fillText(`${sec}`, 0, 0)
      ctx.restore()
      ctx.font = '500 18px "IBM Plex Sans KR", sans-serif'
      ctx.fillStyle = '#e6edf3'
      ctx.textAlign = 'center'
      ctx.fillText('준비', VIEW_W / 2, VIEW_H / 2 + 70)
    } else if (s.phase === 'playing' && s.tick < 240) {
      const k = 1 - (s.tick - 180) / 60
      ctx.globalAlpha = Math.max(0, k)
      ctx.font = '400 96px "Black Han Sans", "IBM Plex Sans KR", sans-serif'
      ctx.textAlign = 'center'
      ctx.lineWidth = 8
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'
      ctx.strokeText('시작!', VIEW_W / 2, VIEW_H / 2 - 20)
      ctx.fillStyle = '#ffd84a'
      ctx.fillText('시작!', VIEW_W / 2, VIEW_H / 2 - 20)
      ctx.globalAlpha = 1
    }

    if (opts.ping !== undefined) {
      ctx.font = '500 12px "IBM Plex Mono", monospace'
      ctx.textAlign = 'right'
      ctx.fillStyle = opts.ping < 80 ? '#8fd18a' : opts.ping < 150 ? '#f2c94c' : '#f25c4c'
      ctx.fillText(`${opts.ping} ms`, VIEW_W - 16, 22)
    }
    if (opts.message) {
      ctx.font = '500 16px "IBM Plex Sans KR", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = 'rgba(13,17,23,0.82)'
      const tw = ctx.measureText(opts.message).width + 32
      roundRect(ctx, VIEW_W / 2 - tw / 2, VIEW_H / 2 + 100, tw, 34, 6)
      ctx.fill()
      ctx.fillStyle = '#e6edf3'
      ctx.fillText(opts.message, VIEW_W / 2, VIEW_H / 2 + 117)
    }
  }

  /** 개인전 점수판: 2명은 "0 : 0", 3~4명은 이름·킬 한 줄 */
  private drawFfaScore(s: GameState, opts: RenderOptions): void {
    const ctx = this.ctx
    const n = s.players.length
    const pw = n === 2 ? 420 : 150 * n + 40
    const px = VIEW_W / 2 - pw / 2
    this.panel(px, 14, pw, 62)
    ctx.textBaseline = 'middle'
    if (n === 2) {
      const c0 = CHARACTERS[s.players[0].char]
      const c1 = CHARACTERS[s.players[1].char]
      ctx.font = '400 40px "Black Han Sans", "IBM Plex Sans KR", "Malgun Gothic", sans-serif'
      ctx.textAlign = 'center'
      ctx.fillStyle = '#e6edf3'
      ctx.fillText(`${s.players[0].kills}`, VIEW_W / 2 - 60, 44)
      ctx.fillText(`${s.players[1].kills}`, VIEW_W / 2 + 60, 44)
      ctx.fillStyle = '#6b7683'
      ctx.font = '400 26px "Black Han Sans", "IBM Plex Sans KR", sans-serif'
      ctx.fillText(':', VIEW_W / 2, 43)
      ctx.font = '600 15px "IBM Plex Sans KR", "Malgun Gothic", sans-serif'
      ctx.textAlign = 'right'
      ctx.fillStyle = hex(c0.bodyColor)
      ctx.fillText(opts.names[0], VIEW_W / 2 - 100, 38)
      ctx.textAlign = 'left'
      ctx.fillStyle = hex(c1.bodyColor)
      ctx.fillText(opts.names[1], VIEW_W / 2 + 100, 38)
      ctx.font = '400 11px "IBM Plex Sans KR", sans-serif'
      ctx.fillStyle = '#7d8896'
      ctx.textAlign = 'right'
      ctx.fillText(opts.subLabels[0], VIEW_W / 2 - 100, 58)
      ctx.textAlign = 'left'
      ctx.fillText(opts.subLabels[1], VIEW_W / 2 + 100, 58)
    } else {
      const colW = 150
      for (let i = 0; i < n; i++) {
        const p = s.players[i]
        const c = CHARACTERS[p.char]
        const cx = px + 20 + colW * i + colW / 2
        ctx.textAlign = 'center'
        ctx.font = '600 13px "IBM Plex Sans KR", "Malgun Gothic", sans-serif'
        ctx.fillStyle = p.left ? '#666' : hex(c.bodyColor)
        ctx.fillText(opts.names[i] + (i === opts.localPlayer ? ' (나)' : ''), cx, 30)
        ctx.font = '400 30px "Black Han Sans", "IBM Plex Sans KR", sans-serif'
        ctx.fillStyle = p.left ? '#666' : '#e6edf3'
        ctx.fillText(p.left ? '나감' : `${p.kills}`, cx, 54)
        if (i > 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.1)'
          ctx.fillRect(px + 20 + colW * i, 24, 1, 42)
        }
      }
    }
    ctx.font = '500 11px "IBM Plex Mono", "IBM Plex Sans KR", monospace'
    ctx.fillStyle = '#a9b4c0'
    ctx.textAlign = 'center'
    ctx.fillText(`목표 ${s.targetKills} 킬`, VIEW_W / 2, 66)
  }

  /** 팀전 점수판: A팀 킬 : B팀 킬 + 팀원 이름 */
  private drawTeamScore(s: GameState, opts: RenderOptions): void {
    const ctx = this.ctx
    const pw = 520
    const px = VIEW_W / 2 - pw / 2
    this.panel(px, 14, pw, 62)
    ctx.textBaseline = 'middle'
    ctx.font = '400 40px "Black Han Sans", "IBM Plex Sans KR", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#e6edf3'
    ctx.fillText(`${teamKills(s, 0)}`, VIEW_W / 2 - 60, 44)
    ctx.fillText(`${teamKills(s, 1)}`, VIEW_W / 2 + 60, 44)
    ctx.fillStyle = '#6b7683'
    ctx.font = '400 26px "Black Han Sans", "IBM Plex Sans KR", sans-serif'
    ctx.fillText(':', VIEW_W / 2, 43)
    for (const team of [0, 1]) {
      const side = team === 0 ? -1 : 1
      const x = VIEW_W / 2 + side * 100
      ctx.textAlign = team === 0 ? 'right' : 'left'
      ctx.font = '600 15px "IBM Plex Sans KR", sans-serif'
      ctx.fillStyle = TEAM_COLORS[team]
      ctx.fillText(TEAM_NAMES[team], x, 32)
      const members = s.players.map((p, i) => ({ p, i })).filter((m) => m.p.team === team)
      ctx.font = '400 11px "IBM Plex Sans KR", sans-serif'
      ctx.fillStyle = '#a9b4c0'
      ctx.fillText(members.map((m) => `${opts.names[m.i]}${m.i === opts.localPlayer ? '(나)' : ''} ${m.p.kills}`).join(' · '), x, 52)
    }
    ctx.font = '500 11px "IBM Plex Mono", "IBM Plex Sans KR", monospace'
    ctx.fillStyle = '#a9b4c0'
    ctx.textAlign = 'center'
    ctx.fillText(`목표 ${s.targetKills} 킬`, VIEW_W / 2, 66)
  }

  private panel(x: number, y: number, w: number, h: number): void {
    const ctx = this.ctx
    ctx.fillStyle = 'rgba(13,17,23,0.8)'
    roundRect(ctx, x, y, w, h, 8)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'
    ctx.lineWidth = 1
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 8)
    ctx.stroke()
  }

  /** 3~4명: 오른쪽 아래에 나 이외 사람들의 간단 상태 */
  private drawOthersList(s: GameState, opts: RenderOptions): void {
    const ctx = this.ctx
    const teams = isTeamMatch(s)
    const others = s.players.map((p, i) => ({ p, i })).filter((m) => m.i !== opts.localPlayer)
    const rowH = 30
    const w = 280
    const h = others.length * rowH + 14
    const x = VIEW_W - 24 - w
    const y = VIEW_H - 46 - h
    this.panel(x, y, w, h)
    others.forEach((m, r) => {
      const c = CHARACTERS[m.p.char]
      const ry = y + 8 + r * rowH
      ctx.fillStyle = m.p.left ? '#555' : hex(c.bodyColor)
      roundRect(ctx, x + 10, ry + 4, 4, rowH - 10, 2)
      ctx.fill()
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      ctx.font = '600 13px "IBM Plex Sans KR", "Malgun Gothic", sans-serif'
      ctx.fillStyle = m.p.left ? '#777' : '#e6edf3'
      ctx.fillText(opts.names[m.i], x + 22, ry + rowH / 2 - 1)
      if (teams) {
        ctx.font = '500 10px "IBM Plex Mono", monospace'
        ctx.fillStyle = TEAM_COLORS[m.p.team] ?? '#999'
        ctx.fillText(TEAM_NAMES[m.p.team] ?? '', x + 22 + ctx.measureText(opts.names[m.i]).width + 30, ry + rowH / 2 - 1)
      }
      // 체력 바는 관전자와 아군에게만. 상대 정보는 숨긴다
      const reveal = opts.localPlayer === -1 || (teams && opts.localPlayer >= 0 && s.players[opts.localPlayer].team === m.p.team)
      if (reveal) {
        const hpK = m.p.left ? 0 : Math.max(0, m.p.hp / c.maxHp)
        ctx.fillStyle = 'rgba(255,255,255,0.1)'
        roundRect(ctx, x + 150, ry + rowH / 2 - 4, 70, 8, 3)
        ctx.fill()
        ctx.fillStyle = !m.p.alive ? '#555' : hpK > 0.5 ? '#6fd66a' : hpK > 0.25 ? '#f2c94c' : '#f25c4c'
        roundRect(ctx, x + 150, ry + rowH / 2 - 4, 70 * hpK, 8, 3)
        ctx.fill()
      }
      ctx.font = '600 12px "IBM Plex Mono", monospace'
      ctx.textAlign = 'right'
      ctx.fillStyle = '#a9b4c0'
      const status = m.p.left ? '나감' : m.p.choosing ? '캐릭터 선택 중' : !m.p.alive ? `리스폰 ${Math.ceil(m.p.respawnTimer / 60)}` : `${m.p.kills}킬`
      ctx.fillText(status, x + w - 12, ry + rowH / 2 - 1)
    })
  }

  private drawPlayerCard(p: PlayerState, c: CharacterDef, name: string, x: number, y: number, side: 'left' | 'right', isLocal: boolean): void {
    const ctx = this.ctx
    const w = WEAPONS[p.weapon]
    const cw = 300
    const ch = 92
    const bx = side === 'left' ? x : x - cw
    const by = y - ch
    ctx.fillStyle = 'rgba(13,17,23,0.8)'
    roundRect(ctx, bx, by, cw, ch, 8)
    ctx.fill()
    if (isLocal) {
      ctx.strokeStyle = 'rgba(227,179,65,0.7)'
      ctx.lineWidth = 1.5
      roundRect(ctx, bx + 0.5, by + 0.5, cw - 1, ch - 1, 8)
      ctx.stroke()
    }
    ctx.fillStyle = hex(c.bodyColor)
    roundRect(ctx, side === 'left' ? bx : bx + cw - 6, by, 6, ch, 3)
    ctx.fill()
    const ix = bx + 18
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
    ctx.font = '600 16px "IBM Plex Sans KR", "Malgun Gothic", sans-serif'
    ctx.fillStyle = '#e6edf3'
    ctx.fillText(name, ix, by + 24)
    ctx.font = '400 11px "IBM Plex Sans KR", sans-serif'
    ctx.fillStyle = '#7d8896'
    ctx.fillText(`${c.passiveName} · ${c.basedOn}`, ix + ctx.measureText(name).width + 60, by + 24)
    const hpK = Math.max(0, p.hp / c.maxHp)
    ctx.fillStyle = 'rgba(255,255,255,0.1)'
    roundRect(ctx, ix, by + 34, 200, 12, 4)
    ctx.fill()
    ctx.fillStyle = !p.alive ? '#555' : hpK > 0.5 ? '#6fd66a' : hpK > 0.25 ? '#f2c94c' : '#f25c4c'
    roundRect(ctx, ix, by + 34, 200 * hpK, 12, 4)
    ctx.fill()
    ctx.font = '600 12px "IBM Plex Mono", monospace'
    ctx.fillStyle = '#e6edf3'
    ctx.fillText(p.alive ? `${Math.ceil(p.hp)} / ${c.maxHp}` : p.left ? '나감' : p.choosing ? '선택 중' : `리스폰 ${Math.ceil(p.respawnTimer / 60)}`, ix + 208, by + 45)
    ctx.font = '500 12px "IBM Plex Sans KR", sans-serif'
    ctx.fillStyle = '#a9b4c0'
    ctx.fillText(w.name, ix, by + 70)
    const infinite = w.magSize === 0
    ctx.font = '400 30px "Black Han Sans", "IBM Plex Sans KR", sans-serif'
    ctx.fillStyle = p.reloadTimer > 0 ? '#f2c94c' : '#e6edf3'
    ctx.fillText(infinite ? '∞' : p.reloadTimer > 0 ? '재장전' : `${p.ammo}`, ix + 60, by + 78)
    if (infinite) {
      ctx.font = '500 12px "IBM Plex Sans KR", sans-serif'
      ctx.fillStyle = '#7d8896'
      ctx.fillText('근접', ix + 88, by + 76)
    } else if (p.reloadTimer === 0) {
      ctx.font = '500 13px "IBM Plex Mono", monospace'
      ctx.fillStyle = '#7d8896'
      ctx.fillText(`/ ${w.magSize}`, ix + 60 + ctx.measureText(`${p.ammo}`).width + 26, by + 76)
    } else {
      const k = 1 - p.reloadTimer / w.reloadTicks
      ctx.fillStyle = 'rgba(255,255,255,0.1)'
      roundRect(ctx, ix + 140, by + 66, 100, 6, 3)
      ctx.fill()
      ctx.fillStyle = '#f2c94c'
      roundRect(ctx, ix + 140, by + 66, 100 * k, 6, 3)
      ctx.fill()
    }
    const sk = Math.max(0, Math.min(1, p.stamina / STAMINA_MAX))
    ctx.fillStyle = 'rgba(255,255,255,0.1)'
    roundRect(ctx, ix + 208, by + 58, 60, 6, 3)
    ctx.fill()
    ctx.fillStyle = sk > 0.34 ? '#9fe0ff' : '#e08a5a'
    roundRect(ctx, ix + 208, by + 58, 60 * sk, 6, 3)
    ctx.fill()
    ctx.font = '400 10px "IBM Plex Sans KR", sans-serif'
    ctx.fillStyle = '#7d8896'
    ctx.fillText('기력', ix + 208, by + 78)
    if (p.legInjury > 0) {
      ctx.fillStyle = '#f2c94c'
      ctx.fillText('다리 부상', ix + 236, by + 78)
    }
  }

  private drawBanner(s: GameState, opts: RenderOptions): void {
    const b = this.banner
    const ctx = this.ctx
    if (b && s.phase !== 'over') {
      const k = b.life / b.max
      const inK = Math.min(1, (b.max - b.life) * 6)
      ctx.globalAlpha = Math.min(1, k * 4) * inK
      const y = 120
      ctx.font = '400 34px "Black Han Sans", "IBM Plex Sans KR", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const tw = ctx.measureText(b.text).width + 60
      ctx.fillStyle = 'rgba(13,17,23,0.82)'
      roundRect(ctx, VIEW_W / 2 - tw / 2, y - 26, tw, 52, 6)
      ctx.fill()
      ctx.fillStyle = b.color
      roundRect(ctx, VIEW_W / 2 - tw / 2, y - 26, 6, 52, 3)
      ctx.fill()
      ctx.fillStyle = '#e6edf3'
      ctx.fillText(b.text, VIEW_W / 2 + 4, y)
      ctx.globalAlpha = 1
    }
    const wi = s.winner
    if (s.phase === 'over' && wi !== -1) {
      const teams = isTeamMatch(s)
      const title = teams ? `${TEAM_NAMES[wi] ?? '?'} 승리` : `${opts.names[wi] ?? CHARACTERS[s.players[wi].char].name} 승리`
      const color = teams ? TEAM_COLORS[wi] ?? '#fff' : hex(CHARACTERS[s.players[wi].char].bodyColor)
      const k = Math.min(1, this.overT * 1.5)
      ctx.fillStyle = `rgba(10,12,8,${0.55 * k})`
      ctx.fillRect(0, 0, VIEW_W, VIEW_H)
      ctx.save()
      ctx.translate(VIEW_W / 2, VIEW_H / 2 - 30)
      const sc = 1 + (1 - k) * 0.6
      ctx.scale(sc, sc)
      ctx.globalAlpha = k
      ctx.font = '400 84px "Black Han Sans", "IBM Plex Sans KR", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineWidth = 10
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'
      ctx.strokeText(title, 0, 0)
      ctx.fillStyle = color
      ctx.fillText(title, 0, 0)
      ctx.restore()
      ctx.globalAlpha = k
      ctx.font = '400 40px "Black Han Sans", "IBM Plex Sans KR", sans-serif'
      ctx.fillStyle = '#e6edf3'
      ctx.textAlign = 'center'
      const score = teams
        ? `${teamKills(s, 0)}  :  ${teamKills(s, 1)}`
        : s.players.length === 2
          ? `${s.players[0].kills}  :  ${s.players[1].kills}`
          : s.players.map((p, i) => `${opts.names[i]} ${p.kills}`).join('  ·  ')
      ctx.fillText(score, VIEW_W / 2, VIEW_H / 2 + 44)
      ctx.font = '500 14px "IBM Plex Sans KR", sans-serif'
      ctx.fillStyle = '#a9b4c0'
      ctx.fillText(`목표 ${s.targetKills}킬 달성`, VIEW_W / 2, VIEW_H / 2 + 84)
      ctx.globalAlpha = 1
    }
  }

  private drawCursor(cur: { x: number; y: number }, me: PlayerState): void {
    const ctx = this.ctx
    const r = me.ads ? 6 : 12 + me.recoil * 0.4
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cur.x - r - 6, cur.y)
    ctx.lineTo(cur.x - r, cur.y)
    ctx.moveTo(cur.x + r, cur.y)
    ctx.lineTo(cur.x + r + 6, cur.y)
    ctx.moveTo(cur.x, cur.y - r - 6)
    ctx.lineTo(cur.x, cur.y - r)
    ctx.moveTo(cur.x, cur.y + r)
    ctx.lineTo(cur.x, cur.y + r + 6)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.beginPath()
    ctx.arc(cur.x, cur.y, 1.5, 0, Math.PI * 2)
    ctx.fill()
  }
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
  ctx.lineTo(x + rr, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr)
  ctx.lineTo(x, y + rr)
  ctx.quadraticCurveTo(x, y, x + rr, y)
  ctx.closePath()
}

export function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0')
}
