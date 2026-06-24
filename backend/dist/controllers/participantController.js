"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRoomLeaderboard = exports.submitAnswer = exports.joinRoom = void 0;
const db_1 = require("../config/db");
const leaderboard_1 = require("../helpers/leaderboard");
const redis_1 = __importDefault(require("../config/redis"));
const publicQuestion = ({ answer, ...question }) => question;
// POST /quiz/room/:roomId/join — REST fallback for joining a room.
const joinRoom = async (req, res) => {
    const quiz = await db_1.prisma.quiz.findUnique({
        where: { roomId: req.params.roomId },
        include: { questions: { orderBy: { position: 'asc' } } }
    });
    if (!quiz)
        return res.status(404).json({ error: 'Room not found' });
    if (quiz.status === 'draft')
        return res.status(400).json({ error: 'This quiz has not been scheduled yet' });
    await db_1.prisma.quizParticipant.upsert({
        where: { quizId_userId: { quizId: quiz.id, userId: req.user.userId } },
        update: {},
        create: { quizId: quiz.id, userId: req.user.userId }
    });
    const answers = await db_1.prisma.answer.findMany({
        where: { userId: req.user.userId, quizId: quiz.id },
        select: { questionId: true, score: true, isCorrect: true }
    });
    res.json({
        quiz: { id: quiz.id, title: quiz.title, roomId: quiz.roomId, startTime: quiz.startTime, duration: quiz.duration, status: quiz.status },
        questions: quiz.status === 'ended' ? [] : quiz.questions.map(publicQuestion),
        answers,
        leaderboard: await (0, leaderboard_1.getLeaderboard)(quiz.roomId),
        myScore: answers.reduce((total, answer) => total + answer.score, 0)
    });
};
exports.joinRoom = joinRoom;
// POST /quiz/:id/answers — REST fallback for saving a player's answer.
const submitAnswer = async (req, res) => {
    const quizId = Number(req.params.id);
    const { questionId, answer, timeTaken = 0 } = req.body;
    const userId = req.user.userId;
    const participant = await db_1.prisma.quizParticipant.findUnique({ where: { quizId_userId: { quizId, userId } } });
    if (!participant)
        return res.status(403).json({ error: 'Join the room before submitting an answer' });
    const quiz = await db_1.prisma.quiz.findUnique({ where: { id: quizId }, select: { status: true, roomId: true } });
    if (!quiz)
        return res.status(404).json({ error: 'Quiz not found' });
    if (quiz.status !== 'active')
        return res.status(400).json({ error: 'This quiz is not active yet' });
    const question = await db_1.prisma.question.findFirst({ where: { id: Number(questionId), quizId } });
    if (!question)
        return res.status(404).json({ error: 'Question not found in this quiz' });
    const existing = await db_1.prisma.answer.findFirst({ where: { userId, quizId, questionId: question.id } });
    if (existing)
        return res.status(409).json({ error: 'This question has already been answered' });
    const seconds = Math.max(0, Number(timeTaken) || 0);
    const isCorrect = question.answer === answer;
    const score = isCorrect ? 1 : 0;
    await db_1.prisma.answer.create({ data: { userId, quizId, questionId: question.id, answer, isCorrect, score, timeTaken: seconds } });
    await redis_1.default.zincrby(`leaderboard:${quiz.roomId}`, score, String(userId));
    const totalScore = await db_1.prisma.answer.aggregate({ where: { userId, quizId }, _sum: { score: true } });
    res.status(201).json({ isCorrect, correctAnswer: question.answer, score, totalScore: totalScore._sum.score ?? 0 });
};
exports.submitAnswer = submitAnswer;
// GET /quiz/room/:roomId/leaderboard — current top participants.
const getRoomLeaderboard = async (req, res) => {
    const quiz = await db_1.prisma.quiz.findUnique({ where: { roomId: req.params.roomId }, select: { id: true } });
    if (!quiz)
        return res.status(404).json({ error: 'Room not found' });
    res.json({ leaderboard: await (0, leaderboard_1.getLeaderboard)(req.params.roomId) });
};
exports.getRoomLeaderboard = getRoomLeaderboard;
