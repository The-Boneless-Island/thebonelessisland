import express from "express";
import { requireSession, requireAdminRole } from "../lib/auth.js";
import { buildAndStoreWeeklyDigest, getLatestDigest } from "../lib/weeklyDigest.js";

export const digestRouter = express.Router();

digestRouter.get("/latest", requireSession, async (_req, res) => {
  const payload = await getLatestDigest();
  if (!payload) {
    res.status(204).end();
    return;
  }
  res.json(payload);
});

digestRouter.post("/run", requireAdminRole, async (_req, res) => {
  const payload = await buildAndStoreWeeklyDigest();
  res.json(payload);
});
