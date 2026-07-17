# MySwarms — Operations Runbook

Deploy/env reliability for the two production surfaces. Written after a P0 where
the BFF could not sign the internal JWT because an env var was added **after** the
running deployment was built.

There are **two independent deploy targets**:

| Surface | Host | Code path | Auto-deploy on push to `main`? |
|---|---|---|---|
| **BFF** (Next.js) | Vercel · project `myswarms` | `src/**` | **Yes** — git-linked (`Hearst-Corporation/myswarms`, production branch `main`) |
| **Engine** (FastAPI) | Railway · service `crewai-engine` (env `production`) | `services/crewai-engine/**` | **No** — manual `railway up` required every time |

---

## ⚠️ Golden rule: an env-var change does NOT apply to a running deployment

Both Vercel and Railway **snapshot environment variables at build/deploy time**.
Setting or changing a variable on the dashboard/CLI has **no effect on the
already-running deployment**. You MUST trigger a fresh deploy AND verify the
runtime picked it up.

> Root cause of the JWT P0: `CREWAI_ENGINE_JWT_SECRET` was present in Vercel
> (Production), and its value matched the engine — but the live BFF deployment had
> been built before the var was attached, so `process.env.CREWAI_ENGINE_JWT_SECRET`
> was `undefined` at runtime. `createEngineInternalToken()` threw, `authedFetch`
> dropped the `X-Internal-Auth` header, and the engine answered
> `401 {"detail":"Missing internal auth token"}`. The fix was a **redeploy**, not an
> env change.

**Whenever you add/change an env var, redeploy the surface that reads it, then verify.**

---

## BFF (Vercel) — env change checklist

1. Set/confirm the variable (value never printed):
   ```bash
   vercel env ls production --scope hearst-corporation --token "$VERCEL_TOKEN"
   ```
2. **Redeploy** (env changes need it even though git auto-deploy is on):
   ```bash
   vercel redeploy <current-prod-deployment-url> --target production \
     --scope hearst-corporation --token "$VERCEL_TOKEN"
   # or: push an empty commit / re-run the latest GitHub deployment
   ```
3. Verify runtime:
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' https://myswarms.vercel.app/login          # 200
   curl -s https://myswarms.vercel.app/api/system/status                                # engine: ok
   # And reload an owner-scoped page (/swarms) with a logged-in session → no 401.
   ```

Notes:
- The Vercel token must be scoped to the **`hearst-corporation`** team, not a
  personal account, or env/deploy commands return "You do not have access".
- `vercel link` writes `VERCEL_OIDC_TOKEN`/`VERCEL_TOKEN` into `.env.local` and
  creates `.vercel/` — both are gitignored; remove the link cruft when done.

---

## Engine (Railway) — deploy checklist (no GitHub auto-deploy)

The Railway `crewai-engine` service is **not** wired to deploy on push. Every
engine change (and every engine env change) needs a manual deploy. Use the
helper, which bundles deploy + health + a security smoke:

```bash
./scripts/deploy-engine.sh
```

Manual equivalent:
```bash
# 1. (if env changed) set it first, skipping the auto-deploy:
#    railway variables --set-from-stdin KEY -s crewai-engine -e production --skip-deploys < value.txt
cd services/crewai-engine
railway up -s crewai-engine -e production --ci
# 2. verify:
curl -s -o /dev/null -w '%{http_code}\n' https://crewai-engine-production.up.railway.app/health   # 200
# 3. security smoke (no secrets printed) — see scripts/deploy-engine.sh
```

The `railway up` log stream can time out on the CLI side (`reqwest error /
operation timed out`) while the build still succeeds — confirm with:
```bash
railway deployment list -s crewai-engine -e production   # newest row should be SUCCESS
```

---

## Pre-merge / pre-deploy gate

Before merging or deploying anything that touches the engine, run the
tenant-isolation regression (mock-only, no secrets):

```bash
npm run test:security        # === bash scripts/security-regression.sh
```

It must be green (R1·R3·R2·R5·R6). See [scripts/security-regression.sh](../scripts/security-regression.sh).

---

## "Did my change actually ship?" quick checks

| Symptom | Likely cause | Fix |
|---|---|---|
| Owner-scoped route → `401 Missing internal auth token` | BFF runtime lacks `CREWAI_ENGINE_JWT_SECRET` (stale deploy) | Redeploy BFF, verify runtime |
| Owner-scoped route → `401 Invalid internal token` | BFF secret ≠ engine secret | Re-sync both to the same value, redeploy both |
| Engine change not visible in prod | No Railway auto-deploy | `./scripts/deploy-engine.sh` |
| New env var has no effect | Snapshot-at-build | Redeploy the reading surface |
