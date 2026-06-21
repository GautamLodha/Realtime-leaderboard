import { Queue, Worker, Job } from 'bullmq';
import { redisConnection } from '../config/redis';
import { prisma } from '../config/db';
import { getIO } from '../config/socket';

// 1. Initialize the Queue
export const quizQueue = new Queue('quizSessionQueue', { connection: redisConnection });

// 2. Define the Worker to process the scheduled jobs
export const initQuizWorker = () => {
  const worker = new Worker(
    'quizSessionQueue',
    async (job: Job) => {
      const { sessionId, action } = job.data;
      const io = getIO();

      if (action === 'START') {
        // A. Move status to ACTIVE in PostgreSQL
        await prisma.quizSession.update({
          where: { id: sessionId },
          data: { status: 'ACTIVE', startedAt: new Date() },
        });

        console.log(`🚀 Quiz Session ${sessionId} is now LIVE!`);

        // B. Emit real-time event to all clients waiting in this quiz room
        io.to(`quiz_${sessionId}`).emit('quiz_state_change', { status: 'ACTIVE' });
      } 
      
      else if (action === 'END') {
        // A. Move status to FINISHED in PostgreSQL
        await prisma.quizSession.update({
          where: { id: sessionId },
          data: { status: 'FINISHED', endedAt: new Date() },
        });

        console.log(`🏁 Quiz Session ${sessionId} has ENDED!`);

        // B. Emit real-time event to stop the quiz for everyone
        io.to(`quiz_${sessionId}`).emit('quiz_state_change', { status: 'FINISHED' });
      }
    },
    { connection: redisConnection }
  );

  worker.on('failed', (job, err) => {
    console.error(`❌ Job ${job?.id} failed with error: ${err.message}`);
  });
};

// 3. Helper function to calculate delay and schedule a quiz session
export const scheduleQuizSession = async (sessionId: number, startTime: Date, durationInMinutes: number) => {
  const now = Date.now();
  const startTimestamp = new Date(startTime).getTime();
  const endTimestamp = startTimestamp + durationInMinutes * 60 * 1000;

  const startDelay = startTimestamp - now;
  const endDelay = endTimestamp - now;

  // Schedule the START job
  if (startDelay > 0) {
    await quizQueue.add(`start_session_${sessionId}`, { sessionId, action: 'START' }, { delay: startDelay });
    console.log(`⏳ Scheduled START for session ${sessionId} in ${startDelay / 1000}s`);
  } else {
    console.log(`⚠️ Start time is in the past or right now. Handled immediately.`);
  }

  // Schedule the END job
  if (endDelay > 0) {
    await quizQueue.add(`end_session_${sessionId}`, { sessionId, action: 'END' }, { delay: endDelay });
    console.log(`⏳ Scheduled END for session ${sessionId} in ${endDelay / 1000}s`);
  }
};