import { Global, Inject, Injectable, Module, ServiceUnavailableException, type OnModuleDestroy } from "@nestjs/common";
import {
  createTemporalClient,
  runDeepAuditWorkflow,
  startBrdDraftWorkflow,
  type BrdDraftWorkflowInput,
  type DeepAuditOutput,
  type DeepAuditWorkflowInput,
  type TemporalClient as Client,
} from "@krama/workflows";
import { APP_CONFIG, type AppConfig } from "../config.js";

/** Thin, lazily-connected wrapper so the API boots even when Temporal is down. */
@Injectable()
export class TemporalService implements OnModuleDestroy {
  private client?: Promise<Client>;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  private async getClient(): Promise<Client> {
    this.client ??= createTemporalClient({ address: this.config.TEMPORAL_ADDRESS, namespace: this.config.TEMPORAL_NAMESPACE }).catch(
      (err: unknown) => {
        this.client = undefined;
        throw new ServiceUnavailableException(
          `Workflow engine unavailable at ${this.config.TEMPORAL_ADDRESS}: ${err instanceof Error ? err.message : String(err)}`,
        );
      },
    );
    return this.client;
  }

  async startBrdDraft(input: BrdDraftWorkflowInput): Promise<string> {
    return startBrdDraftWorkflow(await this.getClient(), input);
  }

  async runDeepAudit(input: DeepAuditWorkflowInput): Promise<DeepAuditOutput> {
    return runDeepAuditWorkflow(await this.getClient(), input);
  }

  async onModuleDestroy(): Promise<void> {
    const c = await this.client?.catch(() => undefined);
    await c?.connection.close();
  }
}

@Global()
@Module({ providers: [TemporalService], exports: [TemporalService] })
export class TemporalModule {}
