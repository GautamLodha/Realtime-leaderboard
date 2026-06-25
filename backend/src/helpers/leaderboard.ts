import { prisma } from '../config/db'

export async function getLeaderboard(roomId: string) {
  const quiz = await prisma.quiz.findUnique({ where: { roomId }, select: { id: true } })
  if (!quiz) return []

  // Correct-answer count is the primary rank. For ties, the participant who
  // completed their answers earlier wins. Use the server timestamp rather than
  // client-provided duration, which can vary with join time and device clocks.
  const answers = await prisma.answer.findMany({
    where: { quizId: quiz.id },
    select: { userId: true, isCorrect: true, timeTaken: true, createdAt: true }
  })
  const totals = new Map<number, { score: number; timeTaken: number; completedAt: Date }>()
  for (const answer of answers) {
    const current = totals.get(answer.userId) ?? { score: 0, timeTaken: 0, completedAt: answer.createdAt }
    current.score += answer.isCorrect ? 1 : 0
    current.timeTaken += answer.timeTaken
    if (answer.createdAt > current.completedAt) current.completedAt = answer.createdAt
    totals.set(answer.userId, current)
  }
  const ranked = [...totals.entries()]
    .map(([userId, total]) => ({ userId, ...total }))
    .sort((left, right) => right.score - left.score || left.completedAt.getTime() - right.completedAt.getTime())
    .slice(0, 10)

  return Promise.all(ranked.map(async (entry, index) => ({
    rank: index + 1,
    user: await prisma.user.findUnique({ where: { id: entry.userId }, select: { id: true, name: true } }),
    score: entry.score,
    timeTaken: entry.timeTaken
  })))
}
