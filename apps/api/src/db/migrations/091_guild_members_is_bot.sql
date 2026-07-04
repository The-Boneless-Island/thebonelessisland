-- Flag Discord bot accounts (e.g. Nuggie, PatchBot) in the guild member roster.
-- Discord's guild members API always includes user.bot on every member object,
-- so this is a generic flag driven by that field, not a hardcoded bot list.
-- Member-facing surfaces (Friends Online, Community) filter these out; admin
-- tooling can still see them via an opt-in query param.

ALTER TABLE guild_members
ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT FALSE;
