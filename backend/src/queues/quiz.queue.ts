import { Queue } from 'bullmq'
import redis from '../config/redis'


export const quizQueue = new Queue('quiz', {
  connection: redis as any
})
