import express from "express";
import { 
  approveExpense, 
  approveTicket,
  getPendingApprovals,
  getApprovalHistory,
  getSpecialApproverQueue,
  processApprovalWithNotification
} from "../controllers/approvalController.js";
import { 
  getApprovalPreview, 
  checkSubmissionEligibility 
} from "../controllers/approvalPreviewController.js";
import { authenticateUser } from "../middleware/authMiddleware.js";

const router = express.Router();

// GET pending approvals for manager/admin
router.get("/pending", authenticateUser, getPendingApprovals);

// GET special approver queue (parallel approvers)
router.get("/special", authenticateUser, getSpecialApproverQueue);

// GET approval history for current user
router.get("/history", authenticateUser, getApprovalHistory);

// POST approve/reject expense (with notifications)
router.post("/", authenticateUser, processApprovalWithNotification);

// POST legacy ticket approval
router.post("/ticket", authenticateUser, approveTicket);

// GET approval preview (shows who will approve before submission)
router.get("/preview", authenticateUser, getApprovalPreview);

// GET check if user can submit expenses
router.get("/can-submit", authenticateUser, checkSubmissionEligibility);

export default router;
