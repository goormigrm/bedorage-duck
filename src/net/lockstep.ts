// 결정론적 락스텝 입력 버퍼 (2~4인). 매 틱 내 입력을 미래 틱(t + delay)에 넣고 모두에게 보낸다.
// 최근 8틱 입력을 한 패킷에 중복 전송해 손실을 흡수한다. 누구 하나라도 입력이 없는 틱은 진행하지 않는다(스톨).
// 이탈한 사람은 drop() 으로 표시하면 그 사람 입력은 빈 입력으로 간주한다.

import { EMPTY_INPUT, INPUT_BYTES, Input, cloneInput, readInput, writeInput } from '../core/input'
import { RoomLink } from './room'

const REDUNDANCY = 8

export class Lockstep {
  /** 플레이어별 틱 → 입력 */
  private inputs: Map<number, Input>[] = []
  private dropped: boolean[] = []
  latestRemoteTick = -1

  constructor(
    private link: RoomLink,
    readonly delay: number,
    private me: number,
    /** 피어 id → 플레이어 인덱스 */
    private peerIndex: Map<string, number>,
    count: number,
  ) {
    for (let i = 0; i < count; i++) {
      const m = new Map<number, Input>()
      for (let t = 0; t < delay; t++) m.set(t, cloneInput(EMPTY_INPUT))
      this.inputs.push(m)
      this.dropped.push(false)
    }
    link.onInput((buf, from) => this.receive(buf, from))
  }

  /** 틱 t 에서 샘플한 입력을 t+delay 에 배정하고 전송 */
  pushLocal(t: number, input: Input): void {
    const target = t + this.delay
    const mine = this.inputs[this.me]
    if (!mine.has(target)) mine.set(target, cloneInput(input))
    this.send(target)
  }

  private send(latest: number): void {
    const mine = this.inputs[this.me]
    const count = Math.min(REDUNDANCY, latest + 1)
    const buf = new ArrayBuffer(5 + count * INPUT_BYTES)
    const v = new DataView(buf)
    v.setUint32(0, latest)
    v.setUint8(4, count)
    for (let i = 0; i < count; i++) {
      const inp = mine.get(latest - i) ?? EMPTY_INPUT
      writeInput(v, 5 + i * INPUT_BYTES, inp)
    }
    this.link.sendInput(new Uint8Array(buf))
  }

  private receive(raw: Uint8Array | ArrayBuffer, from: string): void {
    const idx = this.peerIndex.get(from)
    if (idx === undefined || idx === this.me) return
    const buf = raw instanceof Uint8Array ? raw : new Uint8Array(raw)
    if (buf.byteLength < 5) return
    const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    const latest = v.getUint32(0)
    const count = v.getUint8(4)
    const m = this.inputs[idx]
    for (let i = 0; i < count; i++) {
      const t = latest - i
      if (t < 0 || m.has(t)) continue
      m.set(t, readInput(v, 5 + i * INPUT_BYTES))
    }
    if (latest > this.latestRemoteTick) this.latestRemoteTick = latest
  }

  /** 모두의 입력이 있는가 (이탈자는 제외) */
  hasAll(t: number): boolean {
    for (let i = 0; i < this.inputs.length; i++) {
      if (this.dropped[i]) continue
      if (!this.inputs[i].has(t)) return false
    }
    return true
  }

  /** 틱 t 의 입력을 플레이어 순서대로 */
  get(t: number): Input[] {
    return this.inputs.map((m, i) => (this.dropped[i] ? EMPTY_INPUT : (m.get(t) ?? EMPTY_INPUT)))
  }

  /** 이탈: 이후 그 사람 입력은 기다리지 않는다 */
  drop(idx: number): void {
    if (idx >= 0 && idx < this.dropped.length) this.dropped[idx] = true
  }

  isDropped(idx: number): boolean {
    return this.dropped[idx] === true
  }

  /** 오래된 입력 정리 (리싱크용으로 600틱은 남긴다) */
  prune(currentTick: number): void {
    const cut = currentTick - 600
    if (cut <= 0) return
    for (const m of this.inputs) for (const k of m.keys()) if (k < cut) m.delete(k)
  }
}
