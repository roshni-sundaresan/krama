import { MultiSelect } from "@/components/multi-select";
import { DOMAINS, DOMAIN_LABELS, ENTITY_LABELS, ENTITY_TYPES, PLATFORMS } from "@krama/shared";

export interface IntakeValues {
  name?: string; code?: string; clientName?: string; description?: string | null; domain?: string; entityType?: string | null;
  platforms?: string[]; government?: boolean; existingProduction?: boolean; accessibilityRequired?: boolean;
  sowReference?: string | null; clientSignoffOwner?: string | null; regulations?: string | null; integrations?: string | null;
}

/** The project intake form (BA blueprint section 3). Used to create a project and to edit its intake. */
export function IntakeForm({ action, values = {}, submit, lockCode = false }: { action: (fd: FormData) => Promise<void>; values?: IntakeValues; submit: string; lockCode?: boolean }) {
  return (
    <form action={action} className="col" style={{ gap: 16 }}>
      <div className="grid2" style={{ gap: 14 }}>
        <label className="f">Project name<input name="name" className="input" required minLength={2} defaultValue={values.name} /></label>
        <label className="f">
          Project code
          <input name="code" className="input" required pattern="[A-Za-z0-9]{2,8}" title="2 to 8 letters or digits" defaultValue={values.code} readOnly={lockCode} aria-readonly={lockCode} style={lockCode ? { background: "var(--bg)" } : undefined} />
        </label>
        <label className="f">Client<input name="clientName" className="input" required defaultValue={values.clientName} /></label>
        <label className="f">SOW reference<input name="sowReference" className="input" placeholder="SOW number and version" defaultValue={values.sowReference ?? ""} /></label>
        <label className="f">
          Domain
          <select name="domain" className="input" defaultValue={values.domain ?? "GENERAL"}>
            {DOMAINS.map((d) => <option key={d} value={d}>{DOMAIN_LABELS[d]}</option>)}
          </select>
          <span className="tiny muted" style={{ fontWeight: 400 }}>The Tech Architect confirms the domain at stack selection.</span>
        </label>
        <label className="f">
          Type of regulated entity
          <select name="entityType" className="input" defaultValue={values.entityType ?? ""}>
            <option value="">Not regulated / not known</option>
            {ENTITY_TYPES.map((e) => <option key={e} value={e}>{ENTITY_LABELS[e]}</option>)}
          </select>
        </label>
      </div>
      <div className="f">
        <span id="platforms-label">Platforms</span>
        <MultiSelect id="platforms" name="platforms" placeholder="Choose platforms" options={PLATFORMS.map((p) => ({ value: p, label: p }))} defaultValue={values.platforms ?? []} />
      </div>
      <fieldset className="col" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 12, gap: 8 }}>
        <legend className="small" style={{ fontWeight: 600, padding: "0 4px" }}>Project flags (add guardrails to the pack)</legend>
        <label className="row small" style={{ gap: 6 }}><input type="checkbox" name="existingProduction" defaultChecked={values.existingProduction} /> Changes an existing client production system (no-breakage rules)</label>
        <label className="row small" style={{ gap: 6 }}><input type="checkbox" name="government" defaultChecked={values.government} /> Government client</label>
        <label className="row small" style={{ gap: 6 }}><input type="checkbox" name="accessibilityRequired" defaultChecked={values.accessibilityRequired} /> Accessibility required by the client or regulation</label>
      </fieldset>
      <label className="f">Client sign-off owner<input name="clientSignoffOwner" className="input" required minLength={3} placeholder="Name, role, email" defaultValue={values.clientSignoffOwner ?? ""} /></label>
      <div className="grid2" style={{ gap: 14 }}>
        <label className="f">Regulations named by the client<input name="regulations" className="input" placeholder="For example DPDP Act" defaultValue={values.regulations ?? ""} /></label>
        <label className="f">Known integrations<input name="integrations" className="input" placeholder="Core banking, SMS gateway" defaultValue={values.integrations ?? ""} /></label>
      </div>
      <label className="f">Short description<textarea name="description" className="input" defaultValue={values.description ?? ""} /></label>
      <div><button className="btn primary">{submit}</button></div>
    </form>
  );
}
