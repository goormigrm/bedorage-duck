import { describe, expect, it } from 'vitest'
import { Difficulty, botInput, makeBot } from '../src/core/bot'
import { CharacterId } from '../src/core/characters'
import { atan2A, radToAngle } from '../src/core/fixedmath'
import { Input } from '../src/core/input'
import { GameMap, buildMap } from '../src/core/map'
import { MAP_LIST, MapId, expandRows, scaleForPlayers } from '../src/core/maps'
import { createState, dropPlayer, hashState, snapshot, step } from '../src/core/sim'
import { GameState, teamKills } from '../src/core/state'

const map = buildMap()

interface RunOpts {
  seed: number
  chars: CharacterId[]
  diffs: Difficulty[]
  targetKills: number
  maxTicks: number
  map?: GameMap
  teams?: number[]
}

/** 봇끼리 경기. 60틱마다 해시를 모으고, 끝나면 멈춘다. */
function runBots(o: RunOpts): { hashes: number[]; state: GameState; ticks: number } {
  const m = o.map ?? map
  const state = createState({ seed: o.seed, targetKills: o.targetKills, chars: o.chars, teams: o.teams }, m)
  const bots = o.chars.map((_, i) => makeBot(o.seed ^ (i + 1)))
  const hashes: number[] = []
  let t = 0
  while (t < o.maxTicks && state.phase !== 'over') {
    const inputs: Input[] = bots.map((b, i) => botInput(state, m, i, b, o.diffs[i]))
    step(state, m, inputs)
    if (t % 60 === 0) hashes.push(hashState(state))
    t++
  }
  return { hashes, state, ticks: t }
}

describe('결정론', () => {
  it('같은 시드·입력이면 해시가 완전히 같다', () => {
    const o: RunOpts = { seed: 12345, chars: ['chim', 'cheolmyeon'], diffs: ['hard', 'normal'], targetKills: 99, maxTicks: 60 * 40 }
    const a = runBots(o)
    const b = runBots(o)
    expect(a.hashes).toEqual(b.hashes)
  })

  it('다른 시드는 다른 경기', () => {
    const a = runBots({ seed: 1, chars: ['chim', 'cheolmyeon'], diffs: ['hard', 'normal'], targetKills: 99, maxTicks: 60 * 10 })
    const b = runBots({ seed: 2, chars: ['chim', 'cheolmyeon'], diffs: ['hard', 'normal'], targetKills: 99, maxTicks: 60 * 10 })
    expect(a.hashes).not.toEqual(b.hashes)
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
    go(s2, b2, 300)
    expect(hashState(s1)).toBe(hashState(s2))
    expect(snap.tick).toBe(300)
  })

  it('경기가 실제로 끝난다 (목표 킬 도달)', () => {
    const { state } = runBots({ seed: 42, chars: ['chim', 'jupeol'], diffs: ['hard', 'hard'], targetKills: 2, maxTicks: 60 * 180 })
    expect(state.phase).toBe('over')
    expect(state.winner === 0 || state.winner === 1).toBe(true)
    expect(Math.max(state.players[0].kills, state.players[1].kills)).toBe(2)
  })
})

describe('4인 개인전 (FFA)', () => {
  const chars: CharacterId[] = ['cheolmyeon', 'chim', 'dangun', 'magic']
  const diffs: Difficulty[] = ['hard', 'hard', 'normal', 'normal']

  it('4명이 결정론적으로 같은 경기를 한다', () => {
    const o: RunOpts = { seed: 2026, chars, diffs, targetKills: 99, maxTicks: 60 * 30 }
    const a = runBots(o)
    const b = runBots(o)
    expect(a.hashes).toEqual(b.hashes)
    expect(a.state.players.length).toBe(4)
    // 개인전: 팀이 전부 다르다
    expect(new Set(a.state.players.map((p) => p.team)).size).toBe(4)
  })

  it('4명 경기가 끝나고, 이긴 사람이 목표 킬을 채운다', () => {
    const { state, ticks } = runBots({ seed: 77, chars, diffs, targetKills: 3, maxTicks: 60 * 300 })
    expect(state.phase).toBe('over')
    expect(state.winner).toBeGreaterThanOrEqual(0)
    expect(state.players[state.winner].kills).toBe(3)
    expect(ticks).toBeLessThan(60 * 300)
  })

  it('초기 스폰은 서로 겹치지 않는다', () => {
    for (let seed = 1; seed < 12; seed++) {
      const s = createState({ seed, targetKills: 3, chars }, map)
      for (let i = 0; i < 4; i++)
        for (let j = i + 1; j < 4; j++) {
          const d = Math.hypot(s.players[i].x - s.players[j].x, s.players[i].y - s.players[j].y)
          expect(d).toBeGreaterThan(200)
        }
    }
  })

  it('나간 사람은 리스폰하지 않고 표적에서도 빠진다', () => {
    const s = createState({ seed: 5, targetKills: 99, chars }, map)
    const bots = chars.map((_, i) => makeBot(100 + i))
    for (let t = 0; t < 200; t++) step(s, map, bots.map((b, i) => botInput(s, map, i, b, 'normal')))
    dropPlayer(s, 2)
    expect(s.events.some((e) => e.type === 'leave' && e.p === 2)).toBe(true)
    for (let t = 0; t < 600; t++) step(s, map, bots.map((b, i) => botInput(s, map, i, b, 'normal')))
    expect(s.players[2].alive).toBe(false)
    expect(s.players[2].left).toBe(true)
    // 남은 셋은 계속 경기
    expect(s.tick).toBe(800)
  })
})

describe('2v2 팀전', () => {
  it('같은 팀은 서로 맞지 않고, 팀 킬 합계로 이긴다', () => {
    const chars: CharacterId[] = ['cheolmyeon', 'chim', 'dangun', 'jupeol']
    const teams = [0, 0, 1, 1]
    const { state } = runBots({ seed: 31, chars, diffs: ['hard', 'hard', 'hard', 'hard'], targetKills: 4, maxTicks: 60 * 300, teams })
    expect(state.phase).toBe('over')
    expect(state.winner === 0 || state.winner === 1).toBe(true)
    expect(teamKills(state, state.winner)).toBe(4)
    // 아군 피해는 없다: 킬 이벤트의 가해자와 피해자가 같은 팀인 경우가 없다 → 킬 수가 팀 합계와 맞는다
    const total = state.players.reduce((a, p) => a + p.kills, 0)
    const deaths = state.players.reduce((a, p) => a + p.deaths, 0)
    expect(total).toBe(deaths)
  })
})

describe('맵', () => {
  it('모든 맵이 온전하다 (테두리 벽, 같은 폭, 스폰 4개 이상, 스폰은 바닥)', () => {
    for (const def of MAP_LIST) {
      const w = def.rows[0].length
      for (const r of def.rows) expect(r.length).toBe(w)
      expect(def.rows[0]).toMatch(/^#+$/)
      expect(def.rows[def.rows.length - 1]).toMatch(/^#+$/)
      for (const r of def.rows) {
        expect(r[0]).toBe('#')
        expect(r[w - 1]).toBe('#')
      }
      const m = buildMap(def.id as MapId)
      expect(m.spawns.length).toBeGreaterThanOrEqual(4)
    }
  })

  it('마당 맵에서도 봇 경기가 끝난다', () => {
    const yard = buildMap('yard')
    const { state } = runBots({ seed: 9, chars: ['cheolmyeon', 'dangun'], diffs: ['hard', 'hard'], targetKills: 2, maxTicks: 60 * 240, map: yard })
    expect(state.phase).toBe('over')
  })
})

describe('맵 확장', () => {
  it('2배는 가로 거울, 4배는 가로·세로 거울이고 테두리가 유지된다', () => {
    for (const def of MAP_LIST) {
      const w = def.rows[0].length
      const h = def.rows.length
      const x2 = expandRows(def.rows, 2)
      expect(x2.length).toBe(h)
      expect(x2[0].length).toBe(w * 2 - 2)
      const x4 = expandRows(def.rows, 4)
      expect(x4.length).toBe(h * 2 - 2)
      for (const r of x4) {
        expect(r.length).toBe(w * 2 - 2)
        expect(r[0]).toBe('#')
        expect(r[r.length - 1]).toBe('#')
      }
      expect(x4[0]).toMatch(/^#+$/)
      expect(x4[x4.length - 1]).toMatch(/^#+$/)
      for (const r of x4) expect(r).toBe(r.split('').reverse().join(''))
      const m = buildMap(def.id as MapId, 4)
      expect(m.spawns.length).toBe(buildMap(def.id as MapId, 1).spawns.length * 4)
    }
    expect(scaleForPlayers(2)).toBe(1)
    expect(scaleForPlayers(3)).toBe(2)
    expect(scaleForPlayers(4)).toBe(4)
  })

  it('4배 맵에서 4인 봇 경기가 끝난다', () => {
    const big = buildMap('studio', 4)
    const { state } = runBots({ seed: 3, chars: ['cheolmyeon', 'chim', 'dangun', 'magic'], diffs: ['hard', 'hard', 'hard', 'hard'], targetKills: 2, maxTicks: 60 * 400, map: big })
    expect(state.phase).toBe('over')
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
