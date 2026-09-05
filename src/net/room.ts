// Trystero 기반 방 목록·방 생성·참가. 서버 없이 공개 Nostr 릴레이(기본)로 시그널링한다.
// - 로비 방('lobby'): 접속 중인 모든 사람이 모이는 공용 방. 호스트가 방 정보를 방송하고, 다른 사람은 목록으로 본다.
// - 게임 방(code): 호스트 + 게스트 최대 3명 (정원 MAX_PLAYERS). 풀 메시라 모두가 모두에게 보낸다.
//   방 상태(멤버 순서·준비·팀)는 호스트가 'room' 메시지로 방송하는 것이 정본이다.
// 게임 로직은 모른다. 메시지와 피어 이벤트만 다룬다.

import { joinRoom, selfId, type Room } from 'trystero'
import { MAX_PLAYERS } from '../core/state'

/** 프로토콜이 바뀌면 올린다 (다른 버전 클라이언트와 섞이지 않게) */
export const APP_ID = 'bedorage-duck-v3'
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
  | { t: 'room'; mode: RoomMode; targetKills: number; map: string; members: Member[]; size: number }
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
  /** 팀 신호: 같은 편에게 "여기" 를 찍는다. sim 밖(렌더 전용)이라 결정론과 무관하다 */
  | { t: 'mark'; p: number; x: number; y: number }
  /** 빠른 감정 표현 (ㅋㅋ · 굿 · 미안). sim 밖 */
  | { t: 'emote'; p: number; id: number }
  /**
   * 난입 (진행 중인 방에 새로 들어가기). 순서:
   *   1. 게스트 → 호스트 joinAsk. 호스트는 자리를 잡아 두고 곧바로 resume(판 전체)을 보낸다.
   *   2. 난입자는 그 판으로 세션을 열되 **관전 상태**다 — 자기 자리는 아직 판에 없고, 모두의 락스텝도 그 자리를 기다리지 않는다.
   *   3. 난입자가 모든 피어와 연결되면 joinReady. 호스트가 그 사람 입력까지 실제로 받고 있으면 joinLive 를 방송한다.
   *   4. joinLive 의 tick 에 모두가 같은 틱에 자리를 채우고, 그때부터 그 사람 입력을 기다린다.
   *   준비가 늦으면(8초) 호스트가 joinCancel 로 자리를 되돌리고 그 사람을 돌려보낸다(rejoinNo).
   * 기존 사람들은 3·4 사이에도 그 자리를 기다리지 않으므로 **난입 때문에 멈추는 일이 없다.**
   */
  | { t: 'joinAsk'; char: string; name: string }
  /** 난입자 → 호스트: 모두와 연결됐다 (호스트가 준 피어 목록 기준) */
  | { t: 'joinReady' }
  /**
   * 호스트 → 모두: 자리 p 에 tick 부터 사람이 들어온다. **id 는 난입자의 피어 id 다.**
   * 이게 없으면 호스트가 아닌 사람은 난입자의 입력이 누구 것인지 몰라서 통째로 버리고,
   * 그 자리 입력을 영원히 기다리다 모두가 멈춘다(2026-09-06 제보).
   */
  | { t: 'joinLive'; p: number; tick: number; char: string; team: number; name: string; id: string }
  /**
   * 호스트 → 모두: 자리 p 에 들어오기로 한 사람(id)의 배정을 물린다 (앉기 전에 나갔거나 준비가 늦었다).
   * 이게 없으면 그 자리에 유령이 소환되고 모두가 그 입력을 기다리다 멈춘다.
   */
  | { t: 'joinCancel'; p: number; id: string }
  /** 아무나 → 모두: 지난 입력을 다시 보내 달라 (난입자가 세션을 연 직후 — 그 전에 온 패킷은 받을 곳이 없었다) */
  | { t: 'inputsPlease' }
  /** 호스트 → 모두: 팀전에서 누가 나가 경기를 끝낸다 (p = 나간 사람). 받은 쪽은 그 자리에서 결과를 띄운다 */
  | { t: 'abort'; p: number }
  /** 호스트 → 돌아온 사람에게만: 그 시점의 판 전체 (이걸로 이어서 시작한다) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | { t: 'resume'; p: number; tick: number; state: any; cfg: any }
  /** 호스트 → 돌아온 사람: 자리가 없다 */
  | { t: 'rejoinNo'; why: string }
  | { t: 'rematch'; seed: number }
  | { t: 'leave' }

/** 재접속한 사람이 세션을 다시 만들 때 필요한 설정 (맵·인원·닉네임 등) */
export interface ResumeCfg {
  chars: string[]
  teams?: number[]
  names: string[]
  targetKills: number
  seed: number
  map: string
  scale: number
  delay: number
  peerIds: string[]
}

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
  /** to 를 주면 그 피어에게만 (늦게 연결된 피어에게 지난 입력을 몰아 보낼 때) */
  sendInput(buf: Uint8Array, to?: string): void
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
    sendInput(buf, to) {
      if (to !== undefined) {
        if (peers.has(to)) void sendInRaw(buf, to)
      } else if (peers.size > 0) void sendInRaw(buf)
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
