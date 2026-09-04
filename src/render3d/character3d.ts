// 둥글둥글한 치비 캐릭터. 머리 = 구(얼굴 이목구비 텍스처가 표면에 감김), 몸 = 콩 모양, 팔다리 = 캡슐.
// 머리카락·모자·귀·마이크는 작은 메쉬. 로컬 좌표: 발 아래 원점, +y 위, 정면 = +z. 단위 1 = 타일 한 칸(32px).

import * as THREE from 'three'
import { CharacterDef, Look } from '../core/characters'
import { WEAPONS, WeaponDef } from '../core/weapons'
import { FACE_ARC, dotsTexture, faceTexture } from './faceTexture'

const OUTLINE = 0x2b2412

export const HEAD_R = 0.4 // 머리 반지름(headScale 1 기준)
export const LEG_H = 0.26
export const TORSO_H = 0.46

function mat(color: number, opts: Partial<THREE.MeshLambertMaterialParameters> = {}): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, ...opts })
}

function sphere(r: number, m: THREE.Material, x = 0, y = 0, z = 0, ws = 20, hs = 14): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), m)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  return mesh
}

/** 구의 윗부분만 (머리카락·모자용). thetaLength 는 위에서부터의 각도 */
function cap(r: number, thetaLength: number, m: THREE.Material, y = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, thetaLength), m)
  mesh.position.y = y
  mesh.castShadow = true
  return mesh
}

/** 축이 +z 를 향하는 캡슐 (팔·총열용). 원점은 뒤쪽 끝 */
function capsuleZ(r: number, len: number, m: THREE.Material): THREE.Mesh {
  const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len - r * 2), 3, 10)
  g.rotateX(Math.PI / 2)
  g.translate(0, 0, len / 2)
  const mesh = new THREE.Mesh(g, m)
  mesh.castShadow = true
  return mesh
}

/** 축이 -y 를 향하는 캡슐 (다리용). 원점은 위쪽 끝(엉덩이) */
function capsuleDown(r: number, len: number, m: THREE.Material): THREE.Mesh {
  const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len - r * 2), 3, 10)
  g.translate(0, -len / 2, 0)
  const mesh = new THREE.Mesh(g, m)
  mesh.castShadow = true
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
  const torsoW = 0.56 * bs
  const torsoD = 0.42 * bs
  const skinM = track(mat(L.skin))

  // ---- 다리 (짧은 캡슐, 엉덩이 피벗) + 둥근 신발 ----
  const pantsM = track(mat(0x34405a))
  const legR0 = 0.085 * bs
  const legL = capsuleDown(legR0, LEG_H, pantsM)
  const legR = capsuleDown(legR0, LEG_H, pantsM)
  legL.position.set(-torsoW * 0.24, LEG_H, 0)
  legR.position.set(torsoW * 0.24, LEG_H, 0)
  body.add(legL, legR)
  const shoeM = track(mat(0x2a2622))
  for (const leg of [legL, legR]) {
    const shoe = sphere(legR0 * 1.35, shoeM, 0, -LEG_H + legR0 * 0.6, legR0 * 0.6, 14, 10)
    shoe.scale.set(1, 0.6, 1.35)
    leg.add(shoe)
  }

  // ---- 몸통 (콩 모양 타원체) ----
  const torso = new THREE.Group()
  torso.position.y = LEG_H - 0.04
  body.add(torso)
  const shirtM = track(mat(L.shirt))
  const coatM = L.coat !== undefined
    ? track(L.coatDots !== undefined ? new THREE.MeshLambertMaterial({ map: dotsTexture(L.coat, L.coatDots) }) : mat(L.coat))
    : null
  const torsoMesh = sphere(1, coatM ?? shirtM, 0, TORSO_H * 0.55, 0, 22, 16)
  torsoMesh.scale.set(torsoW / 2, TORSO_H * 0.62, torsoD / 2)
  torso.add(torsoMesh)
  if (coatM) {
    // 겉옷 앞섶: 셔츠 색 띠 (살짝 앞으로)
    const strip = sphere(1, shirtM, 0, TORSO_H * 0.55, torsoD * 0.06, 16, 12)
    strip.scale.set(torsoW * 0.18, TORSO_H * 0.58, torsoD / 2)
    torso.add(strip)
  }
  if (L.tie !== undefined) {
    const tie = sphere(1, track(mat(L.tie)), 0, TORSO_H * 0.62, torsoD / 2 + 0.01, 10, 8)
    tie.scale.set(0.035, TORSO_H * 0.3, 0.02)
    torso.add(tie)
  }
  if (L.bowTie !== undefined) {
    const bowM = track(mat(L.bowTie))
    const l = sphere(0.055, bowM, -0.06, TORSO_H * 0.98, torsoD / 2, 10, 8)
    const r = sphere(0.055, bowM, 0.06, TORSO_H * 0.98, torsoD / 2, 10, 8)
    l.scale.set(1.2, 0.8, 0.6)
    r.scale.set(1.2, 0.8, 0.6)
    torso.add(l, r, sphere(0.03, track(mat(0x333333)), 0, TORSO_H * 0.98, torsoD / 2 + 0.02, 8, 6))
  }

  // ---- 팔 + 총 (조준 자세, 하나의 그룹) ----
  const arms = new THREE.Group()
  arms.position.set(0, TORSO_H * 0.8, torsoD * 0.32)
  torso.add(arms)
  const sleeveM = coatM ?? shirtM
  const armLen = 0.4
  const armR = 0.06 * bs
  const mkArm = (side: -1 | 1) => {
    const g = new THREE.Group()
    g.position.set(side * torsoW * 0.5, 0, 0)
    const sleeve = capsuleZ(armR, armLen * 0.55, sleeveM)
    const fore = capsuleZ(armR * 0.9, armLen * 0.5, skinM)
    fore.position.z = armLen * 0.5
    const hand = sphere(armR * 1.25, skinM, 0, 0, armLen * 1.0, 10, 8)
    g.add(sleeve, fore, hand)
    // 손이 총 쪽(가운데)으로 모이도록 살짝 안쪽으로 회전
    g.rotation.y = -side * 0.45
    return g
  }
  arms.add(mkArm(-1), mkArm(1))
  const weapon = WEAPONS[def.weapon]
  const gun = buildGun(weapon)
  gun.group.position.set(0.02, -0.02, armLen * 0.5)
  arms.add(gun.group)

  // ---- 머리 (구) + 얼굴 (구 표면 이목구비) ----
  const head = new THREE.Group()
  const R = HEAD_R * L.headScale
  head.position.y = TORSO_H + R * 0.92
  torso.add(head)
  const skull = sphere(R, skinM, 0, 0, 0, 28, 20)
  skull.scale.set(1, 1.04, 0.97)
  head.add(skull)
  const faceM = new THREE.MeshLambertMaterial({ map: faceTexture(def), transparent: true, alphaTest: 0.2, depthWrite: false })
  const face = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.012, 28, 20, Math.PI / 2 - FACE_ARC / 2, FACE_ARC, Math.PI / 2 - FACE_ARC / 2, FACE_ARC),
    faceM,
  )
  face.scale.copy(skull.scale)
  face.renderOrder = 2
  head.add(face)
  // 귀 (둥근 반구)
  const earS = (L.earScale ?? 1) * R * 0.24
  for (const side of [-1, 1]) {
    const ear = sphere(earS, skinM, side * R * 0.96, R * 0.02, 0, 12, 10)
    ear.scale.set(0.5, 1, 0.8)
    head.add(ear)
  }
  const hairM = track(mat(L.hairColor))
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
  const len = 0.26 + w.length / 110
  const bodyM = mat(w.color)
  const darkM = mat(0x2b2b2b)
  // 몸체: 둥근 캡슐, 손잡이: 작은 캡슐
  const bodyMesh = capsuleZ(0.05, len, bodyM)
  g.add(bodyMesh)
  const grip = capsuleDown(0.028, 0.14, darkM)
  grip.position.set(0, 0.02, 0.07)
  grip.rotation.x = -0.25
  g.add(grip)
  const barrel = capsuleZ(0.022, len * 0.6, darkM)
  barrel.position.set(0, 0.025, len * 0.45)
  g.add(barrel)
  if (w.pellets > 1) {
    const b2 = capsuleZ(0.022, len * 0.6, darkM)
    b2.position.set(0.045, 0.025, len * 0.45)
    g.add(b2)
  }
  const tip = new THREE.Object3D()
  tip.position.set(0, 0.025, len + 0.03)
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
      // 회색 옆머리 띠 (구 표면 띠). 앞쪽(얼굴)은 비우고 옆·뒤로만 감는다
      if (L.sideColor !== undefined) {
        const band = new THREE.Mesh(
          new THREE.SphereGeometry(R * 1.03, 28, 12, Math.PI * 0.9, Math.PI * 1.2, Math.PI * 0.34, Math.PI * 0.22),
          track(mat(L.sideColor)),
        )
        band.castShadow = true
        head.add(band)
      }
      // 검은 윗머리(둥근 캡) + 삐죽 원뿔
      head.add(cap(R * 1.05, Math.PI * 0.34, hairM))
      const spikes = 11
      for (let i = 0; i < spikes; i++) {
        const a = (i / spikes) * Math.PI * 2
        const ring = i % 2 === 0 ? 0.6 : 0.32
        const cone = new THREE.Mesh(new THREE.ConeGeometry(R * 0.15, R * (0.75 + (i % 3) * 0.2), 6), hairM)
        cone.position.set(Math.cos(a) * R * ring, R * 0.95, Math.sin(a) * R * ring)
        cone.rotation.z = -Math.cos(a) * 0.6
        cone.rotation.x = Math.sin(a) * 0.6
        cone.castShadow = true
        head.add(cone)
      }
      if (L.crown === 'star') {
        const star = new THREE.Mesh(new THREE.OctahedronGeometry(R * 0.2), track(mat(0xffffff, { emissive: 0x444444 })))
        star.position.set(0, R * 1.3, R * 0.5)
        head.add(star)
      }
      break
    }
    case 'bowl': {
      const dome = cap(R * 1.09, Math.PI * 0.55, hairM)
      dome.position.y = R * 0.06
      dome.scale.set(1, 0.98, 0.98)
      head.add(dome)
      break
    }
    case 'short':
    case 'flat':
    case 'side': {
      // 윗머리는 얕게(이마가 보이게), 뒷머리 조각이 뒤를 덮는다
      head.add(cap(R * 1.06, Math.PI * 0.33, hairM))
      // 뒷머리: 뒤쪽만 덮는 구 조각
      const back = new THREE.Mesh(new THREE.SphereGeometry(R * 1.05, 20, 12, Math.PI * 1.15, Math.PI * 0.7, Math.PI * 0.3, Math.PI * 0.4), hairM)
      back.castShadow = true
      head.add(back)
      break
    }
    case 'buzz': {
      head.add(cap(R * 1.03, Math.PI * 0.4, hairM))
      break
    }
    case 'none':
    default:
      break
  }
  if (L.extra === 'cap') {
    const capM = track(mat(def.accentColor))
    const bandM = track(mat(L.capBand ?? 0xf4f4f0))
    const dome = cap(R * 1.1, Math.PI * 0.46, capM)
    dome.position.y = R * 0.04
    head.add(dome)
    // 챙: 납작한 타원 (앞쪽)
    const brim = sphere(R * 0.62, bandM, 0, R * 0.32, R * 0.86, 16, 10)
    brim.scale.set(1.15, 0.09, 1)
    head.add(brim)
    // 라벨
    const label = sphere(R * 0.34, bandM, 0, R * 0.55, R * 0.92, 12, 8)
    label.scale.set(1.1, 0.55, 0.25)
    head.add(label)
  }
  if (L.extra === 'mic') {
    const micM = track(mat(0x8f8f8f))
    const stick = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, R * 0.8, 3, 8), track(mat(0x2b2b2b)))
    stick.position.set(R * 0.5, -R * 0.55, R * 1.0)
    stick.rotation.z = -0.5
    head.add(stick)
    head.add(sphere(R * 0.17, micM, R * 0.32, -R * 0.2, R * 1.0, 12, 10))
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
