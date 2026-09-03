// 봇 AI. 매 틱 Input 을 생성한다. sim 과 같은 결정론 규칙을 따른다.
// (Math.random 금지 → 전용 Rng, 삼각함수 → fixedmath)

import { angleDiff, atan2A, cosA, sinA, len } from './fixedmath'
import { BTN_ADS, BTN_DASH, BTN_FIRE, BTN_RELOAD, Input } from './input'
import { GameMap, TILE, isWall, rayBlocked } from './map'
import { Rng, makeRng, rand, randInt, randSigned } from './rng'
import { GameState, PlayerState } from './state'
import { WEAPONS, WeaponId } from './weapons'

export type Difficulty = 'easy' | 'normal' | 'hard'

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: '쉬움',
  normal: '보통',
  hard: '어려움',
}

interface DiffDef {
  reaction: number
  aimErr: number
  turnRate: number
  fireChance: number
  useAds: boolean
  dashChance: number
  lead: number
  repathEvery: number
  wobble: number
}

const deg = (d: number) => Math.round((d / 360) * 1024)

const DIFFS: Record<Difficulty, DiffDef> = {
  easy: { reaction: 32, aimErr: deg(11), turnRate: 0.12, fireChance: 0.45, useAds: false, dashChance: 0.002, lead: 0, repathEvery: 24, wobble: deg(6) },
  normal: { reaction: 14, aimErr: deg(5), turnRate: 0.28, fireChance: 0.8, useAds: true, dashChance: 0.012, lead: 0.5, repathEvery: 12, wobble: deg(3) },
  hard: { reaction: 5, aimErr: deg(2), turnRate: 0.55, fireChance: 1, useAds: true, dashChance: 0.035, lead: 1.0, repathEvery: 6, wobble: deg(1) },
}

const PREFERRED_RANGE: Record<WeaponId, number> = {
  pistol: 210,
  smg: 170,
  rifle: 260,
  shotgun: 110,
  sniper: 380,
}

export interface BotMemory {
  rng: Rng
  aim: number
  wobbleBias: number
  wobbleTimer: number
  reaction: number
  lastSeenTick: number
  lastSeenX: number
  lastSeenY: number
  prevEnemyX: number
  prevEnemyY: number
  strafeDir: number
  strafeTimer: number
  wanderX: number
  wanderY: number
  wanderTimer: number
  path: number[]
  pathTick: number
  pathTargetTx: number
  pathTargetTy: number
  stuckX: number
  stuckY: number
  stuckTicks: number
  lastEnemyHp: number
  lastMyHp: number
}

export function makeBot(seed: number): BotMemory {
  return {
    rng: makeRng(seed),
    aim: 0,
    wobbleBias: 0,
    wobbleTimer: 0,
    reaction: 999,
    lastSeenTick: -10000,
    lastSeenX: 0,
    lastSeenY: 0,
    prevEnemyX: 0,
    prevEnemyY: 0,
    strafeDir: 1,
    strafeTimer: 0,
    wanderX: -1,
    wanderY: -1,
    wanderTimer: 0,
    path: [],
    pathTick: -1000,
    pathTargetTx: -1,
    pathTargetTy: -1,
    stuckX: 0,
    stuckY: 0,
    stuckTicks: 0,
    lastEnemyHp: 0,
    lastMyHp: 0,
  }
}

export function botInput(
  state: GameState,
  map: GameMap,
  meIdx: 0 | 1,
  mem: BotMemory,
  diff: Difficulty,
): Input {
  const d = DIFFS[diff]
  const me = state.players[meIdx]
  const enemy = state.players[1 - meIdx]
  const w = WEAPONS[me.weapon]
  const out: Input = { mx: 0, my: 0, aim: mem.aim, buttons: 0 }
  if (!me.alive) {
    mem.reaction = d.reaction
    return out
  }

  const enemyVx = enemy.x - mem.prevEnemyX
  const enemyVy = enemy.y - mem.prevEnemyY
  mem.prevEnemyX = enemy.x
  mem.prevEnemyY = enemy.y

  const dx = enemy.x - me.x
  const dy = enemy.y - me.y
  const dist = len(dx, dy)
  const los = enemy.alive && state.phase === 'playing' && !rayBlocked(map, me.x, me.y, enemy.x, enemy.y)

  if (los) {
    mem.lastSeenTick = state.tick
    mem.lastSeenX = enemy.x
    mem.lastSeenY = enemy.y
    if (mem.reaction > 0) mem.reaction--
  } else {
    mem.reaction = Math.min(d.reaction, mem.reaction + 1)
  }

  // ---- 조준 ----
  if (mem.wobbleTimer <= 0) {
    mem.wobbleBias = Math.round(randSigned(mem.rng) * d.wobble)
    mem.wobbleTimer = randInt(mem.rng, 20, 60)
  }
  mem.wobbleTimer--

  let desired = mem.aim
  if (los) {
    // 리드샷: 탄속 기준 예상 도달 시간 만큼 앞을 겨냥
    const t = (dist / w.speed) * d.lead
    const tx = enemy.x + enemyVx * t - me.x
    const ty = enemy.y + enemyVy * t - me.y
    desired = atan2A(ty, tx)
  } else if (state.tick - mem.lastSeenTick < 240 && enemy.alive) {
    desired = atan2A(mem.lastSeenY - me.y, mem.lastSeenX - me.x)
  } else if (me.moving || mem.path.length > 0) {
    // 이동 방향을 바라봄
    const nx = mem.wanderX - me.x
    const ny = mem.wanderY - me.y
    if (nx !== 0 || ny !== 0) desired = atan2A(ny, nx)
  }
  const err = Math.round(randSigned(mem.rng) * d.aimErr) + mem.wobbleBias
  const target = (desired + err) & 1023
  const diffA = angleDiff(target, mem.aim)
  mem.aim = (mem.aim + Math.round(diffA * d.turnRate)) & 1023
  out.aim = mem.aim

  // ---- 사격 ----
  const range = PREFERRED_RANGE[me.weapon]
  const canSee = los && mem.reaction === 0
  const onTarget = Math.abs(angleDiff(mem.aim, desired)) < deg(6) + Math.max(0, deg(10) - dist / 40)
  const inRange = dist < range * 1.9
  if (canSee && onTarget && inRange && enemy.invuln === 0) {
    if (rand(mem.rng) < d.fireChance) {
      // 반자동 무기는 눌렀다 떼야 하므로 격틱 발사
      if (w.auto || state.tick % 2 === 0) out.buttons |= BTN_FIRE
    }
    if (d.useAds && dist > 180 && me.dashTimer === 0) out.buttons |= BTN_ADS
  }
  if (!los && me.ammo < w.magSize * 0.4 && me.reloadTimer === 0) out.buttons |= BTN_RELOAD

  // ---- 이동 ----
  let goalX = -1
  let goalY = -1
  let mode: 'fight' | 'hunt' | 'wander' = 'wander'
  if (los && enemy.alive) {
    mode = 'fight'
  } else if (enemy.alive && state.tick - mem.lastSeenTick < 360) {
    mode = 'hunt'
    goalX = mem.lastSeenX
    goalY = mem.lastSeenY
  } else if (enemy.alive && diff === 'hard') {
    // 어려움: 상대 위치를 어렴풋이 안다 (레이더)
    mode = 'hunt'
    goalX = enemy.x
    goalY = enemy.y
  }

  if (mode === 'fight') {
    if (mem.strafeTimer <= 0) {
      mem.strafeDir = rand(mem.rng) < 0.5 ? -1 : 1
      mem.strafeTimer = randInt(mem.rng, 30, 80)
    }
    mem.strafeTimer--
    const ux = dist > 0 ? dx / dist : 1
    const uy = dist > 0 ? dy / dist : 0
    let fx = 0
    let fy = 0
    if (dist > range + 50) {
      fx += ux
      fy += uy
    } else if (dist < range - 50) {
      fx -= ux
      fy -= uy
    }
    // 스트레이프 (수직 방향)
    fx += -uy * mem.strafeDir * 0.9
    fy += ux * mem.strafeDir * 0.9
    // 벽에 막히면 스트레이프 방향 전환
    const px = me.x + fx * 24
    const py = me.y + fy * 24
    if (isWall(map, Math.floor(px / TILE), Math.floor(py / TILE))) {
      mem.strafeDir = -mem.strafeDir
      mem.strafeTimer = randInt(mem.rng, 30, 80)
      fx = -fx
      fy = -fy
    }
    toDir8(out, fx, fy)
    // 회피 대시: 상대가 방금 쐈거나 내가 맞았을 때
    const gotHit = me.hp < mem.lastMyHp
    const enemyJustFired = enemy.fireCooldown === WEAPONS[enemy.weapon].fireInterval
    if (
      me.dashCooldown === 0 &&
      (out.mx !== 0 || out.my !== 0) &&
      (gotHit || enemyJustFired) &&
      rand(mem.rng) < d.dashChance * 8
    ) {
      out.buttons |= BTN_DASH
    } else if (me.dashCooldown === 0 && (out.mx !== 0 || out.my !== 0) && rand(mem.rng) < d.dashChance) {
      out.buttons |= BTN_DASH
    }
  } else {
    if (mode === 'wander') {
      if (mem.wanderX < 0 || mem.wanderTimer <= 0 || len(mem.wanderX - me.x, mem.wanderY - me.y) < 24) {
        pickWander(map, mem)
      }
      mem.wanderTimer--
      goalX = mem.wanderX
      goalY = mem.wanderY
    } else {
      mem.wanderX = goalX
      mem.wanderY = goalY
    }
    followPath(state, map, me, mem, d, goalX, goalY, out)
  }

  // 끼임 감지
  if (out.mx !== 0 || out.my !== 0) {
    if (len(me.x - mem.stuckX, me.y - mem.stuckY) < 0.6) mem.stuckTicks++
    else mem.stuckTicks = 0
    if (mem.stuckTicks > 20) {
      pickWander(map, mem)
      mem.path = []
      mem.stuckTicks = 0
      mem.strafeDir = -mem.strafeDir
    }
  } else {
    mem.stuckTicks = 0
  }
  mem.stuckX = me.x
  mem.stuckY = me.y
  mem.lastMyHp = me.hp
  mem.lastEnemyHp = enemy.hp
  return out
}

function pickWander(map: GameMap, mem: BotMemory): void {
  for (let tries = 0; tries < 20; tries++) {
    const tx = randInt(mem.rng, 1, map.w - 1)
    const ty = randInt(mem.rng, 1, map.h - 1)
    if (!isWall(map, tx, ty)) {
      mem.wanderX = tx * TILE + TILE / 2
      mem.wanderY = ty * TILE + TILE / 2
      mem.wanderTimer = randInt(mem.rng, 180, 420)
      mem.path = []
      return
    }
  }
}

/** BFS 로 다음 웨이포인트를 찾아 8방향 입력으로 변환 */
function followPath(
  state: GameState,
  map: GameMap,
  me: PlayerState,
  mem: BotMemory,
  d: DiffDef,
  goalX: number,
  goalY: number,
  out: Input,
): void {
  const gtx = Math.floor(goalX / TILE)
  const gty = Math.floor(goalY / TILE)
  const mtx = Math.floor(me.x / TILE)
  const mty = Math.floor(me.y / TILE)
  const needRepath =
    mem.path.length === 0 ||
    state.tick - mem.pathTick > d.repathEvery ||
    gtx !== mem.pathTargetTx ||
    gty !== mem.pathTargetTy
  if (needRepath) {
    mem.path = bfs(map, mtx, mty, gtx, gty)
    mem.pathTick = state.tick
    mem.pathTargetTx = gtx
    mem.pathTargetTy = gty
  }
  // 현재 타일과 같은 웨이포인트는 건너뜀
  while (mem.path.length > 0) {
    const n = mem.path[0]
    const ntx = n % map.w
    const nty = Math.floor(n / map.w)
    if (ntx === mtx && nty === mty) mem.path.shift()
    else break
  }
  let tx = goalX
  let ty = goalY
  if (mem.path.length > 0) {
    const n = mem.path[0]
    tx = (n % map.w) * TILE + TILE / 2
    ty = Math.floor(n / map.w) * TILE + TILE / 2
  }
  toDir8(out, tx - me.x, ty - me.y)
}

function toDir8(out: Input, fx: number, fy: number): void {
  const l = len(fx, fy)
  if (l < 0.01) {
    out.mx = 0
    out.my = 0
    return
  }
  const a = atan2A(fy, fx)
  // 8 방향 양자화 (128 스텝 단위)
  const oct = Math.round(a / 128) & 7
  const ca = cosA(oct * 128)
  const sa = sinA(oct * 128)
  out.mx = ca > 0.3 ? 1 : ca < -0.3 ? -1 : 0
  out.my = sa > 0.3 ? 1 : sa < -0.3 ? -1 : 0
}

/** 4방향 BFS. 시작 제외, 목표 포함 타일 인덱스 배열 반환. */
function bfs(map: GameMap, sx: number, sy: number, gx: number, gy: number): number[] {
  const w = map.w
  const h = map.h
  const start = sy * w + sx
  const goal = gy * w + gx
  if (start === goal) return []
  if (isWall(map, gx, gy)) return []
  const prev = new Int32Array(w * h).fill(-1)
  const queue: number[] = [start]
  prev[start] = start
  let head = 0
  const dirs = [1, -1, w, -w]
  while (head < queue.length) {
    const cur = queue[head++]
    if (cur === goal) break
    const cx = cur % w
    const cy = (cur - cx) / w
    for (let i = 0; i < 4; i++) {
      const nx = cx + (i === 0 ? 1 : i === 1 ? -1 : 0)
      const ny = cy + (i === 2 ? 1 : i === 3 ? -1 : 0)
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const n = cur + dirs[i]
      if (prev[n] !== -1) continue
      if (isWall(map, nx, ny)) continue
      prev[n] = cur
      queue.push(n)
    }
  }
  if (prev[goal] === -1) return []
  const path: number[] = []
  let c = goal
  while (c !== start) {
    path.push(c)
    c = prev[c]
  }
  path.reverse()
  return path
}
