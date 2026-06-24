import { useEffect, useState } from 'react';
import { socket } from '../socket';
import type { QuizRoomProps, QuizStatus, Question } from '../types/quiz';
import QuizGameplay from './QuizGameplay';
import LiveLeaderboard from './LiveLeaderboard';
import { BACKEND_URL } from '../config';

export default function QuizRoom({ sessionId, token, startTime }: QuizRoomProps) {
  const [quizStatus, setQuizStatus] = useState<QuizStatus>('WAITING');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    socket.connect();
    socket.emit('join_quiz', sessionId);

    socket.on('quiz_state_change', (data: { status: QuizStatus }) => {
      setQuizStatus(data.status);
      if (data.status === 'ACTIVE') {
        fetchQuestions();
      }
    });

    const targetTime = new Date(startTime).getTime();
    const timerInterval = setInterval(() => {
      const diff = targetTime - Date.now();
      if (diff <= 0) {
        clearInterval(timerInterval);
        setTimeLeft(0);
      } else {
        setTimeLeft(Math.floor(diff / 1000));
      }
    }, 1000);

    return () => {
      clearInterval(timerInterval);
      socket.off('quiz_state_change');
      socket.disconnect();
    };
  }, [sessionId, startTime]);

  const fetchQuestions = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/quizzes/${sessionId}/questions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data: Question[] = await res.json();
      if (res.ok) setQuestions(data);
    } catch (err) {
      console.error('Failed to pull questions stream:', err);
    }
  };

  if (quizStatus === 'WAITING') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-6">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 shadow-2xl text-center max-w-md w-full">
          <h2 className="text-2xl font-bold mb-2">⚔️ LeetCode Arena</h2>
          <p className="text-slate-400 mb-6">Contest calculation initializing...</p>
          <div className="text-4xl font-mono font-black text-amber-400 tracking-wider">
            {timeLeft > 0 ? `${Math.floor(timeLeft / 60)}m ${timeLeft % 60}s` : 'Starting...'}
          </div>
        </div>
      </div>
    );
  }

  if (quizStatus === 'FINISHED') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-6">
        <h2 className="text-3xl font-black text-rose-500 mb-4">🏁 Contest Concluded!</h2>
        <div className="w-full max-w-2xl bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
          <LiveLeaderboard />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-slate-800 rounded-xl border border-slate-700 p-6 shadow-xl">
        <QuizGameplay questions={questions} sessionId={sessionId} token={token} />
      </div>
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 shadow-xl h-fit">
        <LiveLeaderboard />
      </div>
    </div>
  );
}
