import { ConflictException, ForbiddenException, HttpStatus, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { GuardrailVersion, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CATALOG, canManageVertical, NEW_RULE_PREFIX, VERTICAL_LABELS, VERTICALS, type CatalogRule, type Vertical } from "@krama/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { StorageService } from "../storage/storage.service.js";
import { APP_CONFIG, type AppConfig } from "../config.js";
import { fail, problem } from "../common/errors.js";
import { extensionOf, scanBuffer } from "../sources/extract.js";
import type { AuthUser } from "../common/auth-user.js";

/** Revised guardrail documents may be Word or PDF only. */
const DOC_TYPES: Record<string, string> = {
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pdf": "application/pdf",
};
const MAX_DOC_MB = 20;

export const RuleInputSchema = z.object({
  id: z.string().trim().max(20).optional(),
  topic: z.string().trim().min(1).max(40),
  title: z.string().trim().min(3).max(120),
  text: z.string().trim().min(10).max(2000),
  level: z.enum(["NON_WAIVABLE", "BLOCK", "WARN"]),
  sources: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  retired: z.boolean().optional(),
});
export type RuleInput = z.infer<typeof RuleInputSchema>;

export const UpdateDraftSchema = z.object({
  changeNote: z.string().trim().max(2000).optional(),
  rules: z.array(RuleInputSchema).max(500).optional(),
});
export type UpdateDraftInput = z.infer<typeof UpdateDraftSchema>;

export const PublishSchema = z.object({ changeNote: z.string().trim().min(10, "Describe what changed (at least 10 characters)").max(2000) });

/** A stored rule carries `retired` so leads can see what was removed in a version. */
export type StoredRule = CatalogRule & { retired?: boolean };

export interface VersionSummary {
  id: string;
  vertical: Vertical;
  version: number;
  status: GuardrailVersion["status"];
  changeNote: string;
  ruleCount: number;
  retiredCount: number;
  document: { name: string; type: string } | null;
  createdBy: string;
  publishedBy: string | null;
  publishedAt: Date | null;
  createdAt: Date;
}

/**
 * Master guardrails per vertical, versioned. Version 1 is the built-in catalogue; a lead creates a
 * draft, edits / adds / retires rules or uploads a revised Word or PDF, then publishes it with a
 * change note. New and regenerated project packs use the latest published version; existing packs
 * keep the rules they were approved with.
 */
@Injectable()
export class GuardrailsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** The live master catalogue: the latest published version of each vertical, else the built-in rules. */
  async masterRules(tenantId: string): Promise<{ rules: CatalogRule[]; versions: Record<Vertical, number> }> {
    const published = await this.prisma.guardrailVersion.findMany({ where: { tenantId, status: "PUBLISHED" } });
    const versions = {} as Record<Vertical, number>;
    const rules: CatalogRule[] = [];
    for (const v of VERTICALS) {
      const p = published.find((x) => x.vertical === v);
      versions[v] = p?.version ?? 1;
      const vr = p ? (p.rules as unknown as StoredRule[]).filter((r) => !r.retired) : CATALOG.filter((r) => r.vertical === v);
      rules.push(...vr.map(({ retired: _retired, ...r }: StoredRule) => r));
    }
    return { rules, versions };
  }

  async overview(user: AuthUser) {
    const { rules, versions } = await this.masterRules(user.tenantId);
    const all = await this.prisma.guardrailVersion.findMany({ where: { tenantId: user.tenantId }, orderBy: [{ vertical: "asc" }, { version: "desc" }] });
    const names = await this.userNames(all.flatMap((v) => [v.createdById, v.publishedById]).filter((x): x is string => Boolean(x)));
    return VERTICALS.map((v) => ({
      vertical: v,
      label: VERTICAL_LABELS[v],
      canManage: canManageVertical(user.roles, v),
      liveVersion: versions[v],
      ruleCount: rules.filter((r) => r.vertical === v).length,
      draft: all.filter((x) => x.vertical === v && x.status === "DRAFT").map((x) => this.summary(x, names))[0] ?? null,
      history: all.filter((x) => x.vertical === v && x.status !== "DRAFT").map((x) => this.summary(x, names)),
    }));
  }

  async get(user: AuthUser, id: string) {
    const v = await this.find(user, id);
    const names = await this.userNames([v.createdById, v.publishedById].filter((x): x is string => Boolean(x)));
    return { ...this.summary(v, names), rules: v.rules as unknown as StoredRule[], canManage: canManageVertical(user.roles, v.vertical as Vertical) };
  }

  /** Start a new version from the live rules. Only one open draft per vertical. */
  async createDraft(user: AuthUser, vertical: Vertical) {
    this.assertCanManage(user, vertical);
    const open = await this.prisma.guardrailVersion.findFirst({ where: { tenantId: user.tenantId, vertical, status: "DRAFT" } });
    if (open) throw new ConflictException(`A draft (v${open.version}) is already open for ${VERTICAL_LABELS[vertical]}. Continue or discard it first.`);
    const { rules } = await this.masterRules(user.tenantId);
    const last = await this.prisma.guardrailVersion.findFirst({ where: { tenantId: user.tenantId, vertical }, orderBy: { version: "desc" } });
    const version = Math.max(last?.version ?? 1, 1) + 1;
    const draft = await this.prisma.guardrailVersion.create({
      data: { tenantId: user.tenantId, vertical, version, rules: rules.filter((r) => r.vertical === vertical) as unknown as Prisma.InputJsonValue, changeNote: "", createdById: user.id },
    });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "guardrails.draft_created", entityType: "guardrail_version", entityId: draft.id, data: { vertical, version } });
    return this.get(user, draft.id);
  }

  /** Save edits to a draft: change note and the full rule list (edited, added or retired rules). */
  async updateDraft(user: AuthUser, id: string, input: UpdateDraftInput) {
    const v = await this.draftOrThrow(user, id);
    const vertical = v.vertical as Vertical;
    const data: Prisma.GuardrailVersionUpdateInput = {};
    if (input.changeNote !== undefined) data.changeNote = input.changeNote;
    if (input.rules) data.rules = this.mergeRules(vertical, v.rules as unknown as StoredRule[], input.rules) as unknown as Prisma.InputJsonValue;
    await this.prisma.guardrailVersion.update({ where: { id }, data });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "guardrails.draft_updated", entityType: "guardrail_version", entityId: id, data: { vertical, rules: input.rules?.length ?? null } });
    return this.get(user, id);
  }

  /**
   * Keep built-in ids and machine checks; give new rules the next id for the vertical
   * (TEC-N01, BA-N01 ...). Ids must be unique; an id may not be reused after it is retired.
   */
  mergeRules(vertical: Vertical, previous: StoredRule[], input: RuleInput[]): StoredRule[] {
    const prevById = new Map(previous.map((r) => [r.id, r]));
    const seen = new Set<string>();
    const prefix = `${NEW_RULE_PREFIX[vertical]}-N`;
    let next = Math.max(0, ...[...prevById.keys()].filter((k) => k.startsWith(prefix)).map((k) => Number(k.slice(prefix.length)) || 0)) + 1;
    const out: StoredRule[] = [];
    for (const r of input) {
      let id = r.id?.trim();
      if (id && !prevById.has(id)) problem(`Rule ${id} is not in this draft. Leave the id empty for a new rule.`, HttpStatus.BAD_REQUEST, "GR-UNKNOWN-ID");
      if (!id) id = `${prefix}${String(next++).padStart(2, "0")}`;
      if (seen.has(id)) problem(`Rule ${id} appears twice.`, HttpStatus.BAD_REQUEST, "GR-DUPLICATE-ID");
      seen.add(id);
      const prev = prevById.get(id);
      out.push({
        ...(prev ?? {}),
        id,
        vertical,
        topic: r.topic,
        title: r.title,
        text: r.text,
        level: r.level,
        sources: r.sources?.length ? r.sources : undefined,
        retired: r.retired || undefined,
      });
    }
    // A rule left out of the list is retired, never silently deleted.
    for (const p of previous) if (!seen.has(p.id)) out.push({ ...p, retired: true });
    return out;
  }

  /** Attach a revised guardrail document (Word or PDF) to the draft. Scanned before storage. */
  async uploadDocument(user: AuthUser, id: string, file?: Express.Multer.File) {
    const v = await this.draftOrThrow(user, id);
    if (!file) problem("Choose a Word (.docx) or PDF file.", HttpStatus.BAD_REQUEST, "GR-NO-FILE");
    const ext = extensionOf(file.originalname);
    const type = DOC_TYPES[ext];
    if (!type) problem("Only Word (.docx) or PDF files can be uploaded as a guardrail document.", HttpStatus.UNSUPPORTED_MEDIA_TYPE, "GR-FILE-TYPE");
    if (file.size > MAX_DOC_MB * 1024 * 1024) fail("MSG-UPL-02", HttpStatus.PAYLOAD_TOO_LARGE, { limit: `${MAX_DOC_MB} MB` });
    const scan = await scanBuffer(file.buffer, { host: this.config.CLAMAV_HOST, port: this.config.CLAMAV_PORT });
    if (!scan.clean) {
      await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "guardrails.document_rejected_malware", entityType: "guardrail_version", entityId: id, data: { file: file.originalname, signature: scan.signature ?? "", engine: scan.engine } });
      fail("MSG-UPL-03", HttpStatus.UNPROCESSABLE_ENTITY);
    }
    const key = `${user.tenantId}/guardrails/${v.vertical.toLowerCase()}/v${v.version}/${randomUUID()}${ext}`;
    await this.storage.put(key, file.buffer, type);
    await this.prisma.guardrailVersion.update({ where: { id }, data: { documentKey: key, documentName: file.originalname.slice(0, 200), documentType: type } });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "guardrails.document_uploaded", entityType: "guardrail_version", entityId: id, data: { file: file.originalname, bytes: file.size } });
    return this.get(user, id);
  }

  async document(user: AuthUser, id: string) {
    const v = await this.find(user, id);
    if (!v.documentKey || !v.documentName || !v.documentType) throw new NotFoundException("No document was uploaded for this version");
    const body = await this.storage.get(v.documentKey);
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "guardrails.document_downloaded", entityType: "guardrail_version", entityId: id, data: { file: v.documentName } });
    return { name: v.documentName, type: v.documentType, body };
  }

  /** Publish: the draft becomes the live version for its vertical; the previous one is superseded. */
  async publish(user: AuthUser, id: string, changeNote: string) {
    const v = await this.draftOrThrow(user, id);
    const rules = v.rules as unknown as StoredRule[];
    if (!rules.some((r) => !r.retired)) problem("A version must keep at least one active rule.", HttpStatus.BAD_REQUEST, "GR-EMPTY");
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.guardrailVersion.updateMany({ where: { tenantId: user.tenantId, vertical: v.vertical, status: "PUBLISHED" }, data: { status: "SUPERSEDED" } });
      await tx.guardrailVersion.update({ where: { id }, data: { status: "PUBLISHED", changeNote, publishedById: user.id, publishedAt: now } });
      await this.audit.record(
        { tenantId: user.tenantId, actorId: user.id, action: "guardrails.published", entityType: "guardrail_version", entityId: id, data: { vertical: v.vertical, version: v.version, active: rules.filter((r) => !r.retired).length, retired: rules.filter((r) => r.retired).length, changeNote } },
        tx,
      );
    });
    return this.get(user, id);
  }

  async discard(user: AuthUser, id: string) {
    const v = await this.draftOrThrow(user, id);
    await this.prisma.guardrailVersion.update({ where: { id }, data: { status: "DISCARDED" } });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "guardrails.draft_discarded", entityType: "guardrail_version", entityId: id, data: { vertical: v.vertical, version: v.version } });
    return { ok: true };
  }

  // ---------- helpers ----------

  private assertCanManage(user: AuthUser, vertical: Vertical) {
    if (!canManageVertical(user.roles, vertical)) throw new ForbiddenException(`Only the owner of the ${VERTICAL_LABELS[vertical]} guardrails can change them.`);
  }

  private async find(user: AuthUser, id: string) {
    const v = await this.prisma.guardrailVersion.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!v) throw new NotFoundException("Guardrail version not found");
    return v;
  }

  private async draftOrThrow(user: AuthUser, id: string) {
    const v = await this.find(user, id);
    this.assertCanManage(user, v.vertical as Vertical);
    if (v.status !== "DRAFT") throw new ConflictException(`Version ${v.version} is ${v.status.toLowerCase()} and can no longer change. Start a new version.`);
    return v;
  }

  private async userNames(ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true } });
    return new Map(users.map((u) => [u.id, u.name]));
  }

  private summary(v: GuardrailVersion, names: Map<string, string>): VersionSummary {
    const rules = v.rules as unknown as StoredRule[];
    return {
      id: v.id,
      vertical: v.vertical as Vertical,
      version: v.version,
      status: v.status,
      changeNote: v.changeNote,
      ruleCount: rules.filter((r) => !r.retired).length,
      retiredCount: rules.filter((r) => r.retired).length,
      document: v.documentName && v.documentType ? { name: v.documentName, type: v.documentType } : null,
      createdBy: names.get(v.createdById) ?? "Unknown",
      publishedBy: v.publishedById ? (names.get(v.publishedById) ?? "Unknown") : null,
      publishedAt: v.publishedAt,
      createdAt: v.createdAt,
    };
  }
}
