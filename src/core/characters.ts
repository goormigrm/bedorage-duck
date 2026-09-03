import { WeaponId } from './weapons'

export type CharacterId = 'chim' | 'jupeol' | 'cheolmyeon' | 'magic'

export interface CharacterDef {
  id: CharacterId
  /** 표시 이름 (패러디 명칭) */
  name: string
  /** 원본 크루 멤버 (참고용, UI 에 작게 표기) */
  basedOn: string
  tagline: string
  maxHp: number
  /** 기본 이동 속도 px/tick */
  speed: number
  weapon: WeaponId
  /** 대시 쿨다운 틱 */
  dashCooldown: number
  passiveName: string
  passiveDesc: string
  /** 렌더용 */
  bodyColor: number
  accentColor: number
  accessory: 'glasses' | 'cap' | 'headband' | 'collar'
}

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  chim: {
    id: 'chim', name: '침착덕', basedOn: '침착맨', tagline: '크루의 중심. 무슨 일이 있어도 침착하게.',
    maxHp: 100, speed: 3.2, weapon: 'rifle', dashCooldown: 90,
    passiveName: '침착', passiveDesc: '반동 회복 속도 2배. 연사해도 탄이 덜 퍼집니다.',
    bodyColor: 0xf5c542, accentColor: 0x222222, accessory: 'glasses',
  },
  jupeol: {
    id: 'jupeol', name: '주펄덕', basedOn: '주펄', tagline: '침펄 콤비의 반쪽. 가까이 오면 토론이 시작됩니다.',
    maxHp: 100, speed: 3.3, weapon: 'smg', dashCooldown: 90,
    passiveName: '토론', passiveDesc: '150px 안의 상대에게 피해 +20%.',
    bodyColor: 0xf0b83a, accentColor: 0x2b4c7e, accessory: 'cap',
  },
  cheolmyeon: {
    id: 'cheolmyeon', name: '철면덕', basedOn: '철면수심', tagline: '배도라지장. 차돌야차의 단단함.',
    maxHp: 135, speed: 2.75, weapon: 'shotgun', dashCooldown: 120,
    passiveName: '차돌', passiveDesc: '최대 체력 135. 피격 시 넉백 없음.',
    bodyColor: 0xe8a93a, accentColor: 0xc0392b, accessory: 'headband',
  },
  magic: {
    id: 'magic', name: '매직덕', basedOn: '매직박', tagline: '창설 멤버이자 치과의사. 스스로를 치료합니다.',
    maxHp: 100, speed: 3.2, weapon: 'pistol', dashCooldown: 75,
    passiveName: '진료', passiveDesc: '피격 후 3초가 지나면 초당 4씩 체력 회복.',
    bodyColor: 0xf7d060, accentColor: 0xfafafa, accessory: 'collar',
  },
}

export const CHARACTER_LIST: CharacterDef[] = [
  CHARACTERS.chim,
  CHARACTERS.jupeol,
  CHARACTERS.cheolmyeon,
  CHARACTERS.magic,
]
