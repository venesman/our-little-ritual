import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ImagePlus, Loader2, Lock, PenLine, Pencil, Plus, X } from "lucide-react";
import type { WeeklyRitual } from "../lib/rituals";
import { MEDIA_BUCKET, removeRitualImage, saveDraft, setRitualVoice, signedImageUrl, submitRitual, uploadRitualImage, type Answer, type Submission } from "../lib/submissions";
import { uploadVoice, VoicePlayer, VoiceRecorder, type RecordedVoice } from "./Voice";
import { shapeFor, starterPrompts } from "../lib/answerShape";
import { compressImage } from "../lib/image";
import { friendlyError } from "../lib/errors";
import { Button, ErrorNote, Field, inputCls } from "./ui";
import { DrawingPad, type DrawingPadHandle } from "./DrawingPad";

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Your answer to this week's ritual. Drafts save to the server as you go
 * (private to you). "Share" seals it; the database then keeps it hidden from
 * your partner until they've shared too.
 */
export function AnswerForm({ ritual, relationshipId, userId, myName, partnerName, draft, onShared }: {
  ritual: WeeklyRitual; relationshipId: string; userId: string; myName: string; partnerName: string;
  draft: Submission | null; onShared: (revealed: boolean) => void;
}) {
  const shape = useMemo(() => shapeFor(ritual.activity), [ritual.activity]);
  const [body, setBody] = useState(draft?.body ?? "");
  const [link, setLink] = useState(draft?.link_url ?? "");
  const [answers, setAnswers] = useState<Answer[]>(
    draft?.answers?.length ? draft.answers : shape.prompts ? starterPrompts(ritual.activity.guiding_questions) : [],
  );
  const [imagePath, setImagePath] = useState<string | null>(draft?.image_path ?? null);
  const [voicePath, setVoicePath] = useState<string | null>(draft?.voice_path ?? null);
  const [voiceSecs, setVoiceSecs] = useState<number | null>(draft?.voice_seconds ?? null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<"write" | "draw">(shape.drawing === "required" ? "draw" : "write");
  const [drawingDirty, setDrawingDirty] = useState(false);
  const [save, setSave] = useState<SaveState>("idle");
  const [busy, setBusy] = useState<null | "photo" | "share">(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pad = useRef<DrawingPadHandle>(null);
  const firstRender = useRef(true);
  const showDrawing = shape.drawing !== false && (!shape.eitherDrawOrWrite || mode === "draw");
  const showText = shape.text !== false && (!shape.eitherDrawOrWrite || mode === "write");

  useEffect(() => {
    if (imagePath) signedImageUrl(imagePath).then(setImageUrl); else setImageUrl(null);
  }, [imagePath]);

  const persist = async (overrides: Partial<{ image_path: string | null }> = {}) => {
    setSave("saving");
    try {
      await saveDraft(ritual.weeklyId, {
        body, link_url: link.trim() || null,
        answers: answers.map((a) => ({ ...a, prompt: a.prompt.trim(), answer: a.answer.trim(), guess: a.guess?.trim() || undefined })),
        image_path: "image_path" in overrides ? overrides.image_path! : imagePath,
      });
      setSave("saved");
    } catch (e) {
      setSave("error");
      setError(friendlyError(e, "Your draft couldn't be saved just now. Keep this page open and try again."));
    }
  };

  // Autosave text changes ~1.2 s after typing stops.
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    setSave("idle");
    const t = window.setTimeout(() => void persist(), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, link, answers]);

  const replaceImage = async (blob: Blob) => {
    const old = imagePath;
    const path = await uploadRitualImage(relationshipId, ritual.weeklyId, userId, blob);
    setImagePath(path);
    await persist({ image_path: path });
    if (old && old !== path) void removeRitualImage(old);
    return path;
  };

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy("photo"); setError(null);
    try { await replaceImage(await compressImage(file)); }
    catch (e) { setError(e instanceof Error && !("code" in e) ? e.message : friendlyError(e, "That photo couldn't be uploaded. Please try again.")); }
    finally { setBusy(null); }
  };

  const removePhoto = async () => {
    const old = imagePath;
    setImagePath(null);
    await persist({ image_path: null });
    if (old) void removeRitualImage(old);
  };

  const share = async () => {
    setBusy("share"); setError(null);
    try {
      if (showDrawing && drawingDirty && pad.current && !pad.current.isEmpty()) {
        const png = await pad.current.toBlob();
        if (png) await replaceImage(png);
        setDrawingDirty(false);
      } else {
        await persist();
      }
      const revealed = await submitRitual(ritual.weeklyId);
      onShared(revealed);
    } catch (e) {
      setError(friendlyError(e, "We couldn't share that just now. Your draft is safe — please try again."));
      setConfirming(false);
    } finally {
      setBusy(null);
    }
  };

  const setAnswer = (i: number, patch: Partial<Answer>) => setAnswers((list) => list.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  return (
    <section aria-label="Your answer" className="postcard space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl">Your turn</h2>
        <SaveBadge state={save} />
      </div>

      {shape.eitherDrawOrWrite && (
        <div className="inline-flex rounded-full border-2 border-leaf/20 p-1" role="tablist" aria-label="Draw or write">
          {(["write", "draw"] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold ${mode === m ? "bg-mustard text-leaf" : "text-muted"}`}>
              {m === "write" ? <PenLine size={14} /> : <Pencil size={14} />}{m === "write" ? "Write" : "Draw"}
            </button>
          ))}
        </div>
      )}

      {shape.prompts && (
        <div className="space-y-3">
          {answers.map((a, i) => (
            <div key={i} className="space-y-2 rounded-xl bg-cream/70 p-3">
              {ritual.activity.guiding_questions[i] !== undefined && a.prompt === ritual.activity.guiding_questions[i] ? (
                <p className="text-sm font-semibold">{a.prompt}</p>
              ) : (
                <input className={inputCls} placeholder={shape.prompts!.mode === "who" ? "Who is more likely to…" : "Your own question"}
                  value={a.prompt} maxLength={200} onChange={(e) => setAnswer(i, { prompt: e.target.value })} aria-label={`Question ${i + 1}`} />
              )}
              {shape.prompts!.mode === "who" ? (
                <div className="flex gap-2">
                  {[myName, partnerName].map((n) => (
                    <button key={n} type="button" onClick={() => setAnswer(i, { answer: n })} aria-pressed={a.answer === n}
                      className={`flex-1 rounded-full border-2 px-3 py-2 text-sm font-semibold ${a.answer === n ? "border-leaf bg-mustard text-leaf" : "border-leaf/20 text-muted"}`}>
                      {n}
                    </button>
                  ))}
                </div>
              ) : (
                <input className={inputCls} placeholder="Your answer" value={a.answer} maxLength={300}
                  onChange={(e) => setAnswer(i, { answer: e.target.value })} aria-label={`Your answer to question ${i + 1}`} />
              )}
              {shape.prompts!.mode === "guess" && (
                <input className={inputCls} placeholder={`Your guess for ${partnerName}`} value={a.guess ?? ""} maxLength={300}
                  onChange={(e) => setAnswer(i, { guess: e.target.value })} aria-label={`Your guess for question ${i + 1}`} />
              )}
            </div>
          ))}
          {answers.length < shape.prompts.max && (
            <button type="button" onClick={() => setAnswers((l) => [...l, { prompt: "", answer: "" }])}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-leaf hover:underline">
              <Plus size={15} /> Add a question
            </button>
          )}
        </div>
      )}

      {shape.photo !== false && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-leaf">Photo {shape.photo === "optional" && <span className="font-normal normal-case tracking-normal text-muted">(optional)</span>}</p>
          {imageUrl ? (
            <div className="relative">
              <img src={imageUrl} alt="Your photo" className="w-full rounded-xl border border-leaf/10 object-contain" />
              <button type="button" onClick={removePhoto} className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-leaf text-cream" aria-label="Remove photo"><X size={16} /></button>
            </div>
          ) : (
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-leaf/30 px-4 py-8 text-center text-muted hover:border-leaf/60">
              {busy === "photo" ? <Loader2 className="animate-spin" /> : <ImagePlus className="text-raspberry-deep" />}
              <span className="text-sm font-semibold">{busy === "photo" ? "Uploading…" : "Choose or take a photo"}</span>
              <input type="file" accept="image/*" className="sr-only" disabled={busy !== null} onChange={(e) => void onPhoto(e.target.files?.[0])} />
            </label>
          )}
        </div>
      )}

      {showDrawing && (
        <div className="space-y-2">
          {imageUrl && !drawingDirty && shape.photo === false && (
            <p className="text-sm text-muted">Your saved drawing is attached. Draw again below to replace it.</p>
          )}
          <DrawingPad ref={pad} onChange={() => { setDrawingDirty(true); setSave("idle"); }} />
          {drawingDirty && (
            <Button type="button" variant="outline" busy={busy === "photo"} onClick={async () => {
              const png = await pad.current?.toBlob(); if (!png) return;
              setBusy("photo"); try { await replaceImage(png); setDrawingDirty(false); } catch (e) { setError(friendlyError(e)); } finally { setBusy(null); }
            }}>Save drawing to draft</Button>
          )}
        </div>
      )}

      {showText && (
        <Field label={shape.text === "required" ? shape.textLabel : shape.textLabel} htmlFor="answer-body">
          <textarea id="answer-body" className={`${inputCls} min-h-[160px] leading-relaxed`} value={body} maxLength={5000}
            onChange={(e) => setBody(e.target.value)} placeholder="Take your time…" />
        </Field>
      )}

      {shape.link && (
        <Field label="Link (optional)" htmlFor="answer-link" hint="Paste a song link — it must start with https://">
          <input id="answer-link" type="url" inputMode="url" className={inputCls} value={link} maxLength={500}
            onChange={(e) => setLink(e.target.value)} placeholder="https://" />
        </Field>
      )}

      {ritual.activity.allow_voice && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-leaf">Voice note <span className="font-normal normal-case tracking-normal text-muted">(optional)</span></p>
          {voicePath ? (
            <div>
              <VoicePlayer bucket={MEDIA_BUCKET} path={voicePath} seconds={voiceSecs} label="Your voice note" />
              <button type="button" disabled={voiceBusy || busy !== null} className="mt-1 text-sm font-semibold text-tomato-deep" onClick={async () => {
                const old = voicePath; setVoiceBusy(true);
                try { await setRitualVoice(ritual.weeklyId, null, null); setVoicePath(null); setVoiceSecs(null); if (old) void removeRitualImage(old); }
                catch (e) { setError(friendlyError(e)); } finally { setVoiceBusy(false); }
              }}>Remove voice note</button>
            </div>
          ) : (
            <VoiceRecorder value={null} disabled={voiceBusy} onChange={async (v: RecordedVoice | null) => {
              if (!v) return;
              setVoiceBusy(true); setError(null);
              try {
                const path = await uploadVoice(MEDIA_BUCKET, `${relationshipId}/${ritual.weeklyId}/${userId}`, v);
                await setRitualVoice(ritual.weeklyId, path, v.seconds);
                setVoicePath(path); setVoiceSecs(v.seconds); setSave("saved");
              } catch (e) { setError(friendlyError(e, "That voice note couldn't be saved. Please try again.")); }
              finally { setVoiceBusy(false); }
            }} />
          )}
          {voiceBusy && <p className="text-xs text-muted">Saving your voice note…</p>}
        </div>
      )}

      <ErrorNote>{error}</ErrorNote>

      <div className="border-t border-dashed border-leaf/25 pt-4">
        {!confirming ? (
          <Button type="button" onClick={() => setConfirming(true)} disabled={busy !== null} className="w-full sm:w-auto">
            <Lock size={15} aria-hidden="true" /> Seal &amp; share
          </Button>
        ) : (
          <div className="space-y-3 rounded-xl bg-mustard-soft/60 p-4">
            <p className="text-sm">Once it's sealed you can't change it. {partnerName} will see it only when they've shared theirs too.</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={share} busy={busy === "share"}>Yes, seal it</Button>
              <Button type="button" variant="ghost" onClick={() => setConfirming(false)} disabled={busy === "share"}>Not yet</Button>
            </div>
          </div>
        )}
        <p className="mt-3 font-hand text-lg text-muted">drafts are private to you, and save as you go</p>
      </div>
    </section>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state === "saving") return <span className="inline-flex items-center gap-1 text-xs text-muted"><Loader2 size={12} className="animate-spin" />Saving…</span>;
  if (state === "saved") return <span className="inline-flex items-center gap-1 text-xs text-muted"><Check size={12} />Draft saved</span>;
  if (state === "error") return <span className="text-xs text-tomato-deep">Not saved</span>;
  return null;
}
