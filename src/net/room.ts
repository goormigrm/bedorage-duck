// Trystero 기반 방 목록·방 생성·참가. 서버 없이 공개 Nostr 릴레이(기본)로 시그널링한다.
// - 로비 방('lobby'): 접속 중인 모든 사람이 모이는 공용 방. 호스트가 방 정보를 방송하고, 다른 사람은 목록으로 본다.
// - 게임 방(code): 호스트와 게스트 둘만. 여기서 준비·시작·입력을 주고받는다.
// 게임 로직은 모른다. 메시지와 피어 이벤트만 다룬다.

import { joinRoom, selfId, type Room } from 'trystero'

export const APP_ID = 'bedorage-duck-v1'
const LOBBY_ID = 'lobby'
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
}

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
  /** open = 참가 가능, full = 둘 다 있음, playing = 게임 중 */
  state: 'open' | 'full' | 'playing' | 'closed'
  /** 수신 시각 (로컬) */
  seenAt: number
  /** 방송한 피어 */
  peerId: string
}

export interface LobbyLink {
  /** 목록이 바뀔 때마다 (만료 포함) */
  onRooms(cb: (rooms: RoomInfo[]) => void): void
  /** 호스트: 내 방 정보를 방송 (2초마다 자동 재방송) */
  announce(info: Omit<RoomInfo, 'seenAt' | 'peerId'> | null): void
  onlineCount(): number
  leave(): void
}

export function openLobby(): LobbyLink {
  const room: Room = joinRoom({ appId: APP_ID, rtcConfig: RTC_CONFIG }, LOBBY_ID)
  const [sendRoom, onRoom] = room.makeAction<Omit<RoomInfo, 'seenAt' | 'peerId'> | null>('room')
  const rooms = new Map<string, RoomInfo>()
  let mine: Omit<RoomInfo, 'seenAt' | 'peerId'> | null = null
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

export type CtlMessage =
  | { t: 'hello'; role: 'host' | 'guest'; char: string; ready: boolean }
  | { t: 'ready'; v: boolean; char: string }
  | { t: 'full' }
  | { t: 'start'; seed: number; targetKills: number; chars: [string, string]; delay: number; map: string }
  | { t: 'ping'; s: number }
  | { t: 'pong'; s: number }
  | { t: 'hash'; tick: number; h: number }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | { t: 'resync'; tick: number; state: any }
  | { t: 'rematch'; seed: number }
  | { t: 'leave' }

export interface RoomLink {
  code: string
  role: 'host' | 'guest'
  selfId: string
  peerId: string | null
  rtt: number
  sendCtl(m: CtlMessage): void
  sendInput(buf: Uint8Array): void
  onCtl(cb: (m: CtlMessage, from: string) => void): void
  onInput(cb: (buf: Uint8Array, from: string) => void): void
  onPeerJoin(cb: (id: string) => void): void
  onPeerLeave(cb: (id: string) => void): void
  leave(): void
}

export function openRoom(code: string, role: 'host' | 'guest'): RoomLink {
  const room: Room = joinRoom({ appId: APP_ID, rtcConfig: RTC_CONFIG }, `room-${code}`)
  const [sendCtlRaw, onCtlRaw] = room.makeAction<CtlMessage>('ctl')
  const [sendInRaw, onInRaw] = room.makeAction<Uint8Array>('in')

  const link: RoomLink = {
    code,
    role,
    selfId,
    peerId: null,
    rtt: 0,
    sendCtl(m) {
      if (link.peerId) void sendCtlRaw(m, link.peerId)
    },
    sendInput(buf) {
      if (link.peerId) void sendInRaw(buf, link.peerId)
    },
    onCtl(cb) {
      onCtlRaw((m, from) => cb(m, from))
    },
    onInput(cb) {
      onInRaw((buf, from) => cb(buf as Uint8Array, from))
    },
    onPeerJoin(cb) {
      room.onPeerJoin(cb)
    },
    onPeerLeave(cb) {
      room.onPeerLeave(cb)
    },
    leave() {
      void room.leave()
    },
  }

  const pingTimer = setInterval(() => {
    if (!link.peerId) return
    link.sendCtl({ t: 'ping', s: performance.now() })
  }, 1000)
  onCtlRaw((m) => {
    if (m.t === 'ping') link.sendCtl({ t: 'pong', s: m.s })
    else if (m.t === 'pong') link.rtt = Math.round(performance.now() - m.s)
  })
  room.onPeerLeave(() => {
    clearInterval(pingTimer)
  })
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
