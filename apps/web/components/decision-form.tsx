import { decideApproval } from "@/app/actions";
import { Button, inputClass } from "./ui";

/** Approve / return with comments / reject. Comments are required to return or reject (API-enforced). */
export function DecisionForm({ approvalId, back }: { approvalId: string; back: string }) {
  const action = decideApproval.bind(null, approvalId, back);
  return (
    <form action={action} className="flex flex-wrap items-start gap-2">
      <textarea name="comments" rows={1} placeholder="Comments (required to return / reject)" className={`${inputClass} min-w-64 flex-1`} />
      <Button name="decision" value="APPROVE">Approve</Button>
      <Button name="decision" value="RETURN" variant="secondary">Return with comments</Button>
      <Button name="decision" value="REJECT" variant="danger">Reject</Button>
    </form>
  );
}
