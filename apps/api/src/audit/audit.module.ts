import {
  Controller,
  Get,
  Global,
  Injectable,
  Module,
  Query,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { tap, type Observable } from "rxjs";
import { CurrentUser, Roles, type AuthUser, type AuthedRequest } from "../common/auth-user.js";
import { AuditService } from "./audit.service.js";

/**
 * Baseline coverage: every successful mutating request by an authenticated user
 * writes an audit row. Services add richer domain events on top.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const mutating = !["GET", "HEAD", "OPTIONS"].includes(req.method);
    return next.handle().pipe(
      tap(() => {
        if (!mutating || !req.user) return;
        const route = (req.route as { path?: string } | undefined)?.path ?? req.path;
        void this.audit
          .record({
            tenantId: req.user.tenantId,
            actorId: req.user.id,
            action: `http.${req.method.toLowerCase()}`,
            entityType: "route",
            entityId: route,
            data: { params: req.params as Record<string, string> },
          })
          .catch((err: unknown) => console.error("audit write failed", err));
      }),
    );
  }
}

@ApiTags("audit")
@ApiBearerAuth()
@Controller("audit")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Roles("Admin", "LeadArchitect", "Approver", "Challenger")
  list(
    @CurrentUser() user: AuthUser,
    @Query("entityType") entityType?: string,
    @Query("entityId") entityId?: string,
    @Query("take") take?: string,
  ) {
    return this.audit.list(user.tenantId, { entityType, entityId, take: take ? Number(take) : undefined });
  }
}

@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService, { provide: APP_INTERCEPTOR, useClass: AuditInterceptor }],
  exports: [AuditService],
})
export class AuditModule {}
