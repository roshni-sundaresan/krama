# Krama architecture (Phase 1)

## Principles

- **People approve every gate.** The BA Lead approves the BRD, Krama checks the client sign-off before
  the next phase opens, and the Tech Architect approves the guardrails pack before anyone can download it.
- **Masked data only reaches AI.** Uploads are scanned for malware, then text is extracted and personal
  data (email, PAN, IFSC, card, Aadhaar, phone, account) is masked in the API. The BA confirms the masked
  copy (IN-G01). Workflows only ever receive masked text. Instruction-like text in a document is flagged
  and treated as data.
- **Traceability.** Every requirement cites a source (BA-G01). Every BRD statement is either cited or
  marked AI-drafted until a BA confirms it (BA-G10).
- **Roles are checked on the server on every request.** The API re-reads the user's roles from the
  database each time, so a revoked role stops working at once. The web app only hides what the API
  would refuse anyway. Only @idealake.com accounts can sign in.
- **Audit from day one.** Every table carries `tenantId`. `AuditLog` is append-only, and a database
  trigger blocks UPDATE, DELETE and TRUNCATE. Downloads are logged too.
- **Nothing runs on developer machines.** Developers download AGENTS.md, the pack and the checklist, and
  work in their own repository with an approved AI tool. The optional project check runs on the Krama
  server against an uploaded ZIP or a repository link; it reads code and never changes it.

## Components

```
Browser ─► apps/web (Next.js, server-side only) ─► apps/api (NestJS) ─► PostgreSQL + pgvector
                    the API token stays in the                 │        object storage (local disk / MinIO / S3)
                    encrypted session cookie                   │
                                                               └─start─► Temporal
                                                                          ├─ brdDraftWorkflow   (TS worker)
                                                                          │    extractRequirements ─┐
                                                                          │    lensFindings        ├─► AI worker (queue "ai")
                                                                          │    draftBrd            ─┘    model gateway ─► stub | Bedrock
                                                                          │    events ─► API /internal/runs/:id/events
                                                                          └─ deepAuditWorkflow  (at submission)
```

## Gates and rules

| Gate | Checked by | Rules |
|---|---|---|
| Ready to draft | Krama | IN-G01 masked, IN-G02 intake form and sign-off owner, IN-G03 SOW, IN-G04 MOM or client document, IN-G05 tagged |
| Submit BRD | Krama + Deep Audit | BA-G01/05/07/09/10/13, BRD-G02 (20 sections); no CRITICAL_BLOCKER (BRD-G11) |
| BRD approval | BA Lead | Approve or request changes |
| Next phase | Krama | Client sign-off recorded (and not withdrawn) |
| Stack and pack | Tech Architect | Domain confirmed, ADR recorded, pack approved before download |
| Development | Developer | Checklist confirmed; optional project check; exceptions only for waivable rules, with an expiry |

## Guardrails pack

Krama composes each project's pack from the master catalogue (`packages/shared/src/catalog.ts`) using the
project's domain, regulated entity type, platforms, stack and flags (existing production, government,
accessibility). The pack records the regulation versions it used and is frozen at the version approved.
Downloads: guardrails per vertical (Word or Markdown), blueprints, AGENTS.md for AI coding agents, the
software checklist, and guardrails.json for CI.

## Deferred

- Deployment target (decided after the local build is accepted).
- Bedrock (stub provider until access is confirmed), the live iDhi API, and Entra ID testing.
- FSD, UI/UX, API specification and Testing (next release).
