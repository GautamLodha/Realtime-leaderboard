import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware'; 
import { prisma } from '../config/db';
import { LeaderboardService } from '../services/leaderboardService';
import { scheduleQuizSession } from '../services/quizStateService';

export const createQuizSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const { startTime, durationInMinutes } = req.body; // e.g., startTime: "2026-06-25T18:00:00Z"

    // 1. Create session in database
    const session = await prisma.quizSession.create({
      data: {
        status: 'WAITING',
        createdAt: new Date()
      }
    });

    // 2. Queue the automated worker state switch
    await scheduleQuizSession(session.id, new Date(startTime), durationInMinutes);

    res.status(201).json({ message: 'Quiz session scheduled successfully', session });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to schedule quiz session' });
  }
};
export const getActiveQuestions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const sessionId = parseInt(req.params.sessionId, 10);

    const session = await prisma.quizSession.findUnique({ where: { id: sessionId } });
    
    if (!session || session.status !== 'ACTIVE') {
      res.status(403).json({ error: 'This contest has not started yet or has ended.' });
      return;
    }

    // Retrieve all questions but drop the 'correctOption' field so tech-savvy users can't inspect element
    const questions = await prisma.quizQuestion.findMany({
      orderBy: { orderNumber: 'asc' },
      select: {
        id: true,
        questionText: true,
        optionA: true,
        optionB: true,
        optionC: true,
        optionD: true,
        orderNumber: true
      }
    });

    res.json(questions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve questions' });
  }
};

// Process single answer response mid-game
export const submitQuestionAnswer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const sessionId = parseInt(req.params.sessionId, 10);
    const { questionId, selectedOption } = req.body; // option: "A" | "B" | "C" | "D"
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Verify session window validation
    const session = await prisma.quizSession.findUnique({ where: { id: sessionId } });
    if (!session || session.status !== 'ACTIVE') {
      res.status(403).json({ error: 'Submissions closed for this session.' });
      return;
    }

    const result = await LeaderboardService.submitAnswer(userId, sessionId, questionId, selectedOption);
    res.json({ message: 'Answer logged successfully', ...result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Submission processing failed' });
  }
};