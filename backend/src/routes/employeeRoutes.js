import express from "express";
import {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  assignManager,
  getMyTeam,
  getMyProfile,
  getManagers
} from "../controllers/employeeController.js";
import { authenticateUser } from "../middleware/authMiddleware.js";

const router = express.Router();

// Employee profile routes
router.get("/me", authenticateUser, getMyProfile);
router.get("/my-team", authenticateUser, getMyTeam);
router.get("/managers", authenticateUser, getManagers);

// Admin routes for employee management
router.get("/", authenticateUser, getEmployees);
router.get("/:id", authenticateUser, getEmployeeById);
router.post("/", authenticateUser, createEmployee);
router.put("/:id", authenticateUser, updateEmployee);
router.delete("/:id", authenticateUser, deleteEmployee);
router.post("/assign-manager", authenticateUser, assignManager);

export default router;
