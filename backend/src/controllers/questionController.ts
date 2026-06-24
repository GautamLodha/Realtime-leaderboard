import { Request, Response } from 'express'
import { prisma } from '../config/db'

// POST /quiz/:id/questions — bulk insert questions
export const addQuestions = async (req: Request, res: Response) => {
  const quizId = parseInt(req.params.id)

  // verify ownership
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } })
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' })
  if (quiz.creatorId !== req.user!.userId)
    return res.status(403).json({ error: 'Not your quiz' })
  if (quiz.status === 'active' || quiz.status === 'ended')
    return res.status(400).json({ error: 'Cannot edit an active or ended quiz' })

  const { questions } = req.body
  // questions = [{ text, options: ["A","B","C","D"], answer: "A", position: 1 }]

  if (!Array.isArray(questions) || questions.length === 0)
    return res.status(400).json({ error: 'Provide at least one question' })

  // validate each question has required fields
  for (const q of questions) {
    if (!q.text || !q.options || !q.answer || q.position === undefined)
      return res.status(400).json({ error: 'Each question needs text, options, answer, position' })
    if (!Array.isArray(q.options) || q.options.length < 2)
      return res.status(400).json({ error: 'Each question needs at least 2 options' })
    if (!q.options.includes(q.answer))
      return res.status(400).json({ error: `Answer "${q.answer}" must be one of the options` })
  }

  // bulk insert using createMany
  await prisma.question.createMany({
    data: questions.map((q) => ({
      quizId,
      text: q.text,
      options: q.options,
      answer: q.answer,
      position: q.position
    }))
  })

  const saved = await prisma.question.findMany({
    where: { quizId },
    orderBy: { position: 'asc' }
  })

  res.status(201).json({ message: `${saved.length} questions saved`, questions: saved })
}

// PUT /quiz/:id/questions — replace the complete draft question set without duplicates.
export const replaceQuestions = async (req: Request, res: Response) => {
  const quizId = parseInt(req.params.id)
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } })
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' })
  if (quiz.creatorId !== req.user!.userId) return res.status(403).json({ error: 'Not your quiz' })
  if (quiz.status === 'active' || quiz.status === 'ended') return res.status(400).json({ error: 'Cannot edit an active or ended quiz' })

  const { questions } = req.body
  if (!Array.isArray(questions) || questions.length === 0)
    return res.status(400).json({ error: 'Provide at least one question' })

  for (const question of questions) {
    if (!question.text || !Array.isArray(question.options) || !question.answer || question.position === undefined)
      return res.status(400).json({ error: 'Each question needs text, options, answer, position' })
    if (question.options.length < 2 || !question.options.includes(question.answer))
      return res.status(400).json({ error: 'Each answer must be one of at least two options' })
  }

  await prisma.$transaction([
    prisma.question.deleteMany({ where: { quizId } }),
    prisma.question.createMany({ data: questions.map(question => ({ quizId, text: question.text, options: question.options, answer: question.answer, position: question.position })) })
  ])

  const saved = await prisma.question.findMany({ where: { quizId }, orderBy: { position: 'asc' } })
  res.json({ message: `${saved.length} questions saved`, questions: saved })
}

// DELETE /quiz/:id/questions — clear all questions (for rewrite)
export const clearQuestions = async (req: Request, res: Response) => {
  const quizId = parseInt(req.params.id)

  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } })
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' })
  if (quiz.creatorId !== req.user!.userId)
    return res.status(403).json({ error: 'Not your quiz' })

  await prisma.question.deleteMany({ where: { quizId } })
  res.json({ message: 'All questions cleared' })
}
