// backend/routes/adminRoutes.js
import express from "express";
import { protect, adminOnly } from "../middleware/authMiddleware.js";
import {
  getDashboardStats,
  getAllUsers,
  uploadQuizCSV,
  createQuiz,
  getAllQuizzes,
  updateQuiz,
  updateQuizSchedule,
  startQuiz,
  getPayments,
  reconcilePayments,
  banUser,
  unbanUser,
  getWinners,
  getQuizDetails,
  deleteQuiz,
  deleteUser,
} from "../controllers/adminController.js";
import multer from "multer";
import AdminAudit from "../models/AdminAudit.js";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

// Apply protection to all admin routes
router.use(protect, adminOnly);

// Admin audit middleware
router.use(async (req, res, next) => {
  try {
    await AdminAudit.create({
      admin: req.user.id,
      action: `${req.method} ${req.originalUrl}`,
      method: req.method,
      path: req.originalUrl,
      body: req.body,
      query: req.query,
    });
  } catch (e) {
    // non-blocking
  }
  next();
});

// Dashboard
router.get("/dashboard", getDashboardStats);

// Users
router.get("/users", getAllUsers);
router.put("/users/:id/ban", banUser);
router.put("/users/:id/unban", unbanUser);
router.delete("/users/:id", deleteUser);

// Quizzes
router.get("/quizzes", getAllQuizzes);
router.post("/quizzes", createQuiz);
router.get("/quizzes/:id", getQuizDetails);
router.put("/quizzes/:id", updateQuiz);
router.delete("/quizzes/:id", deleteQuiz);
router.patch("/quizzes/:id/schedule", updateQuizSchedule);
router.post("/quizzes/:id/start", startQuiz);
router.post("/quizzes/upload", upload.single("csv"), uploadQuizCSV);

// Payments
router.get("/payments", getPayments);
router.get("/payments/reconcile", reconcilePayments);

// Winners
router.get("/winners", getWinners);

export default router;
