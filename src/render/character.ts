// 이모지풍 캐리커처 캐릭터 드로잉. canvas.ts(게임)와 로비 초상화가 공유한다.
// 원점 = 발 아래 충돌원 중심. 머리는 위로 솟아 있다.

import { CharacterDef, Look } from '../core/characters'

const OUTLINE = '#2b2412'

export interface CharDrawOpts {
  /** 조준/바라보는 방향 (라디안) */
  facing: number
  /** 말랑 스케일 */
  sx: number
  sy: number
  /** 걷기 위상 (0 = 정지) */
  walk: number
  moving: boolean
  /** 0..1 피격 플래시 */
  flash: number
  /** 시간 (초) — 미세 애니메이션용 */
  t: number
}

export function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0')
}

function shade(c: number, k: number): string {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k))
  const g = Math.min(255, Math.round(((c >> 8) & 255) * k))
  const b = Math.min(255, Math.round((c & 255) * k))
  return hex((r << 16) | (g << 8) | b)
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath()
  ctx.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2)
  ctx.closePath()
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0): void {
  ctx.beginPath()
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2)
  ctx.closePath()
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
  ctx.lineTo(x + rr, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr)
  ctx.lineTo(x, y + rr)
  ctx.quadraticCurveTo(x, y, x + rr, y)
  ctx.closePath()
}

/** 몸통(셔츠·가운)만. 머리 아래 레이어. */
export function drawBody(ctx: CanvasRenderingContext2D, def: CharacterDef, o: CharDrawOpts): void {
  const L = def.look
  const bw = 11 * L.bodyScale
  const bh = 13
  const fo = o.moving ? Math.sin(o.walk) * 3.5 : 0

  // 신발
  ctx.fillStyle = '#2a2622'
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 1.2
  ellipse(ctx, -5, 12 + fo * 0.4, 4.5, 2.6)
  ctx.fill()
  ctx.stroke()
  ellipse(ctx, 5, 12 - fo * 0.4, 4.5, 2.6)
  ctx.fill()
  ctx.stroke()
  // 바지(짧게)
  ctx.fillStyle = '#34405a'
  rrect(ctx, -bw * 0.75, 4, bw * 1.5, 7, 3)
  ctx.fill()
  ctx.stroke()
  // 셔츠
  ctx.fillStyle = hex(L.shirt)
  ctx.lineWidth = 1.6
  rrect(ctx, -bw, -6, bw * 2, bh, 6)
  ctx.fill()
  ctx.stroke()
  // 가운
  if (L.coat !== undefined) {
    ctx.fillStyle = hex(L.coat)
    ctx.beginPath()
    ctx.moveTo(-bw, -4)
    ctx.lineTo(-bw * 0.35, -6)
    ctx.lineTo(-bw * 0.3, 7)
    ctx.lineTo(-bw, 7)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(bw, -4)
    ctx.lineTo(bw * 0.35, -6)
    ctx.lineTo(bw * 0.3, 7)
    ctx.lineTo(bw, 7)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
  // 넥타이
  if (L.tie !== undefined) {
    ctx.fillStyle = hex(L.tie)
    ctx.beginPath()
    ctx.moveTo(-2, -5)
    ctx.lineTo(2, -5)
    ctx.lineTo(1.5, 4)
    ctx.lineTo(0, 6)
    ctx.lineTo(-1.5, 4)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
  // 목
  ctx.fillStyle = shade(L.skin, 0.9)
  rrect(ctx, -3.5, -9, 7, 5, 2)
  ctx.fill()
}

/** 머리 + 얼굴. 원점은 몸 원점과 같고 머리 중심은 (0, -19*headScale 부근). */
export function drawHead(ctx: CanvasRenderingContext2D, def: CharacterDef, o: CharDrawOpts): void {
  const L = def.look
  const R = 12.5 * L.headScale
  const hy = -8 - R // 머리 중심 y
  const cs = Math.cos(o.facing)
  const sn = Math.sin(o.facing)
  // 얼굴 중심은 바라보는 쪽으로 살짝 이동 (3/4 시점)
  const fx = cs * R * 0.28
  const fy = hy + sn * R * 0.12 + R * 0.05
  const skin = hex(L.skin)

  ctx.save()
  ctx.lineJoin = 'round'

  // 귀
  ctx.fillStyle = skin
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 1.4
  ellipse(ctx, -R * 0.98, hy + R * 0.05, R * 0.2, R * 0.28)
  ctx.fill()
  ctx.stroke()
  ellipse(ctx, R * 0.98, hy + R * 0.05, R * 0.2, R * 0.28)
  ctx.fill()
  ctx.stroke()

  // 머리(얼굴) 바탕
  ctx.fillStyle = skin
  ctx.lineWidth = 2
  circle(ctx, 0, hy, R)
  ctx.fill()
  ctx.stroke()
  // 볼 홍조
  ctx.fillStyle = 'rgba(232,120,110,0.22)'
  ellipse(ctx, fx - R * 0.5, fy + R * 0.28, R * 0.2, R * 0.12)
  ctx.fill()
  ellipse(ctx, fx + R * 0.5, fy + R * 0.28, R * 0.2, R * 0.12)
  ctx.fill()

  // 수염 (얼굴 위, 머리카락 아래)
  drawBeard(ctx, L, R, fx, fy, hy)

  // 머리카락
  drawHair(ctx, L, R, hy, cs)

  // 눈썹
  const eyeY = fy - R * 0.12
  const eyeDx = R * 0.36
  if (L.brows !== 'none') {
    ctx.strokeStyle = shade(L.hairColor === 0x2a2320 ? 0x2a2320 : L.hairColor, 1)
    ctx.lineWidth = L.brows === 'thick' ? 2.6 : 1.6
    ctx.lineCap = 'round'
    const by = eyeY - R * 0.3
    const angry = L.eyes === 'angry' ? R * 0.1 : 0
    ctx.beginPath()
    ctx.moveTo(fx - eyeDx - R * 0.18, by - angry * 0.4)
    ctx.lineTo(fx - eyeDx + R * 0.18, by + angry)
    ctx.moveTo(fx + eyeDx + R * 0.18, by - angry * 0.4)
    ctx.lineTo(fx + eyeDx - R * 0.18, by + angry)
    ctx.stroke()
  }

  // 눈
  drawEyes(ctx, L, R, fx, eyeY, eyeDx, cs, sn)

  // 코
  ctx.strokeStyle = shade(L.skin, 0.72)
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(fx + cs * R * 0.06, fy + R * 0.05)
  ctx.quadraticCurveTo(fx + cs * R * 0.16 + R * 0.08, fy + R * 0.28, fx + cs * R * 0.06 - R * 0.04, fy + R * 0.3)
  ctx.stroke()

  // 입
  drawMouth(ctx, L, R, fx, fy)

  // 안경
  if (L.glasses !== 'none') {
    ctx.strokeStyle = '#1d1d1d'
    ctx.lineWidth = 1.5
    if (L.glasses === 'rect') {
      rrect(ctx, fx - eyeDx - R * 0.27, eyeY - R * 0.2, R * 0.54, R * 0.4, 2)
      ctx.stroke()
      rrect(ctx, fx + eyeDx - R * 0.27, eyeY - R * 0.2, R * 0.54, R * 0.4, 2)
      ctx.stroke()
    } else {
      circle(ctx, fx - eyeDx, eyeY, R * 0.27)
      ctx.stroke()
      circle(ctx, fx + eyeDx, eyeY, R * 0.27)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.moveTo(fx - eyeDx + R * 0.27, eyeY)
    ctx.lineTo(fx + eyeDx - R * 0.27, eyeY)
    ctx.stroke()
    // 렌즈 반사
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    rrect(ctx, fx - eyeDx - R * 0.2, eyeY - R * 0.15, R * 0.4, R * 0.3, 2)
    ctx.fill()
    rrect(ctx, fx + eyeDx - R * 0.2, eyeY - R * 0.15, R * 0.4, R * 0.3, 2)
    ctx.fill()
  }

  // 모자/머리띠
  if (L.extra === 'cap') {
    ctx.fillStyle = hex(def.accentColor)
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(0, hy - R * 0.1, R * 0.95, Math.PI, Math.PI * 2)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ellipse(ctx, cs * R * 0.7, hy - R * 0.1, R * 0.55, R * 0.16)
    ctx.fill()
    ctx.stroke()
  } else if (L.extra === 'headband') {
    ctx.fillStyle = hex(def.accentColor)
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 1.5
    rrect(ctx, -R, hy - R * 0.55, R * 2, R * 0.28, 2)
    ctx.fill()
    ctx.stroke()
  }

  // 피격 플래시
  if (o.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(1, o.flash * 8)})`
    circle(ctx, 0, hy, R + 1)
    ctx.fill()
  }
  ctx.restore()
}

function drawHair(ctx: CanvasRenderingContext2D, L: Look, R: number, hy: number, cs: number): void {
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 1.6
  switch (L.hair) {
    case 'none': {
      // 삭발: 정수리 하이라이트 + 옆머리 흔적
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ellipse(ctx, -R * 0.25, hy - R * 0.55, R * 0.32, R * 0.16, -0.5)
      ctx.fill()
      ctx.fillStyle = shade(L.skin, 0.86)
      ctx.beginPath()
      ctx.arc(0, hy, R * 0.98, Math.PI * 1.05, Math.PI * 1.35)
      ctx.arc(0, hy, R * 0.72, Math.PI * 1.35, Math.PI * 1.05, true)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.arc(0, hy, R * 0.98, Math.PI * 1.65, Math.PI * 1.95)
      ctx.arc(0, hy, R * 0.72, Math.PI * 1.95, Math.PI * 1.65, true)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'buzz': {
      // 스포츠머리: 반투명 짙은 캡
      ctx.fillStyle = shade(L.hairColor, 1)
      ctx.globalAlpha = 0.85
      ctx.beginPath()
      ctx.arc(0, hy + R * 0.05, R * 0.99, Math.PI * 1.0, Math.PI * 2.0)
      ctx.quadraticCurveTo(R * 0.5, hy - R * 0.25, 0, hy - R * 0.28)
      ctx.quadraticCurveTo(-R * 0.5, hy - R * 0.25, -R * 0.99, hy + R * 0.05)
      ctx.closePath()
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.stroke()
      break
    }
    case 'side': {
      // 옆으로 넘긴 짧은 머리 (가르마)
      ctx.fillStyle = hex(L.hairColor)
      ctx.beginPath()
      ctx.moveTo(-R * 1.0, hy + R * 0.05)
      ctx.lineTo(-R * 1.0, hy - R * 0.35)
      ctx.quadraticCurveTo(-R * 0.75, hy - R * 1.12, R * 0.2, hy - R * 1.08)
      ctx.quadraticCurveTo(R * 0.95, hy - R * 1.0, R * 1.0, hy - R * 0.35)
      ctx.lineTo(R * 1.0, hy - R * 0.1)
      // 앞머리: 한쪽으로 쓸어넘긴 사선
      ctx.quadraticCurveTo(R * 0.7, hy - R * 0.55, R * 0.15, hy - R * 0.72)
      ctx.quadraticCurveTo(-R * 0.35, hy - R * 0.4, -R * 0.7, hy - R * 0.55)
      ctx.quadraticCurveTo(-R * 0.95, hy - R * 0.4, -R * 1.0, hy + R * 0.05)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      break
    }
    case 'short':
    case 'flat': {
      const flat = L.hair === 'flat'
      ctx.fillStyle = hex(L.hairColor)
      ctx.beginPath()
      // 옆머리 → 정수리
      ctx.moveTo(-R * 1.0, hy + R * 0.1)
      ctx.lineTo(-R * 1.0, hy - R * 0.3)
      if (flat) {
        ctx.quadraticCurveTo(-R * 0.9, hy - R * 1.05, -R * 0.2, hy - R * 1.08)
        ctx.lineTo(R * 0.35, hy - R * 1.08)
        ctx.quadraticCurveTo(R * 0.95, hy - R * 1.0, R * 1.0, hy - R * 0.3)
      } else {
        ctx.quadraticCurveTo(-R * 0.8, hy - R * 1.15, R * 0.1, hy - R * 1.1)
        ctx.quadraticCurveTo(R * 0.9, hy - R * 1.05, R * 1.0, hy - R * 0.3)
      }
      ctx.lineTo(R * 1.0, hy + R * 0.1)
      // 앞머리 라인 (이마)
      ctx.quadraticCurveTo(R * 0.85, hy - R * 0.45, R * 0.4, hy - R * 0.5 + cs * R * 0.05)
      ctx.quadraticCurveTo(0, hy - R * 0.62, -R * 0.4, hy - R * 0.5 - cs * R * 0.05)
      ctx.quadraticCurveTo(-R * 0.85, hy - R * 0.45, -R * 1.0, hy + R * 0.1)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      break
    }
  }
}

function drawEyes(
  ctx: CanvasRenderingContext2D,
  L: Look,
  R: number,
  fx: number,
  eyeY: number,
  eyeDx: number,
  cs: number,
  sn: number,
): void {
  const pupilDx = cs * R * 0.07
  const pupilDy = sn * R * 0.05
  ctx.lineCap = 'round'
  switch (L.eyes) {
    case 'normal':
    case 'angry': {
      for (const s of [-1, 1]) {
        ctx.fillStyle = '#fff'
        ctx.strokeStyle = OUTLINE
        ctx.lineWidth = 1.2
        ellipse(ctx, fx + s * eyeDx, eyeY, R * 0.2, R * 0.22)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = '#1a1a1a'
        circle(ctx, fx + s * eyeDx + pupilDx, eyeY + pupilDy, R * 0.11)
        ctx.fill()
      }
      break
    }
    case 'calm': {
      // 반쯤 감긴 무표정 눈: 위쪽 직선 눈꺼풀 + 아래 작은 눈동자
      for (const s of [-1, 1]) {
        ctx.fillStyle = '#fff'
        ctx.strokeStyle = OUTLINE
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.moveTo(fx + s * eyeDx - R * 0.2, eyeY - R * 0.02)
        ctx.lineTo(fx + s * eyeDx + R * 0.2, eyeY - R * 0.02)
        ctx.quadraticCurveTo(fx + s * eyeDx, eyeY + R * 0.28, fx + s * eyeDx - R * 0.2, eyeY - R * 0.02)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = '#1a1a1a'
        circle(ctx, fx + s * eyeDx + pupilDx, eyeY + R * 0.08 + pupilDy * 0.5, R * 0.09)
        ctx.fill()
        ctx.strokeStyle = OUTLINE
        ctx.lineWidth = 1.6
        ctx.beginPath()
        ctx.moveTo(fx + s * eyeDx - R * 0.22, eyeY - R * 0.03)
        ctx.lineTo(fx + s * eyeDx + R * 0.22, eyeY - R * 0.03)
        ctx.stroke()
      }
      break
    }
    case 'sharp': {
      // 매서운 눈: 위 눈꺼풀이 바깥→안쪽으로 내려오는 좁은 눈 + 작은 눈동자
      for (const s of [-1, 1]) {
        ctx.fillStyle = '#fff'
        ctx.strokeStyle = OUTLINE
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.moveTo(fx + s * eyeDx - s * R * 0.22, eyeY + R * 0.02)
        ctx.lineTo(fx + s * eyeDx + s * R * 0.2, eyeY - R * 0.1)
        ctx.quadraticCurveTo(fx + s * eyeDx, eyeY + R * 0.22, fx + s * eyeDx - s * R * 0.22, eyeY + R * 0.02)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = '#1a1a1a'
        circle(ctx, fx + s * eyeDx + pupilDx, eyeY + R * 0.04 + pupilDy * 0.5, R * 0.08)
        ctx.fill()
      }
      break
    }
    case 'squint': {
      ctx.strokeStyle = OUTLINE
      ctx.lineWidth = 2
      for (const s of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(fx + s * eyeDx - R * 0.2, eyeY + R * 0.02)
        ctx.quadraticCurveTo(fx + s * eyeDx + pupilDx, eyeY - R * 0.1, fx + s * eyeDx + R * 0.2, eyeY + R * 0.02)
        ctx.stroke()
      }
      break
    }
    case 'happy': {
      ctx.strokeStyle = OUTLINE
      ctx.lineWidth = 2
      for (const s of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(fx + s * eyeDx - R * 0.2, eyeY + R * 0.08)
        ctx.quadraticCurveTo(fx + s * eyeDx + pupilDx, eyeY - R * 0.2, fx + s * eyeDx + R * 0.2, eyeY + R * 0.08)
        ctx.stroke()
      }
      break
    }
  }
}

function drawMouth(ctx: CanvasRenderingContext2D, L: Look, R: number, fx: number, fy: number): void {
  const my = fy + R * 0.5
  ctx.strokeStyle = OUTLINE
  ctx.lineCap = 'round'
  switch (L.mouth) {
    case 'flat':
      ctx.lineWidth = 1.8
      ctx.beginPath()
      ctx.moveTo(fx - R * 0.2, my)
      ctx.lineTo(fx + R * 0.2, my)
      ctx.stroke()
      break
    case 'frown':
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(fx - R * 0.24, my + R * 0.06)
      ctx.quadraticCurveTo(fx, my - R * 0.1, fx + R * 0.24, my + R * 0.06)
      ctx.stroke()
      break
    case 'smile':
      ctx.lineWidth = 1.8
      ctx.beginPath()
      ctx.moveTo(fx - R * 0.22, my - R * 0.04)
      ctx.quadraticCurveTo(fx, my + R * 0.18, fx + R * 0.22, my - R * 0.04)
      ctx.stroke()
      break
    case 'thick': {
      ctx.fillStyle = '#c9695a'
      ctx.lineWidth = 1.3
      ellipse(ctx, fx, my, R * 0.26, R * 0.13)
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(fx - R * 0.24, my)
      ctx.lineTo(fx + R * 0.24, my)
      ctx.stroke()
      break
    }
    case 'grin': {
      ctx.fillStyle = '#7a2e2e'
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(fx - R * 0.3, my - R * 0.06)
      ctx.quadraticCurveTo(fx, my + R * 0.42, fx + R * 0.3, my - R * 0.06)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.moveTo(fx - R * 0.26, my - R * 0.04)
      ctx.lineTo(fx + R * 0.26, my - R * 0.04)
      ctx.lineTo(fx + R * 0.2, my + R * 0.08)
      ctx.lineTo(fx - R * 0.2, my + R * 0.08)
      ctx.closePath()
      ctx.fill()
      break
    }
  }
}

function drawBeard(ctx: CanvasRenderingContext2D, L: Look, R: number, fx: number, fy: number, hy: number): void {
  const col = shade(L.hairColor === 0x2a2320 ? 0x2a2320 : L.hairColor, 1)
  switch (L.beard) {
    case 'none':
      return
    case 'stubble': {
      ctx.fillStyle = col
      ctx.globalAlpha = 0.28
      ctx.beginPath()
      ctx.arc(fx * 0.6, hy + R * 0.2, R * 0.86, Math.PI * 0.2, Math.PI * 0.8)
      ctx.quadraticCurveTo(fx * 0.6, hy + R * 0.55, fx * 0.6 + R * 0.7, hy + R * 0.55)
      ctx.closePath()
      ctx.fill()
      ctx.globalAlpha = 1
      break
    }
    case 'goatee': {
      ctx.fillStyle = col
      ctx.globalAlpha = 0.75
      // 콧수염
      ellipse(ctx, fx, fy + R * 0.42, R * 0.3, R * 0.07)
      ctx.fill()
      // 턱수염
      ellipse(ctx, fx, fy + R * 0.78, R * 0.22, R * 0.16)
      ctx.fill()
      ctx.globalAlpha = 0.28
      ctx.beginPath()
      ctx.arc(fx * 0.6, hy + R * 0.2, R * 0.86, Math.PI * 0.15, Math.PI * 0.85)
      ctx.closePath()
      ctx.fill()
      ctx.globalAlpha = 1
      break
    }
    case 'full': {
      ctx.fillStyle = col
      ctx.globalAlpha = 0.85
      ctx.beginPath()
      ctx.arc(0, hy, R * 0.99, Math.PI * 0.12, Math.PI * 0.88)
      ctx.arc(0, hy + R * 0.05, R * 0.66, Math.PI * 0.88, Math.PI * 0.12, true)
      ctx.closePath()
      ctx.fill()
      // 콧수염
      ellipse(ctx, fx, fy + R * 0.4, R * 0.32, R * 0.08)
      ctx.fill()
      ctx.globalAlpha = 1
      break
    }
  }
}

/** 게임 화면용: 몸 → 머리 순서로 그린다. 스케일은 호출측에서 적용. */
export function drawCharacter(ctx: CanvasRenderingContext2D, def: CharacterDef, o: CharDrawOpts): void {
  drawBody(ctx, def, o)
  drawHead(ctx, def, o)
}

/** 로비 초상화 (정면, 크게) */
export function drawPortrait(canvas: HTMLCanvasElement, def: CharacterDef, facing = -Math.PI / 2 + 0.6): void {
  const ctx = canvas.getContext('2d')!
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const size = canvas.clientWidth || 64
  canvas.width = size * dpr
  canvas.height = size * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, size, size)
  const s = size / 64
  ctx.save()
  ctx.translate(size / 2, size * 0.82)
  ctx.scale(1.5 * s, 1.5 * s)
  drawCharacter(ctx, def, { facing, sx: 1, sy: 1, walk: 0, moving: false, flash: 0, t: 0 })
  ctx.restore()
}

/** 죽었을 때 납작하게 */
export function drawFlat(ctx: CanvasRenderingContext2D, def: CharacterDef, alpha: number): void {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.scale(1.4, 0.32)
  ctx.fillStyle = hex(def.look.skin)
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 2
  circle(ctx, 0, -14, 12.5 * def.look.headScale)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = hex(def.look.shirt)
  rrect(ctx, -11 * def.look.bodyScale, -8, 22 * def.look.bodyScale, 14, 5)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}
