import { GameMap, TILE, isWall } from './map'

/**
 * 원(반지름 r)을 (dx, dy) 만큼 옮기되 벽 타일에 걸리면 축별로 밀어낸다.
 * X 축 이동 → 충돌 해소 → Y 축 이동 → 충돌 해소. 결정론적.
 */
export function moveCircle(
  map: GameMap,
  x: number,
  y: number,
  r: number,
  dx: number,
  dy: number,
): { x: number; y: number } {
  x += dx
  x = resolveAxis(map, x, y, r, true)
  y += dy
  y = resolveAxis(map, x, y, r, false)
  return { x, y }
}

function resolveAxis(map: GameMap, x: number, y: number, r: number, horizontal: boolean): number {
  const minTx = Math.floor((x - r) / TILE)
  const maxTx = Math.floor((x + r) / TILE)
  const minTy = Math.floor((y - r) / TILE)
  const maxTy = Math.floor((y + r) / TILE)
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (!isWall(map, tx, ty)) continue
      const left = tx * TILE
      const right = left + TILE
      const top = ty * TILE
      const bottom = top + TILE
      // 원과 AABB 최근접점
      const cx = x < left ? left : x > right ? right : x
      const cy = y < top ? top : y > bottom ? bottom : y
      const ddx = x - cx
      const ddy = y - cy
      const d2 = ddx * ddx + ddy * ddy
      if (d2 >= r * r) continue
      if (horizontal) {
        // 좌우 중 가까운 쪽으로 밀어냄
        if (x < (left + right) / 2) x = left - r
        else x = right + r
      } else {
        if (y < (top + bottom) / 2) y = top - r
        else y = bottom + r
      }
    }
  }
  return horizontal ? x : y
}

/** 원-원 겹침 */
export function circlesOverlap(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number,
): boolean {
  const dx = ax - bx
  const dy = ay - by
  const r = ar + br
  return dx * dx + dy * dy < r * r
}

/**
 * 선분 (x0,y0)-(x1,y1) 이 원(cx,cy,r) 과 만나는가. 빠른 탄의 터널링 방지.
 */
export function segmentHitsCircle(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  r: number,
): boolean {
  const dx = x1 - x0
  const dy = y1 - y0
  const fx = x0 - cx
  const fy = y0 - cy
  const a = dx * dx + dy * dy
  if (a === 0) return fx * fx + fy * fy <= r * r
  let t = -(fx * dx + fy * dy) / a
  if (t < 0) t = 0
  else if (t > 1) t = 1
  const px = x0 + dx * t - cx
  const py = y0 + dy * t - cy
  return px * px + py * py <= r * r
}
