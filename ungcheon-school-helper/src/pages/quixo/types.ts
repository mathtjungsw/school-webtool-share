export enum Player {
  None = 'NONE',
  X = 'X',
  O = 'O',
}

export interface CubeState {
  player: Player;
}

export type BoardState = CubeState[][];

export interface Position {
  row: number;
  col: number;
}

export interface LastMove {
  source: Position;
  destination: Position;
}

export interface CheckWinnerResult {
  winner: Player;
  winningLine: Position[];
}

export enum GameMode {
  PvP = 'PVP',
  PvAI = 'PVA',
}

export enum AIDifficulty {
  Beginner = 'BEGINNER',
  Intermediate = 'INTERMEDIATE',
  Advanced = 'ADVANCED',
}

export interface GameSettings {
  mode: GameMode;
  humanPlayerSymbol: Player.X | Player.O;
  difficulty: AIDifficulty;
  startingPlayer: Player.X | Player.O;
}
