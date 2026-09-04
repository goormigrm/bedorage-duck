// 재접속. 끊긴 사람의 자리를 잠시 비워 두었다가 돌아오면 이어서 하게 한다.
//
// 핵심은 두 가지다.
//  1) 끊긴 동안 **경기가 멈추지 않아야** 한다 — 그 사람 입력을 빈 입력으로 채운다.
//  2) 돌아온 사람이 **같은 지점에서** 이어야 한다 — 호스트가 그 시점의 판을 통째로 보내 준다.
//     그래서 복원한 상태로 이어서 돌려도 해시가 어긋나지 않아야 한다.

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

const IN = (mx: number): Input => ({ mx, my: 0, aim: 0, buttons: 0, char: 0 })

describe('락스텝 재접속', () => {
  it('끊긴 사람이 있어도 나머지는 계속 진행한다', () => {
    const ls = new Lockstep(fakeLink(), 3, 0, new Map(), 2)
    ls.pushLocal(0, IN(1))
    // 1번의 입력이 없으면 멈춘다
    expect(ls.hasAll(3)).toBe(false)
    ls.drop(1)
    expect(ls.hasAll(3)).toBe(true)
    expect(ls.get(3)[1]).toEqual(EMPTY_INPUT)
  })

  it('돌아오면 그 틱부터 다시 입력을 기다린다', () => {
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

describe('판 이어받기', () => {
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
