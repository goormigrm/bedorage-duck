// 덕코프식 일체형 캐릭터: 머리와 몸이 하나인 달걀형 몸통에 얼굴·옷이 텍스처로 그려진다.
// 머리카락·모자·귀·마이크는 작은 메쉬, 팔은 옆구리의 짧은 캡슐(총을 앞에 든 자세), 다리는 바닥의 작은 캡슐.
// 로컬 좌표: 발 아래 원점, +y 위, 정면 = +z. 단위 1 = 타일 한 칸(32px).

import * as THREE from 'three'
import { CharacterDef, Look } from '../core/characters'
import { WEAPONS, WeaponDef } from '../core/weapons'
import { bodyTexture, labelTexture } from './faceTexture'

const OUTLINE = 0x2b2412

/** 달걀 세로 비율 (반지름 대비) */
const EGG_Y = 1.15
/** 정수리 쪽 좁아지는 정도 */
const EGG_TAPER = 0.1
const LEG_H = 0.14

function mat(color: number, opts: Partial<THREE.MeshLambertMaterialParameters> = {}): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, ...opts })
}

/** 몸 반지름: 대두·덩치가 둘 다 달걀 크기에 반영된다 */
export function eggRadius(L: Look): number {
  return 0.4 * (0.55 * L.headScale + 0.45 * L.bodyScale)
}

/** 구 지오메트리를 달걀형으로 (위가 좁고, 세로로 길게). 중심은 원점 */
function eggify(g: THREE.BufferGeometry, r: number): THREE.BufferGeometry {
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const t = y / r
    const k = 1 - EGG_TAPER * Math.max(0, t)
    pos.setXYZ(i, x * k, y * EGG_Y, z * k)
  }
  pos.needsUpdate = true
  g.computeVertexNormals()
  return g
}

/** 달걀 표면의 높이 y(중심 기준)에서의 가로 반지름 */
function eggRadiusAt(r: number, y: number): number {
  const t = Math.max(-1, Math.min(1, y / (r * EGG_Y)))
  const k = 1 - EGG_TAPER * Math.max(0, t)
  return r * Math.sqrt(Math.max(0, 1 - t * t)) * k
}

function sphere(r: number, m: THREE.Material, x = 0, y = 0, z = 0, ws = 16, hs = 12): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), m)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  return mesh
}

/** 달걀 표면을 따라가는 캡(머리카락·모자). thetaLength 는 정수리부터의 각도 */
function eggCap(r: number, scale: number, thetaLength: number, m: THREE.Material, phiStart = 0, phiLength = Math.PI * 2): THREE.Mesh {
  const g = new THREE.SphereGeometry(r * scale, 28, 14, phiStart, phiLength, 0, thetaLength)
  eggify(g, r * scale)
  const mesh = new THREE.Mesh(g, m)
  mesh.castShadow = true
  return mesh
}

/** 축이 +z 를 향하는 캡슐. 원점은 뒤쪽 끝 */
function capsuleZ(r: number, len: number, m: THREE.Material): THREE.Mesh {
  const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len - r * 2), 3, 10)
  g.rotateX(Math.PI / 2)
  g.translate(0, 0, len / 2)
  const mesh = new THREE.Mesh(g, m)
  mesh.castShadow = true
  return mesh
}

/** 축이 -y 를 향하는 캡슐. 원점은 위쪽 끝 */
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
  /** 이름표 높이 (발 기준) */
  height: number
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

  const R = eggRadius(L)
  const centerY = LEG_H + R * EGG_Y

  // ---- 다리 (작은 캡슐) + 신발 ----
  const pantsM = track(mat(0x34405a))
  const legR0 = 0.06
  const legL = capsuleDown(legR0, LEG_H + R * 0.25, pantsM)
  const legR = capsuleDown(legR0, LEG_H + R * 0.25, pantsM)
  legL.position.set(-R * 0.36, LEG_H + R * 0.25, 0)
  legR.position.set(R * 0.36, LEG_H + R * 0.25, 0)
  body.add(legL, legR)
  const shoeM = track(mat(0x2a2622))
  for (const leg of [legL, legR]) {
    const shoe = sphere(legR0 * 1.7, shoeM, 0, -(LEG_H + R * 0.25) + legR0 * 0.9, legR0 * 0.9, 14, 10)
    shoe.scale.set(1, 0.55, 1.5)
    leg.add(shoe)
  }

  // ---- 몸통 (달걀, 얼굴·옷 텍스처) ----
  const head = new THREE.Group() // 머리 장식이 붙는 그룹 (몸통 중심)
  head.position.y = centerY
  body.add(head)
  const bodyM = track(new THREE.MeshLambertMaterial({ map: bodyTexture(def) }))
  const egg = new THREE.Mesh(eggify(new THREE.SphereGeometry(R, 40, 28), R), bodyM)
  egg.castShadow = true
  head.add(egg)

  // 귀: 눈 높이 옆
  const earY = R * EGG_Y * 0.48
  const earS = (L.earScale ?? 1) * R * 0.2
  const skinM = track(mat(L.skin))
  for (const side of [-1, 1]) {
    const ear = sphere(earS, skinM, side * (eggRadiusAt(R, earY) - earS * 0.2), earY, R * 0.02, 12, 10)
    ear.scale.set(0.45, 1, 0.75)
    head.add(ear)
  }
  const hairM = track(mat(L.hairColor))
  buildHair(head, L, def, R, hairM, track)

  // ---- 팔 + 총 (옆구리에서 앞으로, 하나의 그룹) ----
  const arms = new THREE.Group()
  // 팔은 얼굴 아래(옷깃 높이)에서 앞으로 — 총이 입을 가리지 않게
  const armY = -R * EGG_Y * 0.3
  arms.position.set(0, centerY + armY, eggRadiusAt(R, armY) * 0.5)
  body.add(arms)
  const sleeveM = track(mat(L.coat !== undefined ? L.coat : L.shirt))
  const armLen = R * 0.9
  const armR = R * 0.13
  const mkArm = (side: -1 | 1) => {
    const g = new THREE.Group()
    g.position.set(side * eggRadiusAt(R, armY) * 0.82, 0, -R * 0.15)
    const sleeve = capsuleZ(armR, armLen * 0.55, sleeveM)
    const fore = capsuleZ(armR * 0.9, armLen * 0.5, skinM)
    fore.position.z = armLen * 0.5
    const hand = sphere(armR * 1.2, skinM, 0, 0, armLen * 1.0, 10, 8)
    g.add(sleeve, fore, hand)
    g.rotation.y = -side * 0.5
    return g
  }
  arms.add(mkArm(-1), mkArm(1))
  const weapon = WEAPONS[def.weapon]
  const gun = buildGun(weapon, R)
  gun.group.position.set(0.02, -0.02, armLen * 0.55)
  arms.add(gun.group)

  const height = LEG_H + R * EGG_Y * 2 + R * 0.35
  const rig: CharacterRig = {
    root, body, head, arms, legL, legR, gunTip: gun.tip, def, weapon, height, flashMats,
    setFlash(k: number) {
      const e = k > 0 ? new THREE.Color(k, k, k) : new THREE.Color(0, 0, 0)
      for (const m of flashMats) m.emissive.copy(e)
    },
  }
  return rig
}

function buildGun(w: WeaponDef, R: number): { group: THREE.Group; tip: THREE.Object3D } {
  const g = new THREE.Group()
  const len = (0.26 + w.length / 120) * Math.max(0.8, R / 0.42)
  const bodyM = mat(w.color)
  const darkM = mat(0x2b2b2b)
  g.add(capsuleZ(0.055, len, bodyM))
  const grip = capsuleDown(0.03, 0.14, darkM)
  grip.position.set(0, 0.02, 0.08)
  grip.rotation.x = -0.25
  g.add(grip)
  const barrel = capsuleZ(0.024, len * 0.6, darkM)
  barrel.position.set(0, 0.028, len * 0.45)
  g.add(barrel)
  if (w.pellets > 1) {
    const b2 = capsuleZ(0.024, len * 0.6, darkM)
    b2.position.set(0.048, 0.028, len * 0.45)
    g.add(b2)
  }
  const tip = new THREE.Object3D()
  tip.position.set(0, 0.028, len + 0.03)
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
  const top = R * EGG_Y
  switch (L.hair) {
    case 'spiky': {
      // 회색 옆머리 띠: 눈 위 높이, 앞(얼굴)은 비우고 옆·뒤로만
      if (L.sideColor !== undefined) {
        const g = new THREE.SphereGeometry(R * 1.03, 28, 10, Math.PI * 0.85, Math.PI * 1.3, Math.PI * 0.25, Math.PI * 0.14)
        eggify(g, R * 1.03)
        const band = new THREE.Mesh(g, track(mat(L.sideColor)))
        band.castShadow = true
        head.add(band)
      }
      head.add(eggCap(R, 1.04, Math.PI * 0.24, hairM))
      const spikes = 11
      for (let i = 0; i < spikes; i++) {
        const a = (i / spikes) * Math.PI * 2
        const ring = i % 2 === 0 ? 0.5 : 0.26
        const cone = new THREE.Mesh(new THREE.ConeGeometry(R * 0.13, R * (0.55 + (i % 3) * 0.16), 6), hairM)
        cone.position.set(Math.cos(a) * R * ring, top * 0.92, Math.sin(a) * R * ring)
        cone.rotation.z = -Math.cos(a) * 0.6
        cone.rotation.x = Math.sin(a) * 0.6
        cone.castShadow = true
        head.add(cone)
      }
      if (L.crown === 'star') {
        const star = new THREE.Mesh(new THREE.OctahedronGeometry(R * 0.17), track(mat(0xffffff, { emissive: 0x444444 })))
        star.position.set(0, top * 1.22, R * 0.42)
        head.add(star)
      }
      break
    }
    case 'bowl': {
      // 바가지: 눈썹 위까지 덮는 둥근 캡
      head.add(eggCap(R, 1.06, Math.PI * 0.4, hairM))
      break
    }
    case 'short':
    case 'flat':
    case 'side': {
      head.add(eggCap(R, 1.05, Math.PI * 0.26, hairM))
      // 뒷머리: 뒤쪽만 더 내려온다
      head.add(eggCap(R, 1.045, Math.PI * 0.42, hairM, Math.PI * 1.1, Math.PI * 0.8))
      break
    }
    case 'buzz': {
      head.add(eggCap(R, 1.02, Math.PI * 0.3, hairM))
      break
    }
    case 'none':
    default:
      break
  }
  if (L.extra === 'cap') {
    const capM = track(mat(def.accentColor))
    const bandM = track(mat(L.capBand ?? 0xf4f4f0))
    head.add(eggCap(R, 1.08, Math.PI * 0.34, capM))
    // 챙: 납작한 타원, 앞으로
    const brimY = Math.cos(Math.PI * 0.34) * R * EGG_Y * 1.08
    const brim = sphere(R * 0.62, bandM, 0, brimY, eggRadiusAt(R, brimY) * 0.85, 16, 10)
    brim.scale.set(1.15, 0.08, 1.05)
    head.add(brim)
    // 라벨 ("침착")
    if (L.capText) {
      const labelM = new THREE.MeshLambertMaterial({ map: labelTexture(L.capText, L.capBand ?? 0xf4f4f0, def.accentColor) })
      const label = new THREE.Mesh(new THREE.PlaneGeometry(R * 0.62, R * 0.31), labelM)
      const ly = brimY + R * 0.28
      label.position.set(0, ly, eggRadiusAt(R * 1.08, ly / 1.0) + 0.01)
      label.rotation.x = -0.35
      head.add(label)
    }
  }
  if (L.extra === 'mic') {
    const micM = track(mat(0x8f8f8f))
    const my = -R * 0.12
    const stick = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, R * 0.6, 3, 8), track(mat(0x2b2b2b)))
    stick.position.set(R * 0.4, my - R * 0.3, eggRadiusAt(R, my) * 0.95)
    stick.rotation.z = -0.5
    head.add(stick)
    head.add(sphere(R * 0.15, micM, R * 0.26, my, eggRadiusAt(R, my) * 0.98, 12, 10))
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
