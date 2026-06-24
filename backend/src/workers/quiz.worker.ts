// src/workers/quiz.worker.ts
import { Worker } from 'bullmq'
import redis from '../config/redis'
import { prisma } from '../config/db'
import { quizQueue } from '../queues/quiz.queue'
import { getLeaderboard } from '../helpers/leaderboard'
import { Server } from 'socket.io'

// accept io as a parameter instead of importing it
export function startQuizWorker(io: Server) {
  const worker = new Worker('quiz', async (job) => {
    const { roomId, quizId } = job.data

    if (job.name === 'start_quiz') {
      await prisma.quiz.update({
        where: { id: quizId },
        data: { status: 'active' }
      })
      io.to(roomId).emit('quiz_start', { quizId, roomId })

      const quiz = await prisma.quiz.findUnique({ where: { id: quizId } })
      const endDelay = (quiz!.duration) * 60 * 1000
      await quizQueue.add('end_quiz', { roomId, quizId }, { delay: endDelay })
    }

    if (job.name === 'end_quiz') {
      await prisma.quiz.update({
        where: { id: quizId },
        data: { status: 'ended' }
      })
      const leaderboard = await getLeaderboard(roomId)
      io.to(roomId).emit('quiz_end', { leaderboard })
      await redis.del(`leaderboard:${roomId}`)
    }

  }, { connection: redis as any })

  worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed`)
  })

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed:`, err)
  })

  return worker
}