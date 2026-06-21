import express from "express";
import { db } from "../db/client.js";
import { recordEvent } from "../lib/activityEvents.js";
import { requireSession, requireParentRole } from "../lib/auth.js";

export const adminOnboardingRouter = express.Router();

/**
 * POST /admin/onboarding/reset-all
 * Parent-gated. Deletes every member's onboarding_version row so the next
 * profile load sees version 0 (absent) and re-triggers the onboarding flow.
 * This is the "re-nag everyone" admin action requested in the onboarding plan.
 */
adminOnboardingRouter.post(
  "/reset-all",
  requireSession,
  requireParentRole,
  async (req, res) => {
    const result = await db.query(
      `DELETE FROM user_client_state WHERE key = 'onboarding_version'`
    );
    const resetCount = result.rowCount ?? 0;
    void recordEvent({
      eventType: "admin.onboarding_reset_all",
      actorDiscordUserId: String(res.locals.userId),
      payload: { resetCount },
    });
    res.json({ ok: true, reset: resetCount });
  }
);
