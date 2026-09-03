// 결정론적 락스텝 입력 버퍼. 매 틱 내 입력을 미래 틱(t + delay)에 넣고,
// 최근 8틱 입력을 한 패킷에 중복 전송한다. 상대 입력이 없는 틱은 진행하지 않는다(스톨).

import { EMPTY_INPUT, INPUT_BYTES, Input, cloneInput, readInput, writeInput } from '../core/input'
import { RoomLink } from './room'

const REDUNDANCY = 8

export class Lockstep {
  readonly local = new Map<number, Input>()
  readonly remote = new Map<number, Input>()
  latestRemoteTick = -1

  constructor(
    private link: RoomLink,
    readonly delay: number,
  ) {
    for (let t = 0; t < delay; t++) {
      this.local.set(t, cloneInput(EMPTY_INPUT))
      this.remote.set(t, cloneInput(EMPTY_INPUT))
    }
    link.onInput((buf) => this.receive(buf))
  }

  /** 틱 t 에서 샘플한 입력을 t+delay 에 배정하고 전송 */
  pushLocal(t: number, input: Input): void {
    const target = t + this.delay
    if (!this.local.has(target)) this.local.set(target, cloneInput(input))
    this.send(target)
  }

  private send(latest: number): void {
    const count = Math.min(REDUNDANCY, latest + 1)
    const buf = new ArrayBuffer(5 + count * INPUT_BYTES)
    const v = new DataView(buf)
    v.setUint32(0, latest)
    v.setUint8(4, count)
    for (let i = 0; i < count; i++) {
      const inp = this.local.get(latest - i) ?? EMPTY_INPUT
      writeInput(v, 5 + i * INPUT_BYTES, inp)
    }
    this.link.sendInput(new Uint8Array(buf))
  }

  private receive(buf: Uint8Array): void {
    if (buf.byteLength < 5) return
    const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    const latest = v.getUint32(0)
    const count = v.getUint8(4)
    for (let i = 0; i < count; i++) {
      const t = latest - i
      if (t < 0 || this.remote.has(t)) continue
      this.remote.set(t, readInput(v, 5 + i * INPUT_BYTES))
    }
    if (latest > this.latestRemoteTick) this.latestRemoteTick = latest
  }

  hasBoth(t: number): boolean {
    return this.local.has(t) && this.remote.has(t)
  }

  get(t: number): [Input, Input] {
    return [this.local.get(t) ?? EMPTY_INPUT, this.remote.get(t) ?? EMPTY_INPUT]
  }

  /** 오래된 입력 정리 (리싱크용으로 600틱은 남긴다) */
  prune(currentTick: number): void {
    const cut = currentTick - 600
    if (cut <= 0) return
    for (const k of this.local.keys()) if (k < cut) this.local.delete(k)
    for (const k of this.remote.keys()) if (k < cut) this.remote.delete(k)
  }
}
