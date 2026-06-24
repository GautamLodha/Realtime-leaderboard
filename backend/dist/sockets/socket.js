"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocket = void 0;
const redis_1 = __importDefault(require("../config/redis"));
const db_1 = require("../config/db");
const socketMiddleware_1 = require("./socketMiddleware");
const leaderboard_1 = require("../helpers/leaderboard");
const initSocket = (io) => {
    // verify JWT on every connection
    io.use(socketMiddleware_1.socketAuthMiddleware);
    io.on('connection', (socket) => {
        const userId = socket.data.userId;
        console.log(`User ${userId} connected`);
        // ─── EVENT 1: JOIN ROOM ───────────────────────────────
        socket.on('join_room', async ({ roomId }) => {
            const quiz = await db_1.prisma.quiz.findUnique({
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
            });
            if (!quiz)
                return socket.emit('error', { message: 'Room not found' });
            if (quiz.status === 'draft')
                return socket.emit('error', { message: 'Quiz has not been scheduled yet' });
            // Delayed jobs can be missed while a hosted worker is asleep or restarting.
            // Reconcile the quiz state when a participant enters the room so its schedule
            // remains correct even without a continuously running worker.
            if (quiz.status === 'scheduled' && quiz.startTime && quiz.startTime.getTime() <= Date.now()) {
                const hasEnded = quiz.startTime.getTime() + quiz.duration * 60 * 1000 <= Date.now();
                quiz.status = hasEnded ? 'ended' : 'active';
                await db_1.prisma.quiz.update({ where: { id: quiz.id }, data: { status: quiz.status } });
                if (!hasEnded)
                    io.to(roomId).emit('quiz_start', { quizId: quiz.id, roomId });
            }
            // add user to this socket room
            socket.join(roomId);
            socket.data.roomId = roomId;
            socket.data.quizId = quiz.id;
            // save participant to DB (ignore duplicate joins)
            await db_1.prisma.quizParticipant.upsert({
                where: { quizId_userId: { quizId: quiz.id, userId } },
                update: {},
                create: { quizId: quiz.id, userId }
            });
            // for proctoring — shuffle questions uniquely per user
            const shuffled = shuffle([...quiz.questions]);
            const answers = await db_1.prisma.answer.findMany({
                where: { userId, quizId: quiz.id },
                select: { questionId: true, score: true, isCorrect: true }
            });
            const leaderboard = await (0, leaderboard_1.getLeaderboard)(roomId);
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
                myScore: answers.reduce((total, answer) => total + answer.score, 0)
            });
            // This cache improves grading/proctoring but must not prevent a player from entering a room.
            void redis_1.default.set(`order:${userId}:${roomId}`, JSON.stringify(shuffled.map(q => q.id)), 'EX', 60 * 60 * 3).catch(error => console.error('Could not cache question order:', error));
            console.log(`User ${userId} joined room ${roomId}`);
        });
        // ─── EVENT 2: SUBMIT ANSWER ───────────────────────────
        socket.on('submit_answer', async ({ questionId, answer, timeTaken }) => {
            const roomId = socket.data.roomId;
            const quizId = socket.data.quizId;
            if (!roomId || !quizId)
                return socket.emit('error', { message: 'Not in a room' });
            const quiz = await db_1.prisma.quiz.findUnique({ where: { id: quizId }, select: { status: true } });
            if (!quiz || quiz.status !== 'active')
                return socket.emit('error', { message: 'Quiz is not active yet' });
            // check if already answered this question
            const existing = await db_1.prisma.answer.findFirst({
                where: { userId, questionId, quizId }
            });
            if (existing)
                return socket.emit('error', { message: 'Already answered this question' });
            // get correct answer from DB
            const question = await db_1.prisma.question.findUnique({
                where: { id: questionId }
            });
            if (!question)
                return socket.emit('error', { message: 'Question not found' });
            const isCorrect = question.answer === answer;
            // One point per correct answer; total answer time is used to break score ties.
            const score = isCorrect ? 1 : 0;
            // save answer to DB
            await db_1.prisma.answer.create({
                data: { userId, quizId, questionId, answer, isCorrect, score, timeTaken }
            });
            // update leaderboard in Redis sorted set
            await redis_1.default.zincrby(`leaderboard:${roomId}`, score, String(userId));
            // send result back to this user only
            socket.emit('answer_result', {
                questionId,
                isCorrect,
                correctAnswer: question.answer,
                score,
                totalScore: await db_1.prisma.answer.aggregate({
                    where: { userId, quizId },
                    _sum: { score: true }
                }).then(result => result._sum.score ?? 0)
            });
            // fetch updated leaderboard top 10
            const leaderboard = await (0, leaderboard_1.getLeaderboard)(roomId);
            // broadcast new leaderboard to everyone in room
            io.to(roomId).emit('leaderboard_update', leaderboard);
        });
        // ─── EVENT 3: END QUIZ (host only) ───────────────────
        socket.on('end_quiz', async ({ roomId }) => {
            const quiz = await db_1.prisma.quiz.findUnique({ where: { roomId } });
            if (!quiz)
                return socket.emit('error', { message: 'Room not found' });
            if (quiz.creatorId !== userId)
                return socket.emit('error', { message: 'Only the host can end the quiz' });
            // update status in DB
            await db_1.prisma.quiz.update({
                where: { roomId },
                data: { status: 'ended' }
            });
            // get final leaderboard
            const leaderboard = await (0, leaderboard_1.getLeaderboard)(roomId);
            // broadcast final results to everyone
            io.to(roomId).emit('quiz_end', { leaderboard });
            // clean up Redis
            await redis_1.default.del(`leaderboard:${roomId}`);
            console.log(`Quiz ended — room ${roomId}`);
        });
        // ─── DISCONNECT ───────────────────────────────────────
        socket.on('disconnect', () => {
            console.log(`User ${userId} disconnected`);
        });
    });
};
exports.initSocket = initSocket;
// ─── HELPERS ──────────────────────────────────────────────
// shuffle array (Fisher-Yates)
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
// get top 10 from Redis sorted set with user names
