import { CHARACTERS } from './characters'
import { atan2A, cosA, sinA, len } from './fixedmath'
import { BTN_ADS, BTN_DASH, BTN_FIRE, BTN_RELOAD, Input } from './input'
import { GameMap, isWallAt, rayBlocked } from './map'
import { circlesOverlap, moveCircle, segmentHitsCircle } from './physics'
import { makeRng, rand, randInt } from './rng'
import {
  Bullet,
  COUNTDOWN_TICKS,
  DASH_SPEED,
  DASH_TICKS,
  GameState,
  MAX_PLAYERS,
  MIN_PLAYERS,
  MatchConfig,
  PLAYER_RADIUS,
  PlayerState,
  RESPAWN_TICKS,
  SPAWN_PROTECT_TICKS,
  isEnemy,
  teamKills,
} from './state'
import { PART_HEAD, PART_LEGS, PART_MULT, WEAPONS, falloff, partThresholds } from './weapons'

const MAX_RECOIL_MUL = 3

export function createState(cfg: MatchConfig, map: GameMap): GameState {
  const rng = makeRng(cfg.seed)
  const n = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, cfg.chars.length))
  const players: PlayerState[] = []
  for (let i = 0; i < n; i++) players.push(makePlayer(i, cfg.chars[i], cfg.teams?.[i] ?? i))
  const state: GameState = {
    tick: 0,
    rng,
    phase: 'countdown',
    phaseTimer: COUNTDOWN_TICKS,
    targetKills: cfg.targetKills,
    players,
    bullets: [],
    nextBulletId: 1,
    winner: -1,
    events: [],
  }
  // 초기 스폰: 첫 사람은 무작위, 다음 사람은 이미 놓인 모두에게서 가장 먼 곳
  const used: { x: number; y: number }[] = []
  const first = map.spawns[randInt(rng, 0, map.spawns.length)]
  placeAt(players[0], first)
  used.push(first)
  for (let i = 1; i < n; i++) {
    const s = farthestSpawn(map, used, rng, 1)
    placeAt(players[i], s)
    used.push(s)
  }
  // 처음엔 맵 중앙을 바라본다
  for (const p of players) p.aim = atan2A(map.ph / 2 - p.y, map.pw / 2 - p.x)
  return state
}

function makePlayer(id: number, char: PlayerState['char'], team: number): PlayerState {
  const c = CHARACTERS[char]
  const w = WEAPONS[c.weapon]
  return {
    id,
    team,
    char,
    x: 0,
    y: 0,
    aim: 0,
    hp: c.maxHp,
    alive: true,
    respawnTimer: 0,
    weapon: c.weapon,
    ammo: w.magSize,
    reloadTimer: 0,
    fireCooldown: 0,
    recoil: 0,
    ads: false,
    dashTimer: 0,
    dashCooldown: 0,
    dashDx: 0,
    dashDy: 0,
    lastHitTick: -10000,
    prevFire: false,
    kills: 0,
    deaths: 0,
    legInjury: 0,
    invuln: SPAWN_PROTECT_TICKS,
    moving: false,
    aliveTicks: 0,
    left: false,
  }
}

function placeAt(p: PlayerState, s: { x: number; y: number }): void {
  p.x = s.x
  p.y = s.y
}

/**
 * 기준점들(적·이미 배치된 사람)로부터의 최소 거리가 가장 먼 스폰 상위 topN 개 중 무작위.
 * 기준점이 없으면 아무 스폰이나.
 */
function farthestSpawn(
  map: GameMap,
  from: { x: number; y: number }[],
  rng: GameState['rng'],
  topN: number,
): { x: number; y: number } {
  if (from.length === 0) return map.spawns[randInt(rng, 0, map.spawns.length)]
  const scored = map.spawns.map((s, i) => {
    let d = Infinity
    for (const f of from) d = Math.min(d, len(s.x - f.x, s.y - f.y))
    return { s, i, d }
  })
  scored.sort((a, b) => b.d - a.d || a.i - b.i)
  const top = scored.slice(0, Math.min(topN, scored.length))
  return top[randInt(rng, 0, top.length)].s
}

export function step(state: GameState, map: GameMap, inputs: Input[]): void {
  const ev = state.events
  ev.length = 0

  if (state.phase === 'countdown') {
    state.phaseTimer--
    if (state.phaseTimer <= 0) {
      state.phase = 'playing'
      ev.push({ type: 'start' })
    }
  }

  for (let i = 0; i < state.players.length; i++) {
    stepPlayer(state, map, state.players[i], inputs[i])
  }

  stepBullets(state, map)

  state.tick++
}

/** 경기 도중 나간 사람 처리 (호스트가 정한 틱에 모두가 같이 호출해야 결정론이 유지된다) */
export function dropPlayer(state: GameState, idx: number): void {
  const p = state.players[idx]
  if (!p || p.left) return
  p.left = true
  p.alive = false
  p.hp = 0
  p.respawnTimer = 0
  state.events.push({ type: 'leave', p: idx })
}

function stepPlayer(state: GameState, map: GameMap, p: PlayerState, input: Input | undefined): void {
  const c = CHARACTERS[p.char]
  const w = WEAPONS[p.weapon]
  p.moving = false
  if (p.left) return
  if (!input) input = { mx: 0, my: 0, aim: p.aim, buttons: 0 }

  if (!p.alive) {
    if (state.phase !== 'over') {
      p.respawnTimer--
      if (p.respawnTimer <= 0) respawn(state, map, p)
    }
    return
  }

  p.aliveTicks++
  if (p.fireCooldown > 0) p.fireCooldown--
  if (p.dashCooldown > 0) p.dashCooldown--
  if (p.invuln > 0) p.invuln--
  if (p.legInjury > 0) p.legInjury--
  if (p.reloadTimer > 0) {
    p.reloadTimer--
    if (p.reloadTimer === 0) p.ammo = w.magSize
  }
  const recover = c.id === 'chim' ? w.recoilRecover * 2 : w.recoilRecover
  p.recoil = Math.max(0, p.recoil - recover)

  // 매직덕 패시브: 피격 3초 후 초당 4 회복
  if (c.id === 'magic' && state.tick - p.lastHitTick > 180 && p.hp < c.maxHp) {
    p.hp = Math.min(c.maxHp, p.hp + 4 / 60)
  }

  p.aim = input.aim & 1023
  const playing = state.phase === 'playing'
  p.ads = playing && (input.buttons & BTN_ADS) !== 0 && p.dashTimer === 0

  // 이동
  let mx = input.mx
  let my = input.my
  if (!playing) {
    mx = 0
    my = 0
  }
  if (p.dashTimer > 0) {
    p.dashTimer--
    const r = moveCircle(map, p.x, p.y, PLAYER_RADIUS, p.dashDx * DASH_SPEED, p.dashDy * DASH_SPEED)
    p.x = r.x
    p.y = r.y
    p.moving = true
  } else if (mx !== 0 || my !== 0) {
    const inv = mx !== 0 && my !== 0 ? 0.70710678 : 1
    let speed = c.speed * w.moveMul
    if (p.ads) speed *= 0.6
    if (p.legInjury > 0) speed *= 0.7
    const r = moveCircle(map, p.x, p.y, PLAYER_RADIUS, mx * inv * speed, my * inv * speed)
    p.x = r.x
    p.y = r.y
    p.moving = true
  }

  // 대시
  if (
    playing &&
    input.buttons & BTN_DASH &&
    p.dashCooldown === 0 &&
    p.dashTimer === 0 &&
    (mx !== 0 || my !== 0)
  ) {
    const inv = mx !== 0 && my !== 0 ? 0.70710678 : 1
    p.dashDx = mx * inv
    p.dashDy = my * inv
    p.dashTimer = DASH_TICKS
    p.dashCooldown = c.dashCooldown
    p.ads = false
    state.events.push({ type: 'dash', p: p.id })
  }

  // 재장전
  if (playing && input.buttons & BTN_RELOAD && p.reloadTimer === 0 && p.ammo < w.magSize) {
    p.reloadTimer = w.reloadTicks
    state.events.push({ type: 'reload', p: p.id })
  }

  // 사격
  const firePressed = (input.buttons & BTN_FIRE) !== 0
  const trigger = w.auto ? firePressed : firePressed && !p.prevFire
  p.prevFire = firePressed
  if (playing && trigger && p.dashTimer === 0) {
    if (p.ammo === 0 && p.reloadTimer === 0) {
      p.reloadTimer = w.reloadTicks
      state.events.push({ type: 'reload', p: p.id })
    } else if (p.fireCooldown === 0 && p.reloadTimer === 0 && p.ammo > 0) {
      fire(state, map, p)
    }
  }
}

function fire(state: GameState, map: GameMap, p: PlayerState): void {
  const w = WEAPONS[p.weapon]
  const spread = (p.ads ? w.spreadAds : w.spreadHip) + p.recoil
  let mx = p.x + cosA(p.aim) * (PLAYER_RADIUS + 6)
  let my = p.y + sinA(p.aim) * (PLAYER_RADIUS + 6)
  if (isWallAt(map, mx, my)) {
    mx = p.x
    my = p.y
  }
  for (let i = 0; i < w.pellets; i++) {
    const off = spread > 0 ? randInt(state.rng, -spread, spread + 1) : 0
    const a = (p.aim + off) & 1023
    const b: Bullet = {
      id: state.nextBulletId++,
      owner: p.id,
      x: mx,
      y: my,
      px: mx,
      py: my,
      vx: cosA(a) * w.speed,
      vy: sinA(a) * w.speed,
      life: w.life,
      damage: w.damage,
      ads: p.ads,
      ox: p.x,
      oy: p.y,
      weapon: p.weapon,
    }
    state.bullets.push(b)
  }
  p.ammo--
  p.fireCooldown = w.fireInterval
  p.recoil = Math.min(w.recoil * MAX_RECOIL_MUL * 2, p.recoil + w.recoil)
  state.events.push({ type: 'fire', p: p.id, x: mx, y: my, aim: p.aim, weapon: p.weapon })
  if (p.ammo === 0) {
    p.reloadTimer = w.reloadTicks
    state.events.push({ type: 'reload', p: p.id })
  }
}

function stepBullets(state: GameState, map: GameMap): void {
  const bullets = state.bullets
  let write = 0
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i]
    b.px = b.x
    b.py = b.y
    b.x += b.vx
    b.y += b.vy
    b.life--
    let dead = false

    if (rayBlocked(map, b.px, b.py, b.x, b.y)) {
      const aim = state.players[b.owner].aim
      state.events.push({ type: 'wall', x: b.x, y: b.y, aim })
      dead = true
    }

    if (!dead) {
      const shooter = state.players[b.owner]
      // 적 중 이 선분에 처음(인덱스 순) 걸리는 사람. 탄 길이가 짧아 둘이 동시에 걸리는 일은 드물다.
      for (const victim of state.players) {
        if (!isEnemy(shooter, victim) || !victim.alive || victim.left || victim.invuln > 0) continue
        if (segmentHitsCircle(b.px, b.py, b.x, b.y, victim.x, victim.y, PLAYER_RADIUS)) {
          applyHit(state, b, victim)
          dead = true
          break
        }
      }
    }

    if (!dead && b.life <= 0) dead = true
    if (!dead) bullets[write++] = b
  }
  bullets.length = write
}

function applyHit(state: GameState, b: Bullet, victim: PlayerState): void {
  const dist = len(victim.x - b.ox, victim.y - b.oy)
  const [th, tb] = partThresholds(b.ads, dist)
  const r = rand(state.rng)
  const part = r < th ? PART_HEAD : r < tb ? 1 : PART_LEGS
  let dmg = b.damage * PART_MULT[part] * falloff(WEAPONS[b.weapon], dist)
  const shooter = state.players[b.owner]
  if (shooter.char === 'jupeol' && dist < 150) dmg *= 1.2
  dmg = Math.round(dmg)
  victim.hp -= dmg
  victim.lastHitTick = state.tick
  if (part === PART_LEGS) victim.legInjury = 180
  state.events.push({ type: 'hit', p: victim.id, by: b.owner, x: b.x, y: b.y, part, dmg })
  if (victim.hp <= 0) {
    victim.hp = 0
    victim.alive = false
    victim.respawnTimer = RESPAWN_TICKS
    victim.deaths++
    shooter.kills++
    state.events.push({ type: 'death', p: victim.id, by: b.owner, x: victim.x, y: victim.y })
    if (teamKills(state, shooter.team) >= state.targetKills && state.phase === 'playing') {
      state.phase = 'over'
      state.winner = shooter.team
      state.events.push({ type: 'over', winner: shooter.team })
    }
  }
}

function respawn(state: GameState, map: GameMap, p: PlayerState): void {
  const c = CHARACTERS[p.char]
  const w = WEAPONS[p.weapon]
  // 살아있는 적 모두에게서 먼 곳 (상위 3곳 중 무작위)
  const enemies: { x: number; y: number }[] = []
  for (const e of state.players) if (isEnemy(p, e) && e.alive && !e.left) enemies.push(e)
  let spot = farthestSpawn(map, enemies, state.rng, 3)
  // 누군가와 겹치면 다른 곳
  for (const e of state.players) {
    if (e.id !== p.id && e.alive && circlesOverlap(spot.x, spot.y, PLAYER_RADIUS, e.x, e.y, PLAYER_RADIUS)) {
      spot = farthestSpawn(map, [spot, ...enemies], state.rng, 1)
      break
    }
  }
  placeAt(p, spot)
  p.hp = c.maxHp
  p.alive = true
  p.ammo = w.magSize
  p.reloadTimer = 0
  p.fireCooldown = 0
  p.recoil = 0
  p.dashTimer = 0
  p.dashCooldown = 0
  p.legInjury = 0
  p.invuln = SPAWN_PROTECT_TICKS
  p.aliveTicks = 0
  p.lastHitTick = -10000
  state.events.push({ type: 'respawn', p: p.id, x: p.x, y: p.y })
}

/** 스냅샷 (events 제외) */
export function snapshot(state: GameState): GameState {
  const { events: _e, ...rest } = state
  const copy = structuredClone(rest) as GameState
  copy.events = []
  return copy
}

/** FNV-1a 32비트 해시. 결정론 검증용. */
export function hashState(state: GameState): number {
  const { events: _e, ...rest } = state
  const s = JSON.stringify(rest)
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
