import type React from "react";
import { AlertCircle, Loader2 } from "lucide-react";

/* ------------------------------------------------------------------ Button
 * primary: lime with an ink border and a printed offset shadow
 * dark:    ink with cream text
 * outline / ghost: quieter actions                                         */
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "dark" | "outline" | "ghost";
  busy?: boolean;
};

export function Button({ variant = "primary", busy = false, className = "", children, disabled, ...props }: ButtonProps) {
  const base =
    "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[4px] px-5 py-2.5 text-sm font-bold transition " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-cornflower focus-visible:ring-offset-2 focus-visible:ring-offset-cream " +
    "disabled:cursor-not-allowed disabled:opacity-50";
  const variants = {
    primary:
      "border-[1.5px] border-leaf bg-mustard text-leaf shadow-print hover:-translate-y-px active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
    dark: "border-[1.5px] border-leaf bg-leaf text-cream hover:bg-leaf-deep",
    outline: "border-[1.5px] border-dashed border-leaf bg-paper/60 text-leaf hover:bg-paper",
    ghost: "text-muted hover:bg-leaf-soft/60 hover:text-leaf",
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} disabled={disabled || busy} {...props}>
      {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

/* ---------------------------------------------------------- Card / Postcard */
export function Card({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`postcard ${className}`} {...props} />;
}

/* ------------------------------------------------------------------ Fields */
export const inputCls =
  "w-full rounded-[4px] border-[1.5px] border-leaf/30 bg-paper px-4 py-3 text-leaf placeholder-faint " +
  "focus:border-leaf focus:outline-none focus:ring-2 focus:ring-cornflower/40";

export function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-semibold uppercase tracking-[0.12em] text-leaf">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-[4px] border-[1.5px] border-tomato bg-tomato-soft/70 px-4 py-3 text-sm text-leaf">
      <AlertCircle size={16} className="mt-0.5 shrink-0 text-tomato-deep" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted" role="status">
      <Loops className="h-12 w-20 animate-pulse" />
      <span className="font-hand text-xl">{label}…</span>
    </div>
  );
}

/* --------------------------------------------------- Decorative primitives */

/** Two overlapping loops — the brand mark. Two people, two places, one shared middle. */
export function Loops({ className = "", tone = "colour" }: { className?: string; tone?: "colour" | "cream" }) {
  const a = tone === "cream" ? "#FCF2E8" : "#EA572C";
  const b = tone === "cream" ? "#DBDE49" : "#4F7FC1";
  return (
    <svg viewBox="0 0 80 48" className={className} aria-hidden="true">
      <circle cx="28" cy="24" r="18" fill="none" stroke={a} strokeWidth="6" />
      <circle cx="52" cy="24" r="18" fill="none" stroke={b} strokeWidth="6" />
      <circle cx="40" cy="24" r="4" fill="#C3B20D" />
    </svg>
  );
}

/** Abstract loop cluster for colour-block panels; place it in a corner box. */
export function LoopField({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="200 -60 220 240" className={className} aria-hidden="true">
      <circle cx="340" cy="34" r="78" fill="none" stroke="#EA572C" strokeWidth="18" />
      <circle cx="252" cy="62" r="38" fill="none" stroke="#4F7FC1" strokeWidth="13" />
      <circle cx="372" cy="150" r="24" fill="#C3B20D" />
    </svg>
  );
}

/** Ticket-style label with notched ends. */
export function Ticket({ children, tone = "raspberry", className = "" }: { children: React.ReactNode; tone?: "raspberry" | "mustard" | "tomato" | "leaf"; className?: string }) {
  const tones = {
    raspberry: "bg-lilac text-leaf",
    mustard: "bg-gold text-leaf",
    tomato: "bg-tomato text-leaf",
    leaf: "bg-leaf text-cream",
  };
  return (
    <span className={`ticket inline-flex items-center gap-1.5 px-4 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

/** Round passport-style stamp. */
export function Stamp({ top, main, bottom, className = "" }: { top: string; main: string; bottom?: string; className?: string }) {
  return (
    <div
      className={`stamp-in grid h-24 w-24 shrink-0 place-items-center rounded-full border-[2.5px] border-cornflower-deep p-1 text-center text-cornflower-deep ${className}`}
      style={{ transform: "rotate(-8deg)" }}
      aria-hidden="true"
    >
      <div className="grid h-full w-full place-items-center rounded-full border-[1.5px] border-cornflower-deep/70">
        <div className="leading-tight">
          <div className="text-[8px] font-bold uppercase tracking-[0.18em]">{top}</div>
          <div className="font-display text-lg">{main}</div>
          {bottom && <div className="text-[8px] font-bold uppercase tracking-[0.18em]">{bottom}</div>}
        </div>
      </div>
    </div>
  );
}

export function Logo({ className = "", tone = "leaf" }: { className?: string; tone?: "leaf" | "cream" }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Loops className="h-7 w-11" tone={tone === "cream" ? "cream" : "colour"} />
      <span className={`font-display text-xl ${tone === "cream" ? "text-cream" : "text-leaf"}`} style={{}}>
        Our Little Ritual
      </span>
    </span>
  );
}

/** Centered single-column page used before someone is inside the app (pairing, password screens). */
export function OuterPage({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-5 py-8">
      <header className="mb-10"><Logo /></header>
      <div className="fade-up flex-1">{children}</div>
    </main>
  );
}
