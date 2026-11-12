import { Controller, Get, Injectable, Module, NotFoundException, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../prisma/prisma.service.js";
import { ApprovalsService } from "../approvals/approvals.service.js";
import { CurrentUser, Roles, type AuthUser } from "../common/auth-user.js";

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Latest non-superseded version of each document type. */
  list(user: AuthUser, projectId: string) {
    return this.prisma.document.findMany({
      where: { tenantId: user.tenantId, projectId, status: { not: "SUPERSEDED" } },
      orderBy: [{ type: "asc" }, { version: "desc" }],
    });
  }

  async get(user: AuthUser, projectId: string, documentId: string) {
    const doc = await this.prisma.document.findFirst({ where: { id: documentId, projectId, tenantId: user.tenantId } });
    if (!doc) throw new NotFoundException("Document not found");
    return doc;
  }
}

@ApiTags("documents")
@ApiBearerAuth()
@Controller("projects/:projectId/documents")
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly approvals: ApprovalsService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string) {
    return this.documents.list(user, projectId);
  }

  @Get(":documentId")
  get(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string, @Param("documentId") documentId: string) {
    return this.documents.get(user, projectId, documentId);
  }

  @Post("submit")
  @Roles("BA")
  submit(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string) {
    return this.approvals.submitGate(user, projectId, "DOCUMENTS");
  }
}

@Module({ controllers: [DocumentsController], providers: [DocumentsService] })
export class DocumentsModule {}
