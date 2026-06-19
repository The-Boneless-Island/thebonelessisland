import { SettingCard } from "@island/web";
import { Stage } from "./_stage";

const noop = () => {};

export const StringSetting = () => (
  <Stage style={{ width: 420 }}>
    <SettingCard
      onSave={noop}
      setting={{
        key: "guild_display_name",
        value: "The Boneless Island",
        label: "Server Display Name",
        description: null,
        isSecret: false,
        envDefault: "",
        updatedAt: "2026-06-10T18:00:00.000Z"
      }}
      meta={{
        key: "guild_display_name",
        label: "Server Display Name",
        description: "A friendly label for the Discord server shown in the admin panel header. No functional effect.",
        whenToChange: "When the community renames itself, or to make the admin panel header less generic.",
        example: "The Boneless Island",
        tags: ["discord", "name", "branding"],
        dangerLevel: "low",
        domain: "people",
        type: "string"
      }}
    />
  </Stage>
);

export const BooleanToggle = () => (
  <Stage style={{ width: 420 }}>
    <SettingCard
      onSave={noop}
      setting={{
        key: "ai_enabled",
        value: "true",
        label: "AI features enabled",
        description: null,
        isSecret: false,
        envDefault: "",
        updatedAt: "2026-06-15T09:30:00.000Z"
      }}
      meta={{
        key: "ai_enabled",
        label: "AI features enabled",
        description: "Master switch for every AI-powered feature on the island (news curation, summaries, recommendations).",
        whenToChange: "Toggle off to instantly stop all AI calls (and their cost).",
        tags: ["ai", "toggle"],
        dangerLevel: "low",
        domain: "system",
        type: "boolean"
      }}
    />
  </Stage>
);

export const SelectSetting = () => (
  <Stage style={{ width: 420 }}>
    <SettingCard
      onSave={noop}
      aiProvider="anthropic"
      setting={{
        key: "ai_provider",
        value: "anthropic",
        label: "AI provider",
        description: null,
        isSecret: false,
        envDefault: "",
        updatedAt: "2026-06-14T12:00:00.000Z"
      }}
      meta={{
        key: "ai_provider",
        label: "AI provider",
        description: "Which model vendor powers the island's AI features.",
        whenToChange: "Switch when you change API keys or want a different model family.",
        tags: ["ai", "provider"],
        dangerLevel: "low",
        domain: "system",
        type: "select",
        selectOptions: [
          { value: "anthropic", label: "Anthropic" },
          { value: "openai", label: "OpenAI" },
          { value: "google", label: "Google" }
        ]
      }}
    />
  </Stage>
);

export const HighRiskCollapsed = () => (
  <Stage style={{ width: 420 }}>
    <SettingCard
      onSave={noop}
      setting={{
        key: "discord_guild_id",
        value: "1234567890123456789",
        label: "Discord Server ID",
        description: null,
        isSecret: false,
        envDefault: "",
        updatedAt: "2026-05-02T20:15:00.000Z"
      }}
      meta={{
        key: "discord_guild_id",
        label: "Discord Server ID",
        description: "The numeric ID of the Discord server this app is gated to.",
        whenToChange: "When you migrate the community to a different Discord server.",
        example: "1234567890123456789",
        ifWrong: "Nobody will be able to log in until the value is fixed at the database level.",
        tags: ["discord", "guild", "oauth"],
        dangerLevel: "high",
        domain: "people",
        type: "string",
        confirmPhrase: "change-server"
      }}
    />
  </Stage>
);
