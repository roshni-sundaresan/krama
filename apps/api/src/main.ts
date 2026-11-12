import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module.js";
import { loadConfig } from "./config.js";

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  app.setGlobalPrefix("api");
  app.enableCors({ origin: config.WEB_ORIGIN.split(","), credentials: true });
  app.enableShutdownHooks();

  const openApi = new DocumentBuilder()
    .setTitle("Krama API")
    .setDescription("Idealake AI Engineering Platform — Phase 1 orchestration API")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();
  SwaggerModule.setup("api/docs", app, () => SwaggerModule.createDocument(app, openApi));

  await app.listen(config.PORT);
  console.log(`Krama API listening on http://localhost:${config.PORT}/api (docs: /api/docs)`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
