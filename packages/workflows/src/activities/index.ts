import { ApplicationFailure } from "@temporalio/common";
import type { OrchestrationActivities, RunEvent } from "../types.js";

export interface OrchestrationActivityConfig {
  apiUrl: string;
  internalToken: string;
}

/** Orchestration activities run in the TS worker and call back into the Krama API. */
export function createOrchestrationActivities(cfg: OrchestrationActivityConfig): OrchestrationActivities {
  return {
    async recordRunEvent(runId: string, event: RunEvent): Promise<void> {
      const res = await fetch(`${cfg.apiUrl}/api/internal/runs/${encodeURIComponent(runId)}/events`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-krama-internal-token": cfg.internalToken },
        body: JSON.stringify(event),
      });
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        // Client errors will not fix themselves on retry.
        throw ApplicationFailure.nonRetryable(`API rejected run event (${res.status}): ${await res.text()}`);
      }
      if (!res.ok) throw new Error(`API error ${res.status} recording run event`);
    },
  };
}
