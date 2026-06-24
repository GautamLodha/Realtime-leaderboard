"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeaderboardService = void 0;
const redis_1 = __importDefault(require("../config/redis"));
const db_1 = require("../config/db");
const socket_1 = require("../config/socket");
class LeaderboardService {
    static async submitAnswer(userId, sessionId, questionId, selectedOption) {
        const question = await db_1.prisma.question.findUnique({
            where: { id: questionId },
        });
        if (!question)
            throw new Error('Question not found');
        const isCorrect = question.answer === selectedOption;
        const pointsToAdd = isCorrect ? 10 : 0;
        const existingAnswer = await db_1.prisma.answer.findFirst({ where: { userId, quizId: sessionId, questionId } });
        if (existingAnswer) {
            await db_1.prisma.answer.update({
                where: { id: existingAnswer.id },
                data: { answer: selectedOption, isCorrect, score: pointsToAdd },
            });
        }
        else {
            await db_1.prisma.answer.create({
                data: { userId, quizId: sessionId, questionId, answer: selectedOption, isCorrect, score: pointsToAdd, timeTaken: 0 },
            });
        }
        // 3. Update the leaderboard in Redis Sorted Set
        // Format: zincrby("leaderboard:session_ID", score, username_or_id)
        const redisKey = `leaderboard:session_${sessionId}`;
        await redis_1.default.zincrby(redisKey, pointsToAdd, userId.toString());
        // 4. Trigger the real-time broadcast to the contest room
        await this.broadcastLeaderboard(sessionId);
        return { isCorrect, pointsAdded: pointsToAdd };
    }
    /**
     * Retrieves the top 10 standings from Redis and pushes them over WebSockets
     */
    static async broadcastLeaderboard(sessionId) {
        const redisKey = `leaderboard:session_${sessionId}`;
        // ZREVRANGE fetches elements descending (highest score first) with their scores
        const topPlayersRaw = await redis_1.default.zrevrange(redisKey, 0, 9, 'WITHSCORES');
        const leaderboard = [];
        for (let i = 0; i < topPlayersRaw.length; i += 2) {
            const userIdStr = topPlayersRaw[i];
            const scoreStr = topPlayersRaw[i + 1];
            // Fetch user profile from DB to get the actual username instead of raw ID string
            const user = await db_1.prisma.user.findUnique({
                where: { id: parseInt(userIdStr, 10) },
                select: { name: true }
            });
            leaderboard.push({
                rank: (i / 2) + 1,
                username: user?.name || `User_${userIdStr}`,
                score: parseInt(scoreStr, 10),
            });
        }
        // Emit live stats to all users in the specific quiz session room
        const io = (0, socket_1.getIO)();
        io.to(`quiz_${sessionId}`).emit('leaderboard_update', leaderboard);
    }
}
exports.LeaderboardService = LeaderboardService;
