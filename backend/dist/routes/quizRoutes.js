"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const quizController_1 = require("../controllers/quizController");
const questionController_1 = require("../controllers/questionController");
const participantController_1 = require("../controllers/participantController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const asyncHandler_1 = require("../middleware/asyncHandler");
const router = (0, express_1.Router)();
// all quiz routes are protected
router.use(authMiddleware_1.protect);
// Specific paths must come before /:id so "my" and "room" are never read as an ID.
router.post('/', (0, asyncHandler_1.asyncHandler)(quizController_1.createQuiz));
router.get('/my', (0, asyncHandler_1.asyncHandler)(quizController_1.getMyQuizzes));
router.get('/room/:roomId', (0, asyncHandler_1.asyncHandler)(quizController_1.getRoomByRoomId));
router.post('/room/:roomId/join', (0, asyncHandler_1.asyncHandler)(participantController_1.joinRoom));
router.get('/room/:roomId/leaderboard', (0, asyncHandler_1.asyncHandler)(participantController_1.getRoomLeaderboard));
router.get('/:id', (0, asyncHandler_1.asyncHandler)(quizController_1.getQuizById));
router.put('/:id', (0, asyncHandler_1.asyncHandler)(quizController_1.updateQuiz));
router.delete('/:id', (0, asyncHandler_1.asyncHandler)(quizController_1.deleteQuiz));
router.post('/:id/room-code', (0, asyncHandler_1.asyncHandler)(quizController_1.regenerateRoomCode));
router.post('/:id/schedule', (0, asyncHandler_1.asyncHandler)(quizController_1.scheduleQuiz));
router.post('/:id/questions', (0, asyncHandler_1.asyncHandler)(questionController_1.addQuestions));
router.put('/:id/questions', (0, asyncHandler_1.asyncHandler)(questionController_1.replaceQuestions));
router.delete('/:id/questions', (0, asyncHandler_1.asyncHandler)(questionController_1.clearQuestions));
router.post('/:id/answers', (0, asyncHandler_1.asyncHandler)(participantController_1.submitAnswer));
exports.default = router;
