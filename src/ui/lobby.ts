// 로비: 캐릭터 선택 · 맵 선택 · 혼자 하기 · 방 만들기 · 방 목록/참가 · 준비 → 자동 시작
// 방은 정원 4명(호스트 + 게스트 3). 멤버 순서·준비·팀은 호스트가 'room' 메시지로 방송하는 것이 정본.

import { Difficulty } from '../core/bot'
import { CHARACTERS, CHARACTER_LIST, CharacterId } from '../core/characters'
import { buildMap } from '../core/map'
import { DEFAULT_MAP, MAPS, MAP_LIST, MapId, isMapId, isMapScale, scaleForPlayers } from '../core/maps'
import { MAX_PLAYERS, MIN_PLAYERS } from '../core/state'
import { WEAPONS } from '../core/weapons'
import {
  CtlMessage, LobbyLink, Member, ROOM_MODE_LABEL, RoomInfo, RoomLink, RoomMode,
  makeRoomCode, normalizeCode, openLobby, openRoom, roomCodeFromUrl, roomLinkUrl,
} from '../net/room'
import { drawPortrait } from '../render/character'
import { drawMapPreview } from '../render/minimap'
import { TEAM_NAMES } from '../render/hud'
import { SessionConfig } from '../game/session'
import { MatchRecord, clearRecords, formatRecord, loadRecords, ranked, recordDate, winnerLabel } from '../game/records'

export interface LobbyHandlers {
  onStart: (cfg: Omit<SessionConfig, 'onExit'>) => void
}

/** 목표 킬: 5~50, 5 단위 */
const KILL_OPTIONS = Array.from({ length: 10 }, (_, i) => (i + 1) * 5)
/** 로비 미리보기용 고정 시드 (실제 판은 매번 다른 시드로 생성된다) */
const PREVIEW_SEED = 20260904

/** 닉네임 등 사용자 입력을 HTML 에 넣기 전에 */
function esc(t: string): string {
  return t.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] ?? ch)
}

export class Lobby {
  private char: CharacterId = 'cheolmyeon'
  private mapId: MapId = DEFAULT_MAP
  private killsSolo = 5
  private killsRoom = 5
  private previewTimer = 0
  private difficulty: Difficulty = 'normal'
  /** 혼자 하기 봇 수 (1~3) */
  private bots = 1
  /** 혼자 하기 모드: 개인전 / 2v2 팀전 (봇 3) */
  private soloMode: 'ffa' | 'teams' = 'ffa'
  private roomMode: RoomMode = 'ffa'
  /** 닉네임 (선택, 8자, localStorage 기억) */
  private nick = ''
  private lobbyLink: LobbyLink | null = null
  private link: RoomLink | null = null
  private role: 'host' | 'guest' | null = null
  /** 방 멤버 (순서 = 플레이어 인덱스, 호스트가 0) */
  private members: Member[] = []
  private hostId: string | null = null
  private myReady = false
  private myTeam = 0
  private waitTimer = 0
  private rooms: RoomInfo[] = []
  private starting = false
  private disposed = false

  constructor(
    private host: HTMLElement,
    private handlers: LobbyHandlers,
  ) {
    try {
      this.nick = (localStorage.getItem('bd.nick') ?? '').slice(0, 8)
    } catch {
      /* 저장소 없음 */
    }
    this.render()
    this.openLobbyList()
    const code = roomCodeFromUrl()
    if (code) {
      if (this.nick.trim().length === 0) {
        this.status(`초대 링크로 들어왔습니다. 닉네임을 입력하고 아래 "참가"를 누르세요. (코드 ${code})`, '')
        const el = this.host.querySelector('#join-code') as HTMLInputElement | null
        if (el) el.value = code
        ;(this.host.querySelector('#nick') as HTMLInputElement | null)?.focus()
      } else {
        this.join(code)
      }
    }
  }

  // ---------- 화면 ----------
  private render(): void {
    const h = this.host
    h.innerHTML = `
      <div class="lobby">
        <div class="season">BEDORAGE DUCK · P2P · 2~4 PLAYERS</div>
        <h1><span class="t1">배도라지</span> <span class="t2">덕</span></h1>
        <p class="tag"><b>최대 4인 쿼터뷰 슈터</b> · 서버 없는 P2P 대전 · 비공식 팬게임</p>
        <div class="feats"><span>덕코프식 시야</span><span>개인전 · 2v2 팀전</span><span>인원에 따라 맵 4배</span><span>리스폰 중 Tab 캐릭터 교체</span><span>설치 없음 · 서버 없음</span></div>

        <div class="section-t">캐릭터 <small>내가 쓸 캐릭터. 리스폰 대기 중에도 바꿀 수 있다</small><input class="nick" id="nick" maxlength="8" placeholder="닉네임 (8자)" value="${this.nick.replace(/"/g, '&quot;')}" autocomplete="off" spellcheck="false"></div>
        <div class="chars" id="chars"></div>

        <div class="section-t">맵 <small>구조물은 매 판 새로 생성된다 · 3명이면 2배, 4명이면 4배</small></div>
        <div class="maprow">
          <div>
            <div class="seg" id="seg-map">
              ${MAP_LIST.map((m) => `<button data-v="${m.id}" class="${m.id === this.mapId ? 'on' : ''}" title="${m.desc}">${m.name}</button>`).join('')}
            </div>
            <p class="hintline" id="map-desc">${MAPS[this.mapId].desc}</p>
            <p class="hintline dim">노란 점이 스폰 지점. 가운데 모래주머니 진지는 항상 생긴다.</p>
          </div>
          <canvas id="map-preview" class="mappv"></canvas>
        </div>

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
            <div class="row"><label>목표 킬</label><select class="sel" id="kills-solo">
              ${KILL_OPTIONS.map((k) => `<option value="${k}" ${k === 5 ? 'selected' : ''}>${k} 킬</option>`).join('')}
            </select></div>
            <div class="row"><button class="btn main" id="btn-solo">▶ 시작</button></div>
          </div>

          <div class="mode">
            <h2>방 만들기 <span class="k">HOST</span></h2>
            <p>정원 ${MAX_PLAYERS}명. 방을 열면 아래 방 목록에 바로 보이고, 둘 이상이 모두 준비를 누르면 자동으로 시작합니다.</p>
            <div class="row"><label>모드</label><div class="seg" id="seg-room-mode">
              <button data-v="ffa" class="on">개인전</button><button data-v="teams">2v2 팀전</button>
            </div></div>
            <div class="row"><label>목표 킬</label><select class="sel" id="kills-room">
              ${KILL_OPTIONS.map((k) => `<option value="${k}" ${k === 5 ? 'selected' : ''}>${k} 킬</option>`).join('')}
            </select></div>
            <div class="row"><button class="btn main" id="btn-host">방 만들기</button></div>
          </div>

          <div class="mode">
            <h2>방 목록 <span class="k" id="online">접속 확인 중</span></h2>
            <div class="rooms" id="rooms"><div class="empty">열린 방이 없습니다. 방을 만들거나 잠시 기다려 보세요.</div></div>
            <div class="row"><input class="code" id="join-code" maxlength="6" placeholder="코드 직접 입력" autocomplete="off" spellcheck="false"><button class="btn secondary" id="btn-join">참가</button></div>
          </div>
        </div>

        <div class="section-t" id="rec-t" hidden>최근 전적 <small>이 브라우저에만 남습니다 · 서버에 올라가지 않습니다</small><button class="lnk" id="rec-clear">전체 지우기</button></div>
        <div class="recs" id="recs" hidden></div>

        <div class="status" id="status"></div>

        <div class="foot">비공식 팬 프로젝트 · 비상업 · 문의 시 즉시 삭제 · <a href="https://github.com/goormigrm/bedorage-duck">github.com/goormigrm/bedorage-duck</a></div>
      </div>`

    const chars = h.querySelector('#chars') as HTMLElement
    for (const c of CHARACTER_LIST) {
      const el = document.createElement('button')
      el.className = 'char' + (c.id === this.char ? ' on' : '')
      el.dataset.id = c.id
      el.style.setProperty('--c', '#' + c.bodyColor.toString(16).padStart(6, '0'))
      el.innerHTML = `
        <canvas></canvas>
        <b>${c.name}</b>
        <small>${c.basedOn} · ${WEAPONS[c.weapon].name} · HP ${c.maxHp}</small>
        <div class="pv"><b>${c.passiveName}</b> ${c.passiveDesc}</div>`
      el.onclick = () => this.selectChar(c.id)
      chars.appendChild(el)
      const cv = el.querySelector('canvas') as HTMLCanvasElement
      requestAnimationFrame(() => drawPortrait(cv, c))
    }

    this.seg('#seg-map', (v) => {
      if (isMapId(v)) this.mapId = v
      ;(h.querySelector('#map-desc') as HTMLElement).textContent = MAPS[this.mapId].desc
      this.drawPreview()
      this.hostChanged()
    })
    this.seg('#seg-diff', (v) => (this.difficulty = v as Difficulty))
    this.seg('#seg-bots', (v) => {
      this.bots = Number(v)
      this.drawPreview()
      if (this.bots !== 3 && this.soloMode === 'teams') this.setSeg('#seg-solo-mode', 'ffa')
    })
    this.seg('#seg-solo-mode', (v) => {
      this.soloMode = v as 'ffa' | 'teams'
      if (this.soloMode === 'teams') this.setSeg('#seg-bots', '3')
    })
    const soloSel = h.querySelector('#kills-solo') as HTMLSelectElement
    soloSel.onchange = () => (this.killsSolo = Number(soloSel.value))
    const roomSel = h.querySelector('#kills-room') as HTMLSelectElement
    roomSel.onchange = () => {
      this.killsRoom = Number(roomSel.value)
      this.hostChanged()
    }
    this.seg('#seg-room-mode', (v) => {
      this.roomMode = v as RoomMode
      if (this.role === 'host') this.members.forEach((m, i) => (m.team = this.roomMode === 'teams' ? i % 2 : 0))
      this.myTeam = this.roomMode === 'teams' ? 0 : 0
      this.hostChanged()
    })
    const nickEl = h.querySelector('#nick') as HTMLInputElement
    nickEl.addEventListener('change', () => {
      this.nick = nickEl.value.trim().slice(0, 8)
      nickEl.value = this.nick
      try {
        localStorage.setItem('bd.nick', this.nick)
      } catch {
        /* 무시 */
      }
      this.pushSelf()
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
    ;(h.querySelector('#rec-clear') as HTMLButtonElement).onclick = () => {
      clearRecords()
      this.renderRecords()
    }
    this.renderRecords()
    requestAnimationFrame(() => this.drawPreview())
  }

  /**
   * 최근 전적. 서버도 DB도 없이, 끝난 판의 결과를 각자 브라우저에 적어 둔 것을 읽어 온다.
   * 같은 방에 있던 사람들은 (결정적 시뮬이라) 완전히 같은 내용을 갖고 있다.
   */
  private renderRecords(): void {
    const wrap = this.host.querySelector('#recs') as HTMLElement | null
    const title = this.host.querySelector('#rec-t') as HTMLElement | null
    if (!wrap || !title) return
    const list = loadRecords().slice(0, 8)
    title.hidden = list.length === 0
    wrap.hidden = list.length === 0
    if (list.length === 0) return
    wrap.innerHTML = list
      .map((r, idx) => {
        const won = r.teams ? r.players[r.me]?.team === r.winner : r.me === r.winner
        const rows = ranked(r)
          .map((p) => {
            const me = p === r.players[r.me] ? ' me' : ''
            const team = r.teams ? `<i class="tm t${p.team}">${TEAM_NAMES[p.team] ?? ''}</i>` : ''
            const name = CHARACTERS[p.char]?.name ?? ''
            const out = p.left ? '<small class="out">나감</small>' : ''
            return `<li class="${me.trim()}">${team}<b>${esc(p.nick)}</b><small>${name}</small>${out}<span>${p.kills}<em>킬</em> ${p.deaths}<em>데스</em></span></li>`
          })
          .join('')
        return `<div class="rec ${won ? 'win' : 'lose'}">
          <div class="rh">
            <b>${won ? '승리' : '패배'}</b>
            <span>${r.mode === 'solo' ? '혼자 하기' : '방 대전'} · ${r.teams ? '2v2' : '개인전'} · ${MAPS[r.map]?.name ?? r.map} · 목표 ${r.target}킬</span>
            <time>${recordDate(r.at)}</time>
            <button class="lnk" data-copy="${idx}">복사</button>
          </div>
          <div class="rw">${winnerLabel(r)}</div>
          <ul>${rows}</ul>
        </div>`
      })
      .join('')
    for (const btn of Array.from(wrap.querySelectorAll<HTMLButtonElement>('button[data-copy]'))) {
      btn.onclick = () => this.copyRecord(list[Number(btn.dataset.copy)], btn)
    }
  }

  private copyRecord(r: MatchRecord, btn: HTMLButtonElement): void {
    const text = formatRecord(r)
    const done = () => {
      btn.textContent = '복사됨'
      setTimeout(() => (btn.textContent = '복사'), 1400)
    }
    // 창이 뒤에 있거나 권한이 없으면 clipboard API 가 거절한다 → 옛 방식, 그것도 막히면 직접 고르게
    const manual = () => {
      const card = btn.closest('.rec')
      if (!card) return
      card.querySelector('textarea')?.remove()
      const ta = document.createElement('textarea')
      ta.className = 'recbox'
      ta.readOnly = true
      ta.rows = 7
      ta.value = text
      card.appendChild(ta)
      ta.focus()
      ta.select()
      btn.textContent = 'Ctrl+C'
    }
    const legacy = () => {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.cssText = 'position:fixed;left:-9999px;top:0'
      document.body.appendChild(ta)
      ta.select()
      let ok = false
      try {
        ok = document.execCommand('copy')
      } catch {
        ok = false
      }
      ta.remove()
      if (ok) done()
      else manual()
    }
    const p = navigator.clipboard?.writeText(text)
    if (p) p.then(done, legacy)
    else legacy()
  }

  private drawPreview(): void {
    const cv = this.host.querySelector('#map-preview') as HTMLCanvasElement | null
    if (!cv) return
    clearTimeout(this.previewTimer)
    this.previewTimer = window.setTimeout(() => {
      const players = this.role ? Math.max(2, this.members.length) : 1 + this.bots
      drawMapPreview(cv, buildMap(this.mapId, scaleForPlayers(players), PREVIEW_SEED))
    }, 0)
  }

  /** 호스트 설정(맵·목표·모드)이 바뀌면 방송·목록 갱신 */
  private hostChanged(): void {
    if (this.role !== 'host') return
    this.members.forEach((m) => (m.ready = false))
    this.myReady = false
    this.broadcastRoom()
    this.announce()
    this.renderRoom()
  }

  private selectChar(id: CharacterId): void {
    this.char = id
    this.host.querySelectorAll('.char').forEach((x) => x.classList.toggle('on', (x as HTMLElement).dataset.id === id))
    this.myReady = false
    this.pushSelf()
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
        const st = r.state === 'open' ? '<span class="pill ok">참가 가능</span>' : r.state === 'full' ? '<span class="pill">정원 참</span>' : '<span class="pill">게임 중</span>'
        return `<div class="room"><div><b>${c ? c.name : r.hostChar}</b>의 방 <span class="code-sm">${r.code}</span><br><small>${m} · ${ROOM_MODE_LABEL[r.mode] ?? r.mode} · 목표 ${r.targetKills}킬 · ${r.count}/${r.max}명</small></div>
          <div>${st} <button class="btn" data-code="${r.code}" ${r.state === 'open' ? '' : 'disabled'}>참가</button></div></div>`
      })
      .join('')
    el.querySelectorAll('button[data-code]').forEach((b) => {
      ;(b as HTMLButtonElement).onclick = () => this.join((b as HTMLElement).dataset.code!)
    })
  }

  private announce(state?: RoomInfo['state']): void {
    if (!this.lobbyLink || this.role !== 'host' || !this.link) return
    this.lobbyLink.announce({
      code: this.link.code,
      hostChar: this.char,
      map: this.mapId,
      targetKills: this.killsRoom,
      mode: this.roomMode,
      count: this.members.length,
      max: MAX_PLAYERS,
      state: state ?? (this.members.length >= MAX_PLAYERS ? 'full' : 'open'),
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
      names: chars.map((_, i) => (i === 0 ? this.nick : '')),
      targetKills: this.killsSolo,
      seed: (Math.random() * 0xffffffff) >>> 0,
      localPlayer: 0,
      mapId: this.mapId,
      difficulty: this.difficulty,
    })
  }

  // ---------- 방 만들기 / 참가 ----------
  /** 방에 들어가기 전 닉네임 확인. 비어 있으면 입력칸으로 보낸다 */
  private requireNick(): boolean {
    if (this.nick.trim().length > 0) return true
    const el = this.host.querySelector('#nick') as HTMLInputElement | null
    el?.focus()
    el?.classList.add('need')
    setTimeout(() => el?.classList.remove('need'), 1200)
    this.status('닉네임을 먼저 입력해 주세요. 게임 중 캐릭터 위에 표시됩니다. (8자까지)', 'bad')
    return false
  }

  private hostRoom(): void {
    if (!this.requireNick()) return
    this.closeLink()
    const code = makeRoomCode()
    this.role = 'host'
    this.link = openRoom(code, 'host')
    this.hostId = this.link.selfId
    this.myReady = false
    this.myTeam = 0
    this.members = [{ id: this.link.selfId, char: this.char, ready: false, team: 0, name: this.nick }]
    history.replaceState(null, '', `#room=${code}`)
    this.wireLink()
    this.announce()
    this.renderRoom()
    this.renderRooms()
  }

  private join(code: string): void {
    if (!this.requireNick()) return
    this.closeLink()
    this.role = 'guest'
    this.link = openRoom(code, 'guest')
    this.hostId = null
    this.members = []
    this.myReady = false
    this.myTeam = 0
    history.replaceState(null, '', `#room=${code}`)
    this.wireLink()
    this.renderRoom()
    this.waitTimer = window.setTimeout(() => {
      if (this.link && !this.hostId) {
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
      if (this.link !== link) return
      // 새로 들어온 피어에게 내 상태를 알린다 (호스트는 hello 를 받고 멤버로 넣는다)
      this.sendHello(id)
    })
    link.onPeerLeave((id) => {
      if (this.link !== link) return
      this.peerGone(id)
    })
    link.onCtl((m, from) => {
      if (this.link !== link) return
      this.onCtl(m, from)
    })
  }

  private peerGone(id: string): void {
    if (this.role === 'host') {
      const before = this.members.length
      this.members = this.members.filter((m) => m.id !== id)
      if (this.members.length !== before) {
        this.broadcastRoom()
        this.announce()
        this.renderRoom()
      }
    } else if (id === this.hostId) {
      this.status('호스트가 방을 닫았습니다.', 'bad', `<div class="row"><button class="btn secondary" id="btn-cancel">닫기</button></div>`)
      this.bindCancel()
      this.closeLink()
    }
  }

  private onCtl(m: CtlMessage, from: string): void {
    switch (m.t) {
      case 'hello':
        this.onHello(m, from)
        break
      case 'room': {
        if (this.role !== 'guest') return
        clearTimeout(this.waitTimer)
        this.hostId = from
        this.members = m.members
        this.roomMode = m.mode
        this.killsRoom = m.targetKills
        if (isMapId(m.map)) this.mapId = m.map
        const me = this.members.find((x) => x.id === this.link?.selfId)
        if (me) {
          this.myReady = me.ready
          this.myTeam = me.team
        }
        this.renderRoom()
        break
      }
      case 'full':
        this.status('방이 가득 찼습니다.', 'bad', `<div class="row"><button class="btn secondary" id="btn-cancel">닫기</button></div>`)
        this.bindCancel()
        this.closeLink()
        break
      case 'start':
        if (this.role === 'guest' && from === this.hostId) this.launchFrom(m.players, m.seed, m.delay, m.mode, m.map, m.targetKills, m.scale)
        break
      case 'leave':
        this.peerGone(from)
        break
      default:
        break
    }
  }

  /** 호스트: 멤버 추가/갱신 */
  private onHello(m: Extract<CtlMessage, { t: 'hello' }>, from: string): void {
    if (this.role !== 'host' || !this.link) return
    const existing = this.members.find((x) => x.id === from)
    const name = (m.name ?? '').slice(0, 8)
    if (existing) {
      existing.char = m.char
      existing.ready = m.ready
      existing.name = name
      if (this.roomMode === 'teams') existing.team = m.team === 1 ? 1 : 0
    } else {
      if (this.members.length >= MAX_PLAYERS || this.starting) {
        this.link.sendCtl({ t: 'full' }, from)
        return
      }
      this.members.push({ id: from, char: m.char, ready: false, team: this.autoTeam(), name })
    }
    this.broadcastRoom()
    this.announce()
    this.renderRoom()
    this.maybeStart()
  }

  /** 인원이 적은 팀 */
  private autoTeam(): number {
    if (this.roomMode !== 'teams') return 0
    const a = this.members.filter((m) => m.team === 0).length
    const b = this.members.filter((m) => m.team === 1).length
    return a <= b ? 0 : 1
  }

  private broadcastRoom(): void {
    if (this.role !== 'host' || !this.link) return
    this.link.sendCtl({ t: 'room', mode: this.roomMode, targetKills: this.killsRoom, map: this.mapId, members: this.members })
  }

  private sendHello(to?: string): void {
    if (!this.link) return
    this.link.sendCtl({ t: 'hello', char: this.char, ready: this.myReady, team: this.myTeam, name: this.nick }, to)
  }

  /** 내 캐릭터·준비·팀이 바뀌었다: 호스트면 정본 갱신 후 방송, 게스트면 hello */
  private pushSelf(): void {
    if (!this.link) return
    if (this.role === 'host') {
      const me = this.members[0]
      if (me) {
        me.char = this.char
        me.ready = this.myReady
        me.team = this.roomMode === 'teams' ? this.myTeam : 0
        me.name = this.nick
      }
      this.broadcastRoom()
      this.announce()
      this.renderRoom()
      this.maybeStart()
    } else {
      this.sendHello()
      this.renderRoom()
    }
  }

  private toggleReady(): void {
    if (!this.link || !this.hostId) return
    this.myReady = !this.myReady
    this.pushSelf()
  }

  private changeTeam(): void {
    if (!this.link || this.roomMode !== 'teams') return
    this.myTeam = this.myTeam === 0 ? 1 : 0
    this.myReady = false
    this.pushSelf()
  }

  /** 호스트: 둘 이상 모두 준비면 시작 */
  private maybeStart(): void {
    if (this.role !== 'host' || this.starting || !this.link) return
    const link = this.link
    if (this.members.length < MIN_PLAYERS) return
    if (!this.members.every((m) => m.ready)) return
    if (this.roomMode === 'teams' && (!this.members.some((m) => m.team === 0) || !this.members.some((m) => m.team === 1))) return
    this.starting = true
    const seed = (Math.random() * 0xffffffff) >>> 0
    const delay = Math.max(2, Math.min(6, Math.ceil(link.rtt / 2 / 16.7) + 1))
    const players: Member[] = this.members.map((m, i) => ({ ...m, team: this.roomMode === 'teams' ? m.team : i }))
    const map = this.mapId
    const kills = this.killsRoom
    const mode = this.roomMode
    const scale = scaleForPlayers(players.length)
    link.sendCtl({ t: 'start', seed, targetKills: kills, delay, map, scale, mode, players })
    this.announce('playing')
    setTimeout(() => this.launchFrom(players, seed, delay, mode, map, kills, scale), 150)
  }

  private launchFrom(players: Member[], seed: number, delay: number, mode: RoomMode, map: string, targetKills: number, scale: number): void {
    const link = this.link
    if (!link) return
    const idx = players.findIndex((p) => p.id === link.selfId)
    if (idx < 0) return
    const chars = players.map((p) => (p.char in CHARACTERS ? (p.char as CharacterId) : 'cheolmyeon'))
    const teams = mode === 'teams' ? players.map((p) => p.team) : undefined
    this.launch({
      mode: 'p2p',
      chars,
      teams,
      targetKills,
      seed,
      localPlayer: idx,
      mapId: isMapId(map) ? map : DEFAULT_MAP,
      mapScale: isMapScale(scale) ? scale : scaleForPlayers(players.length),
      link,
      delay,
      peerIds: players.map((p) => p.id),
      names: players.map((p) => p.name ?? ''),
    })
  }

  private launch(cfg: Omit<SessionConfig, 'onExit'>): void {
    this.link = null // 세션이 링크를 가져간다
    if (this.lobbyLink) {
      this.lobbyLink.leave()
      this.lobbyLink = null
    }
    this.handlers.onStart(cfg)
  }

  private renderRoom(): void {
    const link = this.link
    if (!link) return
    const url = roomLinkUrl(link.code)
    const connected = this.role === 'host' || !!this.hostId
    const title = this.role === 'host' ? `내 방 <span class="code-sm">${link.code}</span>` : `방 <span class="code-sm">${link.code}</span>`
    const teams = this.roomMode === 'teams'
    const slots: string[] = []
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const m = this.members[i]
      if (!m) {
  slots.push(`<div class="slot empty"><div class="who">${i + 1}번 자리</div><div class="cname">비어 있음</div><div class="rd">기다리는 중</div></div>`)
        continue
      }
      const mine = m.id === link.selfId
      const c = (CHARACTERS as Record<string, { name: string } | undefined>)[m.char]
      const who = (i === 0 ? '호스트' : `${i + 1}`) + (mine ? ' · 나' : '')
      const badge = teams ? `<span class="team ${m.team === 0 ? 'team-a' : 'team-b'}">${TEAM_NAMES[m.team]}</span>` : ''
      const nick = (m.name ?? '').trim()
      slots.push(`<div class="slot ${m.ready ? 'ready' : ''} ${mine ? 'mine' : ''}">
        <div class="who">${who}${badge}</div>
        <div class="cname">${nick ? esc(nick) : c ? c.name : m.char}</div>
        <div class="rd">${nick ? `${c ? c.name : m.char}<br>` : ''}${m.ready ? '준비 완료' : '준비 안 됨'}</div>
      </div>`)
    }
    const html = `
      <div class="room-head"><div class="section-t" style="margin:0">${title}</div>
        <div class="row"><button class="btn secondary" id="btn-copy">링크 복사</button><button class="btn secondary" id="btn-cancel">${this.role === 'host' ? '방 닫기' : '나가기'}</button></div></div>
      <div class="link">${url}</div>
      <div class="setrow">
        <span><b>맵</b>${MAPS[this.mapId].name}</span>
        <span><b>모드</b>${ROOM_MODE_LABEL[this.roomMode]}</span>
        <span><b>목표</b>${this.killsRoom}킬</span>
        <span><b>인원</b>${this.members.length}/${MAX_PLAYERS}명</span>
        ${connected && link.peers.size > 0 ? `<span><b>핑</b>${link.rtt} ms</span>` : ''}
      </div>
      <div class="slots">${slots.join('')}</div>
      <div class="room-actions">
        <button class="btn main" id="btn-ready" ${connected ? '' : 'disabled'}>${this.myReady ? '준비 취소' : '준비'}</button>
        ${teams ? `<button class="btn secondary" id="btn-team" ${connected ? '' : 'disabled'}>팀 바꾸기</button>` : ''}
      </div>
      <p class="roomhint">둘 이상 모이고 모두 준비를 누르면 자동으로 시작합니다.</p>`
    const readyCount = this.members.filter((m) => m.ready).length
    const st = !connected
      ? '연결 중… (최대 20초)'
      : this.members.length < MIN_PLAYERS
        ? this.role === 'host'
          ? '방 목록에 올라갔습니다. 상대가 들어오길 기다리는 중…'
          : '다른 사람이 들어오길 기다리는 중…'
        : readyCount === this.members.length
          ? '모두 준비. 시작합니다…'
          : this.myReady
            ? `준비 ${readyCount}/${this.members.length} · 나머지를 기다리는 중…`
            : '준비를 누르세요.'
    this.status(st, connected ? 'ok' : '', html)
    const copy = this.host.querySelector('#btn-copy') as HTMLButtonElement
    copy.onclick = () => void navigator.clipboard.writeText(url).then(() => (copy.textContent = '복사됨'))
    this.bindCancel()
    ;(this.host.querySelector('#btn-ready') as HTMLButtonElement).onclick = () => this.toggleReady()
    const teamBtn = this.host.querySelector('#btn-team') as HTMLButtonElement | null
    if (teamBtn) teamBtn.onclick = () => this.changeTeam()
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
    this.members = []
    this.hostId = null
    this.myReady = false
    this.myTeam = 0
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
