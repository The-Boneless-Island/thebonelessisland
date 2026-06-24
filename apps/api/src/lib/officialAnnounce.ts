import { db } from "../db/client.js";
import { env } from "../config.js";
import { getAISetting } from "./serverSettings.js";

export function officialThreadUrl(threadId: number): string {
  const raw = env.WEB_ORIGIN as unknown;
  const origin = (Array.isArray(raw) ? String(raw[0] ?? "") : String(raw ?? "")).replace(/\/+$/, "");
  return origin ? `${origin}/forums/thread/${threadId}` : "";
}

export function officialAnnouncementsEnabled(): boolean {
  return getAISetting("official_announcements_enabled") === "true";
}

export async function enqueueOfficialAnnouncementCreate(input: {
  threadId: number;
  title: string;
  bodyPreview: string;
  authorName: string;
}): Promise<void> {
  if (!officialAnnouncementsEnabled()) return;
  if (!getAISetting("official_announcements_channel_id")?.trim()) return;

  await db.query(
    `INSERT INTO bot_announcements (kind, payload) VALUES ('forum.official_announcement', $1::jsonb)`,
    [
      JSON.stringify({
        threadId: input.threadId,
        title: input.title,
        bodyPreview: input.bodyPreview,
        authorName: input.authorName,
        threadUrl: officialThreadUrl(input.threadId),
      }),
    ]
  );
}

export async function enqueueOfficialAnnouncementUpdate(input: {
  threadId: number;
  title: string;
  bodyPreview: string;
  authorName: string;
  messageId: string;
  channelId: string;
}): Promise<void> {
  if (!officialAnnouncementsEnabled()) return;

  await db.query(
    `INSERT INTO bot_announcements (kind, payload) VALUES ('forum.official_announcement.updated', $1::jsonb)`,
    [
      JSON.stringify({
        threadId: input.threadId,
        title: input.title,
        bodyPreview: input.bodyPreview,
        authorName: input.authorName,
        threadUrl: officialThreadUrl(input.threadId),
        messageId: input.messageId,
        channelId: input.channelId,
      }),
    ]
  );
}
