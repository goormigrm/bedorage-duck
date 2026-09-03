// 맵 데이터. 정적이므로 GameState 에 넣지 않는다.
// 문자 그리드로 정의: # 벽, . 바닥, S 스폰 후보(바닥), o 낮은 엄폐물(탄은 통과 안 함, 이동만 막음 → MVP 에서는 벽과 동일 취급)

export const TILE = 32

export const TILE_FLOOR = 0
export const TILE_WALL = 1

export interface GameMap {
  w: number
  h: number
  tiles: Uint8Array
  spawns: { x: number; y: number }[]
  /** 픽셀 단위 */
  pw: number
  ph: number
}

// 40 x 30. "스튜디오" — 가운데 오픈 공간, 네 귀퉁이 방, 사이사이 기둥/책상.
const STUDIO = [
  '########################################',
  '#S.....#..............#...........S....#',
  '#......#..............#................#',
  '#......#....##........#.....###........#',
  '#...........##..............#..........#',
  '#......#....................#....#.....#',
  '#......#.........S...............#.....#',
  '####.###..........................######',
  '#........###..........####.............#',
  '#........#...............#.............#',
  '#..S.....#...............#.......S.....#',
  '#........#......#####....#.............#',
  '#...........................##.........#',
  '#.....##....................##.....#...#',
  '#.....##.........S.................#...#',
  '#.................................##...#',
  '#...#..........#####...................#',
  '#...#.............#..........##........#',
  '#...#......S......#..........##..S.....#',
  '#..........#......#....................#',
  '#....###...#.............#.............#',
  '#........................#....####.....#',
  '#.......#........S.......#.............#',
  '######..#..............................#',
  '#.......#....##..........###....#......#',
  '#.......#....##............#....#......#',
  '#............................#..#......#',
  '#..S.....#.........#.........#.....S...#',
  '#........#.........#...................#',
  '########################################',
]

export function buildMap(rows: string[] = STUDIO): GameMap {
  const h = rows.length
  const w = rows[0].length
  const tiles = new Uint8Array(w * h)
  const spawns: { x: number; y: number }[] = []
  for (let y = 0; y < h; y++) {
    const row = rows[y]
    for (let x = 0; x < w; x++) {
      const c = row[x]
      if (c === '#' || c === 'o') tiles[y * w + x] = TILE_WALL
      else tiles[y * w + x] = TILE_FLOOR
      if (c === 'S') spawns.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 })
    }
  }
  return { w, h, tiles, spawns, pw: w * TILE, ph: h * TILE }
}

export function isWall(map: GameMap, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return true
  return map.tiles[ty * map.w + tx] === TILE_WALL
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
