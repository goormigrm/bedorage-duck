// 모바일(터치) 조작. **가로 화면 전용** — 세로면 index.html 의 안내가 덮는다.
//
// 손가락 두 개로 스틱 두 개를 정확히 미는 것은 폰에서 무리라, 조준은 자동으로 한다(localInput 의 autoAim).
// 그래서 이 파일이 만드는 것은 **이동 방향과 버튼 상태**뿐이다.
//   왼쪽 절반: 이동 스틱 (손가락을 대는 자리에 생긴다)
//   오른쪽 절반: 누르고 있으면 사격 (큰 사격 버튼도 같은 일을 한다)
//   오른쪽 가장자리 버튼: 조준 / 구르기 / 재장전 / 교체 · 왼쪽 위: 메뉴
// 조작 영역은 화면 위 64px 을 비워 둔다(style.css 의 .tzone) — 소리·로비로 버튼 자리다.
//
// 루트는 pointer-events: none 이고 조작 요소만 auto 다. 그래야 위에 뜬 창(로비로·다시 하기)이 눌린다.

const DEAD = 0.16

/**
 * 터치 조작을 쓸 기기인가. 터치가 달린 노트북까지 잡히지 않도록 '거친 포인터'로 판단한다.
 * PC 에서 시험하려면 주소 뒤에 ?touch=1 을 붙인다.
 */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false
  if (location.search.includes('touch=1')) return true
  return window.matchMedia?.('(pointer: coarse)').matches ?? navigator.maxTouchPoints > 0
}

/** 손가락이 영역 밖으로 나가도 계속 따라오게. 잡을 수 없는 포인터면 조용히 넘어간다 */
function capture(el: HTMLElement, id: number): void {
  try {
    el.setPointerCapture(id)
  } catch {
    /* 이미 놓았거나 합성 이벤트 */
  }
}

interface Stick {
  id: number
  baseX: number
  baseY: number
  dx: number
  dy: number
  power: number
}

export class TouchControls {
  /** 화면 기준 이동 (-1..1) */
  move = { x: 0, y: 0 }
  ads = false
  /** 달리기 켜짐 (버튼으로 켜고 끈다). 전에는 스틱을 끝까지 밀면 무조건 달렸다 */
  sprint = false
  reload = false
  /** 눌린 순간 한 번만 소비되는 신호 */
  private dashEdge = false
  private swapEdge = false
  private menuEdge = false
  private markEdge = false
  /** 보낼 감정 번호 (0 = 없음). 1 ㅋㅋㅋ · 2 굿 · 3 미안 */
  private emoteEdge = 0
  /** 사격 중인 손가락들 (영역·버튼 공용). 하나라도 있으면 발사 */
  private fire = new Set<number>()

  private root: HTMLElement
  private stickEl: HTMLElement
  private moveStick: Stick | null = null
  private detach: (() => void)[] = []
  private talkTimer = 0
  private toastTimer = 0
  private lobbyEdge = false

  constructor(host: HTMLElement) {
    const el = document.createElement('div')
    el.className = 'touch-ui'
    el.innerHTML = `
      <div class="tzone move"></div>
      <div class="tzone fire"><span>누르고 있으면 사격</span></div>
      <div class="tstick" hidden><i></i></div>
      <div class="tbtns">
        <button class="tbtn" data-a="reload">재장전</button>
        <button class="tbtn" data-a="ads">조준</button>
        <button class="tbtn" data-a="sprint">달리기</button>
        <button class="tbtn" data-a="dash">구르기</button>
        <button class="tbtn talk" data-a="talk">대화</button>
        <button class="tbtn swap" data-a="swap" hidden>교체</button>
        <button class="tbtn big" data-a="fire">사격</button>
      </div>
      <div class="tpop" id="tpop" hidden>
        <button class="tchip mark" data-t="mark">📍 여기로</button>
        <button class="tchip" data-t="e1">ㅋㅋㅋ</button>
        <button class="tchip" data-t="e2">굿 👍</button>
        <button class="tchip" data-t="e3">미안 🙏</button>
      </div>
      <div class="ttop">
        <button class="tbtn top" data-a="lobby">로비로</button>
        <button class="tbtn top" data-a="menu">⚙</button>
      </div>
      <div class="ttoast" id="ttoast" hidden></div>`
    host.appendChild(el)
    this.root = el
    this.stickEl = el.querySelector('.tstick') as HTMLElement

    const knob = this.stickEl.querySelector('i') as HTMLElement
    const R = 54
    const place = (x: number, y: number) => {
      this.stickEl.hidden = false
      this.stickEl.style.left = `${x}px`
      this.stickEl.style.top = `${y}px`
      knob.style.transform = 'translate(-50%, -50%)'
    }
    const drag = (s: Stick, x: number, y: number) => {
      let dx = x - s.baseX
      let dy = y - s.baseY
      const d = Math.hypot(dx, dy)
      const p = Math.min(1, d / R)
      if (d > 0) {
        dx /= d
        dy /= d
      }
      s.dx = dx
      s.dy = dy
      s.power = p
      knob.style.transform = `translate(calc(-50% + ${dx * p * R}px), calc(-50% + ${dy * p * R}px))`
      this.move = p < DEAD ? { x: 0, y: 0 } : { x: dx * p, y: dy * p }
    }

    // ---- 이동 영역 ----
    const moveZone = el.querySelector('.tzone.move') as HTMLElement
    const moveDown = (e: PointerEvent) => {
      if (this.moveStick) return
      e.preventDefault()
      this.moveStick = { id: e.pointerId, baseX: e.clientX, baseY: e.clientY, dx: 0, dy: 0, power: 0 }
      place(e.clientX, e.clientY)
      capture(moveZone, e.pointerId)
    }
    const moveMove = (e: PointerEvent) => {
      if (this.moveStick?.id === e.pointerId) drag(this.moveStick, e.clientX, e.clientY)
    }
    const moveUp = (e: PointerEvent) => {
      if (this.moveStick?.id !== e.pointerId) return
      this.moveStick = null
      this.move = { x: 0, y: 0 }
      this.stickEl.hidden = true
    }
    this.on(moveZone, 'pointerdown', moveDown)
    this.on(moveZone, 'pointermove', moveMove)
    this.on(moveZone, 'pointerup', moveUp)
    this.on(moveZone, 'pointercancel', moveUp)

    // ---- 사격 영역 ----
    const fireZone = el.querySelector('.tzone.fire') as HTMLElement
    const fireDown = (e: PointerEvent) => {
      e.preventDefault()
      this.fire.add(e.pointerId)
      fireZone.classList.add('on')
      capture(fireZone, e.pointerId)
    }
    const fireUp = (e: PointerEvent) => {
      this.fire.delete(e.pointerId)
      if (this.fire.size === 0) fireZone.classList.remove('on')
    }
    this.on(fireZone, 'pointerdown', fireDown)
    this.on(fireZone, 'pointerup', fireUp)
    this.on(fireZone, 'pointercancel', fireUp)

    // ---- 버튼: 조준은 토글, 사격·재장전은 누르는 동안, 나머지는 한 번 ----
    for (const btn of Array.from(el.querySelectorAll<HTMLButtonElement>('.tbtn'))) {
      const act = btn.dataset.a
      const press = (e: PointerEvent) => {
        e.preventDefault()
        e.stopPropagation()
        capture(btn, e.pointerId)
        if (act === 'ads') {
          this.ads = !this.ads
          btn.classList.toggle('on', this.ads)
          // 조준 중에는 sim 이 달리기를 무시한다 → 화면에서도 확실히 꺼 준다 (2026-09-08)
          if (this.ads && this.sprint) {
            this.setSprint(false)
            this.toast('조준 중에는 달릴 수 없습니다')
          }
        } else if (act === 'sprint') {
          this.setSprint(!this.sprint)
          if (this.sprint && this.ads) {
            this.ads = false
            this.root.querySelector('[data-a="ads"]')?.classList.remove('on')
            this.toast('달리는 동안에는 조준이 풀립니다')
          }
        } else if (act === 'lobby') {
          this.lobbyEdge = true
        } else if (act === 'reload') {
          this.reload = true
          btn.classList.add('on')
        } else if (act === 'fire') {
          this.fire.add(e.pointerId)
          btn.classList.add('on')
        } else if (act === 'dash') this.dashEdge = true
        else if (act === 'swap') this.swapEdge = true
        else if (act === 'menu') this.menuEdge = true
        else if (act === 'mark') this.markEdge = true
        else if (act === 'talk') this.toggleTalk()
      }
      const release = (e: PointerEvent) => {
        if (act === 'reload') {
          this.reload = false
          btn.classList.remove('on')
        } else if (act === 'fire') {
          this.fire.delete(e.pointerId)
          btn.classList.remove('on')
        }
      }
      this.on(btn, 'pointerdown', press)
      this.on(btn, 'pointerup', release)
      this.on(btn, 'pointercancel', release)
    }

    // 대화 창 안의 칩: 누르면 그 신호/감정을 보내고 창을 닫는다
    for (const chip of Array.from(el.querySelectorAll<HTMLButtonElement>('.tchip'))) {
      const press = (e: PointerEvent) => {
        e.preventDefault()
        e.stopPropagation()
        const t = chip.dataset.t
        if (t === 'mark') this.markEdge = true
        else if (t === 'e1') this.emoteEdge = 1
        else if (t === 'e2') this.emoteEdge = 2
        else if (t === 'e3') this.emoteEdge = 3
        this.closeTalk()
      }
      this.on(chip, 'pointerdown', press)
    }
  }

  private on<K extends keyof HTMLElementEventMap>(
    el: HTMLElement,
    type: K,
    fn: (e: HTMLElementEventMap[K]) => void,
  ): void {
    el.addEventListener(type, fn as EventListener)
    this.detach.push(() => el.removeEventListener(type, fn as EventListener))
  }

  /** 사격 중인가 */
  get firing(): boolean {
    return this.fire.size > 0
  }

  takeDash(): boolean {
    const v = this.dashEdge
    this.dashEdge = false
    return v
  }

  takeSwap(): boolean {
    const v = this.swapEdge
    this.swapEdge = false
    return v
  }

  takeMenu(): boolean {
    const v = this.menuEdge
    this.menuEdge = false
    return v
  }

  /** 로비로 버튼을 눌렀는가 (한 번만) */
  takeLobby(): boolean {
    const v = this.lobbyEdge
    this.lobbyEdge = false
    return v
  }

  private setSprint(v: boolean): void {
    this.sprint = v
    this.root.querySelector('[data-a="sprint"]')?.classList.toggle('on', v)
  }

  /** 작고 흐린 안내를 잠깐 띄운다 (사격 영역 안내와 같은 톤) */
  private toast(text: string): void {
    const el = this.root.querySelector('#ttoast') as HTMLElement | null
    if (!el) return
    el.textContent = text
    el.hidden = false
    // 다시 띄울 때 애니메이션이 처음부터 돌도록 리플로우를 한 번 강제한다
    el.classList.remove('show')
    void el.offsetWidth
    el.classList.add('show')
    clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => {
      el.classList.remove('show')
      el.hidden = true
    }, 1800)
  }

  /** 팀 신호 버튼을 눌렀는가 (한 번만) */
  takeMark(): boolean {
    const v = this.markEdge
    this.markEdge = false
    return v
  }

  /** 감정 표현 버튼(ㅋㅋ)을 눌렀는가 (한 번만) */
  takeEmote(): number {
    const v = this.emoteEdge
    this.emoteEdge = 0
    return v
  }

  /** 팀전에서만 "여기로" 신호를 보여 준다 (대화 창 안) */
  setMarkVisible(v: boolean): void {
    const b = this.root.querySelector('.tchip.mark') as HTMLElement | null
    if (b) b.hidden = !v
  }

  /** 캐릭터를 바꿀 수 있을 때만 교체 버튼을 낸다 — 늘 띄우면 오른쪽이 버튼 밭이 된다 */
  setSwapVisible(v: boolean): void {
    const b = this.root.querySelector('.tbtn.swap') as HTMLElement | null
    if (b && b.hidden === v) b.hidden = !v
  }

  /**
   * 대화 창(신호·감정) 열고 닫기. 버튼 하나로 네 가지를 쓴다 —
   * 신호·감정을 각각 버튼으로 두니 오른쪽이 너무 빽빽했다 (2026-09-08).
   */
  private toggleTalk(): void {
    const pop = this.root.querySelector('#tpop') as HTMLElement | null
    const btn = this.root.querySelector('[data-a="talk"]') as HTMLElement | null
    if (!pop) return
    const open = pop.hidden
    pop.hidden = !open
    btn?.classList.toggle('on', open)
    clearTimeout(this.talkTimer)
    // 열어 두고 잊어버리면 화면을 가리므로 잠시 뒤 스스로 닫힌다
    if (open) this.talkTimer = window.setTimeout(() => this.closeTalk(), 4000)
  }

  private closeTalk(): void {
    const pop = this.root.querySelector('#tpop') as HTMLElement | null
    if (pop) pop.hidden = true
    this.root.querySelector('[data-a="talk"]')?.classList.remove('on')
    clearTimeout(this.talkTimer)
  }

  /** 창(메뉴·결과·캐릭터 선택)이 떠 있는 동안은 조작을 치운다 — 창 버튼이 눌려야 하므로 */
  setVisible(v: boolean): void {
    this.root.hidden = !v
    if (!v) {
      this.closeTalk()
      this.move = { x: 0, y: 0 }
      this.moveStick = null
      this.stickEl.hidden = true
      this.fire.clear()
      this.reload = false
    }
  }

  dispose(): void {
    clearTimeout(this.talkTimer)
    clearTimeout(this.toastTimer)
    for (const off of this.detach) off()
    this.detach = []
    this.root.remove()
  }
}

/** 전체화면 + 가로 고정 시도. 사용자 제스처 안에서 불러야 한다 */
export async function enterLandscape(): Promise<void> {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' })
  } catch {
    /* 지원 안 하는 브라우저는 그냥 넘어간다 */
  }
  try {
    const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
    await so?.lock?.('landscape')
  } catch {
    /* iOS 등 잠금 미지원 — 세로면 안내 화면이 뜬다 */
  }
}

