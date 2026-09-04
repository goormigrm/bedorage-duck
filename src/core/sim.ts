import { CHARACTERS, CHARACTER_LIST } from './characters'
import { angleDiff, atan2A, cosA, sinA, len } from './fixedmath'
import { BTN_ADS, BTN_DASH, BTN_FIRE, BTN_RELOAD, BTN_SWAP, Input } from './input'
import { GameMap, SANDBAG_HP, TILE_SANDBAG, isWallAt, nearSandbag, rayCast } from './map'
import { circlesOverlap, moveCircle, pointLineDistance, segmentHitsCircle } from './physics'
import { makeRng, randInt } from './rng'
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
  DASH_COST,
  RESPAWN_TICKS,
  SPAWN_PROTECT_TICKS,
  STAMINA_MAX,
  STAMINA_REGEN,
  SWAP_GRACE_TICKS,
  isEnemy,
  teamKills,
} from './state'
import { PART_BODY, PART_HEAD, PART_LEGS, PART_MULT, WEAPONS, falloff, headMult, partForOffset } from './weapons'

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
    sandbags: {},
    events: [],
  }
  // 같은 맵 객체로 다시 시작해도 똑같이 시작하도록 부서진 모래주머니를 되돌린다
  for (const i of map.sandbagIdx) {
    map.tiles[i] = TILE_SANDBAG
    state.sandbags[i] = SANDBAG_HP
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
    choosing: false,
    streak: 0,
    stamina: STAMINA_MAX,
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
  if (!input) input = { mx: 0, my: 0, aim: p.aim, buttons: 0, char: 0 }
  const playing = state.phase === 'playing'
  const swap = (input.buttons & BTN_SWAP) !== 0 && playing

  if (!p.alive) {
    if (state.phase === 'over') return
    if (p.respawnTimer > 0) p.respawnTimer--
    if (swap && !p.choosing) {
      p.choosing = true
      state.events.push({ type: 'choose', p: p.id })
    }
    if (p.choosing) {
      if (input.char <= 0) return // 고르는 동안은 소환하지 않는다
      const def = CHARACTER_LIST[input.char - 1]
      if (def && def.id !== p.char) {
        p.char = def.id
        p.weapon = def.weapon
        state.events.push({ type: 'swap', p: p.id, char: def.id })
      }
      p.choosing = false
    }
    if (p.respawnTimer <= 0) respawn(state, map, p)
    return
  }

  if (playing) p.aliveTicks++ // 카운트다운은 세지 않는다 → 시작 직후 3초도 교체 가능
  // 리스폰 직후(3초 안) Tab: 소환을 물리고 캐릭터를 다시 고른다
  if (swap && p.aliveTicks <= SWAP_GRACE_TICKS && !p.choosing) {
    p.alive = false
    p.choosing = true
    p.respawnTimer = RESPAWN_TICKS
    p.ads = false
    p.dashTimer = 0
    state.events.push({ type: 'choose', p: p.id })
    return
  }
  if (p.fireCooldown > 0) p.fireCooldown--
  if (p.dashCooldown > 0) p.dashCooldown--
  if (p.dashTimer === 0 && p.stamina < STAMINA_MAX) p.stamina = Math.min(STAMINA_MAX, p.stamina + STAMINA_REGEN)
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
    if (p.ads && c.id !== 'oknyang') speed *= 0.6 // 옥냥덕 패시브: 정조준해도 느려지지 않음
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
    p.stamina >= DASH_COST &&
    (mx !== 0 || my !== 0)
  ) {
    p.stamina -= DASH_COST
    const inv = mx !== 0 && my !== 0 ? 0.70710678 : 1
    p.dashDx = mx * inv
    p.dashDy = my * inv
    p.dashTimer = c.id === 'juwoojae' ? Math.round(DASH_TICKS * 1.5) : DASH_TICKS // 주우재덕: 대시 거리 +50%
    p.dashCooldown = c.dashCooldown
    p.ads = false
    if (c.id === 'uwon') p.invuln = Math.max(p.invuln, p.dashTimer + 12) // 우원덕: 대시가 끝난 뒤에도 0.2초 무적
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
    const infinite = w.magSize === 0
    if (!infinite && p.ammo === 0 && p.reloadTimer === 0) {
      p.reloadTimer = w.reloadTicks
      state.events.push({ type: 'reload', p: p.id })
    } else if (p.fireCooldown === 0 && p.reloadTimer === 0 && (infinite || p.ammo > 0)) {
      fire(state, map, p)
    }
  }
}

/** 총구에서 나간 이 각도의 탄이 적의 머리(중심)를 정확히 겨누는가 → 모래주머니를 넘어간다 */
function aimsAtHead(state: GameState, map: GameMap, shooter: PlayerState, mx: number, my: number, a: number): boolean {
  const dx = cosA(a)
  const dy = sinA(a)
  for (const e of state.players) {
    if (!isEnemy(shooter, e) || !e.alive || e.left) continue
    const t = (e.x - mx) * dx + (e.y - my) * dy
    if (t <= 0 || t > 1200) continue
    if (len(mx + dx * t - e.x, my + dy * t - e.y) > PLAYER_RADIUS * 0.34) continue
    if (rayCast(map, mx, my, e.x, e.y, 'sight').blocked) continue
    return true
  }
  return false
}

/** 근접 무기(후라이팬): 부채꼴 안의 적을 바로 때린다 */
function meleeSwing(state: GameState, map: GameMap, p: PlayerState): void {
  const w = WEAPONS[p.weapon]
  const range = (w.meleeRange ?? 60) + PLAYER_RADIUS
  const arc = w.meleeArc ?? 150
  for (const victim of state.players) {
    if (!isEnemy(p, victim) || !victim.alive || victim.left || victim.invuln > 0 || victim.dashTimer > 0) continue
    const dx = victim.x - p.x
    const dy = victim.y - p.y
    if (len(dx, dy) > range) continue
    if (Math.abs(angleDiff(atan2A(dy, dx), p.aim)) > arc) continue
    if (rayCast(map, p.x, p.y, victim.x, victim.y, 'bullet', true).blocked) continue
    p.streak = Math.min(99, p.streak + 1)
    hurt(state, p, victim, Math.round(w.damage), PART_BODY, victim.x, victim.y)
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
  if (w.melee) {
    p.fireCooldown = w.fireInterval
    state.events.push({ type: 'fire', p: p.id, x: mx, y: my, aim: p.aim, weapon: p.weapon })
    meleeSwing(state, map, p)
    return
  }
  // 모래주머니에 붙어 쏘면(엄폐) 내 탄은 넘어간다
  const inCover = nearSandbag(map, p.x, p.y)
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
      hitSomeone: false,
      over: inCover || aimsAtHead(state, map, p, mx, my, a),
    }
    state.bullets.push(b)
  }
  if (w.magSize > 0) p.ammo--
  p.fireCooldown = w.fireInterval
  p.recoil = Math.min(w.recoil * MAX_RECOIL_MUL * 2, p.recoil + w.recoil)
  state.events.push({ type: 'fire', p: p.id, x: mx, y: my, aim: p.aim, weapon: p.weapon })
  if (w.magSize > 0 && p.ammo === 0) {
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

    const tileHit = rayCast(map, b.px, b.py, b.x, b.y, 'bullet', b.over)
    if (tileHit.blocked) {
      const aim = state.players[b.owner].aim
      if (tileHit.tile === TILE_SANDBAG) damageSandbag(state, map, tileHit.tx, tileHit.ty, b.damage)
      state.events.push({ type: 'wall', x: b.x, y: b.y, aim })
      dead = true
    }

    if (!dead) {
      const shooter = state.players[b.owner]
      // 적 중 이 선분에 처음(인덱스 순) 걸리는 사람. 탄 길이가 짧아 둘이 동시에 걸리는 일은 드물다.
      for (const victim of state.players) {
        if (!isEnemy(shooter, victim) || !victim.alive || victim.left || victim.invuln > 0 || victim.dashTimer > 0) continue // 대시(구르기) 중 무적
        if (segmentHitsCircle(b.px, b.py, b.x, b.y, victim.x, victim.y, PLAYER_RADIUS)) {
          applyHit(state, b, victim, pointLineDistance(victim.x, victim.y, b.px, b.py, b.vx, b.vy))
          dead = true
          break
        }
      }
    }

    if (!dead && b.life <= 0) dead = true
    // 맞히지 못하고 사라진 탄 → 기열덕 연속 명중 초기화
    if (dead && !b.hitSomeone) state.players[b.owner].streak = 0
    if (!dead) bullets[write++] = b
  }
  bullets.length = write
}

function damageSandbag(state: GameState, map: GameMap, tx: number, ty: number, dmg: number): void {
  const i = ty * map.w + tx
  const hp = state.sandbags[i]
  if (hp === undefined) return
  const left = hp - dmg
  if (left <= 0) {
    delete state.sandbags[i]
    map.tiles[i] = 0
    state.events.push({ type: 'break', tx, ty })
  } else {
    state.sandbags[i] = left
  }
}

/** 상태(정본)에 맞춰 맵의 모래주머니 타일을 되돌린다 (리싱크 후) */
export function syncSandbags(state: GameState, map: GameMap): void {
  for (const i of map.sandbagIdx) {
    map.tiles[i] = state.sandbags[i] === undefined ? 0 : TILE_SANDBAG
  }
}

/** 실제 피해 적용 (근접·투사체 공용) */
function hurt(state: GameState, shooter: PlayerState, victim: PlayerState, dmg: number, part: number, hx: number, hy: number): void {
  if (dmg <= 0) return
  victim.hp -= dmg
  victim.lastHitTick = state.tick
  if (part === PART_LEGS) victim.legInjury = 180
  state.events.push({ type: 'hit', p: victim.id, by: shooter.id, x: hx, y: hy, part, dmg })
  if (victim.hp <= 0) {
    victim.hp = 0
    victim.alive = false
    victim.respawnTimer = victim.char === 'seungwoo' ? 120 : RESPAWN_TICKS
    victim.deaths++
    shooter.kills++
    if (shooter.char === 'tongdak') shooter.hp = Math.min(CHARACTERS[shooter.char].maxHp, shooter.hp + 50)
    state.events.push({ type: 'death', p: victim.id, by: shooter.id, x: victim.x, y: victim.y })
    if (teamKills(state, shooter.team) >= state.targetKills && state.phase === 'playing') {
      state.phase = 'over'
      state.winner = shooter.team
      state.events.push({ type: 'over', winner: shooter.team })
    }
  }
}

/** dOff = 탄 궤적과 상대 중심 사이 최단 거리. 가운데를 정확히 맞히면 머리. */
function applyHit(state: GameState, b: Bullet, victim: PlayerState, dOff: number): void {
  const w = WEAPONS[b.weapon]
  const dist = len(victim.x - b.ox, victim.y - b.oy)
  const part = partForOffset(dOff, PLAYER_RADIUS)
  const mult = part === PART_HEAD ? headMult(w) : PART_MULT[part]
  let dmg = b.damage * mult * falloff(w, dist)
  const shooter = state.players[b.owner]
  if (shooter.char === 'jupeol' && dist < 150) dmg *= 1.2
  if (shooter.char === 'giyeol') dmg *= 1 + Math.min(5, shooter.streak) * 0.08
  dmg = Math.round(dmg)
  b.hitSomeone = true
  shooter.streak = Math.min(99, shooter.streak + 1)
  // 근접 무기(후라이팬)를 든 사람은 앞에서 오는 총알을 기력으로 막는다
  if (WEAPONS[victim.weapon].melee && victim.stamina > 0) {
    const from = atan2A(b.oy - victim.y, b.ox - victim.x)
    if (Math.abs(angleDiff(from, victim.aim)) < 213) {
      const absorbed = Math.min(dmg, Math.floor(victim.stamina))
      victim.stamina -= absorbed
      dmg -= absorbed
      state.events.push({ type: 'block', p: victim.id, x: b.x, y: b.y })
    }
  }
  hurt(state, shooter, victim, dmg, part, b.x, b.y)
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
  p.invuln = c.id === 'seungwoo' ? SPAWN_PROTECT_TICKS * 2 : SPAWN_PROTECT_TICKS // 승우덕: 스폰 보호 3초
  p.aliveTicks = 0
  p.lastHitTick = -10000
  p.streak = 0
  p.stamina = STAMINA_MAX
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
