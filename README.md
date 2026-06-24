# 🏝️ The Boneless Island

### the most over-engineered answer to "so… what are we playing" known to man

Six years of Discord. ~40 overlapping Steam libraries. One (1) eternal question screamed into the chat every single night. We got so tired of answering it that we built an **entire website**. For roughly forty guys. This is that website. It is, objectively, **PEAK.** 🗿

Figure out what to play tonight, keep up with the crew, race for bragging rights, and let the news roll in — all in one place.

🌐 **Live at [bonelessisland.com](https://bonelessisland.com)** · 🔐 Members-only (Discord-gated) · 🤖 Powered by **Nuggie**, the island's AI

---

## The idea

Discord is **goated** for yapping and absolutely **cooked** at remembering anything. Who owns what game? When's the next session? What did everyone unlock last week? What's actually worth firing up across forty libraries that overlap in cursed and beautiful ways?

You sign in with Discord, optionally link Steam to make the picks smarter, and the island does the rest — it knows who's online, what the crew owns, what's trending, and what the group should boot up tonight. No more "idk what do you wanna play" until everyone logs off out of spite.

It is unapologetically a **hobby project for one specific community.** Not a startup, not a product, not for sale. Built to be fun, maintainable, and a little bit ridiculous. We are not well. This is the result.

## The vibes

A full-bleed island sits behind everything — sky, ocean, beach, palm trees swaying at a buttery framerate. Flip **Day / Night** and the sun and moon arc across the sky like they're getting paid for it.

Running the place is **Nuggie**, a chicken-nugget AI who curates your news, picks your games, and has more personality than some of the actual members.

## Signing in — Discord first, Steam optional

- **Discord is the only way in.** No passwords, no email, no "create an account." Your Discord identity *is* your island identity.
- **It's gated to the crew.** Only members of The Boneless Island server get past the door. Everyone else bounces. No hard feelings, enjoy the palm trees.
- **Steam is a bonus, never a tax.** Every feature works without it. Link Steam (via the official "Sign in through Steam" — we never see your password) and you unlock library overlap, smarter picks, pooled wishlists, and playtime-aware recs. Unlink whenever, no guilt trip.
- **Your data stays yours.** Steam is read-only and powers overlap/recs only. A real privacy layer (see below) decides exactly what the crew can and can't see.

---

## What's on the island

### 🏠 Home — your daily check-in
The landing pad. Live online-count hero, an **AI-curated Gaming News** feed (real outlets, summarized and ranked for *your* crew, in-app reader, spoiler gating), a **Friends Online** widget on live Discord presence, a Discord-style **Activity Feed** of who's been up to what, and the **Drift Log** — hand-curated island news cards.

### 🎮 Games — what are we playing tonight?
The main event. The **AI Session Composer** clocks who's around, what the crew owns, and recent playtime, then hands you a pick *with a reason*, a vibe (Tonight / Weekend / Quick / Cozy / Spicy), a roster, and a "send the invite" button. Plus scheduled **game nights with RSVP**, a pooled **group wishlist** with hype bars, a **library snapshot** across everyone's Steam, a live **Patches & Updates** rolodex, and **Crew Chat** — an assistant that actually knows who's in voice and what you all play. No more decision paralysis. Mostly.

### 👥 Community — the social layer
Crew roster, recent clips, an activity timeline, forums, clubs, upcoming events, and weekly leaderboards. The island as a *group*, not just a list of names.

### 🏆 Achievements & the Nuggies economy
The island runs on **Nuggies.** Earn 'em, climb the milestone ranks, and flex illustrated **rank coins** named after gaming legends (Counter-Strike, Dark Souls, Halo, Metal Gear, Tarkov…) right on your home and profile cards. Spend Nuggies in the shop on cosmetic drip. Real economy, real bragging rights, zero real-money nonsense.

### 🛠️ Admin — the control room
A genuine admin console behind a sidebar of deep-linkable pages: members & roles, forum mod, the game library, game nights, the recommendation engine, gaming-news & patch sources, the Drift Log, economy ops & rules, shop items, AI provider settings, Nuggie's persona, server identity, the Discord bridge, data sync, and an audit log. Gated to the **Parent** role, because of course it is.

### 🌊 "Washed Ashore" onboarding
First time in? A guided, server-tracked tour walks new islanders through the place — and admins can re-show it to everyone with one button when someone inevitably says "wait how do I do the thing."

---

## The Nuggie AI layer

AI runs through the whole island and it's **provider-agnostic** — swap between Anthropic Claude, OpenAI, Google Gemini, or AWS Bedrock at runtime from the admin panel. No code, no redeploy, no commitment issues.

- **Curated Gaming News** — pulls from real outlets (PC Gamer, RPS, Eurogamer, Kotaku, IGN) plus live Steam news, scores every story for relevance to *your* crew's actual libraries and playtime, dedupes the same event across sources, slaps a label on it (For You / Crew Trending / Top Gaming News), and gates spoilers. The curation *is* the feature.
- **Session recommendations** — island-flavored one-liners on the top pick, aware of who owns it and who's played it this week.
- **Crew Chat** — ask Nuggie what to play; it answers with live context (voice channels, recent playtime, best current pick).
- **Built cheap on purpose** — prompt caching, compact context, in-flight de-dupe, and TTL caches keep the token bill low, because this runs on a hobby budget and not a Series A.

---

## The roadmap (copium edition)

Live and growing. Some of this is half-built, some is pure manifestation:

- **Forums V2** — rich markdown, image uploads, full-text search, @mentions & notifications, reactions, polls, opt-in Discord cross-posting.
- **The Living Island** — the backdrop reacts to *real presence*: tiki torches lit per member online, a campfire that grows with the voice channel, a boat on the water when someone's in-game, a quiet empty shore when nobody's home. Peak ambition. Blocked on art.
- **Smarter game nights** — hosts editing/cancelling their own nights, recurring nights, time-consensus voting, and a Discord ping the second a game gets locked in.
- **Richer achievements** — rarity tints on badges, more milestone art, deeper economy.
- **Live streams & clips** — Twitch integration and an actual clips feed.
- **Seasonal scene moments** — string lights, a jack-o'-lantern moon, the occasional shooting star.

A few Community surfaces (streams, clips, clubs, events, leaderboards) currently run on placeholder data and will light up as their pipelines land. We know. It's on the list.

---

## Under the hood

A small TypeScript monorepo that has no business being this thorough for ~40 guys:

| Package | What it is |
| --- | --- |
| `apps/web` | React + Vite front end — the island, the scene, all the pages. |
| `apps/api` | Express API — Discord OAuth, Steam sync, recommendations, AI, news. |
| `apps/bot` | A thin Discord bot exposing `/whatcanweplay`. |
| `packages/shared` | Shared TypeScript types across apps. |

**Spec sheet (for the real ones):** Node 26 · single AWS Graviton box behind Cloudflare · GitHub Actions CI/CD · branch-protected `main` that *will* reject your spaghetti · a Content-Security-Policy with a live `report-uri` · Trivy scanning the images · and, against all odds, green checks. It's a friend-group hangout with a deploy pipeline. We are aware of how that sounds.

Reference docs live next to this README: [`DEPLOY.md`](DEPLOY.md) (ops), [`STYLE_GUIDE.md`](STYLE_GUIDE.md) + [`DESIGN_NOTES.md`](DESIGN_NOTES.md) (design), [`GLOSSARY.md`](GLOSSARY.md) (terms), [`BACKLOG.md`](BACKLOG.md) (the living to-do list).

## Running it locally

1. Copy `.env.example` to `.env`, fill in the Discord / Bot / Steam values. AI keys optional — drop them here or at runtime in **Admin → AI Settings**.
2. Postgres: `docker compose -f infra/docker-compose.yml up -d`
3. Deps: `npm install`
4. Migrations: `npm run db:migrate -w @island/api`
5. Send it: `npm run dev`

Web app on `http://localhost:5173`, API health on `http://localhost:3000/health`. If it doesn't boot, it's probably your `.env`. It's always the `.env`.

---

## FAQ

**Can I sign up?**
No. It's gated to one (1) Discord server and you are, statistically, not in it. The palm trees are free to look at though.

**Is this for sale / is it a startup?**
No and please stop. It's a hobby project for a friend group. There is no growth team. There is Nuggie.

**Why does a friend group need AI?**
Why does anyone need anything. Nuggie said what's up and now it picks our games.

**Is it good?**
It's actual cinema.

**You built a full web app, CSP, CI/CD, and an economy… for forty people?**
Yes. No further questions.

---

## Privacy principles

The one section we play completely straight, because trust matters:

- Discord OAuth is the only sign-in; the Discord user ID is the canonical identity.
- No passwords or email accounts are ever stored.
- Login is restricted to members of the configured Discord server.
- Steam linking is optional, removable, and read-only, via official Steam OpenID — we never ask for or store Steam credentials.
- What the crew can see about your Steam data is governed by a dedicated privacy layer and is not exposed by default.

---

*Boneless Island is a labor of love for one Discord server. If you wandered in from the outside: hi 👋 — there's nothing to sign up for, but you're welcome to enjoy the palm trees. We are so back.*
