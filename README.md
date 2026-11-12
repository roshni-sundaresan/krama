# Krama — Idealake AI Engineering Platform (Phase 1 skeleton)

Krama is Idealake's internal AI engineering platform. Capabilities (agents, tools, products) work
only through a central orchestration layer, and **a human approves every phase**. Phase 1 proves one
end-to-end path:

```
iDhi meeting import / BA upload ─► Documentation capability (requirements + citations, gap report)
  ─► BA review ─► Approver approves requirements ─► draft BRD / SOW / FSD (cited or "AI-suggested")
  ─► Approver approves ─► Execution wizard ─► developer's Krama CLI + approved local coding tool
  ─► branch krama-gen-<timestamp> ─► server-side guardrail check (required GitHub status)
```

## Architecture (4 layers)

| Layer | What | Where |
|---|---|---|
| 1. Experience | Next.js 16 web app (Auth.js: Entra ID + dev login), `krama` CLI on developer machines | `apps/web`, `packages/cli` |
| 2. Orchestration and governance | NestJS API (projects, artefacts, approvals, guardrails, exceptions, audit, capability registry, context pack); Temporal workflows with human-approval signals | `apps/api`, `packages/workflows` |
| 3. Capabilities | Documentation capability (Python Temporal activities on task queue `ai`); Execution wizard; guardrail checker | `workers/ai`, `packages/guardrails` |
| 4. Model and data | Model gateway (tiers haiku / sonnet / opus, token and cost logging) → Claude on Bedrock ap-south-1 (stub by default); PostgreSQL + pgvector, MinIO, Redis, Temporal | `workers/ai`, `infra/` |

See [docs/architecture.md](docs/architecture.md) for the flow and the key decisions.

```
apps/api            NestJS + Prisma API (OpenAPI at /api/docs)
apps/web            Next.js 16 App Router + Tailwind 4
packages/shared     zod schemas + shared types (roles, DTOs, guardrails, context pack)
packages/workflows  Temporal documentationWorkflow + TS worker
packages/guardrails rule engine + `krama-guardrails` CLI
packages/cli        `krama` developer CLI
workers/ai          Python AI worker (temporalio): ModelGateway, StubProvider, BedrockProvider
infra/              docker-compose.yml
.github/workflows   ci.yml + templates/krama-guardrails.yml (copy into generated repos)
```

## Running locally

Prerequisites: Node 22.12 or later, pnpm 10, Python 3.11 or later. For the no-Docker path you
also need PostgreSQL 16 with the pgvector extension and the Temporal CLI.

```bash
cp .env.example .env
pnpm install
pnpm build                                     # builds shared → guardrails/workflows/cli → api → web
```

### With Docker

```bash
docker compose -f infra/docker-compose.yml up -d --build
docker compose -f infra/docker-compose.yml run --rm api pnpm db:seed
```
Web: http://localhost:3000 · API docs: http://localhost:4000/api/docs · Temporal UI: http://localhost:8080 · MinIO: http://localhost:9001

### Without Docker

```bash
# 1. Postgres: create role/db krama/krama, then:   CREATE EXTENSION vector;
pnpm --filter @krama/api prisma:deploy           # apply migrations (includes the audit immutability trigger)
pnpm db:seed                                     # demo tenant, one user per role, guardrails, 2 projects
# 2. Temporal dev server
temporal server start-dev                        # localhost:7233, UI on :8233
# 3. Processes (separate terminals)
pnpm --filter @krama/api start                   # API on :4000 (STORAGE_DRIVER=local → .data/uploads)
pnpm dev:worker                                  # TS worker (task queue krama-orchestration)
cd workers/ai && python -m venv .venv && .venv/bin/pip install -e '.[dev]' \
  && set -a && . ../../.env && set +a && .venv/bin/krama-ai-worker   # Python worker (task queue ai)
pnpm --filter @krama/web dev                     # web on :3000
```

Sign in with **Dev login** and pick a role: `ba@`, `dev@`, `architect@`, `approver@`, `admin@` or
`challenger@idealake.local`.
Demo: as BA, open *Claims Portal (sample)* → Inputs → import an iDhi meeting → *Run Documentation
capability* → Requirements → *Submit*. As approver, use Approvals → *Approve*. Then, as BA, use
Documents → *Submit*, and as approver, *Approve*. Finally, as dev, use Build. *Leave Tracker (ready to build)*
is seeded in the BUILD phase so `krama pull` works immediately.

### Developer CLI

```bash
node packages/cli/dist/index.js login --server http://localhost:4000 --token <token from Build tab>
node packages/cli/dist/index.js check            # required software from .krama/checklist.json
node packages/cli/dist/index.js pull <projectId> # writes .krama/{AGENTS.md,ADR.md,requirements.md,guardrails.json,exceptions.json,checklist.json}
node packages/cli/dist/index.js run --tool claude --dry-run
node packages/cli/dist/index.js push             # branch krama-gen-<timestamp>, commit, push
node packages/guardrails/dist/cli.js check . --rules .krama/guardrails.json --exceptions .krama/exceptions.json --mode governed
```

### Tests

```bash
pnpm lint && pnpm typecheck && pnpm test        # TS: shared, guardrails, cli, workflows (Temporal test server), api
cd workers/ai && .venv/bin/pytest -q && .venv/bin/ruff check .
```
The workflow test downloads Temporal's time-skipping test server on first run. To skip it
offline, set `KRAMA_SKIP_TEMPORAL_TESTS=1`.

## Environment variables

All are listed with comments in [.env.example](.env.example). The key ones:

| Variable | Used by | Purpose |
|---|---|---|
| `DATABASE_URL` | api | PostgreSQL (pgvector) |
| `API_JWT_SECRET`, `INTERNAL_API_TOKEN` | api, ts-worker | API JWT signing; worker → API callback secret |
| `AUTH_SECRET`, `AUTH_URL`, `KRAMA_API_URL` | web | Auth.js session encryption; API base URL |
| `AUTH_DEV_LOGIN` / `NEXT_PUBLIC_DEV_LOGIN` | api / web | mock login (**dev only**) |
| `AUTH_MICROSOFT_ENTRA_ID_ID/_SECRET/_ISSUER`, `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID` | web / api | Entra ID SSO and id_token verification |
| `STORAGE_DRIVER` (`local`/`s3`), `S3_*` | api | uploads to MinIO/S3 or local disk |
| `IDHI_MODE` (`mock`/`http`), `IDHI_*` | api | iDhi adapter |
| `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE` | api, workers | self-hosted Temporal |
| `MODEL_PROVIDER` (`stub`/`bedrock`), `BEDROCK_REGION`, `BEDROCK_MODEL_{HAIKU,SONNET,OPUS}` | ai-worker | model gateway |

## What is stubbed (TODO)

- **Bedrock**: `MODEL_PROVIDER=stub` is the default. The deterministic `StubProvider` produces cited
  output using heuristics. `BedrockProvider` is implemented with boto3 `invoke_model` but has not been
  run against AWS. Model ids and prices in `workers/ai/src/krama_ai/config.py` must be confirmed.
- **iDhi**: `MockIdhiAdapter` returns two canned meetings. `HttpIdhiAdapter` throws until the iDhi API
  contract is known.
- **Entra ID**: the Auth.js provider and the API's JWKS-verified `/auth/entra/exchange` are wired, but
  untested without a tenant. Roles come from Entra app roles; users without app roles default to
  read-only Challenger. Local use relies on the dev credentials provider.
- **Kshana**: only an adapter interface stub (`apps/api/src/integrations/kshana.adapter.ts`), as a future plugin.
- **Text extraction**: only text formats (txt, md, csv, json, vtt). PDF and DOCX files are stored without text.
- **CI token** for the guardrail workflow: use a CLI token for now. A dedicated service principal is a TODO.
- **pgvector**: a `SourceChunk.embedding` column exists; nothing writes embeddings yet. Redis is provisioned but unused.

## Next steps

1. Bedrock access: run `BedrockProvider` end to end, add evals per capability, and record `evalScore` in the registry.
2. Real iDhi adapter via iDhi SSO/APIs; PDF and DOCX extraction activity; chunking and embeddings.
3. Project membership and per-project authorization, plus Postgres row-level security keyed on `tenant_id`.
4. Publish `@krama/cli` and `@krama/guardrails` to the internal registry; add a CI service principal.
5. Kubernetes manifests or Helm. Production Temporal comes from the infra team.
6. Execution wizard blueprints (versioned per technology), with scaffold templates in the context pack.
