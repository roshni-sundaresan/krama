/**
 * Kshana integration — OUT OF SCOPE for Phase 1.
 * Kshana is an existing Idealake product that will plug into Krama later as a
 * capability (plugin). This interface only reserves the seam; nothing calls it yet.
 */
export interface KshanaAdapter {
  /** Identifier of the capability in the registry once integrated. */
  readonly capabilityName: "kshana";
  /** TODO: define once the Kshana plugin contract is agreed. */
  invoke(input: { tenantId: string; projectId: string; payload: unknown }): Promise<unknown>;
}

export const KSHANA_ADAPTER = Symbol("KSHANA_ADAPTER");

export class NotImplementedKshanaAdapter implements KshanaAdapter {
  readonly capabilityName = "kshana" as const;

  async invoke(): Promise<unknown> {
    throw new Error("Kshana integration is planned as a future plugin (not in Phase 1)");
  }
}
