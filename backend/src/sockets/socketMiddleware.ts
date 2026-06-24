import { Socket } from 'socket.io'
import jwt from 'jsonwebtoken'

interface JwtPayload {
  userId: number
  email: string
}

export const socketAuthMiddleware = (socket: Socket, next: Function) => {
  const token = socket.handshake.auth.token

  if (!token) return next(new Error('No token provided'))

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload
    socket.data.userId = decoded.userId
    socket.data.email = decoded.email
    next()
  } catch {
    next(new Error('Invalid token'))
  }
}