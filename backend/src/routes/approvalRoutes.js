import express from "express";
import { 
  approveExpense, 
  approveTicket,
  getPendingApprovals,
  getApprovalHistory 
} from "../controllers/approvalController.js";
import { authenticateUser } from "../middleware/authMiddleware.js";

const router = express.Router();

// GET pending approvals for manager/admin
router.get("/pending", authenticateUser, getPendingApprovals);

// GET approval history for current user
router.get("/history", authenticateUser, getApprovalHistory);

// POST approve/reject expense
router.post("/", authenticateUser, approveExpense);

// POST legacy ticket approval
router.post("/ticket", authenticateUser, approveTicket);

export default router;
