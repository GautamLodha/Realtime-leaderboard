import { useEffect, useMemo, useState } from 'react'
import type { Socket } from 'socket.io-client'

type Question = { id: number; text: string; options: string[]; position: number }
type Answer = { questionId: number; score: number; isCorrect: boolean }
type BoardEntry = { rank: number; score: number; timeTaken?: number; user?: { name: string } }

export type PlayerRoomData = {
  quiz: { title: string; roomId?: string; startTime: string | null; duration: number; status: string }
  questions: Question[]
  answers?: Answer[]
  leaderboard?: BoardEntry[]
  myScore?: number
}

export default function PlayerRoomView({ room, socket, onLeave }: { room: PlayerRoomData; socket: Socket | null; onLeave: () => void }) {
  const [status, setStatus] = useState(room.quiz.status)
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState('')
  const [feedback, setFeedback] = useState('')
  const [answered, setAnswered] = useState<Set<number>>(() => new Set(room.answers?.map(answer => answer.questionId) ?? []))
  const [score, setScore] = useState(room.myScore ?? 0)
  const [leaderboard, setLeaderboard] = useState<BoardEntry[]>(room.leaderboard ?? [])
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [search, setSearch] = useState('')
  const [startedAt, setStartedAt] = useState(Date.now())
  const question = room.questions[index]
  const completed = useMemo(() => answered.size, [answered])

  useEffect(() => {
    if (!socket) return
    const onResult = (result: { questionId: number; isCorrect: boolean; score: number; totalScore: number }) => {
      setAnswered(current => new Set(current).add(result.questionId))
      setScore(result.totalScore)
      setFeedback(result.isCorrect ? `Correct! +${result.score} points` : 'Not quite — keep going.')
    }
    const onBoard = (entries: BoardEntry[]) => setLeaderboard(entries)
    const onStart = () => { setStartedAt(Date.now()); setStatus('active') }
    const onEnd = (payload: { leaderboard?: BoardEntry[] }) => { setStatus('ended'); if (payload.leaderboard) setLeaderboard(payload.leaderboard) }
    socket.on('answer_result', onResult)
    socket.on('leaderboard_update', onBoard)
    socket.on('quiz_start', onStart)
    socket.on('quiz_end', onEnd)
    return () => { socket.off('answer_result', onResult); socket.off('leaderboard_update', onBoard); socket.off('quiz_start', onStart); socket.off('quiz_end', onEnd) }
  }, [socket])

  // Re-sync room state around the scheduled start time in case a start event was missed.
  useEffect(() => {
    if (!socket || status === 'active' || status === 'ended' || !room.quiz.startTime || !room.quiz.roomId) return
    const scheduledAt = new Date(room.quiz.startTime).getTime()
    const interval = window.setInterval(() => {
      if (Date.now() >= scheduledAt) socket.emit('join_room', { roomId: room.quiz.roomId })
    }, 2000)
    return () => window.clearInterval(interval)
  }, [room.quiz.roomId, room.quiz.startTime, socket, status])

  useEffect(() => {
    setStatus(room.quiz.status)
    if (room.quiz.status === 'active') setStartedAt(Date.now())
  }, [room.quiz.status])

  const selectQuestion = (next: number) => { setIndex(next); setSelected(''); setFeedback(''); setStartedAt(Date.now()) }
  const submit = () => {
    if (!question || !selected || status !== 'active') return
    socket?.emit('submit_answer', { questionId: question.id, answer: selected, timeTaken: Math.round((Date.now() - startedAt) / 1000) })
  }
  const name = (entry: BoardEntry) => entry.user?.name ?? 'Participant'
  const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  const filteredLeaderboard = leaderboard.filter(entry => name(entry).toLowerCase().includes(search.trim().toLowerCase()))

  if (status === 'ended' || showResults) return <main className="player-shell"><header><div className="brand">Q<span>•</span>pulse</div></header><section className="results-card"><span className="eyebrow">{status === 'ended' ? 'QUIZ COMPLETE' : 'YOUR CURRENT STANDING'}</span><h1>{room.quiz.title}</h1><div className="score-orb"><small>YOUR SCORE</small><strong>{score}</strong><span>correct answers</span></div><h2>{status === 'ended' ? 'Final leaderboard' : 'Live leaderboard'}</h2><p className="ranking-note">Ranked by correct answers, then fastest total answer time.</p><input className="leaderboard-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search a participant" /><div className="standings">{filteredLeaderboard.length ? filteredLeaderboard.map(entry => <div key={`${entry.rank}-${name(entry)}`}><b>#{entry.rank}</b><span>{name(entry)}</span><em>{formatTime(entry.timeTaken ?? 0)}</em><strong>{entry.score}</strong></div>) : <p>{leaderboard.length ? 'No participant matches that search.' : 'Standings are being calculated.'}</p>}</div><button className="primary" onClick={onLeave}>Back to home →</button></section></main>

  if (status !== 'active') return <main className="player-shell"><header><div className="brand">Q<span>•</span>pulse</div><button className="text-button" onClick={onLeave}>Leave room</button></header><section className="waiting-screen"><span className="eyebrow">YOU’RE IN THE ROOM</span><div className="waiting-pulse">⌁</div><h1>{room.quiz.title}</h1><h2>Quiz hasn’t started yet.</h2><p>The questions will appear here automatically as soon as the host starts the quiz.</p><div className="start-time">Starts {room.quiz.startTime ? new Date(room.quiz.startTime).toLocaleString() : 'soon'}</div></section></main>

  return <main className="player-shell"><header><div className="brand">Q<span>•</span>pulse</div><div className="room-actions"><button className="secondary" onClick={() => setShowLeaderboard(!showLeaderboard)}>🏆 Live leaderboard</button><button className="text-button" onClick={onLeave}>Leave room</button></div></header><section className="player-card"><div className="player-top"><div><span className="eyebrow">LIVE QUIZ</span><h1>{room.quiz.title}</h1></div><span className={`status ${status}`}>{status}</span></div>{showLeaderboard && <div className="live-board"><h3>Live leaderboard</h3>{leaderboard.length ? leaderboard.map(entry => <div key={`${entry.rank}-${name(entry)}`}><span>#{entry.rank} {name(entry)}</span><b>{entry.score} correct · {formatTime(entry.timeTaken ?? 0)}</b></div>) : <p>No scores yet. Be the first on the board.</p>}</div>}<div className="question-nav">{room.questions.map((item, itemIndex) => <button key={item.id} className={`${itemIndex === index ? 'current' : ''} ${answered.has(item.id) ? 'answered' : ''}`} onClick={() => selectQuestion(itemIndex)}>Q{itemIndex + 1}{answered.has(item.id) && ' ✓'}</button>)}</div>{question && <><div className="progress"><span>{completed} of {room.questions.length} answered · Question {index + 1}</span></div><h2>{question.text}</h2><div className="player-options">{question.options.map(option => <button key={option} className={selected === option ? 'selected' : ''} onClick={() => setSelected(option)} disabled={answered.has(question.id)}>{option}</button>)}</div>{feedback ? <div className="answer-result"><span>{feedback}</span><button className="primary" onClick={() => index === room.questions.length - 1 ? setShowResults(true) : selectQuestion(index + 1)}>{index === room.questions.length - 1 ? 'Finish quiz →' : 'Next question →'}</button></div> : answered.has(question.id) ? <div className="answer-result"><span>You already answered this question.</span>{index === room.questions.length - 1 && <button className="primary" onClick={() => setShowResults(true)}>Finish quiz →</button>}</div> : <button className="primary" onClick={submit} disabled={!selected}>Lock in answer →</button>}</>}</section></main>
}
