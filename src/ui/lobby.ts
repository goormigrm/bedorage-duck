// 로비: 캐릭터 선택 · 맵 선택 · 혼자 하기 · 방 만들기 · 방 목록/참가 · 준비 → 자동 시작

import { Difficulty } from '../core/bot'
import { CHARACTERS, CHARACTER_LIST, CharacterId } from '../core/characters'
import { DEFAULT_MAP, MAPS, MAP_LIST, MapId, isMapId } from '../core/maps'
import { WEAPONS } from '../core/weapons'
import {
  LobbyLink, RoomInfo, RoomLink, makeRoomCode, normalizeCode, openLobby, openRoom, roomCodeFromUrl, roomLinkUrl,
} from '../net/room'
import { drawPortrait } from '../render/character'
import { SessionConfig } from '../game/session'

export interface LobbyHandlers {
  onStart: (cfg: Omit<SessionConfig, 'onExit'>) => void
}

const KILL_OPTIONS = [3, 5, 10]

export class Lobby {
  private char: CharacterId = 'cheolmyeon'
  private mapId: MapId = DEFAULT_MAP
  private killsSolo = 5
  private killsRoom = 5
  private difficulty: Difficulty = 'normal'
  /** 혼자 하기 봇 수 (1~3) */
  private bots = 1
  /** 혼자 하기 모드: 개인전 / 2v2 팀전 (봇 3) */
  private soloMode: 'ffa' | 'teams' = 'ffa'
  private lobbyLink: LobbyLink | null = null
  private link: RoomLink | null = null
  private role: 'host' | 'guest' | null = null
  private peerChar: CharacterId | null = null
  private peerReady = false
  private myReady = false
  private waitTimer = 0
  private rooms: RoomInfo[] = []
  private starting = false
  private disposed = false

  constructor(
    private host: HTMLElement,
    private handlers: LobbyHandlers,
  ) {
    this.render()
    this.openLobbyList()
    const code = roomCodeFromUrl()
    if (code) this.join(code)
  }

  // ---------- 화면 ----------
  private render(): void {
    const h = this.host
    h.innerHTML = `
      <div class="lobby">
        <h1>배도라지 <span>덕</span></h1>
        <p class="tag"><b>1:1 쿼터뷰 슈터</b> · 서버 없는 P2P 대전 · 비공식 팬게임 · <a href="./preview.html" style="color:var(--ink-2)">프리뷰 보기</a></p>

        <div class="section-t">캐릭터</div>
        <div class="chars" id="chars"></div>

        <div class="section-t">맵</div>
        <div class="row" style="margin-bottom:22px"><div class="seg" id="seg-map">
          ${MAP_LIST.map((m) => `<button data-v="${m.id}" class="${m.id === this.mapId ? 'on' : ''}" title="${m.desc}">${m.name}</button>`).join('')}
        </div><span class="hintline" id="map-desc">${MAPS[this.mapId].desc}</span></div>

        <div class="modes">
          <div class="mode">
            <h2>혼자 하기 <span class="k">VS AI</span></h2>
            <p>봇과 대결. 죽으면 3초 뒤 먼 곳에 리스폰, 목표 킬을 먼저 채우면 승리.</p>
            <div class="row"><label>난이도</label><div class="seg" id="seg-diff">
              <button data-v="easy">쉬움</button><button data-v="normal" class="on">보통</button><button data-v="hard">어려움</button>
            </div></div>
            <div class="row"><label>봇 수 · 모드</label><div class="seg" id="seg-bots">
              <button data-v="1" class="on">봇 1</button><button data-v="2">봇 2</button><button data-v="3">봇 3</button>
            </div><div class="seg" id="seg-solo-mode">
              <button data-v="ffa" class="on">개인전</button><button data-v="teams">2v2</button>
            </div></div>
            <div class="row"><label>목표 킬</label><div class="seg" id="seg-kills-solo">
              ${KILL_OPTIONS.map((k) => `<button data-v="${k}" class="${k === 5 ? 'on' : ''}">${k}</button>`).join('')}
            </div></div>
            <div class="row"><button class="btn" id="btn-solo">시작</button></div>
          </div>

          <div class="mode">
            <h2>방 만들기 <span class="k">HOST</span></h2>
            <p>방을 열면 아래 방 목록에 바로 보입니다. 둘 다 준비를 누르면 자동으로 시작합니다.</p>
            <div class="row"><label>목표 킬</label><div class="seg" id="seg-kills-room">
              ${KILL_OPTIONS.map((k) => `<button data-v="${k}" class="${k === 5 ? 'on' : ''}">${k}</button>`).join('')}
            </div></div>
            <div class="row"><button class="btn" id="btn-host">방 만들기</button></div>
          </div>

          <div class="mode">
            <h2>방 목록 <span class="k" id="online">접속 확인 중</span></h2>
            <div class="rooms" id="rooms"><div class="empty">열린 방이 없습니다. 방을 만들거나 잠시 기다려 보세요.</div></div>
            <div class="row"><input class="code" id="join-code" maxlength="6" placeholder="코드 직접 입력" autocomplete="off" spellcheck="false"><button class="btn secondary" id="btn-join">참가</button></div>
          </div>
        </div>

        <div class="status" id="status"></div>

        <div class="foot">비공식 팬 프로젝트 · 비상업 · 문의 시 즉시 삭제 · <a href="https://github.com/goormigrm/bedorage-duck">github.com/goormigrm/bedorage-duck</a></div>
      </div>`

    const chars = h.querySelector('#chars') as HTMLElement
    for (const c of CHARACTER_LIST) {
      const el = document.createElement('button')
      el.className = 'char' + (c.id === this.char ? ' on' : '')
      el.dataset.id = c.id
      el.innerHTML = `
        <canvas></canvas>
        <div>
          <b>${c.name}</b>
          <small>${c.basedOn} · ${WEAPONS[c.weapon].name} · HP ${c.maxHp}</small>
          <div class="pv"><b style="display:inline;font-size:12px">${c.passiveName}</b> ${c.passiveDesc}</div>
        </div>`
      el.onclick = () => this.selectChar(c.id)
      chars.appendChild(el)
      const cv = el.querySelector('canvas') as HTMLCanvasElement
      requestAnimationFrame(() => drawPortrait(cv, c))
    }

    this.seg('#seg-map', (v) => {
      if (isMapId(v)) this.mapId = v
      ;(h.querySelector('#map-desc') as HTMLElement).textContent = MAPS[this.mapId].desc
      this.announce()
    })
    this.seg('#seg-diff', (v) => (this.difficulty = v as Difficulty))
    this.seg('#seg-bots', (v) => {
      this.bots = Number(v)
      if (this.bots !== 3 && this.soloMode === 'teams') this.setSeg('#seg-solo-mode', 'ffa')
    })
    this.seg('#seg-solo-mode', (v) => {
      this.soloMode = v as 'ffa' | 'teams'
      if (this.soloMode === 'teams') this.setSeg('#seg-bots', '3')
    })
    this.seg('#seg-kills-solo', (v) => (this.killsSolo = Number(v)))
    this.seg('#seg-kills-room', (v) => {
      this.killsRoom = Number(v)
      this.announce()
      if (this.role === 'host') this.renderRoom()
    })
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

  private selectChar(id: CharacterId): void {
    this.char = id
    this.host.querySelectorAll('.char').forEach((x) => x.classList.toggle('on', (x as HTMLElement).dataset.id === id))
    if (this.myReady) this.myReady = false
    this.sendHello()
    this.announce()
    if (this.role) this.renderRoom()
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

  /** 세그먼트 값을 코드에서 바꾸고 콜백까지 실행 */
  private setSeg(sel: string, v: string): void {
    const el = this.host.querySelector(sel) as HTMLElement | null
    const b = el?.querySelector(`button[data-v="${v}"]`) as HTMLButtonElement | null
    b?.click()
  }

  private status(text: string, kind: '' | 'ok' | 'bad' = '', html = ''): void {
    const s = this.host.querySelector('#status') as HTMLElement
    s.classList.add('show')
    s.innerHTML = html + (text ? `<div class="st ${kind}">${text}</div>` : '')
  }

  private hideStatus(): void {
    ;(this.host.querySelector('#status') as HTMLElement).classList.remove('show')
  }

  // ---------- 방 목록 ----------
  private openLobbyList(): void {
    if (this.lobbyLink) return
    this.lobbyLink = openLobby()
    this.lobbyLink.onRooms((rooms) => {
      this.rooms = rooms
      this.renderRooms()
    })
    setInterval(() => {
      if (this.disposed) return
      const el = this.host.querySelector('#online')
      if (el && this.lobbyLink) el.textContent = `접속 ${this.lobbyLink.onlineCount()}명`
    }, 1500)
  }

  private renderRooms(): void {
    const el = this.host.querySelector('#rooms') as HTMLElement | null
    if (!el) return
    const visible = this.rooms.filter((r) => r.state !== 'closed' && !(this.link && r.code === this.link.code))
    if (visible.length === 0) {
      el.innerHTML = '<div class="empty">열린 방이 없습니다. 방을 만들거나 잠시 기다려 보세요.</div>'
      return
    }
    el.innerHTML = visible
      .map((r) => {
        const c = (CHARACTERS as Record<string, { name: string } | undefined>)[r.hostChar]
        const m = isMapId(r.map) ? MAPS[r.map].name : r.map
        const st = r.state === 'open' ? '<span class="pill ok">참가 가능</span>' : r.state === 'full' ? '<span class="pill">대기 중</span>' : '<span class="pill">게임 중</span>'
        return `<div class="room"><div><b>${c ? c.name : r.hostChar}</b>의 방 <span class="code-sm">${r.code}</span><br><small>${m} · 목표 ${r.targetKills}킬</small></div>
          <div>${st} <button class="btn" data-code="${r.code}" ${r.state === 'open' ? '' : 'disabled'}>참가</button></div></div>`
      })
      .join('')
    el.querySelectorAll('button[data-code]').forEach((b) => {
      ;(b as HTMLButtonElement).onclick = () => this.join((b as HTMLElement).dataset.code!)
    })
  }

  private announce(): void {
    if (!this.lobbyLink || this.role !== 'host' || !this.link) return
    this.lobbyLink.announce({
      code: this.link.code,
      hostChar: this.char,
      map: this.mapId,
      targetKills: this.killsRoom,
      state: this.link.peerId ? 'full' : 'open',
    })
  }

  // ---------- 혼자 하기 ----------
  private startSolo(): void {
    // 봇은 나와 다른 캐릭터를 우선, 모자라면 중복 허용
    const chars: CharacterId[] = [this.char]
    const pool = CHARACTER_LIST.map((c) => c.id)
    while (chars.length < 1 + this.bots) {
      const rest = pool.filter((id) => !chars.includes(id))
      const pick = rest.length > 0 ? rest : pool
      chars.push(pick[Math.floor(Math.random() * pick.length)])
    }
    const teams = this.soloMode === 'teams' && chars.length === 4 ? [0, 1, 0, 1] : undefined
    this.handlers.onStart({
      mode: 'solo',
      chars,
      teams,
      targetKills: this.killsSolo,
      seed: (Math.random() * 0xffffffff) >>> 0,
      localPlayer: 0,
      mapId: this.mapId,
      difficulty: this.difficulty,
    })
  }

  // ---------- 방 만들기 / 참가 ----------
  private hostRoom(): void {
    this.closeLink()
    const code = makeRoomCode()
    this.role = 'host'
    this.link = openRoom(code, 'host')
    history.replaceState(null, '', `#room=${code}`)
    this.wireLink()
    this.announce()
    this.renderRoom()
    this.renderRooms()
  }

  private join(code: string): void {
    this.closeLink()
    this.role = 'guest'
    this.link = openRoom(code, 'guest')
    history.replaceState(null, '', `#room=${code}`)
    this.wireLink()
    this.renderRoom()
    this.waitTimer = window.setTimeout(() => {
      if (this.link && !this.link.peerId) {
        this.status(
          '연결되지 않았습니다. 방이 아직 열려 있는지 확인하세요. 회사·학교망이면 폰 핫스팟으로 시도해 보세요.',
          'bad',
          `<div class="row"><button class="btn secondary" id="btn-cancel">닫기</button></div>`,
        )
        this.bindCancel()
        this.closeLink()
      }
    }, 20000)
  }

  private wireLink(): void {
    const link = this.link!
    link.onPeerJoin((id) => {
      if (link.peerId) return // 1:1 — 세 번째 이후는 무시
      link.peerId = id
      clearTimeout(this.waitTimer)
      this.peerReady = false
      this.sendHello()
      this.announce()
      this.renderRoom()
    })
    link.onPeerLeave((id) => {
      if (link.peerId !== id) return
      link.peerId = null
      this.peerChar = null
      this.peerReady = false
      this.myReady = false
      this.announce()
      this.renderRoom()
    })
    link.onCtl((m) => {
      if (m.t === 'hello') {
        this.peerChar = m.char as CharacterId
        this.peerReady = m.ready
        this.renderRoom()
        this.maybeStart()
      } else if (m.t === 'ready') {
        this.peerChar = m.char as CharacterId
        this.peerReady = m.v
        this.renderRoom()
        this.maybeStart()
      } else if (m.t === 'start' && this.role === 'guest') {
        const chars = m.chars as [CharacterId, CharacterId]
        this.launch({
          mode: 'p2p',
          chars,
          targetKills: m.targetKills,
          seed: m.seed,
          localPlayer: 1,
          mapId: isMapId(m.map) ? m.map : DEFAULT_MAP,
          link,
          delay: m.delay,
        })
      } else if (m.t === 'full') {
        this.status('방이 가득 찼습니다.', 'bad')
        this.closeLink()
      }
    })
  }

  private sendHello(): void {
    if (!this.link || !this.link.peerId) return
    this.link.sendCtl({ t: 'hello', role: this.role ?? 'guest', char: this.char, ready: this.myReady })
  }

  private toggleReady(): void {
    if (!this.link || !this.link.peerId) return
    this.myReady = !this.myReady
    this.link.sendCtl({ t: 'ready', v: this.myReady, char: this.char })
    this.renderRoom()
    this.maybeStart()
  }

  /** 호스트: 둘 다 준비면 시작 */
  private maybeStart(): void {
    if (this.role !== 'host' || this.starting) return
    const link = this.link
    if (!link || !link.peerId || !this.peerChar || !this.myReady || !this.peerReady) return
    this.starting = true
    const seed = (Math.random() * 0xffffffff) >>> 0
    const delay = Math.max(2, Math.min(6, Math.ceil(link.rtt / 2 / 16.7) + 1))
    const chars: [CharacterId, CharacterId] = [this.char, this.peerChar]
    link.sendCtl({ t: 'start', seed, targetKills: this.killsRoom, chars, delay, map: this.mapId })
    if (this.lobbyLink) this.lobbyLink.announce({ code: link.code, hostChar: this.char, map: this.mapId, targetKills: this.killsRoom, state: 'playing' })
    setTimeout(() => {
      this.launch({ mode: 'p2p', chars, targetKills: this.killsRoom, seed, localPlayer: 0, mapId: this.mapId, link, delay })
    }, 150)
  }

  private launch(cfg: Omit<SessionConfig, 'onExit'>): void {
    const link = this.link
    this.link = null // 세션이 링크를 가져간다
    if (this.lobbyLink) {
      this.lobbyLink.leave()
      this.lobbyLink = null
    }
    void link
    this.handlers.onStart(cfg)
  }

  private renderRoom(): void {
    const link = this.link
    if (!link) return
    const me = CHARACTERS[this.char]
    const pc = this.peerChar ? CHARACTERS[this.peerChar] : null
    const url = roomLinkUrl(link.code)
    const connected = !!link.peerId
    const title = this.role === 'host' ? `내 방 <span class="code-sm">${link.code}</span>` : `방 <span class="code-sm">${link.code}</span>`
    const slot = (name: string, c: { name: string } | null, ready: boolean, mine: boolean) => `
      <div class="slot ${ready ? 'ready' : ''}">
        <div class="who">${name}</div>
        <div class="cname">${c ? c.name : mine ? me.name : connected ? '선택 중…' : '기다리는 중…'}</div>
        <div class="rd">${c || mine ? (ready ? '준비 완료' : '준비 안 됨') : ''}</div>
      </div>`
    const html = `
      <div class="room-head"><div class="section-t" style="margin:0">${title}</div>
        <div class="row"><button class="btn secondary" id="btn-copy">링크 복사</button><button class="btn secondary" id="btn-cancel">${this.role === 'host' ? '방 닫기' : '나가기'}</button></div></div>
      <div class="link">${url}</div>
      <div class="slots">
        ${slot(this.role === 'host' ? '나 (호스트)' : '나', me, this.myReady, true)}
        <div class="vs">VS</div>
        ${slot(this.role === 'host' ? '상대' : '호스트', pc, this.peerReady, false)}
      </div>
      <div class="row" style="margin-top:12px">
        <button class="btn" id="btn-ready" ${connected ? '' : 'disabled'}>${this.myReady ? '준비 취소' : '준비'}</button>
        <span class="hintline">${MAPS[this.mapId].name} · 목표 ${this.killsRoom}킬 · ${connected ? `${link.rtt} ms` : '상대 기다리는 중'} · 둘 다 준비되면 자동 시작</span>
      </div>`
    const st = !connected
      ? this.role === 'host'
        ? '방 목록에 올라갔습니다. 상대가 들어오길 기다리는 중…'
        : '연결 중… (최대 20초)'
      : this.myReady && this.peerReady
        ? '둘 다 준비. 시작합니다…'
        : this.myReady
          ? '상대 준비를 기다리는 중…'
          : '준비를 누르세요.'
    this.status(st, connected ? 'ok' : '', html)
    const copy = this.host.querySelector('#btn-copy') as HTMLButtonElement
    copy.onclick = () => void navigator.clipboard.writeText(url).then(() => (copy.textContent = '복사됨'))
    this.bindCancel()
    ;(this.host.querySelector('#btn-ready') as HTMLButtonElement).onclick = () => this.toggleReady()
  }

  private bindCancel(): void {
    const cancel = this.host.querySelector('#btn-cancel') as HTMLButtonElement | null
    if (cancel) {
      cancel.onclick = () => {
        this.closeLink()
        this.hideStatus()
        history.replaceState(null, '', location.pathname)
        this.renderRooms()
      }
    }
  }

  private closeLink(): void {
    clearTimeout(this.waitTimer)
    if (this.link) {
      if (this.role === 'host' && this.lobbyLink) this.lobbyLink.announce(null)
      this.link.sendCtl({ t: 'leave' })
      this.link.leave()
      this.link = null
    }
    this.peerChar = null
    this.peerReady = false
    this.myReady = false
    this.role = null
    this.starting = false
  }

  dispose(): void {
    this.disposed = true
    this.closeLink()
    if (this.lobbyLink) {
      this.lobbyLink.leave()
      this.lobbyLink = null
    }
  }
}
