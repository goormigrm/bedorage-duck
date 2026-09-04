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
/** 기력: 대시와 (근접 무기 보유 시) 총알 막기에 쓴다 */
export const STAMINA_MAX = 100
/** 틱당 회복 (약 4.5초에 가득) */
export const STAMINA_REGEN = 22 / 60
export const DASH_COST = 34
/** 후라이팬 방어: 피해 1 을 막는 데 드는 기력 (기력 한 통 = 피해 181) */
export const BLOCK_COST = 0.55
/** 막은 뒤 기력이 다시 차기까지 (계속 맞으면 방어가 뚫리도록) */
export const BLOCK_LOCK_TICKS = 30
/** 앞에서 오는 탄을 후라이팬으로 막을 확률. 나머지는 그대로 맞는다 (2026-09-06: 승빠덕이 여전히 너무 세서 50%) */
export const BLOCK_CHANCE = 0.5
/** 죽은 자리에 떨어지는 힐팩: 회복량(최대 체력 비율) · 유지 시간 · 줍는 반경 */
export const MEDKIT_HEAL_FRAC = 0.35
export const MEDKIT_TTL = 60 * 20
export const MEDKIT_RADIUS = 26

/** 리스폰 후 이 틱 안에는 Tab 으로 캐릭터를 바꿀 수 있다 (3초) */
export const SWAP_GRACE_TICKS = 180
/** 한 경기 최대 인원 (방 정원) */
/**
 * 한 방 최대 인원. 6~8명도 계산·대역폭은 여유지만(8인 기준 틱당 0.03ms · 22KB/s),
 * **풀 메시 연결 수**가 8인이면 28쌍이라 TURN 없이 전부 뚫릴 확률이 떨어지고,
 * 락스텝이라 한 사람의 지터가 전원에게 퍼진다. 실제로 3인 테스트에서 한 명이 무선이면 끊김이 체감됐다.
 * 그래서 4로 둔다. (측정값은 CHANGELOG v1.4 참고)
 */
export const MAX_PLAYERS = 4
export const MIN_PLAYERS = 2

export type Phase = 'countdown' | 'playing' | 'over'

export interface PlayerState {
  /** 플레이어 인덱스 0..MAX_PLAYERS-1 */
  id: number
  /** 팀 번호. 개인전(FFA)에서는 자기 인덱스와 같다 → 모두가 서로 적. 팀전에서는 0/1 */
  team: number
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
  /** 경기 도중 나간 사람. 더 이상 리스폰하지 않고 표적에서도 제외 */
  left: boolean
  /** 캐릭터 고르는 중: 소환되지 않아 맞지도 않는다. 고르면 먼 곳에 리스폰 */
  choosing: boolean
  /** 연속 명중 수 (기열덕 패시브). 빗나가면 0 */
  streak: number
  /** 기력 0..STAMINA_MAX */
  stamina: number
  /** 총알을 막은 직후 기력이 다시 차지 않는 틱 수. 계속 맞으면 방어가 결국 뚫린다 */
  blockLock: number
  /** 결과 화면 통계. sim 안에 두어야 리싱크·재접속에도 값이 어긋나지 않는다 */
  shots: number
  hits: number
  heads: number
  dmgDealt: number
  dmgTaken: number
  /** 한 판에서 죽지 않고 이어 간 최다 킬 */
  bestStreak: number
  /** 지금 연속 킬 (죽으면 0) */
  killStreak: number
}

export interface Bullet {
  id: number
  owner: number
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
  /** 누군가를 맞혔는가 (빗나감 판정용) */
  hitSomeone: boolean
  /** 모래주머니를 넘어가는 탄 (엄폐 중 사격 또는 머리 조준) */
  over: boolean
}

export type SimEvent =
  | { type: 'fire'; p: number; x: number; y: number; aim: number; weapon: WeaponId }
  | { type: 'hit'; p: number; by: number; x: number; y: number; part: number; dmg: number }
  | { type: 'death'; p: number; by: number; x: number; y: number }
  | { type: 'respawn'; p: number; x: number; y: number }
  | { type: 'dash'; p: number }
  | { type: 'reload'; p: number }
  | { type: 'wall'; x: number; y: number; aim: number }
  | { type: 'leave'; p: number }
  /** 빈 자리에 사람이 들어왔다 (난입) */
  | { type: 'join'; p: number; char: CharacterId }
  /** 모래주머니 파괴 */
  | { type: 'break'; tx: number; ty: number }
  /** 근접 무기로 총알을 막음 */
  | { type: 'block'; p: number; x: number; y: number }
  /** 힐팩이 떨어짐 */
  | { type: 'drop'; x: number; y: number }
  /** 힐팩을 주움 */
  | { type: 'heal'; p: number; x: number; y: number; amount: number }
  /** 캐릭터 선택 화면 진입 (소환 해제) */
  | { type: 'choose'; p: number }
  /** 캐릭터가 바뀜 */
  | { type: 'swap'; p: number; char: CharacterId }
  | { type: 'start' }
  | { type: 'over'; winner: number }

export interface MatchConfig {
  seed: number
  targetKills: number
  /** 자리 수 = 길이 (2..MAX_PLAYERS). 아직 아무도 안 들어온 자리도 포함한다 */
  chars: CharacterId[]
  /** 팀 배정. 생략하면 개인전(각자 자기 인덱스가 팀) */
  teams?: number[]
  /**
   * 아직 사람이 없는 자리. true 면 `left` 로 시작해 판에 나오지 않는다.
   * 자리 수를 처음부터 최대로 잡아 두면 **중간에 배열을 늘리지 않아도** 난입을 받을 수 있다
   * (배열 크기가 바뀌면 모두가 정확히 같은 틱에 같은 방식으로 늘려야 해서 어긋나기 쉽다).
   */
  absent?: boolean[]
}
/** 맵은 GameState 밖(정적)이라 MatchConfig 에 넣지 않고 세션 설정으로 따로 전달한다 */

/** 죽은 자리에 떨어지는 힐팩. 이긴 쪽이 이어서 싸울 수 있게 해 준다 */
export interface Medkit {
  id: number
  x: number
  y: number
  /** 남은 틱 */
  ttl: number
}

export interface GameState {
  tick: number
  rng: Rng
  phase: Phase
  phaseTimer: number
  targetKills: number
  players: PlayerState[]
  bullets: Bullet[]
  nextBulletId: number
  /** 이긴 팀 (개인전이면 플레이어 인덱스). -1 = 아직 */
  winner: number
  /** 살아있는 모래주머니: 타일 인덱스 → 남은 내구도 */
  sandbags: Record<number, number>
  /** 바닥에 떨어진 힐팩 */
  medkits: Medkit[]
  nextMedkitId: number
  /** 이번 step 에서 발생한 이벤트. 해시/스냅샷 대상 아님. */
  events: SimEvent[]
}

/** 팀 킬 합계 */
export function teamKills(state: GameState, team: number): number {
  let k = 0
  for (const p of state.players) if (p.team === team) k += p.kills
  return k
}

/** 팀전인가 (같은 팀이 둘 이상) */
export function isTeamMatch(state: GameState): boolean {
  const seen = new Set<number>()
  for (const p of state.players) {
    if (seen.has(p.team)) return true
    seen.add(p.team)
  }
  return false
}

/** 서로 적인가 */
export function isEnemy(a: PlayerState, b: PlayerState): boolean {
  return a.id !== b.id && a.team !== b.team
}
