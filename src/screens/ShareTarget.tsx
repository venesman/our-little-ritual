import { Link, useSearchParams } from "react-router-dom";
import { Mail, Music2 } from "lucide-react";
import { findSongLink } from "../lib/music";

/** Where Android's Share menu lands: pick what to do with a shared Spotify song. */
export function ShareTarget() {
  const [p] = useSearchParams();
  const link = findSongLink([p.get("url"), p.get("text"), p.get("title")].filter(Boolean).join(" "));
  if (!link) {
    return (
      <div className="fade-up space-y-3">
        <h1 className="text-3xl">Hmm, no song there</h1>
        <p className="text-sm text-muted">Share a song from Spotify (••• → Share) and choose Our Little Ritual.</p>
        <Link to="/" className="font-semibold text-leaf underline">Back home</Link>
      </div>
    );
  }
  const enc = encodeURIComponent(link);
  return (
    <div className="fade-up space-y-4">
      <p className="font-hand text-2xl text-raspberry-deep">a song to share</p>
      <h1 className="text-3xl">Where should it go?</h1>
      <Link to={`/mailbox/new?song=${enc}`} className="postcard flex items-center gap-3 !p-4"><Mail size={20} aria-hidden="true" /><span className="font-display text-lg font-semibold">Add it to a letter</span></Link>
      <Link to={`/us?tab=story&song=${enc}`} className="postcard flex items-center gap-3 !p-4"><Music2 size={20} aria-hidden="true" /><span className="font-display text-lg font-semibold">Add it to our soundtrack</span></Link>
    </div>
  );
}
