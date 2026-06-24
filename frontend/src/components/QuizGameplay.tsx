import { useState } from 'react';
import type { Question } from '../types/quiz';

interface QuizGameplayProps {
  questions: Question[];
  sessionId: number;
  token: string;
}

export default function QuizGameplay({ questions, sessionId, token }: QuizGameplayProps) {
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  if (questions.length === 0) {
    return <div className="text-center font-mono text-slate-400 p-12">Parsing contest matrix stream...</div>;
  }

  const currentQuestion = questions[currentIndex];
  const options = [
    { key: 'A', text: currentQuestion.optionA },
    { key: 'B', text: currentQuestion.optionB },
    { key: 'C', text: currentQuestion.optionC },
    { key: 'D', text: currentQuestion.optionD },
  ];

  const handleNextSubmit = async () => {
    if (!selectedOption) return;
    setSubmitting(true);

    try {
      await fetch(`http://localhost:5000/api/quizzes/${sessionId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          questionId: currentQuestion.id,
          selectedOption: selectedOption,
        }),
      });

      setSelectedOption(null);
      if (currentIndex < questions.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        alert('Arena submission finalized! Awaiting official terminal evaluation.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center border-b border-slate-700 pb-4 mb-6">
        <span className="bg-blue-500/10 text-blue-400 px-3 py-1 rounded-md text-xs font-mono font-bold">
          CONTEST DATA BLOCK: {currentIndex + 1} / {questions.length}
        </span>
      </div>

      <h3 className="text-xl font-medium mb-6 leading-relaxed">{currentQuestion.questionText}</h3>

      <div className="space-y-3 mb-8">
        {options.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setSelectedOption(opt.key)}
            className={`w-full text-left p-4 rounded-xl border transition-all flex items-center gap-4 ${
              selectedOption === opt.key
                ? 'bg-blue-600/20 border-blue-500 text-white font-semibold'
                : 'bg-slate-700/40 border-slate-700 hover:bg-slate-700 hover:border-slate-600 text-slate-300'
            }`}
          >
            <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${
              selectedOption === opt.key ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400'
            }`}>
              {opt.key}
            </span>
            {opt.text}
          </button>
        ))}
      </div>

      <button
        onClick={handleNextSubmit}
        disabled={!selectedOption || submitting}
        className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 font-bold rounded-xl transition-all float-right"
      >
        {submitting ? 'Processing...' : currentIndex === questions.length - 1 ? 'Terminate & Evaluate' : 'Commit & Step Next'}
      </button>
    </div>
  );
}
