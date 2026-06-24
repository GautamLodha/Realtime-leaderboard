"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupQuizSockets = void 0;
const setupQuizSockets = (io) => {
    io.on('connection', (socket) => {
        console.log(`🔌 User connected to socket: ${socket.id}`);
        // When a user lands on the quiz page, they join a dedicated room
        socket.on('join_quiz', (sessionId) => {
            socket.join(`quiz_${sessionId}`);
            console.log(`User attached to room: quiz_${sessionId}`);
        });
        socket.on('disconnect', () => {
            console.log(`❌ User disconnected: ${socket.id}`);
        });
    });
};
exports.setupQuizSockets = setupQuizSockets;
