import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import dotenv from 'dotenv'
import authRoutes from './routes/authRoutes'
import quizRoutes from './routes/quizRoutes'
import { initSocket } from './sockets/socket'
import './workers/quiz.worker'

dotenv.config()

const app = express()
app.use(express.json())

app.use('/auth', authRoutes)
app.use('/quiz', quizRoutes)

app.get('/health', (_, res) => res.json({ status: 'ok' }))

app.use((error: Error & { code?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error)
  if (error.code === 'P1001')
    return res.status(503).json({ error: 'Database is temporarily unreachable. Please try again shortly.' })
  return res.status(500).json({ error: 'Unexpected server error' })
})

// create http server and attach socket.io to it
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: '*' }
})

// init all socket events
initSocket(io)

const PORT = process.env.PORT || 3000
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`))

export { io }   // export so worker can use it
