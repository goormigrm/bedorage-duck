// 모바일(터치) 조작. **가로 화면 전용** — 세로면 index.html 의 안내가 덮는다.
// 왼쪽 반: 이동 스틱, 오른쪽 반: 조준 스틱(세게 밀면 사격). 오른쪽 가장자리에 버튼.
// 스틱은 손가락을 대는 자리에 생긴다(플로팅). 게임 로직은 모른다 — 화면 기준 방향과 버튼 상태만 만든다.

const DEAD = 0.16
/** 조준 스틱을 이만큼 밀면 사격 */
const FIRE_AT = 0.62

/**
 * 터치 조작을 쓸 기기인가. 터치가 달린 노트북까지 잡히지 않도록 '거친 포인터'로 판단한다.
 * PC 에서 시험하려면 주소 뒤에 ?touch=1 을 붙인다.
 */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false
  if (location.search.includes('touch=1')) return true
  return window.matchMedia?.('(pointer: coarse)').matches ?? navigator.maxTouchPoints > 0
}

interface Stick {
  id: number
  baseX: number
  baseY: number
  dx: number
  dy: number
  power: number
  el: HTMLElement
}

export class TouchControls {
  /** 화면 기준 이동 (-1..1) */
  move = { x: 0, y: 0 }
  /** 화면 기준 조준 방향 (정규화). 한 번 잡으면 손을 떼도 마지막 방향을 유지한다 */
  aim: { x: number; y: number } | null = null
  /** 조준 스틱을 민 정도 (사격 판정) */
  aimPower = 0
  ads = false
  reload = false
  /** 눌린 순간 한 번만 소비되는 신호 */
  private dashEdge = false
  private swapEdge = false
  private menuEdge = false

  private root: HTMLElement
  private moveStick: Stick | null = null
  private aimStick: Stick | null = null
  private detach: (() => void)[] = []

  constructor(host: HTMLElement) {
    const el = document.createElement('div')
    el.className = 'touch-ui'
    el.innerHTML = `
      <div class="tstick move" hidden><i></i></div>
      <div class="tstick aim" hidden><i></i></div>
      <div class="tbtns">
        <button class="tbtn" data-a="ads">조준</button>
        <button class="tbtn" data-a="dash">구르기</button>
        <button class="tbtn" data-a="reload">재장전</button>
        <button class="tbtn" data-a="swap">교체</button>
      </div>
      <button class="tbtn menu" data-a="menu">≡</button>`
    host.appendChild(el)
    this.root = el

    const moveEl = el.querySelector('.tstick.move') as HTMLElement
    const aimEl = el.querySelector('.tstick.aim') as HTMLElement

    const mk = (id: number, x: number, y: number, target: HTMLElement): Stick => {
      target.hidden = false
      target.style.left = `${x}px`
      target.style.top = `${y}px`
      const knob = target.querySelector('i') as HTMLElement
      knob.style.transform = 'translate(-50%, -50%)'
      return { id, baseX: x, baseY: y, dx: 0, dy: 0, power: 0, el: target }
    }
    const moveKnob = (s: Stick, x: number, y: number) => {
      const R = 54
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
      const knob = s.el.querySelector('i') as HTMLElement
      knob.style.transform = `translate(calc(-50% + ${dx * p * R}px), calc(-50% + ${dy * p * R}px))`
    }

    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('.tbtn')) return
      e.preventDefault()
      const right = e.clientX > window.innerWidth / 2
      if (right && !this.aimStick) {
        this.aimStick = mk(e.pointerId, e.clientX, e.clientY, aimEl)
      } else if (!right && !this.moveStick) {
        this.moveStick = mk(e.pointerId, e.clientX, e.clientY, moveEl)
      }
    }
    const move = (e: PointerEvent) => {
      if (this.moveStick && e.pointerId === this.moveStick.id) {
        moveKnob(this.moveStick, e.clientX, e.clientY)
        const s = this.moveStick
        this.move = s.power < DEAD ? { x: 0, y: 0 } : { x: s.dx * s.power, y: s.dy * s.power }
      }
      if (this.aimStick && e.pointerId === this.aimStick.id) {
        moveKnob(this.aimStick, e.clientX, e.clientY)
        const s = this.aimStick
        if (s.power >= DEAD) {
          this.aim = { x: s.dx, y: s.dy }
          this.aimPower = s.power
        } else {
          this.aimPower = 0
        }
      }
    }
    const up = (e: PointerEvent) => {
      if (this.moveStick && e.pointerId === this.moveStick.id) {
        this.moveStick.el.hidden = true
        this.moveStick = null
        this.move = { x: 0, y: 0 }
      }
      if (this.aimStick && e.pointerId === this.aimStick.id) {
        this.aimStick.el.hidden = true
        this.aimStick = null
        this.aimPower = 0 // 방향은 유지, 사격만 멈춘다
      }
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    this.detach.push(() => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    })

    // 버튼: 조준은 토글, 재장전은 누르는 동안, 나머지는 한 번
    for (const btn of Array.from(el.querySelectorAll<HTMLButtonElement>('.tbtn'))) {
      const act = btn.dataset.a
      const press = (e: PointerEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (act === 'ads') {
          this.ads = !this.ads
          btn.classList.toggle('on', this.ads)
        } else if (act === 'reload') {
          this.reload = true
          btn.classList.add('on')
        } else if (act === 'dash') this.dashEdge = true
        else if (act === 'swap') this.swapEdge = true
        else if (act === 'menu') this.menuEdge = true
      }
      const release = () => {
        if (act === 'reload') {
          this.reload = false
          btn.classList.remove('on')
        }
      }
      btn.addEventListener('pointerdown', press)
      btn.addEventListener('pointerup', release)
      btn.addEventListener('pointercancel', release)
      this.detach.push(() => {
        btn.removeEventListener('pointerdown', press)
        btn.removeEventListener('pointerup', release)
        btn.removeEventListener('pointercancel', release)
      })
    }
  }

  /** 사격 중인가 (조준 스틱을 세게 밀었을 때) */
  get firing(): boolean {
    return this.aimPower >= FIRE_AT
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

  /** 캐릭터 선택 창처럼 게임 조작을 멈춰야 할 때 */
  setVisible(v: boolean): void {
    this.root.hidden = !v
    if (!v) {
      this.move = { x: 0, y: 0 }
      this.aimPower = 0
    }
  }

  dispose(): void {
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
