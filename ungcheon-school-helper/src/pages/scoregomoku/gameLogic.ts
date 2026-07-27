import type { Board, CellValue, Move, Scores } from './types'
import { SCORES, HANDICAPS } from './constants'

export function createBoard(size: number): Board {
  return Array(size).fill(null).map(() => Array(size).fill(null))
}

export function isFull(board: Board): boolean {
  return board.every(row => row.every(cell => cell !== null))
}

export function getEmpty(board: Board): Move[] {
  const moves: Move[] = []
  for (let r = 0; r < board.length; r++)
    for (let c = 0; c < board[r].length; c++)
      if (board[r][c] === null) moves.push({ row: r, col: c })
  return moves
}

export function getAllLines(board: Board): CellValue[][] {
  const size = board.length
  const lines: CellValue[][] = []

  for (let i = 0; i < size; i++) lines.push([...board[i]])

  for (let j = 0; j < size; j++) lines.push(board.map(row => row[j]))

  for (let k = 1 - size; k < size; k++) {
    const diag: CellValue[] = []
    for (let r = 0; r < size; r++) {
      const c = r - k
      if (c >= 0 && c < size) diag.push(board[r][c])
    }
    if (diag.length >= 3) lines.push(diag)
  }

  for (let k = 0; k < 2 * size - 1; k++) {
    const diag: CellValue[] = []
    for (let r = 0; r < size; r++) {
      const c = k - r
      if (c >= 0 && c < size) diag.push(board[r][c])
    }
    if (diag.length >= 3) lines.push(diag)
  }

  return lines
}

function countConsecutive(line: CellValue[], player: CellValue): number {
  let total = 0
  let count = 0
  for (const cell of line) {
    if (cell === player) {
      count++
    } else {
      if (count >= 3 && SCORES[count]) total += SCORES[count]
      count = 0
    }
  }
  if (count >= 3 && SCORES[count]) total += SCORES[count]
  return total
}

export function calculateScore(board: Board, player: CellValue): number {
  return getAllLines(board).reduce((sum, line) => sum + countConsecutive(line, player), 0)
}

export function calculateBothScores(
  board: Board,
  boardSize: number,
  firstPlayer: 'O' | 'X',
  gameMode: 'PvE' | 'PvP' | 'AvA'
): Scores {
  const oScore = calculateScore(board, 'O')
  const xScore = calculateScore(board, 'X')
  const handicap = HANDICAPS[boardSize] ?? 0

  // The second player (who doesn't go first) gets the handicap bonus
  if (firstPlayer === 'O') {
    return { O: oScore, X: xScore + handicap }
  } else {
    return { O: oScore + handicap, X: xScore }
  }
}
