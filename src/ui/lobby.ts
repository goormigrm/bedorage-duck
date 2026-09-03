// 로비: 캐릭터 선택 · 혼자 하기 · 방 만들기 · 방 참가

import { Difficulty } from '../core/bot'
import { CHARACTER_LIST, CharacterId, PROTAGONIST } from '../core/characters'
import { WEAPONS } from '../core/weapons'
import { makeRoomCode, normalizeCode, openRoom, roomCodeFromUrl, roomLinkUrl, RoomLink } from '../net/room'
import { drawPortrait } from '../render/character'
import { SessionConfig } from '../game/session'

export interface LobbyHandlers {
  onStart: (cfg: Omit<SessionConfig, 'onExit'>) => void
}

const KILL_OPTIONS = [3, 5, 10]

export class Lobby {
  private char: CharacterId = PROTAGONIST.id
  private killsSolo = 5
  private killsRoom = 5
  private difficulty: Difficulty = 'normal'
  private link: RoomLink | null = null
  private peerChar: CharacterId | null = null
  private role: 'host' | 'guest' | null = null
  private waitTimer = 0

  constructor(
    private host: HTMLElement,
    private handlers: LobbyHandlers,
  ) {
    this.render()
    const code = roomCodeFromUrl()
    if (code) {
      const input = this.host.querySelector('#join-code') as HTMLInputElement
      input.value = code
      this.join(code)
    }
  }

  private render(): void {
    const h = this.host
    h.innerHTML = `
      <div class="lobby">
        <h1>배도라지 <span>덕</span></h1>
        <p class="tag"><b>1:1 쿼터뷰 슈터</b> · 서버 없는 P2P 대전 · 비공식 팬게임 · <a href="./preview.html" style="color:var(--ink-2)">프리뷰 보기</a></p>

        <div class="section-t">캐릭터 선택</div>
        <div class="chars" id="chars"></div>

        <div class="modes">
          <div class="mode">
            <h2>혼자 하기 <span class="k">VS AI</span></h2>
            <p>봇과 대결합니다. 죽으면 3초 뒤 랜덤 리스폰, 목표 킬을 먼저 채우면 승리.</p>
            <div class="row"><label>난이도</label><div class="seg" id="seg-diff">
              <button data-v="easy">쉬움</button><button data-v="normal" class="on">보통</button><button data-v="hard">어려움</button>
            </div></div>
            <div class="row"><label>목표 킬</label><div class="seg" id="seg-kills-solo">
              ${KILL_OPTIONS.map((k) => `<button data-v="${k}" class="${k === 5 ? 'on' : ''}">${k}</button>`).join('')}
            </div></div>
            <div class="row"><button class="btn" id="btn-solo">시작</button></div>
          </div>

          <div class="mode">
            <h2>방 만들기 <span class="k">HOST</span></h2>
            <p>목표 킬 수를 정하고 코드나 링크를 친구에게 보냅니다.</p>
            <div class="row"><label>목표 킬</label><div class="seg" id="seg-kills-room">
              ${KILL_OPTIONS.map((k) => `<button data-v="${k}" class="${k === 5 ? 'on' : ''}">${k}</button>`).join('')}
            </div></div>
            <div class="row"><button class="btn" id="btn-host">방 만들기</button></div>
          </div>

          <div class="mode">
            <h2>방 참가 <span class="k">JOIN</span></h2>
            <p>친구가 보낸 6자리 코드를 넣습니다. 링크로 열었다면 자동으로 채워집니다.</p>
            <div class="row"><input class="code" id="join-code" maxlength="6" placeholder="ABC123" autocomplete="off" spellcheck="false"></div>
            <div class="row"><button class="btn" id="btn-join">참가</button></div>
          </div>
        </div>

        <div class="status" id="status"></div>

        <div class="foot">비공식 팬 프로젝트 · 비상업 · 문의 시 즉시 삭제 · <a href="https://github.com/goormigrm/bedorage-duck">github.com/goormigrm/bedorage-duck</a></div>
      </div>`

    // 캐릭터 카드
    const chars = h.querySelector('#chars') as HTMLElement
    for (const c of CHARACTER_LIST) {
      const el = document.createElement('button')
      el.className = 'char' + (c.prominence === 1 ? ' hero' : '') + (c.id === this.char ? ' on' : '')
      el.dataset.id = c.id
      el.innerHTML = `
        <canvas></canvas>
        <div>
          <b>${c.name}${c.prominence === 1 ? ' <span class="badge">배도라지장</span>' : ''}</b>
          <small>${c.basedOn} · ${WEAPONS[c.weapon].name} · HP ${c.maxHp}</small>
          <div class="pv"><b style="display:inline;font-size:12px">${c.passiveName}</b> ${c.passiveDesc}</div>
        </div>`
      el.onclick = () => {
        this.char = c.id
        chars.querySelectorAll('.char').forEach((x) => x.classList.toggle('on', (x as HTMLElement).dataset.id === c.id))
        this.sendHello()
      }
      chars.appendChild(el)
      const cv = el.querySelector('canvas') as HTMLCanvasElement
      requestAnimationFrame(() => drawPortrait(cv, c))
    }

    this.seg('#seg-diff', (v) => (this.difficulty = v as Difficulty))
    this.seg('#seg-kills-solo', (v) => (this.killsSolo = Number(v)))
    this.seg('#seg-kills-room', (v) => (this.killsRoom = Number(v)))
    ;(h.querySelector('#btn-solo') as HTMLButtonElement).onclick = () => this.startSolo()
    ;(h.querySelector('#btn-host') as HTMLButtonElement).onclick = () => this.hostRoom()
    ;(h.querySelector('#btn-join') as HTMLButtonElement).onclick = () => {
      const code = normalizeCode((h.querySelector('#join-code') as HTMLInputElement).value)
      if (code.length < 4) return this.status('코드를 확인해 주세요.', 'bad')
      this.join(code)
    }
    ;(h.querySelector('#join-code') as HTMLInputElement).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') (h.querySelector('#btn-join') as HTMLButtonElement).click()
    })
  }

  private seg(sel: string, cb: (v: string) => void): void {
    const el = this.host.querySelector(sel) as HTMLElement
    el.querySelectorAll('button').forEach((b) => {
      b.onclick = () => {
        el.querySelectorAll('button').forEach((x) => x.classList.remove('on'))
        b.classList.add('on')
        cb(b.dataset.v!)
      }
    })
  }

  private status(text: string, kind: '' | 'ok' | 'bad' = '', html = ''): void {
    const s = this.host.querySelector('#status') as HTMLElement
    s.classList.add('show')
    s.innerHTML = html + `<div class="st ${kind}">${text}</div>`
  }

  private startSolo(): void {
    const others = CHARACTER_LIST.filter((c) => c.id !== this.char)
    const ai = others[Math.floor(Math.random() * others.length)]
    this.handlers.onStart({
      mode: 'solo',
      chars: [this.char, ai.id],
      targetKills: this.killsSolo,
      seed: (Math.random() * 0xffffffff) >>> 0,
      localPlayer: 0,
      difficulty: this.difficulty,
    })
  }

  // ---------- P2P ----------
  private hostRoom(): void {
    this.closeLink()
    const code = makeRoomCode()
    this.role = 'host'
    this.link = openRoom(code, 'host')
    const url = roomLinkUrl(code)
    history.replaceState(null, '', `#room=${code}`)
    this.status(
      '상대를 기다리는 중… (코드나 링크를 친구에게 보내세요)',
      '',
      `<div class="section-t">방 코드</div><div class="code-big">${code}</div>
       <div class="link">${url}</div>
       <div class="row" style="margin-top:8px"><button class="btn secondary" id="btn-copy">링크 복사</button><button class="btn secondary" id="btn-cancel">취소</button></div>`,
    )
    this.bindStatusButtons(url)
    this.wireLink()
  }

  private join(code: string): void {
    this.closeLink()
    this.role = 'guest'
    this.link = openRoom(code, 'guest')
    history.replaceState(null, '', `#room=${code}`)
    this.status(
      `방 ${code} 에 연결 중… (최대 20초)`,
      '',
      `<div class="row"><button class="btn secondary" id="btn-cancel">취소</button></div>`,
    )
    this.bindStatusButtons(null)
    this.wireLink()
    this.waitTimer = window.setTimeout(() => {
      if (this.link && !this.link.peerId) {
        this.status(
          '연결되지 않았습니다. 코드가 맞는지, 호스트가 방을 열어 두었는지 확인하세요. 회사·학교망이면 폰 핫스팟으로 시도해 보세요.',
          'bad',
          `<div class="row"><button class="btn secondary" id="btn-cancel">닫기</button></div>`,
        )
        this.bindStatusButtons(null)
        this.closeLink()
      }
    }, 20000)
  }

  private bindStatusButtons(url: string | null): void {
    const copy = this.host.querySelector('#btn-copy') as HTMLButtonElement | null
    if (copy && url) {
      copy.onclick = () => {
        void navigator.clipboard.writeText(url).then(() => (copy.textContent = '복사됨'))
      }
    }
    const cancel = this.host.querySelector('#btn-cancel') as HTMLButtonElement | null
    if (cancel) {
      cancel.onclick = () => {
        this.closeLink()
        ;(this.host.querySelector('#status') as HTMLElement).classList.remove('show')
        history.replaceState(null, '', location.pathname)
      }
    }
  }

  private wireLink(): void {
    const link = this.link!
    link.onPeerJoin((id) => {
      if (link.peerId) return // 3번째 이후 피어는 무시 (1:1)
      link.peerId = id
      clearTimeout(this.waitTimer)
      this.sendHello()
      if (this.role === 'host') this.renderHostWaiting()
      else this.status('연결됨. 호스트가 시작하길 기다리는 중…', 'ok', this.peerBlock())
    })
    link.onPeerLeave((id) => {
      if (link.peerId !== id) return
      link.peerId = null
      this.peerChar = null
      if (this.role === 'host') {
        this.status('상대가 나갔습니다. 다시 기다리는 중…', 'bad', this.hostBlock())
        this.bindStatusButtons(roomLinkUrl(link.code))
      } else {
        this.status('호스트와의 연결이 끊겼습니다.', 'bad', `<div class="row"><button class="btn secondary" id="btn-cancel">닫기</button></div>`)
        this.bindStatusButtons(null)
      }
    })
    link.onCtl((m) => {
      if (m.t === 'hello') {
        this.peerChar = m.char as CharacterId
        if (this.role === 'host') this.renderHostWaiting()
        else this.status('연결됨. 호스트가 시작하길 기다리는 중…', 'ok', this.peerBlock())
      } else if (m.t === 'start' && this.role === 'guest') {
        const chars = m.chars as [CharacterId, CharacterId]
        this.handlers.onStart({
          mode: 'p2p',
          chars,
          targetKills: m.targetKills,
          seed: m.seed,
          localPlayer: 1,
          link,
          delay: m.delay,
        })
        this.link = null
      } else if (m.t === 'full') {
        this.status('방이 가득 찼습니다.', 'bad')
        this.closeLink()
      }
    })
  }

  private sendHello(): void {
    if (!this.link || !this.link.peerId) return
    this.link.sendCtl({ t: 'hello', role: this.role ?? 'guest', char: this.char, name: '' })
  }

  private hostBlock(): string {
    const code = this.link?.code ?? ''
    const url = roomLinkUrl(code)
    return `<div class="section-t">방 코드</div><div class="code-big">${code}</div><div class="link">${url}</div>
      <div class="row" style="margin-top:8px"><button class="btn secondary" id="btn-copy">링크 복사</button><button class="btn secondary" id="btn-cancel">방 닫기</button></div>`
  }

  private peerBlock(): string {
    const pc = this.peerChar ? CHARACTER_LIST.find((c) => c.id === this.peerChar) : null
    const me = CHARACTER_LIST.find((c) => c.id === this.char)!
    return `<div class="row"><span>나: <b>${me.name}</b></span><span style="color:var(--ink-3)">vs</span><span>상대: <b>${pc ? pc.name : '선택 중…'}</b></span>
      <span style="color:var(--ink-3);font-family:'IBM Plex Mono',monospace;font-size:12px">${this.link?.rtt ?? 0} ms</span></div>`
  }

  private renderHostWaiting(): void {
    const ready = !!this.peerChar
    this.status(
      ready ? '상대가 준비됐습니다. 시작을 누르세요.' : '상대가 캐릭터를 고르는 중…',
      ready ? 'ok' : '',
      this.hostBlock() + this.peerBlock() + `<div class="row" style="margin-top:10px"><button class="btn" id="btn-start" ${ready ? '' : 'disabled'}>게임 시작 (목표 ${this.killsRoom}킬)</button></div>`,
    )
    this.bindStatusButtons(roomLinkUrl(this.link!.code))
    const start = this.host.querySelector('#btn-start') as HTMLButtonElement | null
    if (start) start.onclick = () => this.hostStart()
  }

  private hostStart(): void {
    const link = this.link
    if (!link || !link.peerId || !this.peerChar) return
    const seed = (Math.random() * 0xffffffff) >>> 0
    const delay = Math.max(2, Math.min(6, Math.ceil(link.rtt / 2 / 16.7) + 1))
    const chars: [CharacterId, CharacterId] = [this.char, this.peerChar]
    link.sendCtl({ t: 'start', seed, targetKills: this.killsRoom, chars, delay })
    // 게스트가 메시지를 받을 시간을 조금 준다
    setTimeout(() => {
      this.handlers.onStart({ mode: 'p2p', chars, targetKills: this.killsRoom, seed, localPlayer: 0, link, delay })
      this.link = null
    }, 150)
  }

  private closeLink(): void {
    clearTimeout(this.waitTimer)
    if (this.link) {
      this.link.leave()
      this.link = null
    }
    this.peerChar = null
    this.role = null
  }

  dispose(): void {
    this.closeLink()
  }
}
