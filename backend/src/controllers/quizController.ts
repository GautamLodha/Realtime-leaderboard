import { Request, Response } from 'express'
// import prisma from '../prisma'
import { quizQueue } from '../queues/quiz.queue'
import { customAlphabet } from 'nanoid'
import { prisma } from '../config/db'

const generateRoomId = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6)

// POST /quiz — create a new quiz
export const createQuiz = async (req: Request, res: Response) => {
  const { title, duration, startTime } = req.body
  const creatorId = req.user!.userId

  const plannedStart = startTime ? new Date(startTime) : null
  if (plannedStart && Number.isNaN(plannedStart.getTime()))
    return res.status(400).json({ error: 'Start time must be a valid date' })

  const roomId = 'QUIZ-' + generateRoomId()

  const quiz = await prisma.quiz.create({
    data: {
      title,
      duration,
      roomId,
      creatorId,
      startTime: plannedStart,
      status: 'draft'
    }
  })

  res.status(201).json({ quiz })
}

// GET /quiz — get all quizzes created by logged-in user
export const getMyQuizzes = async (req: Request, res: Response) => {
  const creatorId = req.user!.userId

  const quizzes = await prisma.quiz.findMany({
    where: { creatorId },
    include: { _count: { select: { questions: true, participants: true } } },
    orderBy: { createdAt: 'desc' }
  })

  res.json({ quizzes })
}

// GET /quiz/:id — get single quiz with questions
export const getQuizById = async (req: Request, res: Response) => {
  const quizId = parseInt(req.params.id)
  if (Number.isNaN(quizId)) return res.status(400).json({ error: 'Quiz ID must be a number' })

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: { questions: { orderBy: { position: 'asc' } } }
  })

  if (!quiz) return res.status(404).json({ error: 'Quiz not found' })

  // only creator sees answers — strip them for others
  if (quiz.creatorId !== req.user!.userId) {
    const sanitised = {
      ...quiz,
      questions: quiz.questions.map(({ answer: _answer, ...q }) => q)
    }
    return res.json({ quiz: sanitised })
  }

  res.json({ quiz })
}

// PUT /quiz/:id — edit quiz (host only)
export const updateQuiz = async (req: Request, res: Response) => {
  const quizId = parseInt(req.params.id)
  const { title, duration } = req.body

  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } })
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' })
  if (quiz.creatorId !== req.user!.userId)
    return res.status(403).json({ error: 'Not your quiz' })

  const updated = await prisma.quiz.update({
    where: { id: quizId },
    data: { title, duration }
  })

  res.json({ quiz: updated })
}

// DELETE /quiz/:id — delete quiz (host only)
export const deleteQuiz = async (req: Request, res: Response) => {
  const quizId = parseInt(req.params.id)

  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } })
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' })
  if (quiz.creatorId !== req.user!.userId)
    return res.status(403).json({ error: 'Not your quiz' })

  // Answers and participants use restrictive foreign keys, so remove the quiz tree atomically.
  await prisma.$transaction([
    prisma.answer.deleteMany({ where: { quizId } }),
    prisma.quizParticipant.deleteMany({ where: { quizId } }),
    prisma.question.deleteMany({ where: { quizId } }),
    prisma.quiz.delete({ where: { id: quizId } })
  ])
  res.json({ message: 'Quiz deleted' })
}

// POST /quiz/:id/room-code — create a fresh invite code before a quiz goes live.
export const regenerateRoomCode = async (req: Request, res: Response) => {
  const quizId = parseInt(req.params.id)
  if (Number.isNaN(quizId)) return res.status(400).json({ error: 'Quiz ID must be a number' })

  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } })
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' })
  if (quiz.creatorId !== req.user!.userId) return res.status(403).json({ error: 'Not your quiz' })
  if (quiz.status === 'active' || quiz.status === 'ended')
    return res.status(400).json({ error: 'Room code cannot be changed after the quiz has started' })

  const roomId = 'QUIZ-' + generateRoomId()
  const updated = await prisma.quiz.update({ where: { id: quizId }, data: { roomId } })
  res.json({ quiz: updated, message: 'New room code created' })
}

// POST /quiz/:id/schedule — schedule quiz start time
export const scheduleQuiz = async (req: Request, res: Response) => {
  const quizId = parseInt(req.params.id)
  const { startTime } = req.body  // ISO string e.g. "2024-06-25T18:00:00.000Z"

  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } })
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' })
  if (quiz.creatorId !== req.user!.userId)
    return res.status(403).json({ error: 'Not your quiz' })

  // make sure quiz has questions before scheduling
  const questionCount = await prisma.question.count({ where: { quizId } })
  if (questionCount === 0)
    return res.status(400).json({ error: 'Add questions before scheduling' })

  const start = new Date(startTime)
  const delay = start.getTime() - Date.now()

  if (delay < 0)
    return res.status(400).json({ error: 'Start time must be in the future' })

  // save start time to DB
  await prisma.quiz.update({
    where: { id: quizId },
    data: { startTime: start, status: 'scheduled' }
  })

  // push delayed job to Bull queue
  await quizQueue.add(
    'start_quiz',
    { roomId: quiz.roomId, quizId },
    { delay }
  )

  res.json({ message: 'Quiz scheduled', startTime: start, roomId: quiz.roomId })
}

// GET /room/:roomId — participant validates room before joining
export const getRoomByRoomId = async (req: Request, res: Response) => {
  const { roomId } = req.params

  const quiz = await prisma.quiz.findUnique({
    where: { roomId },
    select: {
      id: true,
      title: true,
      roomId: true,
      startTime: true,
      status: true,
      duration: true,
      _count: { select: { questions: true } }
    }
  })

  if (!quiz) return res.status(404).json({ error: 'Room not found' })

  res.json({ room: quiz })
}
