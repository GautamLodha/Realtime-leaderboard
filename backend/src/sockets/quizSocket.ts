import { Server as SocketIOServer, Socket } from 'socket.io';

export const setupQuizSockets = (io: SocketIOServer) => {
  io.on('connection', (socket: Socket) => {
    console.log(`🔌 User connected to socket: ${socket.id}`);

    // When a user lands on the quiz page, they join a dedicated room
    socket.on('join_quiz', (sessionId: number) => {
      socket.join(`quiz_${sessionId}`);
      console.log(`User attached to room: quiz_${sessionId}`);
    });

    socket.on('disconnect', () => {
      console.log(`❌ User disconnected: ${socket.id}`);
    });
  });
};