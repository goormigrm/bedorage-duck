// 승빠덕(후라이팬) 전용 계측.
//
// `tools/balance.ts` 는 봇끼리 붙이므로 "사람이 막기를 의도적으로 유지하는" 상황을 재현하지 못한다.
// 여기서는 승빠덕이 **늘 상대를 보면서(=막으면서) 붙고, 구르지 않고 버티는** 최악의 정면 대치를 만든다.
// 방어가 너무 세면 이 표에서 승빠덕이 전부 살아남는다(2026-09-05 이전이 그랬다).
//
//   npx vite-node tools/melee.ts

import { CharacterId } from '../src/core/characters'
import { radToAngle } from '../src/core/fixedmath'
import { BTN_ADS, BTN_FIRE, Input } from '../src/core/input'
import { TILE_FLOOR, buildMap } from '../src/core/map'
import { createState, step } from '../src/core/sim'

const LIMIT_TICKS = 900 // 15초

function duel(enemy: CharacterId, startGap: number) {
  const map = buildMap('yard', 1, 11)
  const ty = 14
  // 가로로 뚫린 복도만 남긴다 (엄폐물 영향을 없애고 방어 성능만 본다)
  for (let tx = 1; tx < map.w - 1; tx++) for (let dy = -2; dy <= 2; dy++) map.tiles[(ty + dy) * map.w + tx] = TILE_FLOOR
  map.sandbagIdx.length = 0
  const state = createState({ seed: 5, targetKills: 9, chars: ['seungwoo', enemy] }, map)
  const [pan, gun] = state.players
  const y = ty * 32 + 16
  pan.x = 200
  pan.y = y
  pan.invuln = 0
  pan.aliveTicks = 999
  gun.x = 200 + startGap
  gun.y = y
  gun.invuln = 0
  gun.aliveTicks = 999

  let ticks = 0
  let swings = 0
  let blocked = 0
  let guardBroke = -1
  for (; ticks < LIMIT_TICKS; ticks++) {
    const d = Math.hypot(gun.x - pan.x, gun.y - pan.y)
    const inputs: Input[] = [
      // 승빠덕: 사거리 밖이면 붙고, 붙으면 멈춰서 계속 휘두른다. 구르지 않는다
      { mx: d > 58 ? 1 : 0, my: 0, aim: radToAngle(Math.atan2(gun.y - pan.y, gun.x - pan.x)), buttons: BTN_FIRE, char: 0 },
      // 상대: 제자리에서 정조준으로 계속 쏜다 (사람보다 정확한 최악의 상대)
      { mx: 0, my: 0, aim: radToAngle(Math.atan2(pan.y - gun.y, pan.x - gun.x)), buttons: BTN_FIRE | BTN_ADS, char: 0 },
    ]
    step(state, map, inputs)
    for (const e of state.events) {
      if (e.type === 'hit' && e.by === 0) swings++
      if (e.type === 'block') blocked++
    }
    if (guardBroke < 0 && pan.stamina <= 0) guardBroke = ticks
    if (!pan.alive || !gun.alive) break
  }
  return {
    상대: enemy,
    시작거리: startGap,
    승빠HP: pan.hp,
    상대HP: Math.round(gun.hp),
    팬적중: swings,
    막은탄: blocked,
    기력바닥: guardBroke < 0 ? '-' : `${(guardBroke / 60).toFixed(1)}s`,
    끝: `${(ticks / 60).toFixed(1)}s`,
    결과: !pan.alive ? '승빠 사망' : !gun.alive ? '승빠 승리' : '무승부',
  }
}

const rows = []
for (const e of ['chim', 'jupeol', 'cheolmyeon', 'magic', 'tongdak'] as CharacterId[]) {
  rows.push(duel(e, 380))
  rows.push(duel(e, 180))
}
console.table(rows)
const wins = rows.filter((r) => r.결과 === '승빠 승리').length
console.log(`\n정면 대치 승률 ${wins}/${rows.length} — 구르기·엄폐를 뺀 최악의 상황이므로 2~4 정도가 적당하다.`)
console.log('전부 살아남으면 방어가 너무 세다. 하나도 못 이기면 너무 약하다.')
