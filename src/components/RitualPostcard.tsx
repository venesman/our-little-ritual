import { PenLine } from "lucide-react";
import { CATEGORY, RESPONSE_LABEL, type WeeklyRitual } from "../lib/rituals";
import { PostageStamp, Ticket, type StampColour } from "./ui";

const STAMP_COLOUR: Record<string, StampColour> = { raspberry: "lilac", mustard: "gold", leaf: "cornflower", tomato: "tangerine" };

/** The weekly ritual drawn as a postcard: airmail edge, message on the left, stamp and details on the right. */
export function RitualPostcard({ ritual, size = "full", children }: { ritual: WeeklyRitual; size?: "full" | "compact"; children?: React.ReactNode }) {
  const cat = CATEGORY[ritual.activity.category];
  const compact = size === "compact";

  return (
    <article className="overflow-hidden rounded-card bg-white shadow-card">
      <div className={compact ? "p-4" : "p-4 sm:p-5"}>
        <div className={`grid gap-3.5 ${compact ? "grid-cols-[1fr_64px]" : "grid-cols-[1fr_84px]"}`}>
          <div className="min-w-0">
            {!compact && <p className="font-hand text-xl font-bold leading-none text-raspberry-deep">this week, let's…</p>}
            <h2 className={`leading-[1.02] ${compact ? "text-xl" : "mt-1.5 text-[1.9rem]"}`}>{ritual.activity.title}</h2>
            <p className={`mt-2 leading-snug ${compact ? "text-sm text-muted" : "text-sm"}`}>{ritual.activity.description}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Ticket tone={cat.tone}>{cat.label}</Ticket>
              {ritual.activity.just_us && <Ticket tone="tomato">Just us</Ticket>}
            </div>
          </div>
          <div className="flex flex-col items-center gap-2 border-l-[1.5px] border-leaf/35 pl-3.5">
            <PostageStamp colour={STAMP_COLOUR[cat.tone] ?? "tangerine"} size={compact ? "sm" : "lg"}>
              <span className={`font-display leading-none ${compact ? "text-lg" : "text-[1.6rem]"}`}>{String(ritual.weekNumber).padStart(2, "0")}</span>
              <span className={`font-bold uppercase tracking-[0.1em] ${compact ? "text-[8px]" : "text-[10px]"}`}>Week</span>
            </PostageStamp>
            <span className="text-center text-[10px] font-bold uppercase leading-tight tracking-[0.1em]">{ritual.activity.duration_label}</span>
            {!compact && <span className="inline-flex items-center gap-1 text-center text-[10px] font-bold uppercase leading-tight tracking-[0.08em] text-muted"><PenLine size={11} aria-hidden="true" />{RESPONSE_LABEL[ritual.activity.response_type]}</span>}
          </div>
        </div>
        {children}
      </div>
    </article>
  );
}
