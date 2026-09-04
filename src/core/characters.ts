import { WeaponId } from './weapons'

export type CharacterId =
  | 'cheolmyeon' | 'chim' | 'dangun' | 'magic' | 'jupeol'
  | 'uwon' | 'giyeol' | 'pungwol' | 'oknyang' | 'tongdak' | 'juwoojae' | 'seungwoo'

/** 이모지풍 캐리커처 외형 정의. 렌더러가 이 데이터만 보고 그린다. */
export interface Look {
  skin: number
  hair: 'none' | 'short' | 'buzz' | 'flat' | 'side' | 'bowl' | 'spiky' | 'fringe'
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
  /** 옷깃 모양: round(기본) | v (V넥 스크럽) */
  neck?: 'round' | 'v'
  /** V넥 안에 보이는 속옷 색 */
  undershirt?: number
  /** 가슴 명찰 색 */
  badge?: number
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
    passiveName: '중계', passiveDesc: '이동 속도 최상. 시야 밖 상대가 총을 쏘면 그 위치가 잠깐 표시됩니다.',
    bodyColor: 0x7ee0a0, accentColor: 0x2f56b8,
    look: {
      skin: 0xf1c8a4, hair: 'bowl', hairColor: 0x161413, glasses: 'sunglasses', lensColor: 0x2d5bd6, beard: 'none',
      eyes: 'normal', brows: 'normal', mouth: 'sing', shirt: 0xf6f6f2, coat: 0x2f56b8, coatDots: 0xffffff, bowTie: 0xf6f6f2,
      headScale: 1.0, bodyScale: 0.85, extra: 'mic',
    },
  },
  magic: {
    id: 'magic', name: '매직덕', basedOn: '매직박', tagline: '창설 멤버이자 치과의사. 남색 스크럽에 명찰, 스스로를 치료합니다.',
    prominence: 4,
    maxHp: 150, speed: 2.9, weapon: 'smg', dashCooldown: 80,
    passiveName: '진료', passiveDesc: '최대 체력 150 (최고). 피격 후 3초가 지나면 초당 4씩 체력 회복.',
    bodyColor: 0x8de0ff, accentColor: 0x3b7dd8,
    look: {
      // 실제 사진 기준: 검은 짧은 머리 + 옆으로 넘긴 앞머리, 얇은 검은 사각 안경, 이 드러나는 웃음, 턱 수염 자국,
      // 남색 V넥 스크럽(안에 검은 티) + 노란 명찰. 둥글고 넉넉한 얼굴
      skin: 0xf1caa6, hair: 'fringe', hairColor: 0x161413, glasses: 'rect', beard: 'stubble',
      eyes: 'happy', brows: 'normal', mouth: 'grin', shirt: 0x2b3c86, neck: 'v', undershirt: 0x1c1c1c, badge: 0xf2d16b,
      headScale: 1.45, bodyScale: 1.3, extra: 'none', earScale: 1.1,
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
  // ---- 2차 멤버 (외형은 참고 사진을 받으면 다듬는다) ----
  uwon: {
    id: 'uwon', name: '우원덕', basedOn: '우원박', tagline: '배우. 구른 뒤에도 잠깐 무적, 연기력으로 탄을 피한다.',
    prominence: 6,
    maxHp: 95, speed: 3.5, weapon: 'pistol', dashCooldown: 80,
    passiveName: '연기', passiveDesc: '대시가 끝난 뒤에도 0.2초 무적.',
    bodyColor: 0xff9f6b, accentColor: 0x8a2b2b,
    look: {
      skin: 0xf2cdb0, hair: 'side', hairColor: 0x1a1614, glasses: 'none', beard: 'none',
      eyes: 'sharp', brows: 'thick', mouth: 'smile', shirt: 0x8a2b2b,
      headScale: 1.0, bodyScale: 1.0, extra: 'none',
    },
  },
  giyeol: {
    id: 'giyeol', name: '기열덕', basedOn: '기열킹', tagline: '뇌절의 왕. 연속으로 맞히면 점점 아프다.',
    prominence: 7,
    maxHp: 100, speed: 3.2, weapon: 'smg', dashCooldown: 90,
    passiveName: '뇌절', passiveDesc: '연속 명중마다 피해 +8% (최대 +40%). 빗나가면 초기화.',
    bodyColor: 0x7bd389, accentColor: 0x1f6f3f,
    look: {
      skin: 0xf3d2b4, hair: 'short', hairColor: 0x3a2a1a, glasses: 'none', beard: 'stubble',
      eyes: 'angry', brows: 'thick', mouth: 'grin', shirt: 0x2e8b57,
      headScale: 1.05, bodyScale: 1.15, extra: 'none',
    },
  },
  pungwol: {
    id: 'pungwol', name: '풍월덕', basedOn: '풍월량', tagline: '바람처럼. 대시 쿨다운이 절반이지만 체력은 낮다.',
    prominence: 8,
    maxHp: 85, speed: 3.7, weapon: 'rifle', dashCooldown: 45,
    passiveName: '바람', passiveDesc: '대시 쿨다운 절반. 체력 85.',
    bodyColor: 0x8fd3ff, accentColor: 0x3a6ea5,
    look: {
      skin: 0xf1c9a5, hair: 'buzz', hairColor: 0x1a1614, glasses: 'round', beard: 'stubble',
      eyes: 'calm', brows: 'normal', mouth: 'flat', shirt: 0x3a6ea5,
      headScale: 0.95, bodyScale: 0.95, extra: 'none',
    },
  },
  oknyang: {
    id: 'oknyang', name: '옥냥덕', basedOn: '옥냥이', tagline: '실질적 리더. 정조준해도 느려지지 않는다.',
    prominence: 9,
    maxHp: 100, speed: 3.0, weapon: 'sniper', dashCooldown: 90,
    passiveName: '냉정', passiveDesc: '정조준 중 이동 속도 감소 없음.',
    bodyColor: 0xd9d9d9, accentColor: 0x555555,
    look: {
      skin: 0xf3d4bb, hair: 'flat', hairColor: 0x1a1614, glasses: 'none', beard: 'none',
      eyes: 'squint', brows: 'normal', mouth: 'smile', shirt: 0x555555,
      headScale: 1.0, bodyScale: 1.0, extra: 'none',
    },
  },
  tongdak: {
    id: 'tongdak', name: '통닭덕', basedOn: '통닭천사', tagline: '치킨의 천사. 킬을 하면 배가 부르다.',
    prominence: 10,
    maxHp: 120, speed: 2.9, weapon: 'shotgun', dashCooldown: 100,
    passiveName: '치킨', passiveDesc: '킬 시 체력 50 회복.',
    bodyColor: 0xffc857, accentColor: 0xb8621b,
    look: {
      skin: 0xf2c9a0, hair: 'none', hairColor: 0x2a2320, glasses: 'none', beard: 'full',
      eyes: 'happy', brows: 'normal', mouth: 'grin', shirt: 0xe0a030,
      headScale: 1.1, bodyScale: 1.3, extra: 'none',
    },
  },
  juwoojae: {
    id: 'juwoojae', name: '주우재덕', basedOn: '주우재', tagline: '런웨이 위의 모델. 다리가 길어 대시가 멀리 간다.',
    prominence: 11,
    maxHp: 100, speed: 3.3, weapon: 'rifle', dashCooldown: 85,
    passiveName: '런웨이', passiveDesc: '대시 거리 +50%.',
    bodyColor: 0xf0e0c0, accentColor: 0x8c7b64,
    look: {
      skin: 0xf4d7bd, hair: 'side', hairColor: 0x1a1614, glasses: 'none', beard: 'none',
      eyes: 'sharp', brows: 'thick', mouth: 'smile', shirt: 0x1c1c1c, coat: 0xc9bfae,
      headScale: 0.95, bodyScale: 0.9, extra: 'none',
    },
  },
  seungwoo: {
    id: 'seungwoo', name: '승우덕', basedOn: '승우아빠', tagline: '요리사. 다시 태어나는 게 빠르고 든든하다.',
    prominence: 12,
    maxHp: 110, speed: 3.0, weapon: 'pistol', dashCooldown: 90,
    passiveName: '요리', passiveDesc: '리스폰 2초, 스폰 보호 3초.',
    bodyColor: 0xffb3c6, accentColor: 0x9c2f4f,
    look: {
      skin: 0xf1cdb2, hair: 'short', hairColor: 0x1f1a17, glasses: 'none', beard: 'goatee',
      eyes: 'calm', brows: 'normal', mouth: 'smile', shirt: 0xf4f4f4,
      headScale: 1.05, bodyScale: 1.2, extra: 'none',
    },
  },
}

/** 노출 우선순위 순 (주인공 먼저) */
export const CHARACTER_LIST: CharacterDef[] = Object.values(CHARACTERS).sort(
  (a, b) => a.prominence - b.prominence,
)

export const PROTAGONIST: CharacterDef = CHARACTERS.cheolmyeon

/** 같은 캐릭터가 여럿이면 "철면덕 2" 처럼 번호를 붙인 표시 이름 */
export function displayNames(chars: CharacterId[]): string[] {
  const count = new Map<CharacterId, number>()
  for (const c of chars) count.set(c, (count.get(c) ?? 0) + 1)
  const seen = new Map<CharacterId, number>()
  return chars.map((c) => {
    const n = (seen.get(c) ?? 0) + 1
    seen.set(c, n)
    return (count.get(c) ?? 1) > 1 ? `${CHARACTERS[c].name} ${n}` : CHARACTERS[c].name
  })
}
