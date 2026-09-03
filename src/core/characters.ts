import { WeaponId } from './weapons'

export type CharacterId = 'cheolmyeon' | 'chim' | 'dangun' | 'magic' | 'jupeol'

/** 이모지풍 캐리커처 외형 정의. 렌더러가 이 데이터만 보고 그린다. */
export interface Look {
  skin: number
  hair: 'none' | 'short' | 'buzz' | 'flat' | 'side'
  hairColor: number
  glasses: 'none' | 'rect' | 'round'
  beard: 'none' | 'stubble' | 'goatee' | 'full'
  eyes: 'normal' | 'calm' | 'squint' | 'angry' | 'happy' | 'sharp'
  brows: 'normal' | 'thick' | 'none'
  mouth: 'flat' | 'smile' | 'thick' | 'grin' | 'frown'
  shirt: number
  /** 흰 가운·재킷 등 겉옷 색 (없으면 undefined) */
  coat?: number
  /** 넥타이 색 (있으면 그림) */
  tie?: number
  headScale: number
  bodyScale: number
  extra: 'none' | 'cap' | 'headband'
}

export interface CharacterDef {
  id: CharacterId
  /** 표시 이름 (패러디 명칭) */
  name: string
  /** 원본 크루 멤버 (참고용, UI 에 작게 표기) */
  basedOn: string
  tagline: string
  /** 노출 우선순위. 1 = 주인공. 로비·프리뷰·시트 정렬과 카드 크기에 사용 */
  prominence: number
  maxHp: number
  /** 기본 이동 속도 px/tick */
  speed: number
  weapon: WeaponId
  /** 대시 쿨다운 틱 */
  dashCooldown: number
  passiveName: string
  passiveDesc: string
  /** HUD·배너·이펙트에 쓰는 테마 색 */
  bodyColor: number
  accentColor: number
  look: Look
}

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  cheolmyeon: {
    id: 'cheolmyeon', name: '철면덕', basedOn: '철면수심', tagline: '배도라지장이자 이 게임의 주인공. 차돌야차의 단단함.',
    prominence: 1,
    maxHp: 135, speed: 2.8, weapon: 'shotgun', dashCooldown: 110,
    passiveName: '차돌', passiveDesc: '최대 체력 135. 피격 시 넉백 없음.',
    bodyColor: 0xff5a36, accentColor: 0x1e1e1e,
    look: {
      skin: 0xe9b58e, hair: 'buzz', hairColor: 0x1a1817, glasses: 'none', beard: 'full',
      eyes: 'angry', brows: 'thick', mouth: 'frown', shirt: 0x1e1e1e,
      headScale: 1.12, bodyScale: 1.35, extra: 'none',
    },
  },
  chim: {
    id: 'chim', name: '침착덕', basedOn: '침착맨', tagline: '크루의 중심. 무슨 일이 있어도 침착하게.',
    prominence: 2,
    maxHp: 100, speed: 3.2, weapon: 'rifle', dashCooldown: 90,
    passiveName: '침착', passiveDesc: '반동 회복 속도 2배. 연사해도 탄이 덜 퍼집니다.',
    bodyColor: 0xf5c542, accentColor: 0x3c3c3c,
    look: {
      skin: 0xf2cba6, hair: 'flat', hairColor: 0x1c1a19, glasses: 'none', beard: 'stubble',
      eyes: 'calm', brows: 'normal', mouth: 'flat', shirt: 0x3a3a3a,
      headScale: 1.0, bodyScale: 1.0, extra: 'none',
    },
  },
  dangun: {
    id: 'dangun', name: '단군덕', basedOn: '단군', tagline: '게임 캐스터. 작지만 매서운 인상, 빠른 발.',
    prominence: 3,
    maxHp: 90, speed: 3.6, weapon: 'pistol', dashCooldown: 70,
    passiveName: '중계', passiveDesc: '이동 속도 최상. 4초마다 상대 위치가 미니 핑으로 표시됩니다.',
    bodyColor: 0x7ee0a0, accentColor: 0x1f2a3a,
    look: {
      skin: 0xf1c8a4, hair: 'side', hairColor: 0x1c1a19, glasses: 'none', beard: 'none',
      eyes: 'sharp', brows: 'thick', mouth: 'flat', shirt: 0xf4f4f0, coat: 0x1f2a3a, tie: 0xc8102e,
      headScale: 1.0, bodyScale: 0.85, extra: 'none',
    },
  },
  magic: {
    id: 'magic', name: '매직덕', basedOn: '매직박', tagline: '창설 멤버이자 치과의사. 스스로를 치료합니다.',
    prominence: 4,
    maxHp: 100, speed: 3.1, weapon: 'smg', dashCooldown: 75,
    passiveName: '진료', passiveDesc: '피격 후 3초가 지나면 초당 4씩 체력 회복.',
    bodyColor: 0x8de0ff, accentColor: 0x3b7dd8,
    look: {
      skin: 0xf3cfae, hair: 'short', hairColor: 0x1c1a19, glasses: 'rect', beard: 'none',
      eyes: 'happy', brows: 'normal', mouth: 'grin', shirt: 0x3b7dd8, coat: 0xf7f7f2,
      headScale: 1.3, bodyScale: 1.25, extra: 'none',
    },
  },
  jupeol: {
    id: 'jupeol', name: '주펄덕', basedOn: '주펄', tagline: '침펄 콤비의 반쪽. 가까이 오면 토론이 시작됩니다.',
    prominence: 5,
    maxHp: 100, speed: 3.3, weapon: 'smg', dashCooldown: 90,
    passiveName: '토론', passiveDesc: '150px 안의 상대에게 피해 +20%.',
    bodyColor: 0xc48cff, accentColor: 0x243a5e,
    look: {
      skin: 0xf0c49c, hair: 'none', hairColor: 0x2a2320, glasses: 'none', beard: 'goatee',
      eyes: 'squint', brows: 'normal', mouth: 'thick', shirt: 0x243a5e,
      headScale: 1.05, bodyScale: 1.1, extra: 'none',
    },
  },
}

/** 노출 우선순위 순 (주인공 먼저) */
export const CHARACTER_LIST: CharacterDef[] = Object.values(CHARACTERS).sort(
  (a, b) => a.prominence - b.prominence,
)

export const PROTAGONIST: CharacterDef = CHARACTERS.cheolmyeon
