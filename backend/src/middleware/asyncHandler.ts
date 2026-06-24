import { NextFunction, Request, RequestHandler, Response } from 'express'

type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<unknown>

// Express 4 does not forward rejected async handlers automatically.
export const asyncHandler = (handler: AsyncRoute): RequestHandler => (req, res, next) => {
  void handler(req, res, next).catch(next)
}
