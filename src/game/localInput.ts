// 키보드·마우스 → Input. 화면 좌표는 1280x720 논리 프레임.

import { radToAngle } from '../core/fixedmath'
import { BTN_ADS, BTN_DASH, BTN_FIRE, BTN_RELOAD, Input } from '../core/input'
import { VIEW_H, VIEW_W } from '../render/hud'

interface AimSource {
  screenToWorld(sx: number, sy: number): { x: number; y: number }
}

export class LocalInput {
  private keys = new Set<string>()
  mouse = { x: VIEW_W / 2, y: VIEW_H / 2 }
  private mouseDown = new Set<number>()
  private lastAim = 0
  private detach: (() => void) | null = null

  attach(stage: HTMLElement): void {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      const k = e.key.toLowerCase()
      if (['w', 'a', 's', 'd', ' ', 'r', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) {
        if (down) this.keys.add(k)
        else this.keys.delete(k)
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
    let mx = 0
    let my = 0
    if (k.has('a') || k.has('arrowleft')) mx -= 1
    if (k.has('d') || k.has('arrowright')) mx += 1
    if (k.has('w') || k.has('arrowup')) my -= 1
    if (k.has('s') || k.has('arrowdown')) my += 1
    const w = renderer.screenToWorld(this.mouse.x, this.mouse.y)
    const dx = w.x - meX
    const dy = w.y - meY
    if (dx !== 0 || dy !== 0) this.lastAim = radToAngle(Math.atan2(dy, dx))
    let buttons = 0
    if (this.mouseDown.has(0)) buttons |= BTN_FIRE
    if (this.mouseDown.has(2)) buttons |= BTN_ADS
    if (k.has(' ') || k.has('shift')) buttons |= BTN_DASH
    if (k.has('r')) buttons |= BTN_RELOAD
    return { mx, my, aim: this.lastAim, buttons }
  }
}
