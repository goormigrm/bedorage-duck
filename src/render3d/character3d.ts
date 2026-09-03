// 프리미티브 조립 치비 캐릭터. 얼굴은 2D 캐리커처 텍스처, 몸·팔·다리·총·머리카락은 박스/구/원뿔.
// 로컬 좌표: 발 아래 원점, +y 위, 정면 = +z. 단위 1 = 타일 한 칸(32px).

import * as THREE from 'three'
import { CharacterDef, Look } from '../core/characters'
import { WEAPONS, WeaponDef } from '../core/weapons'
import { FACE_SPAN_MUL, dotsTexture, faceTexture } from './faceTexture'

const OUTLINE = 0x2b2412

export const HEAD_R = 0.36 // 머리 반지름(headScale 1 기준), 세로 반지름은 조금 더
export const LEG_H = 0.32
export const TORSO_H = 0.5

function mat(color: number, opts: Partial<THREE.MeshLambertMaterialParameters> = {}): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, ...opts })
}

function box(w: number, h: number, d: number, m: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0): THREE.Mesh {
  const g = new THREE.BoxGeometry(w, h, d)
  const mesh = new THREE.Mesh(g, m)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.receiveShadow = false
  return mesh
}

export interface CharacterRig {
  root: THREE.Group
  body: THREE.Group
  head: THREE.Group
  arms: THREE.Group
  legL: THREE.Mesh
  legR: THREE.Mesh
  gunTip: THREE.Object3D
  def: CharacterDef
  weapon: WeaponDef
  /** 피격 플래시용 재질 목록 */
  flashMats: THREE.MeshLambertMaterial[]
  setFlash(k: number): void
}

export function buildCharacter(def: CharacterDef): CharacterRig {
  const L = def.look
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  const flashMats: THREE.MeshLambertMaterial[] = []
  const track = (m: THREE.MeshLambertMaterial) => {
    flashMats.push(m)
    return m
  }

  const bs = L.bodyScale
  const torsoW = 0.5 * bs
  const torsoD = 0.34 * bs

  // ---- 다리 ----
  const pantsM = track(mat(0x34405a))
  const legW = 0.15 * bs
  const legL = box(legW, LEG_H, legW, pantsM)
  const legR = box(legW, LEG_H, legW, pantsM)
  // 피벗을 엉덩이에 두기 위해 지오메트리를 아래로 내린다
  legL.geometry.translate(0, -LEG_H / 2, 0)
  legR.geometry.translate(0, -LEG_H / 2, 0)
  legL.position.set(-torsoW * 0.28, LEG_H, 0)
  legR.position.set(torsoW * 0.28, LEG_H, 0)
  body.add(legL, legR)
  // 신발
  const shoeM = track(mat(0x2a2622))
  const shoeL = box(legW * 1.2, 0.08, legW * 1.6, shoeM, 0, -LEG_H + 0.04, legW * 0.25)
  const shoeR = box(legW * 1.2, 0.08, legW * 1.6, shoeM, 0, -LEG_H + 0.04, legW * 0.25)
  legL.add(shoeL)
  legR.add(shoeR)

  // ---- 몸통 ----
  const torso = new THREE.Group()
  torso.position.y = LEG_H
  body.add(torso)
  const shirtM = track(mat(L.shirt))
  const coatM = L.coat !== undefined
    ? track(L.coatDots !== undefined ? new THREE.MeshLambertMaterial({ map: dotsTexture(L.coat, L.coatDots) }) : mat(L.coat))
    : null
  // 겉옷이 있으면 몸통은 겉옷 색, 앞 가운데 띠만 셔츠 색
  const torsoMesh = box(torsoW, TORSO_H, torsoD, coatM ?? shirtM, 0, TORSO_H / 2, 0)
  torso.add(torsoMesh)
  if (coatM) {
    const strip = box(torsoW * 0.36, TORSO_H * 0.98, 0.02, shirtM, 0, TORSO_H / 2, torsoD / 2 + 0.005)
    torso.add(strip)
  }
  if (L.tie !== undefined) {
    const tieM = track(mat(L.tie))
    torso.add(box(0.06, TORSO_H * 0.6, 0.02, tieM, 0, TORSO_H * 0.62, torsoD / 2 + 0.02))
  }
  if (L.bowTie !== undefined) {
    const bowM = track(mat(L.bowTie))
    torso.add(box(0.2, 0.07, 0.03, bowM, 0, TORSO_H * 0.9, torsoD / 2 + 0.02))
    torso.add(box(0.05, 0.05, 0.04, track(mat(0x333333)), 0, TORSO_H * 0.9, torsoD / 2 + 0.03))
  }

  // ---- 팔 + 총 (조준 자세, 하나의 그룹) ----
  const arms = new THREE.Group()
  arms.position.set(0, TORSO_H * 0.78, torsoD * 0.3)
  torso.add(arms)
  const skinM = track(mat(L.skin))
  const sleeveM = coatM ?? shirtM
  const armLen = 0.42
  const armT = 0.11 * bs
  // 왼팔: 어깨에서 앞쪽 가운데로
  const mkArm = (side: -1 | 1) => {
    const g = new THREE.Group()
    g.position.set(side * torsoW * 0.55, 0, 0)
    const sleeve = box(armT, armT, armLen * 0.55, sleeveM, 0, 0, armLen * 0.275)
    const fore = box(armT * 0.9, armT * 0.9, armLen * 0.5, skinM, 0, 0, armLen * 0.55 + armLen * 0.25)
    g.add(sleeve, fore)
    // 손이 총 쪽(가운데)으로 모이도록 살짝 안쪽으로 회전
    g.rotation.y = -side * 0.42
    return g
  }
  arms.add(mkArm(-1), mkArm(1))
  const weapon = WEAPONS[def.weapon]
  const gun = buildGun(weapon)
  gun.group.position.set(0.02, -0.02, armLen * 0.55)
  arms.add(gun.group)

  // ---- 머리 ----
  const head = new THREE.Group()
  const R = HEAD_R * L.headScale
  head.position.y = TORSO_H + R * 0.95
  torso.add(head)
  const hairM = track(mat(L.hairColor))
  const topM = L.hair === 'none' ? skinM : L.extra === 'cap' ? track(mat(def.accentColor)) : hairM
  // 머리 상자: 앞면은 피부색(얼굴 판이 덮음), 윗면/뒷면은 머리카락, 옆면 피부
  const headBox = new THREE.Mesh(new THREE.BoxGeometry(R * 1.9, R * 2.0, R * 1.7), [
    skinM, skinM, topM, skinM, skinM, L.hair === 'none' ? skinM : hairM,
  ])
  headBox.castShadow = true
  head.add(headBox)
  // 얼굴 판 (텍스처)
  const span = R * FACE_SPAN_MUL * 2
  const faceM = new THREE.MeshLambertMaterial({ map: faceTexture(def), transparent: true, alphaTest: 0.35, side: THREE.FrontSide })
  const face = new THREE.Mesh(new THREE.PlaneGeometry(span, span), faceM)
  face.position.set(0, 0, R * 0.85 + 0.01)
  face.renderOrder = 2
  head.add(face)
  // 귀
  const earS = (L.earScale ?? 1) * R * 0.22
  const earL = new THREE.Mesh(new THREE.SphereGeometry(earS, 10, 8), skinM)
  const earR = new THREE.Mesh(new THREE.SphereGeometry(earS, 10, 8), skinM)
  earL.position.set(-R * 0.95, 0, 0)
  earR.position.set(R * 0.95, 0, 0)
  earL.scale.set(0.55, 1, 0.8)
  earR.scale.set(0.55, 1, 0.8)
  head.add(earL, earR)
  // 머리카락/모자 입체
  buildHair(head, L, def, R, hairM, track)

  root.castShadow = true
  const rig: CharacterRig = {
    root, body, head, arms, legL, legR, gunTip: gun.tip, def, weapon, flashMats,
    setFlash(k: number) {
      const e = k > 0 ? new THREE.Color(k, k, k) : new THREE.Color(0, 0, 0)
      for (const m of flashMats) m.emissive.copy(e)
      faceM.emissive.copy(e)
    },
  }
  return rig
}

function buildGun(w: WeaponDef): { group: THREE.Group; tip: THREE.Object3D } {
  const g = new THREE.Group()
  const len = 0.28 + w.length / 100
  const bodyM = mat(w.color)
  const darkM = mat(0x2b2b2b)
  g.add(box(0.09, 0.1, len, bodyM, 0, 0, len / 2))
  g.add(box(0.05, 0.14, 0.08, darkM, 0, -0.1, 0.06)) // 손잡이
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len * 0.55, 8), darkM)
  barrel.rotation.x = Math.PI / 2
  barrel.position.set(0, 0.02, len * 0.7)
  barrel.castShadow = true
  g.add(barrel)
  if (w.pellets > 1) {
    const b2 = barrel.clone()
    b2.position.x = 0.045
    g.add(b2)
  }
  const tip = new THREE.Object3D()
  tip.position.set(0, 0.02, len + 0.02)
  g.add(tip)
  return { group: g, tip }
}

function buildHair(
  head: THREE.Group,
  L: Look,
  def: CharacterDef,
  R: number,
  hairM: THREE.MeshLambertMaterial,
  track: (m: THREE.MeshLambertMaterial) => THREE.MeshLambertMaterial,
): void {
  switch (L.hair) {
    case 'spiky': {
      // 회색 옆머리 띠
      if (L.sideColor !== undefined) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(R * 1.96, R * 0.55, R * 1.76), track(mat(L.sideColor)))
        band.position.y = R * 0.62
        band.castShadow = true
        head.add(band)
      }
      // 검은 윗머리 + 삐죽 원뿔들
      const cap = new THREE.Mesh(new THREE.BoxGeometry(R * 1.7, R * 0.4, R * 1.5), hairM)
      cap.position.y = R * 1.05
      cap.castShadow = true
      head.add(cap)
      const spikes = 11
      for (let i = 0; i < spikes; i++) {
        const a = (i / spikes) * Math.PI * 2
        const ring = i % 2 === 0 ? 0.62 : 0.34
        const cone = new THREE.Mesh(new THREE.ConeGeometry(R * 0.16, R * (0.8 + (i % 3) * 0.2), 5), hairM)
        cone.position.set(Math.cos(a) * R * ring, R * 1.25, Math.sin(a) * R * ring)
        cone.rotation.z = -Math.cos(a) * 0.55
        cone.rotation.x = Math.sin(a) * 0.55
        cone.castShadow = true
        head.add(cone)
      }
      if (L.crown === 'star') {
        const star = new THREE.Mesh(new THREE.OctahedronGeometry(R * 0.2), track(mat(0xffffff, { emissive: 0x444444 })))
        star.position.set(0, R * 1.3, R * 0.55)
        head.add(star)
      }
      break
    }
    case 'bowl': {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(R * 1.1, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM)
      dome.position.y = R * 0.1
      dome.scale.set(1, 0.95, 0.95)
      dome.castShadow = true
      head.add(dome)
      break
    }
    case 'short':
    case 'flat':
    case 'side': {
      const top = new THREE.Mesh(new THREE.BoxGeometry(R * 1.86, R * 0.36, R * 1.66), hairM)
      top.position.y = R * 0.9
      top.castShadow = true
      head.add(top)
      const back = new THREE.Mesh(new THREE.BoxGeometry(R * 1.84, R * 1.0, R * 0.3), hairM)
      back.position.set(0, R * 0.3, -R * 0.72)
      head.add(back)
      break
    }
    case 'buzz': {
      const top = new THREE.Mesh(new THREE.BoxGeometry(R * 1.92, R * 0.2, R * 1.72), hairM)
      top.position.y = R * 0.95
      head.add(top)
      break
    }
    case 'none':
    default:
      break
  }
  if (L.extra === 'cap') {
    const capM = track(mat(def.accentColor))
    const bandM = track(mat(L.capBand ?? 0xf4f4f0))
    const dome = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.98, R * 1.02, R * 0.5, 18), capM)
    dome.position.y = R * 1.0
    dome.castShadow = true
    head.add(dome)
    const brim = new THREE.Mesh(new THREE.BoxGeometry(R * 1.3, R * 0.08, R * 0.9), bandM)
    brim.position.set(0, R * 0.78, R * 1.05)
    brim.castShadow = true
    head.add(brim)
  }
  if (L.extra === 'mic') {
    const micM = track(mat(0x8f8f8f))
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, R * 0.9, 6), track(mat(0x2b2b2b)))
    stick.position.set(R * 0.55, -R * 0.55, R * 1.0)
    stick.rotation.z = -0.5
    head.add(stick)
    const ball = new THREE.Mesh(new THREE.SphereGeometry(R * 0.16, 10, 8), micM)
    ball.position.set(R * 0.35, -R * 0.2, R * 1.0)
    head.add(ball)
  }
}

/** 죽었을 때 재질을 반투명으로 (페이드) */
export function setRigOpacity(rig: CharacterRig, opacity: number): void {
  rig.root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
    if (!m) return
    const list = Array.isArray(m) ? m : [m]
    for (const mm of list) {
      mm.transparent = opacity < 1 || (mm as THREE.MeshLambertMaterial).map !== undefined
      mm.opacity = opacity
    }
  })
}

export { OUTLINE }
