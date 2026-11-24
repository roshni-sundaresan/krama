# Krama — Idealake AI Engineering Framework (Phase 1)

*Engineering, The Intelligent Way.*

Krama brings Idealake's delivery lifecycle into one governed flow: specialised AI agents do the drafting
and checking, and people approve every gate. Phase 1 covers two paths:

```
BA path         Intake pack (form, SOW, MOMs, iDhi) ─► masking ─► BRD drafted by AI (20 sections, cited)
                ─► BA confirms ─► Deep Audit at submission ─► BA Lead approves ─► client sign-off recorded
Build path      Tech Architect confirms domain, selects stack (ADR) ─► guardrails pack generated ─► approved
                ─► Developer confirms software checklist ─► downloads AGENTS.md, pack, blueprints
                ─► works in their own repo and AI tool ─► optional project check in Krama (ZIP or repo link)
```

FSD, UI/UX, API specification and the Testing screens are shown as **Next release**. Defects are not
tracked in Krama, there are no client logins in Phase 1, and nothing is installed on developer machines.

## What is in the repo

```
apps/web            Next.js 16 web app (Auth.js: Microsoft Entra ID; sample-user login for local only)
apps/api            NestJS + Prisma API (OpenAPI at /api/docs)
packages/shared     roles and permissions, domains, stacks, guardrail catalogue, masking, BRD checks
packages/workflows  Temporal workflows (BRD drafting, Deep Audit) and the TypeScript worker
packages/guardrails rule engine used by the project check and by CI (server side only)
workers/ai          Python AI worker: model gateway with a stub provider (Bedrock later)
infra/              docker-compose.yml for a single machine
docs/               architecture.md
```

## Checks on every pull request

`.github/workflows/ci.yml` runs on every pull request and on `main`:

- Node: lint, typecheck, unit tests, build, dependency audit (high and critical)
- AI worker: ruff and pytest
- Secret scan: gitleaks

In GitHub, protect `main`: require a pull request with one approving review, and require the three CI
jobs to pass before merging.

## Run it on a Mac (Docker Desktop)

You need Docker Desktop 4.x and about 6 GB of free memory for Docker.

```bash
cp .env.example .env
docker compose -f infra/docker-compose.yml up -d --build
docker compose -f infra/docker-compose.yml run --rm api pnpm db:seed
```

Open http://localhost:3000. Other consoles: API docs http://localhost:4000/api/docs · Temporal UI
http://localhost:8080 · MinIO http://localhost:9001.

To stop: `docker compose -f infra/docker-compose.yml down` (add `-v` to delete the data as well).

## Run it without Docker (for development)

Prerequisites: Node 22.12 or later, pnpm 10, Python 3.11 or later, PostgreSQL 16 with pgvector, and the
Temporal CLI (`brew install temporal`).

```bash
cp .env.example .env
pnpm install && pnpm build
# Postgres: create role and database krama/krama, then in that database:  CREATE EXTENSION vector;
pnpm --filter @krama/api prisma:deploy      # migrations, including the audit-log immutability trigger
pnpm db:seed                                # 11 sample users (one per role) and 3 sample projects
temporal server start-dev                   # terminal 1 — localhost:7233
pnpm --filter @krama/api start              # terminal 2 — API on :4000
pnpm dev:worker                             # terminal 3 — TypeScript worker
cd workers/ai && python3 -m venv .venv && .venv/bin/pip install -e '.[dev]' \
  && set -a && . ../../.env && set +a && .venv/bin/krama-ai-worker      # terminal 4 — AI worker
pnpm --filter @krama/web dev                # terminal 5 — web on :3000
```

## Try both paths

On the sign-in page, use **Sign in as a sample user** (local only). All sample users are
`@idealake.local`; real sign-in accepts `@idealake.com` accounts only.

| Step | Sign in as | Where | Do |
|---|---|---|---|
| 1 | Ravi Menon · BA | Loan Origination Portal → Intake pack | Import the iDhi meeting, tag it, check the masked copy, then **Start BRD drafting** |
| 2 | BA | BRD | Confirm requirements and statements, add Given / When / Then, answer or accept lens questions, then **Run Deep Audit & submit** |
| 3 | Sanjay Kulkarni · BA Lead | Deep Audit & approval | **Approve as BA Lead** (or request changes) |
| 4 | BA | Deep Audit & approval | **Record client sign-off** |
| 5 | Meera Nair · Tech Architect | Tech stack & guardrails | Pick a stack, confirm the domain, save (ADR), **Approve pack**, assign a developer |
| 6 | Arjun Rao · Developer | Development | Confirm the checklist, download AGENTS.md and the pack, upload a ZIP for the optional check |
| 7 | Kavita Iyer · Super Admin | Access administration | Give access, change roles, deactivate |

*Investor Services App* (Mutual Funds) is seeded already signed off with an approved pack.
*Dealer Onboarding* (General) starts empty at intake.

## Tests

```bash
pnpm lint && pnpm typecheck && pnpm test
cd workers/ai && .venv/bin/pytest -q && .venv/bin/ruff check .
```

The workflow test downloads Temporal's test server on first run; set `KRAMA_SKIP_TEMPORAL_TESTS=1`
to skip it offline.

## Settings

Every variable is described in [.env.example](.env.example). The ones that matter first:

| Variable | Purpose |
|---|---|
| `AUTH_DEV_LOGIN`, `NEXT_PUBLIC_DEV_LOGIN`, `DEV_EXTRA_EMAIL_DOMAINS` | Sample-user login. **Set false / empty anywhere shared.** |
| `AUTH_MICROSOFT_ENTRA_ID_*`, `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID` | Microsoft sign-in |
| `API_JWT_SECRET`, `INTERNAL_API_TOKEN`, `AUTH_SECRET` | Secrets. Change them for any shared environment. |
| `MODEL_PROVIDER` (`stub` / `bedrock`), `BEDROCK_*` | AI provider. Stub is the default and needs no credentials. |
| `STORAGE_DRIVER` (`local` / `s3`), `S3_*` | Where uploaded files are kept |
| `CLAMAV_HOST` | Malware scanning; without it Krama uses its built-in check |
| `IDHI_MODE` | `mock` returns sample meetings |

## Not done yet

- **Bedrock**: the stub provider produces repeatable, cited output. The Bedrock provider is written but
  has not run against AWS; model IDs must be confirmed.
- **iDhi**: mock meetings only, until the iDhi API is available.
- **Microsoft sign-in**: wired, but untested without an Entra tenant.
- **Next release**: FSD, UI/UX, API specification, test case generator and testing tracker.
- **Deployment**: to be decided after the local build is accepted.
