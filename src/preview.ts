// 프리뷰(트레일러 캡처용) 페이지: 봇 vs 봇 자동 플레이 + 시네마틱 카메라 + 슬로모션.

import { Difficulty, DIFFICULTY_LABEL, botInput, makeBot } from './core/bot'
import { CHARACTER_LIST, CharacterId } from './core/characters'
import { Input } from './core/input'
import { buildMap } from './core/map'
import { createState, snapshot, step } from './core/sim'
import { GameState, TICK_MS } from './core/state'
import { Renderer, VIEW_H, VIEW_W, roundRect } from './render/canvas'

const canvas = document.getElementById('game') as HTMLCanvasElement
const stage = document.getElementById('stage') as HTMLDivElement
const hint = document.getElementById('hint') as HTMLDivElement
const map = buildMap()
const renderer = new Renderer(canvas, map)

let diff: [Difficulty, Difficulty] = ['hard', 'normal']
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

interface Match {
  state: GameState
  prev: GameState
  bots: [ReturnType<typeof makeBot>, ReturnType<typeof makeBot>]
  names: [string, string]
  subs: [string, string]
}
let match = newMatch()

function pickChars(): [CharacterId, CharacterId] {
  const a = Math.floor(Math.random() * CHARACTER_LIST.length)
  let b = Math.floor(Math.random() * (CHARACTER_LIST.length - 1))
  if (b >= a) b++
  return [CHARACTER_LIST[a].id, CHARACTER_LIST[b].id]
}

function newMatch(): Match {
  const chars = pickChars()
  const seed = (seedCounter = (seedCounter * 1103515245 + 12345) >>> 0)
  const state = createState({ seed, targetKills: 5, chars }, map)
  const c0 = CHARACTER_LIST.find((c) => c.id === chars[0])!
  const c1 = CHARACTER_LIST.find((c) => c.id === chars[1])!
  return {
    state,
    prev: snapshot(state),
    bots: [makeBot(seed ^ 0xa5a5), makeBot(seed ^ 0x5a5a)],
    names: [c0.name, c1.name],
    subs: [`AI · ${DIFFICULTY_LABEL[diff[0]]}`, `AI · ${DIFFICULTY_LABEL[diff[1]]}`],
  }
}

function restart(): void {
  match = newMatch()
  restartAt = -1
  slowmoLeft = 0
  timeScale = 1
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

  if (!paused) {
    if (slowmoLeft > 0) {
      slowmoLeft -= rawDt
      timeScale = slowmoLeft > 0 ? 0.22 : 1
    }
    acc += rawDt * 1000 * timeScale
    let steps = 0
    while (acc >= TICK_MS && steps < 6) {
      match.prev = snapshot(match.state)
      const inputs: [Input, Input] = [
        botInput(match.state, map, 0, match.bots[0], diff[0]),
        botInput(match.state, map, 1, match.bots[1], diff[1]),
      ]
      step(match.state, map, inputs)
      renderer.onEvents(match.state.events, match.state, -1)
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
    showHud,
    localPlayer: -1,
    cameraMode,
    names: match.names,
    subLabels: match.subs,
    timeScale,
  })
  drawOverlay(rawDt)
  requestAnimationFrame(frame)
}

function drawOverlay(_dt: number): void {
  const ctx = renderer.ctx
  ctx.setTransform(renderer.canvas.width / VIEW_W, 0, 0, renderer.canvas.height / VIEW_H, 0, 0)

  if (letterbox) {
    const bar = Math.round((VIEW_H - VIEW_W / 2.39) / 2)
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, VIEW_W, bar)
    ctx.fillRect(0, VIEW_H - bar, VIEW_W, bar)
  }

  // 타이틀 카드 (처음 3.6초)
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
    ctx.fillText('배도라지', VIEW_W / 2 - 70, VIEW_H / 2 - 30 + rise)
    ctx.fillStyle = '#ffd84a'
    ctx.fillText('덕', VIEW_W / 2 + 200, VIEW_H / 2 - 30 + rise)
    ctx.font = '500 20px "IBM Plex Sans KR", sans-serif'
    ctx.fillStyle = '#b3b8a5'
    ctx.fillText('1:1 쿼터뷰 슈터  ·  서버 없는 P2P 대전  ·  비공식 팬게임', VIEW_W / 2, VIEW_H / 2 + 60 + rise)
    ctx.font = '500 13px "IBM Plex Mono", monospace'
    ctx.fillStyle = '#7d8471'
    ctx.fillText('goormigrm.github.io/bedorage-duck', VIEW_W / 2, VIEW_H / 2 + 96 + rise)
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

  // 워터마크 (좌상단, 작게)
  ctx.font = '600 12px "IBM Plex Mono", monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = 'rgba(245,242,230,0.55)'
  ctx.fillText('BEDORAGE DUCK · PREVIEW', 18, 30)
  if (timeScale < 1) {
    ctx.fillStyle = 'rgba(20,22,16,0.7)'
    roundRect(ctx, 18, 40, 92, 22, 4)
    ctx.fill()
    ctx.fillStyle = '#ffd84a'
    ctx.fillText('SLOW-MO', 26, 55)
  }
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
    case 'r':
      titleT = 100
      restart()
      break
    case 'f':
      if (document.fullscreenElement) void document.exitFullscreen()
      else void document.documentElement.requestFullscreen()
      break
    case '1':
      diff = ['easy', 'easy']
      restart()
      break
    case '2':
      diff = ['normal', 'normal']
      restart()
      break
    case '3':
      diff = ['hard', 'hard']
      restart()
      break
    case '4':
      diff = ['hard', 'normal']
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
  requestAnimationFrame(frame)
})
