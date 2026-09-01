# Cloud Agent development environment

This directory configures the self-contained development environment used by Cursor
Cloud Agents for Academy Portal. It runs a full local Supabase stack inside the agent
VM, so the login-gated app works end to end without any external secrets.

## Lifecycle

| Phase | File | What it does |
| --- | --- | --- |
| `install` | `install.sh` | Installs Docker + `fuse-overlayfs` + `postgresql-client`, the Supabase CLI, project dependencies (`pnpm install --frozen-lockfile`), and pre-pulls the Supabase images so first boot is fast. |
| `start` | `start.sh` | Starts `dockerd` (fuse-overlayfs storage driver, relaxed bridge netfilter for the nested VM), brings up Supabase, then runs `local-supabase/setup.sh`. |
| `terminals` | `pnpm dev --hostname 0.0.0.0` | The Next.js dev server, reachable at http://localhost:3000. |

`local-supabase/setup.sh` is idempotent: it creates the demo Auth users, applies the
migrations on a fresh database, exposes the `academy_v2` schema to PostgREST, and writes
`.env.local` (pointed at the local Supabase URL and publishable key).

## Demo accounts

All seeded accounts share the password `portaldev123` (override with `ACADEMY_DEV_PASSWORD`).

| Email | Role |
| --- | --- |
| `alanclifford.filart@tuv.com` | Administrator |
| `alan.test@tuv-portal.local` | Operations |
| `romely.test@tuv-portal.local` | Operations / Sales supervisor |
| `joane.test@tuv-portal.local` | Sales |
| `melis.test@tuv-portal.local` | Sales |
| `pinky.test@tuv-portal.local` | Manager |
| `qa-axe-bot@tuv-training-portal.netlify.app` | Auditor |

## Useful commands

- App: http://localhost:3000 · Supabase Studio: http://localhost:54323
- Re-run setup against the running stack: `bash .cursor/local-supabase/setup.sh`
- End-to-end tests (needs the stack running): `pnpm test:e2e`
