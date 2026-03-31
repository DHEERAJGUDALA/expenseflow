import express from "express";
import {
  getAllRules,
  getRule,
  createRule,
  updateRule,
  deleteRule,
  getExpenseApprovalStatus,
  processApproval,
  getMyPendingApprovals,
  getMyApprovalHistory
} from "../controllers/workflowController.js";
import { authenticateUser } from "../middleware/authMiddleware.js";

const router = express.Router();

// Approval Rules management (Admin)
router.get("/rules", authenticateUser, getAllRules);              // GET /api/workflows/rules
router.get("/rules/:ruleId", authenticateUser, getRule);          // GET /api/workflows/rules/:ruleId
router.post("/rules", authenticateUser, createRule);              // POST /api/workflows/rules
router.put("/rules/:ruleId", authenticateUser, updateRule);       // PUT /api/workflows/rules/:ruleId
router.delete("/rules/:ruleId", authenticateUser, deleteRule);    // DELETE /api/workflows/rules/:ruleId

// User's approval queue
router.get("/my-pending", authenticateUser, getMyPendingApprovals);  // GET /api/workflows/my-pending
router.get("/my-history", authenticateUser, getMyApprovalHistory);   // GET /api/workflows/my-history

// Expense approval status and actions
router.get("/expense/:expenseId/status", authenticateUser, getExpenseApprovalStatus);  // GET /api/workflows/expense/:id/status
router.post("/expense/:expenseId/approve", authenticateUser, processApproval);         // POST /api/workflows/expense/:id/approve

export default router;
