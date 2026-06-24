import { useEffect, useState } from 'react';
import { socket } from '../socket';
import type { LeaderboardEntry } from '../types/quiz';


export default function LiveLeaderboard() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    socket.on('leaderboard_update', (data: LeaderboardEntry[]) => {
      setLeaderboard(data);
    });

    return () => {
      socket.off('leaderboard_update');
    };
  }, []);

  return (
    <div>
      <h3 className="text-lg font-bold text-amber-400 mb-4 flex items-center gap-2">
        🏆 Live Standings
      </h3>

      {leaderboard.length === 0 ? (
        <p className="text-sm font-mono text-slate-500 text-center py-4">Awaiting incoming score metrics...</p>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          {leaderboard.map((player) => (
            <div
              key={player.username}
              className="flex justify-between items-center bg-slate-900/50 border border-slate-800 rounded-lg p-3 hover:border-slate-700 transition-all"
            >
              <div className="flex items-center gap-3">
                <span className={`w-6 text-sm font-bold font-mono text-center ${
                  player.rank === 1 ? 'text-amber-400' : player.rank === 2 ? 'text-slate-300' : 'text-slate-500'
                }`}>
                  #{player.rank}
                </span>
                <span className="text-sm font-medium tracking-wide text-slate-200">{player.username}</span>
              </div>
              <span className="text-sm font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full">
                {player.score} pts
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
