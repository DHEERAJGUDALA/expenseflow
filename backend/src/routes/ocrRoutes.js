import express from "express";
import {
  scanReceipt,
  uploadAndScanReceipt,
  getSupportedCurrencies
} from "../controllers/ocrController.js";
import { authenticateUser } from "../middleware/authMiddleware.js";

const router = express.Router();

// OCR endpoints
router.post("/scan", authenticateUser, scanReceipt);
router.post("/upload-scan", authenticateUser, uploadAndScanReceipt);
router.get("/supported", getSupportedCurrencies);

export default router;
