import { Check, Hourglass, PenLine } from "lucide-react";
import type { MyStatus } from "../lib/submissions";

/** "You · shared" / "Mateo · not yet" pills. Status only — never content. */
export function StatusPills({ myName, partnerName, mine, partnerShared }: {
  myName: string; partnerName: string; mine: MyStatus; partnerShared: boolean;
}) {
  const pill = "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold";
  return (
    <div className="flex flex-wrap gap-2" aria-label="Who has shared">
      <span className={`${pill} ${mine === "submitted" ? "bg-leaf text-cream" : "bg-leaf-soft text-leaf"}`}>
        {mine === "submitted" ? <Check size={12} /> : mine === "draft" ? <PenLine size={12} /> : <Hourglass size={12} />}
        {myName} · {mine === "submitted" ? "shared" : mine === "draft" ? "draft" : "not yet"}
      </span>
      <span className={`${pill} ${partnerShared ? "bg-raspberry text-leaf" : "bg-raspberry-soft text-raspberry-deep"}`}>
        {partnerShared ? <Check size={12} /> : <Hourglass size={12} />}
        {partnerName} · {partnerShared ? "shared" : "not yet"}
      </span>
    </div>
  );
}
