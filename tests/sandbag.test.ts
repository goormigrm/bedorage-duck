// 모래주머니 엄폐 규칙 검증.
//
// 규칙(DESIGN 3.5): 탄은 모래주머니에 막힌다. 단 두 경우에만 넘어간다.
//   1) 쏘는 사람이 모래주머니에 붙어 있을 때(COVER_DIST 이내) — 그 사람의 **모든** 탄이 넘어간다
//   2) 그 탄이 상대의 머리를 정확히 겨눈 탄일 때 — 붙어 있지 않아도 넘어간다
// 그래서 "붙어 있는 쪽은 마음대로 때리고, 밖에 있는 쪽은 정확한 헤드샷으로만 반격할 수 있다".

import { describe, expect, it } from 'vitest'
import { ANGLE_STEPS, radToAngle } from '../src/core/fixedmath'
import { BTN_ADS, BTN_FIRE, Input } from '../src/core/input'
import { COVER_DIST, TILE, TILE_FLOOR, TILE_SANDBAG, buildMap, nearSandbag } from '../src/core/map'
import { createState, step } from '../src/core/sim'
import { GameState, PLAYER_RADIUS } from '../src/core/state'
import { HEAD_FRAC } from '../src/core/weapons'

const IDLE: Input = { mx: 0, my: 0, aim: 0, buttons: 0, char: 0 }

/**
 * 가로로 뚫린 복도 한가운데에 모래주머니 한 줄을 세우고 양쪽에 한 명씩 세운다.
 * A(0)는 모래주머니 **바로 뒤**, B(1)는 멀리.
 */
function scene(gapA: number, gapB: number) {
  const map = buildMap('yard', 1, 7)
  const ty = 12
  // 복도를 깨끗이 비운다
  for (let tx = 1; tx < map.w - 1; tx++) {
    for (let dy = -2; dy <= 2; dy++) map.tiles[(ty + dy) * map.w + tx] = TILE_FLOOR
  }
  const wallTx = 20
  for (let dy = -2; dy <= 2; dy++) map.tiles[(ty + dy) * map.w + wallTx] = TILE_SANDBAG
  // createState 가 map.sandbagIdx 로 모래주머니를 되살리므로 손댄 뒤에는 색인도 다시 만든다
  map.sandbagIdx.length = 0
  for (let i = 0; i < map.tiles.length; i++) if (map.tiles[i] === TILE_SANDBAG) map.sandbagIdx.push(i)
  const state = createState({ seed: 3, targetKills: 5, chars: ['chim', 'uwon'] }, map)
  const y = ty * TILE + TILE / 2
  const wallX = wallTx * TILE + TILE / 2
  const [a, b] = state.players
  a.x = wallX - gapA
  a.y = y
  b.x = wallX + gapB
  b.y = y
  a.alive = true
  b.alive = true
  a.invuln = 0
  b.invuln = 0
  a.aliveTicks = 999
  b.aliveTicks = 999
  return { map, state, a, b, wallX, y }
}

/** n 틱 동안 shooter 만 주어진 각도로 쏜다. 상대가 잃은 체력을 돌려준다 */
function shoot(state: GameState, map: ReturnType<typeof buildMap>, shooter: number, aim: number, ticks: number, ads = true): number {
  const victim = state.players[1 - shooter]
  const before = victim.hp
  for (let i = 0; i < ticks; i++) {
    const inputs: Input[] = [IDLE, IDLE]
    inputs[shooter] = { mx: 0, my: 0, aim, buttons: BTN_FIRE | (ads ? BTN_ADS : 0), char: 0 }
    // 맞는 쪽은 가만히 있는다
    step(state, map, inputs)
    if (!victim.alive) break
  }
  return before - victim.hp
}

describe('모래주머니 엄폐', () => {
  it('붙어 있는 사람의 탄은 (헤드샷이 아니어도) 넘어간다', () => {
    const { map, state, a, b, wallX } = scene(20, 260)
    expect(nearSandbag(map, a.x, a.y)).toBe(true)
    expect(a.x).toBeLessThan(wallX)
    // 몸통을 겨눈다 — 조준선이 상대 중심에서 벗어나게 살짝 틀어서
    const aim = bodyAim(a.x, a.y, b.x, b.y)
    expect(shoot(state, map, 0, aim, 200)).toBeGreaterThan(0)
  })

  it('붙어 있지 않은 사람의 몸통 사격은 모래주머니에 막힌다', () => {
    const { map, state, a, b } = scene(20, 260)
    expect(nearSandbag(map, b.x, b.y)).toBe(false)
    const aim = bodyAim(b.x, b.y, a.x, a.y)
    expect(shoot(state, map, 1, aim, 200)).toBe(0)
  })

  it('붙어 있지 않아도 머리를 정확히 겨눈 탄은 넘어간다', () => {
    const { map, state, a, b } = scene(20, 260)
    expect(nearSandbag(map, b.x, b.y)).toBe(false)
    // 상대 중심을 정확히 겨눈다
    const aim = radToAngle(Math.atan2(a.y - b.y, a.x - b.x))
    expect(shoot(state, map, 1, aim, 200)).toBeGreaterThan(0)
  })

  it('그래서 붙은 쪽이 유리하다 — 같은 상황에서 몸통 사격의 결과가 반대다', () => {
    const inCover = scene(20, 260)
    const outside = scene(20, 260)
    const hit = shoot(inCover.state, inCover.map, 0, bodyAim(inCover.a.x, inCover.a.y, inCover.b.x, inCover.b.y), 200)
    const blocked = shoot(outside.state, outside.map, 1, bodyAim(outside.b.x, outside.b.y, outside.a.x, outside.a.y), 200)
    expect(hit).toBeGreaterThan(0)
    expect(blocked).toBe(0)
  })

  it('붙는 기준은 COVER_DIST 다 — 조금만 떨어져도 막힌다', () => {
    const near = scene(COVER_DIST - 10, 260)
    const far = scene(COVER_DIST + 30, 260)
    expect(nearSandbag(near.map, near.a.x, near.a.y)).toBe(true)
    expect(nearSandbag(far.map, far.a.x, far.a.y)).toBe(false)
    expect(shoot(near.state, near.map, 0, bodyAim(near.a.x, near.a.y, near.b.x, near.b.y), 200)).toBeGreaterThan(0)
    expect(shoot(far.state, far.map, 0, bodyAim(far.a.x, far.a.y, far.b.x, far.b.y), 200)).toBe(0)
  })
})

/**
 * 상대 몸통을 겨누는 각도. 조준선이 중심에서 머리 판정 범위(0.28r)보다는 멀고
 * 몸 반지름보다는 가깝게 지나가도록 살짝 튼다.
 */
function bodyAim(sx: number, sy: number, tx: number, ty: number): number {
  const d = Math.hypot(tx - sx, ty - sy)
  const offset = PLAYER_RADIUS * (HEAD_FRAC + 1) * 0.5 // 머리 범위 밖, 몸 안
  const base = Math.atan2(ty - sy, tx - sx)
  const a = radToAngle(base + Math.asin(Math.min(0.9, offset / d)))
  return a & (ANGLE_STEPS - 1)
}
