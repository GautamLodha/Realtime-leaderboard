import { Router } from 'express'
import {createQuiz, getMyQuizzes, getQuizById,updateQuiz, deleteQuiz, regenerateRoomCode, scheduleQuiz, getRoomByRoomId} from '../controllers/quizController'
import { addQuestions, clearQuestions, replaceQuestions } from '../controllers/questionController'
import { getRoomLeaderboard, joinRoom, submitAnswer } from '../controllers/participantController'
import { protect } from '../middleware/authMiddleware'
import { asyncHandler } from '../middleware/asyncHandler'

const router = Router()

// all quiz routes are protected
router.use(protect)

// Specific paths must come before /:id so "my" and "room" are never read as an ID.
router.post('/', asyncHandler(createQuiz))
router.get('/my', asyncHandler(getMyQuizzes))
router.get('/room/:roomId', asyncHandler(getRoomByRoomId))
router.post('/room/:roomId/join', asyncHandler(joinRoom))
router.get('/room/:roomId/leaderboard', asyncHandler(getRoomLeaderboard))

router.get('/:id', asyncHandler(getQuizById))
router.put('/:id', asyncHandler(updateQuiz))
router.delete('/:id', asyncHandler(deleteQuiz))
router.post('/:id/room-code', asyncHandler(regenerateRoomCode))
router.post('/:id/schedule', asyncHandler(scheduleQuiz))
router.post('/:id/questions', asyncHandler(addQuestions))
router.put('/:id/questions', asyncHandler(replaceQuestions))
router.delete('/:id/questions', asyncHandler(clearQuestions))
router.post('/:id/answers', asyncHandler(submitAnswer))

export default router
