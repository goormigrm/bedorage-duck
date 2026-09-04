// 전적 기록: 서버 없이 각자 브라우저에 남기는 결과의 정렬·표시·공유글 형식.

import { describe, expect, it } from 'vitest'
import { MatchRecord, formatRecord, ranked, recordDate, winnerLabel } from '../src/game/records'
import { CHARACTER_LIST } from '../src/core/characters'

function rec(over: Partial<MatchRecord> = {}): MatchRecord {
  return {
    at: Date.UTC(2026, 8, 4, 6, 30),
    mode: 'p2p',
    teams: false,
    map: 'studio',
    target: 10,
    winner: 0,
    me: 1,
    players: [
      { nick: '구르미', char: 'cheolmyeon', kills: 10, deaths: 6, team: 0, left: false },
      { nick: '두부', char: 'magic', kills: 7, deaths: 9, team: 1, left: false },
      { nick: '철수', char: 'oknyang', kills: 7, deaths: 4, team: 2, left: false },
      { nick: '영희', char: 'juwoojae', kills: 3, deaths: 2, team: 3, left: true },
    ],
    ...over,
  }
}

describe('전적 기록', () => {
  it('킬 많은 순, 동률이면 덜 죽은 쪽이 위다', () => {
    const order = ranked(rec()).map((p) => p.nick)
    expect(order).toEqual(['구르미', '철수', '두부', '영희'])
  })

  it('개인전 승자는 사람 이름, 팀전 승자는 팀 이름으로 적는다', () => {
    expect(winnerLabel(rec())).toBe('구르미 승리')
    expect(winnerLabel(rec({ teams: true, winner: 1 }))).toContain('승리')
    expect(winnerLabel(rec({ teams: true, winner: 1 }))).not.toContain('구르미')
  })

  it('공유글에 닉네임·전적·중도 퇴장이 모두 들어간다', () => {
    const text = formatRecord(rec())
    expect(text).toContain('구르미')
    expect(text).toContain('10킬 6데스')
    expect(text).toContain('중도 퇴장')
    expect(text).toContain('스튜디오')
    expect(text).toContain('목표 10킬')
    // 1등이 맨 위
    const lines = text.split('\n')
    expect(lines[2]).toContain('구르미')
  })

  it('원본 배열을 건드리지 않는다', () => {
    const r = rec()
    ranked(r)
    expect(r.players[0].nick).toBe('구르미')
  })

  it('날짜는 사람이 읽는 형식이다', () => {
    expect(recordDate(Date.UTC(2026, 8, 4))).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })

  it('기록에 남기는 캐릭터 id 는 실제 캐릭터다', () => {
    const ids = new Set(CHARACTER_LIST.map((c) => c.id))
    for (const p of rec().players) expect(ids.has(p.char)).toBe(true)
  })
})
