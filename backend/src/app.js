import express from "express";
import cors from "cors";

import userRoutes from "./routes/userRoutes.js";
import expenseRoutes from "./routes/expenseRoutes.js";
import approvalRoutes from "./routes/approvalRoutes.js";
import approvalRuleRoutes from "./routes/approvalRuleRoutes.js";
import managerRoutes from "./routes/managerRoutes.js";
import employeeRoutes from "./routes/employeeRoutes.js";
import ocrRoutes from "./routes/ocrRoutes.js";
import workflowRoutes from "./routes/workflowRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import companyRoutes from "./routes/companyRoutes.js";
import paymentCycleRoutes from "./routes/paymentCycleRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import escalationRoutes from "./routes/escalationRoutes.js";

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" })); // Increased limit for base64 images

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api/users", userRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/approvals", approvalRoutes);
app.use("/api/approval-rules", approvalRuleRoutes);
app.use("/api/manager", managerRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/ocr", ocrRoutes);
app.use("/api/workflows", workflowRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/payment-cycles", paymentCycleRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/escalation", escalationRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({ 
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

export default app;
