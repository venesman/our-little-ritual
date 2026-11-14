import { Clock, PenLine } from "lucide-react";
import { CATEGORY, RESPONSE_LABEL, type WeeklyRitual } from "../lib/rituals";
import { Ticket } from "./ui";

const STAMP_TONE = {
  raspberry: "border-raspberry bg-raspberry-soft text-raspberry-deep",
  mustard: "border-mustard bg-mustard-soft text-mustard-deep",
  leaf: "border-leaf/70 bg-leaf-soft text-leaf",
  tomato: "border-tomato bg-tomato-soft text-tomato-deep",
};

/** The weekly ritual drawn as a vintage postcard: message on the left, stamp on the right. */
export function RitualPostcard({ ritual, size = "full", children }: { ritual: WeeklyRitual; size?: "full" | "compact"; children?: React.ReactNode }) {
  const cat = CATEGORY[ritual.activity.category];
  const Icon = cat.icon;
  const compact = size === "compact";

  return (
    <article className={`postcard ${compact ? "p-5" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Ticket tone={cat.tone}>{cat.label}</Ticket>
          <h2 className={`mt-3 leading-tight ${compact ? "text-xl" : "text-[1.75rem]"}`}>{ritual.activity.title}</h2>
          <p className={`mt-2 text-muted ${compact ? "text-sm" : ""}`}>{ritual.activity.description}</p>
        </div>
        <div
          className={`grid shrink-0 rotate-3 place-items-center rounded-sm border-2 border-dashed text-center ${STAMP_TONE[cat.tone]} ${compact ? "h-16 w-14" : "h-24 w-20"}`}
          aria-hidden="true"
        >
          <div>
            <Icon size={compact ? 18 : 24} className="mx-auto" />
            <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.14em]">Week {ritual.weekNumber}</div>
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-dashed border-leaf/25 pt-3 text-xs font-semibold uppercase tracking-[0.1em] text-muted">
        <span className="inline-flex items-center gap-1.5"><Clock size={13} aria-hidden="true" />{ritual.activity.duration_label}</span>
        <span className="inline-flex items-center gap-1.5"><PenLine size={13} aria-hidden="true" />{RESPONSE_LABEL[ritual.activity.response_type]}</span>
      </div>
      {children}
    </article>
  );
}
