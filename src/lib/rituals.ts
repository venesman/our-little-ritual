import { Camera, Compass, Heart, Palette, PartyPopper, Telescope, type LucideIcon } from "lucide-react";
import { supabase } from "./supabase";

export type Category =
  | "heart_to_heart" | "creative_corner" | "our_memories"
  | "little_adventures" | "our_future" | "just_for_fun";

export type ResponseType =
  | "text" | "photo" | "drawing" | "choices" | "text_photo"
  | "text_drawing" | "text_link" | "drawing_or_text" | "choices_text";

export interface Activity {
  id: string;
  code: number;
  title: string;
  category: Category;
  description: string;
  instructions: string;
  guiding_questions: string[];
  duration_label: string;
  response_type: ResponseType;
  just_us?: boolean;
  fallback_instructions?: string | null;
  allow_voice?: boolean;
}

export interface WeeklyRitual {
  weeklyId: string;
  weekNumber: number;
  weekStart: string;
  nextRelease: string;
  cycleNumber: number;
  activity: Activity;
}

/** Each category gets its own postcard treatment: a ticket colour, an icon and a postmark code. */
export const CATEGORY: Record<Category, { label: string; tone: "raspberry" | "mustard" | "leaf" | "tomato"; icon: LucideIcon; postmark: string }> = {
  heart_to_heart:    { label: "Heart to Heart",    tone: "raspberry", icon: Heart,       postmark: "HTH" },
  creative_corner:   { label: "Creative Corner",   tone: "mustard",   icon: Palette,     postmark: "ART" },
  our_memories:      { label: "Our Memories",      tone: "leaf",      icon: Camera,      postmark: "MEM" },
  little_adventures: { label: "Little Adventures", tone: "tomato",    icon: Compass,     postmark: "ADV" },
  our_future:        { label: "Our Future",        tone: "raspberry", icon: Telescope,   postmark: "FUT" },
  just_for_fun:      { label: "Just for Fun",      tone: "mustard",   icon: PartyPopper, postmark: "FUN" },
};

export const RESPONSE_LABEL: Record<ResponseType, string> = {
  text: "Write",
  photo: "Photo",
  drawing: "Drawing",
  choices: "Quick picks",
  text_photo: "Words + photo",
  text_drawing: "Words + sketch",
  text_link: "Words + link",
  drawing_or_text: "Draw or write",
  choices_text: "Picks + words",
};

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

/** Makes sure this week's shared ritual exists (server-side) and returns it. Both partners always get the same one. */
export async function getCurrentRitual(): Promise<WeeklyRitual> {
  const rows = check(await supabase.rpc("ensure_current_ritual")) as Array<Record<string, unknown>>;
  const r = rows?.[0];
  if (!r) throw new Error("We couldn't load this week's ritual. Please try again.");
  return {
    weeklyId: r.weekly_id as string,
    weekNumber: r.week_number as number,
    weekStart: r.week_start as string,
    nextRelease: r.next_release as string,
    cycleNumber: r.cycle_number as number,
    activity: {
      id: r.activity_id as string,
      code: r.code as number,
      title: r.title as string,
      category: r.category as Category,
      description: r.description as string,
      instructions: r.instructions as string,
      guiding_questions: (r.guiding_questions as string[]) ?? [],
      duration_label: r.duration_label as string,
      response_type: r.response_type as ResponseType,
      ...(await activityExtras(r.activity_id as string)),
    },
  };
}

/** Personalisation fields aren't in ensure_current_ritual's result, so read them alongside. */
async function activityExtras(id: string): Promise<Pick<Activity, "just_us" | "fallback_instructions" | "allow_voice">> {
  const { data } = await supabase.from("activities").select("just_us, fallback_instructions, allow_voice").eq("id", id).maybeSingle();
  return { just_us: !!data?.just_us, fallback_instructions: (data?.fallback_instructions as string | null) ?? null, allow_voice: !!data?.allow_voice };
}

const HISTORY_SELECT =
  "id, week_number, week_start, cycle:activity_cycles(cycle_number), " +
  "activity:activities(id, code, title, category, description, instructions, guiding_questions, duration_label, response_type, just_us, fallback_instructions, allow_voice)";

type HistoryRow = {
  id: string; week_number: number; week_start: string;
  cycle: { cycle_number: number } | null;
  activity: Activity | null;
};

function toRitual(row: HistoryRow): WeeklyRitual | null {
  if (!row.activity) return null;
  const next = new Date(new Date(row.week_start).getTime() + 7 * 24 * 3600 * 1000).toISOString();
  return { weeklyId: row.id, weekNumber: row.week_number, weekStart: row.week_start, nextRelease: next,
           cycleNumber: row.cycle?.cycle_number ?? 1, activity: row.activity };
}

/** All past and current weeks for the couple, newest first. RLS limits this to their own space. */
export async function getRitualHistory(): Promise<WeeklyRitual[]> {
  const rows = check(
    await supabase.from("weekly_activities").select(HISTORY_SELECT)
      .lte("week_start", new Date().toISOString())
      .order("week_start", { ascending: false }),
  ) as unknown as HistoryRow[];
  return rows.map(toRitual).filter((r): r is WeeklyRitual => r !== null);
}

export async function getRitual(weeklyId: string): Promise<WeeklyRitual | null> {
  const row = check(await supabase.from("weekly_activities").select(HISTORY_SELECT).eq("id", weeklyId).maybeSingle()) as unknown as HistoryRow | null;
  return row ? toRitual(row) : null;
}
