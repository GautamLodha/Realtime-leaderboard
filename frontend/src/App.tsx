import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { io, type Socket } from 'socket.io-client'
import PlayerRoomView, { type PlayerRoomData } from './components/PlayerRoomView'
import QuizManager from './components/QuizManager'
import { BACKEND_URL } from './config'
import './App.css'

const API_URL = BACKEND_URL

type Quiz = {
  id: number; title: string; roomId: string; duration: number; status: string; startTime: string | null
  createdAt: string; _count?: { questions: number; participants: number }
}

type DraftQuestion = { text: string; options: string[]; answer: string }
type PlayerRoom = PlayerRoomData
const blankQuestion = (): DraftQuestion => ({ text: '', options: ['', '', '', ''], answer: '' })

async function request(path: string, options: RequestInit = {}, token?: string) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.')
  return data
}

export default function App() {
  // Used only by the inline option editor; radio selection remains the source of truth.
  const o = ''
  const [token, setToken] = useState(() => localStorage.getItem('quiz_token') || '')
  const [name, setName] = useState(() => localStorage.getItem('quiz_name') || '')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [auth, setAuth] = useState({ name: '', email: '', password: '' })
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const createLock = useRef(false)
  const [newQuiz, setNewQuiz] = useState({ title: '', duration: 15, startTime: '' })
  const [selected, setSelected] = useState<Quiz | null>(null)
  const [questions, setQuestions] = useState<DraftQuestion[]>([blankQuestion()])
  const [schedule, setSchedule] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [room, setRoom] = useState<Quiz | null>(null)
  const [playerRoom, setPlayerRoom] = useState<PlayerRoom | null>(null)
  const [playerIndex, setPlayerIndex] = useState(0)
  const [playerAnswer, setPlayerAnswer] = useState('')
  const [playerResult, setPlayerResult] = useState('')
  const questionStartedAt = useRef(Date.now())
  const socketRef = useRef<Socket | null>(null)

  const activeCount = useMemo(() => quizzes.filter(q => q.status === 'scheduled' || q.status === 'active').length, [quizzes])

  const loadQuizzes = async () => {
    if (!token) return
    setLoading(true)
    try { setQuizzes((await request('/quiz/my', {}, token)).quizzes) }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load your quizzes.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void loadQuizzes() }, [token])

  const submitAuth = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    try {
      const payload = mode === 'login' ? { email: auth.email, password: auth.password } : auth
      const result = await request(`/auth/${mode === 'login' ? 'login' : 'register'}`, { method: 'POST', body: JSON.stringify(payload) })
      if (mode === 'register') { setMode('login'); setNotice('Account created. You can sign in now.'); return }
      localStorage.setItem('quiz_token', result.token); localStorage.setItem('quiz_name', result.name)
      setToken(result.token); setName(result.name)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not authenticate.') }
  }
  const createQuiz = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    if (createLock.current) return
    createLock.current = true
    try {
      const { quiz } = await request('/quiz', { method: 'POST', body: JSON.stringify({ title: newQuiz.title, duration: newQuiz.duration, startTime: new Date(newQuiz.startTime).toISOString() }) }, token)
      setQuizzes(items => [quiz, ...items]); setShowCreate(false); setSelected(quiz); setQuestions([blankQuestion()]); setSchedule(newQuiz.startTime); setNewQuiz({ title: '', duration: 15, startTime: '' }); setNotice('Add your questions, then schedule the quiz at your selected time.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create quiz.') }
    finally { createLock.current = false }
  }
  const saveQuestions = async () => {
    if (!selected) return
    const valid = questions.every(q => q.text.trim() && q.options.every(Boolean) && q.answer)
    if (!valid) { setError('Please complete every question, option, and correct answer.'); return }
    try {
      await request(`/quiz/${selected.id}/questions`, { method: 'POST', body: JSON.stringify({ questions: questions.map((q, position) => ({ ...q, position: position + 1 })) }) }, token)
      if (schedule) {
        const response = await request(`/quiz/${selected.id}/schedule`, { method: 'POST', body: JSON.stringify({ startTime: new Date(schedule).toISOString() }) }, token)
        setNotice(`Questions saved and quiz scheduled for ${new Date(response.startTime).toLocaleString()}. Room code: ${response.roomId}`)
        setSelected(null)
      } else {
        setNotice(`${questions.length} question${questions.length > 1 ? 's' : ''} saved.`)
      }
      await loadQuizzes()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save questions.') }
  }
  const scheduleQuiz = async () => {
    if (!selected || !schedule) return
    try {
      const response = await request(`/quiz/${selected.id}/schedule`, { method: 'POST', body: JSON.stringify({ startTime: new Date(schedule).toISOString() }) }, token)
      setNotice(`Quiz scheduled. Room code: ${response.roomId}`); setSelected(null); await loadQuizzes()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not schedule quiz.') }
  }
  const findRoom = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setRoom(null)
    try {
      const foundRoom = (await request(`/quiz/room/${roomCode.trim().toUpperCase()}`, {}, token)).room as Quiz
      setRoom(foundRoom)
      joinRoom(foundRoom.roomId)
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Room not found.') }
  }
  const joinRoom = (roomId: string) => {
    socketRef.current?.disconnect()
    const socket = io(BACKEND_URL, { auth: { token } })
    socketRef.current = socket
    socket.on('connect', () => socket.emit('join_room', { roomId }))
    socket.on('connect_error', (connectionError) => {
      setError(`Unable to connect to the quiz room: ${connectionError.message}`)
      socket.disconnect()
    })
    socket.on('joined', (payload: PlayerRoom) => {
      setPlayerRoom(payload); setPlayerIndex(0); setPlayerAnswer(''); setPlayerResult(''); questionStartedAt.current = Date.now()
    })
    socket.on('answer_result', (result: { isCorrect: boolean; score: number }) => {
      setPlayerResult(result.isCorrect ? `Correct! +${result.score} points` : 'Not quite — keep going.')
    })
    socket.on('quiz_start', () => setPlayerRoom(current => current ? { ...current, quiz: { ...current.quiz, status: 'active' } } : current))
    socket.on('quiz_end', () => setPlayerRoom(current => current ? { ...current, quiz: { ...current.quiz, status: 'ended' } } : current))
    socket.on('error', (payload: { message?: string }) => setError(payload.message || 'Unable to enter this room.'))
  }
  const submitPlayerAnswer = () => {
    if (!playerRoom || !playerAnswer) return
    const question = playerRoom.questions[playerIndex]
    if (playerRoom.quiz.status !== 'active') return
    socketRef.current?.emit('submit_answer', { questionId: question.id, answer: playerAnswer, timeTaken: Math.round((Date.now() - questionStartedAt.current) / 1000) })
  }
  const nextPlayerQuestion = () => {
    if (!playerRoom) return
    if (playerIndex < playerRoom.questions.length - 1) { setPlayerIndex(playerIndex + 1); setPlayerAnswer(''); setPlayerResult(''); questionStartedAt.current = Date.now() }
    else { setPlayerResult('You have completed every question. Great game!') }
  }
  const logout = () => { localStorage.removeItem('quiz_token'); localStorage.removeItem('quiz_name'); setToken(''); setName(''); setQuizzes([]) }

  if (!token) return <main className="auth-shell"><section className="auth-copy"><span className="eyebrow">REAL-TIME QUIZZING</span><h1>Make every answer<br /><i>matter.</i></h1><p>Build a room, bring your people, and turn knowledge into a little healthy competition.</p><div className="orb orb-one" /><div className="orb orb-two" /></section><section className="auth-panel"><div className="brand">Q<span>•</span>pulse</div><h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2><p className="muted">{mode === 'login' ? 'Sign in to manage your quiz rooms.' : 'Your next quiz is a few clicks away.'}</p>{error && <div className="alert error">{error}</div>}{notice && <div className="alert">{notice}</div>}<form onSubmit={submitAuth}>{mode === 'register' && <label>Name<input value={auth.name} onChange={e => setAuth({ ...auth, name: e.target.value })} required placeholder="Your name" /></label>}<label>Email<input type="email" value={auth.email} onChange={e => setAuth({ ...auth, email: e.target.value })} required placeholder="you@example.com" /></label><label>Password<input type="password" value={auth.password} onChange={e => setAuth({ ...auth, password: e.target.value })} required placeholder="••••••••" /></label><button className="primary wide">{mode === 'login' ? 'Sign in' : 'Create account'} <span>→</span></button></form><button className="text-button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>{mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}</button></section></main>

  const activeSelectedQuiz = selected
  if (activeSelectedQuiz) return <QuizManager quiz={activeSelectedQuiz} token={token} initialSchedule={schedule} onClose={() => setSelected(null)} onChanged={() => void loadQuizzes()} />

  const activePlayerRoom = playerRoom
  if (activePlayerRoom) return <PlayerRoomView room={activePlayerRoom} socket={socketRef.current} onLeave={() => { socketRef.current?.disconnect(); setPlayerRoom(null) }} />

  if (playerRoom as PlayerRoom | null) {
    // Legacy view kept temporarily while PlayerRoomView handles the active room experience.
    // @ts-ignore
    const question = playerRoom.questions[playerIndex]
    // @ts-ignore
    return <main className="player-shell"><header><div className="brand">Q<span>•</span>pulse</div><button className="text-button" onClick={() => { socketRef.current?.disconnect(); setPlayerRoom(null) }}>← Leave room</button></header><section className="player-card"><div className="player-top"><div><span className="eyebrow">LIVE QUIZ</span><h1>{playerRoom.quiz.title}</h1></div><span className={`status ${playerRoom.quiz.status}`}>{playerRoom.quiz.status}</span></div>{playerRoom.quiz.status !== 'active' && <div className="waiting-room"><b>{playerRoom.quiz.status === 'ended' ? 'This quiz has ended.' : 'This quiz has not started yet.'}</b><span>{playerRoom.quiz.status === 'ended' ? 'Thanks for playing.' : `Starts ${playerRoom.quiz.startTime ? new Date(playerRoom.quiz.startTime).toLocaleString() : 'soon'}`}</span></div>}{question && <><div className="progress"><span>Question {playerIndex + 1} of {playerRoom.questions.length}</span><i style={{ width: `${((playerIndex + 1) / playerRoom.questions.length) * 100}%` }} /></div><h2>{question.text}</h2><div className="player-options">{question.options.map(option => <button key={option} className={playerAnswer === option ? 'selected' : ''} onClick={() => setPlayerAnswer(option)} disabled={!!playerResult || playerRoom.quiz.status !== 'active'}>{option}</button>)}</div>{playerResult ? <div className="answer-result"><span>{playerResult}</span><button className="primary" onClick={nextPlayerQuestion}>{playerIndex === playerRoom.questions.length - 1 ? 'Finish' : 'Next question →'}</button></div> : <button className="primary" onClick={submitPlayerAnswer} disabled={!playerAnswer || playerRoom.quiz.status !== 'active'}>Lock in answer →</button>}</>}</section></main>
  }

  // @ts-ignore The legacy dashboard editor below is bypassed by QuizManager above.
  return <main className="app-shell"><header><div className="brand">Q<span>•</span>pulse</div><nav><button onClick={() => setSelected(null)}>My quizzes</button><button onClick={() => document.getElementById('join')?.scrollIntoView({ behavior: 'smooth' })}>Join a room</button></nav><div className="profile"><span>{name.slice(0, 1).toUpperCase()}</span><div><b>{name}</b><button className="text-button" onClick={logout}>Sign out</button></div></div></header><section className="dashboard-head"><div><span className="eyebrow">YOUR QUIZ STUDIO</span><h1>Good morning, {name.split(' ')[0]}.</h1><p>Create something people will want to win.</p></div><button className="primary" onClick={() => setShowCreate(true)}>+ Create a quiz</button></section>{(error || notice) && <div className={`alert ${error ? 'error' : ''}`}>{error || notice}<button onClick={() => { setError(''); setNotice('') }}>×</button></div>}<section className="stats"><article><small>YOUR QUIZZES</small><strong>{quizzes.length}</strong><span>Created so far</span></article><article><small>LIVE & SCHEDULED</small><strong>{activeCount}</strong><span>Ready for players</span></article><article><small>QUESTIONS WRITTEN</small><strong>{quizzes.reduce((total, q) => total + (q._count?.questions ?? 0), 0)}</strong><span>Across all rooms</span></article></section><section className="content-grid"><div className="quiz-list"><div className="section-title"><div><h2>Your quizzes</h2><p>Build, prepare, and run your rooms.</p></div></div>{loading ? <div className="empty">Loading your quiz studio…</div> : quizzes.length === 0 ? <div className="empty"><div className="empty-icon">✦</div><h3>Your first quiz starts here</h3><p>Create a room, add questions, and invite your people.</p><button className="primary" onClick={() => setShowCreate(true)}>Create a quiz</button></div> : quizzes.map(quiz => <article className="quiz-card" key={quiz.id}><div className="quiz-mark">{quiz.title.slice(0, 1).toUpperCase()}</div><div className="quiz-info"><div className="quiz-title"><h3>{quiz.title}</h3><span className={`status ${quiz.status}`}>{quiz.status}</span></div><p>{quiz._count?.questions ?? 0} questions · {quiz.duration} min · {quiz._count?.participants ?? 0} participants</p>{quiz.startTime && <small>Starts {new Date(quiz.startTime).toLocaleString()}</small>}</div><button className="secondary" onClick={() => { setSelected(quiz); setQuestions([blankQuestion()]); setSchedule(quiz.startTime ? new Date(quiz.startTime).toISOString().slice(0, 16) : '') }}>Manage →</button></article>)}</div><aside id="join" className="join-card"><span className="eyebrow">PARTICIPANT ACCESS</span><h2>Join a room</h2><p>Have a room code? Check its details before the quiz begins.</p><form onSubmit={findRoom}><input value={roomCode} onChange={e => setRoomCode(e.target.value)} placeholder="QUIZ-ABC123" /><button className="primary wide">Find room</button></form>{room && <div className="room-result"><span className={`status ${room.status}`}>{room.status}</span><h3>{room.title}</h3><p>{room._count?.questions ?? 0} questions · {room.duration} min</p><code>{room.roomId}</code></div>}</aside></section>{showCreate && <div className="modal-backdrop"><form className="modal" onSubmit={createQuiz}><button type="button" className="close" onClick={() => setShowCreate(false)}>×</button><span className="eyebrow">NEW QUIZ</span><h2>Set up your room</h2><label>Quiz title<input autoFocus value={newQuiz.title} onChange={e => setNewQuiz({ ...newQuiz, title: e.target.value })} placeholder="e.g. Friday brain break" required /></label><label>Duration (minutes)<input type="number" min="1" value={newQuiz.duration} onChange={e => setNewQuiz({ ...newQuiz, duration: Number(e.target.value) })} required /></label><label>When should it start?<input type="datetime-local" min={new Date().toISOString().slice(0, 16)} value={newQuiz.startTime} onChange={e => setNewQuiz({ ...newQuiz, startTime: e.target.value })} required /></label><p className="form-note">You’ll add questions next, then the quiz will be scheduled for this time.</p><button className="primary wide">Create quiz →</button></form></div>}{selected && <div className="modal-backdrop"><section className="modal editor"><button className="close" onClick={() => setSelected(null)}>×</button><span className="eyebrow">QUIZ BUILDER</span><h2>{selected.title}</h2><p className="room-code">Room code <b>{selected.roomId}</b></p><div className="questions">{questions.map((question, qi) => <div className="question" key={qi}><div className="question-head"><b>Question {qi + 1}</b>{questions.length > 1 && <button className="text-button" onClick={() => setQuestions(questions.filter((_, i) => i !== qi))}>Remove</button>}</div><input value={question.text} onChange={e => setQuestions(questions.map((q, i) => i === qi ? { ...q, text: e.target.value } : q))} placeholder="Ask something interesting…" />{question.options.map((option, oi) => <label className="option" key={oi}><input type="radio" name={`answer-${qi}`} checked={question.answer === option && !!option} onChange={() => setQuestions(questions.map((q, i) => i === qi ? { ...q, answer: option } : q))} /><input value={option} onChange={e => setQuestions(questions.map((q, i) => i === qi ? { ...q, options: q.options.map((o, x) => x === oi ? e.target.value : o), answer: q.answer === o ? e.target.value : q.answer } : q))} placeholder={`Option ${String.fromCharCode(65 + oi)}`} /></label>)}</div>)}</div><button className="secondary wide" onClick={() => setQuestions([...questions, blankQuestion()])}>+ Add question</button><button className="primary wide" onClick={saveQuestions}>Save questions</button><div className="schedule"><h3>Schedule this quiz</h3><input type="datetime-local" value={schedule} onChange={e => setSchedule(e.target.value)} /><button className="primary" onClick={scheduleQuiz} disabled={!schedule}>Schedule →</button></div></section></div>}</main>
}
