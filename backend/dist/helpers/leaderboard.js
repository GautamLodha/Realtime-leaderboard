"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLeaderboard = getLeaderboard;
const db_1 = require("../config/db");
async function getLeaderboard(roomId) {
    const quiz = await db_1.prisma.quiz.findUnique({ where: { roomId }, select: { id: true } });
    if (!quiz)
        return [];
    // Correct-answer count is the primary rank. For ties, the participant who
    // completed their answers earlier wins. Use the server timestamp rather than
    // client-provided duration, which can vary with join time and device clocks.
    const answers = await db_1.prisma.answer.findMany({
        where: { quizId: quiz.id },
        select: { userId: true, isCorrect: true, timeTaken: true, createdAt: true }
    });
    const totals = new Map();
    for (const answer of answers) {
        const current = totals.get(answer.userId) ?? { score: 0, timeTaken: 0, completedAt: answer.createdAt };
        current.score += answer.isCorrect ? 1 : 0;
        current.timeTaken += answer.timeTaken;
        if (answer.createdAt > current.completedAt)
            current.completedAt = answer.createdAt;
        totals.set(answer.userId, current);
    }
    const ranked = [...totals.entries()]
        .map(([userId, total]) => ({ userId, ...total }))
        .sort((left, right) => right.score - left.score || left.completedAt.getTime() - right.completedAt.getTime())
        .slice(0, 10);
    return Promise.all(ranked.map(async (entry, index) => ({
        rank: index + 1,
        user: await db_1.prisma.user.findUnique({ where: { id: entry.userId }, select: { id: true, name: true } }),
        score: entry.score,
        timeTaken: entry.timeTaken
    })));
}
