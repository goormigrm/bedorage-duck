// 전적 기록. **서버도 DB도 쓰지 않는다.**
// 시뮬레이션이 결정적이라 같은 방의 네 사람은 끝난 순간 완전히 같은 결과를 들고 있다.
// 그래서 각자 브라우저(localStorage)에 같은 내용을 적어 두면, 서버 없이도
// "그때 그 판이 어땠는지"를 모두가 똑같이 확인할 수 있다.
// 다만 저장소가 각자의 브라우저이므로 순위표처럼 남의 기록까지 모이지는 않는다.
// 남에게 보여 줄 때는 formatRecord() 로 만든 글을 붙여 넣는다.

import { CharacterId } from '../core/characters'
import { MAPS, MapId } from '../core/maps'
import { TEAM_NAMES } from '../render/hud'

const KEY = 'bd.records.v1'
/** 브라우저에 남기는 최대 판 수 (오래된 것부터 버린다) */
const LIMIT = 50

export interface RecordPlayer {
  nick: string
  char: CharacterId
  kills: number
  deaths: number
  team: number
  /** 도중에 나갔는가 */
  left: boolean
}

export interface MatchRecord {
  /** 끝난 시각 (epoch ms) */
  at: number
  mode: 'solo' | 'p2p'
  teams: boolean
  map: MapId
  target: number
  /** 이긴 팀 번호 (개인전이면 이긴 사람의 인덱스) */
  winner: number
  /** 이 브라우저 주인의 인덱스 */
  me: number
  players: RecordPlayer[]
}

export function loadRecords(): MatchRecord[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as MatchRecord[]
    return Array.isArray(list) ? list.filter((r) => r && Array.isArray(r.players)) : []
  } catch {
    return []
  }
}

/** 새 판을 맨 앞에 넣고 저장한다. 저장이 막힌 브라우저면 조용히 넘어간다 */
export function saveRecord(rec: MatchRecord): void {
  try {
    const list = [rec, ...loadRecords()].slice(0, LIMIT)
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* 시크릿 모드 등 — 기록만 안 남고 게임은 그대로 */
  }
}

export function clearRecords(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* 무시 */
  }
}

export function recordDate(at: number): string {
  const d = new Date(at)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 이긴 쪽 표시 (개인전이면 사람 이름, 팀전이면 팀 이름) */
export function winnerLabel(r: MatchRecord): string {
  if (r.teams) return `${TEAM_NAMES[r.winner] ?? '?'} 승리`
  // 개인전에서는 팀 번호가 곧 플레이어 인덱스다
  return `${r.players[r.winner]?.nick ?? '?'} 승리`
}

/** 킬 많은 순 정렬 (동률이면 죽은 횟수가 적은 쪽) */
export function ranked(r: MatchRecord): RecordPlayer[] {
  return [...r.players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
}

/**
 * 게시판·채팅에 붙여 넣을 한 판 요약.
 * 서버가 없으니 이 글이 곧 "기록을 남에게 보여 주는 방법"이다.
 */
export function formatRecord(r: MatchRecord): string {
  const head = `🦆 배도라지 덕 · ${recordDate(r.at)}`
  const kind = `${r.mode === 'solo' ? '혼자 하기' : '방 대전'} · ${r.teams ? '2v2 팀전' : '개인전'} · ${MAPS[r.map]?.name ?? r.map} · 목표 ${r.target}킬`
  const lines = ranked(r).map((p, i) => {
    const mark = i === 0 ? '🏆' : `${i + 1}.`
    const team = r.teams ? ` [${TEAM_NAMES[p.team] ?? p.team}]` : ''
    const out = p.left ? ' (중도 퇴장)' : ''
    return `${mark} ${p.nick}${team} — ${p.kills}킬 ${p.deaths}데스${out}`
  })
  return [head, kind, ...lines, 'https://goormigrm.github.io/bedorage-duck/'].join('\n')
}
