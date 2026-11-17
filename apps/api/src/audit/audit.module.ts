import {
  Global,
  Injectable,
  Module,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { tap, type Observable } from "rxjs";
import type { AuthedRequest } from "../common/auth-user.js";
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
            projectId: (req.params as Record<string, string>).projectId ?? null,
            data: { params: req.params as Record<string, string> },
          })
          .catch((err: unknown) => console.error("audit write failed", err));
      }),
    );
  }
}

@Global()
@Module({
  providers: [AuditService, { provide: APP_INTERCEPTOR, useClass: AuditInterceptor }],
  exports: [AuditService],
})
export class AuditModule {}
