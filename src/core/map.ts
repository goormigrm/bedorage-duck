// 맵. 테두리와 크기는 maps.ts 의 문자 그리드에서 오고, **안쪽 구조물은 매 판 시드로 생성**한다.
// 같은 시드면 모든 브라우저가 똑같은 맵을 만든다(결정론). 맵은 GameState 밖의 정적 데이터지만,
// 모래주머니가 부서지면 sim 이 tiles 를 바꾼다 (내구도는 GameState.sandbags 가 정본).

import { DEFAULT_MAP, MAPS, MapDef, MapId, MapScale, MapTheme, expandRows } from './maps'
import { Rng, makeRng, randInt } from './rng'

export const TILE = 32

export const TILE_FLOOR = 0
export const TILE_WALL = 1
export const TILE_CRATE = 2
/** 모래주머니: 이동·탄을 막지만 시야는 넘어가고, 엄폐 중인 사람의 탄과 헤드샷 탄은 넘어간다 */
export const TILE_SANDBAG = 3

/** 모래주머니 내구도 */
export const SANDBAG_HP = 240
/** 이 거리 안에 모래주머니가 있으면 '엄폐 중'으로 보고 내 탄이 모래주머니를 넘어간다 */
export const COVER_DIST = 46

export interface GameMap {
  id: MapId
  name: string
  theme: MapTheme
  /** 인원별 확장 배율 (1, 2, 4) */
  scale: MapScale
  /** 생성 시드 */
  seed: number
  w: number
  h: number
  tiles: Uint8Array
  /** 처음 생성된 모래주머니 타일 인덱스 (부서져도 유지 — 리싱크 복원용) */
  sandbagIdx: number[]
  spawns: { x: number; y: number }[]
  /** 픽셀 단위 */
  pw: number
  ph: number
}

export function buildMap(idOrDef: MapId | MapDef = DEFAULT_MAP, scale: MapScale = 1, seed = 1): GameMap {
  const def = typeof idOrDef === 'string' ? MAPS[idOrDef] : idOrDef
  const rows = expandRows(def.rows, scale)
  const h = rows.length
  const w = rows[0].length
  const tiles = new Uint8Array(w * h)
  // 테두리만 문자 그리드에서 가져온다 (안쪽은 아래에서 생성)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1
      tiles[y * w + x] = edge ? TILE_WALL : TILE_FLOOR
    }
  }
  const map: GameMap = {
    id: def.id, name: def.name, theme: def.theme, scale, seed,
    w, h, tiles, sandbagIdx: [], spawns: [], pw: w * TILE, ph: h * TILE,
  }
  generate(map, def, seed)
  for (let i = 0; i < tiles.length; i++) if (tiles[i] === TILE_SANDBAG) map.sandbagIdx.push(i)
  map.spawns = pickSpawns(map)
  return map
}

// ---------- 생성 ----------

function idHash(s: string): number {
  let hv = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    hv ^= s.charCodeAt(i)
    hv = Math.imul(hv, 0x01000193)
  }
  return hv >>> 0
}

function generate(map: GameMap, def: MapDef, seed: number): void {
  const rng = makeRng((seed ^ idHash(def.id) ^ (map.scale * 0x9e3779b1)) >>> 0)
  const area = (map.w - 2) * (map.h - 2)
  const g = def.gen
  const k = area / 1064 // 40x30 기준 1
  // 1) 뼈대 — 맵 성격을 정하는 부분
  if (g.style === 'rooms') {
    // 넓을수록 더 잘게 나눈다
    carveRooms(map, rng, g.density + (map.scale === 4 ? 2 : map.scale === 2 ? 1 : 0))
  } else if (g.style === 'pillars') {
    placePillars(map, rng, g.density)
  } else {
    for (let i = 0; i < Math.round(g.density * k); i++) placeWallShape(map, rng, g.maxLen)
  }
  // 2) 상자 군집
  for (let i = 0; i < Math.round(g.crates * k); i++) placeCluster(map, rng, TILE_CRATE, randInt(rng, 1, 5))
  // 3) 모래주머니 진지: 중앙에 하나. 넓은 맵이면 하나 더 (많으면 지저분하고 엄폐가 흔해진다)
  const forts: [number, number][] = [[map.w / 2, map.h / 2]]
  if (map.scale === 4) forts.push([map.w * 0.25, map.h * 0.25])
  for (const [fx, fy] of forts) placeFort(map, Math.round(fx), Math.round(fy))
  // 4) 흩어진 모래주머니 줄 — 드물게, 짧게
  for (let i = 0; i < Math.round(g.sandbags * k); i++) placeLine(map, rng, TILE_SANDBAG, randInt(rng, 3, 6))
  // 5) 갇힌 곳이 생겼으면 뚫는다
  ensureConnected(map)
}

/** 영역을 재귀로 갈라 방과 문을 만든다 (실내 맵) */
function carveRooms(map: GameMap, rng: Rng, depth: number): void {
  const MIN = 6
  const put = (x: number, y: number, tile: number) => {
    if (x < 1 || y < 1 || x >= map.w - 1 || y >= map.h - 1) return
    map.tiles[y * map.w + x] = tile
  }
  const split = (x0: number, y0: number, x1: number, y1: number, d: number): void => {
    const w = x1 - x0 + 1
    const h = y1 - y0 + 1
    if (d <= 0) return
    const canH = h >= MIN * 2 + 1
    const canV = w >= MIN * 2 + 1
    if (!canH && !canV) return
    const horiz = canH && (!canV || (h > w || (h === w && randInt(rng, 0, 2) === 0)))
    if (horiz) {
      const y = y0 + MIN + randInt(rng, 0, h - MIN * 2)
      for (let x = x0; x <= x1; x++) put(x, y, TILE_WALL)
      // 문 1~2개 (3칸 폭)
      for (let i = 0, n = 1 + randInt(rng, 0, 2); i < n; i++) {
        const dx = x0 + 1 + randInt(rng, 0, Math.max(1, w - 4))
        for (let j = 0; j < 3; j++) put(dx + j, y, TILE_FLOOR)
      }
      split(x0, y0, x1, y - 1, d - 1)
      split(x0, y + 1, x1, y1, d - 1)
    } else {
      const x = x0 + MIN + randInt(rng, 0, w - MIN * 2)
      for (let y = y0; y <= y1; y++) put(x, y, TILE_WALL)
      for (let i = 0, n = 1 + randInt(rng, 0, 2); i < n; i++) {
        const dy = y0 + 1 + randInt(rng, 0, Math.max(1, h - 4))
        for (let j = 0; j < 3; j++) put(x, dy + j, TILE_FLOOR)
      }
      split(x0, y0, x - 1, y1, d - 1)
      split(x + 1, y0, x1, y1, d - 1)
    }
  }
  split(1, 1, map.w - 2, map.h - 2, depth)
}

/** 기둥을 격자로 세운다 (주차장) */
function placePillars(map: GameMap, rng: Rng, gap: number): void {
  for (let ty = 3; ty < map.h - 4; ty += gap) {
    for (let tx = 3; tx < map.w - 4; tx += gap) {
      if (randInt(rng, 0, 9) === 0) continue // 가끔 비운다
      const jx = tx + randInt(rng, 0, 2)
      const jy = ty + randInt(rng, 0, 2)
      if (free(map, jx, jy, 2, 2, 1)) fill(map, jx, jy, 2, 2, TILE_WALL)
    }
  }
}

/** 갇힌 바닥이 없도록 벽을 뚫어 잇는다 (생성 방식과 무관한 안전장치) */
function ensureConnected(map: GameMap): void {
  const total = map.w * map.h
  for (let pass = 0; pass < 12; pass++) {
    let start = -1
    for (let i = 0; i < total; i++) {
      if (map.tiles[i] === TILE_FLOOR) {
        start = i
        break
      }
    }
    if (start < 0) return
    const seen = new Uint8Array(total)
    const queue = [start]
    seen[start] = 1
    let head = 0
    while (head < queue.length) {
      const cur = queue[head++]
      const cx = cur % map.w
      const cy = (cur / map.w) | 0
      if (cx > 0 && !seen[cur - 1] && map.tiles[cur - 1] === TILE_FLOOR) { seen[cur - 1] = 1; queue.push(cur - 1) }
      if (cx < map.w - 1 && !seen[cur + 1] && map.tiles[cur + 1] === TILE_FLOOR) { seen[cur + 1] = 1; queue.push(cur + 1) }
      if (cy > 0 && !seen[cur - map.w] && map.tiles[cur - map.w] === TILE_FLOOR) { seen[cur - map.w] = 1; queue.push(cur - map.w) }
      if (cy < map.h - 1 && !seen[cur + map.w] && map.tiles[cur + map.w] === TILE_FLOOR) { seen[cur + map.w] = 1; queue.push(cur + map.w) }
    }
    // 닿지 않은 바닥 찾기
    let stray = -1
    for (let i = 0; i < total; i++) {
      if (map.tiles[i] === TILE_FLOOR && !seen[i]) {
        stray = i
        break
      }
    }
    if (stray < 0) return
    // 닿은 곳 중 가장 가까운 칸으로 직선을 뚫는다
    const sx = stray % map.w
    const sy = (stray / map.w) | 0
    let best = start
    let bestD = Infinity
    for (let i = 0; i < total; i++) {
      if (!seen[i]) continue
      const d = Math.abs((i % map.w) - sx) + Math.abs(((i / map.w) | 0) - sy)
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    let cx = sx
    let cy = sy
    const tx = best % map.w
    const ty = (best / map.w) | 0
    while (cx !== tx || cy !== ty) {
      if (cx !== tx) cx += cx < tx ? 1 : -1
      else cy += cy < ty ? 1 : -1
      if (cx > 0 && cy > 0 && cx < map.w - 1 && cy < map.h - 1) map.tiles[cy * map.w + cx] = TILE_FLOOR
    }
  }
}

function free(map: GameMap, x0: number, y0: number, w: number, h: number, clear: number): boolean {
  for (let y = y0 - clear; y < y0 + h + clear; y++) {
    for (let x = x0 - clear; x < x0 + w + clear; x++) {
      if (x < 1 || y < 1 || x >= map.w - 1 || y >= map.h - 1) return false
      if (map.tiles[y * map.w + x] !== TILE_FLOOR) return false
    }
  }
  return true
}

function fill(map: GameMap, x0: number, y0: number, w: number, h: number, tile: number): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) map.tiles[y * map.w + x] = tile
}

/** 막대·ㄱ자·덩어리 중 하나를 빈 곳에 놓는다 (통로가 남도록 여유 2칸) */
function placeWallShape(map: GameMap, rng: Rng, maxLen: number): void {
  for (let tries = 0; tries < 40; tries++) {
    const kind = randInt(rng, 0, 4)
    const len = randInt(rng, 3, maxLen + 1)
    const x = randInt(rng, 2, map.w - 3)
    const y = randInt(rng, 2, map.h - 3)
    if (kind === 0 && free(map, x, y, len, 1, 2)) {
      fill(map, x, y, len, 1, TILE_WALL)
      return
    }
    if (kind === 1 && free(map, x, y, 1, len, 2)) {
      fill(map, x, y, 1, len, TILE_WALL)
      return
    }
    if (kind === 2 && free(map, x, y, len, len, 2)) {
      // ㄱ자
      fill(map, x, y, len, 1, TILE_WALL)
      fill(map, x, y, 1, len, TILE_WALL)
      return
    }
    if (kind === 3 && free(map, x, y, 3, 2, 2)) {
      fill(map, x, y, 3, 2, TILE_WALL)
      return
    }
  }
}

function placeCluster(map: GameMap, rng: Rng, tile: number, n: number): void {
  for (let tries = 0; tries < 30; tries++) {
    const x = randInt(rng, 2, map.w - 3)
    const y = randInt(rng, 2, map.h - 3)
    const w = n > 2 ? 2 : n
    const h = Math.ceil(n / 2)
    if (!free(map, x, y, w, h, 1)) continue
    fill(map, x, y, w, h, tile)
    return
  }
}

function placeLine(map: GameMap, rng: Rng, tile: number, len: number): void {
  for (let tries = 0; tries < 30; tries++) {
    const horiz = randInt(rng, 0, 2) === 0
    const x = randInt(rng, 2, map.w - 3)
    const y = randInt(rng, 2, map.h - 3)
    const w = horiz ? len : 1
    const h = horiz ? 1 : len
    if (!free(map, x, y, w, h, 1)) continue
    fill(map, x, y, w, h, tile)
    return
  }
}

/** 사방에 입구가 있는 작은 모래주머니 진지 */
function placeFort(map: GameMap, cx: number, cy: number): void {
  const put = (x: number, y: number) => {
    if (x < 1 || y < 1 || x >= map.w - 1 || y >= map.h - 1) return
    if (map.tiles[y * map.w + x] === TILE_FLOOR) map.tiles[y * map.w + x] = TILE_SANDBAG
  }
  // 위·아래 세 칸씩, 좌·우 한 칸씩. 모서리는 비워 사방에서 드나들 수 있다 (8칸)
  for (const dx of [-1, 0, 1]) {
    put(cx + dx, cy - 2)
    put(cx + dx, cy + 2)
  }
  put(cx - 2, cy)
  put(cx + 2, cy)
}

/** 사방이 트인 칸 중 서로 멀리 떨어진 곳을 스폰으로 (결정론) */
function pickSpawns(map: GameMap): { x: number; y: number }[] {
  const cand: { x: number; y: number }[] = []
  for (let ty = 2; ty < map.h - 2; ty++) {
    for (let tx = 2; tx < map.w - 2; tx++) {
      let ok = true
      for (let dy = -1; dy <= 1 && ok; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (map.tiles[(ty + dy) * map.w + tx + dx] !== TILE_FLOOR) {
            ok = false
            break
          }
        }
      }
      if (ok) cand.push({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 })
    }
  }
  if (cand.length === 0) return [{ x: map.pw / 2, y: map.ph / 2 }]
  // 가장 왼쪽 위 후보에서 시작해, 이미 고른 곳들에서 가장 먼 후보를 차례로 고른다
  const out = [cand[0]]
  const want = Math.min(10, cand.length)
  while (out.length < want) {
    let best = -1
    let bestD = -1
    for (let i = 0; i < cand.length; i++) {
      let d = Infinity
      for (const o of out) d = Math.min(d, (cand[i].x - o.x) ** 2 + (cand[i].y - o.y) ** 2)
      if (d > bestD) {
        bestD = d
        best = i
      }
    }
    if (best < 0 || bestD < (TILE * 5) ** 2) break
    out.push(cand[best])
  }
  return out
}

// ---------- 조회 ----------

/** 이동 충돌: 벽·상자·모래주머니 모두 막힘 */
export function isWall(map: GameMap, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return true
  return map.tiles[ty * map.w + tx] !== TILE_FLOOR
}

/** 시야: 높은 벽만 막는다 (상자·모래주머니는 낮아서 넘어 본다) */
export function blocksSight(map: GameMap, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return true
  return map.tiles[ty * map.w + tx] === TILE_WALL
}

export function tileAt(map: GameMap, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return TILE_WALL
  return map.tiles[ty * map.w + tx]
}

export function isWallAt(map: GameMap, px: number, py: number): boolean {
  return isWall(map, Math.floor(px / TILE), Math.floor(py / TILE))
}

/** 이 지점이 모래주머니에 붙어 있는가 (엄폐 중) */
export function nearSandbag(map: GameMap, px: number, py: number, dist = COVER_DIST): boolean {
  const r = Math.ceil(dist / TILE)
  const ctx0 = Math.floor(px / TILE)
  const cty0 = Math.floor(py / TILE)
  for (let ty = cty0 - r; ty <= cty0 + r; ty++) {
    for (let tx = ctx0 - r; tx <= ctx0 + r; tx++) {
      if (tileAt(map, tx, ty) !== TILE_SANDBAG) continue
      const cx = Math.max(tx * TILE, Math.min((tx + 1) * TILE, px))
      const cy = Math.max(ty * TILE, Math.min((ty + 1) * TILE, py))
      if ((cx - px) ** 2 + (cy - py) ** 2 <= dist * dist) return true
    }
  }
  return false
}

export interface RayHit {
  blocked: boolean
  tx: number
  ty: number
  tile: number
}

/**
 * 격자 레이캐스트 (DDA). mode 'sight' 는 높은 벽만, 'bullet' 은 벽·상자와 (over 가 아니면) 모래주머니.
 * 막혔으면 막은 타일을 함께 돌려준다.
 */
export function rayCast(
  map: GameMap,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  mode: 'sight' | 'bullet',
  over = false,
): RayHit {
  let tx = Math.floor(x0 / TILE)
  let ty = Math.floor(y0 / TILE)
  const tx1 = Math.floor(x1 / TILE)
  const ty1 = Math.floor(y1 / TILE)
  const dx = x1 - x0
  const dy = y1 - y0
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0
  const tDeltaX = stepX !== 0 ? Math.abs(TILE / dx) : Infinity
  const tDeltaY = stepY !== 0 ? Math.abs(TILE / dy) : Infinity
  let tMaxX = stepX > 0 ? ((tx + 1) * TILE - x0) / dx : stepX < 0 ? (tx * TILE - x0) / dx : Infinity
  let tMaxY = stepY > 0 ? ((ty + 1) * TILE - y0) / dy : stepY < 0 ? (ty * TILE - y0) / dy : Infinity
  let guard = map.w + map.h + 2
  while (guard-- > 0) {
    const tile = tileAt(map, tx, ty)
    const blocks =
      mode === 'sight'
        ? tile === TILE_WALL || tx < 0 || ty < 0 || tx >= map.w || ty >= map.h
        : tile === TILE_WALL || tile === TILE_CRATE || (tile === TILE_SANDBAG && !over)
    if (blocks) return { blocked: true, tx, ty, tile }
    if (tx === tx1 && ty === ty1) return { blocked: false, tx, ty, tile }
    if (tMaxX < tMaxY) {
      tMaxX += tDeltaX
      tx += stepX
    } else {
      tMaxY += tDeltaY
      ty += stepY
    }
  }
  return { blocked: true, tx, ty, tile: TILE_WALL }
}

/** 시야 판정 (봇 LOS·전장의 안개) */
export function rayBlocked(map: GameMap, x0: number, y0: number, x1: number, y1: number): boolean {
  return rayCast(map, x0, y0, x1, y1, 'sight').blocked
}
