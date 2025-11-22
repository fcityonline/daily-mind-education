// backend/routes/quizRoutes.js
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { 
  getTodayQuiz, 
  checkQuizEligibility,
  enterQuiz, 
  submitAnswer, 
  completeQuiz,
  getWinners,
  getUserQuizHistory 
} from "../controllers/quizController.js";

const router = express.Router();

// Public routes
router.get("/winners", getWinners); // top 20 winners for today (public)
router.get("/winners/:date", getWinners); // top 20 winners for specific date (public)

// Protected routes
router.get("/today", protect, getTodayQuiz); // fetch quiz summary (no answers)
router.get("/eligibility", protect, checkQuizEligibility); // check if user can participate
router.post("/enter", protect, enterQuiz); // join / mark participant
router.post("/answer", protect, submitAnswer); // submit single answer
router.post("/complete", protect, completeQuiz); // complete quiz
router.get("/history", protect, getUserQuizHistory); // get user's quiz history

export default router;
