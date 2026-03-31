import express from "express";
import { authenticateUser } from "../middleware/authMiddleware.js";
import {
  getSpendingTrends,
  getBottleneckReport,
  getApprovalMetrics,
  getDashboardSummary
} from "../controllers/analyticsController.js";

const router = express.Router();

/**
 * GET /api/analytics/dashboard
 * Get all key metrics in one call for the admin dashboard
 * Admin only
 */
router.get("/dashboard", authenticateUser, getDashboardSummary);

/**
 * GET /api/analytics/spending-trends
 * Get monthly spending trends by category
 * Query params: months (default 6)
 * Admin only
 */
router.get("/spending-trends", authenticateUser, getSpendingTrends);

/**
 * GET /api/analytics/bottlenecks
 * Get bottleneck report - stale expenses and approver backlogs
 * Admin only
 */
router.get("/bottlenecks", authenticateUser, getBottleneckReport);

/**
 * GET /api/analytics/approval-metrics
 * Get approval metrics - rates, average times, by approver
 * Query params: days (default 30)
 * Admin only
 */
router.get("/approval-metrics", authenticateUser, getApprovalMetrics);

export default router;
