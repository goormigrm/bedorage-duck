import { WeaponId } from './weapons'

export type CharacterId = 'cheolmyeon' | 'chim' | 'dangun' | 'magic' | 'jupeol'

/** 이모지풍 캐리커처 외형 정의. 렌더러가 이 데이터만 보고 그린다. */
export interface Look {
  skin: number
  hair: 'none' | 'short' | 'buzz' | 'flat' | 'side' | 'bowl' | 'spiky'
  hairColor: number
  /** 옆머리(삭발한 옆면) 색. 지정하면 spiky 머리 아래 회색 밴드처럼 그림 */
  sideColor?: number
  /** 정수리 장식: 'star' = 흰 별 (철면수심 마스코트) */
  crown?: 'star'
  glasses: 'none' | 'rect' | 'round' | 'sunglasses'
  /** 선글라스 렌즈 색 */
  lensColor?: number
  beard: 'none' | 'stubble' | 'goatee' | 'full' | 'mustache'
  /** 모자 챙·라벨 색 (extra: 'cap' 일 때) */
  capBand?: number
  /** 모자 앞 라벨 글자 */
  capText?: string
  /** 입술 색 (mouth: 'thick' 일 때) */
  lipColor?: number
  eyes: 'normal' | 'calm' | 'squint' | 'angry' | 'happy' | 'sharp' | 'lidded'
  brows: 'normal' | 'thick' | 'none' | 'arched'
  mouth: 'flat' | 'smile' | 'thick' | 'grin' | 'frown' | 'sing' | 'pout'
  /** 귀 크기 배율 (기본 1) */
  earScale?: number
  /** 얼굴 윤곽: round(기본) | jowl(넓은 볼·턱살, 철면수심 마스코트) */
  faceShape?: 'round' | 'jowl'
  /** 코: small(기본) | wide(콧구멍 보이는 큰 코) */
  nose?: 'small' | 'wide'
  shirt: number
  /** 흰 가운·재킷 등 겉옷 색 (없으면 undefined) */
  coat?: number
  /** 겉옷 물방울 무늬 색 */
  coatDots?: number
  /** 넥타이 색 (있으면 그림) */
  tie?: number
  /** 나비넥타이 색 */
  bowTie?: number
  headScale: number
  bodyScale: number
  extra: 'none' | 'cap' | 'headband' | 'mic'
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
    id: 'cheolmyeon', name: '철면덕', basedOn: '철면수심', tagline: '배도라지장. 빨간 얼굴의 차돌야차, 크루에서 가장 단단한 남자.',
    prominence: 1,
    maxHp: 135, speed: 2.8, weapon: 'shotgun', dashCooldown: 110,
    passiveName: '차돌', passiveDesc: '최대 체력 135. 피격 시 넉백 없음.',
    bodyColor: 0xff5a36, accentColor: 0x1e1e1e,
    look: {
      // 철면수심 공식 마스코트: 빨간 얼굴, 삐죽삐죽한 검은 머리 + 정수리 흰 별, 회색 옆머리, 반쯤 감은 눈, 쭉 내민 입술, 큰 귀
      skin: 0xd6432b, hair: 'spiky', hairColor: 0x161413, sideColor: 0x9c9c9c, crown: 'star',
      glasses: 'none', beard: 'none', eyes: 'lidded', brows: 'arched', mouth: 'pout', earScale: 1.9,
      faceShape: 'jowl', nose: 'wide', lipColor: 0xb8342a,
      shirt: 0x1e1e1e, headScale: 1.2, bodyScale: 1.35, extra: 'none',
    },
  },
  chim: {
    id: 'chim', name: '침착덕', basedOn: '침착맨', tagline: '크루의 중심. 유튜브 배너의 그 아저씨, 무슨 일이 있어도 침착하게.',
    prominence: 2,
    maxHp: 100, speed: 3.2, weapon: 'rifle', dashCooldown: 90,
    passiveName: '침착', passiveDesc: '반동 회복 속도 2배. 연사해도 탄이 덜 퍼집니다.',
    bodyColor: 0xf5c542, accentColor: 0x7a1a2e,
    look: {
      // 침착맨 유튜브 배너/아바타 캐릭터: 노란 얼굴, 자주색 야구모자 + 흰 챙 + "침착" 라벨, 굵은 눈썹, 콧수염 + 점박이 수염, 빨간 입술, 흰 티
      skin: 0xf2a41e, hair: 'short', hairColor: 0x161413, glasses: 'none', beard: 'mustache',
      eyes: 'sharp', brows: 'thick', mouth: 'thick', lipColor: 0xc0392b, shirt: 0xe9e9e2,
      headScale: 1.0, bodyScale: 1.0, extra: 'cap', capBand: 0xf4f4f0, capText: '침착', earScale: 1.2,
    },
  },
  dangun: {
    id: 'dangun', name: '단군덕', basedOn: '단군', tagline: '무대 위의 게임 캐스터. 물방울 재킷과 파란 선글라스, 마이크는 놓지 않는다.',
    prominence: 3,
    maxHp: 90, speed: 3.6, weapon: 'pistol', dashCooldown: 70,
    passiveName: '중계', passiveDesc: '이동 속도 최상. 상대가 화면 밖에 있으면 방향 화살표가 보입니다.',
    bodyColor: 0x7ee0a0, accentColor: 0x2f56b8,
    look: {
      skin: 0xf1c8a4, hair: 'bowl', hairColor: 0x161413, glasses: 'sunglasses', lensColor: 0x2d5bd6, beard: 'none',
      eyes: 'normal', brows: 'normal', mouth: 'sing', shirt: 0xf6f6f2, coat: 0x2f56b8, coatDots: 0xffffff, bowTie: 0xf6f6f2,
      headScale: 1.0, bodyScale: 0.85, extra: 'mic',
    },
  },
  magic: {
    id: 'magic', name: '매직덕', basedOn: '매직박', tagline: '창설 멤버이자 치과의사. 스스로를 치료합니다.',
    prominence: 4,
    maxHp: 150, speed: 2.9, weapon: 'smg', dashCooldown: 80,
    passiveName: '진료', passiveDesc: '최대 체력 150 (최고). 피격 후 3초가 지나면 초당 4씩 체력 회복.',
    bodyColor: 0x8de0ff, accentColor: 0x3b7dd8,
    look: {
      skin: 0xf3cfae, hair: 'short', hairColor: 0x1c1a19, glasses: 'rect', beard: 'none',
      eyes: 'happy', brows: 'normal', mouth: 'grin', shirt: 0x3b7dd8, coat: 0xf7f7f2,
      headScale: 1.6, bodyScale: 1.3, extra: 'none',
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
