export type Player = 'O' | 'X';
export type CellValue = Player | null;
export type BoardState = CellValue[][];

export enum GameMode {
  PvP = 'PvP',
  PvAI = 'PvAI',
  AIvAI = 'AIvAI',
}

export enum Difficulty {
  Easy = 'easy',
  Medium = 'medium',
  Hard = 'hard',
}

export interface GameSettings {
  mode: GameMode;
  boardSize: number;
  difficulty?: Difficulty;
  playerMark?: Player;
  difficultyO?: Difficulty;
  difficultyX?: Difficulty;
}

export interface Scores {
  O: number;
  X: number;
}

export type Move = [number, number];
export type Line = Move[];

export interface HistoryEntry {
  board: BoardState;
  scores: Scores;
  lastMove: Move | null;
  currentPlayer: Player;
  scoringLines: Line[];
  winRateO?: number;
}
