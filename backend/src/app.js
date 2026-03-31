import express from "express";
import cors from "cors";

import userRoutes from "./routes/userRoutes.js";
import expenseRoutes from "./routes/expenseRoutes.js";
import approvalRoutes from "./routes/approvalRoutes.js";
import employeeRoutes from "./routes/employeeRoutes.js";
import ocrRoutes from "./routes/ocrRoutes.js";
import workflowRoutes from "./routes/workflowRoutes.js";

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
app.use("/api/employees", employeeRoutes);
app.use("/api/ocr", ocrRoutes);
app.use("/api/workflows", workflowRoutes);

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
