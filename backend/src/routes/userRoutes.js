import express from "express";
import { inviteUser } from "../controllers/userController.js";
import { authenticateUser } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/invite", authenticateUser, inviteUser);

export default router;