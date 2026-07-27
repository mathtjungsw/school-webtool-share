import { useEffect, useReducer, useRef, useCallback, useState } from 'react'
import type {
  Board, GameMode, AIDifficulty, Move, HistoryMove,
  Scores, PlayerNames, Season, GameStats, LeaderboardEntry, PersistentData
} from './scoregomoku/types'
import {
  BOARD_SIZES, SCORES, HANDICAPS, HUMAN_TURN_TIME, AI_MOVE_DELAY,
  DEPTH_MAP, INITIAL_RATING, AI_RATING, MAX_LEADERBOARD, AI_PLAYER
} from './scoregomoku/constants'
import { createBoard, isFull, calculateBothScores } from './scoregomoku/gameLogic'
import { findBestMove } from './scoregomoku/aiLogic'
import {
  Trophy, RotateCcw, ChevronLeft, BarChart2, Star, Award, Clock, Users, Bot, CircleDot, BookOpen
} from 'lucide-react'
import GameGuideModal, { GuideStep, GuideCard, type GuideTab } from '../components/GameGuideModal'

// ── 점수 오목 완벽 가이드 ──────────────────────────────────────────
const SCORE_GOMOKU_GUIDE: GuideTab[] = [
  {
    id: 'rules', label: '규칙',
    content: (
      <>
        <GuideStep n={1}>O와 X가 번갈아 돌을 놓습니다. (vs AI · 2인 대전 · AI끼리 관전)</GuideStep>
        <GuideStep n={2}>일반 오목과 달리 5개를 먼저 만들어도 <strong>끝나지 않습니다.</strong> 보드가 가득 찰 때까지 진행!</GuideStep>
        <GuideStep n={3}>게임 종료 시 만들어 둔 <strong>연속 돌의 점수 합계</strong>가 높은 쪽이 승리합니다.</GuideStep>
      </>
    ),
  },
  {
    id: 'score', label: '점수',
    content: (
      <>
        <GuideCard title="🎯 연속 점수표" color="indigo">
          3연속=1pt · 4연속=3pt · 5연속=5pt · 6연속=7pt · 7연속 이상=9pt<br />
          가로·세로·대각선 <strong>모든 방향</strong>이 인정됩니다.
        </GuideCard>
        <GuideCard title="⚖️ 후공 핸디캡" color="amber">
          불리한 후공 플레이어에게 보드 크기에 따라 보너스 점수가 더해져 균형을 맞춥니다.
        </GuideCard>
        <p className="text-xs text-slate-400">길게 이을수록 점수가 가파르게 오릅니다 — 짧은 줄 여러 개보다 <strong className="text-slate-200">긴 줄 하나</strong>가 유리합니다.</p>
      </>
    ),
  },
  {
    id: 'strategy', label: '전략',
    content: (
      <>
        <ul className="list-disc space-y-1.5 pl-5 text-xs text-slate-400">
          <li>한 줄을 길게 잇되, 끊기지 않도록 <strong className="text-slate-200">양쪽을 열어</strong> 두세요.</li>
          <li>상대의 긴 줄은 길어지기 전에 막아 점수 상승을 차단합니다.</li>
          <li>한 돌이 <strong className="text-slate-200">여러 방향</strong>(가로+대각선)에 동시에 기여하도록 교차점을 노리세요.</li>
          <li>AI를 이기면 시즌 레이팅이 오릅니다 — 난이도가 높을수록 보상이 큽니다.</li>
        </ul>
      </>
    ),
  },
]

// ─── Types ────────────────────────────────────────────────────────────────────
type Screen = 'setup' | 'game' | 'result'
type SideTab = 'stats' | 'season' | 'leaderboard'

interface Settings {
  playerNames: PlayerNames
  boardSize: number
  gameMode: GameMode
  difficulty: AIDifficulty
  firstPlayer: 'O' | 'X'
}

interface GameState {
  screen: Screen
  settings: Settings
  board: Board
  turn: 'O' | 'X'
  scores: Scores
  timer: number
  isGameOver: boolean
  isAIThinking: boolean
  history: HistoryMove[]
  replayIndex: number | null
  lastMove: Move | null
  winReason: string
  stats: GameStats
  season: { id: string; previous: Season | null }
  ratings: { O: number; X: number }
  ratingHistory: { season: string; rating: number }[]
  leaderboard: LeaderboardEntry[]
}

type Action =
  | { type: 'LOAD_PERSISTENT'; payload: Partial<PersistentData> }
  | { type: 'GO_SETUP' }
  | { type: 'START_GAME'; payload: Settings }
  | { type: 'MAKE_MOVE'; payload: Move & { player: 'O' | 'X' } }
  | { type: 'TICK' }
  | { type: 'GAME_OVER'; payload: { reason: string; scores: Scores; winnerIsO?: boolean } }
  | { type: 'AI_THINKING'; payload: boolean }
  | { type: 'START_REPLAY' }
  | { type: 'REPLAY_STEP'; payload: Board }
  | { type: 'STOP_REPLAY' }
  | { type: 'UPDATE_RATINGS'; payload: { newO: number } }
  | { type: 'UPDATE_LEADERBOARD'; payload: LeaderboardEntry[] }
  | { type: 'END_SEASON' }
  | { type: 'RESET_STATS' }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function calcNewRating(o: number, x: number, result: 1 | 0 | 0.5): number {
  return Math.round(o + 32 * (result - 1 / (1 + Math.pow(10, (x - o) / 400))))
}

function getBadge(r: number): Season['badge'] {
  return r >= 1300 ? 'Gold' : r >= 1100 ? 'Silver' : r >= 950 ? 'Bronze' : 'Unranked'
}

// ─── Initial state ────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS: Settings = {
  playerNames: { O: '', X: 'AI' },
  boardSize: 5,
  gameMode: 'PvE',
  difficulty: 'Medium',
  firstPlayer: 'O',
}

const INITIAL_STATE: GameState = {
  screen: 'setup',
  settings: DEFAULT_SETTINGS,
  board: createBoard(5),
  turn: 'O',
  scores: { O: 0, X: HANDICAPS[5] },
  timer: HUMAN_TURN_TIME,
  isGameOver: false,
  isAIThinking: false,
  history: [],
  replayIndex: null,
  lastMove: null,
  winReason: '',
  stats: { totalGames: 0, wins: 0, losses: 0, draws: 0 },
  season: { id: 'S1', previous: null },
  ratings: { O: INITIAL_RATING, X: AI_RATING },
  ratingHistory: [{ season: 'S1', rating: INITIAL_RATING }],
  leaderboard: [],
}

// ─── Reducer ──────────────────────────────────────────────────────────────────
function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'LOAD_PERSISTENT': {
      const p = action.payload
      return {
        ...state,
        stats: p.stats ?? state.stats,
        season: p.season ?? state.season,
        ratings: p.ratings ?? state.ratings,
        ratingHistory: p.ratingHistory ?? state.ratingHistory,
        leaderboard: p.leaderboard ?? state.leaderboard,
      }
    }
    case 'GO_SETUP':
      return { ...state, screen: 'setup' }
    case 'START_GAME': {
      const { boardSize, firstPlayer, gameMode } = action.payload
      const handicap = HANDICAPS[boardSize] ?? 0
      const initScores: Scores = firstPlayer === 'O'
        ? { O: 0, X: handicap }
        : { O: handicap, X: 0 }
      return {
        ...state,
        screen: 'game',
        settings: action.payload,
        board: createBoard(boardSize),
        turn: firstPlayer,
        scores: initScores,
        timer: HUMAN_TURN_TIME,
        isGameOver: false,
        isAIThinking: false,
        history: [],
        replayIndex: null,
        lastMove: null,
        winReason: '',
      }
    }
    case 'MAKE_MOVE': {
      const { row, col, player } = action.payload
      const nb = state.board.map(r => [...r]) as Board
      nb[row][col] = player
      const history: HistoryMove[] = [...state.history, { row, col, player, boardSnapshot: JSON.stringify(nb) }]
      const newScores = calculateBothScores(nb, state.settings.boardSize, state.settings.firstPlayer, state.settings.gameMode)
      return {
        ...state,
        board: nb,
        turn: player === 'O' ? 'X' : 'O',
        scores: newScores,
        history,
        lastMove: { row, col },
        timer: HUMAN_TURN_TIME,
        isAIThinking: false,
      }
    }
    case 'TICK':
      return { ...state, timer: Math.max(0, state.timer - 1) }
    case 'GAME_OVER': {
      const { reason, scores, winnerIsO } = action.payload
      const newStats = state.settings.gameMode === 'PvE' ? {
        totalGames: state.stats.totalGames + 1,
        wins: winnerIsO === true ? state.stats.wins + 1 : state.stats.wins,
        losses: winnerIsO === false ? state.stats.losses + 1 : state.stats.losses,
        draws: winnerIsO === undefined ? state.stats.draws + 1 : state.stats.draws,
      } : state.stats
      return { ...state, isGameOver: true, isAIThinking: false, winReason: reason, scores, stats: newStats, screen: 'result' }
    }
    case 'AI_THINKING':
      return { ...state, isAIThinking: action.payload }
    case 'START_REPLAY':
      return { ...state, replayIndex: 0, board: createBoard(state.settings.boardSize) }
    case 'REPLAY_STEP':
      return { ...state, board: action.payload, replayIndex: (state.replayIndex ?? 0) + 1 }
    case 'STOP_REPLAY': {
      const last = state.history[state.history.length - 1]?.boardSnapshot
      let finalBoard: Board = createBoard(state.settings.boardSize)
      if (last) {
        try { finalBoard = JSON.parse(last) } catch { /* keep default */ }
      }
      return { ...state, replayIndex: null, board: finalBoard }
    }
    case 'UPDATE_RATINGS': {
      const { newO } = action.payload
      const rh = state.ratingHistory.map(r => r.season === state.season.id ? { ...r, rating: newO } : r)
      return { ...state, ratings: { ...state.ratings, O: newO }, ratingHistory: rh }
    }
    case 'UPDATE_LEADERBOARD':
      return { ...state, leaderboard: action.payload }
    case 'END_SEASON': {
      const { O: rating } = state.ratings
      const prev: Season = { id: state.season.id, badge: getBadge(rating), rating, games: state.stats.totalGames, wins: state.stats.wins }
      const nextId = `S${parseInt(state.season.id.slice(1)) + 1}`
      const newRating = Math.round((rating + INITIAL_RATING) / 2)
      return {
        ...INITIAL_STATE,
        season: { id: nextId, previous: prev },
        ratings: { O: newRating, X: AI_RATING },
        ratingHistory: [...state.ratingHistory, { season: nextId, rating: newRating }],
        leaderboard: state.leaderboard,
      }
    }
    case 'RESET_STATS':
      return {
        ...state,
        stats: { totalGames: 0, wins: 0, losses: 0, draws: 0 },
        ratings: { O: INITIAL_RATING, X: AI_RATING },
        ratingHistory: [{ season: 'S1', rating: INITIAL_RATING }],
        leaderboard: [] as LeaderboardEntry[],
        season: { id: 'S1', previous: null as Season | null },
      }
    default:
      return state
  }
}

// ─── Persist ──────────────────────────────────────────────────────────────────
async function loadPersistent(): Promise<Partial<PersistentData>> {
  try {
    const [stats, season, ratings, ratingHistory, leaderboard] = await Promise.all([
      window.electron.configGet('scoregomoku.stats'),
      window.electron.configGet('scoregomoku.season'),
      window.electron.configGet('scoregomoku.ratings'),
      window.electron.configGet('scoregomoku.ratingHistory'),
      window.electron.configGet('scoregomoku.leaderboard'),
    ])
    return { stats, season, ratings, ratingHistory, leaderboard } as Partial<PersistentData>
  } catch { return {} }
}

async function persistState(s: GameState) {
  try {
    await Promise.all([
      window.electron.configSet('scoregomoku.stats', s.stats),
      window.electron.configSet('scoregomoku.season', s.season),
      window.electron.configSet('scoregomoku.ratings', s.ratings),
      window.electron.configSet('scoregomoku.ratingHistory', s.ratingHistory),
      window.electron.configSet('scoregomoku.leaderboard', s.leaderboard),
    ])
  } catch { /* ignore */ }
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function ScoreDisplay({ scores, turn, playerNames, isAIThinking, timer, gameMode, firstPlayer, boardSize }: {
  scores: Scores; turn: 'O' | 'X'; playerNames: PlayerNames
  isAIThinking: boolean; timer: number; gameMode: GameMode; firstPlayer: 'O' | 'X'; boardSize: number
}) {
  const hc = HANDICAPS[boardSize] ?? 0
  const oName = gameMode === 'AvA' ? 'AI (O)' : (playerNames.O || '플레이어')
  const xName = gameMode === 'PvP' ? (playerNames.X || '플레이어 2') : 'AI (X)'
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className={`flex-1 rounded-xl p-3 text-center transition-all ${turn === 'O' ? 'bg-sky-500/20 ring-2 ring-sky-400' : 'bg-surface-800'}`}>
        <div className="text-xs text-slate-400 mb-1 flex items-center justify-center gap-1">
          <span className="w-2 h-2 rounded-full bg-sky-400 inline-block" />
          {oName}{firstPlayer !== 'O' && <span className="text-yellow-400">+{hc}</span>}
        </div>
        <div className="text-2xl font-bold text-sky-300">{scores.O}</div>
      </div>
      <div className="px-1 flex flex-col items-center gap-0.5 min-w-[44px]">
        {gameMode === 'AvA'
          ? <><Bot className="w-5 h-5 text-indigo-400" /><span className="text-xs text-indigo-300">자동</span></>
          : isAIThinking
            ? <><div className="w-5 h-5 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" /><span className="text-xs text-rose-300">AI</span></>
            : <><Clock className="w-4 h-4 text-amber-400" /><span className={`text-sm font-bold tabular-nums ${timer <= 5 ? 'text-rose-400 animate-pulse' : 'text-amber-300'}`}>{timer}s</span></>}
      </div>
      <div className={`flex-1 rounded-xl p-3 text-center transition-all ${turn === 'X' ? 'bg-rose-500/20 ring-2 ring-rose-400' : 'bg-surface-800'}`}>
        <div className="text-xs text-slate-400 mb-1 flex items-center justify-center gap-1">
          <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />
          {xName}{firstPlayer !== 'X' && <span className="text-yellow-400">+{hc}</span>}
        </div>
        <div className="text-2xl font-bold text-rose-300">{scores.X}</div>
      </div>
    </div>
  )
}

function BoardGrid({ board, lastMove, onClick }: { board: Board; lastMove: Move | null; onClick: (r: number, c: number) => void }) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${board.length}, 1fr)` }}>
      {board.map((row, r) => row.map((cell, c) => {
        const isLast = !!(lastMove && lastMove.row === r && lastMove.col === c)
        return (
          <button key={`${r}-${c}`} onClick={() => onClick(r, c)}
            className={[
              'aspect-square rounded-md text-lg font-bold transition-all border-2 flex items-center justify-center',
              cell === null ? 'border-surface-600 hover:border-slate-500 hover:bg-surface-700 cursor-pointer' : 'cursor-default',
              isLast ? 'border-yellow-400 shadow-lg shadow-yellow-400/30' : '',
              cell === 'O' && !isLast ? 'border-sky-700 bg-sky-500/10' : '',
              cell === 'X' && !isLast ? 'border-rose-700 bg-rose-500/10' : '',
            ].join(' ')}>
            {cell === 'O' && <span className="text-sky-300 select-none">○</span>}
            {cell === 'X' && <span className="text-rose-300 select-none">×</span>}
          </button>
        )
      }))}
    </div>
  )
}

function ScoringGuide({ boardSize, gameMode }: { boardSize: number; gameMode?: GameMode }) {
  return (
    <div className="mt-2 p-2 bg-surface-800 rounded-lg flex flex-wrap justify-center gap-x-3 gap-y-0.5 text-xs text-slate-400">
      {Object.entries(SCORES).filter(([k]) => parseInt(k) <= boardSize).map(([k, v]) => (
        <span key={k}>{k}연속=<span className="text-amber-300 font-bold">{v}pt</span></span>
      ))}
      <span className="text-yellow-400/80">후공 핸디캡 +{HANDICAPS[boardSize]}pt</span>
    </div>
  )
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────
function SetupScreen({ onStart, last }: { onStart: (s: Settings) => void; last: Settings }) {
  const [names, setNames] = useState<PlayerNames>(last.playerNames.O ? last.playerNames : { O: '', X: 'AI' })
  const [boardSize, setBoardSize] = useState(last.boardSize)
  const [gameMode, setGameMode] = useState<GameMode>(last.gameMode)
  const [difficulty, setDifficulty] = useState<AIDifficulty>(last.difficulty)
  const [firstPlayer, setFirstPlayer] = useState<'O' | 'X'>(last.firstPlayer)
  const [showGuide, setShowGuide] = useState(false)
  const canStart = gameMode === 'AvA' || (names.O.trim() !== '' && (gameMode === 'PvE' || names.X.trim() !== ''))

  return (
    <div className="max-w-md w-full bg-surface-800 rounded-2xl p-6 border border-surface-600">
      <div className="flex items-center gap-2 mb-5">
        <CircleDot className="w-6 h-6 text-indigo-400" />
        <h2 className="text-xl font-bold text-slate-100">점수 오목</h2>
      </div>

      <div className="mb-4">
        <label className="text-sm font-medium text-slate-300 mb-2 block">게임 모드</label>
        <div className="flex bg-surface-700 rounded-lg p-1 gap-1">
          {([
            { id: 'PvE' as GameMode, label: 'vs AI', icon: <Bot className="w-4 h-4" /> },
            { id: 'PvP' as GameMode, label: '2인 대전', icon: <Users className="w-4 h-4" /> },
            { id: 'AvA' as GameMode, label: 'AI끼리', icon: <Bot className="w-4 h-4" /> },
          ]).map(m => (
            <button key={m.id} onClick={() => setGameMode(m.id)}
              className={`flex-1 py-2 text-xs font-medium rounded-md flex items-center justify-center gap-1 transition-colors
                ${gameMode === m.id ? 'bg-indigo-600 text-white shadow' : 'text-slate-300 hover:text-white'}`}>
              {m.icon}{m.label}
            </button>
          ))}
        </div>
      </div>

      {gameMode !== 'AvA' && (
        <div className="mb-4 space-y-2">
          <div>
            <label className="text-sm font-medium text-slate-300 mb-1 block">
              {gameMode === 'PvE' ? '내 이름' : '플레이어 1 이름 (O)'}
            </label>
            <input value={names.O} onChange={e => setNames(n => ({ ...n, O: e.target.value }))}
              className="w-full bg-surface-700 border border-surface-600 rounded-md py-2 px-3 text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="이름 입력" />
          </div>
          {gameMode === 'PvP' && (
            <div>
              <label className="text-sm font-medium text-slate-300 mb-1 block">플레이어 2 이름 (X)</label>
              <input value={names.X} onChange={e => setNames(n => ({ ...n, X: e.target.value }))}
                className="w-full bg-surface-700 border border-surface-600 rounded-md py-2 px-3 text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="이름 입력" />
            </div>
          )}
        </div>
      )}

      <div className="mb-4">
        <label className="text-sm font-medium text-slate-300 mb-2 block">보드 크기</label>
        <div className="grid grid-cols-3 gap-2">
          {BOARD_SIZES.map(s => (
            <button key={s} onClick={() => setBoardSize(s)}
              className={`py-2 rounded-lg text-sm font-semibold transition-all
                ${boardSize === s ? 'bg-indigo-600 text-white' : 'bg-surface-700 text-slate-300 hover:bg-surface-600'}`}>
              {s}×{s}
            </button>
          ))}
        </div>
      </div>

      <div className={`grid gap-3 mb-4 ${(gameMode === 'PvE' || gameMode === 'AvA') ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {(gameMode === 'PvE' || gameMode === 'AvA') && (
          <div>
            <label className="text-sm font-medium text-slate-300 mb-2 block">AI 난이도</label>
            <div className="space-y-1">
              {(['Easy', 'Medium', 'Hard'] as AIDifficulty[]).map(d => (
                <button key={d} onClick={() => setDifficulty(d)}
                  className={`w-full py-1.5 rounded-md text-sm font-medium transition-all
                    ${difficulty === d ? 'bg-indigo-600 text-white' : 'bg-surface-700 text-slate-300 hover:bg-surface-600'}`}>
                  {d === 'Easy' ? '쉬움' : d === 'Medium' ? '중간' : '어려움'}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <label className="text-sm font-medium text-slate-300 mb-2 block">선공</label>
          <div className="space-y-1">
            <button onClick={() => setFirstPlayer('O')}
              className={`w-full py-1.5 rounded-md text-sm font-medium transition-all
                ${firstPlayer === 'O' ? 'bg-sky-600 text-white' : 'bg-surface-700 text-slate-300 hover:bg-surface-600'}`}>
              {gameMode === 'AvA' ? 'AI (O)' : (names.O || '플레이어')} (O)
            </button>
            <button onClick={() => setFirstPlayer('X')}
              className={`w-full py-1.5 rounded-md text-sm font-medium transition-all
                ${firstPlayer === 'X' ? 'bg-rose-600 text-white' : 'bg-surface-700 text-slate-300 hover:bg-surface-600'}`}>
              {gameMode === 'PvP' ? (names.X || '플레이어 2') : 'AI (X)'}  (X)
            </button>
          </div>
        </div>
      </div>

      <ScoringGuide boardSize={boardSize} gameMode={gameMode} />

      <button disabled={!canStart}
        onClick={() => onStart({
          playerNames: gameMode === 'AvA'
            ? { O: 'AI-O', X: 'AI-X' }
            : { O: names.O.trim(), X: gameMode === 'PvE' ? 'AI' : names.X.trim() },
          boardSize, gameMode, difficulty, firstPlayer,
        })}
        className="mt-4 w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-surface-600 disabled:text-slate-500 text-white font-bold rounded-xl transition-all text-lg">
        게임 시작
      </button>
      <button
        onClick={() => setShowGuide(true)}
        className="mt-2 w-full py-2.5 bg-surface-700 hover:bg-surface-600 text-slate-300 font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all text-sm">
        <BookOpen className="w-4 h-4" /> 게임 방법
      </button>

      <GameGuideModal open={showGuide} onClose={() => setShowGuide(false)} title="📖 점수 오목 완벽 가이드" tabs={SCORE_GOMOKU_GUIDE} />
    </div>
  )
}

// ─── Result Screen ────────────────────────────────────────────────────────────
function ResultScreen({ scores, settings, winReason, historyLength, isReplaying, onReplay, onStopReplay, onNewGame, onSetup }: {
  scores: Scores; settings: Settings; winReason: string; historyLength: number
  isReplaying: boolean; onReplay: () => void; onStopReplay: () => void; onNewGame: () => void; onSetup: () => void
}) {
  const { O, X } = scores
  const oName = settings.gameMode === 'AvA' ? 'AI (O)' : (settings.playerNames.O || '플레이어')
  const xName = settings.gameMode === 'PvP' ? (settings.playerNames.X || '플레이어 2') : 'AI (X)'
  const winner = O > X ? oName : X > O ? xName : null
  return (
    <div className="max-w-md mx-auto mt-4 bg-surface-800 rounded-2xl p-6 border border-surface-600 text-center">
      <Trophy className="w-10 h-10 text-amber-400 mx-auto mb-2" />
      <h2 className="text-2xl font-bold text-slate-100 mb-1">{winner ? `${winner} 승리!` : '무승부!'}</h2>
      <p className="text-sm text-slate-400 mb-4">{winReason}</p>
      <div className="flex gap-4 mb-5">
        <div className="flex-1 bg-sky-500/10 rounded-xl p-3 border border-sky-500/30">
          <div className="text-xs text-sky-400 mb-1">{oName} (O)</div>
          <div className="text-3xl font-bold text-sky-300">{O}</div>
        </div>
        <div className="flex-1 bg-rose-500/10 rounded-xl p-3 border border-rose-500/30">
          <div className="text-xs text-rose-400 mb-1">{xName} (X)</div>
          <div className="text-3xl font-bold text-rose-300">{X}</div>
        </div>
      </div>
      <div className="space-y-2">
        {isReplaying
          ? <button onClick={onStopReplay} className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-all"><RotateCcw className="w-4 h-4" />리플레이 중지</button>
          : <button onClick={onReplay} disabled={historyLength === 0} className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-surface-600 disabled:text-slate-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-all"><RotateCcw className="w-4 h-4" />리플레이</button>}
        <button onClick={onNewGame} className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all">같은 설정으로 새 게임</button>
        <button onClick={onSetup} className="w-full py-2 bg-surface-700 hover:bg-surface-600 text-slate-300 font-semibold rounded-xl flex items-center justify-center gap-2 transition-all"><ChevronLeft className="w-4 h-4" />설정으로</button>
      </div>
    </div>
  )
}

// ─── Side Panel ───────────────────────────────────────────────────────────────
function SidePanel({ stats, season, ratings, ratingHistory, leaderboard, boardSize, onEndSeason, onResetStats }: {
  stats: GameStats; season: GameState['season']; ratings: GameState['ratings']
  ratingHistory: GameState['ratingHistory']; leaderboard: LeaderboardEntry[]
  boardSize: number; onEndSeason: () => void; onResetStats: () => void
}) {
  const [tab, setTab] = useState<SideTab>('stats')
  const badge = getBadge(ratings.O)
  const filtered = leaderboard.filter(e => e.boardSize === boardSize).slice(0, MAX_LEADERBOARD)

  return (
    <div className="bg-surface-800 rounded-2xl border border-surface-600 overflow-hidden">
      <div className="flex border-b border-surface-600">
        {([
          { id: 'stats' as SideTab, icon: <BarChart2 className="w-3.5 h-3.5" />, label: '통계' },
          { id: 'season' as SideTab, icon: <Star className="w-3.5 h-3.5" />, label: '시즌' },
          { id: 'leaderboard' as SideTab, icon: <Award className="w-3.5 h-3.5" />, label: '순위' },
        ]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1 transition-colors
              ${tab === t.id ? 'bg-indigo-600/20 text-indigo-300 border-b-2 border-indigo-400' : 'text-slate-400 hover:text-slate-200'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>
      <div className="p-3">
        {tab === 'stats' && (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-1.5 text-center">
              {[['승', stats.wins, 'text-emerald-400'], ['패', stats.losses, 'text-rose-400'], ['무', stats.draws, 'text-amber-400']].map(([l, v, c]) => (
                <div key={l as string} className="bg-surface-700 rounded-lg p-2">
                  <div className={`text-xl font-bold ${c}`}>{v}</div>
                  <div className="text-xs text-slate-400">{l}</div>
                </div>
              ))}
            </div>
            <div className="text-xs text-slate-500 text-center">총 {stats.totalGames}게임 (PvE)</div>
            <div className="bg-surface-700 rounded-lg p-3 text-center">
              <div className="text-xs text-slate-400 mb-0.5">Elo 레이팅</div>
              <div className="text-2xl font-bold text-indigo-300">{ratings.O}</div>
              <div className={`text-xs font-semibold mt-0.5 ${badge === 'Gold' ? 'text-yellow-400' : badge === 'Silver' ? 'text-slate-300' : badge === 'Bronze' ? 'text-amber-600' : 'text-slate-500'}`}>
                {badge === 'Gold' ? '🥇' : badge === 'Silver' ? '🥈' : badge === 'Bronze' ? '🥉' : '🔰'} {badge}
              </div>
            </div>
            {ratingHistory.length > 1 && (
              <div className="space-y-0.5 text-xs text-slate-400">
                {ratingHistory.slice(-3).map(r => (
                  <div key={r.season} className="flex justify-between"><span>{r.season}</span><span className="text-indigo-300">{r.rating}</span></div>
                ))}
              </div>
            )}
            <button
              onClick={() => { if (window.confirm('전적, 레이팅, 순위를 모두 초기화할까요?')) onResetStats() }}
              className="w-full py-1.5 bg-rose-600/15 hover:bg-rose-600/30 text-rose-400 text-xs font-medium rounded-lg transition-all">
              전적 초기화
            </button>
          </div>
        )}
        {tab === 'season' && (
          <div className="space-y-2">
            <div className="bg-surface-700 rounded-lg p-3 text-center">
              <div className="text-xs text-slate-400 mb-0.5">현재 시즌</div>
              <div className="text-xl font-bold text-indigo-300">{season.id}</div>
              <div className={`text-sm font-semibold ${badge === 'Gold' ? 'text-yellow-400' : badge === 'Silver' ? 'text-slate-300' : badge === 'Bronze' ? 'text-amber-600' : 'text-slate-500'}`}>{badge}</div>
            </div>
            {season.previous && (
              <div className="bg-surface-700 rounded-lg p-3 text-xs text-slate-300 space-y-0.5">
                <div className="text-slate-400 mb-1">이전 ({season.previous.id})</div>
                <div>레이팅: <span className="text-indigo-300 font-bold">{season.previous.rating}</span></div>
                <div>{season.previous.wins}승 / {season.previous.games}게임</div>
              </div>
            )}
            <button onClick={onEndSeason}
              className="w-full py-2 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 text-sm font-medium rounded-lg transition-all">
              시즌 종료
            </button>
          </div>
        )}
        {tab === 'leaderboard' && (
          <div>
            <div className="text-xs text-slate-400 mb-2 text-center">{boardSize}×{boardSize} TOP {MAX_LEADERBOARD}</div>
            {filtered.length === 0
              ? <div className="text-xs text-slate-500 text-center py-4">기록 없음</div>
              : <div className="space-y-1">
                  {filtered.map((e, i) => (
                    <div key={i} className="flex items-center justify-between bg-surface-700 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold w-4 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-600' : 'text-slate-500'}`}>{i + 1}</span>
                        <span className="text-sm text-slate-200 truncate max-w-[80px]">{e.name}</span>
                      </div>
                      <span className="text-sm font-bold text-amber-300">{e.score}pt</span>
                    </div>
                  ))}
                </div>}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function ScoreGomokuPage() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE)
  // Always-fresh ref for use inside stale closures
  const stateRef = useRef(state)
  stateRef.current = state
  const replayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isAITurn = state.screen === 'game' && !state.isGameOver && (
    (state.settings.gameMode === 'PvE' && state.turn === AI_PLAYER) ||
    state.settings.gameMode === 'AvA'
  )

  // endGame을 useEffect보다 먼저 선언 (TDZ 방지)
  const endGame = useCallback((scores: Scores, reason: string) => {
    const s = stateRef.current
    const { O, X } = scores
    const winnerIsO: boolean | undefined = O > X ? true : X > O ? false : undefined
    dispatch({ type: 'GAME_OVER', payload: { reason, scores, winnerIsO } })

    if (s.settings.gameMode === 'PvE') {
      const result: 1 | 0 | 0.5 = O > X ? 1 : X > O ? 0 : 0.5
      const newO = calcNewRating(s.ratings.O, s.ratings.X, result)
      dispatch({ type: 'UPDATE_RATINGS', payload: { newO } })

      if (O > 0) {
        const entry: LeaderboardEntry = {
          name: s.settings.playerNames.O || '플레이어',
          score: O,
          boardSize: s.settings.boardSize,
          date: new Date().toLocaleDateString('ko-KR'),
        }
        const sizeEntries = [...s.leaderboard.filter(e => e.boardSize === entry.boardSize), entry]
          .sort((a, b) => b.score - a.score)
          .slice(0, MAX_LEADERBOARD)
        const otherEntries = s.leaderboard.filter(e => e.boardSize !== entry.boardSize)
        dispatch({ type: 'UPDATE_LEADERBOARD', payload: [...sizeEntries, ...otherEntries] })
      }
    }
  }, [])

  // Load persistent
  useEffect(() => {
    loadPersistent().then(data => dispatch({ type: 'LOAD_PERSISTENT', payload: data }))
  }, [])

  // Timer countdown (AvA는 타이머 없음)
  useEffect(() => {
    if (state.screen !== 'game' || state.isGameOver || state.isAIThinking
      || state.replayIndex !== null || state.settings.gameMode === 'AvA') return
    const id = setInterval(() => dispatch({ type: 'TICK' }), 1000)
    return () => clearInterval(id)
  }, [state.screen, state.isGameOver, state.isAIThinking, state.turn, state.replayIndex, state.settings.gameMode])

  // Timer expiry → game over
  useEffect(() => {
    if (state.timer !== 0 || state.screen !== 'game' || state.isGameOver || state.isAIThinking) return
    const s = stateRef.current
    const timedOut = s.turn
    const name = timedOut === 'O'
      ? (s.settings.playerNames.O || '플레이어')
      : (s.settings.gameMode === 'PvE' ? 'AI' : (s.settings.playerNames.X || '플레이어 2'))
    endGame(s.scores, `${name}의 시간이 초과되었습니다.`)
  }, [state.timer, endGame])

  // AI move (PvE: X만 AI / AvA: 현재 턴 플레이어가 AI, O턴은 보드 미러링)
  useEffect(() => {
    if (!isAITurn) return
    dispatch({ type: 'AI_THINKING', payload: true })
    const id = setTimeout(() => {
      const s = stateRef.current
      if (s.screen !== 'game' || s.isGameOver) return
      const boardCopy = s.board.map(r => [...r]) as Board
      const currentPlayer = s.settings.gameMode === 'AvA' ? s.turn : AI_PLAYER

      // AvA에서 O 차례: 보드를 O↔X 미러링 후 findBestMove(X 기준) → 같은 좌표에 O 배치
      let boardForAI = boardCopy
      if (currentPlayer === 'O') {
        boardForAI = boardCopy.map(r => r.map(c => c === 'O' ? 'X' : c === 'X' ? 'O' : null)) as Board
      }

      const move = findBestMove(boardForAI, DEPTH_MAP[s.settings.difficulty])
      if (!move) {
        const scores = calculateBothScores(boardCopy, s.settings.boardSize, s.settings.firstPlayer, s.settings.gameMode)
        endGame(scores, '보드가 꽉 찼습니다. 최종 점수를 계산합니다.')
        return
      }
      const newBoard = boardCopy.map(r => [...r]) as Board
      newBoard[move.row][move.col] = currentPlayer
      dispatch({ type: 'MAKE_MOVE', payload: { ...move, player: currentPlayer } })
      if (isFull(newBoard)) {
        const scores = calculateBothScores(newBoard, s.settings.boardSize, s.settings.firstPlayer, s.settings.gameMode)
        endGame(scores, '보드가 꽉 찼습니다. 최종 점수를 계산합니다.')
      }
    }, AI_MOVE_DELAY)
    return () => clearTimeout(id)
  }, [isAITurn, state.history.length, endGame])

  // Replay stepper
  useEffect(() => {
    if (replayTimerRef.current) { clearInterval(replayTimerRef.current); replayTimerRef.current = null }
    if (state.replayIndex === null) return
    if (state.replayIndex >= state.history.length) { dispatch({ type: 'STOP_REPLAY' }); return }
    replayTimerRef.current = setInterval(() => {
      const s = stateRef.current
      if (s.replayIndex === null || s.replayIndex >= s.history.length) {
        dispatch({ type: 'STOP_REPLAY' })
        return
      }
      const snap = s.history[s.replayIndex]?.boardSnapshot
      if (snap) {
        try {
          dispatch({ type: 'REPLAY_STEP', payload: JSON.parse(snap) })
        } catch { dispatch({ type: 'STOP_REPLAY' }) }
      }
    }, 800)
    return () => { if (replayTimerRef.current) clearInterval(replayTimerRef.current) }
  }, [state.replayIndex, state.history])

  // Persist on result
  useEffect(() => {
    if (state.screen === 'result') persistState(stateRef.current)
  }, [state.screen, state.stats, state.ratings, state.leaderboard])

  // TTS 음성 출력
  const speak = useCallback((text: string) => {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'ko-KR'
    u.rate = 1.3
    u.volume = 1
    window.speechSynthesis.speak(u)
  }, [])

  // 타이머 카운트다운 음성 (10초 이하, 인간 턴일 때)
  useEffect(() => {
    if (state.screen !== 'game' || state.isGameOver || state.isAIThinking) return
    if (state.settings.gameMode === 'AvA') return
    if (state.timer <= 0 || state.timer > 10) return
    speak(String(state.timer))
  }, [state.timer, state.screen, state.isGameOver, state.isAIThinking, state.settings.gameMode, speak])

  // 게임 종료 시 승리자 발표
  useEffect(() => {
    if (state.screen !== 'result') return
    const id = setTimeout(() => {
      const s = stateRef.current
      const { O, X } = s.scores
      const oName = s.settings.gameMode === 'AvA' ? 'AI O' : (s.settings.playerNames.O || '플레이어')
      const xName = s.settings.gameMode === 'PvP' ? (s.settings.playerNames.X || '플레이어 2') : 'AI X'
      const text = O > X ? `${oName} 승리!` : X > O ? `${xName} 승리!` : '무승부!'
      speak(text)
    }, 300)
    return () => clearTimeout(id)
  }, [state.screen, speak])

  const handleResetStats = useCallback(async () => {
    dispatch({ type: 'RESET_STATS' })
    try {
      const empty = { totalGames: 0, wins: 0, losses: 0, draws: 0 }
      await Promise.all([
        window.electron.configSet('scoregomoku.stats', empty),
        window.electron.configSet('scoregomoku.season', { id: 'S1', previous: null }),
        window.electron.configSet('scoregomoku.ratings', { O: INITIAL_RATING, X: AI_RATING }),
        window.electron.configSet('scoregomoku.ratingHistory', [{ season: 'S1', rating: INITIAL_RATING }]),
        window.electron.configSet('scoregomoku.leaderboard', []),
      ])
    } catch { /* ignore */ }
  }, [])

  const handleCellClick = useCallback((row: number, col: number) => {
    const s = stateRef.current
    if (s.screen !== 'game' || s.isGameOver || s.isAIThinking || s.replayIndex !== null) return
    const size = s.board.length
    if (row < 0 || row >= size || col < 0 || col >= size) return
    if (s.board[row][col] !== null) return
    if (s.settings.gameMode === 'PvE' && s.turn === AI_PLAYER) return
    if (s.settings.gameMode === 'AvA') return

    const newBoard = s.board.map(r => [...r]) as Board
    newBoard[row][col] = s.turn
    dispatch({ type: 'MAKE_MOVE', payload: { row, col, player: s.turn } })
    if (isFull(newBoard)) {
      const scores = calculateBothScores(newBoard, s.settings.boardSize, s.settings.firstPlayer, s.settings.gameMode)
      endGame(scores, '보드가 꽉 찼습니다. 최종 점수를 계산합니다.')
    }
  }, [endGame])

  const isReplaying = state.replayIndex !== null

  return (
    <div className="h-full flex flex-col overflow-hidden px-3 py-2">
      {/* 설정 화면: 스크롤 가능, 중앙 정렬 */}
      {state.screen === 'setup' && (
        <div className="flex-1 overflow-y-auto flex items-start justify-center pt-4 pb-4">
          <SetupScreen onStart={s => dispatch({ type: 'START_GAME', payload: s })} last={state.settings} />
        </div>
      )}

      {/* 게임·결과 화면: 사이드패널 포함 2열 고정 레이아웃 */}
      {state.screen !== 'setup' && (
        <div className="flex-1 min-h-0 grid gap-3 grid-cols-[1fr_220px]">
          {/* 왼쪽: 게임 내용 */}
          <div className="min-h-0 overflow-y-auto">
            {state.screen === 'game' && (
              <>
                <ScoreDisplay
                  scores={state.scores} turn={state.turn} playerNames={state.settings.playerNames}
                  isAIThinking={state.isAIThinking} timer={state.timer}
                  gameMode={state.settings.gameMode} firstPlayer={state.settings.firstPlayer}
                  boardSize={state.settings.boardSize}
                />
                {isReplaying && (
                  <div className="text-center text-amber-300 text-sm mb-2 animate-pulse">
                    리플레이 중... ({Math.min((state.replayIndex ?? 0), state.history.length)}/{state.history.length})
                  </div>
                )}
                <div className="max-w-[450px] mx-auto">
                  <BoardGrid board={state.board} lastMove={state.lastMove} onClick={handleCellClick} />
                </div>
                <ScoringGuide boardSize={state.settings.boardSize} gameMode={state.settings.gameMode} />
                <div className="flex gap-2 mt-3">
                  <button onClick={() => dispatch({ type: 'START_GAME', payload: state.settings })}
                    className="flex-1 py-2 bg-surface-700 hover:bg-surface-600 text-slate-300 text-sm rounded-xl transition-all">
                    재시작
                  </button>
                  <button onClick={() => dispatch({ type: 'GO_SETUP' })}
                    className="flex-1 py-2 bg-surface-700 hover:bg-surface-600 text-slate-300 text-sm rounded-xl flex items-center justify-center gap-1 transition-all">
                    <ChevronLeft className="w-4 h-4" />설정으로
                  </button>
                </div>
              </>
            )}

            {state.screen === 'result' && (
              <>
                <ResultScreen
                  scores={state.scores} settings={state.settings} winReason={state.winReason}
                  historyLength={state.history.length} isReplaying={isReplaying}
                  onReplay={() => dispatch({ type: 'START_REPLAY' })}
                  onStopReplay={() => dispatch({ type: 'STOP_REPLAY' })}
                  onNewGame={() => dispatch({ type: 'START_GAME', payload: state.settings })}
                  onSetup={() => dispatch({ type: 'GO_SETUP' })}
                />
                {isReplaying && (
                  <div className="mt-4 max-w-[450px] mx-auto">
                    <BoardGrid board={state.board} lastMove={null} onClick={() => {}} />
                  </div>
                )}
              </>
            )}
          </div>

          {/* 오른쪽: 사이드패널 */}
          <SidePanel
            stats={state.stats} season={state.season} ratings={state.ratings}
            ratingHistory={state.ratingHistory} leaderboard={state.leaderboard}
            boardSize={state.settings.boardSize}
            onEndSeason={() => dispatch({ type: 'END_SEASON' })}
            onResetStats={handleResetStats}
          />
        </div>
      )}
    </div>
  )
}
