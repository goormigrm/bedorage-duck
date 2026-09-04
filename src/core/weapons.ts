// 무기 밸런스 테이블. 시간 단위는 틱(60Hz), 거리는 px.
// 밸런스 원칙 (2026-09-04): 체력이 2배(170~300)라 총으로 여러 발 주고받아야 죽는다.
// 저격총만 한 방(몸 120, 머리 240)에 죽일 수 있고, 나머지는 한 번의 사격으로 죽지 않는다.

export type WeaponId = 'pistol' | 'smg' | 'rifle' | 'shotgun' | 'sniper' | 'mg' | 'pan'

export interface WeaponDef {
  id: WeaponId
  name: string
  damage: number
  /** 발당 탄 수 (산탄) */
  pellets: number
  /** 발사 간격 (틱) */
  fireInterval: number
  /** 자동 연사 여부. 모든 무기가 꾹 누르면 발사 간격마다 계속 쏜다 (탄이 떨어지면 자동 재장전) */
  auto: boolean
  /** 0 이면 무한 (근접 무기) */
  magSize: number
  /** 재장전 틱 */
  reloadTicks: number
  /** 지향/조준 탄퍼짐 (1024 단계 각도 단위, ±) */
  spreadHip: number
  spreadAds: number
  /** 발당 반동 누적 (각도 단위) */
  recoil: number
  /** 틱당 반동 회복 */
  recoilRecover: number
  /** 탄속 px/tick */
  speed: number
  /** 수명 틱 */
  life: number
  /** 이동 속도 배율 */
  moveMul: number
  /** 렌더용 길이 */
  length: number
  color: number
  /** 거리 감쇠: 이 거리(px)까지는 100%, falloffEnd 에서 falloffMin 배율까지 선형 감소 */
  falloffStart: number
  falloffEnd: number
  falloffMin: number
  /** 근접 무기 (투사체 없이 부채꼴 판정) */
  melee?: boolean
  /** 근접 사거리 px */
  meleeRange?: number
  /** 근접 부채꼴 반각 (1024 단위) */
  meleeArc?: number
  /** 정조준 시 스코프 (시야가 멀어지고 화면에 조준경) */
  scope?: boolean
}

/** 거리에 따른 피해 배율 */
export function falloff(w: WeaponDef, dist: number): number {
  if (dist <= w.falloffStart) return 1
  if (dist >= w.falloffEnd) return w.falloffMin
  const k = (dist - w.falloffStart) / (w.falloffEnd - w.falloffStart)
  return 1 - (1 - w.falloffMin) * k
}

const deg = (d: number) => Math.round((d / 360) * 1024)

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: {
    id: 'pistol', name: '권총', damage: 26, pellets: 1, fireInterval: 13, auto: true,
    magSize: 14, reloadTicks: 90, spreadHip: deg(5), spreadAds: deg(1.6), recoil: deg(2.2),
    recoilRecover: deg(0.55), speed: 15, life: 60, moveMul: 1.0, length: 14, color: 0x9aa0a6,
    falloffStart: 9999, falloffEnd: 9999, falloffMin: 1,
  },
  smg: {
    id: 'smg', name: 'SMG', damage: 15, pellets: 1, fireInterval: 5, auto: true,
    magSize: 32, reloadTicks: 110, spreadHip: deg(8), spreadAds: deg(4.2), recoil: deg(1.4),
    recoilRecover: deg(0.5), speed: 14, life: 55, moveMul: 0.96, length: 18, color: 0x7c8590,
    falloffStart: 260, falloffEnd: 620, falloffMin: 0.6,
  },
  rifle: {
    id: 'rifle', name: '소총', damage: 26, pellets: 1, fireInterval: 9, auto: true,
    magSize: 30, reloadTicks: 130, spreadHip: deg(5.5), spreadAds: deg(1.4), recoil: deg(2.2),
    recoilRecover: deg(0.5), speed: 17, life: 70, moveMul: 0.92, length: 24, color: 0x5f6b48,
    falloffStart: 9999, falloffEnd: 9999, falloffMin: 1,
  },
  // 근접에서 압도적(탄당 14×7 = 98), 멀면 급감. 한 방에 죽이지는 못한다
  shotgun: {
    id: 'shotgun', name: '산탄총', damage: 14, pellets: 7, fireInterval: 42, auto: true,
    magSize: 6, reloadTicks: 150, spreadHip: deg(9), spreadAds: deg(6), recoil: deg(4),
    recoilRecover: deg(0.4), speed: 13, life: 32, moveMul: 0.9, length: 26, color: 0x8b5a2b,
    falloffStart: 170, falloffEnd: 470, falloffMin: 0.35,
  },
  // 유일하게 한 방이 나오는 무기. 대신 재장전이 길고, 정조준(우클릭) 없이는 거의 맞지 않는다
  sniper: {
    id: 'sniper', name: '저격총', damage: 120, pellets: 1, fireInterval: 90, auto: true,
    magSize: 5, reloadTicks: 260, spreadHip: deg(15), spreadAds: deg(0.4), recoil: deg(7),
    recoilRecover: deg(0.35), speed: 26, life: 90, moveMul: 0.8, length: 32, color: 0x3d4a5c,
    falloffStart: 9999, falloffEnd: 9999, falloffMin: 1, scope: true,
  },
  // 명중률은 낮고 반동은 세지만 탄이 많아 계속 퍼붓는다
  mg: {
    id: 'mg', name: '기관총', damage: 14, pellets: 1, fireInterval: 5, auto: true,
    magSize: 80, reloadTicks: 210, spreadHip: deg(12), spreadAds: deg(7.5), recoil: deg(2.4),
    recoilRecover: deg(0.35), speed: 15, life: 60, moveMul: 0.86, length: 30, color: 0x4a4f45,
    falloffStart: 320, falloffEnd: 760, falloffMin: 0.55,
  },
  // 승빠덕 전용 근접 무기. 꾹 누르면 계속 휘두르고, 기력으로 총알을 막는다
  pan: {
    id: 'pan', name: '후라이팬', damage: 62, pellets: 1, fireInterval: 26, auto: true,
    magSize: 0, reloadTicks: 0, spreadHip: 0, spreadAds: 0, recoil: 0,
    recoilRecover: 0, speed: 0, life: 0, moveMul: 1.02, length: 20, color: 0x33383c,
    falloffStart: 9999, falloffEnd: 9999, falloffMin: 1,
    melee: true, meleeRange: 62, meleeArc: deg(55),
  },
}

export const PART_HEAD = 0
export const PART_BODY = 1
export const PART_LEGS = 2
export const PART_MULT = [2.0, 1.0, 0.6]

/** 산탄은 머리 배율을 낮춰 한 방에 죽지 않게 한다 */
export function headMult(w: WeaponDef): number {
  return w.pellets > 1 ? 1.5 : PART_MULT[PART_HEAD]
}

/**
 * 부위 판정 — 확률이 아니라 '얼마나 정확히 맞혔는가'로 정한다 (덕코프식).
 * d = 탄 궤적과 상대 중심 사이의 최단 거리, r = 상대 반지름.
 * 정중앙에 맞히면 머리, 가장자리를 스치면 다리.
 */
export function partForOffset(d: number, r: number): number {
  if (d <= r * 0.34) return PART_HEAD
  if (d <= r * 0.74) return PART_BODY
  return PART_LEGS
}
