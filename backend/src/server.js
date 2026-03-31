import app from "./app.js";
import dotenv from "dotenv";
import { startEscalationJobs } from "./jobs/escalationCron.js";

dotenv.config();

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 API: http://localhost:${PORT}/api`);
  console.log(`❤️  Health: http://localhost:${PORT}/health`);
  
  // Start escalation cron jobs
  startEscalationJobs();
});
