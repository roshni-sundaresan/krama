import { fileURLToPath } from "node:url";
import { NativeConnection, Worker } from "@temporalio/worker";
import { createOrchestrationActivities } from "./activities/index.js";
import { ORCHESTRATION_TASK_QUEUE } from "./types.js";

/** TypeScript worker: runs workflows + orchestration activities. AI activities run in workers/ai (Python). */
async function main(): Promise<void> {
  const address = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
  const namespace = process.env.TEMPORAL_NAMESPACE ?? "default";
  const internalToken = process.env.INTERNAL_API_TOKEN;
  if (!internalToken) throw new Error("INTERNAL_API_TOKEN is required");

  const connection = await NativeConnection.connect({ address });
  const worker = await Worker.create({
    connection,
    namespace,
    taskQueue: ORCHESTRATION_TASK_QUEUE,
    workflowsPath: fileURLToPath(new URL("./workflows/index.js", import.meta.url)),
    activities: createOrchestrationActivities({
      apiUrl: process.env.KRAMA_API_URL ?? "http://localhost:4000",
      internalToken,
    }),
  });
  console.log(`krama ts-worker polling "${ORCHESTRATION_TASK_QUEUE}" on ${address}/${namespace}`);
  await worker.run();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
