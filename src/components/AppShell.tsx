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
  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition ${isActive ? "bg-sage-soft text-forest" : "text-bark hover:bg-white/70 hover:text-forest"}`;

  return (
    <div className="min-h-[100dvh] md:flex">
      {/* desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col gap-8 border-r border-bark-soft/20 px-5 py-8 md:flex">
        <Logo />
        <nav className="flex flex-col gap-1" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={linkCls}><Icon size={18} aria-hidden="true" />{label}</NavLink>
          ))}
        </nav>
      </aside>

      <main className="mx-auto w-full max-w-2xl px-5 pb-28 pt-6 md:pb-12 md:pt-10">
        <div className="mb-6 md:hidden"><Logo /></div>
        <Outlet />
      </main>

      {/* mobile bottom bar */}
      <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-bark-soft/20 bg-cream/95 backdrop-blur md:hidden">
        <ul className="mx-auto flex max-w-md justify-around px-4 pt-2">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to} end={end}
                className={({ isActive }) => `flex min-w-[64px] flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-[11px] ${isActive ? "text-forest" : "text-bark-soft"}`}
              >
                <Icon size={22} aria-hidden="true" />{label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
