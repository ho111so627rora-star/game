import { createGame, play, legalMoves, other } from './core.js';

export const CHALLENGES = [
  { id: 'initiative-1', title: '主導権 I', type: '攻勢', brief: '散らばった布石をつなぎ、先に主導権を握る。', human: 1, difficulty: 'normal', history: [3,7,7,11,14,6,1,13,3,7,11,14,4,7] },
  { id: 'counter-1', title: 'カウンター I', type: '反撃', brief: '相手の圧力を受け止め、シルバーから流れを奪う。', human: 2, difficulty: 'normal', history: [11,9,11,11,5,7,4,5,2,9,11,2,2,3,15,0,0] },
  { id: 'crossfire-1', title: '交差する狙い', type: '攻勢', brief: '複数方向へ伸びるラインから本命を育てる。', human: 1, difficulty: 'normal', history: [15,0,2,10,5,0,6,0,0,1,6,1,8,9,10,3,1,6] },
  { id: 'defense-1', title: '静かな防衛', type: '防衛', brief: '危険なラインを見極め、守りから反撃へ転じる。', human: 2, difficulty: 'normal', history: [2,12,0,2,4,3,14,14,7,3,3,2,14,0,3,4,11,13,4,0,12] },
  { id: 'pressure-1', title: '包囲網', type: '主導権', brief: '中央の厚みを活かし、逃げ道を少しずつ塞ぐ。', human: 1, difficulty: 'hard', history: [0,15,15,5,0,9,8,0,6,6,9,6,5,15,15,3,5,8,6,14,5,8] },
  { id: 'silver-edge', title: '銀の切り返し', type: '反撃', brief: '終盤へ向かう複雑な盤面をシルバーで勝ちきる。', human: 2, difficulty: 'hard', history: [1,8,4,4,2,11,8,6,10,2,7,7,3,9,3,6,6,13,13,0,0,1,2,8,13] },
  { id: 'endgame-1', title: '狭まる空間', type: '終盤', brief: '残された棒を読み切り、ゴールドの優位を形にする。', human: 1, difficulty: 'hard', history: [0,2,7,0,9,10,0,11,4,5,11,0,10,1,12,15,4,8,14,5,2,13,2,7,1,4] },
  { id: 'endgame-2', title: '最後の分岐', type: '終盤', brief: '埋まり始めた盤面で、シルバーの勝ち筋を選び続ける。', human: 2, difficulty: 'hard', history: [3,5,0,5,6,12,5,3,10,7,5,8,8,0,14,14,6,6,0,10,3,2,14,3,4,14,0,8,7] }
];

export function restoreChallenge(challenge) {
  const game = createGame();
  for (const rod of challenge.history) {
    if (play(game, rod) == null || game.winner || game.draw) throw new Error(`Invalid challenge: ${challenge.id}`);
  }
  if (game.turn !== challenge.human) throw new Error(`Wrong challenge turn: ${challenge.id}`);
  return game;
}

function hasImmediateWin(game, player) {
  for (const rod of legalMoves(game)) {
    const copy = createGame(); for (const move of game.history) play(copy, move.rod); copy.turn = player; play(copy, rod);
    if (copy.winner === player) return true;
  }
  return false;
}

for (const challenge of CHALLENGES) {
  const game = restoreChallenge(challenge);
  if (challenge.history.length < 14 || hasImmediateWin(game, game.turn) || hasImmediateWin(game, other(game.turn))) throw new Error(`Trivial challenge: ${challenge.id}`);
}
