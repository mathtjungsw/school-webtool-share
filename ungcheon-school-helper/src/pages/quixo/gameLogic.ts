import { BoardState, CubeState, Player, Position, CheckWinnerResult } from './types';

export const BOARD_SIZE = 5;

export const createInitialBoard = (): BoardState =>
  Array(BOARD_SIZE).fill(null).map(() =>
    Array(BOARD_SIZE).fill(null).map(() => ({ player: Player.None }))
  );

export const isValidSelection = (board: BoardState, pos: Position, currentPlayer: Player): boolean => {
  const { row, col } = pos;
  const isEdge = row === 0 || row === BOARD_SIZE - 1 || col === 0 || col === BOARD_SIZE - 1;
  if (!isEdge) return false;
  const cube = board[row][col];
  return cube.player === Player.None || cube.player === currentPlayer;
};

export const getValidPushDestinations = (source: Position): Position[] => {
  const { row, col } = source;
  const destinations: Position[] = [];
  if (row === 0 && col > 0 && col < BOARD_SIZE - 1) {
    destinations.push({ row: BOARD_SIZE - 1, col });
  } else if (row === BOARD_SIZE - 1 && col > 0 && col < BOARD_SIZE - 1) {
    destinations.push({ row: 0, col });
  } else if (col === 0 && row > 0 && row < BOARD_SIZE - 1) {
    destinations.push({ row, col: BOARD_SIZE - 1 });
  } else if (col === BOARD_SIZE - 1 && row > 0 && row < BOARD_SIZE - 1) {
    destinations.push({ row, col: 0 });
  } else {
    if (row === 0 && col === 0) destinations.push({ row: BOARD_SIZE - 1, col: 0 }, { row: 0, col: BOARD_SIZE - 1 });
    else if (row === 0 && col === BOARD_SIZE - 1) destinations.push({ row: BOARD_SIZE - 1, col: BOARD_SIZE - 1 }, { row: 0, col: 0 });
    else if (row === BOARD_SIZE - 1 && col === 0) destinations.push({ row: 0, col: 0 }, { row: BOARD_SIZE - 1, col: BOARD_SIZE - 1 });
    else if (row === BOARD_SIZE - 1 && col === BOARD_SIZE - 1) destinations.push({ row: 0, col: BOARD_SIZE - 1 }, { row: BOARD_SIZE - 1, col: 0 });
  }
  return destinations;
};

export const performMove = (board: BoardState, source: Position, destination: Position, player: Player): BoardState => {
  const newBoard = board.map(row => row.map(cube => ({ ...cube })));
  const pieceToPush: CubeState = { player };
  newBoard[source.row][source.col] = { player: Player.None };
  if (source.row === destination.row) {
    const row = source.row;
    if (source.col < destination.col) {
      for (let c = source.col; c < destination.col; c++) newBoard[row][c] = newBoard[row][c + 1];
    } else {
      for (let c = source.col; c > destination.col; c--) newBoard[row][c] = newBoard[row][c - 1];
    }
  } else {
    const col = source.col;
    if (source.row < destination.row) {
      for (let r = source.row; r < destination.row; r++) newBoard[r][col] = newBoard[r + 1][col];
    } else {
      for (let r = source.row; r > destination.row; r--) newBoard[r][col] = newBoard[r - 1][col];
    }
  }
  newBoard[destination.row][destination.col] = pieceToPush;
  return newBoard;
};

export const checkWinner = (board: BoardState): CheckWinnerResult | null => {
  const checkLine = (line: CubeState[]): Player | null => {
    const first = line[0].player;
    if (first === Player.None) return null;
    if (line.every(cube => cube.player === first)) return first;
    return null;
  };
  for (let r = 0; r < BOARD_SIZE; r++) {
    const winner = checkLine(board[r]);
    if (winner) return { winner, winningLine: Array.from({ length: BOARD_SIZE }, (_, c) => ({ row: r, col: c })) };
  }
  for (let c = 0; c < BOARD_SIZE; c++) {
    const winner = checkLine(board.map(row => row[c]));
    if (winner) return { winner, winningLine: Array.from({ length: BOARD_SIZE }, (_, r) => ({ row: r, col: c })) };
  }
  const d1 = board.map((row, i) => row[i]);
  let w = checkLine(d1);
  if (w) return { winner: w, winningLine: Array.from({ length: BOARD_SIZE }, (_, i) => ({ row: i, col: i })) };
  const d2 = board.map((row, i) => row[BOARD_SIZE - 1 - i]);
  w = checkLine(d2);
  if (w) return { winner: w, winningLine: Array.from({ length: BOARD_SIZE }, (_, i) => ({ row: i, col: BOARD_SIZE - 1 - i })) };
  return null;
};
