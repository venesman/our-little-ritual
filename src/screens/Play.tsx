import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpenCheck, Bookmark, BookmarkCheck, CalendarClock, Sparkles, Phone, Hourglass, Circle, CircleCheck, CircleDot, Dices, Heart, Pause, Play as PlayIcon, Radio, Redo2, RefreshCw, RotateCcw, Shuffle, SkipForward, SlidersHorizontal, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { usePlaySession } from "../hooks/usePlaySession";
import { usePeople } from "../hooks/usePeople";
import { personalise } from "../lib/tokens";
import { startMission } from "../lib/apart";
import { ApartTab } from "./Apart";
import { CuriousTab } from "./Curious";
import { useSpace } from "../hooks/useSpace";
import { useAuth } from "../hooks/useAuth";
import {
  advanceCallPlan, cap, drawPlayActivity, endPlaySession, ENERGIES, formatClock, generateCallPlan, listFavourites, listPastSessions, MINUTES, MOODS,
  PLAN_LENGTHS, PLAY_CATEGORY, playTimer, replaceCallPlanItem, secondsLeft, setPlayItemStatus, SLOT_LABEL, startPlaySession, togglePlayFavourite, typeLabel, TYPES,
  type Favourite, type PastSession, type PlanStep, type PlayActivity, type PlayFilters, type PlayState,
} from "../lib/play";
import { friendlyError } from "../lib/errors";
import { Button, Card, ErrorNote, LoopField, Spinner, Ticket } from "../components/ui";

type Tab = "play" | "curious" | "favourites" | "history";

export function Play() {
  const { space } = useSpace();
  const active = space?.relationship.status === "active";
  const [tab, setTab] = useState<Tab>("play");
  const [params, setParams] = useSearchParams();
  const mode: "call" | "apart" = params.get("mode") === "apart" ? "apart" : "call";
  const setMode = (m: "call" | "apart") => setParams(m === "apart" ? { mode: "apart" } : {}, { replace: true });

  if (!active) {
    return (
      <div className="fade-up space-y-4">
        <h1 className="text-4xl">Play With Me</h1>
        <p className="font-hand text-xl text-muted">opens once your partner has joined</p>
      </div>
    );
  }

  return (
    <div className="fade-up space-y-5">
      <header>
        <p className="font-hand text-2xl text-raspberry-deep">{mode === "call" ? "on a call? open this together" : "together, on your own time"}</p>
        <h1 className="text-4xl">Play With Me</h1>
      </header>
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-leaf p-1" role="radiogroup" aria-label="How are you playing?">
        {([["call", "On a call", Phone], ["apart", "Apart, anytime", Hourglass]] as const).map(([m, label, I]) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${mode === m ? "bg-mustard text-leaf" : "text-cream/80"}`}>
            <I size={16} aria-hidden="true" />{label}
          </button>
        ))}
      </div>
      {mode === "apart" ? <ApartTab /> : <>
      <div className="flex max-w-full gap-0.5 overflow-x-auto rounded-full border-2 border-leaf/20 p-1" role="tablist" aria-label="Play sections">
        {(["play", "curious", "favourites", "history"] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ${tab === t ? "bg-leaf text-cream" : "text-muted"}`}>
            {t === "play" ? "Play" : t === "curious" ? "Curious Club" : t === "favourites" ? "Favourites" : "History"}
          </button>
        ))}
      </div>
      {tab === "play" && <PlayTab onCurious={() => setTab("curious")} />}
      {tab === "curious" && <CuriousTab />}
      {tab === "favourites" && <FavouritesTab onPlay={() => setTab("play")} />}
      {tab === "history" && <HistoryTab />}
      </>}
    </div>
  );
}

/* ============================================================ live play */

function PlayTab({ onCurious }: { onCurious: () => void }) {
  const { session } = useAuth();
  const { space } = useSpace();
  const { state, loading, error, skewMs, apply, setError } = usePlaySession(true);
  const [filters, setFilters] = useState<PlayFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const favs = useFavourites();

  useEffect(() => { if (state?.filters) setFilters(state.filters); }, [state?.session_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const partnerName = space?.members.find((m) => m.user_id !== session?.user.id)?.profile?.display_name || "your partner";
  const startedByPartner = state && state.started_by && state.started_by !== session?.user.id;

  const run = async (label: string, fn: () => Promise<PlayState | null | void>) => {
    setBusy(label); setError(null); setNotice(null);
    try {
      const s = await fn();
      if (s) { apply(s); if (s.reshuffled) setNotice("You've played everything that matches — shuffled for a fresh round ✦"); }
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(null); }
  };

  const draw = (f: PlayFilters, activityId?: string) => run("draw", async () => {
    const sid = state?.session_id ?? (await startPlaySession());
    return drawPlayActivity(sid, f, activityId);
  });

  if (loading) return <Spinner label="Shuffling the deck" />;

  const current = state?.current;
  const endSection = state && (
    <div className="border-t border-dashed border-leaf/25 pt-4">
      <Button variant="ghost" onClick={() => run("end", async () => { await endPlaySession(state.session_id); apply(null); })} busy={busy === "end"}>
        <X size={15} aria-hidden="true" /> {state.mode === "planned" ? "Save to history & end" : "End this session"}
      </Button>
      <p className="mt-1 text-xs text-muted">Saved to History. The other phone follows.</p>
    </div>
  );

  if (state?.mode === "planned") {
    return (
      <div className="space-y-5">
        <ErrorNote>{error}</ErrorNote>
        <PlanView
          state={state} skewMs={skewMs} busy={busy} favs={favs}
          onAdvance={(r) => run(r, () => advanceCallPlan(state.session_id, r))}
          onReplace={(id) => run("replace-" + id, () => replaceCallPlanItem(id))}
          onTimer={(a, d) => run("timer", () => playTimer(state.session_id, a, d))}
          onNewPlan={(m) => run("plan", () => generateCallPlan(m))}
          onLeave={() => draw(filters)}
        />
        {endSection}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ErrorNote>{error}</ErrorNote>

      {state && (
        <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
          <span className="inline-flex items-center gap-1.5 text-tomato-deep"><Radio size={14} className="animate-pulse" aria-hidden="true" />Live on both phones</span>
          <span>Round {state.round} · {state.played_count} played</span>
        </div>
      )}
      {startedByPartner && !current && <p className="font-hand text-lg text-raspberry-deep">{partnerName} opened Play — pick something together</p>}
      {notice && <p className="rounded-xl bg-mustard-soft px-4 py-2 text-sm text-mustard-deep">{notice}</p>}

      {current ? (
        <>
          <ActivityCard activity={current.activity} done={current.status === "done"} />
          <SharedTimer state={state!} skewMs={skewMs} busy={busy} onAction={(a, d) => run("timer", () => playTimer(state!.session_id, a, d))} />
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => run("done", async () => { await setPlayItemStatus(current.item_id, "done"); return drawPlayActivity(state!.session_id, filters); })} busy={busy === "done"}>
              <CircleCheck size={16} aria-hidden="true" /> Done · next
            </Button>
            <Button variant="outline" onClick={() => run("skip", async () => { await setPlayItemStatus(current.item_id, "skipped"); return drawPlayActivity(state!.session_id, filters); })} busy={busy === "skip"}>
              <SkipForward size={16} aria-hidden="true" /> Another one
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <FavButton label="Save for me" active={favs.mine.has(current.activity.id)} icon="heart" onClick={() => favs.toggle(current.activity.id, "mine")} />
            <FavButton label="Our Favourite Things" active={favs.ours.has(current.activity.id)} icon="bookmark" onClick={() => favs.toggle(current.activity.id, "ours")} />
            <JustUsChip on={!!filters.just_us} onChange={(v) => { const f = { ...filters, just_us: v || undefined }; setFilters(f); void draw(f); }} />
          </div>
        </>
      ) : (
        <Card className="relative overflow-hidden !bg-leaf text-cream">
          <div className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 opacity-90"><LoopField className="h-full w-full" /></div>
          <div className="relative space-y-3">
            <h2 className="max-w-[15rem] text-2xl text-cream">No more "what should we do?"</h2>
            <p className="max-w-[18rem] text-sm text-cream/85">Pick a vibe or let us surprise you. You'll both see the same activity, live.</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => draw(filters.just_us ? { just_us: true } : {})} busy={busy === "draw"}><Dices size={16} aria-hidden="true" /> Surprise us</Button>
              <JustUsChip on={!!filters.just_us} onChange={(v) => setFilters({ ...filters, just_us: v || undefined })} dark />
            </div>
          </div>
        </Card>
      )}

      <section className="space-y-3">
        <button type="button" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-leaf">
          <SlidersHorizontal size={15} aria-hidden="true" /> {showFilters ? "Hide filters" : current ? "Change the vibe" : "Choose a vibe"}
          {Object.keys(filters).length > 0 && <span className="rounded-full bg-raspberry px-2 text-[11px] text-leaf">{Object.keys(filters).length}</span>}
        </button>
        {showFilters && (
          <Card className="space-y-4">
            <FilterPanel filters={filters} onChange={setFilters} />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => { setShowFilters(false); void draw(filters); }} busy={busy === "draw"}><Shuffle size={16} aria-hidden="true" /> Find an activity</Button>
              {Object.keys(filters).length > 0 && <Button variant="ghost" onClick={() => setFilters({})}>Clear filters</Button>}
            </div>
          </Card>
        )}
      </section>

      <PlanCard busy={busy === "plan"} onMake={(m) => run("plan", () => generateCallPlan(m))} />

      <button type="button" onClick={onCurious} className="postcard notebook flex w-full items-center gap-3 !p-4 text-left transition hover:-translate-y-px">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-mustard-soft text-mustard-deep"><BookOpenCheck size={18} aria-hidden="true" /></span>
        <span className="min-w-0">
          <span className="block font-display text-lg font-semibold">The Curious Club</span>
          <span className="block text-sm text-muted">A mini research date: look something up, present it in a minute, talk it through.</span>
        </span>
      </button>

      {endSection}
    </div>
  );
}

/* ======================================================= call session mode */

function PlanCard({ busy, onMake }: { busy: boolean; onMake: (minutes: number) => void }) {
  const [minutes, setMinutes] = useState<number>(45);
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-raspberry-soft text-raspberry-deep"><CalendarClock size={18} aria-hidden="true" /></span>
        <div>
          <h2 className="text-xl">Plan our call</h2>
          <p className="text-sm text-muted">A little sequence for the time you have — warm-up to sweet goodbye.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="How long is your call?">
        {PLAN_LENGTHS.map((m) => (
          <button key={m} type="button" onClick={() => setMinutes(m)} aria-pressed={minutes === m}
            className={`rounded-full border-2 px-3 py-1.5 text-sm font-semibold ${minutes === m ? "border-leaf bg-mustard text-leaf" : "border-leaf/15 text-muted hover:border-leaf/40"}`}>
            {m} min
          </button>
        ))}
      </div>
      <Button onClick={() => onMake(minutes)} busy={busy}><CalendarClock size={16} aria-hidden="true" /> Make our {minutes}-min plan</Button>
    </Card>
  );
}

function PlanView({ state, skewMs, busy, favs, onAdvance, onReplace, onTimer, onNewPlan, onLeave }: {
  state: PlayState; skewMs: number; busy: string | null; favs: ReturnType<typeof useFavourites>;
  onAdvance: (r: "done" | "skipped") => void; onReplace: (itemId: string) => void;
  onTimer: (a: "start" | "pause" | "reset", d?: number) => void; onNewPlan: (m: number) => void; onLeave: () => void;
}) {
  const plan = state.plan ?? [];
  const current = state.current;
  const stepNo = plan.findIndex((s) => s.is_current) + 1;
  const left = plan.filter((s) => s.status === "planned" || s.status === "shown").reduce((n, s) => n + s.planned_minutes, 0);
  const done = plan.filter((s) => s.status === "done").length;
  const skipped = plan.filter((s) => s.status === "skipped").length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
        <span className="inline-flex items-center gap-1.5 text-tomato-deep"><Radio size={14} className="animate-pulse" aria-hidden="true" />Live call plan</span>
        <span>{state.planned_minutes}-min plan · {left} min left</span>
      </div>

      <PlanTimeline plan={plan} busy={busy} onReplace={onReplace} />

      {current ? (
        <>
          <p className="font-hand text-xl text-raspberry-deep">step {stepNo} of {plan.length} · {current.slot ? SLOT_LABEL[current.slot].toLowerCase() : ""}</p>
          <ActivityCard activity={current.activity} />
          <SharedTimer state={state} skewMs={skewMs} busy={busy} onAction={(a, d) => onTimer(a, d ?? (current.planned_minutes ? current.planned_minutes * 60 : undefined))} />
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => onAdvance("done")} busy={busy === "done"}><CircleCheck size={16} aria-hidden="true" /> Done · next</Button>
            <Button variant="outline" onClick={() => onAdvance("skipped")} busy={busy === "skipped"}><SkipForward size={16} aria-hidden="true" /> Skip</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => onReplace(current.item_id)} busy={busy === "replace-" + current.item_id}><RefreshCw size={15} aria-hidden="true" /> Replace this one</Button>
            <FavButton label="Save for me" active={favs.mine.has(current.activity.id)} icon="heart" onClick={() => favs.toggle(current.activity.id, "mine")} />
            <FavButton label="Our Favourite Things" active={favs.ours.has(current.activity.id)} icon="bookmark" onClick={() => favs.toggle(current.activity.id, "ours")} />
          </div>
          <button type="button" onClick={onLeave} className="text-sm font-semibold text-muted underline-offset-4 hover:text-leaf hover:underline">
            Leave the plan and play freely
          </button>
        </>
      ) : (
        <Card className="space-y-3 text-center">
          <p className="font-hand text-2xl text-raspberry-deep">that's a wrap ✦</p>
          <h2 className="text-2xl">You finished your call plan</h2>
          <p className="text-sm text-muted">{done} done{skipped ? ` · ${skipped} skipped` : ""}. Save it to your history, or keep the fun going.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => onNewPlan(state.planned_minutes ?? 45)} busy={busy === "plan"}><CalendarClock size={16} aria-hidden="true" /> Another plan</Button>
            <Button variant="outline" onClick={onLeave} busy={busy === "draw"}><Dices size={16} aria-hidden="true" /> Keep playing</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function PlanTimeline({ plan, busy, onReplace }: { plan: PlanStep[]; busy: string | null; onReplace: (itemId: string) => void }) {
  return (
    <ol className="rounded-[20px] bg-paper p-2 shadow-card" aria-label="Your call plan">
      {plan.map((s, i) => {
        const Icon = s.status === "done" ? CircleCheck : s.status === "skipped" ? Redo2 : s.is_current ? CircleDot : Circle;
        return (
          <li key={s.item_id} className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${s.is_current ? "bg-mustard-soft" : ""}`}>
            <Icon size={18} className={s.status === "done" ? "text-leaf" : s.status === "skipped" ? "text-faint" : s.is_current ? "text-mustard-deep" : "text-faint"} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{i + 1}. {SLOT_LABEL[s.slot]} · {s.planned_minutes} min</p>
              <p className={`truncate font-display text-base font-semibold ${s.status === "skipped" ? "text-faint line-through" : ""}`}>{s.activity.title}</p>
            </div>
            <span className="sr-only">{s.status === "shown" ? "now" : s.status}</span>
            {s.status === "planned" && (
              <button type="button" onClick={() => onReplace(s.item_id)} disabled={busy === "replace-" + s.item_id}
                aria-label={`Replace ${s.activity.title}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-leaf-soft">
                <RefreshCw size={15} className={busy === "replace-" + s.item_id ? "animate-spin" : ""} />
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function ActivityCard({ activity, done }: { activity: PlayActivity; done?: boolean }) {
  const cat = PLAY_CATEGORY[activity.category];
  const Icon = cat.icon;
  const { me, partner } = usePeople();
  const text = personalise(activity.instructions, activity.fallback_instructions, me, partner);
  return (
    <article className="postcard fade-up" key={activity.id}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Ticket tone={cat.tone}>{cat.label}</Ticket>
          <h2 className="mt-3 text-[1.75rem] leading-tight">{activity.title}</h2>
          <p className="mt-1.5 text-muted">{activity.description}</p>
        </div>
        <span className="grid h-14 w-14 shrink-0 rotate-6 place-items-center rounded-sm border-2 border-dashed border-raspberry bg-raspberry-soft text-raspberry-deep" aria-hidden="true">
          <Icon size={22} />
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em]">
        <span className="rounded-full bg-leaf-soft px-2.5 py-1 text-leaf">{activity.minutes} min</span>
        <span className="rounded-full bg-mustard-soft px-2.5 py-1 text-mustard-deep">{cap(activity.energy)} energy</span>
        <span className="rounded-full bg-raspberry-soft px-2.5 py-1 text-raspberry-deep">{typeLabel(activity.activity_type)}</span>
        {activity.just_us && <span className="inline-flex items-center gap-1 rounded-full bg-tomato-deep px-2.5 py-1 text-cream"><Sparkles size={11} aria-hidden="true" />Just us</span>}
        {done && <span className="rounded-full bg-leaf px-2.5 py-1 text-cream">Done ✓</span>}
      </div>
      <p className="mt-4 leading-relaxed">{text.text}</p>
      {activity.just_us && !text.personal && (
        <p className="mt-2 text-xs text-muted">General version — add your cities, home countries and languages in Our Story to make this one yours.</p>
      )}
      {activity.prompts.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {activity.prompts.map((p) => <li key={p} className="rounded-full border border-leaf/20 px-3 py-1 text-sm text-muted">{p}</li>)}
        </ul>
      )}
      {activity.materials && <p className="mt-3 font-hand text-lg text-raspberry-deep">you'll need: {activity.materials.toLowerCase()}</p>}
    </article>
  );
}

function SharedTimer({ state, skewMs, busy, onAction }: {
  state: PlayState; skewMs: number; busy: string | null; onAction: (a: "start" | "pause" | "reset", d?: number) => void;
}) {
  const [, tick] = useState(0);
  const running = !!state.timer.ends_at;
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [running]);
  const left = secondsLeft(state.timer, skewMs);
  const total = state.timer.duration_s ?? 600;
  const pct = total ? Math.min(100, Math.max(0, (1 - left / total) * 100)) : 0;
  const finished = running && left === 0;

  return (
    <Card className="!p-5">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Shared timer · a guide, not a rule</p>
          <p className={`font-display text-5xl font-semibold tabular-nums leading-none ${finished ? "text-tomato-deep" : ""}`} aria-live="polite">
            {finished ? "Time!" : formatClock(left)}
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-leaf-soft"><div className="h-full rounded-full bg-raspberry transition-[width] duration-300" style={{ width: `${pct}%` }} /></div>
          {finished && <p className="mt-2 font-hand text-lg text-muted">no rush — keep going if you're having fun</p>}
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          {running ? (
            <button type="button" onClick={() => onAction("pause")} disabled={busy === "timer"} aria-label="Pause timer"
              className="grid h-12 w-12 place-items-center rounded-full border-2 border-leaf bg-mustard text-leaf shadow-print-sm"><Pause size={18} /></button>
          ) : (
            <button type="button" onClick={() => onAction("start")} disabled={busy === "timer"} aria-label="Start timer"
              className="grid h-12 w-12 place-items-center rounded-full border-2 border-leaf bg-mustard text-leaf shadow-print-sm"><PlayIcon size={18} /></button>
          )}
          <button type="button" onClick={() => onAction("reset", state.current ? state.current.activity.minutes * 60 : undefined)} disabled={busy === "timer"} aria-label="Reset timer"
            className="grid h-12 w-12 place-items-center rounded-full border-2 border-leaf/25 text-muted"><RotateCcw size={17} /></button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {[1, 2, 5, 10].map((m) => (
          <button key={m} type="button" onClick={() => onAction("reset", m * 60)} disabled={busy === "timer"}
            className="rounded-full border border-leaf/20 px-3 py-1 text-xs font-semibold text-muted hover:border-leaf/50">{m} min</button>
        ))}
      </div>
    </Card>
  );
}

/** "Just us": only activities made from your Our Story profiles. Off = the general library. */
export function JustUsChip({ on, onChange, dark }: { on: boolean; onChange: (v: boolean) => void; dark?: boolean }) {
  return (
    <button type="button" onClick={() => onChange(!on)} aria-pressed={on}
      title="Only activities made from your Our Story profiles"
      className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full border-2 px-4 text-sm font-semibold transition ${
        on ? "border-tomato-deep bg-tomato-deep text-cream" : dark ? "border-cream/40 text-cream/90 hover:border-cream" : "border-leaf/20 text-muted hover:border-leaf/50"}`}>
      <Sparkles size={15} aria-hidden="true" /> Just us{on ? " ✓" : ""}
    </button>
  );
}

function FilterPanel({ filters, onChange }: { filters: PlayFilters; onChange: (f: PlayFilters) => void }) {
  const chip = (on: boolean) =>
    `rounded-full border-2 px-3 py-1.5 text-sm font-semibold transition ${on ? "border-leaf bg-mustard text-leaf" : "border-leaf/15 text-muted hover:border-leaf/40"}`;
  const set = (patch: Partial<PlayFilters>) => {
    const next = { ...filters, ...patch };
    (Object.keys(next) as (keyof PlayFilters)[]).forEach((k) => {
      const v = next[k];
      if (v === undefined || (Array.isArray(v) && v.length === 0)) delete next[k];
    });
    onChange(next);
  };
  return (
    <div className="space-y-4">
      <FilterRow label="Time we have">
        {MINUTES.map((m) => <button key={m} type="button" className={chip(filters.minutes === m)} aria-pressed={filters.minutes === m}
          onClick={() => set({ minutes: filters.minutes === m ? undefined : m })}>{m} min</button>)}
      </FilterRow>
      <FilterRow label="Mood (any)">
        {MOODS.map((m) => {
          const on = !!filters.moods?.includes(m);
          return <button key={m} type="button" className={chip(on)} aria-pressed={on}
            onClick={() => set({ moods: on ? filters.moods!.filter((x) => x !== m) : [...(filters.moods ?? []), m] })}>{cap(m)}</button>;
        })}
      </FilterRow>
      <FilterRow label="Energy">
        {ENERGIES.map((e) => <button key={e} type="button" className={chip(filters.energy === e)} aria-pressed={filters.energy === e}
          onClick={() => set({ energy: filters.energy === e ? undefined : e })}>{cap(e)}</button>)}
      </FilterRow>
      <FilterRow label="Type">
        {TYPES.map((t) => <button key={t.value} type="button" className={chip(filters.type === t.value)} aria-pressed={filters.type === t.value}
          onClick={() => set({ type: filters.type === t.value ? undefined : t.value })}>{t.label}</button>)}
      </FilterRow>
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-leaf">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/* ============================================================ favourites */

function useFavourites() {
  const [list, setList] = useState<Favourite[]>([]);
  const load = useCallback(() => listFavourites().then(setList).catch(() => {}), []);
  useEffect(() => {
    void load();
    // "Our Favourite Things" is shared: pick up the other phone's changes.
    const t = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 8000);
    return () => clearInterval(t);
  }, [load]);
  const mine = useMemo(() => new Set(list.filter((f) => f.scope === "mine").map((f) => f.activity.id)), [list]);
  const ours = useMemo(() => new Set(list.filter((f) => f.scope === "ours").map((f) => f.activity.id)), [list]);
  const toggle = async (activityId: string, scope: "mine" | "ours") => { try { await togglePlayFavourite(activityId, scope); } finally { void load(); } };
  return { list, mine, ours, toggle, load };
}

function FavButton({ label, active, icon, onClick }: { label: string; active: boolean; icon: "heart" | "bookmark"; onClick: () => void }) {
  const I = icon === "heart" ? Heart : active ? BookmarkCheck : Bookmark;
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full border-2 px-4 text-sm font-semibold transition ${active ? "border-raspberry bg-raspberry text-leaf" : "border-leaf/20 text-muted hover:border-leaf/50"}`}>
      <I size={15} className={active && icon === "heart" ? "fill-current" : ""} aria-hidden="true" /> {active ? (icon === "heart" ? "Saved" : "In Our Favourite Things") : label}
    </button>
  );
}

function FavouritesTab({ onPlay }: { onPlay: () => void }) {
  const favs = useFavourites();
  const { state, apply } = usePlaySession(true);
  const [error, setError] = useState<string | null>(null);
  const ours = favs.list.filter((f) => f.scope === "ours");
  const mine = favs.list.filter((f) => f.scope === "mine");

  const navigate = useNavigate();
  const playNow = async (a: PlayActivity) => {
    setError(null);
    try {
      if (a.mode === "apart") { navigate(`/play/apart/${await startMission({}, a.id)}`); return; }
      const sid = state?.session_id ?? (await startPlaySession());
      apply(await drawPlayActivity(sid, state?.filters ?? {}, a.id));
      onPlay();
    } catch (e) { setError(friendlyError(e)); }
  };

  const list = (items: Favourite[], empty: string) => items.length === 0
    ? <p className="rounded-[20px] border-2 border-dashed border-leaf/20 px-5 py-6 text-center font-hand text-xl text-muted">{empty}</p>
    : (
      <ul className="divide-y divide-dashed divide-leaf/20 rounded-[20px] bg-paper shadow-card">
        {items.map((f) => (
          <li key={f.id} className="flex items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-lg font-semibold">{f.activity.title}</p>
              <p className="text-xs text-muted">{PLAY_CATEGORY[f.activity.category].label} · {f.activity.minutes} min{f.activity.mode === "apart" ? " · apart" : ""}{f.activity.just_us ? " · just us" : ""}</p>
            </div>
            <Button variant="outline" className="!min-h-[36px] !px-3 !py-1 text-xs" onClick={() => void playNow(f.activity)}>{f.activity.mode === "apart" ? "Start" : "Play now"}</Button>
            <button type="button" aria-label={`Remove ${f.activity.title}`} onClick={() => void favs.toggle(f.activity.id, f.scope)} className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-tomato-soft"><X size={15} /></button>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="space-y-6">
      <ErrorNote>{error}</ErrorNote>
      <section>
        <h2 className="mb-1 text-2xl">Our Favourite Things to Do</h2>
        <p className="mb-3 text-sm text-muted">Shared — either of you can add or remove.</p>
        {list(ours, "tap “Our Favourite Things” on an activity you loved")}
      </section>
      <section>
        <h2 className="mb-1 text-2xl">Saved for me</h2>
        <p className="mb-3 text-sm text-muted">Only you can see these.</p>
        {list(mine, "your private ♥ list is empty")}
      </section>
    </div>
  );
}

/* =============================================================== history */

function HistoryTab() {
  const [sessions, setSessions] = useState<PastSession[] | null>(null);
  useEffect(() => { listPastSessions().then(setSessions).catch(() => setSessions([])); }, []);
  if (sessions === null) return <Spinner label="Opening the logbook" />;
  if (sessions.length === 0) return <p className="rounded-[20px] border-2 border-dashed border-leaf/20 px-5 py-8 text-center font-hand text-xl text-muted">your play sessions will collect here</p>;
  return (
    <ul className="space-y-3">
      {sessions.map((s) => {
        const items = [...s.items].sort((a, b) => a.position - b.position);
        const done = items.filter((i) => i.status === "done");
        return (
          <li key={s.id} className="postcard !p-5">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-tomato-deep">
              {new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(s.started_at))}
            </p>
            {s.mode === "planned" && s.planned_minutes && <Ticket tone="mustard" className="mt-2">{s.planned_minutes}-min call plan</Ticket>}
            <p className="mt-1 text-sm text-muted">{done.length} done · {items.filter((i) => i.status === "skipped").length} skipped · {items.filter((i) => i.status !== "planned").length} played</p>
            {done.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {done.map((i, k) => i.activity && <li key={k} className="rounded-full bg-leaf-soft px-3 py-1 text-xs font-semibold text-leaf">{i.slot ? `${SLOT_LABEL[i.slot]}: ` : ""}{i.activity.title}</li>)}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
