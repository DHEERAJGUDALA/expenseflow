import cron from "node-cron";
import { processEscalations, autoExpireLeaveStatus } from "../services/escalationService.js";

/**
 * ESCALATION CRON JOBS
 * 
 * 1. Process Escalations - Runs every hour
 *    - Escalates approvals pending > 15 days (timeout)
 *    - Escalates approvals where manager is on leave
 * 
 * 2. Auto-Expire Leave - Runs daily at midnight
 *    - Removes leave status when end date has passed
 */

let escalationJob = null;
let leaveExpirationJob = null;

/**
 * Start escalation cron jobs
 */
export function startEscalationJobs() {
  console.log("🕐 Starting escalation cron jobs...");

  // Job 1: Process escalations every hour
  // Cron: "0 * * * *" = At minute 0 of every hour
  escalationJob = cron.schedule("0 * * * *", async () => {
    console.log("🔄 [CRON] Running escalation processor...");
    try {
      const result = await processEscalations();
      console.log(`✅ [CRON] Escalation complete: ${result.escalated} escalated, ${result.failed} failed`);
    } catch (error) {
      console.error("❌ [CRON] Escalation failed:", error);
    }
  });

  // Job 2: Auto-expire leave status daily at midnight
  // Cron: "0 0 * * *" = At 00:00 every day
  leaveExpirationJob = cron.schedule("0 0 * * *", async () => {
    console.log("🔄 [CRON] Auto-expiring leave statuses...");
    try {
      await autoExpireLeaveStatus();
      console.log("✅ [CRON] Leave expiration complete");
    } catch (error) {
      console.error("❌ [CRON] Leave expiration failed:", error);
    }
  });

  console.log("✅ Escalation cron jobs started:");
  console.log("   - Escalation processor: Every hour at minute 0");
  console.log("   - Leave expiration: Daily at midnight");
}

/**
 * Stop escalation cron jobs
 */
export function stopEscalationJobs() {
  if (escalationJob) {
    escalationJob.stop();
    console.log("⏹️  Stopped escalation processor job");
  }
  if (leaveExpirationJob) {
    leaveExpirationJob.stop();
    console.log("⏹️  Stopped leave expiration job");
  }
}

/**
 * Run escalation immediately (for manual trigger or testing)
 */
export async function runEscalationNow() {
  console.log("🔄 Running immediate escalation...");
  try {
    const result = await processEscalations();
    console.log(`✅ Immediate escalation complete: ${result.escalated} escalated, ${result.failed} failed`);
    return result;
  } catch (error) {
    console.error("❌ Immediate escalation failed:", error);
    throw error;
  }
}

/**
 * Run leave expiration immediately (for manual trigger or testing)
 */
export async function runLeaveExpirationNow() {
  console.log("🔄 Running immediate leave expiration...");
  try {
    await autoExpireLeaveStatus();
    console.log("✅ Immediate leave expiration complete");
  } catch (error) {
    console.error("❌ Immediate leave expiration failed:", error);
    throw error;
  }
}
