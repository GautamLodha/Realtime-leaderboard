"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const redis_1 = __importDefault(require("../config/redis"));
const db_1 = require("../config/db");
const server_1 = require("../server");
const quiz_queue_1 = require("../queues/quiz.queue");
const leaderboard_1 = require("../helpers/leaderboard");
const worker = new bullmq_1.Worker('quiz', async (job) => {
    const { roomId, quizId } = job.data;
    if (job.name === 'start_quiz') {
        await db_1.prisma.quiz.update({
            where: { id: quizId },
            data: { status: 'active' }
        });
        server_1.io.to(roomId).emit('quiz_start', { quizId, roomId });
        // auto end after duration
        const quiz = await db_1.prisma.quiz.findUnique({ where: { id: quizId } });
        const endDelay = (quiz.duration) * 60 * 1000;
        await quiz_queue_1.quizQueue.add('end_quiz', { roomId, quizId }, { delay: endDelay });
    }
    if (job.name === 'end_quiz') {
        await db_1.prisma.quiz.update({
            where: { id: quizId },
            data: { status: 'ended' }
        });
        const leaderboard = await (0, leaderboard_1.getLeaderboard)(roomId);
        server_1.io.to(roomId).emit('quiz_end', { leaderboard });
        await redis_1.default.del(`leaderboard:${roomId}`);
    }
}, { connection: redis_1.default });
worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed`);
});
worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed:`, err);
});
exports.default = worker;
