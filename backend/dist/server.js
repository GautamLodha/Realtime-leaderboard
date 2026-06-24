"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.io = void 0;
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const dotenv_1 = __importDefault(require("dotenv"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const quizRoutes_1 = __importDefault(require("./routes/quizRoutes"));
const socket_1 = require("./sockets/socket");
require("./workers/quiz.worker");
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use('/auth', authRoutes_1.default);
app.use('/quiz', quizRoutes_1.default);
app.get('/health', (_, res) => res.json({ status: 'ok' }));
app.use((error, _req, res, _next) => {
    console.error(error);
    if (error.code === 'P1001')
        return res.status(503).json({ error: 'Database is temporarily unreachable. Please try again shortly.' });
    return res.status(500).json({ error: 'Unexpected server error' });
});
// create http server and attach socket.io to it
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: { origin: '*' }
});
exports.io = io;
// init all socket events
(0, socket_1.initSocket)(io);
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
