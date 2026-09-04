// 키보드·마우스 → Input. 화면 좌표는 1280x720 논리 프레임.

import { ANGLE_MASK, angleDiff, radToAngle } from '../core/fixedmath'
import { BTN_ADS, BTN_DASH, BTN_FIRE, BTN_RELOAD, BTN_SWAP, Input } from '../core/input'
import { GameMap } from '../core/map'
import { GameState, isTeamMatch } from '../core/state'
import { WEAPONS } from '../core/weapons'
import { VIEW_H, VIEW_W } from '../render/hud'
import { moveDirFromScreen } from '../render3d/camera'
import { VIEW_RADIUS_PX, canSee } from '../render3d/vision'
import { TouchControls } from './touch'

interface AimSource {
  screenToWorld(sx: number, sy: number): { x: number; y: number }
}

/** 자동 조준에 필요한 것 (터치 조작일 때만 넘어온다) */
export interface AutoAimCtx {
  state: GameState
  map: GameMap
  me: number
}

/** 자동 조준이 한 틱에 돌 수 있는 최대 각도 (1024 단계 기준 ≒ 초당 340°) */
const TURN_STEP = 16
/** 조준이 목표에 다가갈수록 부드럽게 — 남은 각도의 이 비율만큼 돈다 */
const TURN_EASE = 0.25

export class LocalInput {
  private keys = new Set<string>()
  mouse = { x: VIEW_W / 2, y: VIEW_H / 2 }
  private mouseDown = new Set<number>()
  private lastAim = 0
  private detach: (() => void) | null = null
  /** Tab 눌림 (다음 샘플 한 번만 BTN_SWAP) */
  private swapPressed = false
  /** 캐릭터 선택 확정 (다음 샘플 한 번만 전송). 0 = 없음 */
  pendingChar = 0
  /** 캐릭터 선택 창이 열려 있을 때 1~5 키 → pendingChar */
  pickerOpen = false
  /** 모바일 터치 조작 (없으면 null) */
  touch: TouchControls | null = null

  attach(stage: HTMLElement, touch: TouchControls | null = null): void {
    this.touch = touch
    const onKey = (e: KeyboardEvent, down: boolean) => {
      const k = e.key.toLowerCase()
      if (['w', 'a', 's', 'd', ' ', 'r', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) {
        if (down) this.keys.add(k)
        else this.keys.delete(k)
        e.preventDefault()
      } else if (k === 'tab') {
        if (down && !e.repeat) this.swapPressed = true
        e.preventDefault()
      } else if (down && this.pickerOpen && k >= '1' && k <= '9') {
        this.pendingChar = Number(k)
        e.preventDefault()
      }
    }
    const kd = (e: KeyboardEvent) => onKey(e, true)
    const ku = (e: KeyboardEvent) => onKey(e, false)
    const mm = (e: MouseEvent) => {
      const r = stage.getBoundingClientRect()
      this.mouse.x = ((e.clientX - r.left) / r.width) * VIEW_W
      this.mouse.y = ((e.clientY - r.top) / r.height) * VIEW_H
    }
    const md = (e: MouseEvent) => {
      this.mouseDown.add(e.button)
      e.preventDefault()
    }
    const mu = (e: MouseEvent) => {
      this.mouseDown.delete(e.button)
    }
    const cm = (e: Event) => e.preventDefault()
    const blur = () => {
      this.keys.clear()
      this.mouseDown.clear()
    }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    window.addEventListener('mousemove', mm)
    window.addEventListener('mousedown', md)
    window.addEventListener('mouseup', mu)
    window.addEventListener('blur', blur)
    stage.addEventListener('contextmenu', cm)
    this.detach = () => {
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      window.removeEventListener('mousemove', mm)
      window.removeEventListener('mousedown', md)
      window.removeEventListener('mouseup', mu)
      window.removeEventListener('blur', blur)
      stage.removeEventListener('contextmenu', cm)
    }
  }

  dispose(): void {
    this.detach?.()
    this.detach = null
  }

  /**
   * 터치 자동 조준. 보이는 적 중 하나를 골라 조준각을 **천천히** 돌린다.
   * - 폰에서 스틱 두 개를 정확히 미는 것은 무리라 조준은 대신 해 준다.
   * - 대신 즉시 겨누지 않는다(TURN_STEP). 뒤에 있는 적을 잡으려면 반 바퀴 도는 시간이 걸린다.
   * - 눈에 보이는 적만 고른다. 벽 뒤나 시야 밖은 고르지 않는다.
   * 조준각은 Input 에 실려 나가므로 다른 사람과의 동기화에는 영향이 없다.
   */
  private autoAim(ctx: AutoAimCtx, mx: number, my: number): void {
    const me = ctx.state.players[ctx.me]
    if (!me || !me.alive) return
    const w = WEAPONS[me.weapon]
    const range = VIEW_RADIUS_PX * (me.ads && w.scope ? 1.8 : 1)
    const teams = isTeamMatch(ctx.state)
    const eye = [{ x: me.x, y: me.y }]
    let want: number | null = null
    let best = Infinity
    for (const p of ctx.state.players) {
      if (p.id === ctx.me || !p.alive || p.choosing || p.left) continue
      if (teams && p.team === me.team) continue
      const dx = p.x - me.x
      const dy = p.y - me.y
      const d = Math.hypot(dx, dy)
      if (d > range) continue
      if (!canSee(ctx.map, eye, p.x, p.y, range)) continue
      const a = radToAngle(Math.atan2(dy, dx))
      // 가까울수록, 이미 겨눈 쪽에 가까울수록 우선 (표적이 계속 바뀌지 않도록)
      const score = d + Math.abs(angleDiff(a, this.lastAim)) * 2.2
      if (score < best) {
        best = score
        want = a
      }
    }
    // 적이 없으면 가는 쪽을 본다
    if (want === null && (mx !== 0 || my !== 0)) want = radToAngle(Math.atan2(my, mx))
    if (want === null) return
    const diff = angleDiff(want, this.lastAim)
    const step = Math.max(-TURN_STEP, Math.min(TURN_STEP, diff * TURN_EASE))
    this.lastAim = (this.lastAim + Math.round(step)) & ANGLE_MASK
  }

  /** 내 캐릭터 월드 위치를 받아 조준각을 계산한다 */
  sample(renderer: AimSource, meX: number, meY: number, auto?: AutoAimCtx): Input {
    const k = this.keys
    // 화면 기준 (W = 화면 위) → 카메라 요를 반영한 월드 8방향
    let sx = 0
    let sy = 0
    if (k.has('a') || k.has('arrowleft')) sx -= 1
    if (k.has('d') || k.has('arrowright')) sx += 1
    if (k.has('w') || k.has('arrowup')) sy -= 1
    if (k.has('s') || k.has('arrowdown')) sy += 1
    let { mx, my } = moveDirFromScreen(sx, sy)
    const t = this.touch
    if (t && (t.move.x !== 0 || t.move.y !== 0)) {
      const d = moveDirFromScreen(t.move.x, t.move.y)
      mx = d.mx
      my = d.my
    }
    if (t && auto) {
      this.autoAim(auto, mx, my)
    } else {
      const w = renderer.screenToWorld(this.mouse.x, this.mouse.y)
      const dx = w.x - meX
      const dy = w.y - meY
      if (dx !== 0 || dy !== 0) this.lastAim = radToAngle(Math.atan2(dy, dx))
    }
    let buttons = 0
    if (this.mouseDown.has(0) || t?.firing) buttons |= BTN_FIRE
    if (this.mouseDown.has(2) || t?.ads) buttons |= BTN_ADS
    if (k.has(' ') || k.has('shift') || t?.takeDash()) buttons |= BTN_DASH
    if (k.has('r') || t?.reload) buttons |= BTN_RELOAD
    if (this.swapPressed || t?.takeSwap()) {
      buttons |= BTN_SWAP
      this.swapPressed = false
    }
    const char = this.pendingChar
    this.pendingChar = 0
    return { mx, my, aim: this.lastAim, buttons, char }
  }
}
