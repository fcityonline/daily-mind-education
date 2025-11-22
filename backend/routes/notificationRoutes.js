import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getNotifications,
  markAsRead,
  markAllAsRead
} from "../controllers/notificationController.js";

const router = express.Router();

router.get("/", protect, getNotifications);
router.patch("/read/:id", protect, markAsRead);
router.patch("/read-all", protect, markAllAsRead);

export default router;
