import { Body, Controller, Get, HttpCode, Inject, Module, Post } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { APP_CONFIG, type AppConfig } from "../config.js";
import { CurrentUser, Public, type AuthUser } from "../common/auth-user.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { AuthService } from "./auth.service.js";
import { JwtAuthGuard, PermissionGuard } from "./guards.js";

const DevLoginSchema = z.object({ email: z.email() });
const EntraExchangeSchema = z.object({ idToken: z.string().min(20) });

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Mock login used by the web app's dev credentials provider. */
  @Public()
  @Post("dev-login")
  @HttpCode(200)
  devLogin(@Body(new ZodPipe(DevLoginSchema)) body: z.infer<typeof DevLoginSchema>) {
    return this.auth.devLogin(body.email.toLowerCase());
  }

  @Public()
  @Get("dev-users")
  devUsers() {
    return this.auth.devUsers();
  }

  /** Called by the web app after Entra ID sign-in. */
  @Public()
  @Post("entra/exchange")
  @HttpCode(200)
  entraExchange(@Body(new ZodPipe(EntraExchangeSchema)) body: z.infer<typeof EntraExchangeSchema>) {
    return this.auth.entraExchange(body.idToken);
  }

  @ApiBearerAuth()
  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        secret: config.API_JWT_SECRET,
        signOptions: { issuer: "krama-api", audience: "krama" },
        verifyOptions: { issuer: "krama-api", audience: "krama" },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    if (config.AUTH_DEV_LOGIN && config.NODE_ENV === "production") {
      console.warn("WARNING: AUTH_DEV_LOGIN is enabled in production. Disable it.");
    }
  }
}
