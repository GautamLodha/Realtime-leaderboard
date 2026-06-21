import express from 'express';
import { createServer } from 'http';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes';
import quizRoutes from './routes/quizRoutes';
import { initSocket } from './config/socket';
import { setupQuizSockets } from './sockets/quizSocket';
import { initQuizWorker } from './services/quizStateService';

dotenv.config();

const app = express();
app.use(express.json());

const httpServer = createServer(app);

// Initialize Sockets & Workers cleanly
const io = initSocket(httpServer);
setupQuizSockets(io);
initQuizWorker(); // Boots up the BullMQ consumer list

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/quizzes', quizRoutes);

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`🔥 Realtime Engine running smoothly on port ${PORT}`);
});