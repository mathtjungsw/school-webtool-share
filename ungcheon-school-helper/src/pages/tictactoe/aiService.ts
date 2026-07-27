import { BoardState, Player, Move, Difficulty } from './types';
import { calculatePlayerScore, getLineCounts } from './gameLogicService';

const getOpponent = (player: Player): Player => (player === 'O' ? 'X' : 'O');

const evaluateBoard = (board: BoardState, aiPlayer: Player): number => {
  const opponent = getOpponent(aiPlayer);
  const boardSize = board.length;
  const { score: aiScore } = calculatePlayerScore(board, aiPlayer);
  const { score: opponentScore } = calculatePlayerScore(board, opponent);
  let evalScore = (aiScore - opponentScore) * 2000;
  const center = (boardSize - 1) / 2;
  for (let r = 0; r < boardSize; r++) {
    for (let c = 0; c < boardSize; c++) {
      if (board[r][c] !== null) {
        const dist = Math.max(Math.abs(r - center), Math.abs(c - center));
        const weight = (boardSize / 2 - dist) * 10;
        if (board[r][c] === aiPlayer) evalScore += weight;
        else evalScore -= weight;
      }
    }
  }
  const checkHeuristics = (player: Player, multiplier: number) => {
    let bonus = 0;
    const counts = getLineCounts(board, player);
    if (counts[4]) bonus += 150 * counts[4];
    if (counts[3]) bonus += 40 * counts[3];
    return bonus * multiplier;
  };
  evalScore += checkHeuristics(aiPlayer, 1);
  evalScore -= checkHeuristics(opponent, 1.5);
  return evalScore;
};

export const calculateWinChance = (board: BoardState, player: Player): number => {
  const score = evaluateBoard(board, player);
  const sigmoid = (x: number) => 1 / (1 + Math.exp(-x / 2000));
  return Math.round(sigmoid(score) * 100);
};

const getAvailableMoves = (board: BoardState): Move[] => {
  const size = board.length;
  const moves: { move: Move; priority: number }[] = [];
  const hasNeighbor = (r: number, c: number) => {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] !== null) return true;
      }
    }
    return false;
  };
  const center = (size - 1) / 2;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] === null) {
        let priority = 0;
        if (hasNeighbor(r, c)) priority += 100;
        const dist = Math.abs(r - center) + Math.abs(c - center);
        priority -= dist;
        moves.push({ move: [r, c], priority });
      }
    }
  }
  return moves.sort((a, b) => b.priority - a.priority).map(m => m.move);
};

const minimax = (
  board: BoardState, depth: number, isMaximizing: boolean,
  aiPlayer: Player, maxDepth: number, alpha: number, beta: number
): number => {
  if (depth === maxDepth) return evaluateBoard(board, aiPlayer);
  const moves = getAvailableMoves(board);
  if (moves.length === 0) return evaluateBoard(board, aiPlayer);
  if (isMaximizing) {
    let bestScore = -Infinity;
    for (const [r, c] of moves.slice(0, 15)) {
      board[r][c] = aiPlayer;
      const score = minimax(board, depth + 1, false, aiPlayer, maxDepth, alpha, beta);
      board[r][c] = null;
      bestScore = Math.max(bestScore, score);
      alpha = Math.max(alpha, bestScore);
      if (beta <= alpha) break;
    }
    return bestScore;
  } else {
    let bestScore = Infinity;
    const opponent = getOpponent(aiPlayer);
    for (const [r, c] of moves.slice(0, 15)) {
      board[r][c] = opponent;
      const score = minimax(board, depth + 1, true, aiPlayer, maxDepth, alpha, beta);
      board[r][c] = null;
      bestScore = Math.min(bestScore, score);
      beta = Math.min(beta, bestScore);
      if (beta <= alpha) break;
    }
    return bestScore;
  }
};

export const getBestMove = (board: BoardState, aiPlayer: Player, difficulty: Difficulty): Move | null => {
  const moves = getAvailableMoves(board);
  if (moves.length === 0) return null;
  if (moves.length === board.length * board.length) {
    const c = Math.floor(board.length / 2);
    return [c, c];
  }
  let maxDepth = 2;
  if (difficulty === Difficulty.Medium) maxDepth = 3;
  if (difficulty === Difficulty.Hard) {
    if (board.length === 5) maxDepth = 7;
    else if (board.length === 6) maxDepth = 6;
    else maxDepth = 6;
  }
  let bestMove = moves[0];
  let bestScore = -Infinity;
  for (const [r, c] of moves.slice(0, 20)) {
    board[r][c] = aiPlayer;
    const score = minimax(board, 0, false, aiPlayer, maxDepth, -Infinity, Infinity);
    board[r][c] = null;
    if (score > bestScore) { bestScore = score; bestMove = [r, c]; }
  }
  return bestMove;
};
