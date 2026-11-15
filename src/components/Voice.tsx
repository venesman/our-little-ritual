import { useEffect, useRef, useState } from "react";
import { Mic, RotateCcw, Square, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase";

export const MAX_VOICE_SECONDS = 120;

/** The recording format this browser supports (Chrome/Android: webm, iPhone Safari: mp4). */
function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return undefined;
}
export const voiceSupported = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
const extFor = (mime: string) => (mime.includes("mp4") || mime.includes("aac") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm");
export const baseMime = (mime: string) => (mime.includes("mp4") ? "audio/mp4" : mime.split(";")[0]);

export interface RecordedVoice { blob: Blob; seconds: number; mime: string; ext: string }

/**
 * Record up to two minutes, listen back, re-record or remove. Nothing is uploaded
 * until the screen using it decides to (e.g. on save or send).
 */
export function VoiceRecorder({ value, onChange, disabled }: {
  value: RecordedVoice | null; onChange: (v: RecordedVoice | null) => void; disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const timer = useRef<number | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!value) { setUrl(null); return; }
    const u = URL.createObjectURL(value.blob); setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [value]);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); rec.current?.stream.getTracks().forEach((t) => t.stop()); }, []);

  const stop = () => { if (rec.current && rec.current.state !== "inactive") rec.current.stop(); };

  const start = async () => {
    setError(null);
    if (!voiceSupported()) { setError("This browser can't record audio. Try Chrome on Android or Safari on iPhone."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime();
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timer.current) { clearInterval(timer.current); timer.current = null; }
        setRecording(false);
        const type = r.mimeType || mime || "audio/webm";
        const secs = Math.max(1, Math.min(MAX_VOICE_SECONDS, Math.round((Date.now() - started.current) / 1000)));
        onChange({ blob: new Blob(chunks.current, { type }), seconds: secs, mime: baseMime(type), ext: extFor(type) });
      };
      rec.current = r;
      started.current = Date.now();
      setElapsed(0);
      r.start();
      setRecording(true);
      timer.current = window.setInterval(() => {
        const s = Math.floor((Date.now() - started.current) / 1000);
        setElapsed(s);
        if (s >= MAX_VOICE_SECONDS) stop();
      }, 250);
    } catch {
      setError("We couldn't use the microphone. Check that this site is allowed to use it.");
    }
  };

  const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-2 rounded-2xl bg-cream px-4 py-3">
      {recording ? (
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 animate-pulse rounded-full bg-tomato" aria-hidden="true" />
          <span className="font-display text-xl tabular-nums" aria-live="polite">{clock(elapsed)} / 2:00</span>
          <button type="button" onClick={stop} className="ml-auto inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-tomato-deep px-4 text-sm font-semibold text-cream">
            <Square size={14} aria-hidden="true" /> Stop
          </button>
        </div>
      ) : value && url ? (
        <div className="space-y-2">
          <audio controls src={url} className="w-full" preload="metadata" />
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="text-muted">{clock(value.seconds)} recorded</span>
            <button type="button" disabled={disabled} onClick={() => void start()} className="ml-auto inline-flex items-center gap-1 font-semibold text-leaf"><RotateCcw size={14} aria-hidden="true" /> Re-record</button>
            <button type="button" disabled={disabled} onClick={() => onChange(null)} className="inline-flex items-center gap-1 font-semibold text-tomato-deep"><Trash2 size={14} aria-hidden="true" /> Remove</button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={disabled} onClick={() => void start()} className="inline-flex min-h-[40px] items-center gap-2 text-sm font-semibold text-leaf">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-raspberry text-leaf"><Mic size={16} aria-hidden="true" /></span>
          Record a voice note (up to 2 min)
        </button>
      )}
      {error && <p className="text-xs text-tomato-deep">{error}</p>}
    </div>
  );
}

/** Uploads a recording to a private bucket and returns its storage path. */
export async function uploadVoice(bucket: string, folder: string, v: RecordedVoice): Promise<string> {
  const path = `${folder}/${crypto.randomUUID()}.${v.ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, v.blob, { contentType: v.mime, upsert: false });
  if (error) throw error;
  return path;
}

/** Plays a stored voice note through a short-lived private link. */
export function VoicePlayer({ bucket, path, seconds, label }: { bucket: string; path: string; seconds?: number | null; label?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    supabase.storage.from(bucket).createSignedUrl(path, 3600).then(({ data }) => {
      if (!alive) return;
      if (data?.signedUrl) setUrl(data.signedUrl); else setFailed(true);
    });
    return () => { alive = false; };
  }, [bucket, path]);
  return (
    <div className="mt-3 rounded-2xl bg-cream px-3 py-2">
      <p className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
        <Mic size={12} aria-hidden="true" />{label ?? "Voice note"}{seconds ? ` · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : ""}
      </p>
      {url ? <audio controls src={url} className="w-full" preload="metadata" /> : failed ? <p className="text-xs text-muted">This voice note couldn't be loaded.</p> : <div className="h-10 animate-pulse rounded-xl bg-leaf-soft" />}
    </div>
  );
}

