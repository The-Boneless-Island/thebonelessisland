// Fire-and-forget Discord announcement for new forum threads.
// Posts to the webhook URL stored in server_settings (forums_discord_webhook_url).
// Never throws to the caller; a missing/empty webhook is a silent no-op.

import { env } from "../config.js";
import { getAISetting } from "./serverSettings.js";

const TYPE_LABEL: Record<string, string> = {
  discussion: "discussion",
  memory: "memory",
  recommendation: "recommendation",
  resource: "resource"
};

const TYPE_COLOR: Record<string, number> = {
  discussion: 0x38bdf8,
  memory: 0xa855f7,
  recommendation: 0xfbbf77,
  resource: 0x4ade80
};

function webOrigin(): string {
  const o = env.WEB_ORIGIN as unknown;
  if (Array.isArray(o)) return String(o[0] ?? "");
  return String(o ?? "");
}

export type AnnounceInput = {
  threadId: number;
  title: string;
  threadType: string;
  categoryName: string;
  authorName: string;
  bodyPreview?: string;
  linkUrl?: string | null;
};

export async function announceNewThread(input: AnnounceInput): Promise<void> {
  const webhook = getAISetting("forums_discord_webhook_url");
  if (!webhook || !/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//i.test(webhook)) return;

  const origin = webOrigin().replace(/\/+$/, "");
  const threadUrl = origin ? `${origin}/forums/thread/${input.threadId}` : undefined;
  const label = TYPE_LABEL[input.threadType] ?? "post";
  const color = TYPE_COLOR[input.threadType] ?? 0x38bdf8;

  const descParts = [`New ${label} in **${input.categoryName}** by ${input.authorName}`];
  if (input.bodyPreview) descParts.push("", input.bodyPreview.slice(0, 280));
  if (input.linkUrl) descParts.push("", input.linkUrl);

  const payload = {
    username: "Nuggie",
    embeds: [
      {
        title: input.title.slice(0, 256),
        ...(threadUrl ? { url: threadUrl } : {}),
        description: descParts.join("\n").slice(0, 1000),
        color
      }
    ]
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    }).finally(() => clearTimeout(timer));
  } catch (err) {
    console.error("[forums] Discord announce failed:", err);
  }
}
