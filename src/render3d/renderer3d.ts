// Three.js 렌더러. sim 상태(prev, curr)를 보간해 그린다. sim 을 절대 바꾸지 않는다.
// 카메라: 고정 피치 55°, 요 45° 고정(camera.ts). HUD 는 2D 캔버스 오버레이. 인원 2~4명.

import * as THREE from 'three'
import { CHARACTERS } from '../core/characters'
import { angleToRad } from '../core/fixedmath'
import { GameMap, SANDBAG_HP, TILE } from '../core/map'
import { DASH_TICKS, GameState, PLAYER_RADIUS, PlayerState, STAMINA_MAX, SimEvent, isTeamMatch } from '../core/state'
import { PART_HEAD, WEAPONS } from '../core/weapons'
import { BASE_H, BASE_W, Hud, RenderOptions, ScreenText, TEAM_COLORS, VIEW_H, VIEW_W, hex, roundRect } from '../render/hud'
import { renderMapTiles } from '../render/minimap'
import { PITCH, YAW, worldDirToScreen } from './camera'
import { CharacterRig, buildCharacter, setRigOpacity } from './character3d'
import { VIEW_RADIUS_TILES, Viewer, Vision, canSee } from './vision'
import { U, World3D, buildWorld } from './world3d'

export { VIEW_W, VIEW_H }
export type { RenderOptions }

export { YAW }
const FOLLOW_DIST = 15.5
/** 기준 세로 시야각. 화면이 넓어지면 resize() 가 이 값을 줄여 보이는 면적을 유지한다 */
const BASE_FOV = 40
const GUN_H = 0.95

interface Particle {
  mesh: THREE.Mesh
  vx: number
  vy: number
  vz: number
  life: number
  max: number
  gravity: number
  spin: number
}

interface WorldText {
  x: number
  z: number
  y: number
  text: string
  life: number
  max: number
  color: string
  big: boolean
}

interface DuckVis {
  sx: number
  sy: number
  vsx: number
  vsy: number
  walk: number
  flash: number
  deadT: number
  fall: number
  /** 피격 튐 쿨다운 (한 틱에 여러 발 맞아도 한 번만) */
  hitCd: number
  /** 근접 휘두르기 (1 → 0) */
  swing: number
}

interface Flash {
  light: THREE.PointLight
  mesh: THREE.Mesh
  life: number
}

interface Ring {
  mesh: THREE.Mesh
  life: number
  max: number
  r0: number
  r1: number
}

/** 총성 위치 표시 (단군덕 패시브): 안 보이는 상대가 쏘면 그 자리를 잠깐 알려 준다 */
interface Ping {
  x: number
  z: number
  life: number
  max: number
}

export class Renderer3D {
  readonly canvas: HTMLCanvasElement
  readonly hud: Hud
  private gl: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private world: World3D
  private vision: Vision
  /** 시야 밖(안 보이는) 플레이어 */
  private hidden: boolean[] = []
  /**
   * 화면에 그리는 위치. sim 위치를 그대로 쓰면, 상대 입력이 늦어 멈췄다가
   * 한꺼번에 여러 틱을 처리할 때 **순간이동처럼** 보인다.
   * 그래서 실제 이동 속도보다 조금 빠른 상한을 두고 따라가게 한다(리스폰처럼 멀면 즉시 이동).
   */
  private dispPos: { x: number; z: number }[] = []
  /** 마지막으로 본 뒤 남은 시간 — 경계에서 깜빡이지 않도록 (초) */
  private seenT: number[] = []
  /** 스코프(저격 정조준) 중인가 */
  private scoped = false
  private miniCanvas: HTMLCanvasElement | null = null
  /** 모래주머니 내구도 표시 캐시 (타일 인덱스 → 마지막으로 칠한 비율) */
  private bagShown = new Map<number, number>()
  private lastViewer: Viewer | null = null
  private rigs: CharacterRig[] = []
  private rigChars: string[] = []
  private vis: DuckVis[] = []
  private aimSmooth: number[] = []
  /** 피격 후 체력 바를 보여 줄 남은 시간(초). 상대는 맞았을 때만 보인다 */
  private hitShow: number[] = []
  /** 힐팩 표시 (id → 메시). 흰 상자에 빨간 십자 */
  private medkitMeshes = new Map<number, THREE.Group>()
  private bulletPool: THREE.Mesh[] = []
  private particles: Particle[] = []
  private particlePool: THREE.Mesh[] = []
  private texts: WorldText[] = []
  private flashes: Flash[] = []
  private rings: Ring[] = []
  private pings: Ping[] = []
  /** 팀 신호 (같은 편이 찍은 "여기"). 지면 마커 + 화면 밖이면 가장자리 화살표 */
  private marks: { x: number; z: number; life: number; max: number; mesh: THREE.Mesh }[] = []
  private shake = 0
  private camTarget = new THREE.Vector3()
  private camDist = FOLLOW_DIST
  private camInit = false
  private t = 0
  private lastDt = 0.016
  private dpr = 1
  private bulletGeo = new THREE.SphereGeometry(0.07, 8, 6)
  private bulletMat = new THREE.MeshBasicMaterial({ color: 0xfff1a0 })
  private trailGeo = new THREE.BoxGeometry(0.05, 0.05, 0.6)
  private trailMat = new THREE.MeshBasicMaterial({ color: 0xffd65a, transparent: true, opacity: 0.55 })
  private trailPool: THREE.Mesh[] = []
  private particleGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1)
  private raycaster = new THREE.Raycaster()
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

  map: GameMap

  constructor(
    readonly container: HTMLElement,
    map: GameMap,
  ) {
    this.map = map
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'gl'
    const hudCanvas = document.createElement('canvas')
    hudCanvas.className = 'hud'
    container.appendChild(this.canvas)
    container.appendChild(hudCanvas)
    this.hud = new Hud(hudCanvas)

    this.gl = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
      // 스크린샷을 뜰 때만 켠다(기본은 성능 우선). 주소 뒤 ?shot=1
      preserveDrawingBuffer: typeof location !== 'undefined' && location.search.includes('shot=1'),
    })
    this.gl.shadowMap.enabled = true
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap
    this.gl.outputColorSpace = THREE.SRGBColorSpace
    this.gl.toneMapping = THREE.ACESFilmicToneMapping
    this.gl.toneMappingExposure = 1.05

    this.camera = new THREE.PerspectiveCamera(BASE_FOV, VIEW_W / VIEW_H, 0.5, 140)
    this.scene.background = new THREE.Color(map.theme.outside)
    this.scene.fog = new THREE.Fog(map.theme.fog, 34, 70)
    this.world = buildWorld(map)
    this.scene.add(this.world.group)
    this.vision = new Vision(map)
    this.scene.add(this.vision.group)
    this.resize()
  }

  /** 팀 신호를 찍는다 (sim 밖이라 결정론과 무관하다) */
  addMark(x: number, y: number): void {
    const geo = new THREE.RingGeometry(0.5, 0.72, 24)
    const mat = new THREE.MeshBasicMaterial({ color: 0x7ee0a0, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, depthTest: false })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(x * U, 0.06, y * U)
    mesh.renderOrder = 5
    this.scene.add(mesh)
    this.marks.push({ x: x * U, z: y * U, life: 6, max: 6, mesh })
    if (this.marks.length > 4) {
      const old = this.marks.shift()!
      this.scene.remove(old.mesh)
    }
  }

  /** 새 판(새 맵)으로 교체 */
  setMap(map: GameMap): void {
    this.scene.remove(this.world.group)
    this.world.dispose()
    this.scene.remove(this.vision.group)
    this.vision.dispose()
    this.map = map
    this.world = buildWorld(map)
    this.scene.add(this.world.group)
    this.vision = new Vision(map)
    this.scene.add(this.vision.group)
    this.scene.background = new THREE.Color(map.theme.outside)
    this.scene.fog = new THREE.Fog(map.theme.fog, 34, 70)
    this.miniCanvas = null
    this.bagShown.clear()
    for (const g of this.medkitMeshes.values()) this.scene.remove(g)
    this.medkitMeshes.clear()
    this.camInit = false
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    this.gl.setPixelRatio(this.dpr)
    this.gl.setSize(VIEW_W, VIEW_H, false)
    // 폭이 넓어진 만큼 좌우로 더 보이면 넓은 화면이 유리해진다.
    // 세로 시야를 sqrt(기준비율/현재비율) 만큼 좁혀 **보이는 월드 면적**을 일정하게 맞춘다.
    const a = VIEW_W / VIEW_H
    const a0 = BASE_W / BASE_H
    const halfBase = ((BASE_FOV / 2) * Math.PI) / 180
    const half = Math.atan(Math.tan(halfBase) * Math.sqrt(a0 / a))
    this.camera.aspect = a
    this.camera.fov = (half * 2 * 180) / Math.PI
    this.camera.updateProjectionMatrix()
    this.hud.resize()
  }

  /** 화면 좌표(1280x720 프레임) → sim 좌표(px) */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const ndc = new THREE.Vector2((sx / VIEW_W) * 2 - 1, -(sy / VIEW_H) * 2 + 1)
    this.raycaster.setFromCamera(ndc, this.camera)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GUN_H)
    const hit = new THREE.Vector3()
    if (!this.raycaster.ray.intersectPlane(plane, hit)) {
      this.raycaster.ray.intersectPlane(this.ground, hit)
    }
    return { x: hit.x / U, y: hit.z / U }
  }

  private worldToScreen(x: number, y: number, z: number): { x: number; y: number } {
    const v = new THREE.Vector3(x, y, z).project(this.camera)
    return { x: ((v.x + 1) / 2) * VIEW_W, y: ((1 - v.y) / 2) * VIEW_H }
  }

  private ensureRigs(state: GameState): void {
    const chars = state.players.map((p) => p.char)
    if (chars.length !== this.rigChars.length) {
      for (const r of this.rigs) this.scene.remove(r.root)
      this.rigs = chars.map((c) => buildCharacter(CHARACTERS[c]))
      this.rigChars = [...chars]
      for (const r of this.rigs) this.scene.add(r.root)
      this.vis = chars.map(() => newVis())
      this.aimSmooth = chars.map(() => 0)
      this.hitShow = chars.map(() => 0)
      return
    }
    // 캐릭터 교체: 바뀐 사람만 다시 만든다
    for (let i = 0; i < chars.length; i++) {
      if (chars[i] === this.rigChars[i]) continue
      this.scene.remove(this.rigs[i].root)
      const rig = buildCharacter(CHARACTERS[chars[i]])
      this.scene.add(rig.root)
      this.rigs[i] = rig
      this.rigChars[i] = chars[i]
      this.vis[i] = newVis()
    }
  }

  // ---------- 이벤트 → 이펙트 ----------
  onEvents(events: SimEvent[], state: GameState, localPlayer: number, names?: string[]): void {
    this.ensureRigs(state)
    const nm = names ?? state.players.map((p) => CHARACTERS[p.char].name)
    for (const e of events) {
      switch (e.type) {
        case 'fire': {
          const w = WEAPONS[e.weapon]
          const rig = this.rigs[e.p]
          const v = this.vis[e.p]
          if (w.melee) {
            // 후라이팬: 휘두르는 모션
            v.swing = 1
            break
          }
          const tip = new THREE.Vector3()
          rig.gunTip.getWorldPosition(tip)
          this.spawnFlash(tip, w.pellets > 1 ? 1.6 : 1)
          v.vsx -= 0.12
          v.vsy += 0.08
          if (e.p === localPlayer) this.shake = Math.max(this.shake, w.pellets > 1 ? 0.12 : 0.05)
          // 단군덕 패시브(중계): 시야 밖 상대의 총성 위치를 1.2초 표시
          if (localPlayer >= 0 && state.players[localPlayer].char === 'dangun' && this.hidden[e.p] && state.players[e.p].team !== state.players[localPlayer].team) {
            this.pings.push({ x: e.x * U, z: e.y * U, life: 1.2, max: 1.2 })
          }
          break
        }
        case 'wall': {
          const rad = angleToRad(e.aim)
          for (let i = 0; i < 4; i++) {
            const a = rad + Math.PI + (Math.random() - 0.5) * 1.6
            const sp = 0.05 + Math.random() * 0.1
            this.spawnParticle(e.x * U, GUN_H, e.y * U, Math.cos(a) * sp, 0.06 + Math.random() * 0.08, Math.sin(a) * sp, 0.3, 0xf2e6b3, 0.6)
          }
          break
        }
        case 'hit': {
          const v = this.vis[e.p]
          this.hitShow[e.p] = 2.5
          v.flash = 0.12
          // 산탄·기관총처럼 한 틱에 여러 발 맞아도 튐은 한 번만 (예전엔 겹쳐서 튀었다)
          if (v.hitCd <= 0) {
            v.hitCd = 0.1
            v.vsx += 0.28
            v.vsy -= 0.24
          }
          const head = e.part === PART_HEAD
          this.texts.push({ x: e.x * U, z: e.y * U, y: 1.9, text: head ? `${e.dmg} 헤드` : `${e.dmg}`, life: 0.8, max: 0.8, color: head ? '#ffd84a' : '#ffffff', big: head })
          for (let i = 0; i < 6; i++) {
            const a = Math.random() * Math.PI * 2
            const sp = 0.03 + Math.random() * 0.07
            this.spawnParticle(e.x * U, GUN_H, e.y * U, Math.cos(a) * sp, 0.08 + Math.random() * 0.06, Math.sin(a) * sp, 0.45, 0xe04a3a, 0.8)
          }
          if (e.p === localPlayer) {
            this.shake = Math.max(this.shake, 0.18)
            // 쏜 사람 쪽을 화면 기준 각도로 바꿔 가장자리에 호로 표시한다
            const from = state.players[e.by]
            const me = state.players[e.p]
            if (from && me && from.id !== me.id) {
              const sd = worldDirToScreen(from.x - me.x, from.y - me.y)
              if (sd.x !== 0 || sd.y !== 0) this.hud.addHitDir(Math.atan2(sd.y, sd.x), e.dmg >= 40)
            }
          }
          break
        }
        case 'death': {
          const v = this.vis[e.p]
          v.deadT = 0
          v.fall = 0
          const c = CHARACTERS[state.players[e.p].char]
          for (let i = 0; i < 16; i++) {
            const a = Math.random() * Math.PI * 2
            const sp = 0.04 + Math.random() * 0.1
            this.spawnParticle(e.x * U, 1.0, e.y * U, Math.cos(a) * sp, 0.12 + Math.random() * 0.1, Math.sin(a) * sp, 1.3, c.bodyColor, 1.2)
          }
          this.spawnRing(e.x * U, e.y * U, 0.3, 2.2, 0.5, 0xffffff)
          this.hud.showKill(state, e.by, e.p, nm)
          this.shake = Math.max(this.shake, e.p === localPlayer ? 0.35 : 0.2)
          break
        }
        case 'respawn': {
          this.spawnRing(e.x * U, e.y * U, 1.6, 0.2, 0.6, 0x9fe0ff)
          const v = this.vis[e.p]
          v.sx = 0.3
          v.sy = 1.5
          v.deadT = -1
          break
        }
        case 'dash': {
          const v = this.vis[e.p]
          v.vsx += 0.35
          v.vsy -= 0.3
          break
        }
        case 'choose': {
          // 소환 해제: 바로 사라진다
          this.vis[e.p].deadT = -1
          this.hitShow[e.p] = 0
          break
        }
        case 'break': {
          this.world.breakSandbag(e.tx, e.ty)
          this.miniCanvas = null
          const cx = (e.tx + 0.5) * 1
          const cz = (e.ty + 0.5) * 1
          for (let i = 0; i < 10; i++) {
            const a = Math.random() * Math.PI * 2
            const sp = 0.03 + Math.random() * 0.07
            this.spawnParticle(cx, 0.3, cz, Math.cos(a) * sp, 0.06 + Math.random() * 0.07, Math.sin(a) * sp, 0.7, 0xc7ad76, 0.9)
          }
          this.spawnRing(cx, cz, 0.2, 1.2, 0.4, 0xd6bc84)
          break
        }
        case 'drop': {
          this.spawnRing(e.x * U, e.y * U, 0.2, 1.1, 0.5, 0x7ef0a0)
          break
        }
        case 'heal': {
          this.texts.push({ x: e.x * U, z: e.y * U, y: 1.7, text: `+${e.amount}`, life: 0.9, max: 0.9, color: '#7ef0a0', big: true })
          for (let i = 0; i < 8; i++) {
            const a = Math.random() * Math.PI * 2
            const sp = 0.02 + Math.random() * 0.05
            this.spawnParticle(e.x * U, 0.5, e.y * U, Math.cos(a) * sp, 0.07 + Math.random() * 0.05, Math.sin(a) * sp, 0.7, 0x7ef0a0, 0.7)
          }
          break
        }
        case 'block': {
          for (let i = 0; i < 5; i++) {
            const a = Math.random() * Math.PI * 2
            const sp = 0.04 + Math.random() * 0.08
            this.spawnParticle(e.x * U, GUN_H, e.y * U, Math.cos(a) * sp, 0.05 + Math.random() * 0.06, Math.sin(a) * sp, 0.3, 0xbfd8ff, 0.7)
          }
          this.texts.push({ x: e.x * U, z: e.y * U, y: 1.6, text: '막음', life: 0.5, max: 0.5, color: '#9fe0ff', big: false })
          break
        }
        case 'over':
          this.hud.showOver()
          break
        default:
          break
      }
    }
  }

  private spawnFlash(pos: THREE.Vector3, size: number): void {
    const light = new THREE.PointLight(0xffc860, 6 * size, 5, 2)
    light.position.copy(pos)
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.12 * size, 6, 4), new THREE.MeshBasicMaterial({ color: 0xfff0b0 }))
    mesh.position.copy(pos)
    this.scene.add(light, mesh)
    this.flashes.push({ light, mesh, life: 0.06 })
  }

  private spawnParticle(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, color: number, size: number): void {
    let mesh = this.particlePool.pop()
    if (!mesh) mesh = new THREE.Mesh(this.particleGeo, new THREE.MeshBasicMaterial({ color }))
    else (mesh.material as THREE.MeshBasicMaterial).color.setHex(color)
    mesh.position.set(x, y, z)
    mesh.scale.setScalar(size)
    mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0)
    this.scene.add(mesh)
    this.particles.push({ mesh, vx, vy, vz, life, max: life, gravity: 0.35, spin: (Math.random() - 0.5) * 8 })
  }

  private spawnRing(x: number, z: number, r0: number, r1: number, life: number, color: number): void {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }))
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(x, 0.02, z)
    this.scene.add(mesh)
    this.rings.push({ mesh, life, max: life, r0, r1 })
  }

  // ---------- 프레임 ----------
  draw(prev: GameState, curr: GameState, alpha: number, dt: number, opts: RenderOptions): void {
    this.ensureRigs(curr)
    const ts = opts.timeScale ?? 1
    this.lastDt = dt
    const viewer = opts.viewer ?? opts.localPlayer
    this.scoped =
      viewer >= 0 &&
      curr.players[viewer].alive &&
      curr.players[viewer].ads &&
      WEAPONS[curr.players[viewer].weapon].scope === true
    this.t += dt
    const sdt = dt * ts
    this.updateEffects(sdt)

    const n = curr.players.length
    const pos: { x: number; z: number }[] = []
    for (let i = 0; i < n; i++) {
      const a = prev.players[i]
      const b = curr.players[i]
      if (!a || !b.alive || b.aliveTicks <= 1) pos.push({ x: b.x * U, z: b.y * U })
      else pos.push({ x: (a.x + (b.x - a.x) * alpha) * U, z: (a.y + (b.y - a.y) * alpha) * U })
    }
    // 화면 위치 스무딩: 순간이동을 없앤다
    if (this.dispPos.length !== n) this.dispPos = pos.map((p) => ({ x: p.x, z: p.z }))
    for (let i = 0; i < n; i++) {
      const p = curr.players[i]
      const d = this.dispPos[i]
      const dx = pos[i].x - d.x
      const dz = pos[i].z - d.z
      const dist = Math.hypot(dx, dz)
      // 리스폰·난입·순간이동은 그대로 붙인다 (2타일 넘게 벌어지면 따라잡을 이유가 없다)
      if (!p.alive || p.aliveTicks <= 2 || dist > 2) {
        d.x = pos[i].x
        d.z = pos[i].z
      } else if (dist > 0.0001) {
        // 캐릭터 최고 속도(약 3.7px/tick ≈ 7타일/초)보다 넉넉히 빠른 상한
        const maxStep = Math.max(0.02, 11 * dt)
        const k = Math.min(1, maxStep / dist)
        d.x += dx * k
        d.z += dz * k
      }
      pos[i] = { x: d.x, z: d.z }
    }
    this.updateSandbags(curr)
    this.updateVision(curr, opts)
    for (let i = 0; i < n; i++) this.updateRig(i, curr.players[i], pos[i], sdt)
    this.updateBullets(prev, curr, alpha)
    this.updateMedkits(curr)
    this.updateCamera(curr, pos, dt, opts)

    this.gl.render(this.scene, this.camera)

    // HUD
    this.hud.begin(dt)
    const st: ScreenText[] = this.texts.map((t) => {
      const p = this.worldToScreen(t.x, t.y + (1 - t.life / t.max) * 0.8, t.z)
      return { x: p.x, y: p.y, text: t.text, k: t.life / t.max, color: t.color, big: t.big }
    })
    this.hud.drawTexts(st)
    this.drawPings()
    this.drawNameTags(curr, pos, opts)
    this.hud.drawVignette()
    if (this.scoped && opts.cursor) {
      const me = pos[opts.localPlayer]
      this.drawScope(opts.cursor, this.worldToScreen(me.x, 0.6, me.z))
    }
    this.hud.drawMain(curr, opts)
    if (opts.showHud) this.drawMinimap(curr, opts)
  }

  /** 모래주머니가 닳으면 색이 어두워진다 (곧 터진다는 신호) */
  private updateSandbags(curr: GameState): void {
    for (const key in curr.sandbags) {
      const i = Number(key)
      const k = Math.round((curr.sandbags[i] / SANDBAG_HP) * 5) / 5
      if (this.bagShown.get(i) === k) continue
      this.bagShown.set(i, k)
      this.world.setSandbagHealth(i % this.map.w, Math.floor(i / this.map.w), k)
    }
  }

  /** 시야: 나(와 아군)가 보는 곳만 밝히고, 그 밖의 적은 숨긴다. 관전(-1)이나 fog:false 면 전부 보인다 */
  private updateVision(curr: GameState, opts: RenderOptions): void {
    const lp = opts.viewer ?? opts.localPlayer
    const fog = (opts.fog ?? true) && lp >= 0
    this.vision.setVisible(fog)
    const n = curr.players.length
    if (this.hidden.length !== n) this.hidden = curr.players.map(() => false)
    if (!fog) {
      this.hidden.fill(false)
      return
    }
    const me = curr.players[lp]
    const viewers: Viewer[] = []
    for (const p of curr.players) {
      if (p.team !== me.team || !p.alive || p.left) continue
      viewers.push({ x: p.x, y: p.y })
    }
    if (viewers.length > 0) this.lastViewer = { x: me.alive ? me.x : viewers[0].x, y: me.alive ? me.y : viewers[0].y }
    else if (this.lastViewer) viewers.push(this.lastViewer) // 죽어 있는 동안은 마지막 자리에서 본다
    const radius = VIEW_RADIUS_TILES * (this.scoped ? 1.8 : 1)
    this.vision.update(viewers, radius)
    if (this.seenT.length !== n) this.seenT = curr.players.map(() => 0)
    for (let i = 0; i < n; i++) {
      const p = curr.players[i]
      if (!p.alive || p.left) {
        // 죽어 있는 동안은 '보였다' 는 기억을 지운다.
        // 안 그러면 죽기 직전의 기억(0.22초)이 남아, **리스폰하는 순간 새 자리가 미니맵에 잠깐 드러난다.**
        this.seenT[i] = 0
        this.hidden[i] = true
        continue
      }
      const visible = p.team === me.team || canSee(this.map, viewers, p.x, p.y, radius * 32)
      // 경계에서 깜빡이지 않도록 잠깐 남긴다
      if (visible) this.seenT[i] = 0.22
      else this.seenT[i] = Math.max(0, this.seenT[i] - this.lastDt)
      this.hidden[i] = this.seenT[i] <= 0
    }
  }

  /** 저격 조준경: 커서 둘레만 남기고 어둡게 + 십자선 */
  private drawScope(cur: { x: number; y: number }, self: { x: number; y: number }): void {
    const ctx = this.hud.ctx
    const r = 210
    // 내 주변에도 구멍을 낸다 — 조준경을 켠 채로도 붙는 적을 볼 수 있게
    const rs = 132
    const DARK = 'rgba(4,6,4,0.85)'
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, VIEW_W, VIEW_H)
    ctx.arc(cur.x, cur.y, r, 0, Math.PI * 2, true)
    ctx.moveTo(self.x + rs, self.y)
    ctx.arc(self.x, self.y, rs, 0, Math.PI * 2, true)
    ctx.fillStyle = DARK
    ctx.fill('evenodd')
    ctx.restore()
    for (const [cx, cy, rad, inner] of [
      [cur.x, cur.y, r, 0.6],
      [self.x, self.y, rs, 0.45],
    ] as const) {
      const g = ctx.createRadialGradient(cx, cy, rad * inner, cx, cy, rad)
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(1, DARK)
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(cx, cy, rad, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.strokeStyle = 'rgba(20,24,18,0.95)'
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.arc(cur.x, cur.y, r + 2, 0, Math.PI * 2)
    ctx.stroke()
    // 십자선
    ctx.strokeStyle = 'rgba(220,230,210,0.75)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(cur.x - r, cur.y)
    ctx.lineTo(cur.x - 16, cur.y)
    ctx.moveTo(cur.x + 16, cur.y)
    ctx.lineTo(cur.x + r, cur.y)
    ctx.moveTo(cur.x, cur.y - r)
    ctx.lineTo(cur.x, cur.y - 16)
    ctx.moveTo(cur.x, cur.y + 16)
    ctx.lineTo(cur.x, cur.y + r)
    ctx.stroke()
    // 눈금
    ctx.strokeStyle = 'rgba(220,230,210,0.55)'
    for (let i = 1; i <= 4; i++) {
      const y = cur.y + i * 26
      const half = 10 - i
      ctx.beginPath()
      ctx.moveTo(cur.x - half, y)
      ctx.lineTo(cur.x + half, y)
      ctx.stroke()
    }
    ctx.fillStyle = 'rgba(220,230,210,0.9)'
    ctx.beginPath()
    ctx.arc(cur.x, cur.y, 1.6, 0, Math.PI * 2)
    ctx.fill()
  }

  /** 왼쪽 위 미니맵 */
  private drawMinimap(curr: GameState, opts: RenderOptions): void {
    const map = this.map
    if (!this.miniCanvas) this.miniCanvas = renderMapTiles(map)
    const ctx = this.hud.ctx
    const maxW = 190
    const maxH = 150
    const sc = Math.min(maxW / map.w, maxH / map.h)
    const w = map.w * sc
    const h = map.h * sc
    const x = 16
    const y = 16
    ctx.save()
    ctx.fillStyle = 'rgba(13,17,23,0.78)'
    roundRect(ctx, x - 6, y - 6, w + 12, h + 12, 8)
    ctx.fill()
    ctx.strokeStyle = 'rgba(227,179,65,0.35)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.globalAlpha = 0.9
    ctx.drawImage(this.miniCanvas, x, y, w, h)
    ctx.globalAlpha = 1
    const lp = opts.localPlayer
    const teams = isTeamMatch(curr)
    const myTeam = lp >= 0 ? curr.players[lp].team : -1
    for (let i = 0; i < curr.players.length; i++) {
      const p = curr.players[i]
      if (!p.alive || p.left) continue
      const mine = i === lp
      const ally = teams && lp >= 0 && p.team === myTeam && !mine
      if (!mine && !ally && this.hidden[i] && lp >= 0) continue // 안 보이는 적은 미니맵에도 없다
      const px = x + (p.x / TILE) * sc
      const py = y + (p.y / TILE) * sc
      ctx.fillStyle = mine ? '#ffd84a' : ally ? '#5aa9ff' : '#ff5a4a'
      ctx.beginPath()
      ctx.arc(px, py, mine ? 3.4 : 2.8, 0, Math.PI * 2)
      ctx.fill()
      if (mine) {
        const r = angleToRad(p.aim)
        ctx.strokeStyle = '#ffd84a'
        ctx.lineWidth = 1.6
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.lineTo(px + Math.cos(r) * 9, py + Math.sin(r) * 9)
        ctx.stroke()
      }
    }
    ctx.restore()
  }

  /** 총성 표시: 화면 안이면 그 자리에 퍼지는 링, 밖이면 화면 가장자리 화살표 */
  private drawPings(): void {
    if (this.pings.length === 0) return
    const ctx = this.hud.ctx
    for (const p of this.pings) {
      const k = 1 - p.life / p.max
      const s = this.worldToScreen(p.x, 0.5, p.z)
      const inside = s.x > 20 && s.x < VIEW_W - 20 && s.y > 20 && s.y < VIEW_H - 20
      ctx.globalAlpha = Math.min(1, p.life * 2)
      if (inside) {
        ctx.strokeStyle = '#ffd84a'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(s.x, s.y, 10 + k * 26, 0, Math.PI * 2)
        ctx.stroke()
        ctx.fillStyle = '#ffd84a'
        ctx.beginPath()
        ctx.arc(s.x, s.y, 4, 0, Math.PI * 2)
        ctx.fill()
      } else {
        const cx = VIEW_W / 2
        const cy = VIEW_H / 2
        const a = Math.atan2(s.y - cy, s.x - cx)
        const ex = cx + Math.cos(a) * (VIEW_W / 2 - 40)
        const ey = cy + Math.sin(a) * (VIEW_H / 2 - 40)
        ctx.save()
        ctx.translate(ex, ey)
        ctx.rotate(a)
        ctx.fillStyle = '#ffd84a'
        ctx.beginPath()
        ctx.moveTo(14, 0)
        ctx.lineTo(-8, -9)
        ctx.lineTo(-8, 9)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }
      ctx.font = '600 11px "IBM Plex Sans KR", sans-serif'
      ctx.textAlign = 'center'
      ctx.fillStyle = '#ffd84a'
      if (inside) ctx.fillText('총성', s.x, s.y - 16 - k * 26)
    }
    ctx.globalAlpha = 1
  }

  private drawNameTags(curr: GameState, pos: { x: number; z: number }[], opts: RenderOptions): void {
    const ctx = this.hud.ctx
    const teams = isTeamMatch(curr)
    const lp = opts.localPlayer
    const spectator = lp === -1
    const myTeam = lp >= 0 ? curr.players[lp].team : -1
    for (let i = 0; i < curr.players.length; i++) {
      const p = curr.players[i]
      if (!p.alive || !this.rigs[i]?.root.visible) continue
      const c = CHARACTERS[p.char]
      const s = this.worldToScreen(pos[i].x, this.rigs[i].height + 0.2, pos[i].z)
      const name = opts.names[i] ?? c.name
      const mine = i === lp
      const ally = teams && !spectator && !mine && p.team === myTeam
      // 상대 정보는 숨긴다. 체력 바는 나·아군·관전, 그리고 상대는 맞은 직후 몇 초만
      const showHp = spectator || mine || ally || this.hitShow[i] > 0
      ctx.font = `600 ${mine ? 13 : 12}px "IBM Plex Sans KR", "Malgun Gothic", sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'
      ctx.strokeText(name, s.x, s.y)
      ctx.fillStyle = mine ? '#ffe680' : ally ? '#9fd6ff' : teams ? (TEAM_COLORS[p.team] ?? '#fff') : '#ffffff'
      ctx.fillText(name, s.x, s.y)
      if (!showHp) continue
      const w = mine ? 48 : 36
      const hpK = Math.max(0, p.hp / c.maxHp)
      const fade = mine || ally || spectator ? 1 : Math.min(1, this.hitShow[i] * 2)
      ctx.globalAlpha = fade
      // 체력: 머리 위 가로 막대
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fillRect(s.x - w / 2, s.y + 4, w, mine ? 6 : 5)
      ctx.fillStyle = hpK > 0.5 ? '#6fd66a' : hpK > 0.25 ? '#f2c94c' : '#f25c4c'
      ctx.fillRect(s.x - w / 2 + 1, s.y + 5, (w - 2) * hpK, mine ? 4 : 3)
      // 기력: 캐릭터 오른쪽 세로 막대 (나·아군만)
      if (mine || ally) {
        const bh = 34
        const bx = s.x + w / 2 + 6
        const by = s.y + 30
        const sk = Math.max(0, Math.min(1, p.stamina / STAMINA_MAX))
        ctx.fillStyle = 'rgba(0,0,0,0.55)'
        ctx.fillRect(bx, by - bh, 6, bh)
        ctx.fillStyle = sk > 0.34 ? '#9fe0ff' : '#e08a5a'
        ctx.fillRect(bx + 1, by - 1 - (bh - 2) * sk, 4, (bh - 2) * sk)
      }
      ctx.globalAlpha = 1
    }
  }

  private updateRig(i: number, p: PlayerState, pos: { x: number; z: number }, dt: number): void {
    const rig = this.rigs[i]
    const v = this.vis[i]
    const root = rig.root
    root.position.set(pos.x, 0, pos.z)

    if (p.left || this.hidden[i]) {
      root.visible = false
      return
    }

    // 조준 방향 부드럽게
    const target = angleToRad(p.aim)
    let d = target - this.aimSmooth[i]
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    this.aimSmooth[i] += d * Math.min(1, dt * 22)
    root.rotation.y = Math.PI / 2 - this.aimSmooth[i]

    if (!p.alive) {
      if (v.deadT < 0) {
        root.visible = false
        return
      }
      root.visible = v.deadT < 1.3
      // 넘어지기: 달걀이 뒤로 벌렁 넘어지며 살짝 튄다
      v.fall = Math.min(1, v.fall + dt * 3.2)
      const ease = 1 - Math.pow(1 - v.fall, 3)
      rig.body.rotation.x = -ease * Math.PI * 0.45
      rig.body.rotation.z = ease * 0.25
      rig.body.position.y = ease * 0.3 + Math.sin(Math.min(1, v.fall) * Math.PI) * 0.18
      setRigOpacity(rig, Math.max(0, 1 - Math.max(0, v.deadT - 0.8) * 2))
      return
    }
    if (v.deadT >= 0 || rig.body.position.y > 0.2) {
      v.deadT = -1
      rig.body.rotation.x = 0
      rig.body.rotation.z = 0
      rig.body.position.y = 0
      setRigOpacity(rig, 1)
    }
    root.visible = true

    // 말랑 스프링
    const k = 220
    const damp = 14
    v.vsx += (-k * (v.sx - 1) - damp * v.vsx) * dt
    v.vsy += (-k * (v.sy - 1) - damp * v.vsy) * dt
    v.vsx = Math.max(-4, Math.min(4, v.vsx))
    v.vsy = Math.max(-4, Math.min(4, v.vsy))
    v.sx = Math.max(0.62, Math.min(1.5, v.sx + v.vsx * dt))
    v.sy = Math.max(0.62, Math.min(1.5, v.sy + v.vsy * dt))
    v.flash = Math.max(0, v.flash - dt)
    rig.setFlash(v.flash > 0 ? Math.min(1, v.flash * 8) : 0)

    // 걷기: 다리 스윙 + 달걀 몸 뒤뚱(좌우 기울기) + 통통 튀기
    if (p.moving) v.walk += dt * (p.sprinting ? 17 : 13) // 달리면 다리도 빨리 움직인다
    else v.walk *= 0.8
    // 다리가 길수록 크게 젓는다 — 위에서 봐도 걸음이 눈에 띄도록
    const swing = (p.moving ? Math.sin(v.walk) * 0.55 : Math.sin(v.walk) * 0.2) * rig.stride
    rig.legL.rotation.x = swing
    rig.legR.rotation.x = -swing
    const bob = p.moving ? Math.abs(Math.sin(v.walk)) * 0.05 * rig.stride : 0
    rig.body.position.set(0, bob, 0)
    rig.body.rotation.z = p.moving ? Math.sin(v.walk) * 0.07 : 0
    rig.arms.rotation.x = p.moving ? Math.sin(v.walk * 2) * 0.05 : 0
    rig.body.rotation.x = 0
    // 대시 = 구르기: 대시 방향으로 한 바퀴 구르며 살짝 뜬다 (몸통 중심을 축으로)
    if (p.dashTimer > 0) {
      const dashMax = p.char === 'juwoojae' ? Math.round(DASH_TICKS * 1.5) : DASH_TICKS
      const k = 1 - p.dashTimer / dashMax
      const world = Math.atan2(p.dashDy, p.dashDx) // sim 좌표 각도 (x→y=z)
      const local = world - this.aimSmooth[i] // root 가 조준 방향으로 돌아 있으므로
      const dx = Math.sin(local)
      const dz = Math.cos(local)
      const axis = new THREE.Vector3(dz, 0, -dx).normalize()
      const q = new THREE.Quaternion().setFromAxisAngle(axis, k * Math.PI * 2)
      rig.body.quaternion.copy(q)
      const c = new THREE.Vector3(0, rig.centerY, 0).applyQuaternion(q)
      const hop = Math.sin(k * Math.PI) * 0.18
      rig.body.position.set(-c.x, rig.centerY - c.y + hop, -c.z)
    }
    // 정조준: 팔을 조금 더 앞으로
    rig.arms.position.z = p.ads ? 0.18 : 0.1
    // 후라이팬 휘두르기
    rig.arms.rotation.y = v.swing > 0 ? Math.sin(v.swing * Math.PI) * 1.5 : 0
    root.scale.set(v.sx, v.sy, v.sx)
    // 스폰 보호: 살짝 반투명 깜빡임
    if (p.invuln > 0) setRigOpacity(rig, 0.6 + 0.3 * Math.sin(this.t * 14))
    else if (p.invuln === 0 && p.aliveTicks < 92) setRigOpacity(rig, 1)
  }

  /** 바닥의 힐팩. 살짝 떠서 위아래로 흔들리고 천천히 돈다 — 눈에 띄어야 주우러 간다 */
  private updateMedkits(curr: GameState): void {
    const live = new Set<number>()
    for (const m of curr.medkits) {
      live.add(m.id)
      let g = this.medkitMeshes.get(m.id)
      if (!g) {
        g = new THREE.Group()
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(0.42, 0.28, 0.42),
          new THREE.MeshLambertMaterial({ color: 0xf2f4f0 }),
        )
        box.castShadow = true
        g.add(box)
        const crossMat = new THREE.MeshBasicMaterial({ color: 0xe4483a })
        const bar1 = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.02, 0.09), crossMat)
        const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.26), crossMat)
        bar1.position.y = 0.15
        bar2.position.y = 0.15
        g.add(bar1, bar2)
        this.scene.add(g)
        this.medkitMeshes.set(m.id, g)
      }
      // 사라지기 3초 전부터 깜빡여 알려 준다
      const blink = m.ttl < 180 && Math.floor(m.ttl / 8) % 2 === 0
      g.visible = !blink
      g.position.set(m.x * U, 0.3 + Math.sin(this.t * 3 + m.id) * 0.06, m.y * U)
      g.rotation.y = this.t * 0.9 + m.id
    }
    for (const [id, g] of this.medkitMeshes) {
      if (live.has(id)) continue
      this.scene.remove(g)
      this.medkitMeshes.delete(id)
    }
  }

  private updateBullets(prev: GameState, curr: GameState, alpha: number): void {
    const prevById = new Map<number, { x: number; y: number }>()
    for (const b of prev.bullets) prevById.set(b.id, { x: b.x, y: b.y })
    let n = 0
    for (const b of curr.bullets) {
      const pb = prevById.get(b.id) ?? { x: b.px, y: b.py }
      const x = (pb.x + (b.x - pb.x) * alpha) * U
      const z = (pb.y + (b.y - pb.y) * alpha) * U
      let mesh = this.bulletPool[n]
      if (!mesh) {
        mesh = new THREE.Mesh(this.bulletGeo, this.bulletMat)
        this.bulletPool[n] = mesh
        this.scene.add(mesh)
      }
      mesh.visible = true
      mesh.position.set(x, GUN_H, z)
      let trail = this.trailPool[n]
      if (!trail) {
        trail = new THREE.Mesh(this.trailGeo, this.trailMat)
        this.trailPool[n] = trail
        this.scene.add(trail)
      }
      trail.visible = true
      const ang = Math.atan2(b.vx, b.vy)
      trail.rotation.y = ang
      const l = Math.hypot(b.vx, b.vy) * U
      trail.scale.z = Math.max(0.4, l * 1.6)
      trail.position.set(x - (b.vx * U) * 0.5, GUN_H, z - (b.vy * U) * 0.5)
      n++
    }
    for (let i = n; i < this.bulletPool.length; i++) {
      this.bulletPool[i].visible = false
      if (this.trailPool[i]) this.trailPool[i].visible = false
    }
  }

  private updateEffects(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const q = this.particles[i]
      q.life -= dt
      if (q.life <= 0) {
        this.scene.remove(q.mesh)
        this.particlePool.push(q.mesh)
        this.particles[i] = this.particles[this.particles.length - 1]
        this.particles.pop()
        continue
      }
      const k = dt * 60
      q.mesh.position.x += q.vx * k
      q.mesh.position.y += q.vy * k
      q.mesh.position.z += q.vz * k
      q.vy -= q.gravity * dt
      if (q.mesh.position.y < 0.05) {
        q.mesh.position.y = 0.05
        q.vy = -q.vy * 0.3
        q.vx *= 0.7
        q.vz *= 0.7
      }
      q.mesh.rotation.x += q.spin * dt
      q.mesh.rotation.z += q.spin * dt
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      this.texts[i].life -= dt
      if (this.texts[i].life <= 0) this.texts.splice(i, 1)
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i]
      f.life -= dt
      if (f.life <= 0) {
        this.scene.remove(f.light, f.mesh)
        f.light.dispose()
        this.flashes.splice(i, 1)
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]
      r.life -= dt
      if (r.life <= 0) {
        this.scene.remove(r.mesh)
        this.rings.splice(i, 1)
        continue
      }
      const k = 1 - r.life / r.max
      const rad = r.r0 + (r.r1 - r.r0) * k
      r.mesh.scale.setScalar(rad)
      ;(r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.9
    }
    for (let i = this.pings.length - 1; i >= 0; i--) {
      this.pings[i].life -= dt
      if (this.pings[i].life <= 0) this.pings.splice(i, 1)
    }
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const m = this.marks[i]
      m.life -= dt
      if (m.life <= 0) {
        this.scene.remove(m.mesh)
        this.marks.splice(i, 1)
        continue
      }
      // 콩콩 뛰듯 크기를 흔들어 눈에 띄게
      const k = 1 + Math.sin(this.t * 6) * 0.12
      m.mesh.scale.setScalar(k)
      ;(m.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, m.life / 1.2) * 0.95
    }
    for (const v of this.vis) if (v.deadT >= 0) v.deadT += dt
    for (let i = 0; i < this.hitShow.length; i++) this.hitShow[i] = Math.max(0, this.hitShow[i] - dt)
    for (const v of this.vis) {
      if (v.hitCd > 0) v.hitCd -= dt
      if (v.swing > 0) v.swing = Math.max(0, v.swing - dt * 4)
    }
    this.shake = Math.max(0, this.shake - dt * 1.4)
  }

  private updateCamera(curr: GameState, pos: { x: number; z: number }[], dt: number, opts: RenderOptions): void {
    const lp = opts.viewer ?? opts.localPlayer
    let tx: number
    let tz: number
    let dist = FOLLOW_DIST
    if (opts.cameraMode === 'both' || lp === -1) {
      // 살아있는 모두가 보이도록
      let minX = Infinity
      let maxX = -Infinity
      let minZ = Infinity
      let maxZ = -Infinity
      let count = 0
      for (let i = 0; i < curr.players.length; i++) {
        const p = curr.players[i]
        if (!p.alive || p.left) continue
        minX = Math.min(minX, pos[i].x)
        maxX = Math.max(maxX, pos[i].x)
        minZ = Math.min(minZ, pos[i].z)
        maxZ = Math.max(maxZ, pos[i].z)
        count++
      }
      if (count === 0) {
        tx = this.camTarget.x
        tz = this.camTarget.z
      } else {
        tx = (minX + maxX) / 2
        tz = (minZ + maxZ) / 2
        const ext = Math.max(maxX - minX, (maxZ - minZ) * 1.5)
        dist = Math.max(11, Math.min(26, 8 + ext * 0.95))
        if (count === 1) dist = 12
        if (curr.players.length === 2 && count === 2 && ext > 20) {
          // 둘이 아주 멀면 P1 추적
          const k = Math.min(1, (ext - 20) / 12)
          tx = tx * (1 - k) + pos[0].x * k
          tz = tz * (1 - k) + pos[0].z * k
          dist = 14
        }
      }
    } else {
      const me = curr.players[lp]
      tx = pos[lp].x
      tz = pos[lp].z
      if (me.alive && me.ads) {
        const r = angleToRad(me.aim)
        // 조준경은 앞을 더 보여 주되, 너무 멀리 밀면 조준선이 화면에서 빨리 움직여 맞히기 어렵다
        const reach = this.scoped ? 5 : 3
        tx += Math.cos(r) * reach
        tz += Math.sin(r) * reach
      }
      dist = FOLLOW_DIST * (this.scoped ? 1.45 : 1)
    }
    // 맵 밖이 덜 보이도록 클램프 (요 45° 라 두 축 같은 여유)
    const margin = dist * 0.3
    tx = Math.max(margin - 2, Math.min(this.map.w - margin + 2, tx))
    tz = Math.max(margin - 2, Math.min(this.map.h - margin + 2, tz))
    if (!this.camInit) {
      this.camTarget.set(tx, 0, tz)
      this.camDist = dist
      this.camInit = true
    } else {
      // 조준경일 때는 더 천천히 따라가서 손떨림이 화면을 흔들지 않게 한다
      const s = 1 - Math.pow(this.scoped ? 0.06 : 0.002, dt)
      this.camTarget.x += (tx - this.camTarget.x) * s
      this.camTarget.z += (tz - this.camTarget.z) * s
      this.camDist += (dist - this.camDist) * s * 0.7
    }
    const shx = (Math.random() - 0.5) * this.shake
    const shz = (Math.random() - 0.5) * this.shake
    const cx = this.camTarget.x + shx
    const cz = this.camTarget.z + shz
    const flat = Math.cos(PITCH) * this.camDist
    this.camera.position.set(cx + Math.sin(YAW) * flat, Math.sin(PITCH) * this.camDist, cz + Math.cos(YAW) * flat)
    this.camera.lookAt(cx, 0.6, cz)
    // 그림자 카메라가 시점을 따라오도록
    this.world.sun.position.set(this.camTarget.x + 8, 18, this.camTarget.z + 10)
    this.world.sun.target.position.set(this.camTarget.x, 0, this.camTarget.z)
  }

  /** 관전 시트용: 캐릭터를 특정 위치·회전으로 직접 배치하고 렌더 */
  renderRaw(): void {
    this.gl.render(this.scene, this.camera)
  }

  setSun(x: number, y: number, z: number): void {
    this.world.sun.position.set(x, y, z)
    this.world.sun.target.position.set(this.camera.position.x, 0, this.camera.position.z + 6)
  }

  get threeScene(): THREE.Scene {
    return this.scene
  }
  get threeCamera(): THREE.PerspectiveCamera {
    return this.camera
  }

  dispose(): void {
    this.vision.dispose()
    this.world.dispose()
    this.gl.dispose()
    this.canvas.remove()
    this.hud.canvas.remove()
  }
}

function newVis(): DuckVis {
  return { sx: 1, sy: 1, vsx: 0, vsy: 0, walk: 0, flash: 0, deadT: -1, fall: 0, hitCd: 0, swing: 0 }
}

export { hex, PLAYER_RADIUS }
