import { NavLink, Outlet } from "react-router-dom";
import { Home, Settings } from "lucide-react";
import { Logo } from "./ui";

/**
 * Navigation grows phase by phase (Activities, Mailbox, Scrapbook…).
 * Only sections that actually work are listed — no dead tabs.
 */
const NAV = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/settings", label: "Settings", icon: Settings, end: false },
] as const;

export function AppShell() {
  return (
    <div className="min-h-[100dvh] md:flex">
      {/* desktop sidebar — a leaf-green journal spine */}
      <aside className="sticky top-0 hidden h-[100dvh] w-64 shrink-0 flex-col justify-between bg-leaf px-5 py-8 md:flex">
        <div className="space-y-10">
          <Logo tone="cream" />
          <nav className="flex flex-col gap-1.5" aria-label="Main">
            {NAV.map(({ to, label, icon: Icon, end }) => (
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
        <div className="mb-6 md:hidden"><Logo /></div>
        <Outlet />
      </main>

      {/* mobile bottom bar */}
      <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-20 bg-leaf md:hidden">
        <ul className="mx-auto flex max-w-md justify-around px-4 pt-2">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to} end={end}
                className={({ isActive }) =>
                  `flex min-w-[72px] flex-col items-center gap-1 rounded-2xl px-3 py-1.5 text-[11px] font-semibold transition ${isActive ? "bg-mustard text-leaf" : "text-cream/75"}`}
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
