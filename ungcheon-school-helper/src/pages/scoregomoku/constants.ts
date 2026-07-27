import type { AIDifficulty } from './types'

export const BOARD_SIZES = [5, 6, 7]
export const SCORES: Record<number, number> = { 3: 1, 4: 3, 5: 5, 6: 7, 7: 9 }
export const HANDICAPS: Record<number, number> = { 5: 2, 6: 3, 7: 4 }
export const HUMAN_TURN_TIME = 30
export const AI_MOVE_DELAY = 600
export const AI_THINKING_TIME_LIMIT = 3000
export const CENTER_PRIORITY_WEIGHT = 0.01
export const OPPONENT_SCORE_MULTIPLIER = 2
export const DEPTH_MAP: Record<AIDifficulty, number> = { Easy: 2, Medium: 3, Hard: 5 }
export const INITIAL_RATING = 1000
export const AI_RATING = 1400
export const MAX_LEADERBOARD = 10
export const HUMAN_PLAYER = 'O' as const
export const AI_PLAYER = 'X' as const
