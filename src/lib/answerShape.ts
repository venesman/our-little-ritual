import type { Activity } from "./rituals";

export type Need = "required" | "optional" | false;

export interface AnswerShape {
  text: Need;
  photo: Need;
  drawing: Need;
  /** drawing_or_text: the person chooses one. */
  eitherDrawOrWrite: boolean;
  link: boolean;
  /** Short per-prompt answers, for the quick-pick style activities. */
  prompts: null | { mode: "pick" | "who" | "guess"; max: number };
  textLabel: string;
}

/** What the answer form should offer for an activity. */
export function shapeFor(activity: Pick<Activity, "code" | "response_type">): AnswerShape {
  const base: AnswerShape = { text: false, photo: false, drawing: false, eitherDrawOrWrite: false, link: false, prompts: null, textLabel: "Your answer" };
  switch (activity.response_type) {
    case "text": return { ...base, text: "required" };
    case "photo": return { ...base, photo: "required", text: "optional", textLabel: "A line about it (optional)" };
    case "drawing": return { ...base, drawing: "required", text: "optional", textLabel: "A caption (optional)" };
    case "text_photo": return { ...base, text: "required", photo: "optional" };
    case "text_drawing": return { ...base, text: "required", drawing: "optional" };
    case "text_link": return { ...base, text: "required", link: true };
    case "drawing_or_text": return { ...base, eitherDrawOrWrite: true, text: "optional", drawing: "optional" };
    case "choices":
      return { ...base, text: "optional", textLabel: "Anything to add? (optional)", prompts: { mode: activity.code === 39 ? "who" : "pick", max: 5 } };
    case "choices_text":
      return { ...base, text: "optional", textLabel: "Anything to add? (optional)", prompts: { mode: "guess", max: 5 } };
  }
}

/** Starting prompts for the quick-pick activities: the guiding questions, padded with blanks up to `min`. */
export function starterPrompts(questions: string[], min = 3): { prompt: string; answer: string; guess?: string }[] {
  const list = questions.map((q) => ({ prompt: q, answer: "" }));
  while (list.length < min) list.push({ prompt: "", answer: "" });
  return list;
}

export function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}
