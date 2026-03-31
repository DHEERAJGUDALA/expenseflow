import express from "express";
import {
  createExpense,
  getExpenses
} from "../controllers/expenseController.js";
import { authenticateUser } from "../middleware/authMiddleware.js";


const router = express.Router();

router.post("/", authenticateUser, createExpense);
router.get("/", authenticateUser, getExpenses);

export default router;