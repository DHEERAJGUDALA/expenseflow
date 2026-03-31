import express from "express";
import { authenticateUser } from "../middleware/authMiddleware.js";
import {
  createPaymentCycle,
  getPaymentCycles,
  getPaymentCycleDetails,
  processPayments,
  addExpensesToCycle
} from "../controllers/paymentCycleController.js";

const router = express.Router();

/**
 * POST /api/payment-cycles
 * Create a new payment cycle with a process date
 * Auto-queues all approved expenses not yet in a cycle
 * Admin only
 */
router.post("/", authenticateUser, createPaymentCycle);

/**
 * GET /api/payment-cycles
 * Get all payment cycles for the company
 * Admin only
 */
router.get("/", authenticateUser, getPaymentCycles);

/**
 * GET /api/payment-cycles/:cycleId
 * Get payment cycle details with all queued expenses
 * Admin only
 */
router.get("/:cycleId", authenticateUser, getPaymentCycleDetails);

/**
 * POST /api/payment-cycles/:cycleId/process
 * Process payments - marks cycle as COMPLETED and all expenses as PAID
 * Creates audit log entry
 * Admin only
 */
router.post("/:cycleId/process", authenticateUser, processPayments);

/**
 * POST /api/payment-cycles/:cycleId/add-expenses
 * Add more approved expenses to an UPCOMING cycle
 * Admin only
 */
router.post("/:cycleId/add-expenses", authenticateUser, addExpensesToCycle);

export default router;
