// backend/routes/reportRoutes.js
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import * as reportCtrl from "../controllers/reportController.js";

const router = express.Router();

// Protected user routes
router.post("/user", protect, reportCtrl.reportUser); // Report a user/blog
router.post("/block", protect, reportCtrl.blockUser); // Block a user
router.post("/unblock", protect, reportCtrl.unblockUser); // Unblock a user
router.get("/blocked", protect, reportCtrl.getBlockedUsers); // Get blocked users
router.get("/check/:userId", protect, reportCtrl.checkIfBlocked); // Check if user is blocked

// Admin routes
router.get("/admin/all", protect, reportCtrl.getAllReports); // Get all reports (admin only)
router.put("/admin/:reportId", protect, reportCtrl.updateReportStatus); // Update report status (admin only)

export default router;

