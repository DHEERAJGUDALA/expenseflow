import express from "express";
import { authenticateUser } from "../middleware/authMiddleware.js";
import {
  getMyNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount
} from "../controllers/notificationController.js";

const router = express.Router();

/**
 * GET /api/notifications
 * Get user's notifications
 * Query params: limit, unread_only
 */
router.get("/", authenticateUser, getMyNotifications);

/**
 * GET /api/notifications/unread-count
 * Get unread notification count
 */
router.get("/unread-count", authenticateUser, getUnreadCount);

/**
 * PUT /api/notifications/:notificationId/read
 * Mark a notification as read
 */
router.put("/:notificationId/read", authenticateUser, markAsRead);

/**
 * PUT /api/notifications/read-all
 * Mark all notifications as read
 */
router.put("/read-all", authenticateUser, markAllAsRead);

export default router;
