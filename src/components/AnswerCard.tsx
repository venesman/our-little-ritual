import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { Submission } from "../lib/submissions";
import { signedImageUrl } from "../lib/submissions";
import { hostOf } from "../lib/answerShape";
import { Ticket } from "./ui";

/** One person's answer, shown as a postcard. Images load through short-lived private links. */
export function AnswerCard({ submission, name, tone, mode, delay = 0 }: {
  submission: Submission; name: string; tone: "raspberry" | "mustard"; mode?: "pick" | "who" | "guess"; delay?: number;
}) {
  const [img, setImg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (submission.image_path) signedImageUrl(submission.image_path).then((u) => { if (alive) setImg(u); });
    return () => { alive = false; };
  }, [submission.image_path]);

  const answered = submission.answers.filter((a) => a.prompt || a.answer);

  return (
    <article className="postcard fade-up" style={{ animationDelay: `${delay}ms` }}>
      <Ticket tone={tone}>{name}</Ticket>
      {img && <img src={img} alt={`${name}'s picture`} className="mt-4 w-full rounded-xl border border-leaf/10 bg-cream object-contain" loading="lazy" />}
      {submission.image_path && !img && <div className="mt-4 aspect-[4/3] w-full animate-pulse rounded-xl bg-cream" aria-label="Loading picture" />}
      {answered.length > 0 && (
        <dl className="mt-4 space-y-3">
          {answered.map((a, i) => (
            <div key={i} className="rounded-xl bg-cream/70 px-4 py-3">
              <dt className="text-xs font-bold uppercase tracking-[0.12em] text-muted">{a.prompt || `Question ${i + 1}`}</dt>
              <dd className="mt-0.5 font-display text-lg font-semibold">{a.answer || "—"}</dd>
              {mode === "guess" && a.guess && <dd className="mt-1 font-hand text-lg text-raspberry-deep">guessed for you: {a.guess}</dd>}
            </div>
          ))}
        </dl>
      )}
      {submission.body && <p className="mt-4 whitespace-pre-wrap leading-relaxed">{submission.body}</p>}
      {submission.link_url && (
        <a href={submission.link_url} target="_blank" rel="noopener noreferrer nofollow ugc"
           className="mt-4 inline-flex items-center gap-1.5 rounded-full border-2 border-leaf/20 px-4 py-2 text-sm font-semibold text-leaf hover:border-leaf/50">
          <ExternalLink size={14} aria-hidden="true" /> {hostOf(submission.link_url)}
        </a>
      )}
    </article>
  );
}
