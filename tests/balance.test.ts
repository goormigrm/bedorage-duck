// 밸런스 회귀 방지. 봇끼리 1:1 전 조합을 한 번 돌려 '한쪽으로 크게 기울지 않는지'만 본다.
// 세밀한 수치는 `npx vite-node tools/balance.ts` 로 본다 (표본이 4배 크다).

import { describe, expect, it } from 'vitest'
import { botInput, makeBot } from '../src/core/bot'
import { CHARACTERS, CHARACTER_LIST, CharacterId } from '../src/core/characters'
import { Input } from '../src/core/input'
import { buildMap } from '../src/core/map'
import { createState, step } from '../src/core/sim'
import { WEAPONS, WeaponId } from '../src/core/weapons'

const TARGET_KILLS = 2
const MAX_TICKS = 60 * 150

interface Stat {
  matches: number
  wins: number
}

function play(chars: CharacterId[], seed: number, wins: Map<CharacterId, Stat>, hits: Map<WeaponId, number>): void {
  const map = buildMap('studio', 1, seed * 7919)
  const state = createState({ seed, targetKills: TARGET_KILLS, chars }, map)
  const bots = chars.map((_, i) => makeBot(seed ^ (i * 131 + 7)))
  let t = 0
  while (t < MAX_TICKS && state.phase !== 'over') {
    const inputs: Input[] = bots.map((b, i) => botInput(state, map, i, b, 'hard'))
    step(state, map, inputs)
    for (const e of state.events) {
      if (e.type === 'hit') {
        const w = state.players[e.by].weapon
        hits.set(w, (hits.get(w) ?? 0) + 1)
      }
    }
    t++
  }
  chars.forEach((c, i) => {
    const s = wins.get(c) ?? { matches: 0, wins: 0 }
    s.matches++
    if (state.winner === i) s.wins++
    wins.set(c, s)
  })
}

describe('밸런스', () => {
  it('1:1 전 조합에서 어느 캐릭터도 압도하거나 무력하지 않다', () => {
    const ids = CHARACTER_LIST.map((c) => c.id)
    const wins = new Map<CharacterId, Stat>()
    const hits = new Map<WeaponId, number>()
    for (let a = 0; a < ids.length; a++) {
      for (let b = a + 1; b < ids.length; b++) {
        play([ids[a], ids[b]], 11, wins, hits)
        play([ids[b], ids[a]], 12, wins, hits)
      }
    }
    const rows = [...wins.entries()].map(([id, s]) => ({ id, rate: s.wins / s.matches, matches: s.matches }))
    const summary = rows
      .sort((x, y) => y.rate - x.rate)
      .map((r) => `${CHARACTERS[r.id].name} ${(r.rate * 100).toFixed(0)}%`)
      .join(' · ')
    // eslint-disable-next-line no-console
    console.log(`[balance] ${summary}`)
    for (const r of rows) {
      expect(r.matches).toBe((ids.length - 1) * 2)
      expect(r.rate, `${CHARACTERS[r.id].name} 승률`).toBeGreaterThan(0.2)
      expect(r.rate, `${CHARACTERS[r.id].name} 승률`).toBeLessThan(0.8)
    }
    // 모든 무기가 실제로 쓸모가 있다 (후라이팬처럼 접근 자체가 불가능한 상태 방지)
    for (const w of Object.values(WEAPONS)) {
      expect(hits.get(w.id) ?? 0, `${w.name} 명중 수`).toBeGreaterThan(30)
    }
  })
})
