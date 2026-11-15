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
      <div className="grid grid-cols-3 gap-1 rounded-card border-[1.5px] border-leaf bg-paper p-1" role="tablist" aria-label="Us">
        {([["scrapbook", "Scrapbook"], ["timeline", "Timeline"], ["story", "Our Story"]] as const).map(([t, label]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setParams(t === "scrapbook" ? {} : { tab: t }, { replace: true })}
            className={`rounded-[4px] px-3 py-2.5 text-sm font-semibold transition ${tab === t ? "border-[1.5px] border-leaf bg-mustard text-leaf" : "border-[1.5px] border-transparent text-leaf/70"}`}>{label}</button>
        ))}
      </div>
      {tab === "story" ? <OurStory /> : tab === "timeline" ? <Timeline /> : <Scrapbook />}
    </div>
  );
}
