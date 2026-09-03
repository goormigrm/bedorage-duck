// Trystero 기반 방 생성/참가. 서버 없이 공개 Nostr 릴레이(기본)로 시그널링한다.
// 게임 로직은 모른다. 바이트/JSON 메시지와 피어 이벤트만 다룬다.

import { joinRoom, selfId, type Room } from 'trystero'

export const APP_ID = 'bedorage-duck-v1'
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

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

export type CtlMessage =
  | { t: 'hello'; role: 'host' | 'guest'; char: string; name: string }
  | { t: 'full' }
  | { t: 'start'; seed: number; targetKills: number; chars: [string, string]; delay: number }
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
  const room: Room = joinRoom(
    {
      appId: APP_ID,
      rtcConfig: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      },
    },
    code,
  )
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

  // RTT 측정 (1초마다)
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
