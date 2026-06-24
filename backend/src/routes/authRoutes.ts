import { Router } from 'express'
import { login, register } from '../controllers/authController'
import { asyncHandler } from '../middleware/asyncHandler'


const router = Router()

router.post('/register', asyncHandler(register))
router.post('/login', asyncHandler(login))

export default router
