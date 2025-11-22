// backend/routes/paymentRoutes.js
import express from "express";
import rateLimit from "express-rate-limit";
import { 
  createOrder, 
  verifyPayment, 
  webhookHandler,
  getPaymentHistory, 
  checkQuizPayment,
  refundPayment 
} from "../controllers/paymentController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Rate limiting for payment endpoints
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per 15 minutes
  message: {
    success: false,
    message: 'Too many payment requests. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Public webhook endpoint (no auth - Razorpay calls this)
// Use raw body so signature verification works reliably
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  webhookHandler
);

// Protected payment routes with rate limiting
router.post("/create-order", protect, paymentLimiter, createOrder); // create razorpay order
router.post("/verify", protect, paymentLimiter, verifyPayment); // verify signature after checkout
router.get("/history", protect, getPaymentHistory); // get user's payment history
router.get("/quiz-status", protect, checkQuizPayment); // check if user paid for today's quiz
router.post("/refund", protect, refundPayment); // refund payment (placeholder)

export default router;
