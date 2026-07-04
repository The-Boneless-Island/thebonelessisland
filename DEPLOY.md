# Deploy — The Boneless Island

Single-box AWS deploy fronted by Cloudflare.

```
                bonelessisland.com  (Cloudflare DNS + proxy, TLS at edge)
        ┌──────────────────────┴───────────────────────┐
   bonelessisland.com                          api.bonelessisland.com
   (orange cloud)                              (orange cloud)
        │                                             │
        └──────────────── 1× EC2 t4g (Graviton/ARM) ──┘
              docker compose (--profile prod):
                • web   → Caddy: serves the React SPA + reverse-proxies /api
                • api   → Node (Express) :3000   (migrations run on boot)
                • bot   → Discord gateway (Nuggie), outbound only
                • postgres → pgvector/pgvector:pg16  (data on an EBS volume)
              Security group: 80/443 from Cloudflare IPs only, 22 from your IP
```

Why this shape: Cloudflare gives free DNS, edge TLS, DDoS protection, and lets
us hide the origin IP. AWS holds compute + data. CloudFront/Route53/S3/ACM are
all dropped — Caddy serves the static build and proxies the API on the box. See
the cost notes at the bottom.

---

## 0. Prerequisites

- AWS account (see **Cost & credits** for the new-account credit play).
- `bonelessisland.com` managed in Cloudflare.
- Two Discord applications (per the brand split):
  - **The Boneless Island** — OAuth client (`DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`).
  - **Nuggie** — bot user (`DISCORD_BOT_TOKEN`, `DISCORD_BOT_CLIENT_ID`).
- Steam Web API key (optional), AI provider key(s) (optional).
- A strong set of generated secrets (commands below).

---

## 1. Launch the EC2 box

1. **AMI:** Amazon Linux 2023 **arm64** (or Ubuntu 24.04 arm64).
2. **Instance type:** `t4g.small` (2 GB) to start. Bump to `t4g.medium` (4 GB)
   if you see OOM under load — size _before_ buying a Savings Plan (§10).
3. **Storage:** 20 GB gp3 EBS.
4. **Elastic IP:** allocate one and associate it (so the IP survives reboots).
5. **IAM role (only if using SSM secrets):** attach an instance role granting
   - `ssm:GetParametersByPath` on `arn:aws:ssm:<region>:<acct>:parameter/boneless/prod/*`
   - `kms:Decrypt` on `alias/aws/ssm`
   - (for backups) `s3:PutObject` on your backup bucket.
6. **Install Docker + compose plugin:**
   ```bash
   sudo dnf install -y docker           # AL2023  (Ubuntu: apt-get install docker.io)
   sudo systemctl enable --now docker
   sudo usermod -aG docker $USER        # re-login after this
   # compose v2 plugin:
   DOCKER_CONFIG=${DOCKER_CONFIG:-$HOME/.docker}
   mkdir -p $DOCKER_CONFIG/cli-plugins
   curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-aarch64 \
     -o $DOCKER_CONFIG/cli-plugins/docker-compose
   chmod +x $DOCKER_CONFIG/cli-plugins/docker-compose
   ```

---

## 2. Security group — lock origin to Cloudflare

Inbound rules:

| Port | Source               | Why                                |
| ---- | -------------------- | ---------------------------------- |
| 443  | Cloudflare IP ranges | HTTPS via Cloudflare only          |
| 80   | Cloudflare IP ranges | HTTP→HTTPS redirect via Cloudflare |
| 22   | **your** IP/32       | SSH admin                          |

Do **not** open 80/443 to `0.0.0.0/0` — that defeats hiding the origin. Use the
current Cloudflare ranges from <https://www.cloudflare.com/ips/>. The same list
is mirrored in `infra/Caddyfile` (`trusted_proxies`); keep the two in sync.

> Tip: create an AWS **managed prefix list** of the Cloudflare ranges and
> reference it from the SG so you update the list in one place.

Postgres (5432) is **never** opened — it's loopback-only on the box and only
reachable by the app containers over the internal Docker network.

---

## 3. Cloudflare — DNS, SSL, origin cert

**DNS records** (all proxied = orange cloud):

| Type  | Name                 | Content              | Proxy   |
| ----- | -------------------- | -------------------- | ------- |
| A     | `bonelessisland.com` | `<Elastic IP>`       | Proxied |
| A     | `api`                | `<Elastic IP>`       | Proxied |
| CNAME | `www`                | `bonelessisland.com` | Proxied |

**SSL/TLS mode:** set to **Full (strict)**. (Overview → SSL/TLS.)

**Origin certificate** (free, 15-year, terminates TLS on the box):

1. Cloudflare → SSL/TLS → **Origin Server** → **Create Certificate**.
2. Hostnames: `bonelessisland.com` and `*.bonelessisland.com`. Format: PEM.
3. Save the cert and key onto the box:
   ```bash
   mkdir -p infra/certs && chmod 700 infra/certs
   # paste the cert:
   sudo tee infra/certs/origin-cert.pem  # paste, Ctrl-D
   sudo tee infra/certs/origin-key.pem   # paste, Ctrl-D
   chmod 600 infra/certs/*.pem
   ```
   `infra/certs/` is git-ignored — these never get committed.

Optional hardening: turn on **Always Use HTTPS**, **HSTS**, and a **WAF custom
rule** / **rate-limiting rule** on `api.bonelessisland.com` (all free tier).

---

## 4. Get the code + configure env

```bash
# Clone into the EXACT path the deploy pipeline expects.
# .github/workflows/deploy.yml hardcodes `cd /home/ssm-user/thebonelessisland`,
# so the repo must live there or every push-to-deploy will fail.
sudo mkdir -p /home/ssm-user/thebonelessisland
sudo chown "$USER" /home/ssm-user/thebonelessisland
git clone <repo-url> /home/ssm-user/thebonelessisland && cd /home/ssm-user/thebonelessisland
cp .env.example .env
chmod 600 .env
```

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"  # SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"  # POSTGRES_PASSWORD (URL-safe)
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"  # BOT_API_SHARED_SECRET
```

Edit `.env`. **Production values that differ from the example:**

```dotenv
NODE_ENV=production
WEB_ORIGIN=https://bonelessisland.com
# API_BASE_URL is the bot's API target ONLY (the web uses VITE_API_BASE_URL, baked
# at build time). The bot calls /internal/* routes, which Caddy 403s on the public
# hostname — so it MUST use the in-container address, not the public URL. Setting
# this to https://api.bonelessisland.com silently breaks every bot internal call
# (milestone/achievement announcements, settings cache, slash-command autocomplete,
# /nuggie ask). See infra/Caddyfile.
API_BASE_URL=http://api:3000
DATABASE_URL=postgresql://postgres:<POSTGRES_PASSWORD>@postgres:5432/boneless
POSTGRES_PASSWORD=<same password as in DATABASE_URL>
DISCORD_REDIRECT_URI=https://api.bonelessisland.com/auth/discord/callback
SESSION_SECRET=<generated>
BOT_API_SHARED_SECRET=<generated>
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
DISCORD_GUILD_ID=...
DISCORD_BOT_TOKEN=...
DISCORD_BOT_CLIENT_ID=...
# Exact Discord role name that grants admin access. No default — required, or nobody is admin.
ADMIN_ROLE_NAME=...
# Steam / AI keys as desired
```

> Note: `DATABASE_URL` host is `postgres` (the compose service name), **not**
> `localhost`. `VITE_API_BASE_URL` is **not** read here in prod — it's baked
> into the web image by the compose build arg.

### SSM mode (optional, instead of putting secrets in `.env`)

Upload each secret as a `SecureString` under `/boneless/prod/<KEY>`, then keep
`.env` minimal:

```dotenv
NODE_ENV=production
SECRETS_SOURCE=ssm
AWS_REGION=us-east-1
POSTGRES_PASSWORD=<same as the SSM DATABASE_URL password>   # compose needs this at init
```

The api/bot pull everything else from SSM at startup using the instance role.

---

## 5. Update Discord + Steam callbacks

- **Discord** (The Boneless Island app) → OAuth2 → Redirects:
  add `https://api.bonelessisland.com/auth/discord/callback`.
- **Steam** OpenID realm/return: point at `https://api.bonelessisland.com`.

---

## 6. Build + run

```bash
docker compose -f infra/docker-compose.yml --profile prod up -d --build
```

This builds the web (Caddy+SPA), api, and bot images and starts all four
services. The api runs DB migrations automatically on boot.

Verify:

```bash
docker compose -f infra/docker-compose.yml ps
docker compose -f infra/docker-compose.yml logs -f api    # watch "[boot] migrations: …"
curl -sk https://api.bonelessisland.com/health            # {"ok":true}
```

Then load `https://bonelessisland.com` and run the Discord login end-to-end.

---

## 7. Backups (mandatory — Postgres is self-hosted)

Two things need nightly backup: the Postgres database and the forum uploads
volume (member-uploaded images, not stored in the database). Both are handled
by the committed script `scripts/ops/pg-backup.sh` — don't hand-roll a cron
job inline; the script is defensive (checks its own config, fails loudly, one
S3 upload per artifact) in a way a copy-pasted one-liner won't stay.

**One-time setup:**

1. Create an S3 bucket for backups (any region; doesn't need to be the same
   region as the box). Add a **lifecycle rule** to expire objects after 30
   days — the box's IAM instance role only needs `s3:PutObject` (see step 1.5
   in §1), so nothing here needs delete/list access from the box itself.
2. Grant the instance role `s3:PutObject` on that bucket if you haven't
   already (§1 step 5).
3. Create `/etc/boneless-backup.env` on the box (not in the repo — this is
   ops config, not app config):
   ```bash
   sudo tee /etc/boneless-backup.env <<'EOF'
   BACKUP_S3_BUCKET=your-backup-bucket-name
   # Optional — a healthchecks.io (or similar) check URL. pg-backup.sh GETs
   # this on success so a silently-broken cron shows up as a missed check-in.
   BACKUP_PING_URL=
   EOF
   sudo chmod 600 /etc/boneless-backup.env
   ```
4. Install the cron job (writes `/etc/cron.d/boneless-backup`, runs nightly
   at 03:15 UTC):
   ```bash
   sudo scripts/ops/install-backup-cron.sh
   ```
5. **Do one manual run before trusting the cron:**
   ```bash
   sudo scripts/ops/pg-backup.sh
   # then confirm both objects landed:
   aws s3 ls "s3://<your-backup-bucket>/pg/"
   aws s3 ls "s3://<your-backup-bucket>/uploads/"
   ```

**Restore test (do this at least once — an untested backup is a hope, not a
plan):**

```bash
# Fresh scratch database to restore into:
docker exec boneless-postgres psql -U postgres -d postgres \
  -c "DROP DATABASE IF EXISTS boneless_restore_test;" \
  -c "CREATE DATABASE boneless_restore_test;"
# Stream a recent dump from S3 straight into it:
aws s3 cp "s3://<your-backup-bucket>/pg/boneless-<timestamp>.sql.gz" - | gunzip \
  | docker exec -i boneless-postgres psql -U postgres -d boneless_restore_test

# Spot-check row counts against the live DB, then clean up:
docker exec boneless-postgres psql -U postgres -d boneless_restore_test -c "\dt" | head
docker exec boneless-postgres psql -U postgres -c "DROP DATABASE boneless_restore_test;"
```

Restoring the uploads volume is a plain tar extract into a fresh (or the
existing) `boneless_uploads` volume:

```bash
aws s3 cp "s3://<your-backup-bucket>/uploads/boneless-uploads-<timestamp>.tar.gz" - \
  | docker run --rm -i -v boneless_uploads:/data alpine:3 tar -xzf - -C /data
```

### Uploads rescue — one-time, around the deploy that introduced the volume

Before the `boneless_uploads` named volume existed in `docker-compose.yml`,
forum images lived only in the running `boneless-api` container's writable
layer — so the first deploy that lands the volume also recreates that
container and silently deletes anything uploaded since the previous deploy.
Rescue them first, then restore them into the new volume immediately after
that deploy completes (once done, delete this subsection):

```bash
# Run BEFORE that deploy goes out (while the OLD api container is still up):
docker cp boneless-api:/app/apps/api/data/uploads ./uploads-rescue

# Run AFTER this PR's deploy completes (boneless_uploads volume now exists):
docker run --rm -v boneless_uploads:/data -v "$(pwd)/uploads-rescue:/rescue:ro" \
  alpine:3 sh -c "cp -a /rescue/. /data/"

# Verify, then clean up the local copy:
docker run --rm -v boneless_uploads:/data alpine:3 ls -la /data
rm -rf ./uploads-rescue
```

If `uploads-rescue` ends up empty (no uploads happened since the last deploy),
the restore step is a no-op — safe to run either way.

---

## 8. Rollback

Every image pushed to GHCR is tagged with its commit SHA (in addition to
`latest`), so rolling back is re-running the same deploy with an older tag —
no rebuild, no separate rollback pipeline. Find the last-known-good SHA (the
previous commit on `main`, or check the Deploy Actions run history), then on
the box:

```bash
cd /home/ssm-user/thebonelessisland
export IMAGE_TAG=<previous-good-commit-sha>
docker compose -f infra/docker-compose.yml --profile prod pull
docker compose -f infra/docker-compose.yml --profile prod up -d --wait --wait-timeout 240
```

This can also be run remotely the same way the deploy workflow does it (AWS
SSM `send-command`, same shape as `.github/workflows/deploy.yml`'s deploy
step, with `IMAGE_TAG` swapped) — you don't need to be SSH'd into the box.

Note a rollback does **not** undo a database migration that ran on the
forward deploy. If the bad deploy included a migration, a straight image
rollback still runs against post-migration schema — check `BACKLOG.md`/the
migration file before assuming a rollback alone fixes a bad migration.

---

## 9. Updates / redeploy

```bash
cd boneless && git pull
docker compose -f infra/docker-compose.yml --profile prod up -d --build
```

- Editing `infra/Caddyfile` or the SPA requires a **web image rebuild** (above).
- Changing `VITE_API_BASE_URL` requires a rebuild (it's baked in).
- `.env`-only changes: `... up -d` (no `--build`) is enough.
- **Before deploying the hardening-02-lifecycle PR:** the api now refuses to
  boot in production if `SESSION_SECRET` is the `dev-secret` default or under
  32 chars (see `server.ts`). Confirm the prod value (SSM
  `/boneless/prod/SESSION_SECRET` or `.env`) is a strong generated secret
  **before** merging that PR — generate one with the same one-liner as
  step 4 if unsure. This is intentional fail-closed behavior, not a bug: a
  weak session secret means every login cookie is forgeable.

---

## 10. Cost & credits

- **New-account credits:** up to **$200** ($100 signup + $100 from activities),
  expire 12 months. Year 1 ≈ $0 for this footprint.
- **Switch to a Paid Plan early** — new "Free Plan" accounts auto-close at 6
  months / credit exhaustion, and Savings Plans require Paid Plan.
- **Graviton (`t4g`)** — already chosen; ~20% cheaper than x86.
- **Compute Savings Plan** — once the instance size is settled, commit 1 year
  for ~30–60% off the box.
- **Cloudflare** — DNS, CDN, TLS, DDoS all free; egress savings are incidental
  (AWS isn't in the Bandwidth Alliance, so origin pulls are still billed — but
  cached static assets make that ~$0, and it was already free under the prior
  CloudFront 1 TB tier).

Rough steady state: **~$13–18/mo** (compute + EBS + one public IPv4 + tiny
Route-53-free DNS). The single public IPv4 is ~$3.60/mo and unavoidable.

---

## Notes / gotchas

- **Reverse-proxy IP trust:** `server.ts` sets `trust proxy = 1` and
  `infra/Caddyfile` restores the real visitor IP from Cloudflare's
  `Cf-Connecting-IP` (only trusting Cloudflare ranges). This keeps the IP-based
  rate limiters bucketed per real client. Keep the Caddyfile Cloudflare ranges
  in sync with the security group.
- **Single instance is required** by the current design: rate limits and some
  caches are in-memory, and background jobs (4 h news refresh, loan/economy
  sweeps) assume one process. Don't run a second api replica without moving that
  state to Redis first.
- **Cookies:** apex + `api.` share the registrable domain → same-site, so the
  existing `sameSite=lax` session cookie works across them. CORS is already
  pinned to `WEB_ORIGIN`.
- **`docker compose up` with no `--profile prod`** starts only Postgres — that's
  the dev shortcut (`npm run db:up`), harmless on the box.

```

```
