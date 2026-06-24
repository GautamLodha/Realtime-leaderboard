import { Server, Socket } from 'socket.io'
import redis from '../config/redis'
import { prisma } from '../config/db'
import { socketAuthMiddleware } from './socketMiddleware'
import { getLeaderboard } from '../helpers/leaderboard'

export const initSocket = (io: Server) => {

  // verify JWT on every connection
  io.use(socketAuthMiddleware)

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId
    console.log(`User ${userId} connected`)

    // ─── EVENT 1: JOIN ROOM ───────────────────────────────
    socket.on('join_room', async ({ roomId }) => {
      const quiz = await prisma.quiz.findUnique({
        where: { roomId },
        include: {
          questions: {
            orderBy: { position: 'asc' },
            select: {
              id: true,
              text: true,
              options: true,
              position: true
              // answer NOT sent to participant
            }
          }
        }
      })

      if (!quiz) return socket.emit('error', { message: 'Room not found' })
      if (quiz.status === 'draft') return socket.emit('error', { message: 'Quiz has not been scheduled yet' })

      // Delayed jobs can be missed while a hosted worker is asleep or restarting.
      // Reconcile the quiz state when a participant enters the room so its schedule
      // remains correct even without a continuously running worker.
      if (quiz.status === 'scheduled' && quiz.startTime && quiz.startTime.getTime() <= Date.now()) {
        const hasEnded = quiz.startTime.getTime() + quiz.duration * 60 * 1000 <= Date.now()
        quiz.status = hasEnded ? 'ended' : 'active'
        await prisma.quiz.update({ where: { id: quiz.id }, data: { status: quiz.status } })
        if (!hasEnded) io.to(roomId).emit('quiz_start', { quizId: quiz.id, roomId })
      }

      // add user to this socket room
      socket.join(roomId)
      socket.data.roomId = roomId
      socket.data.quizId = quiz.id

      // save participant to DB (ignore duplicate joins)
      await prisma.quizParticipant.upsert({
        where: { quizId_userId: { quizId: quiz.id, userId } },
        update: {},
        create: { quizId: quiz.id, userId }
      })

      // for proctoring — shuffle questions uniquely per user
      const shuffled = shuffle([...quiz.questions])
      const answers = await prisma.answer.findMany({
        where: { userId, quizId: quiz.id },
        select: { questionId: true, score: true, isCorrect: true }
      })
      const leaderboard = await getLeaderboard(roomId)

      // send shuffled questions + quiz meta to this user only
      socket.emit('joined', {
        quiz: {
          title: quiz.title,
          roomId: quiz.roomId,
          startTime: quiz.startTime,
          duration: quiz.duration,
          status: quiz.status
        },
        questions: quiz.status === 'ended' ? [] : shuffled,
        answers,
        leaderboard,
        myScore: answers.reduce((total: number, answer) => total + answer.score, 0)
      })

      // This cache improves grading/proctoring but must not prevent a player from entering a room.
      void redis.set(
        `order:${userId}:${roomId}`,
        JSON.stringify(shuffled.map(q => q.id)),
        'EX', 60 * 60 * 3
      ).catch(error => console.error('Could not cache question order:', error))

      console.log(`User ${userId} joined room ${roomId}`)
    })

    // ─── EVENT 2: SUBMIT ANSWER ───────────────────────────
    socket.on('submit_answer', async ({ questionId, answer, timeTaken }) => {
      const roomId = socket.data.roomId
      const quizId = socket.data.quizId

      if (!roomId || !quizId) return socket.emit('error', { message: 'Not in a room' })

      const quiz = await prisma.quiz.findUnique({ where: { id: quizId }, select: { status: true } })
      if (!quiz || quiz.status !== 'active')
        return socket.emit('error', { message: 'Quiz is not active yet' })

      // check if already answered this question
      const existing = await prisma.answer.findFirst({
        where: { userId, questionId, quizId }
      })
      if (existing) return socket.emit('error', { message: 'Already answered this question' })

      // get correct answer from DB
      const question = await prisma.question.findUnique({
        where: { id: questionId }
      })
      if (!question) return socket.emit('error', { message: 'Question not found' })

      const isCorrect = question.answer === answer

      // One point per correct answer; total answer time is used to break score ties.
      const score = isCorrect ? 1 : 0

      // save answer to DB
      await prisma.answer.create({
        data: { userId, quizId, questionId, answer, isCorrect, score, timeTaken }
      })

      // send result back to this user only
      socket.emit('answer_result', {
        questionId,
        isCorrect,
        correctAnswer: question.answer,
        score,
        totalScore: await prisma.answer.aggregate({
          where: { userId, quizId },
          _sum: { score: true }
        }).then(result => result._sum.score ?? 0)
      })

      // Redis is a cache for the live leaderboard. Do not delay the answer result
      // (and the client's Next button) if the cache is temporarily unavailable.
      void redis.zincrby(`leaderboard:${roomId}`, score, String(userId))
        .catch(error => console.error('Could not update Redis leaderboard:', error))

      // fetch updated leaderboard top 10
      const leaderboard = await getLeaderboard(roomId)

      // broadcast new leaderboard to everyone in room
      io.to(roomId).emit('leaderboard_update', leaderboard)
    })

    // ─── EVENT 3: END QUIZ (host only) ───────────────────
    socket.on('end_quiz', async ({ roomId }) => {
      const quiz = await prisma.quiz.findUnique({ where: { roomId } })

      if (!quiz) return socket.emit('error', { message: 'Room not found' })
      if (quiz.creatorId !== userId)
        return socket.emit('error', { message: 'Only the host can end the quiz' })

      // update status in DB
      await prisma.quiz.update({
        where: { roomId },
        data: { status: 'ended' }
      })

      // get final leaderboard
      const leaderboard = await getLeaderboard(roomId)

      // broadcast final results to everyone
      io.to(roomId).emit('quiz_end', { leaderboard })

      // clean up Redis
      await redis.del(`leaderboard:${roomId}`)

      console.log(`Quiz ended — room ${roomId}`)
    })

    // ─── DISCONNECT ───────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`User ${userId} disconnected`)
    })
  })
}

// ─── HELPERS ──────────────────────────────────────────────

// shuffle array (Fisher-Yates)
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// get top 10 from Redis sorted set with user names
