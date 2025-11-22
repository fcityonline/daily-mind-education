// // backend/routes/adminAuthRoutes.js

// backend/routes/adminAuthRoutes.js
import express from "express";
import {
  sendAdminOtp,
  verifyAdminOtp,
  adminLogin,
  adminLogout,
  getAdminProfile,
  updateAdminProfile,
  forgotAdminPasswordHandler,
  resetAdminPasswordHandler,
} from "../controllers/adminAuthController.js";
import { protect } from "../middleware/authMiddleware.js";
// import upload from "../middleware/upload.js";
import { uploadImage, uploadPDF } from "../middleware/upload.js";
import { refreshAdminToken, revokeAdminTokens } from "../controllers/tokenController.js";

const router = express.Router();

// Rate limiting for OTP endpoints
import rateLimit from "express-rate-limit";

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

// Import email OTP handlers from authController (reuse same logic)
import { sendEmailOtpHandler } from "../controllers/authController.js";

// Public admin routes
router.post("/send-otp", otpLimiter, sendAdminOtp);
router.post("/verify-otp", otpLimiter, verifyAdminOtp);
router.post("/send-email-otp", otpLimiter, sendEmailOtpHandler); // Reuse user email OTP handler
router.post("/login", adminLogin);
router.post("/logout", adminLogout);

// Password reset routes
router.post("/forgot-password", otpLimiter, forgotAdminPasswordHandler);
router.post("/reset-password", otpLimiter, resetAdminPasswordHandler);

// Token maintenance
router.post("/refresh", refreshAdminToken);
router.post("/revoke", protect, revokeAdminTokens);

// Protected admin routes
router.get("/profile", protect, getAdminProfile);
// router.put("/profile", protect, upload.single("profileImage"), updateAdminProfile);
router.put("/profile", protect, uploadImage.single("profileImage"), updateAdminProfile);


export default router;


// import express from "express";
// import {
//   sendAdminOtp,
//   verifyAdminOtp,
//   adminLogin,
//   adminLogout,
//   getAdminProfile,
//   updateAdminProfile,
// } from "../controllers/adminAuthController.js";
// import { protect } from "../middleware/authMiddleware.js";
// import upload from "../middleware/upload.js";

// const router = express.Router();

// // Public admin auth routes
// router.post("/send-otp", sendAdminOtp);
// router.post("/verify-otp", verifyAdminOtp);
// router.post("/login", adminLogin);
// router.post("/logout", adminLogout);

// // Protected admin routes
// router.get("/profile", protect, getAdminProfile);
// router.put("/profile", protect, upload.single("profileImage"), updateAdminProfile);

// export default router;
