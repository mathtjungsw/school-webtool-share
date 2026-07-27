import { Scores } from './types';

export const SCORE_MAPS: { [size: number]: { [key: number]: number } } = {
  5: { 3: 1, 4: 4, 5: 9 },
  6: { 3: 1, 4: 4, 5: 9, 6: 16 },
  7: { 3: 1, 4: 4, 5: 9, 6: 16, 7: 25 },
};

export const HANDICAP_MAP: { [size: number]: number } = {
  5: 2,
  6: 2,
  7: 3,
};

export const INITIAL_SCORES: Scores = { O: 0, X: 0 };
