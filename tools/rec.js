// 공지용 스크린샷·GIF 녹화 도우미 (개발 서버 전용, 배포물에 안 들어간다).
//
// 쓰는 법: 개발 서버에서 `?shot=1` 을 붙여 연 뒤(캔버스 버퍼 보존 + window.__session 노출) 콘솔에서
//   const s = document.createElement('script'); s.src = '/bedorage-duck/tools/rec.js'; document.head.appendChild(s)
// 그러면 window.__rec / __drv / __h 가 생긴다.
//   __h.solo({ char: 'oknyang', diff: 'easy', bots: 1, kills: 5, map: 'garage' })   // 로비에서 혼자 하기 시작
//   __rec.start('scope', 12, 8)  → (장면 연출) → await __rec.stop()                 // .frames/scope/NNN.png
//   await __rec.still('shot_fight')                                                  // docs/img/shot_fight.jpg
//   python tools/gif.py scope                                                        // docs/img/gif_scope.gif
//
// 캔버스 두 장(gl + hud)만 합친다. DOM(로비·터치 버튼)은 __rec.dom() 으로 html2canvas 를 얹어 찍는다.

;(() => {
  const W = 1280, H = 720

  // ---------- 녹화 ----------
  const rec = (() => {
    let timer = null, frames = [], tag = ''
    const off = document.createElement('canvas'); off.width = W; off.height = H
    function grab() {
      const g = document.querySelector('canvas.gl'), h = document.querySelector('canvas.hud')
      if (!g) return
      // Claude Code 브라우저 패널이 숨겨져 있으면 requestAnimationFrame 이 멈춰 화면이 안 그려진다(시뮬은 워커로 계속 돈다).
      // 그래서 프레임을 직접 한 번 그리고 찍는다. 예약된 rAF 는 취소해 두 번 돌지 않게 한다
      const S = window.__session
      if (S && S.frame) { cancelAnimationFrame(S.raf); S.frame(performance.now()) }
      const c = off.getContext('2d')
      c.drawImage(g, 0, 0, W, H)
      if (h) c.drawImage(h, 0, 0, W, H)
      frames.push(off.toDataURL('image/png'))
    }
    async function post(name, data, dir) {
      const r = await fetch('/__shot', { method: 'POST', body: JSON.stringify({ name, data, dir }) })
      return r.text()
    }
    const api = {
      /** fps 로 seconds 동안(또는 stop 까지) 프레임을 모은다 */
      start(name, fps = 12, seconds = 8, append = false) {
        tag = name; if (!append) frames = []
        const limit = frames.length + fps * seconds
        timer = setInterval(() => {
          grab()
          if (frames.length >= limit) { clearInterval(timer); timer = null }
        }, 1000 / fps)
      },
      grabOne() { grab() },
      /** DOM 까지 포함해 한 장(html2canvas). 로비·터치 UI 용. 느리다(0.2~0.5초) */
      async dom(el = document.body, extra = {}) {
        if (!window.html2canvas) {
          await new Promise((ok, no) => { const s = document.createElement('script'); s.onload = ok; s.onerror = no
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'; document.head.appendChild(s) })
        }
        const S = window.__session
        if (S && S.frame) { cancelAnimationFrame(S.raf); S.frame(performance.now()) }
        // 복제 문서에서는 CSS 애니메이션이 처음부터 다시 돌아(0% 키프레임 = 투명) 상자가 안 찍힌다 → 애니메이션을 끈다.
        // 로고의 background-clip: text 는 html2canvas 가 못 그려 금색 글자로 바꾼다
        const onclone = (doc) => {
          doc.querySelectorAll('*').forEach((el) => { el.style.animation = 'none'; el.style.transition = 'none' })
          doc.querySelectorAll('h1 .t1, h1 .t2').forEach((el) => { el.style.background = 'none'; el.style.webkitTextFillColor = '#f2c94c'; el.style.color = '#f2c94c' })
        }
        const cv = await window.html2canvas(el, { backgroundColor: '#0d1117', scale: 1, width: W, height: H, windowWidth: W, windowHeight: H, useCORS: true, logging: false, onclone, ...extra })
        const c = off.getContext('2d'); c.fillStyle = '#0d1117'; c.fillRect(0, 0, W, H); c.drawImage(cv, 0, 0, W, H)
        frames.push(off.toDataURL('image/png'))
      },
      /** 모은 프레임을 .frames/<tag>/ 로 올린다 */
      async stop(name) {
        clearInterval(timer); timer = null
        if (name) tag = name
        const list = frames; frames = []
        for (let i = 0; i < list.length; i++) await post(tag + '/' + String(i).padStart(3, '0'), list[i], 'frames')
        return list.length
      },
      /** 한 장을 docs/img/<name>.jpg 로 */
      async still(name, jpeg = true) {
        grab()
        let data = frames.pop()
        if (jpeg) {
          const im = new Image(); im.src = data; await im.decode()
          const c2 = document.createElement('canvas'); c2.width = W; c2.height = H
          c2.getContext('2d').drawImage(im, 0, 0)
          data = c2.toDataURL('image/jpeg', 0.9)
        }
        return post(name, data)
      },
      /** 마지막 프레임을 n 번 더 넣는다(화면을 잠시 붙잡아 두기) */
      repeatLast(n) { const f = frames[frames.length - 1]; for (let i = 0; i < n; i++) frames.push(f) },
      /**
       * 터치 UI 까지 포함해 녹화(캔버스 + .touch-ui 를 html2canvas 로 얹음). 한 장에 0.1~0.2초 걸려 fps 는 6 정도.
       * gif.py 에 --fps 6 을 준다
       */
      /**
       * 터치 UI(DOM) 까지 포함해 녹화 — 한 장마다 html2canvas 로 body 전체를 찍는다(0.2~0.3초). fps 는 4 정도가 한계라
       * gif.py 에 --fps 4 를 준다. (.touch-ui 만 따로 찍으면 "Unable to find element in cloned iframe" 이 난다)
       */
      async startTouch(name, fps = 4, seconds = 8) {
        tag = name; frames = []
        const t0 = performance.now()
        while (performance.now() - t0 < seconds * 1000) {
          await api.dom()
          const next = t0 + (frames.length * 1000) / fps
          await new Promise((r) => setTimeout(r, Math.max(0, next - performance.now())))
        }
      },
      count() { return frames.length },
      busy() { return timer !== null },
    }
    return api
  })()

  // ---------- 입력 흉내 ----------
  const drv = {
    key(k, down) { window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key: k, bubbles: true })) },
    async hold(k, ms) { this.key(k, true); await this.wait(ms); this.key(k, false) },
    /** 논리 화면 좌표(1280×720)로 마우스를 옮긴다 */
    aim(x, y) {
      const st = document.querySelector('#stage'); if (!st) return
      const r = st.getBoundingClientRect()
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: r.left + (x / W) * r.width, clientY: r.top + (y / H) * r.height }))
    },
    mouse(btn, down) { window.dispatchEvent(new MouseEvent(down ? 'mousedown' : 'mouseup', { button: btn })) },
    async click(btn, ms = 60) { this.mouse(btn, true); await this.wait(ms); this.mouse(btn, false) },
    wait(ms) { return new Promise((r) => setTimeout(r, ms)) },
    releaseAll() { for (const k of ['w', 'a', 's', 'd', ' ', 'Shift']) this.key(k, false); this.mouse(0, false); this.mouse(2, false) },
  }

  // ---------- 장면 연출 ----------
  const GUN_H = 0.95 // renderer3d/world3d 의 GUN_H 와 같아야 한다
  const h = {
    /** true 면 pin 된 상대가 총을 못 쏜다(장면 중간에 켜고 끈다) */
    mute: false,
    S() { return window.__session },
    st() { return this.S().state },
    me() { return this.st().players[this.S().cfg.localPlayer] },
    others() { const lp = this.S().cfg.localPlayer; return this.st().players.filter((p) => p.id !== lp) },
    /**
     * 화면을 한 번 그린다. 패널이 숨겨져 있으면 rAF 가 멈춰 카메라 행렬이 그대로라, 투영(w2s)·방향 판단 전에 꼭 부른다.
     * 25ms 안에 그렸으면 건너뛴다(track 이 30ms 마다 부른다)
     */
    refresh(force = false) {
      const S = this.S()
      if (!S || !S.frame) return
      if (!force && performance.now() - S.last < 25) return
      cancelAnimationFrame(S.raf); S.frame(performance.now())
    },
    /** 픽셀 좌표 → 논리 화면 좌표 (카메라를 먼저 갱신한다). h 는 월드 높이 */
    w2s(px, py, h = 0.6) { this.refresh(); return this.S().renderer.worldToScreen(px / 32, h, py / 32) },
    /** 커서를 그 자리 위에 올린다. screenToWorld 가 총구 높이(GUN_H) 평면을 쓰므로 같은 높이로 투영해야 조준점이 정확히 겹친다 */
    aimAt(px, py) { const s = this.w2s(px, py, GUN_H); drv.aim(s.x, s.y); return s },
    floor(tx, ty) { const m = this.S().map; return tx >= 0 && ty >= 0 && tx < m.w && ty < m.h && m.tiles[ty * m.w + tx] === 0 },
    tile(tx, ty) { const m = this.S().map; return m.tiles[ty * m.w + tx] },
    /** 자리 옮기기 (혼자 하기에서만 — 봇과 나뿐이라 어긋날 상대가 없다) */
    tp(p, tx, ty) { p.x = tx * 32 + 16; p.y = ty * 32 + 16 },
    /** 두 픽셀 좌표 사이가 전부 바닥(0)인지 — 시야·탄도가 막히지 않는 자리 고르기용 */
    los(ax, ay, bx, by) {
      const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 6)
      for (let i = 0; i <= n; i++) {
        const x = ax + ((bx - ax) * i) / n, y = ay + ((by - ay) * i) / n
        if (this.tile(Math.floor(x / 32), Math.floor(y / 32)) !== 0) return false
      }
      return true
    },
    /**
     * 길이 len 칸의 곧은 빈 줄(양옆 한 줄도 바닥)을 찾아 나와 상대를 양 끝에 놓는다.
     * prefer: 'up' 이면 상대가 화면 위쪽에 오는 방향을 고른다. 돌려주는 값은 {me:[tx,ty], other:[tx,ty]}
     */
    setup(other, len = 12, prefer = 'up') {
      const m = this.S().map, me = this.me()
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      const cands = []
      for (let ty = 2; ty < m.h - 2; ty++) for (let tx = 2; tx < m.w - 2; tx++) for (const [dx, dy] of dirs) {
        let ok = true
        for (let i = 0; i <= len && ok; i++) {
          const x = tx + dx * i, y = ty + dy * i
          if (!this.floor(x, y) || !this.floor(x + dy, y + dx) || !this.floor(x - dy, y - dx)) ok = false
        }
        if (ok) cands.push({ me: [tx, ty], other: [tx + dx * len, ty + dy * len], d: [dx, dy] })
      }
      const c = this.choose(cands, prefer)
      if (!c) return null
      this.tp(me, c.me[0], c.me[1]); this.tp(other, c.other[0], c.other[1])
      this.refresh(true)
      return c
    },
    /** 월드 방향(dx, dy) 이 화면에서 어느 쪽인지 — 카메라 가까이서 재야 원근에 안 속는다 */
    dirScr(dx, dy) {
      const me = this.me()
      const a = this.w2s(me.x, me.y), b = this.w2s(me.x + dx * 32, me.y + dy * 32)
      return { x: b.x - a.x, y: b.y - a.y }
    },
    /** 후보({me, other, d}) 중 상대가 화면 위쪽('up')/아래쪽('down')에 오는 것을 골라 하나를 무작위로 */
    choose(cands, prefer = 'up') {
      if (!cands.length) return null
      const want = cands.filter((c) => { const s = this.dirScr(c.d[0], c.d[1]); return prefer === 'up' ? s.y < -20 : prefer === 'down' ? s.y > 20 : true })
      const pool = want.length ? want : cands
      return pool[Math.floor(Math.random() * pool.length)]
    },
    /** 모래주머니 한 자루를 사이에 두고 나(붙어서)와 상대(len 칸 너머)를 놓는다 */
    setupSandbag(other, len = 6, prefer = 'up') {
      const m = this.S().map, me = this.me()
      const cands = []
      for (const idx of m.sandbagIdx) {
        const sx = idx % m.w, sy = Math.floor(idx / m.w)
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          let ok = this.floor(sx - dx, sy - dy) && this.floor(sx - 2 * dx, sy - 2 * dy)
          for (let k = 1; k <= len + 1 && ok; k++) ok = this.floor(sx + dx * k, sy + dy * k)
          if (ok) cands.push({ me: [sx - dx, sy - dy], other: [sx + dx * len, sy + dy * len], d: [dx, dy], bag: [sx, sy] })
        }
      }
      const c = this.choose(cands, prefer)
      if (!c) return null
      this.tp(me, c.me[0], c.me[1]); this.tp(other, c.other[0], c.other[1])
      this.refresh(true)
      return c
    },
    /** 화면 방향 벡터(sx, sy)로 걷는 키를 누른다. (0,0) 이면 다 뗀다 */
    moveDir(sx, sy) {
      const th = 0.35 * Math.hypot(sx, sy)
      drv.key('d', sx > th); drv.key('a', sx < -th); drv.key('s', sy > th); drv.key('w', sy < -th)
    },
    /** 상대 쪽으로 걸어간다(화면 기준). 거리 stopPx 안에 오거나 ms 가 지나면 멈춘다 */
    async walkTo(p, ms = 3000, stopPx = 40) {
      const t0 = performance.now()
      while (performance.now() - t0 < ms) {
        const me = this.me()
        if (Math.hypot(p.x - me.x, p.y - me.y) < stopPx) break
        const a = this.w2s(me.x, me.y), b = this.w2s(p.x, p.y)
        this.moveDir(b.x - a.x, b.y - a.y)
        await drv.wait(50)
      }
      this.moveDir(0, 0)
    },
    /** 상대를 제자리에 붙잡아 둔다(장면 연출용). 돌려주는 함수로 푼다 */
    pin(p, tx, ty, mute = false) {
      const x = tx * 32 + 16, y = ty * 32 + 16
      // mute: 총도 못 쏘게(사격 대기 시간을 계속 채운다) — 헤드샷 시연처럼 맞아 주기만 하면 될 때
      const id = setInterval(() => { p.x = x; p.y = y; if (mute || h.mute) p.fireCooldown = 30 }, 16)
      return () => clearInterval(id)
    },
    /** 상대를 계속 조준한다(스코프·카메라가 움직여도 커서가 따라간다). 돌려주는 함수로 푼다 */
    track(p, dx = 0, dy = 0) {
      const id = setInterval(() => this.aimAt(p.x + dx, p.y + dy), 30)
      return () => clearInterval(id)
    },
    /** 게임을 끝내고 로비로 (다음 장면 준비) */
    exit() { const S = this.S(); if (S && !S.disposed) S.exit() },
    /** 로비에서 혼자 하기를 시작한다. o.botChars 로 봇 캐릭터를 정할 수 있다(Math.random 을 잠깐 가로챈다) */
    async solo(o) {
      const q = (s) => document.querySelector(s)
      if (o.botChars) {
        const order = [...document.querySelectorAll('.char')].map((c) => c.dataset.id)
        const chosen = [o.char]
        const queue = o.botChars.map((id) => {
          const rest = order.filter((x) => !chosen.includes(x))
          chosen.push(id)
          return (Math.max(0, rest.indexOf(id)) + 0.5) / rest.length
        })
        const real = Math.random
        Math.random = () => (queue.length ? queue.shift() : real())
        setTimeout(() => (Math.random = real), 2000)
      }
      const nick = q('#nick'); nick.value = o.nick || '침착맨'; nick.dispatchEvent(new Event('input', { bubbles: true }))
      q(`.char[data-id="${o.char}"]`).click()
      q('#btn-solo').click(); await drv.wait(150)
      q(`#seg-diff button[data-v="${o.diff || 'easy'}"]`).click()
      q(`#seg-bots button[data-v="${o.bots || 1}"]`).click()
      q(`#seg-solo-mode button[data-v="${o.mode || 'ffa'}"]`).click()
      const k = q('#kills-solo'); k.value = String(o.kills || 5); k.dispatchEvent(new Event('change', { bubbles: true }))
      if (o.map) q(`#seg-map2 button[data-v="${o.map}"]`).click()
      await drv.wait(150); q('#btn-solo-go').click()
      for (let i = 0; i < 40 && !window.__session; i++) await drv.wait(100)
      await drv.wait(500)
      return !!window.__session
    },
  }

  window.__rec = rec; window.__drv = drv; window.__h = h
  console.log('[rec] ready')
})()
