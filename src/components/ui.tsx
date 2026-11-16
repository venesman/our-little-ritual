import type React from "react";
import { useId } from "react";
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
    "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-cornflower focus-visible:ring-offset-2 focus-visible:ring-offset-cream " +
    "disabled:cursor-not-allowed disabled:opacity-50";
  const variants = {
    primary:
      "bg-mustard text-leaf shadow-print hover:-translate-y-px active:translate-y-px",
    dark: "bg-leaf text-cream hover:bg-leaf-deep",
    outline: "border-[1.5px] border-leaf/20 bg-white text-leaf hover:border-leaf/40",
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
  "w-full rounded-2xl border-[1.5px] border-leaf/20 bg-white px-4 py-3 text-leaf placeholder-faint " +
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
    <p role="alert" className="flex items-start gap-2 rounded-2xl bg-tomato-soft px-4 py-3 text-sm text-leaf">
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

/** A round postmark: place around the top, date in the middle, wavy cancellation lines. */
export function Postmark({ place, day, year, className = "" }: { place: string; day: string; year: string; className?: string }) {
  const id = useId();
  return (
    <svg role="img" aria-label={`Postmark: ${place}, ${day} ${year}`} viewBox="0 0 110 110" className={`shrink-0 -rotate-[10deg] ${className}`}>
      <circle cx="55" cy="55" r="50" fill="none" stroke="#2F5A9A" strokeWidth="2.5" />
      <circle cx="55" cy="55" r="34" fill="none" stroke="#2F5A9A" strokeWidth="1.5" />
      <path id={id} d="M 13 55 A 42 42 0 0 1 97 55" fill="none" />
      <text fontFamily="DM Sans Variable, sans-serif" fontSize="10" fontWeight="700" fill="#2F5A9A" letterSpacing="2.5">
        <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">{place.toUpperCase().slice(0, 20)}</textPath>
      </text>
      <text x="55" y="52" textAnchor="middle" fontFamily="DM Serif Display, serif" fontSize="17" fill="#2F5A9A">{day.toUpperCase()}</text>
      <text x="55" y="68" textAnchor="middle" fontFamily="DM Sans Variable, sans-serif" fontSize="10" fontWeight="700" fill="#2F5A9A" letterSpacing="2">{year}</text>
      <path d="M 20 84 q 6 -5 12 0 t 12 0 t 12 0 t 12 0 t 12 0 t 12 0" fill="none" stroke="#2F5A9A" strokeWidth="1.5" />
    </svg>
  );
}

const STAMP_BG = { tangerine: "#E0614F", cornflower: "#4F7FC1", lime: "#DCEBE2", gold: "#FBDDC6", lilac: "#E9D3E5" } as const;
export type StampColour = keyof typeof STAMP_BG;
/** A perforated postage stamp with something small inside (a number, a letter, an icon). */
export function PostageStamp({ colour = "tangerine", size = "md", tilt = 4, children }: { colour?: StampColour; size?: "sm" | "md" | "lg"; tilt?: number; children: React.ReactNode }) {
  const dims = size === "sm" ? "h-[52px] w-[44px]" : size === "lg" ? "h-[80px] w-[66px]" : "h-[64px] w-[54px]";
  const bg = STAMP_BG[colour];
  return (
    <span aria-hidden="true" className={`block shrink-0 ${dims}`}
      style={{ transform: `rotate(${tilt}deg)`, padding: 6, background: `radial-gradient(circle at 4px 4px, #FFFAF3 3px, transparent 3.5px) -4px -4px / 8px 8px, ${bg}` }}>
      <span className="flex h-full flex-col items-center justify-center gap-0.5 border-[1.5px] border-leaf text-leaf" style={{ background: bg }}>{children}</span>
    </span>
  );
}

/** Page title in the Par Avion style: "Our" upright, the last word in italics. */
export function PageTitle({ children, className = "" }: { children: string; className?: string }) {
  const i = children.lastIndexOf(" ");
  return <h1 className={`text-[2.75rem] leading-none ${className}`}>{i < 0 ? <em>{children}</em> : <>{children.slice(0, i)} <em>{children.slice(i + 1)}</em></>}</h1>;
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
