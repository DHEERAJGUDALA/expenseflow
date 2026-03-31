import express from "express";
import {
  createExpense,
  getExpenses,
  getMyExpenses,
  getExpenseById,
  updateExpense,
  deleteExpense,
  getExpenseStats,
  getConversionRate
} from "../controllers/expenseController.js";
import { authenticateUser } from "../middleware/authMiddleware.js";

const router = express.Router();

// Employee expense routes
router.get("/my-expenses", authenticateUser, getMyExpenses);
router.get("/stats", authenticateUser, getExpenseStats);
router.get("/convert", authenticateUser, getConversionRate);

// CRUD operations
router.post("/", authenticateUser, createExpense);
router.get("/", authenticateUser, getExpenses);
router.get("/:id", authenticateUser, getExpenseById);
router.put("/:id", authenticateUser, updateExpense);
router.delete("/:id", authenticateUser, deleteExpense);

export default router;
