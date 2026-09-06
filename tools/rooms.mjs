// 방 지키기 — 배포된 사이트에 사람처럼 보이는 방을 여러 개 열어 두고, 누가 들어와 준비를 누르면 바로 판이 시작되게 한다.
// 방장 자리는 `?autopilot=1` 로 보통 난이도 봇이 움직이고, 빈 자리는 대기실의 "봇으로 채우기" 로 채운다.
//
//   node tools/rooms.mjs            # 켜기 (Ctrl+C 로 끄기)  ← tools/rooms.cmd 를 더블클릭해도 된다 (창을 닫으면 꺼진다)
//   ROOMS_URL=http://localhost:5173/bedorage-duck/ node tools/rooms.mjs   # 개발 서버로 시험
//   ROOMS_SHOW=1 node tools/rooms.mjs                                     # 창을 보이게 (기본은 숨김)
//
// 필요: npm i -D playwright (설치됨) + 이 PC 의 크롬. 크롬이 없으면 npx playwright install chromium.
// 방 하나 = 크롬 컨텍스트 하나. 판이 끝나면 8초 뒤 "다시 하기", 혼자 남아 방이 닫히면 로비에서 방을 다시 만든다.

import { chromium } from 'playwright'

const URL = (process.env.ROOMS_URL || 'https://goormigrm.github.io/bedorage-duck/').replace(/\?.*$/, '') + '?autopilot=1'
const SHOW = process.env.ROOMS_SHOW === '1'
/** ROOMS_LIMIT=2 처럼 주면 앞에서 그만큼만 연다 (시험용) */
const LIMIT = Number(process.env.ROOMS_LIMIT || 0) || 0

/** 방 목록. 닉네임은 8자까지. 캐릭터 id 는 characters.ts (cheolmyeon chim dangun magic jupeol uwon giyeol pungwol oknyang tongdak juwoojae seungwoo) */
// 기본 2개 (크롬 하나에 CPU 가 꽤 든다 — 2026-09-06 사용자). 더 열고 싶으면 아래 주석을 풀거나 줄을 더한다
const ROOMS = [
  { nick: '구름이구름', char: 'chim', size: 4, mode: 'ffa', kills: 5, map: 'studio', bots: true, diff: 'normal' },
  { nick: '구르미소미', char: 'pungwol', size: 4, mode: 'teams', kills: 10, map: 'garage', bots: true, diff: 'normal' },
  // { nick: '구르미구름', char: 'uwon', size: 2, mode: 'ffa', kills: 5, map: 'yard', bots: false, diff: 'normal' },
  // { nick: '구름소미', char: 'dangun', size: 3, mode: 'ffa', kills: 10, map: 'yard', bots: true, diff: 'normal' },
  // { nick: '소미구르미', char: 'giyeol', size: 4, mode: 'ffa', kills: 15, map: 'studio', bots: true, diff: 'normal' },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const rnd = (a, b) => a + Math.random() * (b - a)
const log = (nick, msg) => console.log(`${new Date().toLocaleTimeString('ko-KR', { hour12: false })}  [${nick}] ${msg}`)

/** 로비에서 방을 만들고 준비까지 누른다 */
async function makeRoom(page, r) {
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
  log(r.nick, `방 열림 — ${r.size}명 ${r.mode} ${r.kills}킬 ${r.map}${r.bots ? ' (빈 자리 봇)' : ''}`)
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

/** 지금 화면이 무엇인지: lobby(방 없음) · room(대기실) · game(판 진행) · over(결과) · unknown. others = 판에 남은 사람(봇·나 제외) */
async function where(page) {
  return page.evaluate(() => {
    if (document.querySelector('#btn-ready')) return { st: 'room', others: 0 }
    if (document.querySelector('#btn-host')) return { st: 'lobby', others: 0 }
    const bd = window.__bd
    if (bd && typeof bd.phase === 'function') return { st: bd.phase() === 'over' ? 'over' : 'game', others: typeof bd.others === 'function' ? bd.others() : 1 }
    return { st: 'unknown', others: 0 }
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

async function runRoom(browser, r) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'ko-KR' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => log(r.nick, `페이지 오류: ${e.message}`))
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  let overSince = 0
  let lastState = ''
  for (;;) {
    try {
      const { st, others } = await where(page)
      if (st !== lastState) {
        if (st === 'game') log(r.nick, '판 시작')
        if (st === 'over') log(r.nick, `판 끝 (남은 사람 ${others})`)
        lastState = st
      }
      if (st === 'lobby') {
        await sleep(rnd(1500, 4000))
        await makeRoom(page, r)
      } else if (st === 'room') {
        if (await ensureReady(page)) log(r.nick, '준비')
      } else if (st === 'over') {
        if (!overSince) overSince = Date.now()
        if (Date.now() - overSince > 8000) {
          // 사람이 남아 있으면 다시 하기, 다 나갔으면 로비로 가서 방을 새로 연다(새 방이 "참가 가능" 으로 보인다)
          if (others > 0) {
            if (await clickOverlay(page, '다시 하기')) log(r.nick, '다시 하기')
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
  console.log(`방 지키기 시작 — ${URL}\n방 ${ROOMS.length}개. Ctrl+C 로 끕니다.\n`)
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
  const stop = async () => {
    console.log('\n끄는 중… (방이 닫힙니다)')
    await browser.close().catch(() => {})
    process.exit(0)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  // 방을 한꺼번에 열면 릴레이에 몰리므로 몇 초씩 띄운다
  for (const r of LIMIT ? ROOMS.slice(0, LIMIT) : ROOMS) {
    runRoom(browser, r)
    await sleep(rnd(4000, 8000))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
