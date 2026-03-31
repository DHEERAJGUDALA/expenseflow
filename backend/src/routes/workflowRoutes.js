import express from "express";
import {
  getAllWorkflows,
  getWorkflowForEmployee,
  createWorkflow,
  deleteWorkflow,
  getExpenseApprovalStatus,
  processApproval
} from "../controllers/workflowController.js";
import { authenticateUser } from "../middleware/authMiddleware.js";

const router = express.Router();

// Workflow management (Admin)
router.get("/", authenticateUser, getAllWorkflows);
router.get("/employee/:employeeId", authenticateUser, getWorkflowForEmployee);
router.post("/", authenticateUser, createWorkflow);
router.delete("/:id", authenticateUser, deleteWorkflow);

// Expense approval status and actions
router.get("/expense/:expenseId/status", authenticateUser, getExpenseApprovalStatus);
router.post("/expense/:expenseId/process", authenticateUser, processApproval);

export default router;
