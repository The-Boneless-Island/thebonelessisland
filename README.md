# 🏝️ The Boneless Island™

### a home base for the crew, just past the edge of the Discord

The Boneless Island is a companion site for the community: somewhere to actually hang out beyond the chat. Catch the gaming news, earn Nuggies and climb the ranks, hit the forums, sort out game night, see who's around. A shared space that's a direct extension of the Discord, with more going on than a text channel can hold. It is, objectively, **PEAK.** 🗿

🌐 **Live at [bonelessisland.com](https://bonelessisland.com)** · 🔐 Members-only (Discord-gated) · 🤖 Powered by **Nuggie**, the island's AI

---

## The idea

A Discord server is great for talking and pretty bad at remembering. Who owns what game? What did everyone unlock last week? What's actually worth playing across a pile of overlapping Steam libraries? The island is where that stuff lives in one place, so the good parts don't scroll away forever in chat.

Sign in with Discord, optionally link Steam, and the rest fills itself in: who's online, what the crew owns, what's trending, what's worth booting up tonight.

It's a passion project for one specific community. Not a startup, not a product, not for sale. Built to be fun, low-maintenance, and a little bit extra.

## The vibes

Running the place is **Nuggie**, a chicken-nugget AI who curates the news, helps pick games, hypes up rank-ups, and has more personality than some of the actual members. The island is built to feel lived-in: the news updates, ranks move, the activity feed ticks over, and there's pretty much always something new to poke at when you log in.

## Getting in: Discord first, Steam optional

- **Discord is the only way in.** No passwords, no email, no "create an account." Your Discord identity is your island identity.
- **It's gated to the crew.** Only members of the Boneless Island server get past the door. Everyone else bounces (no hard feelings, the palm trees are free to look at).
- **Steam is a bonus, never a tax.** Everything works without it. Link Steam through the official "Sign in through Steam" flow and you unlock library overlap, smarter picks, pooled wishlists, and playtime-aware recs. Unlink whenever.
- **Your data stays yours.** Steam is read-only and powers overlap and recs only. A real privacy layer (see below) decides exactly what the crew can and can't see.

---

## What's on the island

### 🏠 Home: your daily check-in
The landing pad. A live online-count hero, an **AI-curated Gaming News** feed (real outlets, summarized and ranked for *your* crew, in-app reader, spoiler gating), a **Friends Online** widget on live Discord presence, a Discord-style **Activity Feed** of who's been up to what, and the **Drift Log**, a set of hand-curated island news cards.

### 🎮 Games: what's everyone playing
The **AI Session Composer** clocks who's around, what the crew owns, and recent playtime, then hands over a pick with a reason, a vibe (Tonight / Weekend / Quick / Cozy / Spicy), a roster, and a "send the invite" button. Plus scheduled **game nights with RSVP**, a pooled **group wishlist** with hype bars, a **library snapshot** across everyone's Steam, a live **Patches & Updates** rolodex, and **Crew Chat**, an assistant that actually knows who's in voice and what everyone plays. No more decision paralysis. Mostly.

### 👥 Community: the social layer
Crew roster, recent clips, an activity timeline, forums, clubs, upcoming events, and weekly leaderboards. The island as a group, not just a list of names.

### 🏆 Achievements and the Nuggies economy
The island runs on **Nuggies**. Earn them, climb the milestone ranks, and show off illustrated **rank coins** named after gaming legends (Counter-Strike, Dark Souls, Halo, Metal Gear, Tarkov) on your home and profile cards. Spend Nuggies in the shop on cosmetic drip. Real economy, real bragging rights, zero real-money nonsense.

### 🛠️ Admin: the control room
A genuine admin console behind a sidebar of deep-linkable pages: members and roles, forum mod, the game library, game nights, the recommendation engine, gaming-news and patch sources, the Drift Log, economy ops and rules, shop items, AI provider settings, Nuggie's persona, server identity, the Discord bridge, data sync, and an audit log. Gated to the **Parent** role, naturally.

### 🌊 "Washed Ashore" onboarding
First time in? A guided, server-tracked tour walks new islanders through the place, and admins can re-show it to everyone with one button for when someone inevitably asks how to do the thing.

---

## The Nuggie AI layer

AI runs through the whole island and it's **provider-agnostic**: swap between Anthropic Claude, OpenAI, Google Gemini, or AWS Bedrock at runtime from the admin panel. No code, no redeploy.

- **Curated Gaming News:** pulls from real outlets (PC Gamer, RPS, Eurogamer, Kotaku, IGN) plus live Steam news, scores every story for relevance to *your* crew's actual libraries and playtime, dedupes the same event across sources, labels it (For You / Crew Trending / Top Gaming News), and gates spoilers. The curation is the feature.
- **Session recommendations:** island-flavored one-liners on the top pick, aware of who owns it and who's played it this week.
- **Crew Chat:** ask Nuggie what to play; it answers with live context (voice channels, recent playtime, best current pick).
- **Built cheap on purpose:** prompt caching, compact context, in-flight de-duplication, and TTL caches keep the token bill low, because this runs on a hobby budget.

---

## The roadmap (copium edition)

Live and growing. Some of this is half-built, some is still on the wishlist:

- **Forums V2:** rich markdown, image uploads, full-text search, @mentions and notifications, reactions, polls, opt-in Discord cross-posting.
- **The Living Island:** the backdrop reacts to real presence. Tiki torches lit per member online, a campfire that grows with the voice channel, a boat on the water when someone's in-game, a quiet empty shore when nobody's home. Big ambition, currently blocked on art.
- **Smarter game nights:** hosts editing and cancelling their own nights, recurring nights, time-consensus voting, and a Discord ping the second a game gets locked in.
- **Richer achievements:** rarity tints on badges, more milestone art, deeper economy.
- **Live streams and clips:** Twitch integration and an actual clips feed.
- **Seasonal scene moments:** string lights, a jack-o'-lantern moon, the occasional shooting star.

A few Community surfaces (streams, clips, clubs, events, leaderboards) currently run on placeholder data and will light up as their pipelines land. Already on the list.

---

## Under the hood

A small TypeScript monorepo with more engineering than a community hangout strictly needs:

| Package | What it is |
| --- | --- |
| `apps/web` | React + Vite front end: the island, the scene, all the pages. |
| `apps/api` | Express API: Discord OAuth, Steam sync, recommendations, AI, news. |
| `apps/bot` | A thin Discord bot exposing `/whatcanweplay`. |
| `packages/shared` | Shared TypeScript types across apps. |

**Spec sheet (for the real ones):** Node 26, a single AWS Graviton box behind Cloudflare, GitHub Actions CI/CD, a branch-protected `main` that will reject your spaghetti, a Content-Security-Policy with a live `report-uri`, and Trivy scanning the images. A community hangout with a real deploy pipeline. It knows how that sounds.

Reference docs live next to this README: [`DEPLOY.md`](DEPLOY.md) (ops), [`STYLE_GUIDE.md`](STYLE_GUIDE.md) and [`DESIGN_NOTES.md`](DESIGN_NOTES.md) (design), [`GLOSSARY.md`](GLOSSARY.md) (terms), [`BACKLOG.md`](BACKLOG.md) (the living to-do list).

## Running it locally

1. Copy `.env.example` to `.env` and fill in the Discord / Bot / Steam values. AI keys are optional: drop them here or set them at runtime in **Admin → AI Settings**.
2. Postgres: `docker compose -f infra/docker-compose.yml up -d`
3. Deps: `npm install`
4. Migrations: `npm run db:migrate -w @island/api`
5. Run it: `npm run dev`

Web app on `http://localhost:5173`, API health on `http://localhost:3000/health`. If it won't boot, check the `.env` first. It's usually the `.env`.

---

## FAQ

**Can I sign up?**
No. It's gated to one (1) Discord server, and you are, statistically, not in it. The palm trees are free to look at though.

**Is this for sale? Is it a startup?**
No, and please stop. It's a passion project. There is no growth team. There is Nuggie.

**Why does a community need AI?**
Why does anyone need anything. Nuggie said what's up.

**Is it good?**
It's actual cinema.

**A full web app, a CSP, CI/CD, an economy... for a Discord hangout?**
Yes. No further questions.

---

## Privacy principles

The one section played completely straight, because trust matters:

- Discord OAuth is the only sign-in, and the Discord user ID is the canonical identity.
- No passwords or email accounts are ever stored.
- Login is restricted to members of the configured Discord server.
- Steam linking is optional, removable, and read-only, handled through official Steam OpenID. Steam credentials are never requested or stored.
- What the crew can see about your Steam data is governed by a dedicated privacy layer and is not exposed by default.

---

*Boneless Island is a labor of love for one Discord community. If you wandered in from the outside: hi 👋, there's nothing to sign up for, but you're welcome to enjoy the palm trees.*
