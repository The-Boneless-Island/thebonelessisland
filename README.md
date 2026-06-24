# 🏝️ The Boneless Island

**The clubhouse for our Discord crew.** A tropical-island home base where a six-year-old gaming server figures out what to play tonight, keeps up with each other, races for bragging rights, and watches the news roll in — all without anyone having to ask "so… what are we playing?" in chat for the hundredth time.

🌐 **Live at [bonelessisland.com](https://bonelessisland.com)** · 🔐 Members-only (Discord guild gated) · 🤖 Powered by **Nuggie**, the island's AI

---

## The idea

Discord is great for talking. It's terrible for *remembering*. Who owns what game? When's the next session? What did everyone unlock last week? What's actually worth playing across forty overlapping Steam libraries?

Boneless Island is the answer to all of that — a single, good-looking place that sits on top of the Discord server we already live in. You sign in with Discord (the only login), optionally link Steam to make the recommendations smarter, and the island does the rest: it knows who's online, what the crew owns, what's trending, and what the group should fire up tonight.

It is unapologetically a **hobby project for one specific community** — not a startup, not a product, not for sale. Built to be fun, maintainable, and a little bit ridiculous. Made for adult gamers who've been friends for years.

## The vibe

A full-bleed island scene lives behind everything: sky → ocean → beach, with palm trees that sway in the wind and rise as you scroll. Flip between **Day** and **Night** and the sun and moon arc across the sky on the way out and in. Stars at night, clouds by day, glassy translucent panels floating over the water.

The mascot is **Nuggie** — the boneless chicken-nugget AI who curates your news, picks your games, and generally runs the place. The brand is tropical, playful, and grown-up: think beach bar, not corporate dashboard.

## Signing in — Discord first, Steam optional

- **Discord is the only way in.** No passwords, no email accounts, no separate signup. Your Discord identity *is* your island identity.
- **Login is gated to our guild.** Only members of the configured Discord server get past the door; everyone else bounces.
- **Steam is a bonus, never a requirement.** Every feature works without it. Link Steam (via the official "Sign in through Steam" flow — we never see your password) and the island unlocks library overlap, smarter picks, wishlist pooling, and playtime-aware recommendations. Unlink anytime.
- **Your data stays yours.** Steam is read-only, used purely to power overlap and recommendations, and there's a privacy layer (see below) that controls exactly what the crew can see.

---

## What's on the island

### 🏠 Home — your daily check-in
The landing pad. A live online-count hero, an **AI-curated Gaming News** feed (real outlets, summarized and ranked for *your* crew, with an in-app reader and spoiler gating), a **Friends Online** widget pulling live Discord presence, a Discord-style **Activity Feed** of what everyone's been up to, and the **Drift Log** — hand-curated island news cards.

### 🎮 Games — what are we playing tonight?
The heart of it. The **AI Session Composer** looks at who's around, what the crew owns, and recent playtime, then proposes a pick with a reason, a vibe (Tonight / Weekend / Quick / Cozy / Spicy), a roster, and a "send the invite" button. Plus: scheduled **game nights with RSVP**, a pooled **group wishlist** with hype bars, a **library snapshot** across everyone's Steam, a live **Patches & Updates** rolodex, and **Crew Chat** — a conversational assistant that actually knows who's in voice and what you all play.

### 👥 Community — the social layer
Crew roster, recent clips, an activity timeline, forums, clubs, upcoming events, and weekly leaderboards. The place to see the server as a *group*, not just a list of names.

### 🏆 Achievements & the Nuggies economy
The island runs on **Nuggies**. Earn them, climb the milestone ranks, and show off illustrated **rank coins** named after gaming legends (Counter-Strike, Dark Souls, Halo, Metal Gear, Tarkov…) right on your homepage and profile cards. Spend Nuggies in the shop on cosmetic flair. Real economy, real bragging rights.

### 🛠️ Admin — the control room
A proper admin console behind a sidebar of deep-linkable pages: member & role management, forum moderation, the game library, game nights, the recommendation engine, gaming-news and patch sources, the Drift Log, economy operations and rules, shop items, AI provider settings, Nuggie's persona, guild identity, the Discord bridge, data sync, and an audit log. Gated to the **Parent** role.

### 🌊 "Washed Ashore" onboarding
First time in? A guided, server-tracked product tour walks new islanders through the place — and admins can re-show it to everyone with one button.

---

## The Nuggie AI layer

AI is woven through the island, and it's **provider-agnostic** — swap between Anthropic Claude, OpenAI, Google Gemini, or AWS Bedrock at runtime from the admin panel, no redeploy. Set it up once, change your mind whenever.

- **Curated Gaming News** — pulls from major gaming outlets (PC Gamer, RPS, Eurogamer, Kotaku, IGN) plus live Steam game news, scores every story for relevance to *your* crew's actual libraries and playtime, dedupes coverage of the same event, labels it (For You / Crew Trending / Top Gaming News), and flags spoilers. The curation *is* the feature.
- **Session recommendations** — island-flavored, one-sentence blurbs on the top pick, aware of who owns it and who's played it this week.
- **Crew Chat** — ask Nuggie what to play; it answers with live context (voice channels, recent playtime, best current pick).
- **Built to be cheap** — prompt caching, compact context formatting, in-flight de-duplication, and TTL caches keep token costs low, because this runs on a hobby budget.

---

## On the roadmap

The island is live and growing. Things we want to add (some partially built, some still dreaming):

- **Forums V2** — rich markdown posts, image uploads, full-text search, @mentions & notifications, reactions, polls, and opt-in Discord cross-posting.
- **The Living Island** — the backdrop reacts to real presence: tiki torches lit per member online, a campfire that grows with the voice channel, a boat on the water when someone's in-game, a quiet empty shore when nobody's home.
- **Smarter game nights** — hosts editing/cancelling their own nights, recurring nights, time-consensus voting, and a Discord ping the moment a game gets locked in.
- **Richer achievements** — rarity tints on badges, more milestone art, deeper economy.
- **Live streams & clips** — Twitch integration and a real clips feed.
- **Seasonal scene moments** — string lights, a jack-o'-lantern moon, the occasional shooting star.

Some Community surfaces (streams, clips, clubs, events, leaderboards) currently run on placeholder data and will light up as their pipelines land.

---

## Under the hood

A small TypeScript monorepo:

| Package | What it is |
| --- | --- |
| `apps/web` | React + Vite front end — the island, the scene, all the pages. |
| `apps/api` | Express API — Discord OAuth, Steam sync, recommendations, AI, news. |
| `apps/bot` | A thin Discord bot exposing `/whatcanweplay`. |
| `packages/shared` | Shared TypeScript types across apps. |

Hosted on a single AWS Graviton box behind Cloudflare, deployed via GitHub Actions. Day-to-day reference docs live alongside this README: [`DEPLOY.md`](DEPLOY.md) (ops), [`STYLE_GUIDE.md`](STYLE_GUIDE.md) and [`DESIGN_NOTES.md`](DESIGN_NOTES.md) (design), [`GLOSSARY.md`](GLOSSARY.md) (terms), and [`BACKLOG.md`](BACKLOG.md) (the living to-do list).

## Running it locally

1. Copy `.env.example` to `.env` and fill in the Discord / Bot / Steam values. AI keys are optional — set them here or at runtime in **Admin → AI Settings**.
2. Start Postgres: `docker compose -f infra/docker-compose.yml up -d`
3. Install deps: `npm install`
4. Run migrations: `npm run db:migrate -w @island/api`
5. Start everything: `npm run dev`

Web app on `http://localhost:5173`, API health on `http://localhost:3000/health`.

## Privacy principles

- Discord OAuth is the only sign-in; the Discord user ID is the canonical identity.
- No passwords or email accounts are ever stored.
- Login is restricted to members of the configured guild.
- Steam linking is optional, removable, read-only, and runs through official Steam OpenID — we never ask for or store Steam credentials.
- What the crew can see about your Steam data is governed by a dedicated privacy layer, not exposed by default.

---

*Boneless Island is a labor of love for one Discord server. If you stumbled here from the outside: hi 👋 — there's nothing to sign up for, but enjoy the palm trees.*
