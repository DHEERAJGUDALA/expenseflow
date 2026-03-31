import express from "express";
import { approveExpense } from "../controllers/approvalController.js";
import { authenticateUser } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/", authenticateUser, approveExpense);

export default router;