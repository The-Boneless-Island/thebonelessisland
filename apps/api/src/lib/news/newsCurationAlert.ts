// Fire-and-forget Discord alerts for news curation pipeline health.
// Posts to news_curation_alert_webhook_url in server_settings.

import { getAISetting } from "../serverSettings.js";

export type CurationAlertInput = {
  title: string;
  description: string;
  color?: number;
  /** Dedupe key — same key won't fire again within cooldownMs. */
  dedupeKey?: string;
  cooldownMs?: number;
};

const lastSentAt = new Map<string, number>();
const DEFAULT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

function webhookUrl(): string | null {
  const url = getAISetting("news_curation_alert_webhook_url");
  if (!url || !/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//i.test(url)) return null;
  return url;
}

export function isNewsCurationAlertConfigured(): boolean {
  return webhookUrl() !== null;
}

function shouldSendAlert(input: CurationAlertInput): boolean {
  if (!input.dedupeKey) return true;
  const cooldown = input.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const last = lastSentAt.get(input.dedupeKey) ?? 0;
  return Date.now() - last >= cooldown;
}

export async function sendNewsCurationAlert(input: CurationAlertInput): Promise<boolean> {
  const webhook = webhookUrl();
  if (!webhook) return false;
  if (!shouldSendAlert(input)) return false;

  const payload = {
    username: "Nuggie · News",
    embeds: [
      {
        title: input.title.slice(0, 256),
        description: input.description.slice(0, 2000),
        color: input.color ?? 0xfbbf77
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
    if (input.dedupeKey) lastSentAt.set(input.dedupeKey, Date.now());
    return true;
  } catch (err) {
    console.error("[generalNews] curation alert webhook failed:", err);
    return false;
  }
}
