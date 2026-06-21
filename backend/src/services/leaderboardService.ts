import { redisConnection } from '../config/redis';
import { prisma } from '../config/db';
import { getIO } from '../config/socket';

export class LeaderboardService {

  public static async submitAnswer(userId: number, sessionId: number, questionId: number, selectedOption: string) {

    const question = await prisma.quizQuestion.findUnique({
      where: { id: questionId },
    });

    if (!question) throw new Error('Question not found');

    const isCorrect = question.correctOption === selectedOption;
    const pointsToAdd = isCorrect ? 10 : 0;
    await prisma.userAnswer.upsert({
      where: {
        userId_questionId: { userId, questionId },
      },
      update: {
        selectedOption,
        isCorrect,
        score: pointsToAdd,
        answeredAt: new Date(),
      },
      create: {
        userId,
        questionId,
        selectedOption,
        isCorrect,
        score: pointsToAdd,
      },
    });

    // 3. Update the leaderboard in Redis Sorted Set
    // Format: zincrby("leaderboard:session_ID", score, username_or_id)
    const redisKey = `leaderboard:session_${sessionId}`;
    await redisConnection.zincrby(redisKey, pointsToAdd, userId.toString());

    // 4. Trigger the real-time broadcast to the contest room
    await this.broadcastLeaderboard(sessionId);

    return { isCorrect, pointsAdded: pointsToAdd };
  }

  /**
   * Retrieves the top 10 standings from Redis and pushes them over WebSockets
   */
  public static async broadcastLeaderboard(sessionId: number) {
    const redisKey = `leaderboard:session_${sessionId}`;
    
    // ZREVRANGE fetches elements descending (highest score first) with their scores
    const topPlayersRaw = await redisConnection.zrevrange(redisKey, 0, 9, 'WITHSCORES');
    
    const leaderboard = [];
    for (let i = 0; i < topPlayersRaw.length; i += 2) {
      const userIdStr = topPlayersRaw[i];
      const scoreStr = topPlayersRaw[i + 1];

      // Fetch user profile from DB to get the actual username instead of raw ID string
      const user = await prisma.user.findUnique({
        where: { id: parseInt(userIdStr, 10) },
        select: { username: true }
      });

      leaderboard.push({
        rank: (i / 2) + 1,
        username: user?.username || `User_${userIdStr}`,
        score: parseInt(scoreStr, 10),
      });
    }

    // Emit live stats to all users in the specific quiz session room
    const io = getIO();
    io.to(`quiz_${sessionId}`).emit('leaderboard_update', leaderboard);
  }
}