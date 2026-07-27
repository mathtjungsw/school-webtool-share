import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'
import { BoardState, Player, Position, GameMode, AIDifficulty, GameSettings } from './quixo/types'
import { createInitialBoard, isValidSelection, getValidPushDestinations, performMove, checkWinner, BOARD_SIZE } from './quixo/gameLogic'
import { findBestMove } from './quixo/aiLogic'
import { BookOpen } from 'lucide-react'
import GameGuideModal, { GuideStep, GuideCard, type GuideTab } from '../components/GameGuideModal'

type Screen = 'setup' | 'game'

// ── Quixo 완벽 가이드 ──────────────────────────────────────────────
const QUIXO_GUIDE: GuideTab[] = [
  {
    id: 'rules', label: '규칙',
    content: (
      <>
        <GuideStep n={1}>5×5 보드에서 <strong>X 또는 O</strong> 기호로 대결합니다.</GuideStep>
        <GuideStep n={2}>가로·세로·대각선으로 <strong>같은 기호 5개</strong>를 한 줄로 만들면 승리!</GuideStep>
        <GuideStep n={3}>움직일 수 있는 것은 보드 <strong>가장자리(테두리)</strong>의 큐브뿐입니다.</GuideStep>
      </>
    ),
  },
  {
    id: 'move', label: '조작',
    content: (
      <>
        <GuideStep n={1}>가장자리 큐브 중 <strong>빈 칸이거나 내 기호</strong>인 것을 하나 집습니다. (상대 기호는 집을 수 없음)</GuideStep>
        <GuideStep n={2}>집은 큐브는 <strong>내 기호</strong>로 바뀝니다.</GuideStep>
        <GuideStep n={3}>그 큐브를 같은 행/열의 <strong>반대쪽 끝</strong>으로 밀어 넣습니다. 사이의 큐브들이 한 칸씩 밀려납니다.</GuideStep>
        <GuideCard title="⚠️ 제자리 금지" color="amber">집어낸 위치 그대로 다시 밀어 넣을 수는 없습니다. 반드시 보드가 한 칸 이상 움직여야 합니다.</GuideCard>
      </>
    ),
  },
  {
    id: 'strategy', label: '전략',
    content: (
      <>
        <GuideCard title="💡 양날의 검" color="rose">큐브를 밀면 <strong>상대의 줄도 함께 움직입니다.</strong> 내 줄을 만들려다 상대 줄을 완성시키지 않도록 주의하세요.</GuideCard>
        <ul className="list-disc space-y-1.5 pl-5 text-xs text-slate-400">
          <li>한 수로 <strong className="text-slate-200">여러 줄</strong>을 동시에 노리면 상대가 막기 어렵습니다.</li>
          <li>상대가 4개를 모았다면 그 줄을 밀어 <strong className="text-slate-200">흐트러뜨리세요.</strong></li>
          <li>가장자리를 장악하면 보드 통제력이 올라갑니다.</li>
        </ul>
      </>
    ),
  },
]

export default function QuixoPage() {
  const [screen, setScreen] = useState<Screen>('setup')
  const [settings, setSettings] = useState<GameSettings | null>(null)
  const [board, setBoard] = useState<BoardState>(createInitialBoard())
  const [turn, setTurn] = useState(0)
  const [selected, setSelected] = useState<Position | null>(null)
  const [result, setResult] = useState<{ winner: Player; winningLine: Position[] } | null>(null)
  const [aiThinking, setAiThinking] = useState(false)
  const [lastMove, setLastMove] = useState<{ source: Position; destination: Position } | null>(null)

  const currentPlayer: Player.X | Player.O = useMemo(() => {
    if (!settings) return Player.X
    return (turn % 2 === 0) ? settings.startingPlayer : (settings.startingPlayer === Player.X ? Player.O : Player.X)
  }, [settings, turn])

  const isAITurn = useMemo(() => {
    if (!settings || result) return false
    if (settings.mode === GameMode.PvAI) return currentPlayer !== settings.humanPlayerSymbol
    return false
  }, [settings, currentPlayer, result])

  const handleStart = (s: GameSettings) => {
    setSettings(s)
    setBoard(createInitialBoard())
    setTurn(0)
    setSelected(null)
    setResult(null)
    setAiThinking(false)
    setLastMove(null)
    setScreen('game')
  }

  const handleRestart = () => {
    if (!settings) return
    handleStart(settings)
  }

  const doMove = useCallback((source: Position, dest: Position, player: Player) => {
    setLastMove({ source, destination: dest })
    const newBoard = performMove(board, source, dest, player)
    setBoard(newBoard)
    setSelected(null)
    const gameResult = checkWinner(newBoard)
    if (gameResult) {
      setResult(gameResult)
    } else {
      setTurn(t => t + 1)
    }
  }, [board])

  // AI 이동
  useEffect(() => {
    if (!isAITurn || !settings || result) return
    setAiThinking(true)
    const timer = setTimeout(() => {
      const { source, destination } = findBestMove(board, currentPlayer, settings.difficulty)
      doMove(source, destination, currentPlayer)
      setAiThinking(false)
    }, 800)
    return () => clearTimeout(timer)
  }, [isAITurn, board, currentPlayer, settings, result, doMove])

  // ESC 선택 취소
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const validDests = useMemo(() => {
    if (!selected) return []
    return getValidPushDestinations(selected)
  }, [selected])

  const handleCubeClick = (pos: Position) => {
    if (result || isAITurn || aiThinking) return
    if (selected && validDests.some(d => d.row === pos.row && d.col === pos.col)) {
      doMove(selected, pos, currentPlayer)
      return
    }
    if (selected && selected.row === pos.row && selected.col === pos.col) {
      setSelected(null)
      return
    }
    if (isValidSelection(board, pos, currentPlayer)) {
      setSelected(pos)
    }
  }

  const winningSet = useMemo(() => {
    if (!result) return new Set<string>()
    return new Set(result.winningLine.map(p => `${p.row},${p.col}`))
  }, [result])

  if (screen === 'setup') return <SetupScreen onStart={handleStart} />

  const playerColor = (p: Player) => p === Player.X ? 'text-rose-400' : p === Player.O ? 'text-sky-400' : 'text-slate-500'
  const playerBg   = (p: Player) => p === Player.X ? 'bg-rose-500/20 border-rose-500/40' : p === Player.O ? 'bg-sky-500/20 border-sky-500/40' : 'bg-surface-700 border-white/10'

  return (
    <div className="p-4 max-w-2xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-white font-bold text-lg">Quixo</h2>
          <p className="text-slate-500 text-xs">같은 모양 5개를 한 줄로 — 가장자리 큐브를 밀어넣으세요</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleRestart} className="btn-ghost text-xs px-3 py-1.5">재시작</button>
          <button onClick={() => setScreen('setup')} className="btn-ghost text-xs px-3 py-1.5">홈</button>
        </div>
      </div>

      {/* 턴 표시 */}
      <div className={clsx(
        'flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl mb-4 border text-sm font-medium',
        result ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' :
        aiThinking ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300' :
        'bg-surface-800 border-white/10 text-white'
      )}>
        {result ? (
          <span>{result.winner === Player.X ? '🔴 X' : '🔵 O'} 승리!</span>
        ) : aiThinking ? (
          <span className="animate-pulse">AI 생각 중…</span>
        ) : (
          <>
            <span className="text-slate-400">현재 차례</span>
            <span className={clsx('font-bold', playerColor(currentPlayer))}>{currentPlayer}</span>
            {selected ? <span className="text-slate-500 text-xs">— 밀어넣을 위치를 선택하세요 (ESC: 취소)</span>
              : <span className="text-slate-500 text-xs">— 가장자리 큐브를 선택하세요</span>}
          </>
        )}
      </div>

      {/* 보드 */}
      <div className="relative mx-auto" style={{ maxWidth: '380px' }}>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))` }}>
          {board.map((row, r) =>
            row.map((cube, c) => {
              const pos = { row: r, col: c }
              const key = `${r},${c}`
              const isEdge = r === 0 || r === BOARD_SIZE - 1 || c === 0 || c === BOARD_SIZE - 1
              const isSel = selected?.row === r && selected?.col === c
              const isDest = validDests.some(d => d.row === r && d.col === c)
              const isLast = lastMove && (
                (lastMove.source.row === r && lastMove.source.col === c) ||
                (lastMove.destination.row === r && lastMove.destination.col === c)
              )
              const isWin = winningSet.has(key)
              const canSelect = isEdge && isValidSelection(board, pos, currentPlayer) && !result && !isAITurn && !aiThinking
              return (
                <button
                  key={key}
                  onClick={() => handleCubeClick(pos)}
                  disabled={!isEdge || (!isDest && !canSelect) || !!result || aiThinking}
                  className={clsx(
                    'aspect-square rounded-xl flex items-center justify-center text-xl font-black border-2 transition-all duration-150',
                    isWin ? (cube.player === Player.X ? 'bg-rose-500/40 border-rose-400 scale-105' : 'bg-sky-500/40 border-sky-400 scale-105') :
                    isSel ? 'bg-violet-500/30 border-violet-400 scale-105 ring-2 ring-violet-400/30' :
                    isDest ? 'bg-emerald-500/15 border-emerald-400/60 animate-pulse cursor-pointer' :
                    isLast ? 'border-white/25' :
                    playerBg(cube.player),
                    !isEdge && 'cursor-default',
                    canSelect && !isSel ? 'hover:border-white/40 hover:scale-102 cursor-pointer' : '',
                  )}
                >
                  {cube.player === Player.X && <span className={playerColor(Player.X)}>X</span>}
                  {cube.player === Player.O && <span className={playerColor(Player.O)}>O</span>}
                  {cube.player === Player.None && isDest && (
                    <span className="text-emerald-400 text-sm">↩</span>
                  )}
                </button>
              )
            })
          )}
        </div>

        {/* AI 오버레이 */}
        {aiThinking && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-2xl">
            <span className="text-yellow-400 text-sm font-medium animate-pulse">AI 생각 중…</span>
          </div>
        )}
      </div>

      <p className="text-slate-600 text-xs text-center mt-3">가장자리(비어있거나 내 말) 선택 → 반대쪽 끝으로 밀어넣기</p>

      {/* 게임 종료 모달 */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className="card p-8 text-center max-w-sm w-full mx-4"
            >
              <div className="text-5xl mb-3">{result.winner === Player.X ? '🔴' : '🔵'}</div>
              <h3 className="text-xl font-bold text-white mb-2">{result.winner} 승리!</h3>
              <p className="text-slate-400 text-sm mb-6">5개의 {result.winner}를 한 줄로 만들었습니다</p>
              <div className="flex gap-3 justify-center">
                <button onClick={handleRestart} className="btn-primary">다시하기</button>
                <button onClick={() => setScreen('setup')} className="btn-ghost">홈으로</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── 설정 화면 ──────────────────────────────────────────────────────
function SetupScreen({ onStart }: { onStart: (s: GameSettings) => void }) {
  const [mode, setMode] = useState<GameMode>(GameMode.PvAI)
  const [humanSymbol, setHumanSymbol] = useState<Player.X | Player.O>(Player.X)
  const [difficulty, setDifficulty] = useState<AIDifficulty>(AIDifficulty.Intermediate)
  const [starting, setStarting] = useState<Player.X | Player.O>(Player.X)
  const [showGuide, setShowGuide] = useState(false)

  const start = () => onStart({ mode, humanPlayerSymbol: humanSymbol, difficulty, startingPlayer: starting })

  return (
    <div className="p-6 max-w-md mx-auto">
      <div className="text-center mb-8">
        <div className="text-5xl mb-3">⬜</div>
        <h1 className="text-2xl font-black text-white">Quixo</h1>
        <p className="text-slate-400 text-sm mt-2">5×5 보드에서 같은 기호 5개를 한 줄로</p>
      </div>

      <div className="space-y-5">
        <div>
          <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2 block">게임 모드</label>
          <div className="flex gap-2">
            {[{ v: GameMode.PvP, label: '👥 2인' }, { v: GameMode.PvAI, label: '🤖 AI와' }].map(({ v, label }) => (
              <button
                key={v}
                onClick={() => setMode(v)}
                className={clsx('flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all',
                  mode === v ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'bg-surface-800 border-white/5 text-slate-400 hover:border-white/20'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {mode === GameMode.PvAI && (
          <>
            <div>
              <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2 block">내 기호</label>
              <div className="flex gap-2">
                {([Player.X, Player.O] as (Player.X | Player.O)[]).map(p => (
                  <button
                    key={p}
                    onClick={() => setHumanSymbol(p)}
                    className={clsx('flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all',
                      humanSymbol === p ? (p === Player.X ? 'bg-rose-500/20 border-rose-500/50 text-rose-300' : 'bg-sky-500/20 border-sky-500/50 text-sky-300') : 'bg-surface-800 border-white/5 text-slate-400 hover:border-white/20'
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2 block">AI 난이도</label>
              <div className="flex gap-2">
                {[
                  { v: AIDifficulty.Beginner, label: '쉬움' },
                  { v: AIDifficulty.Intermediate, label: '보통' },
                  { v: AIDifficulty.Advanced, label: '어려움' },
                ].map(({ v, label }) => (
                  <button
                    key={v}
                    onClick={() => setDifficulty(v)}
                    className={clsx('flex-1 py-2 rounded-xl text-xs font-medium border transition-all',
                      difficulty === v ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'bg-surface-800 border-white/5 text-slate-400 hover:border-white/20'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <div>
          <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2 block">선공</label>
          <div className="flex gap-2">
            {([Player.X, Player.O] as (Player.X | Player.O)[]).map(p => (
              <button
                key={p}
                onClick={() => setStarting(p)}
                className={clsx('flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all',
                  starting === p ? (p === Player.X ? 'bg-rose-500/20 border-rose-500/50 text-rose-300' : 'bg-sky-500/20 border-sky-500/50 text-sky-300') : 'bg-surface-800 border-white/5 text-slate-400 hover:border-white/20'
                )}
              >
                {p} 선공
              </button>
            ))}
          </div>
        </div>

        <button onClick={start} className="w-full btn-primary py-3 text-base font-bold mt-2">
          게임 시작
        </button>
        <button
          onClick={() => setShowGuide(true)}
          className="w-full btn-ghost py-2.5 text-sm flex items-center justify-center gap-1.5 text-slate-400"
        >
          <BookOpen size={14} /> 게임 방법
        </button>
      </div>

      <GameGuideModal open={showGuide} onClose={() => setShowGuide(false)} title="📖 Quixo 완벽 가이드" tabs={QUIXO_GUIDE} />
    </div>
  )
}
