export type CellValue = 'O' | 'X' | null
export type Board = CellValue[][]
export type GameMode = 'PvE' | 'PvP' | 'AvA'
export type AIDifficulty = 'Easy' | 'Medium' | 'Hard'

export interface Move { row: number; col: number }
export interface HistoryMove extends Move { player: 'O' | 'X'; boardSnapshot: string }
export interface Scores { O: number; X: number }
export interface PlayerNames { O: string; X: string }

export interface Season {
  id: string
  badge: 'Gold' | 'Silver' | 'Bronze' | 'Unranked'
  rating: number
  games: number
  wins: number
}

export interface GameStats {
  totalGames: number
  wins: number
  losses: number
  draws: number
}

export interface LeaderboardEntry {
  name: string
  score: number
  boardSize: number
  date: string
}

export interface PersistentData {
  stats: GameStats
  season: { id: string; previous: Season | null }
  ratings: { O: number; X: number }
  ratingHistory: { season: string; rating: number }[]
  leaderboard: LeaderboardEntry[]
}
