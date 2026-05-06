import { Router } from "express";
import { getTaglines } from "../lib/taglineGenerator.js";

export const taglinesRouter = Router();

taglinesRouter.get("/", async (_req, res) => {
  try {
    const taglines = await getTaglines();
    res.json({ taglines });
  } catch (err) {
    console.error("[taglines] fetch failed:", err);
    res.json({ taglines: [] });
  }
});
