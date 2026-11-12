import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { CurrentUser, Roles, type AuthUser } from "../common/auth-user.js";
import { ZodPipe } from "../common/zod.pipe.js";

/**
 * Capability registry. A capability is any agent, tool or product that works through
 * Krama's orchestration layer. Only ACTIVE capabilities may be invoked by workflows
 * (TODO: enforce at workflow start once more than one capability exists).
 */
const RegisterSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]+$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  kind: z.enum(["AGENT", "TOOL", "PRODUCT"]),
  description: z.string().optional(),
  inputs: z.array(z.string()).default([]),
  outputs: z.array(z.string()).default([]),
  permissions: z.array(z.string()).default([]),
});
const UpdateSchema = z.object({
  status: z.enum(["DRAFT", "ACTIVE", "DEPRECATED"]).optional(),
  evalScore: z.number().min(0).max(1).nullable().optional(),
});

@Injectable()
export class CapabilitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(tenantId: string) {
    return this.prisma.capability.findMany({ where: { tenantId }, orderBy: [{ name: "asc" }, { version: "desc" }] });
  }

  async register(user: AuthUser, input: z.infer<typeof RegisterSchema>) {
    const c = await this.prisma.capability.create({ data: { tenantId: user.tenantId, ...input } });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "capability.registered", entityType: "capability", entityId: c.id, data: { name: c.name, version: c.version } });
    return c;
  }

  async update(user: AuthUser, id: string, input: z.infer<typeof UpdateSchema>) {
    const existing = await this.prisma.capability.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!existing) throw new NotFoundException("Capability not found");
    const c = await this.prisma.capability.update({ where: { id }, data: input });
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: "capability.updated", entityType: "capability", entityId: id, data: input });
    return c;
  }
}

@ApiTags("capabilities")
@ApiBearerAuth()
@Controller("capabilities")
export class CapabilitiesController {
  constructor(private readonly capabilities: CapabilitiesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.capabilities.list(user.tenantId);
  }

  @Post()
  @Roles("Admin")
  register(@CurrentUser() user: AuthUser, @Body(new ZodPipe(RegisterSchema)) body: z.infer<typeof RegisterSchema>) {
    return this.capabilities.register(user, body);
  }

  @Patch(":id")
  @Roles("Admin")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body(new ZodPipe(UpdateSchema)) body: z.infer<typeof UpdateSchema>) {
    return this.capabilities.update(user, id, body);
  }
}

@Module({ controllers: [CapabilitiesController], providers: [CapabilitiesService] })
export class CapabilitiesModule {}
