import { BoardState, Player, Position, AIDifficulty, CubeState } from './types';
import { BOARD_SIZE, isValidSelection, getValidPushDestinations, performMove, checkWinner } from './gameLogic';

interface Move { source: Position; destination: Position; }

const getAllValidMoves = (board: BoardState, player: Player): Move[] => {
  const moves: Move[] = [];
  for (let i = 0; i < BOARD_SIZE; i++) {
    const positions: Position[] = [
      { row: 0, col: i }, { row: BOARD_SIZE - 1, col: i },
      { row: i, col: 0 }, { row: i, col: BOARD_SIZE - 1 },
    ];
    for (const pos of positions) {
      if (isValidSelection(board, pos, player)) {
        const destinations = getValidPushDestinations(pos);
        for (const dest of destinations) {
          if (!moves.some(m => m.source.row === pos.row && m.source.col === pos.col && m.destination.row === dest.row && m.destination.col === dest.col)) {
            moves.push({ source: pos, destination: dest });
          }
        }
      }
    }
  }
  return moves;
};

const evaluateBoard = (board: BoardState, aiPlayer: Player): number => {
  const winnerResult = checkWinner(board);
  if (winnerResult) {
    if (winnerResult.winner === aiPlayer) return 10000;
    if (winnerResult.winner !== aiPlayer) return -10000;
  }
  let score = 0;
  const opponent = aiPlayer === Player.X ? Player.O : Player.X;
  const lineScore = (line: CubeState[], player: Player) => {
    const count = line.filter(c => c.player === player).length;
    const opponentCount = line.filter(c => c.player !== player && c.player !== Player.None).length;
    if (opponentCount > 0) return 0;
    if (count === 4) return 100;
    if (count === 3) return 10;
    if (count === 2) return 1;
    return 0;
  };
  for (let i = 0; i < BOARD_SIZE; i++) {
    const row = board[i];
    const col = board.map(r => r[i]);
    score += lineScore(row, aiPlayer) - lineScore(row, opponent);
    score += lineScore(col, aiPlayer) - lineScore(col, opponent);
  }
  const diag1 = board.map((row, i) => row[i]);
  const diag2 = board.map((row, i) => row[BOARD_SIZE - 1 - i]);
  score += lineScore(diag1, aiPlayer) - lineScore(diag1, opponent);
  score += lineScore(diag2, aiPlayer) - lineScore(diag2, opponent);
  return score;
};

const minimax = (board: BoardState, depth: number, alpha: number, beta: number, isMaximizing: boolean, aiPlayer: Player): number => {
  const score = evaluateBoard(board, aiPlayer);
  if (Math.abs(score) === 10000 || depth === 0) return score;
  const player = isMaximizing ? aiPlayer : (aiPlayer === Player.X ? Player.O : Player.X);
  const moves = getAllValidMoves(board, player);
  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      const newBoard = performMove(board, move.source, move.destination, player);
      const evaluation = minimax(newBoard, depth - 1, alpha, beta, false, aiPlayer);
      maxEval = Math.max(maxEval, evaluation);
      alpha = Math.max(alpha, evaluation);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      const newBoard = performMove(board, move.source, move.destination, player);
      const evaluation = minimax(newBoard, depth - 1, alpha, beta, true, aiPlayer);
      minEval = Math.min(minEval, evaluation);
      beta = Math.min(beta, evaluation);
      if (beta <= alpha) break;
    }
    return minEval;
  }
};

export const findBestMove = (board: BoardState, player: Player, difficulty: AIDifficulty): Move => {
  const validMoves = getAllValidMoves(board, player);
  if (validMoves.length === 0) throw new Error('No valid moves');
  if (difficulty === AIDifficulty.Beginner) {
    return validMoves[Math.floor(Math.random() * validMoves.length)];
  }
  let bestScore = -Infinity;
  let bestMove = validMoves[0];
  const depth = difficulty === AIDifficulty.Intermediate ? 1 : 3;
  for (const move of validMoves) {
    const newBoard = performMove(board, move.source, move.destination, player);
    const score = minimax(newBoard, depth, -Infinity, Infinity, false, player);
    if (score > bestScore) { bestScore = score; bestMove = move; }
  }
  const bestMoves = validMoves.filter(move => {
    const newBoard = performMove(board, move.source, move.destination, player);
    return minimax(newBoard, depth, -Infinity, Infinity, false, player) === bestScore;
  });
  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
};
