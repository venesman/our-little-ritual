import { useSearchParams } from "react-router-dom";
import { Scrapbook } from "./Scrapbook";
import { OurStory } from "./OurStory";

/** "Us": the Scrapbook and Our Story (the Timeline will join here later). */
export function Us() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "story" ? "story" : "scrapbook";
  return (
    <div className="fade-up space-y-5">
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-leaf p-1" role="tablist" aria-label="Us">
        {([["scrapbook", "Scrapbook"], ["story", "Our Story"]] as const).map(([t, label]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setParams(t === "story" ? { tab: "story" } : {}, { replace: true })}
            className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${tab === t ? "bg-mustard text-leaf" : "text-cream/80"}`}>{label}</button>
        ))}
      </div>
      {tab === "story" ? <OurStory /> : <Scrapbook />}
    </div>
  );
}
