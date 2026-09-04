// 2D 캐리커처(render/character.ts)의 이목구비만 정면으로 그려 둥근 3D 머리(구)에 감을 텍스처를 만든다.
// 피부·귀·머리카락·모자는 3D 메쉬가 맡는다.

import * as THREE from 'three'
import { CharacterDef } from '../core/characters'
import { drawHead } from '../render/character'

const cache = new Map<string, THREE.CanvasTexture>()

/** 텍스처가 덮는 범위: 머리 반지름 R 의 ±FACE_SPAN 배 (턱살·수염까지 들어간다) */
export const FACE_SPAN = 1.35
/** 구 표면에서 텍스처가 감기는 각도 (가로·세로 모두). 텍스처 가장자리 = 중심에서 ±FACE_ARC/2 */
export const FACE_ARC = (150 / 180) * Math.PI

/** 이목구비 텍스처 (투명 배경). */
export function faceTexture(def: CharacterDef, size = 512): THREE.CanvasTexture {
  const key = `${def.id}:${size}`
  const hit = cache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, size, size)
  const R = 12.5 * def.look.headScale
  const span = R * FACE_SPAN
  const scale = size / (span * 2)
  const hy = -8 - R // drawHead 의 머리 중심 y (원점은 발 아래)
  ctx.save()
  ctx.translate(size / 2, size / 2 - hy * scale)
  ctx.scale(scale, scale)
  drawHead(ctx, def, { facing: 0, frontal: true, featuresOnly: true, sx: 1, sy: 1, walk: 0, moving: false, flash: 0, t: 0 })
  ctx.restore()
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = true
  cache.set(key, tex)
  return tex
}

/** 물방울 무늬 등 옷 텍스처 */
export function dotsTexture(base: number, dot: number, size = 128): THREE.CanvasTexture {
  const key = `dots:${base}:${dot}`
  const hit = cache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#' + base.toString(16).padStart(6, '0')
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = '#' + dot.toString(16).padStart(6, '0')
  const step = size / 6
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 6; x++) {
      const off = y % 2 === 1 ? step / 2 : 0
      ctx.beginPath()
      ctx.arc(x * step + off + step / 2, y * step + step / 2, size * 0.035, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(3, 2)
  cache.set(key, tex)
  return tex
}
