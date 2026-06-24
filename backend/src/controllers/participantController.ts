import { Request, Response } from 'express'
import { prisma } from '../config/db'
import { getLeaderboard } from '../helpers/leaderboard'
import redis from '../config/redis'

const publicQuestion = ({ answer, ...question }: any) => question

// POST /quiz/room/:roomId/join — REST fallback for joining a room.
export const joinRoom = async (req: Request, res: Response) => {
  const quiz = await prisma.quiz.findUnique({
    where: { roomId: req.params.roomId },
    include: { questions: { orderBy: { position: 'asc' } } }
  })

  if (!quiz) return res.status(404).json({ error: 'Room not found' })
  if (quiz.status === 'draft') return res.status(400).json({ error: 'This quiz has not been scheduled yet' })

  await prisma.quizParticipant.upsert({
    where: { quizId_userId: { quizId: quiz.id, userId: req.user!.userId } },
    update: {},
    create: { quizId: quiz.id, userId: req.user!.userId }
  })

  const answers = await prisma.answer.findMany({
    where: { userId: req.user!.userId, quizId: quiz.id },
    select: { questionId: true, score: true, isCorrect: true }
  })

  res.json({
    quiz: { id: quiz.id, title: quiz.title, roomId: quiz.roomId, startTime: quiz.startTime, duration: quiz.duration, status: quiz.status },
    questions: quiz.status === 'ended' ? [] : quiz.questions.map(publicQuestion),
    answers,
    leaderboard: await getLeaderboard(quiz.roomId),
    myScore: answers.reduce((total: number, answer) => total + answer.score, 0)
  })
}

// POST /quiz/:id/answers — REST fallback for saving a player's answer.
export const submitAnswer = async (req: Request, res: Response) => {
  const quizId = Number(req.params.id)
  const { questionId, answer, timeTaken = 0 } = req.body
  const userId = req.user!.userId

  const participant = await prisma.quizParticipant.findUnique({ where: { quizId_userId: { quizId, userId } } })
  if (!participant) return res.status(403).json({ error: 'Join the room before submitting an answer' })

  const quiz = await prisma.quiz.findUnique({ where: { id: quizId }, select: { status: true, roomId: true } })
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' })
  if (quiz.status !== 'active') return res.status(400).json({ error: 'This quiz is not active yet' })

  const question = await prisma.question.findFirst({ where: { id: Number(questionId), quizId } })
  if (!question) return res.status(404).json({ error: 'Question not found in this quiz' })

  const existing = await prisma.answer.findFirst({ where: { userId, quizId, questionId: question.id } })
  if (existing) return res.status(409).json({ error: 'This question has already been answered' })

  const seconds = Math.max(0, Number(timeTaken) || 0)
  const isCorrect = question.answer === answer
  const score = isCorrect ? 1 : 0

  await prisma.answer.create({ data: { userId, quizId, questionId: question.id, answer, isCorrect, score, timeTaken: seconds } })
  await redis.zincrby(`leaderboard:${quiz.roomId}`, score, String(userId))
  const totalScore = await prisma.answer.aggregate({ where: { userId, quizId }, _sum: { score: true } })
  res.status(201).json({ isCorrect, correctAnswer: question.answer, score, totalScore: totalScore._sum.score ?? 0 })
}

// GET /quiz/room/:roomId/leaderboard — current top participants.
export const getRoomLeaderboard = async (req: Request, res: Response) => {
  const quiz = await prisma.quiz.findUnique({ where: { roomId: req.params.roomId }, select: { id: true } })
  if (!quiz) return res.status(404).json({ error: 'Room not found' })
  res.json({ leaderboard: await getLeaderboard(req.params.roomId) })
}
