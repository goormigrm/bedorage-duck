// 난입: 진행 중인 판의 빈 자리에 새 사람이 들어온다.
//
// 핵심은 두 가지다.
//  1) 자리가 비어 있는 동안 **경기가 멈추지 않아야** 한다 — 그 자리 입력을 빈 입력으로 채운다.
//  2) 들어온 사람이 **같은 지점에서** 시작해야 한다 — 호스트가 그 시점의 판을 통째로 보내 준다.
//     그래서 받은 판으로 이어서 돌려도 해시가 어긋나지 않아야 한다.
//
// (2026-09-06: 자동 재접속은 걷어냈다. 끊기면 그냥 나간 것이고, 돌아오려면 난입으로 들어온다)

import { describe, expect, it } from 'vitest'
import { botInput, makeBot } from '../src/core/bot'
import { EMPTY_INPUT, Input } from '../src/core/input'
import { buildMap } from '../src/core/map'
import { Lockstep } from '../src/net/lockstep'
import { CtlMessage, RoomLink } from '../src/net/room'
import { createState, hashState, snapshot, step, syncSandbags } from '../src/core/sim'

const map = buildMap('studio', 1, 555)

/** 아무 데도 보내지 않는 가짜 연결 */
function fakeLink(): RoomLink {
  return {
    code: 'TEST12',
    role: 'host',
    selfId: 'me',
    peers: [],
    rtt: 0,
    sendCtl: (_m: CtlMessage) => {},
    sendInput: () => {},
    onCtl: () => {},
    onInput: () => {},
    onPeerJoin: () => {},
    onPeerLeave: () => {},
    leave: () => {},
  } as unknown as RoomLink
}

/**
 * 서로 연결된 가짜 회선 여러 개. 한쪽이 보낸 입력 패킷이 나머지 모두에게 간다.
 * 실제 방과 같은 조건으로 락스텝을 돌려 보기 위한 것.
 */
function makeBus() {
  const subs: { id: string; fn: (buf: Uint8Array, from: string) => void }[] = []
  const link = (id: string): RoomLink =>
    ({
      code: 'TEST12',
      role: id === 'a' ? 'host' : 'guest',
      selfId: id,
      peers: [],
      rtt: 0,
      sendCtl: () => {},
      sendInput: (buf: Uint8Array) => {
        for (const s of subs) if (s.id !== id) s.fn(buf, id)
      },
      onCtl: () => {},
      onInput: (fn: (buf: Uint8Array, from: string) => void) => subs.push({ id, fn }),
      onPeerJoin: () => {},
      onPeerLeave: () => {},
      leave: () => {},
    }) as unknown as RoomLink
  return { link }
}

const IN = (mx: number): Input => ({ mx, my: 0, aim: 0, buttons: 0, char: 0 })

describe('락스텝 자리 비움·채움', () => {
  it('빈 자리가 있어도 나머지는 계속 진행한다', () => {
    const ls = new Lockstep(fakeLink(), 3, 0, new Map(), 2)
    ls.pushLocal(0, IN(1))
    // 1번의 입력이 없으면 멈춘다
    expect(ls.hasAll(3)).toBe(false)
    ls.drop(1)
    expect(ls.hasAll(3)).toBe(true)
    expect(ls.get(3)[1]).toEqual(EMPTY_INPUT)
  })

  it('자리가 채워지면 그 틱부터 입력을 기다린다', () => {
    const ls = new Lockstep(fakeLink(), 3, 0, new Map(), 2)
    ls.drop(1)
    expect(ls.isDropped(1)).toBe(true)
    ls.rejoin(1, 100)
    expect(ls.isDropped(1)).toBe(false)
    // 지나간 틱은 빈 입력으로 메워져 멈추지 않는다
    for (let t = 0; t < 100; t++) {
      ls.pushLocal(t, IN(0))
      expect(ls.hasAll(t)).toBe(true)
    }
    // 돌아온 뒤로는 실제 입력을 기다린다
    ls.pushLocal(100, IN(1))
    expect(ls.hasAll(103)).toBe(false)
  })

  it('경기 도중 합류(startTick)해도 그 앞은 기다리지 않는다', () => {
    const start = 500
    const ls = new Lockstep(fakeLink(), 3, 0, new Map(), 2, start)
    ls.rejoin(1, start)
    for (let t = start; t < start + 3; t++) expect(ls.hasAll(t)).toBe(true)
  })
})

describe('판 이어받기 (난입)', () => {
  it('받은 판으로 갈아 끼우고 이어서 돌려도 해시가 같다', () => {
    // 호스트 쪽: 600틱 진행
    const host = createState({ seed: 24, targetKills: 9, chars: ['chim', 'cheolmyeon'] }, map)
    const bots = [makeBot(1), makeBot(2)]
    const inputsLog: Input[][] = []
    for (let t = 0; t < 600; t++) {
      const ins = [botInput(host, map, 0, bots[0], 'hard'), botInput(host, map, 1, bots[1], 'normal')]
      inputsLog.push(ins.map((i) => ({ ...i })))
      step(host, map, ins)
    }
    // 이 시점의 판을 보낸다 (직렬화를 거쳐도 같아야 하므로 JSON 왕복)
    const sent = JSON.parse(JSON.stringify(snapshot(host))) as ReturnType<typeof snapshot>

    // 돌아온 사람 쪽: 새 맵 객체 + 받은 판
    const myMap = buildMap('studio', 1, 555)
    const mine = sent
    mine.events = []
    syncSandbags(mine, myMap)
    expect(hashState(mine)).toBe(hashState(host))

    // 같은 입력으로 200틱 더 — 양쪽이 계속 같아야 한다
    for (let t = 0; t < 200; t++) {
      const ins = [botInput(host, map, 0, bots[0], 'hard'), botInput(host, map, 1, bots[1], 'normal')]
      step(host, map, ins.map((i) => ({ ...i })))
      step(mine, myMap, ins.map((i) => ({ ...i })))
    }
    expect(hashState(mine)).toBe(hashState(host))
    void inputsLog
  })

  it('부서진 모래주머니도 그대로 이어진다', () => {
    const host = createState({ seed: 25, targetKills: 9, chars: ['chim', 'cheolmyeon'] }, map)
    // 모래주머니 하나를 부순다
    const idx = map.sandbagIdx[0]
    expect(idx).toBeGreaterThan(0)
    host.sandbags[idx] = 0
    delete host.sandbags[idx]
    const sent = JSON.parse(JSON.stringify(snapshot(host))) as ReturnType<typeof snapshot>
    const myMap = buildMap('studio', 1, 555)
    syncSandbags(sent, myMap)
    // 받은 쪽 맵에서도 그 자리는 뚫려 있어야 한다
    expect(myMap.tiles[idx]).not.toBe(myMap.tiles[map.sandbagIdx[1]])
    expect(sent.sandbags[idx]).toBeUndefined()
  })
})

/**
 * 2026-09-06 제보: **2명이 하는 방에 3번째가 난입하면 세 명 모두 "입력 대기" 로 멈췄다.**
 * 원인이 둘이었다.
 *   1) 호스트가 아닌 사람은 난입자의 피어 id 를 몰라 그 입력을 통째로 버렸다.
 *   2) 난입한 사람은 **아직 아무도 없는 자리**의 입력까지 기다렸다.
 * 락스텝은 한 명만 멈춰도 전원이 멈추므로, 둘 중 하나만 있어도 방 전체가 선다.
 */
describe('난입해도 멈추지 않는다', () => {
  const DELAY = 3
  const N = 4

  /** 정원 4, 사람은 a(0)·b(1) 둘뿐인 방을 만든다 */
  function twoPlayerRoom() {
    const { link } = makeBus()
    const idxA = new Map([['a', 0], ['b', 1]])
    const idxB = new Map([['a', 0], ['b', 1]])
    const a = new Lockstep(link('a'), DELAY, 0, idxA, N)
    const b = new Lockstep(link('b'), DELAY, 1, idxB, N)
    // 아직 아무도 없는 자리는 기다리지 않는다
    for (const ls of [a, b]) {
      ls.drop(2)
      ls.drop(3)
    }
    return { link, a, b, idxA, idxB }
  }

  /** 모두가 t 까지 진행할 수 있으면 그 틱을 돌려준다 (멈추면 멈춘 틱) */
  function run(peers: { ls: Lockstep; tick: number }[], until: number): number {
    let moved = true
    while (moved) {
      moved = false
      for (const p of peers) {
        if (p.tick >= until) continue
        p.ls.pushLocal(p.tick, IN(1))
        if (p.ls.hasAll(p.tick)) {
          p.tick++
          moved = true
        }
      }
    }
    return Math.min(...peers.map((p) => p.tick))
  }

  it('빈 자리가 둘이어도 두 사람은 계속 돈다', () => {
    const { a, b } = twoPlayerRoom()
    const peers = [{ ls: a, tick: 0 }, { ls: b, tick: 0 }]
    expect(run(peers, 100)).toBe(100)
  })

  it('난입한 사람이 들어와도 세 명 모두 계속 돈다', () => {
    const { link, a, b, idxA, idxB } = twoPlayerRoom()
    const peers = [{ ls: a, tick: 0 }, { ls: b, tick: 0 }]
    const start = run(peers, 100)
    expect(start).toBe(100)

    // 호스트가 자리 2 를 c 에게 준다 — **모두가** c 의 피어 id 를 기록해야 한다
    idxA.set('c', 2)
    idxB.set('c', 2)
    a.rejoin(2, start)
    b.rejoin(2, start)

    // 난입한 사람: 받은 판(start 틱)으로 시작하고, 아직 빈 자리 3 은 기다리지 않는다
    const idxC = new Map([['a', 0], ['b', 1]])
    const c = new Lockstep(link('c'), DELAY, 2, idxC, N, start)
    for (let i = 0; i < N; i++) c.rejoin(i, start)
    c.drop(3)

    const all = [{ ls: a, tick: start }, { ls: b, tick: start }, { ls: c, tick: start }]
    expect(run(all, start + 100)).toBe(start + 100)
  })

  it('난입자의 피어 id 를 모르면 그 사람 입력을 버려서 멈춘다 (버그 재현)', () => {
    const { link, a, b, idxA } = twoPlayerRoom()
    const peers = [{ ls: a, tick: 0 }, { ls: b, tick: 0 }]
    const start = run(peers, 100)
    idxA.set('c', 2)
    // b 의 색인에는 일부러 넣지 않는다 (예전 코드가 이랬다)
    a.rejoin(2, start)
    b.rejoin(2, start)
    const idxC = new Map([['a', 0], ['b', 1]])
    const c = new Lockstep(link('c'), DELAY, 2, idxC, N, start)
    for (let i = 0; i < N; i++) c.rejoin(i, start)
    c.drop(3)
    const all = [{ ls: a, tick: start }, { ls: b, tick: start }, { ls: c, tick: start }]
    expect(run(all, start + 100)).toBeLessThan(start + 100)
  })

  it('빈 자리를 기다리면 난입자가 멈추고, 따라서 방 전체가 멈춘다 (버그 재현)', () => {
    const { link, a, b, idxA, idxB } = twoPlayerRoom()
    const peers = [{ ls: a, tick: 0 }, { ls: b, tick: 0 }]
    const start = run(peers, 100)
    idxA.set('c', 2)
    idxB.set('c', 2)
    a.rejoin(2, start)
    b.rejoin(2, start)
    const idxC = new Map([['a', 0], ['b', 1]])
    const c = new Lockstep(link('c'), DELAY, 2, idxC, N, start)
    for (let i = 0; i < N; i++) c.rejoin(i, start)
    // c.drop(3) 을 빠뜨렸다 — 아무도 없는 자리 3 의 입력을 기다린다
    const all = [{ ls: a, tick: start }, { ls: b, tick: start }, { ls: c, tick: start }]
    expect(run(all, start + 100)).toBeLessThan(start + 100)
  })
})
