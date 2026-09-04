// 프리뷰(트레일러 캡처용) 페이지: 봇 vs 봇 자동 플레이 + 시네마틱 카메라 + 슬로모션. 3D.
// URL: ?ff=900 (틱 빨리감기) · ?notitle=1 · ?diff=hard,normal · ?map=yard · ?n=4 (인원 2~4) · ?teams=1 (2v2) · ?scale=1|2|4 (맵 배율)
//      ?sheet=1 (캐릭터 시트, &focus=<id>)

import * as THREE from 'three'
import { Difficulty, DIFFICULTY_LABEL, botInput, makeBot } from './core/bot'
import { CHARACTER_LIST, CharacterId, displayNames } from './core/characters'
import { Input } from './core/input'
import { buildMap } from './core/map'
import { DEFAULT_MAP, MAP_LIST, MapScale, isMapId, isMapScale, scaleForPlayers } from './core/maps'
import { createState, snapshot, step } from './core/sim'
import { GameState, MAX_PLAYERS, MIN_PLAYERS, TICK_MS } from './core/state'
import { WEAPONS } from './core/weapons'
import { VIEW_H, VIEW_W, roundRect } from './render/hud'
import { buildCharacter } from './render3d/character3d'
import { Renderer3D } from './render3d/renderer3d'
import { Sfx } from './audio/sfx'

const stage = document.getElementById('stage') as HTMLDivElement
const hint = document.getElementById('hint') as HTMLDivElement
const q = new URLSearchParams(location.search)
const mapParam = q.get('map')
let mapId = mapParam && isMapId(mapParam) ? mapParam : DEFAULT_MAP
const playerCount = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Number(q.get('n') ?? 2) || 2))
const scaleParam = Number(q.get('scale') ?? 0)
const mapScale: MapScale = isMapScale(scaleParam) ? scaleParam : scaleForPlayers(playerCount)
let map = buildMap(mapId, mapScale)
let renderer = new Renderer3D(stage, map)
const sfx = new Sfx()
sfx.startBgm()

const teamMode = q.has('teams') && playerCount === 4
let diffs: Difficulty[] = ['hard', 'normal', 'normal', 'hard']
let showHud = true
let cameraMode: 'follow' | 'both' = 'both'
let letterbox = false
let paused = false
let timeScale = 1
let slowmoLeft = 0
let restartAt = -1
let titleT = 0
let hintTimer = 6
let seedCounter = (Date.now() % 100000) | 0
let matchCount = 0

interface Match {
  state: GameState
  prev: GameState
  bots: ReturnType<typeof makeBot>[]
  names: string[]
  subs: string[]
}

/** 첫 판은 철면덕 vs 침착덕(+무작위), 이후는 무작위 */
function pickChars(): CharacterId[] {
  const pool = CHARACTER_LIST.map((c) => c.id)
  const out: CharacterId[] = []
  if (matchCount++ === 0) out.push('cheolmyeon', 'chim')
  while (out.length < playerCount) {
    const rest = pool.filter((id) => !out.includes(id))
    const pick = rest.length > 0 ? rest : pool
    out.push(pick[Math.floor(Math.random() * pick.length)])
  }
  return out.slice(0, playerCount)
}

function newMatch(): Match {
  const chars = pickChars()
  const seed = (seedCounter = (seedCounter * 1103515245 + 12345) >>> 0)
  const teams = teamMode ? chars.map((_, i) => i % 2) : undefined
  const state = createState({ seed, targetKills: 5, chars, teams }, map)
  return {
    state,
    prev: snapshot(state),
    bots: chars.map((_, i) => makeBot(seed ^ (0xa5a5 + i * 4099))),
    names: displayNames(chars),
    subs: chars.map((_, i) => `AI · ${DIFFICULTY_LABEL[diffs[i]]}`),
  }
}

let match = newMatch()

function botInputs(m: Match): Input[] {
  return m.bots.map((b, i) => botInput(m.state, map, i, b, diffs[i]))
}

{
  const d = q.get('diff')
  if (d) {
    const list = d.split(',') as Difficulty[]
    if (list.length >= 1) diffs = diffs.map((x, i) => list[i] ?? x)
    match = newMatch()
  }
  if (q.get('notitle')) titleT = 100
  const ff = Number(q.get('ff') ?? 0)
  if (ff > 0) {
    titleT = 100
    for (let i = 0; i < ff; i++) {
      match.prev = snapshot(match.state)
      step(match.state, map, botInputs(match))
      if (i >= ff - 3) renderer.onEvents(match.state.events, match.state, -1, match.names)
    }
  }
}

function restart(): void {
  match = newMatch()
  restartAt = -1
  slowmoLeft = 0
  timeScale = 1
}

function switchMap(id: typeof mapId): void {
  mapId = id
  map = buildMap(mapId, mapScale)
  renderer.dispose()
  renderer = new Renderer3D(stage, map)
  fit()
  restart()
}

// ---------- 루프 ----------
let last = performance.now()
let acc = 0

function frame(now: number): void {
  const rawDt = Math.min(0.1, (now - last) / 1000)
  last = now
  titleT += rawDt
  if (hintTimer > 0) {
    hintTimer -= rawDt
    if (hintTimer <= 0) hint.style.opacity = '0'
  }

  const titleHold = titleT < 2.6
  if (!paused && !titleHold) {
    if (slowmoLeft > 0) {
      slowmoLeft -= rawDt
      timeScale = slowmoLeft > 0 ? 0.22 : 1
    }
    acc += rawDt * 1000 * timeScale
    let steps = 0
    while (acc >= TICK_MS && steps < 6) {
      match.prev = snapshot(match.state)
      step(match.state, map, botInputs(match))
      renderer.onEvents(match.state.events, match.state, -1, match.names)
      sfx.onEvents(match.state.events, match.state, -1)
      for (const e of match.state.events) {
        if (e.type === 'death') slowmoLeft = 0.9
        if (e.type === 'over') restartAt = titleT + 6
      }
      acc -= TICK_MS
      steps++
    }
    if (restartAt > 0 && titleT >= restartAt) restart()
  }

  const alpha = Math.min(1, acc / TICK_MS)
  renderer.draw(match.prev, match.state, alpha, rawDt, {
    showHud: showHud && !titleHold,
    localPlayer: -1,
    cameraMode,
    names: match.names,
    subLabels: match.subs,
    timeScale,
  })
  drawOverlay()
  requestAnimationFrame(frame)
}

function drawOverlay(): void {
  const ctx = renderer.hud.ctx
  ctx.setTransform(renderer.hud.canvas.width / VIEW_W, 0, 0, renderer.hud.canvas.height / VIEW_H, 0, 0)

  if (letterbox) {
    const bar = Math.round((VIEW_H - VIEW_W / 2.39) / 2)
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, VIEW_W, bar)
    ctx.fillRect(0, VIEW_H - bar, VIEW_W, bar)
  }

  const T_IN = 0.5
  const T_HOLD = 2.4
  const T_OUT = 0.7
  if (titleT < T_IN + T_HOLD + T_OUT) {
    let a = 1
    if (titleT < T_IN) a = titleT / T_IN
    else if (titleT > T_IN + T_HOLD) a = 1 - (titleT - T_IN - T_HOLD) / T_OUT
    ctx.globalAlpha = Math.max(0, Math.min(1, a))
    ctx.fillStyle = 'rgba(14,16,12,0.72)'
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    const rise = (1 - Math.min(1, titleT / (T_IN + 0.3))) * 24
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '400 128px "Black Han Sans", "IBM Plex Sans KR", sans-serif'
    ctx.fillStyle = '#f5f2e6'
    ctx.fillText('배도라지', VIEW_W / 2 - 70, VIEW_H / 2 - 40 + rise)
    ctx.fillStyle = '#ffd84a'
    ctx.fillText('덕', VIEW_W / 2 + 200, VIEW_H / 2 - 40 + rise)
    ctx.font = '500 20px "IBM Plex Sans KR", sans-serif'
    ctx.fillStyle = '#b3b8a5'
    ctx.fillText('최대 4인 쿼터뷰 슈터  ·  서버 없는 P2P 대전  ·  비공식 팬게임', VIEW_W / 2, VIEW_H / 2 + 52 + rise)
    ctx.font = '500 14px "IBM Plex Sans KR", sans-serif'
    ctx.fillStyle = '#ff5a36'
    ctx.fillText('철면덕 · 침착덕 · 단군덕 · 매직덕 · 주펄덕', VIEW_W / 2, VIEW_H / 2 + 84 + rise)
    ctx.font = '500 13px "IBM Plex Mono", monospace'
    ctx.fillStyle = '#7d8471'
    ctx.fillText('goormigrm.github.io/bedorage-duck', VIEW_W / 2, VIEW_H / 2 + 112 + rise)
    ctx.globalAlpha = 1
  }

  if (paused) {
    ctx.fillStyle = 'rgba(14,16,12,0.5)'
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    ctx.font = '400 48px "Black Han Sans", "IBM Plex Sans KR", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#f5f2e6'
    ctx.fillText('일시정지', VIEW_W / 2, VIEW_H / 2)
  }

  ctx.font = '600 12px "IBM Plex Mono", monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = 'rgba(245,242,230,0.55)'
  ctx.fillText(`BEDORAGE DUCK · PREVIEW · ${map.name} ×${map.scale} · ${playerCount}인${teamMode ? ' 2v2' : ''}`, 18, 30)
  if (timeScale < 1) {
    ctx.fillStyle = 'rgba(20,22,16,0.7)'
    roundRect(ctx, 18, 40, 92, 22, 4)
    ctx.fill()
    ctx.fillStyle = '#ffd84a'
    ctx.fillText('SLOW-MO', 26, 55)
  }
}

// ---------- 캐릭터 시트 (3D) ----------
function runSheet(): void {
  const focus = q.get('focus')
  const list = focus ? CHARACTER_LIST.filter((c) => c.id === focus) : CHARACTER_LIST
  const scene = renderer.threeScene
  // 맵 북쪽 바깥(벽 앞)에 세운다. 벽이 배경이 된다.
  const cz = -3.2
  const rigs = list.map((c, i) => {
    const rig = buildCharacter(c)
    rig.root.position.set(map.w / 2 - (i - (list.length - 1) / 2) * 1.6, 0, cz)
    scene.add(rig.root)
    return rig
  })
  const cam = renderer.threeCamera
  const cx = map.w / 2
  const dist = focus ? 3.2 : 4.2 + list.length * 0.7
  let t = 0
  let lastT = performance.now()
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - lastT) / 1000)
    lastT = now
    t += dt
    rigs.forEach((r, i) => {
      r.root.rotation.y = Math.PI + Math.sin(t * 0.7 + i) * 0.6
      const swing = Math.sin(t * 4 + i) * 0.3
      r.legL.rotation.x = swing
      r.legR.rotation.x = -swing
    })
    cam.position.set(cx, 1.9, cz - dist)
    cam.lookAt(cx, focus ? 1.05 : 0.9, cz)
    renderer.setSun(cx + 4, 12, cz - 8)
    renderer.renderRaw()
    const ctx = renderer.hud.ctx
    renderer.hud.begin(dt)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    list.forEach((c, i) => {
      const v = new THREE.Vector3(map.w / 2 - (i - (list.length - 1) / 2) * 1.6, -0.15, cz).project(cam)
      const sx = ((v.x + 1) / 2) * VIEW_W
      const sy = ((1 - v.y) / 2) * VIEW_H
      ctx.font = `400 ${focus ? 40 : 26}px "Black Han Sans", "IBM Plex Sans KR", sans-serif`
      ctx.fillStyle = '#' + c.bodyColor.toString(16).padStart(6, '0')
      ctx.fillText(c.name, sx, sy + 30)
      ctx.font = '500 12px "IBM Plex Sans KR", sans-serif'
      ctx.fillStyle = '#b3b8a5'
      ctx.fillText(`${c.basedOn} · ${WEAPONS[c.weapon].name} · HP ${c.maxHp}`, sx, sy + 52)
    })
    ctx.font = '600 12px "IBM Plex Mono", monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(245,242,230,0.55)'
    ctx.fillText('BEDORAGE DUCK · CHARACTER SHEET (3D)', 18, 30)
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

// ---------- 입력 ----------
window.addEventListener('keydown', (e) => {
  hint.style.opacity = '1'
  hintTimer = 3
  switch (e.key.toLowerCase()) {
    case 'h':
      showHud = !showHud
      break
    case 'c':
      cameraMode = cameraMode === 'both' ? 'follow' : 'both'
      break
    case 'l':
      letterbox = !letterbox
      break
    case 'p':
      paused = !paused
      break
    case 'n':
      sfx.toggle()
      break
    case 'r':
      titleT = 100
      restart()
      break
    case 'm': {
      const idx = MAP_LIST.findIndex((m) => m.id === mapId)
      switchMap(MAP_LIST[(idx + 1) % MAP_LIST.length].id)
      titleT = 100
      break
    }
    case 'f':
      if (document.fullscreenElement) void document.exitFullscreen()
      else void document.documentElement.requestFullscreen()
      break
    case '1':
      diffs = diffs.map(() => 'easy')
      restart()
      break
    case '2':
      diffs = diffs.map(() => 'normal')
      restart()
      break
    case '3':
      diffs = diffs.map(() => 'hard')
      restart()
      break
    case '4':
      diffs = ['hard', 'normal', 'normal', 'hard']
      restart()
      break
    default:
      return
  }
  e.preventDefault()
})

function fit(): void {
  const s = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H)
  stage.style.transform = `scale(${s})`
  renderer.resize()
}
window.addEventListener('resize', fit)
fit()

void document.fonts.ready.then(() => {
  if (q.has('sheet')) runSheet()
  else requestAnimationFrame(frame)
})
