// Canvas 2D 렌더러. sim 상태(prev, curr)를 보간해 그린다. sim 을 절대 변경하지 않는다.

import { CHARACTERS, CharacterDef } from '../core/characters'
import { drawCharacter, drawFlat } from './character'
import { angleToRad } from '../core/fixedmath'
import { GameMap, TILE, isWall } from '../core/map'
import { GameState, PLAYER_RADIUS, PlayerState, SimEvent } from '../core/state'
import { PART_HEAD, WEAPONS } from '../core/weapons'

export const VIEW_W = 1280
export const VIEW_H = 720

export interface RenderOptions {
  showHud: boolean
  /** -1 이면 관전(시네마틱) */
  localPlayer: 0 | 1 | -1
  cameraMode: 'follow' | 'both'
  names: [string, string]
  subLabels: [string, string]
  ping?: number
  message?: string
  /** 화면 좌표 커서 (로컬 플레이어용 조준선) */
  cursor?: { x: number; y: number }
  timeScale?: number
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  color: string
  gravity: number
  shape: 'dot' | 'feather' | 'shard'
  rot: number
  vr: number
}

interface FloatText {
  x: number
  y: number
  text: string
  life: number
  max: number
  color: string
  big: boolean
}

interface Ring {
  x: number
  y: number
  life: number
  max: number
  color: string
  r0: number
  r1: number
}

interface Muzzle {
  x: number
  y: number
  rad: number
  life: number
  size: number
}

interface Banner {
  text: string
  sub: string
  life: number
  max: number
  color: string
}

interface DuckVis {
  sx: number
  sy: number
  vsx: number
  vsy: number
  walk: number
  flash: number
  deadT: number
  lastAlive: boolean
  hitDir: number
}

const FLOOR = '#d8d3bf'
const FLOOR_ALT = '#d1cbb6'
const FLOOR_LINE = '#c4bda6'
const WALL_TOP = '#6f7754'
const WALL_TOP_LIGHT = '#8a9268'
const WALL_FRONT = '#464c37'
const WALL_EDGE = '#2e3325'
const OUTSIDE = '#1c1f17'
const OUTLINE = '#2b2412'
const WALL_H = 34
/** 쿼터뷰 투영: 화면 y = 월드 y × PITCH (카메라를 기울인 효과) */
export const PITCH = 0.72

export class Renderer {
  readonly ctx: CanvasRenderingContext2D
  private floor: HTMLCanvasElement
  private particles: Particle[] = []
  private texts: FloatText[] = []
  private rings: Ring[] = []
  private muzzles: Muzzle[] = []
  private banner: Banner | null = null
  private ducks: [DuckVis, DuckVis] = [newDuckVis(), newDuckVis()]
  private shake = 0
  private shakeX = 0
  private shakeY = 0
  cam = { x: 640, y: 480, zoom: 1 }
  private camInit = false
  private countdownPulse = 0
  private lastCountdownSec = -1
  private overT = 0
  private dpr = 1
  private t = 0

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly map: GameMap,
  ) {
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('canvas 2d 컨텍스트를 만들 수 없습니다')
    this.ctx = ctx
    this.floor = this.buildFloor()
    this.resize()
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    this.canvas.width = Math.round(VIEW_W * this.dpr)
    this.canvas.height = Math.round(VIEW_H * this.dpr)
  }

  /** 화면 좌표 → 월드 좌표 */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - VIEW_W / 2) / this.cam.zoom + this.cam.x,
      y: ((sy - VIEW_H / 2) / this.cam.zoom + this.cam.y) / PITCH,
    }
  }

  private buildFloor(): HTMLCanvasElement {
    const c = document.createElement('canvas')
    c.width = this.map.pw
    c.height = this.map.ph
    const g = c.getContext('2d')!
    g.fillStyle = FLOOR
    g.fillRect(0, 0, c.width, c.height)
    for (let ty = 0; ty < this.map.h; ty++) {
      for (let tx = 0; tx < this.map.w; tx++) {
        if (isWall(this.map, tx, ty)) continue
        const h = ((tx * 73856093) ^ (ty * 19349663)) >>> 0
        if (h % 7 === 0) {
          g.fillStyle = FLOOR_ALT
          g.fillRect(tx * TILE, ty * TILE, TILE, TILE)
        }
      }
    }
    g.strokeStyle = FLOOR_LINE
    g.lineWidth = 1
    g.beginPath()
    for (let x = 0; x <= this.map.w; x++) {
      g.moveTo(x * TILE + 0.5, 0)
      g.lineTo(x * TILE + 0.5, c.height)
    }
    for (let y = 0; y <= this.map.h; y++) {
      g.moveTo(0, y * TILE + 0.5)
      g.lineTo(c.width, y * TILE + 0.5)
    }
    g.stroke()
    // 바닥에 은은한 원형 무늬 (스튜디오 조명 느낌)
    const grad = g.createRadialGradient(c.width / 2, c.height / 2, 80, c.width / 2, c.height / 2, 700)
    grad.addColorStop(0, 'rgba(255,250,225,0.18)')
    grad.addColorStop(1, 'rgba(0,0,0,0.12)')
    g.fillStyle = grad
    g.fillRect(0, 0, c.width, c.height)
    return c
  }

  // ---------- 이벤트 → 이펙트 ----------
  onEvents(events: SimEvent[], state: GameState, localPlayer: number): void {
    for (const e of events) {
      switch (e.type) {
        case 'fire': {
          const w = WEAPONS[e.weapon]
          this.muzzles.push({ x: e.x, y: e.y * PITCH - 10, rad: angleToRad(e.aim), life: 0.07, size: w.pellets > 1 ? 22 : 14 })
          const v = this.ducks[e.p]
          v.vsx -= 0.18
          v.vsy += 0.12
          if (e.p === localPlayer) this.shake = Math.max(this.shake, w.pellets > 1 ? 4 : 1.5)
          break
        }
        case 'wall': {
          const rad = angleToRad(e.aim)
          for (let i = 0; i < 4; i++) {
            const a = rad + Math.PI + (Math.random() - 0.5) * 1.6
            const sp = 1.5 + Math.random() * 3
            this.particles.push({
              x: e.x, y: e.y * PITCH - 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.25, max: 0.25,
              size: 2, color: '#f2e6b3', gravity: 0.15, shape: 'dot', rot: 0, vr: 0,
            })
          }
          break
        }
        case 'hit': {
          const v = this.ducks[e.p]
          v.flash = 0.12
          v.vsx += 0.35
          v.vsy -= 0.3
          const head = e.part === PART_HEAD
          this.texts.push({
            x: e.x, y: e.y * PITCH - 28, text: head ? `${e.dmg} 헤드` : `${e.dmg}`,
            life: 0.8, max: 0.8, color: head ? '#ffd84a' : '#ffffff', big: head,
          })
          for (let i = 0; i < 6; i++) {
            const a = Math.random() * Math.PI * 2
            const sp = 1 + Math.random() * 2.5
            this.particles.push({
              x: e.x, y: e.y * PITCH - 14, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 0.4, max: 0.4,
              size: 3, color: '#e04a3a', gravity: 0.12, shape: 'dot', rot: 0, vr: 0,
            })
          }
          if (e.p === localPlayer) this.shake = Math.max(this.shake, 5)
          break
        }
        case 'death': {
          const v = this.ducks[e.p]
          v.deadT = 0
          const c = CHARACTERS[state.players[e.p].char]
          const col = hex(c.bodyColor)
          for (let i = 0; i < 18; i++) {
            const a = Math.random() * Math.PI * 2
            const sp = 1.5 + Math.random() * 4
            this.particles.push({
              x: e.x, y: e.y * PITCH - 12, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2.5, life: 1.4, max: 1.4,
              size: 4 + Math.random() * 3, color: col, gravity: 0.06, shape: 'feather',
              rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
            })
          }
          this.rings.push({ x: e.x, y: e.y * PITCH, life: 0.5, max: 0.5, color: '#ffffff', r0: 8, r1: 60 })
          const killer = CHARACTERS[state.players[e.by].char]
          const victim = CHARACTERS[state.players[e.p].char]
          this.banner = { text: `${killer.name}  ▶  ${victim.name}`, sub: `${state.players[e.by].kills} / ${state.targetKills}`, life: 1.6, max: 1.6, color: hex(killer.bodyColor) }
          this.shake = Math.max(this.shake, e.p === localPlayer ? 10 : 6)
          break
        }
        case 'respawn': {
          this.rings.push({ x: e.x, y: e.y * PITCH, life: 0.6, max: 0.6, color: '#9fe0ff', r0: 40, r1: 6 })
          const v = this.ducks[e.p]
          v.sx = 0.2
          v.sy = 1.6
          v.deadT = -1
          break
        }
        case 'dash': {
          const v = this.ducks[e.p]
          v.vsx += 0.4
          v.vsy -= 0.35
          break
        }
        case 'over': {
          this.overT = 0
          const c = CHARACTERS[state.players[e.winner].char]
          this.banner = { text: `${c.name} 승리!`, sub: `${state.players[0].kills} : ${state.players[1].kills}`, life: 6, max: 6, color: hex(c.bodyColor) }
          break
        }
        default:
          break
      }
    }
  }

  // ---------- 프레임 ----------
  draw(prev: GameState, curr: GameState, alpha: number, dt: number, opts: RenderOptions): void {
    const ctx = this.ctx
    this.t += dt
    const ts = opts.timeScale ?? 1
    this.updateEffects(dt * ts)
    this.updateCamera(prev, curr, alpha, dt, opts)

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.fillStyle = OUTSIDE
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)

    ctx.save()
    ctx.translate(VIEW_W / 2 + this.shakeX, VIEW_H / 2 + this.shakeY)
    ctx.scale(this.cam.zoom, this.cam.zoom)
    ctx.translate(-this.cam.x, -this.cam.y)

    // 바닥
    ctx.save()
    ctx.scale(1, PITCH)
    ctx.drawImage(this.floor, 0, 0)
    ctx.restore()

    // 플레이어 보간 위치
    const pos: { x: number; y: number }[] = [0, 1].map((i) => {
      const a = prev.players[i]
      const b = curr.players[i]
      if (!b.alive || b.aliveTicks <= 1) return { x: b.x, y: b.y }
      return { x: a.x + (b.x - a.x) * alpha, y: a.y + (b.y - a.y) * alpha }
    })

    // 벽과 캐릭터를 행 단위로 y 정렬
    const rowOf = (y: number) => Math.floor((y + PLAYER_RADIUS - 2) / TILE)
    const drawn = [false, false]
    for (let ty = 0; ty < this.map.h; ty++) {
      this.drawWallRow(ty)
      for (let i = 0; i < 2; i++) {
        if (drawn[i]) continue
        if (rowOf(pos[i].y) <= ty) {
          this.drawDuck(curr.players[i], pos[i], dt * ts, i === opts.localPlayer, opts.names[i])
          drawn[i] = true
        }
      }
    }
    for (let i = 0; i < 2; i++) if (!drawn[i]) this.drawDuck(curr.players[i], pos[i], dt * ts, i === opts.localPlayer, opts.names[i])

    this.drawBullets(prev, curr, alpha)
    this.drawEffects()
    ctx.restore()

    this.drawVignette()
    if (opts.showHud) this.drawHud(curr, opts)
    this.drawBanner(curr, opts)
    const lp = opts.localPlayer
    if (opts.cursor && lp !== -1) this.drawCursor(opts.cursor, curr.players[lp])
  }

  private updateEffects(dt: number): void {
    const p = this.particles
    for (let i = p.length - 1; i >= 0; i--) {
      const q = p[i]
      q.life -= dt
      if (q.life <= 0) {
        p[i] = p[p.length - 1]
        p.pop()
        continue
      }
      const k = dt * 60
      q.x += q.vx * k
      q.y += q.vy * k
      q.vy += q.gravity * k
      q.vx *= 1 - 0.04 * k
      q.vy *= 1 - 0.04 * k
      q.rot += q.vr * k
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i]
      t.life -= dt
      t.y -= 30 * dt
      if (t.life <= 0) this.texts.splice(i, 1)
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      this.rings[i].life -= dt
      if (this.rings[i].life <= 0) this.rings.splice(i, 1)
    }
    for (let i = this.muzzles.length - 1; i >= 0; i--) {
      this.muzzles[i].life -= dt
      if (this.muzzles[i].life <= 0) this.muzzles.splice(i, 1)
    }
    if (this.banner) {
      this.banner.life -= dt
      if (this.banner.life <= 0) this.banner = null
    }
    this.overT += dt
    this.shake = Math.max(0, this.shake - dt * 40)
    this.shakeX = (Math.random() - 0.5) * this.shake * 2
    this.shakeY = (Math.random() - 0.5) * this.shake * 2
    for (const v of this.ducks) {
      // 스프링 (말랑)
      const k = 220
      const damp = 14
      const ax = -k * (v.sx - 1) - damp * v.vsx
      const ay = -k * (v.sy - 1) - damp * v.vsy
      v.vsx += ax * dt
      v.vsy += ay * dt
      v.sx += v.vsx * dt
      v.sy += v.vsy * dt
      v.flash = Math.max(0, v.flash - dt)
      if (v.deadT >= 0) v.deadT += dt
    }
  }

  private updateCamera(prev: GameState, curr: GameState, alpha: number, dt: number, opts: RenderOptions): void {
    const lerpP = (i: number) => {
      const a = prev.players[i]
      const b = curr.players[i]
      return { x: a.x + (b.x - a.x) * alpha, y: a.y + (b.y - a.y) * alpha }
    }
    let tx: number
    let ty: number
    let tz = 1
    const p0 = lerpP(0)
    const p1 = lerpP(1)
    const lp = opts.localPlayer
    if (opts.cameraMode === 'both' || lp === -1) {
      const a0 = curr.players[0].alive
      const a1 = curr.players[1].alive
      if (a0 && a1) {
        tx = (p0.x + p1.x) / 2
        ty = ((p0.y + p1.y) / 2) * PITCH
        const dx = Math.abs(p0.x - p1.x) + 420
        const dy = Math.abs(p0.y - p1.y) * PITCH + 300
        tz = Math.min(VIEW_W / dx, VIEW_H / dy)
        tz = Math.max(1.4, Math.min(2.0, tz))
        // 너무 멀리 떨어져 있으면 둘의 중점 대신 살아있는 첫 플레이어 쪽으로 치우침
        const far = Math.hypot(p0.x - p1.x, p0.y - p1.y)
        if (far > 640) {
          const k = Math.min(1, (far - 640) / 400)
          tx = tx * (1 - k) + p0.x * k
          ty = ty * (1 - k) + p0.y * PITCH * k
          tz = 1.5
        }
      } else if (a0 || a1) {
        const p = a0 ? p0 : p1
        tx = p.x
        ty = p.y * PITCH
        tz = 1.6
      } else {
        tx = this.cam.x
        ty = this.cam.y
      }
    } else {
      const me = curr.players[lp]
      const p = lp === 0 ? p0 : p1
      tx = p.x
      ty = p.y * PITCH
      if (me.alive && me.ads) {
        const r = angleToRad(me.aim)
        tx += Math.cos(r) * 110
        ty += Math.sin(r) * 110 * PITCH
      }
      tz = 1.5
    }
    // 맵 밖이 덜 보이도록 클램프
    const halfW = VIEW_W / 2 / tz
    const halfH = VIEW_H / 2 / tz
    tx = Math.max(halfW - 40, Math.min(this.map.pw - halfW + 40, tx))
    ty = Math.max(halfH - 40, Math.min(this.map.ph * PITCH - halfH + 40, ty))
    if (!this.camInit) {
      this.cam.x = tx
      this.cam.y = ty
      this.cam.zoom = tz
      this.camInit = true
      return
    }
    const s = 1 - Math.pow(0.001, dt)
    this.cam.x += (tx - this.cam.x) * s
    this.cam.y += (ty - this.cam.y) * s
    this.cam.zoom += (tz - this.cam.zoom) * s * 0.6
  }

  private drawWallRow(ty: number): void {
    const ctx = this.ctx
    const m = this.map
    for (let tx = 0; tx < m.w; tx++) {
      if (!isWall(m, tx, ty)) continue
      const x = tx * TILE
      const y0 = ty * TILE * PITCH
      const th = TILE * PITCH
      const below = isWall(m, tx, ty + 1)
      const above = isWall(m, tx, ty - 1)
      const left = isWall(m, tx - 1, ty)
      const right = isWall(m, tx + 1, ty)
      if (!below) {
        // 바닥 그림자
        ctx.fillStyle = 'rgba(0,0,0,0.16)'
        ctx.fillRect(x, y0 + th, TILE, 7)
        // 앞면
        const g = ctx.createLinearGradient(0, y0 + th - WALL_H, 0, y0 + th)
        g.addColorStop(0, WALL_FRONT)
        g.addColorStop(1, '#31362a')
        ctx.fillStyle = g
        ctx.fillRect(x, y0 + th - WALL_H, TILE, WALL_H)
        ctx.strokeStyle = WALL_EDGE
        ctx.lineWidth = 1
        ctx.strokeRect(x + 0.5, y0 + th - WALL_H + 0.5, TILE - 1, WALL_H - 1)
      }
      // 윗면
      ctx.fillStyle = WALL_TOP
      ctx.fillRect(x, y0 - WALL_H, TILE, th)
      if (!above) {
        ctx.fillStyle = WALL_TOP_LIGHT
        ctx.fillRect(x, y0 - WALL_H, TILE, 3)
      }
      ctx.strokeStyle = WALL_EDGE
      ctx.lineWidth = 1
      ctx.beginPath()
      if (!above) {
        ctx.moveTo(x, y0 - WALL_H + 0.5)
        ctx.lineTo(x + TILE, y0 - WALL_H + 0.5)
      }
      if (!left) {
        ctx.moveTo(x + 0.5, y0 - WALL_H)
        ctx.lineTo(x + 0.5, y0 - WALL_H + th)
      }
      if (!right) {
        ctx.moveTo(x + TILE - 0.5, y0 - WALL_H)
        ctx.lineTo(x + TILE - 0.5, y0 - WALL_H + th)
      }
      ctx.stroke()
    }
  }

  private drawDuck(p: PlayerState, pos: { x: number; y: number }, dt: number, isLocal: boolean, name: string): void {
    const ctx = this.ctx
    const v = this.ducks[p.id]
    const c = CHARACTERS[p.char]
    const w = WEAPONS[p.weapon]
    const rad = angleToRad(p.aim)
    const sn = Math.sin(rad)

    if (!p.alive) {
      if (v.deadT < 0 || v.deadT > 1.2) return
      const k = 1 - v.deadT / 1.2
      ctx.save()
      ctx.translate(pos.x, pos.y * PITCH + 6)
      drawFlat(ctx, c, Math.min(1, k * 1.5))
      ctx.restore()
      return
    }

    if (p.moving) v.walk += dt * 14
    else v.walk = 0
    const bob = p.moving ? Math.abs(Math.sin(v.walk)) * 2.5 : 0
    const stretch = p.moving ? 1 + Math.sin(v.walk * 2) * 0.03 : 1
    const sx = v.sx / stretch
    const sy = v.sy * stretch

    // 그림자
    ctx.fillStyle = 'rgba(0,0,0,0.22)'
    ellipse(ctx, pos.x, pos.y * PITCH + 12, 15 * sx * c.look.bodyScale, 5)
    ctx.fill()

    // 스폰 보호 링
    if (p.invuln > 0) {
      ctx.strokeStyle = `rgba(159,224,255,${0.35 + 0.3 * Math.sin(this.t * 12)})`
      ctx.lineWidth = 2
      ellipse(ctx, pos.x, pos.y * PITCH + 10, PLAYER_RADIUS + 10, (PLAYER_RADIUS + 10) * PITCH)
      ctx.stroke()
    }

    // 뒤쪽 무기 (위를 볼 때)
    const weaponBehind = sn < -0.2
    if (weaponBehind) this.drawWeapon(pos, rad, w.length, w.color)

    ctx.save()
    ctx.translate(pos.x, pos.y * PITCH - bob)
    ctx.scale(sx, sy)
    drawCharacter(ctx, c, { facing: rad, sx, sy, walk: v.walk, moving: p.moving, flash: v.flash, t: this.t })
    ctx.restore()

    if (!weaponBehind) this.drawWeapon(pos, rad, w.length, w.color)

    // 이름표 + 미니 체력바 (머리 위)
    const maxHp = c.maxHp
    const hpK = Math.max(0, p.hp / maxHp)
    const ty = pos.y * PITCH - 8 - 25 * c.look.headScale - 12
    ctx.font = '600 11px "IBM Plex Sans KR", "Malgun Gothic", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'
    ctx.strokeText(name, pos.x, ty)
    ctx.fillStyle = isLocal ? '#ffe680' : '#ffffff'
    ctx.fillText(name, pos.x, ty)
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    roundRect(ctx, pos.x - 16, ty + 3, 32, 5, 2)
    ctx.fill()
    ctx.fillStyle = hpK > 0.5 ? '#6fd66a' : hpK > 0.25 ? '#f2c94c' : '#f25c4c'
    roundRect(ctx, pos.x - 15, ty + 4, 30 * hpK, 3, 1.5)
    ctx.fill()
  }

  private drawWeapon(pos: { x: number; y: number }, rad: number, length: number, color: number): void {
    const ctx = this.ctx
    ctx.save()
    ctx.translate(pos.x + Math.cos(rad) * 6, pos.y * PITCH + 2 + Math.sin(rad) * 6 * PITCH)
    ctx.scale(1, PITCH)
    ctx.rotate(rad)
    ctx.fillStyle = hex(color)
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 1.5
    roundRect(ctx, 4, -2.5, length, 5, 1.5)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#3b3227'
    roundRect(ctx, 6, -1, 6, 5, 1)
    ctx.fill()
    ctx.restore()
  }

  private drawBullets(prev: GameState, curr: GameState, alpha: number): void {
    const ctx = this.ctx
    const prevById = new Map<number, { x: number; y: number }>()
    for (const b of prev.bullets) prevById.set(b.id, { x: b.x, y: b.y })
    for (const b of curr.bullets) {
      const pb = prevById.get(b.id) ?? { x: b.px, y: b.py }
      const x = pb.x + (b.x - pb.x) * alpha
      const y = (pb.y + (b.y - pb.y) * alpha) * PITCH - 10
      const w = WEAPONS[b.weapon]
      const trail = Math.min(26, w.speed * 1.4)
      const l = Math.hypot(b.vx, b.vy) || 1
      const ux = b.vx / l
      const uy = b.vy / l
      ctx.strokeStyle = 'rgba(255,214,90,0.55)'
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(x - ux * trail, y - uy * PITCH * trail)
      ctx.lineTo(x, y)
      ctx.stroke()
      ctx.fillStyle = '#fff3b0'
      circle(ctx, x, y, 2.4)
      ctx.fill()
    }
    for (const m of this.muzzles) {
      const k = m.life / 0.07
      ctx.save()
      ctx.translate(m.x, m.y)
      ctx.scale(1, PITCH)
      ctx.rotate(m.rad)
      ctx.fillStyle = `rgba(255,230,120,${0.9 * k})`
      ctx.beginPath()
      ctx.moveTo(0, -m.size * 0.35)
      ctx.lineTo(m.size, 0)
      ctx.lineTo(0, m.size * 0.35)
      ctx.lineTo(m.size * 0.3, 0)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = `rgba(255,255,255,${0.8 * k})`
      circle(ctx, m.size * 0.25, 0, m.size * 0.2)
      ctx.fill()
      ctx.restore()
    }
  }

  private drawEffects(): void {
    const ctx = this.ctx
    for (const q of this.particles) {
      const k = q.life / q.max
      ctx.globalAlpha = Math.min(1, k * 1.6)
      ctx.fillStyle = q.color
      if (q.shape === 'feather') {
        ctx.save()
        ctx.translate(q.x, q.y)
        ctx.rotate(q.rot)
        ellipse(ctx, 0, 0, q.size, q.size * 0.45)
        ctx.fill()
        ctx.strokeStyle = OUTLINE
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.restore()
      } else {
        circle(ctx, q.x, q.y, q.size * (0.5 + k * 0.5))
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1
    for (const r of this.rings) {
      const k = 1 - r.life / r.max
      const rad = r.r0 + (r.r1 - r.r0) * k
      ctx.strokeStyle = r.color
      ctx.globalAlpha = 1 - k
      ctx.lineWidth = 3
      ellipse(ctx, r.x, r.y, rad, rad * PITCH)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    for (const t of this.texts) {
      const k = t.life / t.max
      ctx.globalAlpha = Math.min(1, k * 2)
      ctx.font = `${t.big ? 800 : 700} ${t.big ? 18 : 14}px "IBM Plex Sans KR", "Malgun Gothic", sans-serif`
      ctx.textAlign = 'center'
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'
      ctx.strokeText(t.text, t.x, t.y)
      ctx.fillStyle = t.color
      ctx.fillText(t.text, t.x, t.y)
    }
    ctx.globalAlpha = 1
  }

  private drawVignette(): void {
    const ctx = this.ctx
    const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.45, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.75)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, 'rgba(0,0,0,0.42)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  }

  private drawHud(s: GameState, opts: RenderOptions): void {
    const ctx = this.ctx
    const c0 = CHARACTERS[s.players[0].char]
    const c1 = CHARACTERS[s.players[1].char]

    // 상단 점수판
    const pw = 420
    const px = VIEW_W / 2 - pw / 2
    ctx.fillStyle = 'rgba(20,22,16,0.78)'
    roundRect(ctx, px, 14, pw, 62, 8)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 1
    roundRect(ctx, px + 0.5, 14.5, pw - 1, 61, 8)
    ctx.stroke()
    ctx.textBaseline = 'middle'
    ctx.font = '400 40px "Black Han Sans", "IBM Plex Sans KR", "Malgun Gothic", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#f5f2e6'
    ctx.fillText(`${s.players[0].kills}`, VIEW_W / 2 - 60, 44)
    ctx.fillText(`${s.players[1].kills}`, VIEW_W / 2 + 60, 44)
    ctx.fillStyle = '#7d8471'
    ctx.font = '400 26px "Black Han Sans", "IBM Plex Sans KR", sans-serif'
    ctx.fillText(':', VIEW_W / 2, 43)
    ctx.font = '500 11px "IBM Plex Mono", "IBM Plex Sans KR", monospace'
    ctx.fillStyle = '#b3b8a5'
    ctx.fillText(`목표 ${s.targetKills} 킬`, VIEW_W / 2, 66)
    // 캐릭터 색 칩 + 이름
    ctx.font = '600 15px "IBM Plex Sans KR", "Malgun Gothic", sans-serif'
    ctx.textAlign = 'right'
    ctx.fillStyle = hex(c0.bodyColor)
    ctx.fillText(opts.names[0], VIEW_W / 2 - 100, 38)
    ctx.textAlign = 'left'
    ctx.fillStyle = hex(c1.bodyColor)
    ctx.fillText(opts.names[1], VIEW_W / 2 + 100, 38)
    ctx.font = '400 11px "IBM Plex Sans KR", sans-serif'
    ctx.fillStyle = '#8f957f'
    ctx.textAlign = 'right'
    ctx.fillText(opts.subLabels[0], VIEW_W / 2 - 100, 58)
    ctx.textAlign = 'left'
    ctx.fillText(opts.subLabels[1], VIEW_W / 2 + 100, 58)

    // 하단 플레이어 카드
    this.drawPlayerCard(s.players[0], c0, 24, VIEW_H - 24, 'left', opts.localPlayer === 0)
    this.drawPlayerCard(s.players[1], c1, VIEW_W - 24, VIEW_H - 24, 'right', opts.localPlayer === 1)

    // 카운트다운
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
      ctx.fillStyle = '#f5f2e6'
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
      ctx.fillStyle = 'rgba(20,22,16,0.8)'
      const tw = ctx.measureText(opts.message).width + 32
      roundRect(ctx, VIEW_W / 2 - tw / 2, VIEW_H / 2 + 100, tw, 34, 6)
      ctx.fill()
      ctx.fillStyle = '#f5f2e6'
      ctx.fillText(opts.message, VIEW_W / 2, VIEW_H / 2 + 117)
    }
  }

  private drawPlayerCard(p: PlayerState, c: CharacterDef, x: number, y: number, side: 'left' | 'right', isLocal: boolean): void {
    const ctx = this.ctx
    const w = WEAPONS[p.weapon]
    const cw = 300
    const ch = 92
    const bx = side === 'left' ? x : x - cw
    const by = y - ch
    ctx.fillStyle = 'rgba(20,22,16,0.78)'
    roundRect(ctx, bx, by, cw, ch, 8)
    ctx.fill()
    if (isLocal) {
      ctx.strokeStyle = 'rgba(255,216,74,0.6)'
      ctx.lineWidth = 1.5
      roundRect(ctx, bx + 0.5, by + 0.5, cw - 1, ch - 1, 8)
      ctx.stroke()
    }
    // 색 칩
    ctx.fillStyle = hex(c.bodyColor)
    roundRect(ctx, side === 'left' ? bx : bx + cw - 6, by, 6, ch, 3)
    ctx.fill()
    const ix = side === 'left' ? bx + 18 : bx + 18
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
    ctx.font = '600 16px "IBM Plex Sans KR", "Malgun Gothic", sans-serif'
    ctx.fillStyle = '#f5f2e6'
    ctx.fillText(c.name, ix, by + 24)
    ctx.font = '400 11px "IBM Plex Sans KR", sans-serif'
    ctx.fillStyle = '#8f957f'
    ctx.fillText(`${c.passiveName} · ${c.basedOn}`, ix + ctx.measureText(c.name).width + 60, by + 24)
    // HP
    const hpK = Math.max(0, p.hp / c.maxHp)
    ctx.fillStyle = 'rgba(255,255,255,0.1)'
    roundRect(ctx, ix, by + 34, 200, 12, 4)
    ctx.fill()
    ctx.fillStyle = !p.alive ? '#555' : hpK > 0.5 ? '#6fd66a' : hpK > 0.25 ? '#f2c94c' : '#f25c4c'
    roundRect(ctx, ix, by + 34, 200 * hpK, 12, 4)
    ctx.fill()
    ctx.font = '600 12px "IBM Plex Mono", monospace'
    ctx.fillStyle = '#f5f2e6'
    ctx.textAlign = 'left'
    ctx.fillText(p.alive ? `${Math.ceil(p.hp)} / ${c.maxHp}` : `리스폰 ${Math.ceil(p.respawnTimer / 60)}`, ix + 208, by + 45)
    // 무기 · 탄약
    ctx.font = '500 12px "IBM Plex Sans KR", sans-serif'
    ctx.fillStyle = '#b3b8a5'
    ctx.fillText(w.name, ix, by + 70)
    ctx.font = '400 30px "Black Han Sans", "IBM Plex Sans KR", sans-serif'
    ctx.fillStyle = p.reloadTimer > 0 ? '#f2c94c' : '#f5f2e6'
    ctx.fillText(p.reloadTimer > 0 ? '재장전' : `${p.ammo}`, ix + 60, by + 78)
    if (p.reloadTimer === 0) {
      ctx.font = '500 13px "IBM Plex Mono", monospace'
      ctx.fillStyle = '#8f957f'
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
    // 대시
    const dk = p.dashCooldown > 0 ? 1 - p.dashCooldown / c.dashCooldown : 1
    ctx.fillStyle = 'rgba(255,255,255,0.1)'
    roundRect(ctx, ix + 208, by + 58, 60, 6, 3)
    ctx.fill()
    ctx.fillStyle = dk >= 1 ? '#9fe0ff' : '#5b7c8a'
    roundRect(ctx, ix + 208, by + 58, 60 * dk, 6, 3)
    ctx.fill()
    ctx.font = '400 10px "IBM Plex Sans KR", sans-serif'
    ctx.fillStyle = '#8f957f'
    ctx.fillText('대시', ix + 208, by + 78)
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
      ctx.fillStyle = 'rgba(20,22,16,0.8)'
      roundRect(ctx, VIEW_W / 2 - tw / 2, y - 26, tw, 52, 6)
      ctx.fill()
      ctx.fillStyle = b.color
      roundRect(ctx, VIEW_W / 2 - tw / 2, y - 26, 6, 52, 3)
      ctx.fill()
      ctx.fillStyle = '#f5f2e6'
      ctx.fillText(b.text, VIEW_W / 2 + 4, y)
      ctx.globalAlpha = 1
    }
    const wi = s.winner
    if (s.phase === 'over' && wi !== -1) {
      const c = CHARACTERS[s.players[wi].char]
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
      ctx.strokeText(`${c.name} 승리`, 0, 0)
      ctx.fillStyle = hex(c.bodyColor)
      ctx.fillText(`${c.name} 승리`, 0, 0)
      ctx.restore()
      ctx.globalAlpha = k
      ctx.font = '400 40px "Black Han Sans", "IBM Plex Sans KR", sans-serif'
      ctx.fillStyle = '#f5f2e6'
      ctx.textAlign = 'center'
      ctx.fillText(`${s.players[0].kills}  :  ${s.players[1].kills}`, VIEW_W / 2, VIEW_H / 2 + 44)
      ctx.font = '500 14px "IBM Plex Sans KR", sans-serif'
      ctx.fillStyle = '#b3b8a5'
      const winnerLabel = opts.names[wi]
      ctx.fillText(`${winnerLabel} · 목표 ${s.targetKills}킬 달성`, VIEW_W / 2, VIEW_H / 2 + 84)
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
    circle(ctx, cur.x, cur.y, 1.5)
    ctx.fill()
  }
}

// ---------- 유틸 ----------
function newDuckVis(): DuckVis {
  return { sx: 1, sy: 1, vsx: 0, vsy: 0, walk: 0, flash: 0, deadT: -1, lastAlive: true, hitDir: 0 }
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.closePath()
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  ctx.beginPath()
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2)
  ctx.closePath()
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

