// Per-setting metadata for the admin redesign.
// Every key in `server_settings` should have a matching entry here so the
// admin UI can render the comprehension layer (label / what / when / example)
// and the risk layer (danger zone + typed confirm) consistently.

import { SITE_BRAND_NAME } from "@island/shared";

export type SettingDomain = "people" | "content" | "engagement" | "system";
export type DangerLevel = "low" | "medium" | "high";
export type SettingInputType = "string" | "number" | "boolean" | "password" | "select" | "csv" | "textarea";

export type SettingMeta = {
  key: string;
  label: string;
  description: string;
  whenToChange: string;
  example?: string;
  ifWrong?: string;
  tags: string[];
  dangerLevel: DangerLevel;
  domain: SettingDomain;
  type: SettingInputType;
  selectOptions?: { value: string; label: string }[];
  confirmPhrase?: string;
};

const RAW: SettingMeta[] = [
  // ── People · Discord identity ────────────────────────────────────────────
  {
    key: "discord_guild_id",
    label: "Discord Server ID",
    description: "The numeric ID of the Discord server this app is gated to. Only members of this server can sign in.",
    whenToChange: "When you migrate the community to a different Discord server, or when first installing the app.",
    example: "1234567890123456789",
    ifWrong: "Nobody will be able to log in until the value is fixed at the database level. The app will reject all Discord OAuth callbacks.",
    tags: ["discord", "guild", "server", "id", "oauth", "login", "access"],
    dangerLevel: "high",
    domain: "people",
    type: "string",
    confirmPhrase: "change-server"
  },
  {
    key: "guild_display_name",
    label: "Server Display Name",
    description: "A friendly label for the Discord server shown in the admin panel header. No functional effect.",
    whenToChange: "When the community renames itself, or to make the admin panel header less generic.",
    example: SITE_BRAND_NAME,
    tags: ["discord", "name", "label", "branding"],
    dangerLevel: "low",
    domain: "people",
    type: "string"
  },
  {
    key: "parent_role_name",
    label: "Admin Role Name",
    description: "The exact Discord role name whose holders get admin access here. Case-sensitive.",
    whenToChange: "When the role you use for admins is renamed in Discord, or when promoting a different role to admin.",
    example: "Parent",
    ifWrong: "Every current admin will lose access on next login. You'll need DB access to restore the value if you lock yourself out.",
    tags: ["discord", "role", "admin", "permission", "access"],
    dangerLevel: "high",
    domain: "people",
    type: "string",
    confirmPhrase: "change-admin-role"
  },

  // ── System · AI provider ─────────────────────────────────────────────────
  {
    key: "ai_enabled",
    label: "AI features enabled",
    description: "Master switch for every AI-powered feature on the island (news curation, summaries, recommendations).",
    whenToChange: "Toggle off to instantly stop all AI calls (and their cost). Toggle on once a provider and key are configured.",
    tags: ["ai", "toggle", "master", "switch", "kill"],
    dangerLevel: "low",
    domain: "system",
    type: "boolean"
  },
  {
    key: "ai_provider",
    label: "AI provider",
    description: "Which LLM service to use for AI features. Amazon Bedrock needs NO API key — it authenticates via the server's AWS IAM role.",
    whenToChange: "When switching between Anthropic, OpenAI, Gemini, and Amazon Bedrock (e.g. cost, quality, or contractual reasons).",
    ifWrong: "If the matching API key isn't set for the new provider, all AI features will fail until a working key is provided. (Amazon Bedrock uses the server's AWS IAM role instead of a key.)",
    tags: ["ai", "provider", "anthropic", "openai", "gemini", "google", "bedrock", "aws", "llm"],
    dangerLevel: "high",
    domain: "system",
    type: "select",
    selectOptions: [
      { value: "anthropic", label: "Anthropic (Claude)" },
      { value: "openai", label: "OpenAI (GPT)" },
      { value: "gemini", label: "Google (Gemini)" },
      { value: "bedrock", label: "Amazon Bedrock (Claude / Nova — IAM, no key)" }
    ],
    confirmPhrase: "switch-provider"
  },
  {
    key: "ai_model",
    label: "AI model",
    description: "Specific model name for the selected provider. Leave blank to use the provider default. For Amazon Bedrock this is a Bedrock model id (e.g. anthropic.claude-haiku-4-5, amazon.nova-lite-v1:0, or amazon.nova-micro-v1:0) rather than the bare model name used for the other providers.",
    whenToChange: "When tuning cost vs quality, or when a new model becomes available you want to try.",
    example: "claude-haiku-4-5 (Anthropic) or amazon.nova-lite-v1:0 (Bedrock)",
    tags: ["ai", "model", "claude", "gpt", "haiku", "sonnet", "opus", "nova", "bedrock"],
    dangerLevel: "low",
    domain: "system",
    type: "string"
  },
  {
    key: "ai_api_key",
    label: "AI API key (legacy fallback)",
    description: "Legacy shared API key. Used only when the per-provider slot for the active provider is empty. Prefer setting anthropic_api_key / openai_api_key / gemini_api_key instead.",
    whenToChange: "Generally don't — fill the per-provider key instead. Keep blank unless migrating from an older install.",
    ifWrong: "All AI features will fail when no per-provider key is set. A wrong key may rack up failed-call costs.",
    tags: ["ai", "api", "key", "secret", "credential", "legacy"],
    dangerLevel: "high",
    domain: "system",
    type: "password",
    confirmPhrase: "rotate-key"
  },
  {
    key: "anthropic_api_key",
    label: "Anthropic API key",
    description: "Stored encrypted; never displayed after saving. Used whenever an Anthropic (Claude) model is selected. Independent of the OpenAI and Gemini keys.",
    whenToChange: "When rotating the key, or first configuring Claude as a provider.",
    ifWrong: "Anthropic-backed features fail. Other providers still work if their keys are set.",
    tags: ["ai", "anthropic", "claude", "api", "key", "secret"],
    dangerLevel: "high",
    domain: "system",
    type: "password",
    confirmPhrase: "rotate-key"
  },
  {
    key: "openai_api_key",
    label: "OpenAI API key",
    description: "Stored encrypted; never displayed after saving. Optional — used for OpenAI (GPT) chat models and as a fallback embedding provider when Bedrock is not selected.",
    whenToChange: "When rotating the key, or first configuring GPT as chat provider.",
    ifWrong: "OpenAI chat features fail. Embeddings use Bedrock Titan when ai_provider is bedrock.",
    tags: ["ai", "openai", "gpt", "embeddings", "api", "key", "secret"],
    dangerLevel: "high",
    domain: "system",
    type: "password",
    confirmPhrase: "rotate-key"
  },
  {
    key: "ai_daily_cost_warn_usd",
    label: "AI daily cost warning threshold (USD)",
    description: "When estimated AI spend for today crosses this dollar amount, admin pages surface a warning banner. Warn-only — does not block AI calls. Set to 0 to disable the banner.",
    whenToChange: "Raise after the system genuinely needs more headroom (e.g. larger active corpus). Lower to tighten cost discipline. Default $5 fits typical Gemini Flash Lite daily ops with ~100× headroom.",
    example: "5.00",
    tags: ["ai", "cost", "budget", "warn", "threshold"],
    dangerLevel: "low",
    domain: "system",
    type: "number"
  },
  {
    key: "gemini_api_key",
    label: "Google Gemini API key",
    description: "Stored encrypted; never displayed after saving. Used whenever a Google Gemini model is selected. Independent of the Anthropic and OpenAI keys.",
    whenToChange: "When rotating the key, or first configuring Gemini as a provider.",
    ifWrong: "Gemini-backed features fail. Other providers still work if their keys are set.",
    tags: ["ai", "google", "gemini", "api", "key", "secret"],
    dangerLevel: "high",
    domain: "system",
    type: "password",
    confirmPhrase: "rotate-key"
  },
  {
    key: "bedrock_region",
    label: "Bedrock region",
    description: "AWS region for Amazon Bedrock (chat curation + Titan embeddings). Defaults to us-east-1.",
    whenToChange: "When your Bedrock model access or quota lives in a different AWS region than us-east-1.",
    example: "us-east-1",
    tags: ["ai", "bedrock", "aws", "region"],
    dangerLevel: "medium",
    domain: "system",
    type: "string"
  },
  {
    key: "bedrock_model_curation",
    label: "Bedrock curation model",
    description:
      "Model id for news curation (long JSON summaries). When blank and Bedrock is active, defaults to Claude Haiku — best for 300–500 word cards. Leave ai_model on Nova if you want cheap chat while curation stays on Claude.",
    whenToChange: "When news summaries are too short or off-topic — switch curation to Claude Haiku/Sonnet even if ai_model is Nova.",
    example: "global.anthropic.claude-haiku-4-5-20251001-v1:0",
    tags: ["ai", "bedrock", "curation", "news", "claude", "haiku", "model"],
    dangerLevel: "low",
    domain: "system",
    type: "string"
  },
  {
    key: "bedrock_model_chat",
    label: "Bedrock chat model",
    description: "Model id for Nuggie AI chat. When blank, falls back to ai_model, then Nova Lite.",
    whenToChange: "When tuning chat quality vs cost separately from news curation.",
    example: "global.amazon.nova-2-lite-v1:0",
    tags: ["ai", "bedrock", "chat", "nuggie", "nova", "model"],
    dangerLevel: "low",
    domain: "system",
    type: "string"
  },
  {
    key: "bedrock_model_light",
    label: "Bedrock light tasks model",
    description: "Model id for validation repair, taglines, and blurbs. When blank, defaults to Nova Lite.",
    whenToChange: "When light repair passes fail or you want them on Haiku instead.",
    example: "global.amazon.nova-2-lite-v1:0",
    tags: ["ai", "bedrock", "repair", "tagline", "nova", "model"],
    dangerLevel: "low",
    domain: "system",
    type: "string"
  },

  // ── System · Cloudflare AI Gateway ──────────────────────────────────────
  {
    key: "ai_gateway_enabled",
    label: "Cloudflare AI Gateway",
    description: "When on, all AI calls route through a Cloudflare AI Gateway — giving you a unified cost dashboard, request caching, and an edge spend limit. Your own provider keys are used as-is; there is no token markup. Off = direct calls to the provider.",
    whenToChange: "Turn on once you have a gateway configured (account ID + gateway ID set below). Toggle off to bypass the gateway temporarily without touching any keys.",
    tags: ["ai", "cloudflare", "gateway", "cost", "cache", "toggle"],
    dangerLevel: "medium",
    domain: "system",
    type: "boolean"
  },
  {
    key: "ai_gateway_token",
    label: "Cloudflare AI Gateway token",
    description: "The cf-aig-authorization bearer token for an Authenticated Gateway. Stored encrypted; never shown after saving. Required only when your gateway has authentication enabled.",
    whenToChange: "When first enabling gateway authentication, or when rotating a compromised token.",
    ifWrong: "Authenticated gateway calls will be rejected with 401. Disable auth on the gateway or provide a valid token.",
    tags: ["ai", "cloudflare", "gateway", "token", "secret", "credential", "bearer"],
    dangerLevel: "high",
    domain: "system",
    type: "password",
    confirmPhrase: "rotate-key"
  },
  {
    key: "ai_gateway_account_id",
    label: "Cloudflare account ID",
    description: "Cloudflare account ID used to build the AI Gateway base URL. Find it on the Cloudflare dashboard overview page. Pre-filled on first deploy; rarely needs changing.",
    whenToChange: "Only if you migrate the gateway to a different Cloudflare account.",
    example: "3764b4b090876b4293200d6b5d5e3e8c",
    tags: ["ai", "cloudflare", "gateway", "account", "id"],
    dangerLevel: "low",
    domain: "system",
    type: "string"
  },
  {
    key: "ai_gateway_id",
    label: "AI Gateway name / ID",
    description: "The AI Gateway name as shown in the Cloudflare dashboard. Used alongside the account ID to construct the gateway base URL.",
    whenToChange: "If you rename the gateway in Cloudflare or point to a different gateway slug.",
    example: "boneless-news",
    tags: ["ai", "cloudflare", "gateway", "id", "slug", "name"],
    dangerLevel: "low",
    domain: "system",
    type: "string"
  },

  // ── System · Provider-agnostic model overrides ───────────────────────────
  {
    key: "ai_embedding_model",
    label: "Embedding model",
    description: "Model used for article embeddings (semantic dedup and Reddit enrichment). Blank defaults to text-embedding-3-large via OpenAI (3072 dims). The active model MUST emit 3072 dimensions — text-embedding-3-large and gemini-embedding-001 qualify; Titan v2 (1024 dims) does not. Changing this invalidates stored vectors and requires a full re-embed run.",
    whenToChange: "Only when switching embedding providers intentionally. Mismatched dims will corrupt similarity search until all vectors are re-embedded.",
    example: "text-embedding-3-large",
    ifWrong: "Stored vectors become incompatible with new embeddings. Semantic dedup and enrichment degrade or fail until a full re-embed completes.",
    tags: ["ai", "embedding", "model", "semantic", "dedup", "reddit", "vector", "dims"],
    dangerLevel: "medium",
    domain: "system",
    type: "string"
  },
  {
    key: "ai_monthly_budget_usd",
    label: "Monthly AI budget (USD)",
    description: "Soft cap on estimated AI spend per calendar month. When month-to-date spend hits this amount, news curation pauses gracefully — the feed still serves existing cards. Fail-open: a budget tracking error will not block calls. The Cloudflare gateway Spend Limit is the harder backstop if you need a hard ceiling.",
    whenToChange: "Raise after a corpus expansion or if curation stalls early in the month. Lower to tighten cost discipline. Default 10.",
    example: "10",
    tags: ["ai", "budget", "cost", "monthly", "cap", "spend", "limit"],
    dangerLevel: "low",
    domain: "system",
    type: "number"
  },
  {
    key: "ai_model_curation",
    label: "Curation model override",
    description: "Provider-agnostic model for news curation (long JSON summaries). Blank uses the active provider's default — for Gemini that is gemini-2.5-flash. For provider-specific tuning, prefer the Bedrock curation model slot when Bedrock is active.",
    whenToChange: "When tuning curation quality or cost across providers without editing the per-provider slot.",
    example: "gemini-2.5-flash",
    tags: ["ai", "curation", "model", "news", "provider", "override"],
    dangerLevel: "low",
    domain: "system",
    type: "string"
  },
  {
    key: "ai_model_chat",
    label: "Chat model override",
    description: "Provider-agnostic model for Nuggie AI chat. Blank uses the active provider's default — for Gemini that is gemini-2.5-flash-lite.",
    whenToChange: "When you want the chat model to differ from whatever the provider default is.",
    example: "gemini-2.5-flash-lite",
    tags: ["ai", "chat", "nuggie", "model", "provider", "override"],
    dangerLevel: "low",
    domain: "system",
    type: "string"
  },
  {
    key: "ai_model_light",
    label: "Light tasks model override",
    description: "Provider-agnostic model for light workloads: validation repair, taglines, and blurbs. Blank uses the active provider's default — for Gemini that is gemini-2.5-flash-lite.",
    whenToChange: "When you want light repair passes on a different model than the provider default.",
    example: "gemini-2.5-flash-lite",
    tags: ["ai", "model", "repair", "tagline", "blurb", "light", "provider", "override"],
    dangerLevel: "low",
    domain: "system",
    type: "string"
  },

  // ── Content · News pipeline ──────────────────────────────────────────────
  {
    key: "news_general_enabled",
    label: "External news feed",
    description: "Master toggle for the external gaming news feed shown on the home page. When off, only Steam game news appears.",
    whenToChange: "Turn off to quiet the home page feed; turn on when you want curated outside news on the dashboard.",
    tags: ["news", "feed", "external", "home", "toggle"],
    dangerLevel: "low",
    domain: "content",
    type: "boolean"
  },
  {
    key: "news_rss_sources",
    label: "RSS news sources",
    description: "Which RSS feeds the news ingester pulls from. Comma-separated keys.",
    whenToChange: "When adding a new outlet to the rotation, or removing one that's gone stale or off-topic.",
    example: "pcgamer,rockpapershotgun,eurogamer,kotaku,ign",
    tags: ["news", "rss", "sources", "feeds", "outlets"],
    dangerLevel: "low",
    domain: "content",
    type: "csv"
  },
  {
    key: "newsapi_key",
    label: "GNews API key",
    description: "Optional GNews.io key for external gaming news queries. Free tier: 100 requests/day.",
    whenToChange: "When you want to supplement RSS with GNews search, or when rotating a stale key.",
    tags: ["news", "gnews", "api", "key", "external"],
    dangerLevel: "low",
    domain: "content",
    type: "password"
  },
  {
    key: "news_dev_cap",
    label: "Developer diversity cap",
    description: "Max number of news items per game developer in any ingestion batch. Lower = more variety.",
    whenToChange: "Raise to surface more from a single major release; lower to spread coverage across more studios.",
    example: "5",
    tags: ["news", "diversity", "cap", "developer", "limit"],
    dangerLevel: "low",
    domain: "content",
    type: "number"
  },
  {
    key: "news_curation_alert_webhook_url",
    label: "News curation alert webhook",
    description:
      "Discord webhook URL for news pipeline alerts (zero-curate ingests, validation spikes, periodic backlog sweep). Empty = off — degraded state only logs to Sentry/server logs.",
    whenToChange:
      "Set a Parents-only Discord channel webhook so you're pinged when curation stalls or backlogs grow. Alerts dedupe (6–12h cooldown).",
    tags: ["news", "discord", "webhook", "alert", "curation"],
    dangerLevel: "low",
    domain: "content",
    type: "password"
  },
  {
    key: "news_retention_hot_days",
    label: "Hot tier window (days)",
    description:
      "Stories younger than this live on the hot shelf: full article text, Bedrock embeddings, and eligibility for automatic AI curation. This is the active news cycle the pipeline spends tokens on.",
    whenToChange:
      "Raise if you want a longer auto-curate window without re-running Regenerate. Lower if storage or Bedrock cost is climbing and you are fine trimming older raw articles sooner.",
    example: "90",
    ifWrong: "Too low and you may strip content before a slow news week finishes curating. Too high and the database + embedding backlog stays bloated.",
    tags: ["news", "retention", "hot", "storage", "archive"],
    dangerLevel: "low",
    domain: "content",
    type: "number"
  },
  {
    key: "news_retention_warm_days",
    label: "Warm archive window (days)",
    description:
      "Between hot and warm age, stories move to the archive: title, AI summary, and tags stay searchable, but raw RSS body text and embeddings are stripped to save space. Anything older than warm is deleted on the nightly sweep.",
    whenToChange:
      "Raise if the crew uses Search the archive often and you want older headlines findable. Lower if you mostly care about fresh dock news and want a leaner database.",
    example: "365",
    ifWrong: "Too short and search results disappear quickly. Too long and you are storing summaries for years of headlines nobody reads.",
    tags: ["news", "retention", "warm", "search", "archive"],
    dangerLevel: "low",
    domain: "content",
    type: "number"
  },
  {
    key: "news_retention_prune_validation_days",
    label: "Delete validation failures after (days)",
    description:
      "Articles the AI could not format correctly (missing summary, sources, etc.) are hidden from the feed but still sit in the database until this many days pass — then the nightly job deletes them for good.",
    whenToChange:
      "After a bad deploy left thousands of failures, lower temporarily (e.g. 14) to clear junk faster. Raise if you are actively debugging failures and need samples to stay around.",
    example: "45",
    ifWrong: "Too low and you may delete rows you still wanted to inspect in the Validation tab.",
    tags: ["news", "retention", "validation", "prune", "archive"],
    dangerLevel: "medium",
    domain: "content",
    type: "number"
  },
  {
    key: "news_retention_prune_uncurated_days",
    label: "Delete never-curated rows after (days)",
    description:
      "RSS rows that were ingested but never became a card (stuck waiting for curation, pre-filtered, or abandoned) get deleted after this age. Stops dead-source noise from filling the database forever.",
    whenToChange:
      "When ingest logs show lots of fetched items but zero new cards, and the uncurated backlog is mostly old noise.",
    example: "45",
    ifWrong: "Too low during a long Regenerate run could delete rows before the curator reaches them — keep above your worst-case re-curate duration.",
    tags: ["news", "retention", "uncurated", "prune", "archive"],
    dangerLevel: "medium",
    domain: "content",
    type: "number"
  },
  {
    key: "news_feed_freshness_days",
    label: "Dock feed freshness (days)",
    description:
      "The main Gaming News page shows curated cards from this window first. Breaking stories with a very high relevance score (≥ 0.85) can still surface as evergreen picks even when they are older — so a massive launch does not vanish on day 46.",
    whenToChange:
      "Tighten (e.g. 30) if the dock feels stale or cluttered. Loosen if an ongoing saga (early access launch, studio drama) should stay visible longer without relying on evergreen scores alone.",
    example: "45",
    tags: ["news", "feed", "freshness", "dock"],
    dangerLevel: "low",
    domain: "content",
    type: "number"
  },
  {
    key: "news_stale_ingest_hours",
    label: "Stale feed check (hours)",
    description:
      "When page-load ingest is off, a crew visit to Gaming News only triggers a background fetch if the newest live card is older than this. The 4-hour server cron still runs regardless.",
    whenToChange:
      "Lower (e.g. 3) if the feed should refresh sooner when people open the page. Raise if RSS/API quota is tight and the cron is enough.",
    example: "6",
    tags: ["news", "ingest", "stale", "fetch"],
    dangerLevel: "low",
    domain: "content",
    type: "number"
  },
  {
    key: "news_ingest_on_page_load",
    label: "Fetch on every page visit",
    description:
      "Legacy mode: every time someone opens Gaming News, the server kicks off ingest in the background. Off is recommended — the cron + stale check above keep the dock fresh without hammering sources on every refresh.",
    whenToChange:
      "Turn on only if you need maximum freshness and accept higher RSS/API churn. Leave off for normal operation.",
    tags: ["news", "ingest", "page load", "fetch"],
    dangerLevel: "low",
    domain: "content",
    type: "boolean"
  },

  // ── Engagement · Nuggies economy ─────────────────────────────────────────
  {
    key: "nuggies_enabled",
    label: "Nuggies economy",
    description: "Master switch for every Nuggies feature: daily claims, gambling, trades, loans, marketplace, shop.",
    whenToChange: "Turn off to freeze the entire economy (e.g. during an exploit investigation). Turn on after launch or after a fix.",
    ifWrong: "Disabling will block every /daily, /give, /buy, gambling command, and marketplace sale until re-enabled. Balances are preserved.",
    tags: ["nuggies", "economy", "toggle", "kill", "switch", "master"],
    dangerLevel: "high",
    domain: "engagement",
    type: "boolean",
    confirmPhrase: "freeze-economy"
  },
  {
    key: "nuggies_daily_amount",
    label: "Daily claim amount",
    description: "Nuggies awarded per /daily claim.",
    whenToChange: "When tuning the base earn rate. Higher = faster economy growth.",
    example: "75",
    tags: ["nuggies", "daily", "claim", "amount"],
    dangerLevel: "low",
    domain: "engagement",
    type: "number"
  },
  {
    key: "nuggies_daily_cap",
    label: "Daily earn cap",
    description: "Maximum Nuggies a single user can earn from any source in one daily-reset window (rolls at 11pm ET).",
    whenToChange: "Lower to slow down high-volume earners; raise during events.",
    example: "600",
    tags: ["nuggies", "daily", "cap", "limit", "earn"],
    dangerLevel: "low",
    domain: "engagement",
    type: "number"
  },
  {
    key: "nuggies_game_cooldown_secs",
    label: "Gambling cooldown (seconds)",
    description: "Minimum seconds between gambling commands per user.",
    whenToChange: "Raise to slow down spammers, lower for higher-energy events.",
    example: "3",
    tags: ["nuggies", "gambling", "cooldown", "anti-spam"],
    dangerLevel: "low",
    domain: "engagement",
    type: "number"
  },
  {
    key: "nuggies_max_bet",
    label: "Max bet",
    description: "Largest single-game bet allowed in any gambling command.",
    whenToChange: "Lower if a user keeps wiping their balance in one round; raise during high-roller events.",
    example: "500",
    tags: ["nuggies", "gambling", "bet", "max", "limit"],
    dangerLevel: "low",
    domain: "engagement",
    type: "number"
  },
  {
    key: "nuggies_attendance_amount",
    label: "Attendance reward",
    description: "Nuggies awarded to each attendee when an admin runs the attendance award action on a finalized game night.",
    whenToChange: "When tuning the value of showing up vs daily claims.",
    example: "200",
    tags: ["nuggies", "attendance", "game-night", "reward"],
    dangerLevel: "low",
    domain: "engagement",
    type: "number"
  },
  {
    key: "nuggies_first_link_amount",
    label: "First Steam link bonus",
    description: "One-time Nuggies bonus awarded the first time a user links a Steam account.",
    whenToChange: "When you want to encourage Steam linking (raise) or remove the incentive (zero it).",
    example: "150",
    tags: ["nuggies", "steam", "link", "bonus", "onboarding"],
    dangerLevel: "low",
    domain: "engagement",
    type: "number"
  },
  {
    key: "nuggies_trade_fee_pct",
    label: "Trade fee (%)",
    description: "Platform cut on direct /give trades. Acts as a Nuggies sink to control inflation.",
    whenToChange: "Raise if total Nuggies in circulation grows too fast; lower to encourage more trades.",
    example: "5",
    tags: ["nuggies", "trade", "fee", "sink", "inflation"],
    dangerLevel: "low",
    domain: "engagement",
    type: "number"
  },
  {
    key: "nuggies_market_fee_pct",
    label: "Marketplace fee (%)",
    description: "Platform cut on marketplace sales. Nuggies sink.",
    whenToChange: "Same as trade fee — tune for inflation control.",
    example: "3",
    tags: ["nuggies", "market", "marketplace", "fee", "sink"],
    dangerLevel: "low",
    domain: "engagement",
    type: "number"
  },
  {
    key: "nuggies_loan_max_days",
    label: "Max loan duration (days)",
    description: "Longest repayment window allowed on a /loan offer.",
    whenToChange: "Lower if loan defaults are spiking; raise to allow more flexible terms.",
    example: "7",
    tags: ["nuggies", "loan", "duration", "days"],
    dangerLevel: "low",
    domain: "engagement",
    type: "number"
  },
  {
    key: "nuggies_loan_default_rate",
    label: "Default loan interest (%)",
    description: "Suggested interest rate pre-filled on /loan offer.",
    whenToChange: "When the prevailing community rate drifts and the default feels off.",
    example: "10",
    tags: ["nuggies", "loan", "interest", "rate"],
    dangerLevel: "low",
    domain: "engagement",
    type: "number"
  },
  {
    key: "nuggies_give_min",
    label: "Minimum /give amount",
    description: "Smallest amount a user can send in a single /give.",
    whenToChange: "Raise to discourage spam micro-transactions.",
    example: "1",
    tags: ["nuggies", "give", "min", "minimum"],
    dangerLevel: "low",
    domain: "engagement",
    type: "number"
  },
  {
    key: "nuggies_give_max",
    label: "Maximum /give amount",
    description: "Largest amount a user can send in a single /give.",
    whenToChange: "Lower to limit single-transaction risk; raise during gifting events.",
    example: "1000",
    tags: ["nuggies", "give", "max", "maximum"],
    dangerLevel: "low",
    domain: "engagement",
    type: "number"
  },

  // ── System · Nuggie persona ──────────────────────────────────────────────
  {
    key: "nuggie_system_prompt",
    label: "Nuggie system prompt",
    description: "Core personality definition for Nuggie. Used as the system message for web chat, Discord /nuggie ask, and announcement generation.",
    whenToChange: "When you want to shift Nuggie's voice, tone, or backstory. Test edits via the web chat before relying on them in Discord.",
    example: `You are Nuggie, a chicken nugget mascot for ${SITE_BRAND_NAME}…`,
    ifWrong: "Nuggie may speak out of character or contradict the Boneless Island branding. Behavior changes within ~30 seconds of save.",
    tags: ["nuggie", "persona", "ai", "prompt", "voice", "mascot", "personality"],
    dangerLevel: "low",
    domain: "system",
    type: "textarea"
  },
  {
    key: "nuggie_tone_rules",
    label: "Nuggie tone rules",
    description: "Behavioral rules appended after the system prompt. One rule per line, dash-prefixed. Shapes default speech style across all surfaces.",
    whenToChange: "When you want to adjust message length, profanity tolerance, pun frequency, or other consistent style knobs.",
    example: "- Keep messages short.\\n- Use crew names.\\n- No NSFW.",
    tags: ["nuggie", "persona", "tone", "rules", "style", "behavior"],
    dangerLevel: "low",
    domain: "system",
    type: "textarea"
  },
  {
    key: "nuggie_emoji_palette",
    label: "Nuggie emoji palette",
    description: "Space-separated emoji set Nuggie may pull from when reacting. Kept narrow to maintain visual identity.",
    whenToChange: "When adding or removing brand emojis (e.g. new event mascot, seasonal swap).",
    example: "🍗 🥚 🌴 🏝️ 🔥",
    tags: ["nuggie", "persona", "emoji", "branding"],
    dangerLevel: "low",
    domain: "system",
    type: "string"
  },
  {
    key: "achievement_announcements_enabled",
    label: "Small achievement Discord announcements",
    description: "When ON, Nuggie posts a short variant line in the milestone channel each time a non-milestone achievement unlocks (FIRST BLOOD, POG MOMENT, THE GRIND, etc.). Reuses milestone_channel_id. Milestones have their own announcer toggle.",
    whenToChange: "After you've set the milestone channel ID. Default is OFF until you've judged the chatter volume.",
    ifWrong: "Channel may get noisy if your crew earns a lot of small badges in a session. Toggle OFF anytime to silence.",
    tags: ["nuggie", "achievement", "announcement", "discord", "channel", "first_blood", "pog"],
    dangerLevel: "low",
    domain: "system",
    type: "boolean"
  },

  // ── People · Discord bridge (official + patches) ─────────────────────────
  {
    key: "official_announcements_enabled",
    label: "Official announcements",
    description: "When ON, new threads in the Announcements forum category (and other auto-bridge categories) are pushed to the configured Discord channel.",
    whenToChange: "After setting the official announcements channel ID and confirming the bot can post there.",
    ifWrong: "Forum posts in bridged categories won't reach Discord until re-enabled and a channel is set.",
    tags: ["discord", "bridge", "official", "announcements", "forum", "toggle"],
    dangerLevel: "low",
    domain: "people",
    type: "boolean"
  },
  {
    key: "official_announcements_channel_id",
    label: "Official announcements channel ID",
    description: "Discord channel ID where official forum announcement embeds are posted.",
    whenToChange: "When you want official island news to land in a different Discord channel.",
    example: "1234567890123456789",
    ifWrong: "Official forum posts won't appear in Discord even when the toggle is ON.",
    tags: ["discord", "bridge", "official", "announcements", "channel", "id"],
    dangerLevel: "low",
    domain: "people",
    type: "string"
  },
  {
    key: "official_announcements_ping_everyone",
    label: "Official announcements @everyone ping",
    description: "When ON, each official announcement includes an @everyone mention. Default OFF — members rely on Discord channel notification settings.",
    whenToChange: "Only for rare must-see broadcasts; leave OFF for routine crew updates.",
    ifWrong: "Crew may get ping fatigue if left ON for frequent posts.",
    tags: ["discord", "bridge", "official", "everyone", "ping", "mention"],
    dangerLevel: "medium",
    domain: "people",
    type: "boolean"
  },
  {
    key: "patch_alerts_enabled",
    label: "Patch alerts",
    description: "When ON, new patch notes for crew-library games are posted to the patch-notes Discord channel.",
    whenToChange: "After setting the patch notes channel ID and confirming the bot can post there.",
    ifWrong: "Game patch notes won't reach Discord until re-enabled and a channel is set.",
    tags: ["discord", "bridge", "patch", "alerts", "updates", "toggle"],
    dangerLevel: "low",
    domain: "people",
    type: "boolean"
  },
  {
    key: "patch_notes_channel_id",
    label: "Patch alerts channel ID",
    description: "Discord channel ID for crew-library game patch note embeds.",
    whenToChange: "When you want patch alerts in a different Discord channel.",
    example: "1234567890123456789",
    ifWrong: "Patch notes won't appear in Discord even when patch alerts are enabled.",
    tags: ["discord", "bridge", "patch", "alerts", "channel", "id"],
    dangerLevel: "low",
    domain: "people",
    type: "string"
  }
];

export const SETTING_META: Record<string, SettingMeta> = Object.fromEntries(
  RAW.map((m) => [m.key, m])
);

export const ALL_SETTINGS: SettingMeta[] = RAW;

export function settingsByDomain(domain: SettingDomain): SettingMeta[] {
  return RAW.filter((m) => m.domain === domain);
}

export function searchSettings(query: string): SettingMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return RAW.filter((m) => {
    const haystack = [
      m.label,
      m.key,
      m.description,
      m.whenToChange,
      ...m.tags
    ].join(" ").toLowerCase();
    return haystack.includes(q);
  });
}

export const DOMAIN_INFO: Record<SettingDomain, { label: string; icon: string; accent: string; blurb: string }> = {
  people: {
    label: "People",
    icon: "👥",
    accent: "#a78bfa",
    blurb: "Members, roles, onboarding, forum moderation, and Discord identity."
  },
  content: {
    label: "Content",
    icon: "📰",
    accent: "#0ea5e9",
    blurb: "Game library, news pipeline, game nights, and recommendation tuning."
  },
  engagement: {
    label: "Engagement",
    icon: "🍗",
    accent: "#f59e0b",
    blurb: "Nuggies economy operations, shop management, and economy tuning."
  },
  system: {
    label: "System",
    icon: "⚙️",
    accent: "#6366f1",
    blurb: "AI provider, data sync health, audit log, and platform-level controls."
  }
};
