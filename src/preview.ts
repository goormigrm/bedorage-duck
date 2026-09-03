// 프리뷰(트레일러 캡처용) 페이지: 봇 vs 봇 자동 플레이 + 시네마틱 카메라 + 슬로모션.

import { Difficulty, DIFFICULTY_LABEL, botInput, makeBot } from './core/bot'
import { CHARACTERS, CHARACTER_LIST, CharacterId, PROTAGONIST } from './core/characters'
import { Input } from './core/input'
import { buildMap } from './core/map'
import { createState, snapshot, step } from './core/sim'
import { GameState, TICK_MS } from './core/state'
import { Renderer, VIEW_H, VIEW_W, roundRect } from './render/canvas'
import { drawCharacter } from './render/character'
import { WEAPONS } from './core/weapons'

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
let matchCount = 0
let match = newMatch()

// URL 파라미터: ?ff=900 (900틱 빨리감기) · ?notitle=1 (타이틀 카드 생략) · ?diff=hard,normal · ?kills=5
{
  const q = new URLSearchParams(location.search)
  const d = q.get('diff')
  if (d) {
    const [a, b] = d.split(',') as Difficulty[]
    if (a && b) diff = [a, b]
  }
  if (q.get('notitle')) titleT = 100
  const ff = Number(q.get('ff') ?? 0)
  if (ff > 0) {
    titleT = 100
    for (let i = 0; i < ff; i++) {
      match.prev = snapshot(match.state)
      step(match.state, map, [
        botInput(match.state, map, 0, match.bots[0], diff[0]),
        botInput(match.state, map, 1, match.bots[1], diff[1]),
      ])
      if (i >= ff - 3) renderer.onEvents(match.state.events, match.state, -1)
    }
  }
}

/** 주인공(철면덕)은 항상 P1. 상대는 노출 우선순위 가중 무작위 (침착덕이 가장 자주). */
function pickChars(): [CharacterId, CharacterId] {
  const others = CHARACTER_LIST.filter((c) => c.id !== PROTAGONIST.id)
  // 가중치: prominence 2 → 4, 3 → 3, 4 → 2, 5 → 1
  const weights = others.map((c) => Math.max(1, 6 - c.prominence))
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  let pick = others[0]
  for (let i = 0; i < others.length; i++) {
    r -= weights[i]
    if (r <= 0) {
      pick = others[i]
      break
    }
  }
  // 첫 경기는 항상 철면덕 vs 침착덕
  if (matchCount++ === 0) pick = CHARACTERS.chim
  return [PROTAGONIST.id, pick.id]
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

  // 타이틀 카드가 떠 있는 동안은 시뮬레이션을 잠시 멈춘다 (카운트다운과 겹치지 않게)
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

  if (SHEET) {
    drawSheet()
    requestAnimationFrame(frame)
    return
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
  drawOverlay(rawDt)
  requestAnimationFrame(frame)
}

const SHEET = new URLSearchParams(location.search).has('sheet')

const FOCUS = new URLSearchParams(location.search).get('focus')

/** ?sheet=1 : 캐릭터 시트 (정면·측면 크게). ?sheet=1&focus=<id> : 한 명만 아주 크게 */
function drawSheet(): void {
  const ctx = renderer.ctx
  ctx.setTransform(renderer.canvas.width / VIEW_W, 0, 0, renderer.canvas.height / VIEW_H, 0, 0)
  ctx.fillStyle = '#1c1f17'
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  if (FOCUS) {
    const c = CHARACTER_LIST.find((x) => x.id === FOCUS)
    if (c) {
      const facings = [-Math.PI / 2 + 0.35, 0.2, Math.PI - 0.3]
      facings.forEach((f, j) => {
        ctx.save()
        ctx.translate(VIEW_W / 2 + (j - 1) * 400, VIEW_H / 2 + 200)
        const s = j === 1 ? 12 : 8
        ctx.scale(s, s)
        drawCharacter(ctx, c, { facing: f, sx: 1, sy: 1, walk: 0, moving: false, flash: 0, t: 0 })
        ctx.restore()
      })
      return
    }
  }
  const n = CHARACTER_LIST.length
  const cw = VIEW_W / n
  const wrap = (text: string, maxW: number): string[] => {
    const words = text.split(' ')
    const lines: string[] = []
    let cur = ''
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w
      if (ctx.measureText(t).width > maxW && cur) {
        lines.push(cur)
        cur = w
      } else cur = t
    }
    if (cur) lines.push(cur)
    return lines
  }
  CHARACTER_LIST.forEach((c, i) => {
    const cx = cw * i + cw / 2
    const hero = c.prominence === 1
    ctx.fillStyle = hero ? '#33382a' : '#2a2e24'
    roundRect(ctx, cw * i + 12, 40, cw - 24, VIEW_H - 80, 12)
    ctx.fill()
    if (hero) {
      ctx.strokeStyle = '#' + c.bodyColor.toString(16).padStart(6, '0')
      ctx.lineWidth = 2
      roundRect(ctx, cw * i + 12, 40, cw - 24, VIEW_H - 80, 12)
      ctx.stroke()
      ctx.fillStyle = '#' + c.bodyColor.toString(16).padStart(6, '0')
      roundRect(ctx, cx - 44, 54, 88, 24, 12)
      ctx.fill()
      ctx.font = '600 12px "IBM Plex Sans KR", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#1e2219'
      ctx.fillText('배도라지장', cx, 66)
    }
    const big = hero ? 4.8 : 4.0
    const small = hero ? 2.8 : 2.4
    const facings = [-Math.PI / 2 + 0.5, 0, Math.PI * 0.8]
    facings.forEach((f, j) => {
      ctx.save()
      ctx.translate(cx + (j - 1) * 70, 300)
      ctx.scale(j === 1 ? big : small, j === 1 ? big : small)
      drawCharacter(ctx, c, { facing: f, sx: 1, sy: 1, walk: 0, moving: false, flash: 0, t: 0 })
      ctx.restore()
    })
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.font = `400 ${hero ? 44 : 36}px "Black Han Sans", "IBM Plex Sans KR", sans-serif`
    ctx.fillStyle = '#' + c.bodyColor.toString(16).padStart(6, '0')
    ctx.fillText(c.name, cx, 478)
    ctx.font = '500 14px "IBM Plex Sans KR", sans-serif'
    ctx.fillStyle = '#b3b8a5'
    ctx.fillText(`${c.basedOn} · ${WEAPONS[c.weapon].name} · HP ${c.maxHp}`, cx, 508)
    ctx.font = '400 12.5px "IBM Plex Sans KR", sans-serif'
    ctx.fillStyle = '#8f957f'
    let y = 536
    for (const line of wrap(`${c.passiveName}: ${c.passiveDesc}`, cw - 48)) {
      ctx.fillText(line, cx, y)
      y += 18
    }
    y += 6
    ctx.fillStyle = '#6f7565'
    for (const line of wrap(c.tagline, cw - 48)) {
      ctx.fillText(line, cx, y)
      y += 18
    }
  })
  ctx.font = '600 12px "IBM Plex Mono", monospace'
  ctx.textAlign = 'left'
  ctx.fillStyle = 'rgba(245,242,230,0.55)'
  ctx.fillText('BEDORAGE DUCK · CHARACTER SHEET', 18, 30)
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
    // 주인공 철면덕 초상 (왼쪽, 크게)
    ctx.save()
    ctx.translate(VIEW_W / 2 - 330, VIEW_H / 2 + 120 + rise * 0.5)
    ctx.scale(6.5, 6.5)
    drawCharacter(ctx, PROTAGONIST, { facing: 0.35, sx: 1, sy: 1, walk: 0, moving: false, flash: 0, t: 0 })
    ctx.restore()
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    const tx0 = VIEW_W / 2 - 150
    ctx.font = '400 128px "Black Han Sans", "IBM Plex Sans KR", sans-serif'
    ctx.fillStyle = '#f5f2e6'
    ctx.fillText('배도라지', tx0, VIEW_H / 2 - 40 + rise)
    ctx.fillStyle = '#ffd84a'
    ctx.fillText('덕', tx0 + 470, VIEW_H / 2 - 40 + rise)
    ctx.font = '500 20px "IBM Plex Sans KR", sans-serif'
    ctx.fillStyle = '#b3b8a5'
    ctx.fillText('1:1 쿼터뷰 슈터  ·  서버 없는 P2P 대전  ·  비공식 팬게임', tx0 + 6, VIEW_H / 2 + 52 + rise)
    ctx.font = '500 14px "IBM Plex Sans KR", sans-serif'
    ctx.fillStyle = '#ff5a36'
    ctx.fillText('철면덕 · 침착덕 · 단군덕 · 매직덕 · 주펄덕', tx0 + 6, VIEW_H / 2 + 84 + rise)
    ctx.font = '500 13px "IBM Plex Mono", monospace'
    ctx.fillStyle = '#7d8471'
    ctx.fillText('goormigrm.github.io/bedorage-duck', tx0 + 6, VIEW_H / 2 + 112 + rise)
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
