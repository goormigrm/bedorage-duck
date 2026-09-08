// 조준선(에임) 모양. 사람마다 눈에 들어오는 모양이 달라서 고를 수 있게 한다 (2026-09-08 사용자 요청).
//
// 어느 모양이든 **어두운 외곽선을 먼저 굵게 깔고 밝은 선을 그 위에** 얹는다.
// 그 전에는 흰 선만 그려서 스튜디오 크림색 바닥·마당 연두색 바닥 위에서 그냥 묻혔다.
//
// 이 설정은 **순전히 내 화면 문제**라 P2P 로 보내지 않는다. localStorage 에 두고 HUD 가 직접 읽는다.

export type AimStyle = 'cross' | 'bold' | 'circle' | 'dot'

export const AIM_STYLES: { id: AimStyle; name: string; desc: string }[] = [
  { id: 'cross', name: '십자', desc: '기본. 가운데가 비어 상대가 가려지지 않는다' },
  { id: 'bold', name: '굵은 십자', desc: '가장 잘 보인다. 화면이 조금 가려진다' },
  { id: 'circle', name: '원', desc: '퍼짐이 한눈에 보인다' },
  { id: 'dot', name: '점', desc: '가장 깔끔하다. 정확한 한 점만' },
]

const KEY = 'bd.aim'

export function loadAimStyle(): AimStyle {
  try {
    const v = localStorage.getItem(KEY)
    if (AIM_STYLES.some((s) => s.id === v)) return v as AimStyle
  } catch {
    /* 저장소가 막힌 브라우저 */
  }
  return 'cross'
}

export function saveAimStyle(v: AimStyle): void {
  try {
    localStorage.setItem(KEY, v)
  } catch {
    /* 무시 — 이번 판에만 적용된다 */
  }
}

/**
 * 조준선을 그린다.
 * @param r 퍼짐 반경(정조준이면 작다). 모양에 따라 크기 기준으로 쓴다
 * @param color 밝은 쪽 색 (헤드샷 가능하면 금색)
 */
export function drawAim(
  ctx: CanvasRenderingContext2D,
  style: AimStyle,
  x: number,
  y: number,
  r: number,
  color: string,
): void {
  // 두 번 그린다: 어두운 외곽선 → 밝은 선. 밝은 바닥에서도 묻히지 않게
  const pass = (draw: () => void, w: number) => {
    ctx.strokeStyle = 'rgba(8,10,14,0.8)'
    ctx.lineWidth = w + 3
    ctx.lineCap = 'round'
    draw()
    ctx.strokeStyle = color
    ctx.lineWidth = w
    draw()
  }
  const dot = (rad: number) => {
    ctx.fillStyle = 'rgba(8,10,14,0.8)'
    ctx.beginPath()
    ctx.arc(x, y, rad + 1.4, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, rad, 0, Math.PI * 2)
    ctx.fill()
  }
  const ticks = (gap: number, len: number, w: number) =>
    pass(() => {
      ctx.beginPath()
      ctx.moveTo(x - gap - len, y)
      ctx.lineTo(x - gap, y)
      ctx.moveTo(x + gap, y)
      ctx.lineTo(x + gap + len, y)
      ctx.moveTo(x, y - gap - len)
      ctx.lineTo(x, y - gap)
      ctx.moveTo(x, y + gap)
      ctx.lineTo(x, y + gap + len)
      ctx.stroke()
    }, w)

  switch (style) {
    case 'bold':
      ticks(r, 11, 4)
      dot(2.6)
      break
    case 'circle':
      pass(() => {
        ctx.beginPath()
        ctx.arc(x, y, r + 3, 0, Math.PI * 2)
        ctx.stroke()
      }, 2.5)
      dot(2)
      break
    case 'dot':
      dot(4)
      break
    case 'cross':
    default:
      ticks(r, 8, 2.5)
      dot(2)
      break
  }
}
