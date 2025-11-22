// // backend/routes/authRoutes.js
// backend/routes/authRoutes.js
// backend/routes/authRoutes.js
import express from "express";
import rateLimit from "express-rate-limit";
import {
  sendOtpHandler,
  verifyOtpHandler,
  loginHandler,
  getProfile,
  logoutHandler,
  updateProfile,
  sendEmailOtpHandler,
  verifyEmailOtpHandler,
  forgotPasswordHandler,
  resetPasswordHandler,
  deleteAccountHandler,
  changePasswordHandler,
  getUserPreferencesHandler,
  setUserPreferencesHandler,
} from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";
// import upload from "../middleware/upload.js";
import { uploadImage, uploadPDF } from "../middleware/upload.js";
import { refreshToken, revokeTokens } from "../controllers/tokenController.js";

const router = express.Router();

// --- Rate limits (security) - Phase-1: Stricter limits ---
const otpLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute (Phase-1 requirement)
  max: 1, // 1 request per minute per IP (Phase-1 requirement)
  message: {
    success: false,
    message: 'Please wait 1 minute before requesting another OTP.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Phase-1: Rate limiter for login/register (3 requests per minute)
const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // 3 requests per minute per IP (Phase-1 requirement)
  message: {
    success: false,
    message: 'Too many login attempts. Please try again after 1 minute.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count all requests
});

// --- PHONE OTP (Registration / Login / Forgot) ---
router.post("/send-otp", otpLimiter, sendOtpHandler);
// router.post("/verify-otp", otpLimiter, verifyOtpHandler);
router.post("/verify-otp", verifyOtpHandler);

// --- LOGIN + LOGOUT ---
router.post("/login", loginLimiter, loginHandler);
// Logout should still require auth so it can revoke refresh cookie
router.post("/logout", protect, logoutHandler);

// --- TOKEN MAINTENANCE ---
router.post("/refresh", refreshToken);
router.post("/revoke", protect, revokeTokens);

// --- PROFILE ROUTES ---
router.get("/profile", protect, getProfile);
// router.put("/profile", protect, upload.single("profileImage"), updateProfile);
router.put("/profile", protect, uploadImage.single("profileImage"), updateProfile);


// --- EMAIL OTP ---
// ❗ These should be PUBLIC because new users and "forgot password" flows
// occur before login. Controller already checks for req.user internally.
const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
});
router.post("/send-email-otp", emailLimiter, sendEmailOtpHandler);
router.post("/verify-email-otp", emailLimiter, verifyEmailOtpHandler);

// --- PASSWORD RESET ---
router.post("/forgot-password", otpLimiter, forgotPasswordHandler);
router.post("/reset-password", otpLimiter, resetPasswordHandler);
router.delete("/delete-account", protect, deleteAccountHandler);
// change password (authenticated)
router.post("/change-password", protect, changePasswordHandler);

// user preferences (persisted per-user)
router.get("/user/preferences", protect, getUserPreferencesHandler);
router.post("/user/preferences", protect, setUserPreferencesHandler);

// deletion job status
router.get('/delete-account/status/:jobId', protect, async (req, res) => {
  try {
    const DeletionJob = (await import('../models/DeletionJob.js')).default;
    const job = await DeletionJob.findById(req.params.jobId);
    if (!job) return res.status(404).json({ message: 'Job not found' });
    if (job.user.toString() !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    return res.json({ success: true, job });
  } catch (e) {
    console.error('get job status error', e.message || e);
    return res.status(500).json({ message: 'Failed to get job status' });
  }
});

// Dev-only: fetch last stored email OTP for an address (useful for CI/E2E). Only enabled outside production.
router.get('/dev/email-otp', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') return res.status(404).json({ message: 'Not found' });
    const email = String(req.query.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ message: 'email query required' });
    const { fetchStoredEmailOtp } = await import('../utils/otpService.js');
    const data = await fetchStoredEmailOtp(email);
    if (!data) return res.status(404).json({ message: 'OTP not found or expired' });
    return res.json({ success: true, otp: data.otp, expiresAt: data.expiresAt, attempts: data.attempts });
  } catch (e) {
    console.error('dev email-otp fetch error', e.message || e);
    return res.status(500).json({ message: 'Failed to fetch OTP' });
  }
});

export default router;





// import express from "express";
// import rateLimit from "express-rate-limit";
// import {
//   sendOtpHandler,
//   verifyOtpHandler,
//   loginHandler,
//   getProfile,
//   logoutHandler,
//   updateProfile,
//   sendEmailOtpHandler,
//   verifyEmailOtpHandler,
// } from "../controllers/authController.js";
// import { protect } from "../middleware/authMiddleware.js";
// import upload from "../middleware/upload.js";

// const router = express.Router();

// // Stricter rate limits for OTP endpoints
// const otpLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000,
//   max: 10,
//   standardHeaders: true,
//   legacyHeaders: false,
// });

// router.post("/send-otp", otpLimiter, sendOtpHandler);
// router.post("/verify-otp", otpLimiter, verifyOtpHandler);
// router.post("/login", loginHandler);
// router.post("/logout", logoutHandler);
// router.get("/profile", protect, getProfile);
// router.put("/profile", protect, upload.single("profileImage"), updateProfile);

// // Email OTP routes
// router.post("/send-email-otp", protect, sendEmailOtpHandler);
// router.post("/verify-email-otp", protect, verifyEmailOtpHandler);

// // Refresh token & revoke endpoints
// import { refreshToken, revokeTokens } from "../controllers/tokenController.js";
// router.post("/refresh", refreshToken);
// router.post("/revoke", protect, revokeTokens);

// export default router;
