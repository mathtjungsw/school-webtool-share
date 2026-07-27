import { BoardState, Player, Scores, Line } from './types';
import { SCORE_MAPS, HANDICAP_MAP } from './constants';

export const calculatePlayerScore = (board: BoardState, player: Player): { score: number; lines: Line[] } => {
  let score = 0;
  const lines: Line[] = [];
  const boardSize = board.length;
  const scoreMap = SCORE_MAPS[boardSize] || {};

  for (let r = 0; r < boardSize; r++) {
    for (let c = 0; c < boardSize; c++) {
      if (board[r][c] !== player) continue;

      if (c === 0 || board[r][c - 1] !== player) {
        let count = 0;
        const currentLine: Line = [];
        for (let k = 0; c + k < boardSize; k++) {
          if (board[r][c + k] === player) { count++; currentLine.push([r, c + k]); } else break;
        }
        if (scoreMap[count]) { score += scoreMap[count]; lines.push(currentLine); }
      }

      if (r === 0 || board[r - 1][c] !== player) {
        let count = 0;
        const currentLine: Line = [];
        for (let k = 0; r + k < boardSize; k++) {
          if (board[r + k][c] === player) { count++; currentLine.push([r + k, c]); } else break;
        }
        if (scoreMap[count]) { score += scoreMap[count]; lines.push(currentLine); }
      }

      if (r === 0 || c === 0 || board[r - 1][c - 1] !== player) {
        let count = 0;
        const currentLine: Line = [];
        for (let k = 0; r + k < boardSize && c + k < boardSize; k++) {
          if (board[r + k][c + k] === player) { count++; currentLine.push([r + k, c + k]); } else break;
        }
        if (scoreMap[count]) { score += scoreMap[count]; lines.push(currentLine); }
      }

      if (r === 0 || c === boardSize - 1 || board[r - 1][c + 1] !== player) {
        let count = 0;
        const currentLine: Line = [];
        for (let k = 0; r + k < boardSize && c - k >= 0; k++) {
          if (board[r + k][c - k] === player) { count++; currentLine.push([r + k, c - k]); } else break;
        }
        if (scoreMap[count]) { score += scoreMap[count]; lines.push(currentLine); }
      }
    }
  }
  return { score, lines };
};

export const getLineCounts = (board: BoardState, player: Player): { [length: number]: number } => {
  const counts: { [length: number]: number } = {};
  const boardSize = board.length;

  for (let r = 0; r < boardSize; r++) {
    for (let c = 0; c < boardSize; c++) {
      if (board[r][c] !== player) continue;

      if (c === 0 || board[r][c - 1] !== player) {
        let count = 0;
        for (let k = 0; c + k < boardSize; k++) { if (board[r][c + k] === player) count++; else break; }
        if (count >= 3) counts[count] = (counts[count] || 0) + 1;
      }

      if (r === 0 || board[r - 1][c] !== player) {
        let count = 0;
        for (let k = 0; r + k < boardSize; k++) { if (board[r + k][c] === player) count++; else break; }
        if (count >= 3) counts[count] = (counts[count] || 0) + 1;
      }

      if (r === 0 || c === 0 || board[r - 1][c - 1] !== player) {
        let count = 0;
        for (let k = 0; r + k < boardSize && c + k < boardSize; k++) { if (board[r + k][c + k] === player) count++; else break; }
        if (count >= 3) counts[count] = (counts[count] || 0) + 1;
      }

      if (r === 0 || c === boardSize - 1 || board[r - 1][c + 1] !== player) {
        let count = 0;
        for (let k = 0; r + k < boardSize && c - k >= 0; k++) { if (board[r + k][c - k] === player) count++; else break; }
        if (count >= 3) counts[count] = (counts[count] || 0) + 1;
      }
    }
  }
  return counts;
};

export const calculateScores = (board: BoardState): { scores: Scores; lines: Line[] } => {
  const boardSize = board.length;
  if (!boardSize) return { scores: { O: 0, X: 0 }, lines: [] };
  const { score: oScore, lines: oLines } = calculatePlayerScore(board, 'O');
  const { score: xScore, lines: xLines } = calculatePlayerScore(board, 'X');
  const handicap = HANDICAP_MAP[boardSize] || 0;
  return { scores: { O: oScore, X: xScore + handicap }, lines: [...oLines, ...xLines] };
};

export const isBoardFull = (board: BoardState): boolean =>
  board.every(row => row.every(cell => cell !== null));
