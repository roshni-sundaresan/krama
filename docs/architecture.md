# Krama architecture (Phase 1)

## Principles
- **Orchestration-only access.** Capabilities never call each other directly. Krama starts them
  through Temporal workflows and records their outputs through the API.
- **Humans approve every phase.** Workflow gates wait on Temporal signals (`approveRequirements`,
  `approveDocuments`, `returnWithComments`, `reject`) and never time out. Approvals are separate from
  requests: you cannot approve your own request.
- **Traceability.** Every requirement cites at least one source (`sourceItemId`, quote, location). Every
  document statement is either cited or flagged `aiSuggested`. The AI worker enforces both rules after
  every model call, whatever the provider returns.
- **Tenant and audit from day one.** Every table has `tenantId`. `AuditLog` is append-only, and a
  database trigger blocks `UPDATE`, `DELETE` and `TRUNCATE`. A global interceptor audits every
  mutating request, and services add domain events on top.
- **Guardrails are enforced on the server.** Code is generated on the developer's machine, so
  enforcement runs in GitHub Actions as a required status check. Rules and approved exceptions are
  fetched from the Krama API, never read from the repository.

## Phase 1 flow

```
web/API ──start──► Temporal: documentationWorkflow (TS worker, queue krama-orchestration)
                     ├─ extractRequirements ─► Python worker (queue ai) ─► ModelGateway ─► Stub | Bedrock
                     ├─ gapReport           ─► Python worker
                     ├─ recordRunEvent      ─► API /internal/runs/:id/events (persist + token usage + audit)
                     ├─ wait: approveRequirements | returnWithComments (loop) | reject
                     ├─ draftDocument × {BRD, SOW, FSD}
                     └─ wait: approveDocuments | returnWithComments (loop) | reject ─► COMPLETED (phase BUILD)
developer ─ krama pull ─► GET /projects/:id/context-pack (AGENTS.md, ADR, requirements, guardrails, exceptions, checklist)
          ─ krama run  ─► approved local tool (claude | copilot | codex)
          ─ krama push ─► krama-gen-<ts> ─► PR ─► krama-guardrails required check (self-hosted runner)
```

## Roles
| Role | Can |
|---|---|
| BA | create projects, add inputs, start Documentation runs, submit requirements and documents |
| Approver | approve, return or reject requirement and document gates |
| LeadArchitect | publish guardrail versions, set depth mode and approved tools, decide exception requests, record ADRs |
| Developer | read everything in their tenant, pull context packs, request guardrail exceptions |
| Admin | everything, including the capability registry |
| Challenger | read-only (any non-GET request is rejected) |

## Guardrails
- A rule has `level` BLOCK or WARN, an optional `nonWaivable` flag, an `appliesTo` glob list and `params`.
- Rule types: `no-secrets`, `max-file-length`, `max-function-length`, `prohibited-pattern`, `require-tests-dir`.
- Depth modes: **Skeleton** and **Guided** apply the levels as configured. **Governed** treats WARN as BLOCK.
- Exceptions have a rule, reason, scope (`project` or `change` plus a branch ref), optional paths and
  an expiry of at most 180 days. A Lead Architect decides them. The checker honours only APPROVED,
  unexpired exceptions, and never honours them for non-waivable rules. The platform-mandated rules
  (secrets, unapproved AI providers, disabling audit) cannot be weakened by any rule-set version.
- Every edit creates a new immutable rule-set version.

## Model gateway
`ModelGateway.complete(task, …)` picks a tier from `TASK_TIERS` (haiku for simple tasks, sonnet by
default, opus for hard ones; callers can override the tier). It calls the provider, computes cost from
the per-tier pricing table and emits `UsageRecord`s to hooks. The usage records also travel back with
the activity result and are stored in `TokenUsage`, keyed by tenant, project and run.

## Deployment
Phase 1 runs on Docker Compose on Idealake servers (`infra/docker-compose.yml`). Kubernetes comes
later. Temporal is self-hosted (production: the infra team's deployment). Postgres runs pgvector,
object storage is MinIO, and CI uses GitHub Actions on self-hosted runners.
