import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

let io: SocketIOServer | null = null;

export const initSocket = (server: HTTPServer): SocketIOServer => {
  io = new SocketIOServer(server, {
    cors: {
      origin: '*', 
      methods: ['GET', 'POST'],
    },
  });
  return io;
};

export const getIO = (): SocketIOServer => {
  if (!io) throw new Error('Socket.io has not been initialized yet!');
  return io;
};