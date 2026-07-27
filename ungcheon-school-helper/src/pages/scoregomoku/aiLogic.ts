import type { Board, CellValue, Move } from './types'
import { AI_THINKING_TIME_LIMIT, CENTER_PRIORITY_WEIGHT, OPPONENT_SCORE_MULTIPLIER } from './constants'
import { calculateScore, getAllLines, getEmpty } from './gameLogic'

function calculateThreatScore(board: Board, player: CellValue): number {
  const opponent: CellValue = player === 'X' ? 'O' : 'X'
  let score = 0

  const checkLine = (line: CellValue[]) => {
    const str = line.map(c => c === player ? 'P' : c === opponent ? 'O' : '.').join('')
    if (str.includes('PPPPPPP') || str.includes('PPPPPP') || str.includes('PPPPP')) { score += 100000; return }
    if (str.includes('.PPPP.')) score += 10000
    if (str.includes('OPPPP.') || str.includes('.PPPPO')) score += 5000
    if (str.includes('.PPP.')) score += 100
  }

  getAllLines(board).forEach(checkLine)
  return score
}

function getAdvancedScore(board: Board, player: CellValue): number {
  return calculateScore(board, player) + calculateThreatScore(board, player)
}

function evaluateBoard(board: Board): number {
  const aiScore = getAdvancedScore(board, 'X')
  const humanScore = getAdvancedScore(board, 'O')
  if (aiScore >= 100000) return Infinity
  if (humanScore >= 100000) return -Infinity
  return aiScore - humanScore * OPPONENT_SCORE_MULTIPLIER
}

function getCenterPriority(move: Move, size: number): number {
  const center = (size - 1) / 2
  const dist = Math.sqrt((move.row - center) ** 2 + (move.col - center) ** 2)
  return (center - dist) * CENTER_PRIORITY_WEIGHT
}

function sortMoves(moves: Move[], size: number): Move[] {
  return [...moves].sort((a, b) => getCenterPriority(b, size) - getCenterPriority(a, size))
}

function minimax(
  board: Board,
  depth: number,
  alpha: number,
  beta: number,
  isMax: boolean,
  startTime: number,
  timeLimit: number,
  transpositionTable: Map<string, { score: number; depth: number; move: Move | null }>
): { score: number; move: Move | null } {
  if (Date.now() - startTime > timeLimit) throw new Error('timeout')

  const key = board.map(r => r.map(c => c ?? '.').join('')).join('|')
  const cached = transpositionTable.get(key)
  if (cached && cached.depth >= depth) return { score: cached.score, move: cached.move }

  const score = evaluateBoard(board)
  const empty = getEmpty(board)
  if (score === Infinity || score === -Infinity || depth === 0 || empty.length === 0) {
    return { score, move: null }
  }

  const moves = sortMoves(empty, board.length)
  let bestMove: Move | null = null

  if (isMax) {
    let best = -Infinity
    for (const m of moves) {
      board[m.row][m.col] = 'X'
      const { score: s } = minimax(board, depth - 1, alpha, beta, false, startTime, timeLimit, transpositionTable)
      board[m.row][m.col] = null
      if (s > best) { best = s; bestMove = m }
      alpha = Math.max(alpha, s)
      if (beta <= alpha) break
    }
    transpositionTable.set(key, { score: best, depth, move: bestMove })
    return { score: best, move: bestMove }
  } else {
    let best = Infinity
    for (const m of moves) {
      board[m.row][m.col] = 'O'
      const { score: s } = minimax(board, depth - 1, alpha, beta, true, startTime, timeLimit, transpositionTable)
      board[m.row][m.col] = null
      if (s < best) { best = s; bestMove = m }
      beta = Math.min(beta, s)
      if (beta <= alpha) break
    }
    transpositionTable.set(key, { score: best, depth, move: bestMove })
    return { score: best, move: bestMove }
  }
}

export function findBestMove(board: Board, maxDepth: number, timeLimit = AI_THINKING_TIME_LIMIT): Move | null {
  const empty = getEmpty(board)
  if (empty.length === 0) return null

  // Make a mutable copy so minimax can mutate in-place safely
  const boardCopy = board.map(r => [...r])

  // 호출마다 새 테이블 생성 → 전역 상태 오염 없음
  const transpositionTable = new Map<string, { score: number; depth: number; move: Move | null }>()
  const startTime = Date.now()
  let bestMove: Move | null = null
  let depth = 1

  while (Date.now() - startTime < timeLimit && depth <= maxDepth) {
    try {
      const result = minimax(boardCopy, depth, -Infinity, Infinity, true, startTime, timeLimit, transpositionTable)
      if (result.move) bestMove = result.move
      if (result.score === Infinity || result.score === -Infinity) break
    } catch {
      break
    }
    depth++
  }

  return bestMove ?? empty[Math.floor(Math.random() * empty.length)]
}
