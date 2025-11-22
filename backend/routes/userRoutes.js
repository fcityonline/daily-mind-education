import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { getTodayJoinedCount } from '../controllers/userController.js';

const router = express.Router();

router.get('/users/today-joined', protect, getTodayJoinedCount);

export default router;