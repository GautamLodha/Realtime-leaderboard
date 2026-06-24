export interface Question {
    id: number;
    questionText: string;
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;
    orderNumber: number;
  }
  
  export interface LeaderboardEntry {
    rank: number;
    username: string;
    score: number;
  }
  
  export type QuizStatus = 'WAITING' | 'ACTIVE' | 'FINISHED';
  
  export interface QuizRoomProps {
    sessionId: number;
    token: string;
    startTime: string;
  }