import { useSearchParams } from "react-router-dom";
import { Scrapbook } from "./Scrapbook";
import { OurStory } from "./OurStory";
import { Timeline } from "./Timeline";

/** "Us": the Scrapbook, the Timeline and Our Story. */
export function Us() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "story" ? "story" : params.get("tab") === "timeline" ? "timeline" : "scrapbook";
  return (
    <div className="fade-up space-y-5">
      <div className="grid grid-cols-3 divide-x-[1.5px] divide-leaf border-[1.5px] border-leaf bg-paper" role="tablist" aria-label="Us">
        {([["scrapbook", "Scrapbook"], ["timeline", "Timeline"], ["story", "Our Story"]] as const).map(([t, label]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setParams(t === "scrapbook" ? {} : { tab: t }, { replace: true })}
            className={`min-h-[44px] px-2 text-[13px] font-bold uppercase tracking-[0.06em] text-leaf transition ${tab === t ? "bg-cornflower" : ""}`}>{label}</button>
        ))}
      </div>
      {tab === "story" ? <OurStory /> : tab === "timeline" ? <Timeline /> : <Scrapbook />}
    </div>
  );
}
