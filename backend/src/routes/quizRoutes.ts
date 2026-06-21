import { Router } from 'express';
import { createQuizSession, getActiveQuestions, submitQuestionAnswer } from '../controllers/quizController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

// Scheduling router
router.post('/schedule', createQuizSession);

// Secure Live Gameplay Routes
router.get('/:sessionId/questions', authenticateToken, getActiveQuestions);
router.post('/:sessionId/submit', authenticateToken, submitQuestionAnswer);

export default router;