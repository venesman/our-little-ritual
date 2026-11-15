import { useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { BookHeart, CloudOff, Dices, Home, Mail, Settings, Stamp } from "lucide-react";
import { Logo } from "./ui";

/**
 * Navigation grows phase by phase (Activities, Mailbox, Scrapbook…).
 * Only sections that actually work are listed — no dead tabs.
 */
const NAV = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/rituals", label: "Rituals", icon: Stamp, end: false },
  { to: "/play", label: "Play", icon: Dices, end: false },
  { to: "/us", label: "Us", icon: BookHeart, end: false },
  { to: "/mailbox", label: "Mailbox", icon: Mail, end: false },
] as const;
// The desktop sidebar has room for Settings too; on phones it's the gear at the top.
const DESKTOP_NAV = [...NAV, { to: "/settings", label: "Settings", icon: Settings, end: false }] as const;

/**
 * Tells you when the phone is offline (so nothing looks up to date when it isn't),
 * and refreshes every screen the moment the connection comes back.
 */
function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const up = () => {
      setOnline(true);
      // Screens already refresh when the app becomes visible; reuse that to resync now.
      document.dispatchEvent(new Event("visibilitychange"));
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
  return online;
}

export function AppShell() {
  const online = useOnline();
  return (
    <div className="min-h-[100dvh] md:flex">
      {/* desktop sidebar — a leaf-green journal spine */}
      <aside className="sticky top-0 hidden h-[100dvh] w-64 shrink-0 flex-col justify-between bg-leaf px-5 py-8 md:flex">
        <div className="space-y-10">
          <Logo tone="cream" />
          <nav className="flex flex-col gap-1.5" aria-label="Main">
            {DESKTOP_NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to} to={to} end={end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-semibold transition ${isActive ? "bg-mustard text-leaf" : "text-cream/80 hover:bg-cream/10 hover:text-cream"}`}
              >
                <Icon size={18} aria-hidden="true" />{label}
              </NavLink>
            ))}
          </nav>
        </div>
        <p className="font-hand text-xl leading-snug text-raspberry">two people,<br />two places,<br />one little world.</p>
      </aside>

      <main className="mx-auto w-full max-w-2xl px-5 pb-28 pt-6 md:pb-12 md:pt-10">
        <div className="no-print mb-6 flex items-center justify-between md:hidden">
          <Logo />
          <Link to="/settings" aria-label="Settings" className="grid h-11 w-11 place-items-center rounded-full text-leaf hover:bg-leaf-soft"><Settings size={21} aria-hidden="true" /></Link>
        </div>
        {!online && (
          <p role="status" className="no-print mb-4 flex items-center gap-2 rounded-xl bg-mustard-soft px-4 py-2 text-sm text-mustard-deep">
            <CloudOff size={15} aria-hidden="true" /> You're offline — this is what was last loaded. It'll refresh when you're back online.
          </p>
        )}
        <Outlet />
      </main>

      {/* mobile bottom bar */}
      <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-20 bg-leaf md:hidden">
        <ul className="mx-auto flex max-w-md justify-around px-2 pt-2">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to} end={end}
                className={({ isActive }) =>
                  `flex min-w-[58px] flex-col items-center gap-1 rounded-2xl px-3 py-1.5 text-[11px] font-semibold transition ${isActive ? "bg-mustard text-leaf" : "text-cream/75"}`}
              >
                <Icon size={21} aria-hidden="true" />{label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
