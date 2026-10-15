# Deploying `abzar/api` to a fresh Ubuntu server

Target: one Ubuntu VPS running Docker Compose (API + MongoDB single-node replica set +
Redis), with **host** nginx terminating TLS and reverse-proxying to `127.0.0.1:4000`.

```
browser ──https──> nginx (host, certbot)
                     └─http─> api :4000 (docker, loopback-bound)
                                └── mongo:27017, redis:6379  (internal network, not published)
```

## 0. Before you start

- A domain (e.g. `api.technorextools.com`) with an **A record already pointing at the server IP** —
  certbot fails otherwise.
- SSH access as `root` with your public key in `/root/.ssh/authorized_keys`.
- Credentials at hand: Melipayamak (API key + pattern ids), ZarinPal merchant id, and the
  S3-compatible bucket (ArvanCloud / Liara) endpoint + keys.

## 1. Bootstrap the server (once, as root)

```bash
ssh root@<server-ip>
apt-get update -y && apt-get install -y git
git clone <repo-url> /opt/abzar-api && cd /opt/abzar-api
bash deploy/setup-server.sh api.technorextools.com mohamadshamekhi79@gmail.com deploy
```

Installs Docker + compose plugin, nginx, certbot (+ auto-renew timer), ufw (SSH/HTTP/HTTPS
only), fail2ban, a 2 GB swapfile, the nginx vhost, and issues the TLS certificate.

## 2. Configure and deploy (as the `deploy` user)

```bash
su - deploy
git clone <repo-url> ~/abzar-api && cd ~/abzar-api
cp deploy/env.production.example .env.production
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 32   # API_SERVICE_TOKEN
nano .env.production   # fill everything — see the table below
bash deploy/deploy.sh --seed
```

`--seed` runs `prisma db push` + `prisma db seed` (permission catalog, system roles,
superadmin, settings). Use it on the **first** deploy and after any `schema.prisma` change;
plain `bash deploy/deploy.sh` for a code-only redeploy.

### Values that must be right

| Var | Value |
| --- | --- |
| `DATABASE_URL` | `mongodb://mongo:27017/abzar?replicaSet=rs0` — service name, not localhost |
| `REDIS_URL` | `redis://redis:6379` |
| `JWT_SECRET` | ≥ 32 chars, from `openssl rand -hex 32` |
| `CORS_ORIGIN` | the storefront + backoffice origins, comma-separated, **https** |
| `OTP_DEV_ECHO` | `false` — the process refuses to boot otherwise in production |
| `PAYMENT_CALLBACK_BASE_URL` | `https://api.technorextools.com` — the gateway returns the browser to `${this}/api/v1/payment/callback` |
| `PAYMENT_RESULT_REDIRECT_URL` | `https://www.technorextools.com/checkout/result` |
| `PAYMENT_PROVIDER` | `fake` for now — **it marks every order paid without charging anyone**. Flip to `zarinpal` (+ `ZARINPAL_MERCHANT_ID`, `ZARINPAL_SANDBOX=false`) before real customers check out |
| `SEED_SUPERADMIN_MOBILE` | the mobile that gets the superadmin role on seed |

## 3. Verify

```bash
curl -fsS https://api.technorextools.com/health
curl -fsS https://api.technorextools.com/api/v1/storefront/catalog/products
```

Then log in as the superadmin: `POST /api/v1/auth/otp/request` → the SMS arrives on
`SEED_SUPERADMIN_MOBILE` → `POST /api/v1/auth/otp/verify`.

## 4. Day two

```bash
cd ~/abzar-api
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f api
docker compose -f docker-compose.prod.yml --env-file .env.production ps
docker compose -f docker-compose.prod.yml --env-file .env.production restart api
bash deploy/deploy.sh          # redeploy latest main
```

Backups — add to the `deploy` user's crontab:

```
30 3 * * * /home/deploy/abzar-api/deploy/backup-mongo.sh >> /home/deploy/backup.log 2>&1
```

## Notes

- **Mongo and Redis are never published to the host.** Only `127.0.0.1:4000` is, and ufw
  blocks everything but 22/80/443. Don't add a `ports:` mapping to `mongo`.
- The replica set is required by Prisma for transactions; the compose healthcheck
  self-initiates it on first start with member host `mongo:27017`.
- `migrate` builds a separate `tooling` image stage because the seed runs through `ts-node`,
  which is not in the runtime image. Never run `tooling` as the server.
- The API sets `trust proxy = 1`, so rate limiting buckets by the real client IP from
  nginx's `X-Forwarded-For`. If you ever put Cloudflare or a second proxy in front, raise
  that number in `src/main.ts` to match the hop count.
- File uploads are ≤ 50 MB; nginx is set to `client_max_body_size 55m` to match.

## 5. Automated deploy (GitHub Actions)

The workflow (`.github/workflows/ci.yml`) runs `verify` + `e2e` on every push/PR; `deploy`
only runs after both pass **and** the push is to `main`. To enable it once:

```bash
# on the server, as the deploy user
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N "" -C "github-actions-deploy"
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys
ssh -i ~/.ssh/github_deploy deploy@api.technorextools.com "echo CONNECTED_OK"   # test
```

Then in the GitHub repo → Settings → Secrets and variables → Actions, preferably under the
`production` **Environment** (matching the workflow's `environment: production` on the
`deploy` job — a different environment name there means the secrets are never visible to the
job and you get a silent "missing server host" failure):

| Secret/Variable | Value |
| --- | --- |
| `DEPLOY_SSH_HOST` | `api.technorextools.com` (or the server IP) |
| `DEPLOY_SSH_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | the whole private key generated above (BEGIN…END) |
| `DEPLOY_PATH` | `/home/deploy/abzar-api` |
| `DEPLOY_SEED` (Variable, optional) | set to `1` only for a deploy that must run `prisma db push` + seed |

The job SSHes in via `appleboy/ssh-action` and runs `bash deploy/deploy.sh`, which
`git pull --ff-only`s, builds, restarts and waits for `/health` — a failed health check fails
the job and prints the last 50 log lines.
