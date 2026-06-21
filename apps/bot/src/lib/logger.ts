// Secret-redacting logger — same implementation as apps/api/src/lib/logger.ts

const SECRET_KEY_PATTERN = /(_TOKEN|_SECRET|_KEY|_PASSWORD)$/i;
const MIN_SECRET_LENGTH = 12;

let installed = false;
const SECRETS: string[] = [];

export function installRedactor(): void {
  if (installed) return;
  installed = true;

  for (const [key, value] of Object.entries(process.env)) {
    if (!value || value.length < MIN_SECRET_LENGTH) continue;
    if (SECRET_KEY_PATTERN.test(key)) {
      SECRETS.push(value);
    }
    if (key === "DATABASE_URL") {
      const match = value.match(/^[a-z+]+:\/\/[^:@]+:([^@]+)@/i);
      if (match && match[1].length >= 4) SECRETS.push(match[1]);
    }
  }
  SECRETS.sort((a, b) => b.length - a.length);

  const methods = ["log", "error", "warn", "info", "debug"] as const;
  for (const m of methods) {
    const original = console[m].bind(console);
    console[m] = (...args: unknown[]) => {
      original(...args.map(redact));
    };
  }
}

function redact(value: unknown): unknown {
  if (typeof value === "string") return scrub(value);
  if (value instanceof Error) {
    const next = new Error(scrub(value.message));
    if (value.stack) next.stack = scrub(value.stack);
    if (value.cause !== undefined) (next as Error & { cause?: unknown }).cause = redact(value.cause);
    return next;
  }
  if (value && typeof value === "object") {
    try {
      return JSON.parse(scrub(JSON.stringify(value)));
    } catch {
      return scrub(String(value));
    }
  }
  return value;
}

function scrub(text: string): string {
  if (SECRETS.length === 0) return text;
  let out = text;
  for (const secret of SECRETS) {
    if (out.includes(secret)) {
      out = out.split(secret).join("[REDACTED]");
    }
  }
  return out;
}
