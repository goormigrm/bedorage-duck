// 맵 데이터. 정적이므로 GameState 에 넣지 않는다.
// 문자 그리드는 maps.ts 의 레지스트리에서 온다: # 벽, . 바닥, S 스폰 후보, o 낮은 상자(충돌은 벽과 동일)

import { DEFAULT_MAP, MAPS, MapDef, MapId, MapScale, MapTheme, expandRows } from './maps'

export const TILE = 32

export const TILE_FLOOR = 0
export const TILE_WALL = 1
export const TILE_CRATE = 2

export interface GameMap {
  id: MapId
  name: string
  theme: MapTheme
  /** 인원별 확장 배율 (1, 2, 4) */
  scale: MapScale
  w: number
  h: number
  tiles: Uint8Array
  spawns: { x: number; y: number }[]
  /** 픽셀 단위 */
  pw: number
  ph: number
}

export function buildMap(idOrDef: MapId | MapDef = DEFAULT_MAP, scale: MapScale = 1): GameMap {
  const def = typeof idOrDef === 'string' ? MAPS[idOrDef] : idOrDef
  const rows = expandRows(def.rows, scale)
  const h = rows.length
  const w = rows[0].length
  const tiles = new Uint8Array(w * h)
  const spawns: { x: number; y: number }[] = []
  for (let y = 0; y < h; y++) {
    const row = rows[y]
    for (let x = 0; x < w; x++) {
      const c = row[x]
      if (c === '#') tiles[y * w + x] = TILE_WALL
      else if (c === 'o') tiles[y * w + x] = TILE_CRATE
      else tiles[y * w + x] = TILE_FLOOR
      if (c === 'S') spawns.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 })
    }
  }
  return { id: def.id, name: def.name, theme: def.theme, scale, w, h, tiles, spawns, pw: w * TILE, ph: h * TILE }
}

/** 이동·탄 충돌용: 벽과 상자 모두 막힘 */
export function isWall(map: GameMap, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return true
  return map.tiles[ty * map.w + tx] !== TILE_FLOOR
}

export function tileAt(map: GameMap, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return TILE_WALL
  return map.tiles[ty * map.w + tx]
}

export function isWallAt(map: GameMap, px: number, py: number): boolean {
  return isWall(map, Math.floor(px / TILE), Math.floor(py / TILE))
}

/**
 * 격자 레이캐스트 (DDA). (x0,y0)→(x1,y1) 사이에 벽이 있으면 true.
 * 봇의 시야 판정과 탄 충돌 보조에 사용.
 */
export function rayBlocked(map: GameMap, x0: number, y0: number, x1: number, y1: number): boolean {
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
  let tMaxX =
    stepX > 0 ? ((tx + 1) * TILE - x0) / dx : stepX < 0 ? (tx * TILE - x0) / dx : Infinity
  let tMaxY =
    stepY > 0 ? ((ty + 1) * TILE - y0) / dy : stepY < 0 ? (ty * TILE - y0) / dy : Infinity
  let guard = map.w + map.h + 2
  while (guard-- > 0) {
    if (isWall(map, tx, ty)) return true
    if (tx === tx1 && ty === ty1) return false
    if (tMaxX < tMaxY) {
      tMaxX += tDeltaX
      tx += stepX
    } else {
      tMaxY += tDeltaY
      ty += stepY
    }
  }
  return true
}
