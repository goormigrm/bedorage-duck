// 무기 밸런스 테이블. 시간 단위는 틱(60Hz), 거리는 px.

export type WeaponId = 'pistol' | 'smg' | 'rifle' | 'shotgun' | 'sniper'

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
    id: 'pistol', name: '권총', damage: 22, pellets: 1, fireInterval: 12, auto: true,
    magSize: 12, reloadTicks: 72, spreadHip: deg(6), spreadAds: deg(2), recoil: deg(1.2),
    recoilRecover: deg(0.2), speed: 15, life: 60, moveMul: 1.0, length: 14, color: 0x9aa0a6,
    falloffStart: 9999, falloffEnd: 9999, falloffMin: 1,
  },
  smg: {
    id: 'smg', name: 'SMG', damage: 14, pellets: 1, fireInterval: 5, auto: true,
    magSize: 30, reloadTicks: 108, spreadHip: deg(8), spreadAds: deg(4), recoil: deg(1.0),
    recoilRecover: deg(0.25), speed: 14, life: 55, moveMul: 1.0, length: 18, color: 0x7c8590,
    falloffStart: 260, falloffEnd: 620, falloffMin: 0.6,
  },
  rifle: {
    id: 'rifle', name: '소총', damage: 26, pellets: 1, fireInterval: 7, auto: true,
    magSize: 30, reloadTicks: 132, spreadHip: deg(6), spreadAds: deg(1.5), recoil: deg(1.4),
    recoilRecover: deg(0.22), speed: 18, life: 70, moveMul: 0.92, length: 24, color: 0x5f6b48,
    falloffStart: 9999, falloffEnd: 9999, falloffMin: 1,
  },
  // 철면덕 전용 느낌: 근접에서 압도적, 멀어지면 급감
  shotgun: {
    id: 'shotgun', name: '산탄총', damage: 15, pellets: 7, fireInterval: 45, auto: true,
    magSize: 6, reloadTicks: 150, spreadHip: deg(12), spreadAds: deg(8), recoil: deg(4),
    recoilRecover: deg(0.4), speed: 12, life: 30, moveMul: 0.9, length: 26, color: 0x8b5a2b,
    falloffStart: 140, falloffEnd: 440, falloffMin: 0.28,
  },
  sniper: {
    id: 'sniper', name: '저격총', damage: 80, pellets: 1, fireInterval: 75, auto: true,
    magSize: 5, reloadTicks: 180, spreadHip: deg(10), spreadAds: deg(0.3), recoil: deg(6),
    recoilRecover: deg(0.3), speed: 28, life: 80, moveMul: 0.8, length: 32, color: 0x3d4a5c,
    falloffStart: 9999, falloffEnd: 9999, falloffMin: 1,
  },
}

/** 부위 판정. 반환값은 피해 배율. */
export const PART_HEAD = 0
export const PART_BODY = 1
export const PART_LEGS = 2
export const PART_MULT = [2.0, 1.0, 0.6]

/**
 * 부위 추첨 확률 (머리, 몸통, 다리) — 사격 방식과 거리로 결정.
 * 반환은 누적 임계값 [head, head+body].
 */
export function partThresholds(ads: boolean, dist: number): [number, number] {
  if (ads) {
    if (dist < 200) return [0.25, 0.8]
    return [0.15, 0.75]
  }
  return [0.08, 0.7]
}
