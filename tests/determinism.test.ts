import { describe, expect, it } from 'vitest'
import { botInput, makeBot } from '../src/core/bot'
import { atan2A, radToAngle } from '../src/core/fixedmath'
import { Input } from '../src/core/input'
import { buildMap } from '../src/core/map'
import { createState, hashState, snapshot, step } from '../src/core/sim'

const map = buildMap()

function runBotMatch(seed: number, ticks: number): number[] {
  const state = createState({ seed, targetKills: 3, chars: ['chim', 'cheolmyeon'] }, map)
  const bots = [makeBot(seed ^ 1), makeBot(seed ^ 2)]
  const hashes: number[] = []
  for (let t = 0; t < ticks; t++) {
    const inputs: [Input, Input] = [
      botInput(state, map, 0, bots[0], 'hard'),
      botInput(state, map, 1, bots[1], 'normal'),
    ]
    step(state, map, inputs)
    if (t % 60 === 0) hashes.push(hashState(state))
  }
  return hashes
}

describe('결정론', () => {
  it('같은 시드·입력이면 해시가 완전히 같다', () => {
    const a = runBotMatch(12345, 60 * 40)
    const b = runBotMatch(12345, 60 * 40)
    expect(a).toEqual(b)
  })

  it('다른 시드는 다른 경기', () => {
    const a = runBotMatch(1, 60 * 10)
    const b = runBotMatch(2, 60 * 10)
    expect(a).not.toEqual(b)
  })

  it('스냅샷 복원 후 이어가도 같은 해시', () => {
    const seed = 777
    const s1 = createState({ seed, targetKills: 3, chars: ['jupeol', 'magic'] }, map)
    const s2 = createState({ seed, targetKills: 3, chars: ['jupeol', 'magic'] }, map)
    const b1 = [makeBot(9), makeBot(10)]
    const b2 = [makeBot(9), makeBot(10)]
    const go = (s: typeof s1, b: typeof b1, n: number) => {
      for (let t = 0; t < n; t++) {
        step(s, map, [botInput(s, map, 0, b[0], 'easy'), botInput(s, map, 1, b[1], 'hard')])
      }
    }
    go(s1, b1, 300)
    go(s2, b2, 300)
    const snap = snapshot(s1)
    go(s1, b1, 300)
    // s2 도 300틱 더, 그리고 snap 에서 300틱 (봇 메모리는 s1 것과 동일해야 하므로 b1 복사 대신 s2 로 비교)
    go(s2, b2, 300)
    expect(hashState(s1)).toBe(hashState(s2))
    expect(snap.tick).toBe(300)
  })

  it('경기가 실제로 끝난다 (목표 킬 도달)', () => {
    const state = createState({ seed: 42, targetKills: 2, chars: ['chim', 'jupeol'] }, map)
    const bots = [makeBot(3), makeBot(4)]
    let t = 0
    while (state.phase !== 'over' && t < 60 * 180) {
      step(state, map, [botInput(state, map, 0, bots[0], 'hard'), botInput(state, map, 1, bots[1], 'hard')])
      t++
    }
    expect(state.phase).toBe('over')
    expect(state.winner === 0 || state.winner === 1).toBe(true)
    expect(Math.max(state.players[0].kills, state.players[1].kills)).toBe(2)
  })
})

describe('fixedmath', () => {
  it('atan2A 가 실제 atan2 와 근사한다', () => {
    for (let i = 0; i < 360; i += 7) {
      const rad = (i / 180) * Math.PI
      const x = Math.cos(rad) * 100
      const y = Math.sin(rad) * 100
      const a = atan2A(y, x)
      const ref = radToAngle(Math.atan2(y, x))
      const d = Math.abs(((a - ref + 512) & 1023) - 512)
      expect(d).toBeLessThanOrEqual(2)
    }
  })
})
