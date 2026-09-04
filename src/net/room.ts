// Trystero 기반 방 목록·방 생성·참가. 서버 없이 공개 Nostr 릴레이(기본)로 시그널링한다.
// - 로비 방('lobby'): 접속 중인 모든 사람이 모이는 공용 방. 호스트가 방 정보를 방송하고, 다른 사람은 목록으로 본다.
// - 게임 방(code): 호스트 + 게스트 최대 3명 (정원 MAX_PLAYERS). 풀 메시라 모두가 모두에게 보낸다.
//   방 상태(멤버 순서·준비·팀)는 호스트가 'room' 메시지로 방송하는 것이 정본이다.
// 게임 로직은 모른다. 메시지와 피어 이벤트만 다룬다.

import { joinRoom, selfId, type Room } from 'trystero'
import { MAX_PLAYERS } from '../core/state'

/** 프로토콜이 바뀌면 올린다 (다른 버전 클라이언트와 섞이지 않게) */
export const APP_ID = 'bedorage-duck-v2'
const LOBBY_ID = 'lobby'
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
}

export type RoomMode = 'ffa' | 'teams'
export const ROOM_MODE_LABEL: Record<RoomMode, string> = { ffa: '개인전', teams: '2v2 팀전' }

export function makeRoomCode(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  let s = ''
  for (const b of bytes) s += CODE_ALPHABET[b % CODE_ALPHABET.length]
  return s
}

export function normalizeCode(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}

// ---------- 방 목록 (로비) ----------

export interface RoomInfo {
  code: string
  hostChar: string
  map: string
  targetKills: number
  mode: RoomMode
  /** 현재 인원 / 정원 */
  count: number
  max: number
  /** open = 참가 가능, full = 정원 참, playing = 게임 중 */
  state: 'open' | 'full' | 'playing' | 'closed'
  /** 수신 시각 (로컬) */
  seenAt: number
  /** 방송한 피어 */
  peerId: string
}

export type RoomAnnounce = Omit<RoomInfo, 'seenAt' | 'peerId'>

export interface LobbyLink {
  /** 목록이 바뀔 때마다 (만료 포함) */
  onRooms(cb: (rooms: RoomInfo[]) => void): void
  /** 호스트: 내 방 정보를 방송 (2초마다 자동 재방송) */
  announce(info: RoomAnnounce | null): void
  onlineCount(): number
  leave(): void
}

export function openLobby(): LobbyLink {
  const room: Room = joinRoom({ appId: APP_ID, rtcConfig: RTC_CONFIG }, LOBBY_ID)
  const [sendRoom, onRoom] = room.makeAction<RoomAnnounce | null>('room')
  const rooms = new Map<string, RoomInfo>()
  let mine: RoomAnnounce | null = null
  let cb: ((rooms: RoomInfo[]) => void) | null = null
  let peers = 0

  const emit = () => {
    const now = performance.now()
    for (const [k, r] of rooms) if (now - r.seenAt > 7000 || r.state === 'closed') rooms.delete(k)
    cb?.([...rooms.values()].sort((a, b) => a.code.localeCompare(b.code)))
  }
  onRoom((info, peerId) => {
    if (!info) {
      rooms.delete(peerId)
    } else {
      rooms.set(peerId, { ...info, seenAt: performance.now(), peerId })
    }
    emit()
  })
  room.onPeerJoin(() => {
    peers++
    if (mine) void sendRoom(mine)
  })
  room.onPeerLeave((id) => {
    peers = Math.max(0, peers - 1)
    rooms.delete(id)
    emit()
  })
  const timer = setInterval(() => {
    if (mine) void sendRoom(mine)
    emit()
  }, 2000)

  return {
    onRooms(f) {
      cb = f
      emit()
    },
    announce(info) {
      mine = info
      void sendRoom(info)
    },
    onlineCount() {
      return peers + 1
    },
    leave() {
      clearInterval(timer)
      if (mine) void sendRoom(null)
      setTimeout(() => void room.leave(), 200)
    },
  }
}

// ---------- 게임 방 ----------

/** 방 멤버. 배열 순서 = 플레이어 인덱스 (호스트가 0) */
export type Member = {
  id: string
  char: string
  ready: boolean
  team: number
  /** 닉네임 (비어 있으면 캐릭터 이름을 쓴다) */
  name: string
}

export type CtlMessage =
  /** 내 상태 (캐릭터·준비·팀). 모두에게 */
  | { t: 'hello'; char: string; ready: boolean; team: number; name: string }
  /** 호스트 → 모두: 방 상태 정본 */
  | { t: 'room'; mode: RoomMode; targetKills: number; map: string; members: Member[] }
  /** 호스트 → 정원 초과로 들어온 피어 */
  | { t: 'full' }
  /** 호스트 → 모두: 시작. players 순서가 플레이어 인덱스 */
  | { t: 'start'; seed: number; targetKills: number; delay: number; map: string; scale: number; mode: RoomMode; players: Member[] }
  | { t: 'ping'; s: number }
  | { t: 'pong'; s: number }
  | { t: 'hash'; tick: number; h: number }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | { t: 'resync'; tick: number; state: any }
  /** 호스트 → 모두: 플레이어 p 를 tick 에 제거 (이탈) */
  | { t: 'drop'; p: number; tick: number }
  | { t: 'rematch'; seed: number }
  | { t: 'leave' }

export interface RoomLink {
  code: string
  role: 'host' | 'guest'
  selfId: string
  /** 연결된 피어 id */
  peers: Set<string>
  /** 피어별 왕복 시간 */
  rtts: Map<string, number>
  /** 가장 느린 피어의 왕복 시간 */
  readonly rtt: number
  /** to 를 생략하면 모두에게 */
  sendCtl(m: CtlMessage, to?: string | string[]): void
  sendInput(buf: Uint8Array): void
  onCtl(cb: (m: CtlMessage, from: string) => void): void
  onInput(cb: (buf: Uint8Array, from: string) => void): void
  onPeerJoin(cb: (id: string) => void): void
  onPeerLeave(cb: (id: string) => void): void
  leave(): void
}

export const ROOM_MAX = MAX_PLAYERS

export function openRoom(code: string, role: 'host' | 'guest'): RoomLink {
  const room: Room = joinRoom({ appId: APP_ID, rtcConfig: RTC_CONFIG }, `room-${code}`)
  const [sendCtlRaw, onCtlRaw] = room.makeAction<CtlMessage>('ctl')
  const [sendInRaw, onInRaw] = room.makeAction<Uint8Array>('in')
  const peers = new Set<string>()
  const rtts = new Map<string, number>()
  // Trystero 는 훅마다 리스너를 하나만 갖는다 (나중 등록이 덮어씀). 여기서 한 번만 등록하고 여러 콜백에 나눠 준다.
  const joinCbs: ((id: string) => void)[] = []
  const leaveCbs: ((id: string) => void)[] = []
  const ctlCbs: ((m: CtlMessage, from: string) => void)[] = []
  const inCbs: ((buf: Uint8Array, from: string) => void)[] = []

  const link: RoomLink = {
    code,
    role,
    selfId,
    peers,
    rtts,
    get rtt() {
      let m = 0
      for (const v of rtts.values()) m = Math.max(m, v)
      return m
    },
    sendCtl(m, to) {
      if (to !== undefined) {
        const list = Array.isArray(to) ? to.filter((p) => peers.has(p)) : peers.has(to) ? [to] : []
        if (list.length > 0) void sendCtlRaw(m, list)
      } else if (peers.size > 0) {
        void sendCtlRaw(m)
      }
    },
    sendInput(buf) {
      if (peers.size > 0) void sendInRaw(buf)
    },
    onCtl(cb) {
      ctlCbs.push(cb)
    },
    onInput(cb) {
      inCbs.push(cb)
    },
    onPeerJoin(cb) {
      joinCbs.push(cb)
    },
    onPeerLeave(cb) {
      leaveCbs.push(cb)
    },
    leave() {
      clearInterval(pingTimer)
      joinCbs.length = 0
      leaveCbs.length = 0
      ctlCbs.length = 0
      inCbs.length = 0
      void room.leave()
    },
  }

  room.onPeerJoin((id) => {
    peers.add(id)
    for (const cb of [...joinCbs]) cb(id)
  })
  room.onPeerLeave((id) => {
    peers.delete(id)
    rtts.delete(id)
    for (const cb of [...leaveCbs]) cb(id)
  })
  onCtlRaw((m, from) => {
    if (m.t === 'ping') {
      link.sendCtl({ t: 'pong', s: m.s }, from)
      return
    }
    if (m.t === 'pong') {
      rtts.set(from, Math.round(performance.now() - m.s))
      return
    }
    for (const cb of [...ctlCbs]) cb(m, from)
  })
  onInRaw((buf, from) => {
    for (const cb of [...inCbs]) cb(buf as Uint8Array, from)
  })
  const pingTimer = setInterval(() => {
    if (peers.size === 0) return
    link.sendCtl({ t: 'ping', s: performance.now() })
  }, 1000)
  return link
}

export function roomLinkUrl(code: string): string {
  const u = new URL(location.href)
  u.search = ''
  u.hash = `room=${code}`
  return u.toString()
}

export function roomCodeFromUrl(): string | null {
  const m = /room=([A-Za-z0-9]{4,8})/.exec(location.hash)
  return m ? normalizeCode(m[1]) : null
}
