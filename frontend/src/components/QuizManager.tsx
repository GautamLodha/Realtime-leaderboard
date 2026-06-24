import { useEffect, useState } from 'react'
import { toLocalDateTimeInput } from '../utils/dateTime'
import { BACKEND_URL } from '../config'

type Quiz = { id: number; title: string; roomId: string; duration: number; status: string; startTime: string | null }
type Question = { text: string; options: string[]; answer: string }
const blankQuestion = (): Question => ({ text: '', options: ['', '', '', ''], answer: '' })

export default function QuizManager({ quiz, token, initialSchedule, onClose, onChanged }: { quiz: Quiz; token: string; initialSchedule?: string; onClose: () => void; onChanged: () => void }) {
  const [roomId, setRoomId] = useState(quiz.roomId)
  const [schedule, setSchedule] = useState(quiz.startTime ? toLocalDateTimeInput(quiz.startTime) : initialSchedule ?? '')
  const [questions, setQuestions] = useState<Question[]>([blankQuestion()])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const endTime = schedule ? new Date(new Date(schedule).getTime() + quiz.duration * 60_000) : null
  const api = async (path: string, options: RequestInit = {}) => {
    const response = await fetch(`${BACKEND_URL}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers } })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'Request failed')
    return data
  }
  useEffect(() => {
    const loadQuestions = async () => {
      try {
        const data = await api(`/quiz/${quiz.id}`)
        const saved = data.quiz.questions as Array<{ text: string; options: string[]; answer: string }>
        if (saved.length) setQuestions(saved.map(question => ({ text: question.text, options: Array.isArray(question.options) ? question.options : ['', '', '', ''], answer: question.answer })))
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not load saved questions.')
      }
    }
    void loadQuestions()
  }, [quiz.id])
  const regenerateCode = async () => {
    setBusy(true); setMessage('')
    try { const data = await api(`/quiz/${quiz.id}/room-code`, { method: 'POST' }); setRoomId(data.quiz.roomId); setMessage('New room code created. Share only this code with participants.'); onChanged() }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not create a new room code.') }
    finally { setBusy(false) }
  }
  const saveAndSchedule = async () => {
    const valid = questions.every(question => question.text.trim() && question.options.every(Boolean) && question.answer)
    if (!valid) return setMessage('Complete every question and select its correct answer.')
    setBusy(true); setMessage('')
    try {
      await api(`/quiz/${quiz.id}/questions`, { method: 'PUT', body: JSON.stringify({ questions: questions.map((question, index) => ({ ...question, position: index + 1 })) }) })
      if (schedule && quiz.status === 'draft') await api(`/quiz/${quiz.id}/schedule`, { method: 'POST', body: JSON.stringify({ startTime: new Date(schedule).toISOString() }) })
      setMessage(quiz.status === 'scheduled' ? 'Questions updated. The existing quiz schedule is unchanged.' : schedule ? 'Questions saved and quiz scheduled.' : 'Questions saved. Select a start time to schedule it.')
      onChanged()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save this quiz.') }
    finally { setBusy(false) }
  }
  const deleteQuiz = async () => {
    if (!window.confirm(`Delete “${quiz.title}”? This cannot be undone.`)) return
    setBusy(true)
    try { await api(`/quiz/${quiz.id}`, { method: 'DELETE' }); onChanged(); onClose() }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not delete this quiz.') }
    finally { setBusy(false) }
  }
  const updateOption = (questionIndex: number, optionIndex: number, value: string) => setQuestions(current => current.map((question, index) => index === questionIndex ? { ...question, options: question.options.map((option, optionPosition) => optionPosition === optionIndex ? value : option), answer: question.answer === question.options[optionIndex] ? value : question.answer } : question))

  return <main className="manager-shell"><header><div className="brand">Q<span>•</span>pulse</div><button className="text-button" onClick={onClose}>← Back to dashboard</button></header><section className="manager"><div className="manager-heading"><div><span className="eyebrow">QUIZ MANAGER</span><h1>{quiz.title}</h1><p>{quiz.duration} minutes · <span className={`status ${quiz.status}`}>{quiz.status}</span></p></div><button className="danger-button" disabled={busy} onClick={deleteQuiz}>Delete quiz</button></div>{message && <div className="alert">{message}</div>}<section className="code-panel"><div><span className="eyebrow">PARTICIPANT ROOM CODE</span><code>{roomId}</code><p>Generate a new code if you need to replace an old invite.</p></div><button className="secondary" disabled={busy || quiz.status === 'active' || quiz.status === 'ended'} onClick={regenerateCode}>↻ New room code</button></section><section className="builder"><h2>Questions</h2>{questions.map((question, questionIndex) => <article className="question" key={questionIndex}><div className="question-head"><b>Question {questionIndex + 1}</b>{questions.length > 1 && <button className="text-button" onClick={() => setQuestions(current => current.filter((_, index) => index !== questionIndex))}>Remove</button>}</div><input value={question.text} onChange={event => setQuestions(current => current.map((item, index) => index === questionIndex ? { ...item, text: event.target.value } : item))} placeholder="Ask something interesting…" />{question.options.map((option, optionIndex) => <label className="option" key={optionIndex}><input type="radio" name={`answer-${questionIndex}`} checked={question.answer === option && !!option} onChange={() => setQuestions(current => current.map((item, index) => index === questionIndex ? { ...item, answer: option } : item))} /><input value={option} onChange={event => updateOption(questionIndex, optionIndex, event.target.value)} placeholder={`Option ${String.fromCharCode(65 + optionIndex)}`} /></label>)}</article>)}<button className="secondary" onClick={() => setQuestions(current => [...current, blankQuestion()])}>+ Add question</button></section><section className="schedule-panel"><div><h2>Schedule quiz</h2><p>Participants remain on a waiting screen until this time.{endTime && <><br />Ends {endTime.toLocaleString()} ({quiz.duration} minutes).</>}</p></div><input type="datetime-local" value={schedule} onChange={event => setSchedule(event.target.value)} /><button className="primary" disabled={busy} onClick={saveAndSchedule}>{busy ? 'Saving…' : schedule ? 'Save & schedule →' : 'Save questions'}</button></section></section></main>
}
