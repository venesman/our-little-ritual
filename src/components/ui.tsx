import type React from "react";
import { AlertCircle, Loader2 } from "lucide-react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "soft" | "outline" | "ghost";
  busy?: boolean;
};

export function Button({ variant = "primary", busy = false, className = "", children, disabled, ...props }: ButtonProps) {
  const base =
    "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-tangerine focus-visible:ring-offset-2 focus-visible:ring-offset-cream " +
    "disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]";
  const variants = {
    primary: "bg-forest text-cream hover:bg-forest-deep",
    soft: "bg-tangerine-soft text-tangerine-deep hover:bg-tangerine/30",
    outline: "border border-bark-soft/60 bg-white/70 text-forest hover:bg-white",
    ghost: "text-bark hover:bg-tangerine-soft/60 hover:text-forest",
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} disabled={disabled || busy} {...props}>
      {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Card({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-3xl border border-white/80 bg-white/90 p-6 shadow-paper ${className}`} {...props} />;
}

export const inputCls =
  "w-full rounded-2xl border border-bark-soft/50 bg-white px-4 py-3 text-ink placeholder-bark-soft " +
  "focus:border-tangerine focus:outline-none focus:ring-2 focus:ring-tangerine-soft";

export function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-forest">{label}</label>
      {children}
      {hint && <p className="text-xs text-bark">{hint}</p>}
    </div>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-2xl bg-cherry-soft/70 px-4 py-3 text-sm text-ink">
      <AlertCircle size={16} className="mt-0.5 shrink-0 text-cherry" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-bark" role="status">
      <Loader2 className="animate-spin text-tangerine" aria-hidden="true" />
      <span className="text-sm">{label}…</span>
    </div>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 64 64" className="h-7 w-7" aria-hidden="true">
        <rect width="64" height="64" rx="16" fill="#2F5D3A" />
        <circle cx="26" cy="32" r="11" fill="none" stroke="#F28C38" strokeWidth="4" />
        <circle cx="38" cy="32" r="11" fill="none" stroke="#F4B3C2" strokeWidth="4" />
        <circle cx="32" cy="32" r="3" fill="#D7263D" />
      </svg>
      <span className="font-serif text-xl text-forest">Our Little Ritual</span>
    </span>
  );
}

/** Centered single-column page used before someone is inside the app (sign-in, pairing). */
export function OuterPage({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-5 py-8">
      <header className="mb-10"><Logo /></header>
      <div className="fade-up flex-1">{children}</div>
    </main>
  );
}
