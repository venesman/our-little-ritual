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
      <div className="grid grid-cols-3 gap-1 rounded-full bg-white p-1 shadow-card" role="tablist" aria-label="Us">
        {([["scrapbook", "Scrapbook"], ["timeline", "Timeline"], ["story", "Our Story"]] as const).map(([t, label]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setParams(t === "scrapbook" ? {} : { tab: t }, { replace: true })}
            className={`min-h-[42px] rounded-full px-2 text-sm font-semibold text-leaf transition ${tab === t ? "bg-mustard" : "text-leaf/70"}`}>{label}</button>
        ))}
      </div>
      {tab === "story" ? <OurStory /> : tab === "timeline" ? <Timeline /> : <Scrapbook />}
    </div>
  );
}
