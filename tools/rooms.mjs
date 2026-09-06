// 방 지키기 — 배포된 사이트에 사람처럼 보이는 방을 여러 개 열어 두고, 누가 들어와 준비를 누르면 바로 판이 시작되게 한다.
// 방장 자리는 `?autopilot=1` 로 보통 난이도 봇이 움직이고, 빈 자리는 대기실의 "봇으로 채우기" 로 채운다.
//
//   node tools/rooms.mjs            # 켜기 (Ctrl+C 로 끄기)  ← tools/rooms.cmd 를 더블클릭해도 된다 (창을 닫으면 꺼진다)
//   ROOMS_URL=http://localhost:5173/bedorage-duck/ node tools/rooms.mjs   # 개발 서버로 시험
//   ROOMS_SHOW=1 node tools/rooms.mjs                                     # 창을 보이게 (기본은 숨김)
//   ROOMS_LIMIT=1 node tools/rooms.mjs                                    # 앞에서 N개만
//   ROOMS_TAG=시험 node tools/rooms.mjs                                    # 닉네임 뒤에 붙임 (개발 서버 시험 때 배포 방과 구분)
//
// 필요: npm i -D playwright (설치됨) + 이 PC 의 크롬. 크롬이 없으면 npx playwright install chromium.
// 방 하나 = 크롬 컨텍스트 하나. 판이 끝나면 8초 뒤 "다시 하기", 혼자 남아 방이 닫히면 로비에서 방을 다시 만든다.
//
// 기록: 화면에 찍는 줄을 tools/rooms.log 에도 남긴다(로컬, git 제외 — 나중에 메모장으로 열어 본다).
//   누가(닉네임·캐릭터) 언제 들어와 몇 분 했는지, 캐릭터를 바꿨는지, 판 결과(킬/데스),
//   "상대 입력 대기 중"(0.4초 넘는 멈춤)이 몇 번·몇 초 있었는지.

import { chromium } from 'playwright'
import { appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const URL = (process.env.ROOMS_URL || 'https://goormigrm.github.io/bedorage-duck/').replace(/\?.*$/, '') + '?autopilot=1'
const SHOW = process.env.ROOMS_SHOW === '1'
/** ROOMS_LIMIT=2 처럼 주면 앞에서 그만큼만 연다 (시험용) */
const LIMIT = Number(process.env.ROOMS_LIMIT || 0) || 0
const LOG_FILE = join(dirname(fileURLToPath(import.meta.url)), 'rooms.log')
/** ROOMS_TAG=시험 처럼 주면 닉네임 뒤에 붙는다 (배포 사이트의 방과 구분하려고 — 로비 방송은 개발 서버와 배포가 섞인다) */
const TAG = process.env.ROOMS_TAG || ''

/**
 * 방 목록. 닉네임은 8자까지. 캐릭터·모드·맵·목표 킬은 방을 열 때마다 **무작위**로 고른다(2026-09-06 사용자: 항상 다르게, 킬은 10 이하).
 * 고정하고 싶으면 char / mode / map / kills 를 적는다. 캐릭터 id 는 characters.ts (cheolmyeon chim dangun magic jupeol uwon giyeol pungwol oknyang tongdak juwoojae seungwoo)
 */
// 기본 2개 (크롬 하나에 CPU 가 꽤 든다 — 2026-09-06 사용자). 더 열고 싶으면 아래 주석을 풀거나 줄을 더한다
const ROOMS = [
  { nick: '구름이구름', size: 4, bots: true, diff: 'normal' },
  { nick: '구르미소미', size: 4, bots: true, diff: 'normal' },
  // { nick: '구르미구름', size: 2, bots: false, diff: 'normal' },
  // { nick: '구름소미', size: 3, bots: true, diff: 'normal' },
  // { nick: '소미구르미', size: 4, bots: true, diff: 'normal' },
]
const MAP_IDS = ['studio', 'yard', 'garage']
const MAP_NAME = { studio: '스튜디오', yard: '마당', garage: '주차장' }
/** 목표 킬 후보 — 10킬 이하 (KILL_OPTIONS 는 5 단위) */
const KILLS = [5, 10]
/** 지금 열려 있는 방들의 선택 (닉네임 → { char, mode, map }) — 방끼리 겹치지 않게 */
const current = new Map()

const CHAR_NAME = {
  cheolmyeon: '철면덕', chim: '침착덕', dangun: '단군덕', magic: '매직덕', jupeol: '주펄덕', uwon: '우원덕',
  giyeol: '기열덕', pungwol: '풍월덕', oknyang: '옥냥덕', tongdak: '통천덕', juwoojae: '우재덕', seungwoo: '승빠덕',
}
const cname = (id) => CHAR_NAME[id] || id
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const rnd = (a, b) => a + Math.random() * (b - a)
const stamp = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
const dur = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return s >= 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s}초`
}
/** 화면 + tools/rooms.log 에 한 줄 */
function log(nick, msg) {
  const line = `${stamp()}  [${nick}] ${msg}`
  console.log(line)
  try {
    appendFileSync(LOG_FILE, line + '\n', 'utf8')
  } catch {
    /* 로그 파일을 못 써도 화면에는 나온다 */
  }
}

/** list 에서 하나 고르되 avoid(다른 방이 쓰는 것·이 방의 직전 것)는 되도록 피한다 */
function pick(list, avoid) {
  const free = list.filter((x) => !avoid.includes(x))
  const from = free.length ? free : list
  return from[Math.floor(Math.random() * from.length)]
}

/** 이번에 열 방의 캐릭터·모드·맵·킬을 정한다 — 고정값이 있으면 그대로, 없으면 무작위(다른 방·직전 판과 다르게) */
function pickRoom(r) {
  const prev = current.get(r.nick) || {}
  const others = [...current.entries()].filter(([n]) => n !== r.nick).map(([, v]) => v)
  const avoidChar = [...others.map((o) => o.char), prev.char]
  const avoidMap = [...others.map((o) => o.map), prev.map]
  const avoidMode = [...others.map((o) => o.mode), prev.mode]
  const modes = r.size % 2 === 0 ? ['ffa', 'teams'] : ['ffa'] // 팀전은 짝수 정원만
  const c = {
    char: r.char || pick(Object.keys(CHAR_NAME), avoidChar),
    mode: r.mode || pick(modes, avoidMode),
    map: r.map || pick(MAP_IDS, avoidMap),
    kills: r.kills || pick(KILLS, [prev.kills]),
  }
  current.set(r.nick, c)
  return c
}

/** 로비에서 방을 만들고 준비까지 누른다 */
async function makeRoom(page, r0) {
  const r = { ...r0, ...pickRoom(r0) }
  await page.waitForSelector('#btn-host', { timeout: 60000 })
  await page.evaluate((nick) => {
    const n = document.querySelector('#nick')
    n.value = nick
    n.dispatchEvent(new Event('input', { bubbles: true }))
    n.blur()
  }, r.nick)
  await sleep(rnd(300, 800))
  await page.click(`.char[data-id="${r.char}"]`)
  await page.click('#btn-host')
  await sleep(300)
  await page.click(`#seg-size button[data-v="${r.size}"]`)
  await page.click(`#seg-room-mode button[data-v="${r.mode}"]`)
  await page.selectOption('#kills-room', String(r.kills))
  await page.click(`#seg-map button[data-v="${r.map}"]`)
  await sleep(rnd(400, 900))
  await page.click('#btn-host-go')
  await page.waitForSelector('#btn-ready', { timeout: 60000 })
  // 빈 자리는 봇으로
  if (r.bots) {
    await page.evaluate((diff) => {
      const c = document.querySelector('#chk-bots')
      if (c && !c.checked) {
        c.checked = true
        c.dispatchEvent(new Event('change'))
      }
      const b = document.querySelector(`#seg-botdiff button[data-v="${diff}"]`)
      if (b) b.click()
    }, r.diff)
  }
  await sleep(rnd(500, 1500))
  await ensureReady(page)
  log(r.nick, `방 열림 — ${cname(r.char)} · ${r.size}명 ${r.mode === 'teams' ? '팀전' : '개인전'} ${r.kills}킬 ${MAP_NAME[r.map] || r.map}${r.bots ? ' (빈 자리 봇)' : ''}`)
}

/** 대기실이면 준비가 눌려 있게 (연결이 늦어 비활성이면 다음 순회에서) */
async function ensureReady(page) {
  return page.evaluate(() => {
    const b = document.querySelector('#btn-ready')
    if (!b || b.disabled) return false
    if (b.textContent.trim() === '준비') {
      b.click()
      return true
    }
    return false
  })
}

/**
 * 지금 화면이 무엇인지: lobby(방 없음) · room(대기실) · game(판 진행) · over(결과) · unknown.
 * others = 판에 남은 사람(봇·나 제외). 판이면 snap(자리별 닉네임·캐릭터·봇 여부·킬·끊김)도 준다 — 기록용.
 * 세션이 끝나면 window.__bd 가 옛 값으로 남으므로 .game-root 가 있을 때만 판으로 본다.
 */
async function where(page) {
  return page.evaluate(() => {
    if (document.querySelector('#btn-ready')) return { st: 'room', others: 0 }
    if (document.querySelector('#btn-host')) return { st: 'lobby', others: 0 }
    const bd = window.__bd
    if (!bd || typeof bd.phase !== 'function' || !document.querySelector('.game-root')) return { st: 'unknown', others: 0 }
    const s = bd.state()
    const names = typeof bd.names === 'function' ? bd.names() : []
    const bots = typeof bd.bots === 'function' ? bd.bots() : []
    return {
      st: s.phase === 'over' ? 'over' : 'game',
      others: typeof bd.others === 'function' ? bd.others() : 1,
      snap: {
        stalls: typeof bd.stalls === 'function' ? bd.stalls() : { count: 0, ms: 0, now: 0 },
        players: s.players.map((p, i) => ({
          i, name: names[i] || '', char: p.char, left: !!p.left, vacant: !!p.vacant, kills: p.kills, deaths: p.deaths, bot: !!bots[i],
        })),
      },
    }
  })
}

/** 결과·안내 창의 버튼을 누른다 */
async function clickOverlay(page, label) {
  return page.evaluate((label) => {
    const ov = document.querySelector('#overlay')
    if (!ov || ov.hidden) return false
    const b = [...ov.querySelectorAll('button')].find((x) => x.textContent.trim() === label)
    if (!b) return false
    b.click()
    return true
  }, label)
}

/** 판 하나의 사람 출입·캐릭터 교체·끊김을 기록한다 (0번 자리는 나, 봇 자리는 건너뜀) */
function makeTracker(nick) {
  const seen = new Map() // 자리 → { name, char, since, chars, kills, deaths }
  let stallCount = 0
  let stallMs = 0
  let overLogged = false
  const bye = (i, p, why) => {
    const s = seen.get(i)
    if (!s) return
    const chars = s.chars.map(cname).join('→')
    const k = p ? p.kills : s.kills
    const d = p ? p.deaths : s.deaths
    log(nick, `퇴장 ${s.name}(${chars}) — ${dur(Date.now() - s.since)} 플레이, ${k}킬 ${d}데스${why ? ' · ' + why : ''}`)
    seen.delete(i)
  }
  return {
    update(snap) {
      for (const p of snap.players) {
        if (p.i === 0 || p.bot) continue
        const here = !p.vacant && !p.left
        const s = seen.get(p.i)
        if (here && !s) {
          seen.set(p.i, { name: p.name, char: p.char, since: Date.now(), chars: [p.char], kills: p.kills, deaths: p.deaths })
          log(nick, `입장 ${p.name}(${cname(p.char)}) — ${p.i + 1}번 자리`)
        } else if (here && s) {
          if (s.name !== p.name && p.name) {
            // 같은 자리에 다른 사람이 난입 (전 사람은 left 를 못 본 채 바뀐 경우)
            bye(p.i, null, '자리 바뀜')
            seen.set(p.i, { name: p.name, char: p.char, since: Date.now(), chars: [p.char], kills: p.kills, deaths: p.deaths })
            log(nick, `입장 ${p.name}(${cname(p.char)}) — ${p.i + 1}번 자리 (난입)`)
            continue
          }
          if (s.char !== p.char) {
            log(nick, `${s.name} 캐릭터 교체 ${cname(s.char)} → ${cname(p.char)}`)
            s.char = p.char
            s.chars.push(p.char)
          }
          s.kills = p.kills
          s.deaths = p.deaths
        } else if (!here && s) bye(p.i, p, '나감')
      }
      const st = snap.stalls
      if (st.count > stallCount) {
        log(nick, `끊김 ${st.count - stallCount}회 (상대 입력 대기, 이번 판 누적 ${dur(st.ms)})`)
        stallCount = st.count
        stallMs = st.ms
      }
    },
    /** 결과 화면: 한 판 요약 한 줄 (한 번만) */
    over(snap) {
      if (overLogged) return
      overLogged = true
      const line = snap.players
        .filter((p) => !p.vacant)
        .map((p) => `${p.name || cname(p.char)}${p.bot ? '(봇)' : p.i === 0 ? '(방장)' : ''} ${p.kills}킬/${p.deaths}데스`)
        .join(' · ')
      log(nick, `결과 — ${line}${stallCount ? ` · 끊김 ${stallCount}회 ${dur(stallMs)}` : ' · 끊김 없음'}`)
    },
    /** 판을 떠날 때(로비로·다시 하기) 남아 있던 사람은 전부 퇴장 처리 */
    flush(why) {
      for (const i of [...seen.keys()]) bye(i, null, why)
    },
    reset() {
      seen.clear()
      stallCount = 0
      stallMs = 0
      overLogged = false
    },
  }
}

async function runRoom(browser, r) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'ko-KR' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => log(r.nick, `페이지 오류: ${e.message}`))
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  const track = makeTracker(r.nick)
  let overSince = 0
  let lastState = ''
  let gameSince = 0
  for (;;) {
    try {
      const w = await where(page)
      const { st, others } = w
      if (st !== lastState) {
        if (st === 'game' && lastState !== 'over') {
          gameSince = Date.now()
          track.reset()
          log(r.nick, '판 시작')
        }
        if (st === 'over') log(r.nick, `판 끝 — ${dur(Date.now() - gameSince)} 진행, 남은 사람 ${others}`)
        if ((st === 'lobby' || st === 'room' || st === 'unknown') && (lastState === 'game' || lastState === 'over')) track.flush('판 종료')
        lastState = st
      }
      if (w.snap) track.update(w.snap)
      if (st === 'lobby') {
        await sleep(rnd(1500, 4000))
        await makeRoom(page, r)
      } else if (st === 'room') {
        if (await ensureReady(page)) log(r.nick, '준비')
      } else if (st === 'over') {
        if (w.snap) track.over(w.snap)
        if (!overSince) overSince = Date.now()
        if (Date.now() - overSince > 8000) {
          // 사람이 남아 있으면 다시 하기, 다 나갔으면 로비로 가서 방을 새로 연다(새 방이 "참가 가능" 으로 보인다)
          if (others > 0) {
            if (await clickOverlay(page, '다시 하기')) {
              log(r.nick, '다시 하기')
              track.flush('다시 하기')
              track.reset()
              gameSince = Date.now()
            }
          } else if (await clickOverlay(page, '로비로')) log(r.nick, '다 나가서 로비로')
          overSince = 0
        }
      } else if (st === 'game') {
        overSince = 0
        // 혼자 30초 → "아무도 들어오지 않았습니다 / 방을 닫습니다" 창은 스스로 닫히지 않는다 → 로비로
        if (others === 0 && (await clickOverlay(page, '로비로'))) log(r.nick, '혼자 남아 방을 닫음 → 다시 연다')
      } else {
        overSince = 0
      }
      if (st === 'unknown') {
        // 페이지가 이상하면 다시 연다
        await page.goto(URL, { waitUntil: 'domcontentloaded' })
      }
    } catch (e) {
      log(r.nick, `오류: ${String(e.message || e).slice(0, 120)} — 다시 연다`)
      try {
        await page.goto(URL, { waitUntil: 'domcontentloaded' })
      } catch {
        /* 다음 순회에서 다시 */
      }
    }
    await sleep(3000)
  }
}

async function main() {
  const n = LIMIT ? Math.min(LIMIT, ROOMS.length) : ROOMS.length
  console.log(`방 지키기 시작 — ${URL}\n방 ${n}개. Ctrl+C 로 끕니다. 기록: ${LOG_FILE}\n`)
  let browser
  try {
    browser = await chromium.launch({
      channel: 'chrome',
      headless: !SHOW,
      args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--use-gl=angle', '--use-angle=swiftshader'],
    })
  } catch (e) {
    console.log('크롬을 못 찾았습니다 → 내장 크로미움으로 (없으면: npx playwright install chromium)')
    browser = await chromium.launch({ headless: !SHOW, args: ['--mute-audio', '--use-gl=angle', '--use-angle=swiftshader'] })
  }
  log('방 지키기', `켬 — 방 ${n}개, ${URL}`)
  const stop = async () => {
    console.log('\n끄는 중… (방이 닫힙니다)')
    log('방 지키기', '끔')
    await browser.close().catch(() => {})
    process.exit(0)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  // 방을 한꺼번에 열면 릴레이에 몰리므로 몇 초씩 띄운다
  for (const r of LIMIT ? ROOMS.slice(0, LIMIT) : ROOMS) {
    runRoom(browser, TAG ? { ...r, nick: (r.nick + TAG).slice(0, 8) } : r)
    await sleep(rnd(4000, 8000))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
