import { CharacterId } from './characters'
import { Rng } from './rng'
import { WeaponId } from './weapons'

export const TICK_RATE = 60
export const TICK_MS = 1000 / TICK_RATE
export const PLAYER_RADIUS = 14
export const RESPAWN_TICKS = 180
export const SPAWN_PROTECT_TICKS = 90
export const COUNTDOWN_TICKS = 180
export const DASH_TICKS = 10
export const DASH_SPEED = 9

export type Phase = 'countdown' | 'playing' | 'over'

export interface PlayerState {
  id: 0 | 1
  char: CharacterId
  x: number
  y: number
  aim: number
  hp: number
  alive: boolean
  respawnTimer: number
  weapon: WeaponId
  ammo: number
  reloadTimer: number
  fireCooldown: number
  recoil: number
  ads: boolean
  dashTimer: number
  dashCooldown: number
  dashDx: number
  dashDy: number
  lastHitTick: number
  prevFire: boolean
  kills: number
  deaths: number
  legInjury: number
  invuln: number
  /** 이번 틱 이동 여부 (렌더 걷기 애니메이션용) */
  moving: boolean
  /** 스폰 이후 살아있는 틱 수 (렌더용) */
  aliveTicks: number
}

export interface Bullet {
  id: number
  owner: 0 | 1
  x: number
  y: number
  px: number
  py: number
  vx: number
  vy: number
  life: number
  damage: number
  ads: boolean
  ox: number
  oy: number
  weapon: WeaponId
}

export type SimEvent =
  | { type: 'fire'; p: 0 | 1; x: number; y: number; aim: number; weapon: WeaponId }
  | { type: 'hit'; p: 0 | 1; by: 0 | 1; x: number; y: number; part: number; dmg: number }
  | { type: 'death'; p: 0 | 1; by: 0 | 1; x: number; y: number }
  | { type: 'respawn'; p: 0 | 1; x: number; y: number }
  | { type: 'dash'; p: 0 | 1 }
  | { type: 'reload'; p: 0 | 1 }
  | { type: 'wall'; x: number; y: number; aim: number }
  | { type: 'start' }
  | { type: 'over'; winner: 0 | 1 }

export interface MatchConfig {
  seed: number
  targetKills: number
  chars: [CharacterId, CharacterId]
}
/** 맵은 GameState 밖(정적)이라 MatchConfig 에 넣지 않고 세션 설정으로 따로 전달한다 */

export interface GameState {
  tick: number
  rng: Rng
  phase: Phase
  phaseTimer: number
  targetKills: number
  players: [PlayerState, PlayerState]
  bullets: Bullet[]
  nextBulletId: number
  winner: -1 | 0 | 1
  /** 이번 step 에서 발생한 이벤트. 해시/스냅샷 대상 아님. */
  events: SimEvent[]
}
