// 설정 패널 (소리 · 조준선 모양/크기 · 조작 설명).
//
// **로비 대기실과 게임 안에서 같은 것을 쓴다** — 판을 시작하고 나서야 고칠 수 있으면 늦다(2026-09-08 사용자).
// 전부 **내 화면 설정**이라 P2P 로 보내지 않고 localStorage 에만 남는다.
// 그래서 이 파일은 저장소를 정본으로 삼고, 살아 있는 객체(Sfx·Hud)가 있으면 즉시 반영만 시킨다.

import { AIM_SIZES, AIM_STYLES, AimSize, AimStyle, drawAim, loadAimSize, loadAimStyle, saveAimSize, saveAimStyle } from '../render/aim'

const MUTE_KEY = 'bd.muted'
const KEYS_KEY = 'bd.keys'

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export function setMutedPref(v: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, v ? '1' : '0')
  } catch {
    /* 무시 */
  }
}

export function keysShownPref(fallback = true): boolean {
  try {
    const v = localStorage.getItem(KEYS_KEY)
    return v === null ? fallback : v === '1'
  } catch {
    return fallback
  }
}

export function setKeysShownPref(v: boolean): void {
  try {
    localStorage.setItem(KEYS_KEY, v ? '1' : '0')
  } catch {
    /* 무시 */
  }
}

export interface SettingsHooks {
  /** 소리를 즉시 반영할 대상 (게임 안에서만 있다) */
  applyMute?: (muted: boolean) => void
  /** 조준선이 바뀌면 즉시 다시 읽게 (게임 안에서만) */
  applyAim?: () => void
  /** 조작 안내 띠를 즉시 켜고 끈다 (PC 게임 안에서만) */
  applyKeys?: (shown: boolean) => void
  /** 터치 기기면 조작 안내 띠 항목을 감춘다 (띠 자체가 없다) */
  touch?: boolean
  /** 다시 그리기 (선택이 바뀌면 패널을 새로 그린다) */
  rerender: () => void
}

/** 설정 패널 HTML. 감싸는 쪽이 원하는 자리에 넣고 bindSettings 로 배선한다 */
export function settingsHtml(touch = false): string {
  const seg = (id: string, items: { v: string; label: string; on: boolean }[]) =>
    `<div class="seg small" id="${id}">${items
      .map((it) => `<button data-v="${it.v}" class="${it.on ? 'on' : ''}">${it.label}</button>`)
      .join('')}</div>`
  const style = loadAimStyle()
  const size = loadAimSize()
  const keys = keysShownPref()
  const muted = isMuted()
  return `<div class="setpanel">
    <div class="srow"><label>소리</label><div class="sctl">${seg('st-sound', [
      { v: 'on', label: '켜기', on: !muted },
      { v: 'off', label: '끄기', on: muted },
    ])}</div></div>
    <div class="srow"><label>조준선</label><div class="sctl">${seg(
      'st-aim',
      AIM_STYLES.map((a) => ({ v: a.id, label: a.name, on: a.id === style })),
    )}<canvas class="aimpv" id="st-aimpv" width="72" height="72"></canvas></div></div>
    <div class="srow"><label>조준선 크기</label><div class="sctl">${seg(
      'st-aimsize',
      AIM_SIZES.map((a) => ({ v: a.id, label: a.name, on: a.id === size })),
    )}</div></div>
    ${
      touch
        ? ''
        : `<div class="srow"><label>조작 설명</label><div class="sctl">${seg('st-keys', [
            { v: 'on', label: '보이기', on: keys },
            { v: 'off', label: '숨기기', on: !keys },
          ])}</div></div>`
    }
  </div>`
}

/** 패널 배선. root 는 패널이 들어 있는 요소(창이든 카드든) */
export function bindSettings(root: ParentNode, hooks: SettingsHooks): void {
  const on = (sel: string, cb: (v: string) => void) =>
    root.querySelectorAll<HTMLButtonElement>(`${sel} button`).forEach((b) => {
      b.onclick = () => cb(b.dataset.v!)
    })
  on('#st-sound', (v) => {
    const muted = v === 'off'
    setMutedPref(muted)
    hooks.applyMute?.(muted)
    hooks.rerender()
  })
  on('#st-aim', (v) => {
    saveAimStyle(v as AimStyle)
    hooks.applyAim?.()
    hooks.rerender()
  })
  on('#st-aimsize', (v) => {
    saveAimSize(v as AimSize)
    hooks.applyAim?.()
    hooks.rerender()
  })
  on('#st-keys', (v) => {
    const shown = v === 'on'
    setKeysShownPref(shown)
    hooks.applyKeys?.(shown)
    hooks.rerender()
  })
  // 조준선 미리보기 — 밝은 바닥/어두운 바닥이 반씩 깔린 칸 위에 그린다(CSS)
  const pv = root.querySelector('#st-aimpv') as HTMLCanvasElement | null
  if (pv) {
    requestAnimationFrame(() => {
      const ctx = pv.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, pv.width, pv.height)
      drawAim(ctx, loadAimStyle(), pv.width / 2, pv.height / 2, 12, 'rgba(255,255,255,0.96)', 1)
    })
  }
}
