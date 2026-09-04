// 키보드·마우스 → Input. 화면 좌표는 1280x720 논리 프레임.

import { radToAngle } from '../core/fixedmath'
import { BTN_ADS, BTN_DASH, BTN_FIRE, BTN_RELOAD, BTN_SWAP, Input } from '../core/input'
import { VIEW_H, VIEW_W } from '../render/hud'
import { moveDirFromScreen, screenDirToWorldAngle } from '../render3d/camera'
import { TouchControls } from './touch'

interface AimSource {
  screenToWorld(sx: number, sy: number): { x: number; y: number }
}

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

  /** 내 캐릭터 월드 위치를 받아 조준각을 계산한다 */
  sample(renderer: AimSource, meX: number, meY: number): Input {
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
    if (t && t.aim) {
      this.lastAim = screenDirToWorldAngle(t.aim.x, t.aim.y)
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
