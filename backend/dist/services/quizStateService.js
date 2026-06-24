"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleQuizSession = exports.initQuizWorker = exports.quizQueue = void 0;
const bullmq_1 = require("bullmq");
const redis_1 = __importDefault(require("../config/redis"));
const db_1 = require("../config/db");
const socket_1 = require("../config/socket");
// 1. Initialize the Queue
exports.quizQueue = new bullmq_1.Queue('quizSessionQueue', { connection: redis_1.default });
// 2. Define the Worker to process the scheduled jobs
const initQuizWorker = () => {
    const worker = new bullmq_1.Worker('quizSessionQueue', async (job) => {
        const { sessionId, action } = job.data;
        const io = (0, socket_1.getIO)();
        if (action === 'START') {
            // A. Move status to ACTIVE in PostgreSQL
            await db_1.prisma.quiz.update({
                where: { id: sessionId },
                data: { status: 'active' },
            });
            console.log(`🚀 Quiz Session ${sessionId} is now LIVE!`);
            // B. Emit real-time event to all clients waiting in this quiz room
            io.to(`quiz_${sessionId}`).emit('quiz_state_change', { status: 'active' });
        }
        else if (action === 'END') {
            // A. Move status to FINISHED in PostgreSQL
            await db_1.prisma.quiz.update({
                where: { id: sessionId },
                data: { status: 'ended' },
            });
            console.log(`🏁 Quiz Session ${sessionId} has ENDED!`);
            // B. Emit real-time event to stop the quiz for everyone
            io.to(`quiz_${sessionId}`).emit('quiz_state_change', { status: 'ended' });
        }
    }, { connection: redis_1.default });
    worker.on('failed', (job, err) => {
        console.error(`❌ Job ${job?.id} failed with error: ${err.message}`);
    });
};
exports.initQuizWorker = initQuizWorker;
// 3. Helper function to calculate delay and schedule a quiz session
const scheduleQuizSession = async (sessionId, startTime, durationInMinutes) => {
    const now = Date.now();
    const startTimestamp = new Date(startTime).getTime();
    const endTimestamp = startTimestamp + durationInMinutes * 60 * 1000;
    const startDelay = startTimestamp - now;
    const endDelay = endTimestamp - now;
    // Schedule the START job
    if (startDelay > 0) {
        await exports.quizQueue.add(`start_session_${sessionId}`, { sessionId, action: 'START' }, { delay: startDelay });
        console.log(`⏳ Scheduled START for session ${sessionId} in ${startDelay / 1000}s`);
    }
    else {
        console.log(`⚠️ Start time is in the past or right now. Handled immediately.`);
    }
    // Schedule the END job
    if (endDelay > 0) {
        await exports.quizQueue.add(`end_session_${sessionId}`, { sessionId, action: 'END' }, { delay: endDelay });
        console.log(`⏳ Scheduled END for session ${sessionId} in ${endDelay / 1000}s`);
    }
};
exports.scheduleQuizSession = scheduleQuizSession;
