// 맵 → 3D 월드 (바닥, 벽, 상자, 조명). 단위 1 = 타일 한 칸. sim 좌표 (px) → 월드: x/32, y/32 → (x, 0, z)

import * as THREE from 'three'
import { GameMap, TILE, TILE_CRATE, TILE_WALL } from '../core/map'

export const WALL_H = 1.8
export const CRATE_H = 0.75
export const U = 1 / TILE

export interface World3D {
  group: THREE.Group
  sun: THREE.DirectionalLight
  dispose(): void
}

export function buildWorld(map: GameMap): World3D {
  const t = map.theme
  const group = new THREE.Group()

  // ---- 바닥 (캔버스 텍스처: 타일 색 변화 + 격자) ----
  const fc = document.createElement('canvas')
  const px = 16
  fc.width = map.w * px
  fc.height = map.h * px
  const g = fc.getContext('2d')!
  g.fillStyle = hex(t.floor)
  g.fillRect(0, 0, fc.width, fc.height)
  for (let ty = 0; ty < map.h; ty++) {
    for (let tx = 0; tx < map.w; tx++) {
      const h = ((tx * 73856093) ^ (ty * 19349663)) >>> 0
      if (h % 7 === 0) {
        g.fillStyle = hex(t.floorAlt)
        g.fillRect(tx * px, ty * px, px, px)
      }
    }
  }
  g.strokeStyle = hex(t.floorLine)
  g.lineWidth = 1
  g.beginPath()
  for (let x = 0; x <= map.w; x++) {
    g.moveTo(x * px + 0.5, 0)
    g.lineTo(x * px + 0.5, fc.height)
  }
  for (let y = 0; y <= map.h; y++) {
    g.moveTo(0, y * px + 0.5)
    g.lineTo(fc.width, y * px + 0.5)
  }
  g.stroke()
  const floorTex = new THREE.CanvasTexture(fc)
  floorTex.colorSpace = THREE.SRGBColorSpace
  floorTex.anisotropy = 8
  floorTex.magFilter = THREE.LinearFilter
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(map.w, map.h),
    new THREE.MeshLambertMaterial({ map: floorTex }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.set(map.w / 2, 0, map.h / 2)
  floor.receiveShadow = true
  group.add(floor)

  // 맵 밖 바닥 (넓게, 어둡게)
  const outside = new THREE.Mesh(
    new THREE.PlaneGeometry(map.w * 4, map.h * 4),
    new THREE.MeshLambertMaterial({ color: t.outside }),
  )
  outside.rotation.x = -Math.PI / 2
  outside.position.set(map.w / 2, -0.02, map.h / 2)
  outside.receiveShadow = true
  group.add(outside)

  // ---- 벽 / 상자 (인스턴스) ----
  let wallCount = 0
  let crateCount = 0
  for (let i = 0; i < map.tiles.length; i++) {
    if (map.tiles[i] === TILE_WALL) wallCount++
    else if (map.tiles[i] === TILE_CRATE) crateCount++
  }
  const wallSide = new THREE.MeshLambertMaterial({ color: t.wall })
  const wallTop = new THREE.MeshLambertMaterial({ color: t.wallTop })
  const wallGeo = new THREE.BoxGeometry(1, WALL_H, 1)
  const walls = new THREE.InstancedMesh(wallGeo, [wallSide, wallSide, wallTop, wallSide, wallSide, wallSide], Math.max(1, wallCount))
  walls.castShadow = true
  walls.receiveShadow = true
  const crateM = new THREE.MeshLambertMaterial({ color: t.crate })
  const crateTopM = new THREE.MeshLambertMaterial({ color: lighten(t.crate, 1.18) })
  const crateGeo = new THREE.BoxGeometry(0.92, CRATE_H, 0.92)
  const crates = new THREE.InstancedMesh(crateGeo, [crateM, crateM, crateTopM, crateM, crateM, crateM], Math.max(1, crateCount))
  crates.castShadow = true
  crates.receiveShadow = true
  const m4 = new THREE.Matrix4()
  let wi = 0
  let ci = 0
  for (let ty = 0; ty < map.h; ty++) {
    for (let tx = 0; tx < map.w; tx++) {
      const tile = map.tiles[ty * map.w + tx]
      if (tile === TILE_WALL) {
        m4.makeTranslation(tx + 0.5, WALL_H / 2, ty + 0.5)
        walls.setMatrixAt(wi++, m4)
      } else if (tile === TILE_CRATE) {
        m4.makeTranslation(tx + 0.5, CRATE_H / 2, ty + 0.5)
        crates.setMatrixAt(ci++, m4)
      }
    }
  }
  walls.count = wallCount
  crates.count = crateCount
  walls.instanceMatrix.needsUpdate = true
  crates.instanceMatrix.needsUpdate = true
  group.add(walls, crates)

  // 벽 윗면 테두리 느낌: 벽보다 살짝 큰 어두운 밑단 (바닥 그림자 대용)
  const skirtGeo = new THREE.BoxGeometry(1.06, 0.06, 1.06)
  const skirt = new THREE.InstancedMesh(skirtGeo, new THREE.MeshLambertMaterial({ color: darken(t.wall, 0.6) }), Math.max(1, wallCount))
  wi = 0
  for (let ty = 0; ty < map.h; ty++) {
    for (let tx = 0; tx < map.w; tx++) {
      if (map.tiles[ty * map.w + tx] === TILE_WALL) {
        m4.makeTranslation(tx + 0.5, 0.03, ty + 0.5)
        skirt.setMatrixAt(wi++, m4)
      }
    }
  }
  skirt.count = wallCount
  skirt.instanceMatrix.needsUpdate = true
  group.add(skirt)

  // ---- 조명 ----
  const hemi = new THREE.HemisphereLight(t.ambientColor, darken(t.floor, 0.5), 0.9)
  group.add(hemi)
  const sun = new THREE.DirectionalLight(t.sunColor, 2.2)
  sun.position.set(8, 18, 10)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 60
  sun.shadow.camera.left = -18
  sun.shadow.camera.right = 18
  sun.shadow.camera.top = 18
  sun.shadow.camera.bottom = -18
  sun.shadow.bias = -0.0008
  sun.shadow.normalBias = 0.02
  group.add(sun)
  group.add(sun.target)

  return {
    group,
    sun,
    dispose() {
      floorTex.dispose()
      wallGeo.dispose()
      crateGeo.dispose()
      skirtGeo.dispose()
    },
  }
}

function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0')
}
function darken(c: number, k: number): number {
  const r = Math.round(((c >> 16) & 255) * k)
  const g = Math.round(((c >> 8) & 255) * k)
  const b = Math.round((c & 255) * k)
  return (r << 16) | (g << 8) | b
}
function lighten(c: number, k: number): number {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k))
  const g = Math.min(255, Math.round(((c >> 8) & 255) * k))
  const b = Math.min(255, Math.round((c & 255) * k))
  return (r << 16) | (g << 8) | b
}
