import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { ForYouProvider, getSeen, markSeen, useForYou } from "../hooks/useForYou";
import { useAuth } from "../hooks/useAuth";
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
// On phones the Mailbox sits in the middle as a postage stamp.
const MOBILE_NAV = [NAV[0], NAV[1], NAV[4], NAV[2], NAV[3]] as const;
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

/** Which sections have something new waiting for you — shown as a quiet dot (no numbers). */
function useDots(): Record<string, boolean> {
  const { data } = useForYou();
  const { session } = useAuth();
  const { pathname } = useLocation();
  const uid = session?.user.id ?? "";
  const [, bump] = useState(0);
  useEffect(() => {
    if (pathname.startsWith("/us") && uid) { markSeen(uid, "us"); bump((n) => n + 1); }
  }, [pathname, uid, data?.latest_memory_at]);
  if (!data) return {};
  const latest = data.latest_memory_at ? Date.parse(data.latest_memory_at) : 0;
  return {
    "/rituals": !!data.ritual_partner_shared || (data.older_rituals_waiting ?? 0) > 0,
    "/play": (data.apart_my_turn ?? 0) > 0,
    "/us": !!uid && latest > getSeen(uid, "us") && getSeen(uid, "us") > 0,
    "/mailbox": (data.letters_unread ?? 0) > 0,
  };
}

const Dot = () => <span className="absolute -right-1.5 -top-1.5 h-3 w-3 rounded-full border-2 border-white bg-tangerine" aria-hidden="true" />;

export function AppShell() {
  return <ForYouProvider><Shell /></ForYouProvider>;
}

function Shell() {
  const online = useOnline();
  const dots = useDots();
  return (
    <div className="min-h-[100dvh] md:flex">
      {/* desktop sidebar — a journal page with pink tabs */}
      <aside className="sticky top-0 hidden h-[100dvh] w-64 shrink-0 flex-col justify-between bg-paper/80 px-5 py-8 shadow-card md:flex">
        <div className="space-y-10">
          <Logo />
          <nav className="flex flex-col gap-1.5" aria-label="Main">
            {DESKTOP_NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to} to={to} end={end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-semibold transition ${isActive ? "bg-mustard text-leaf" : "text-leaf hover:bg-white"}`}
              >
                <span className="relative"><Icon size={18} aria-hidden="true" />{dots[to] && <Dot />}</span>{label}
                {dots[to] && <span className="sr-only"> (something new)</span>}
              </NavLink>
            ))}
          </nav>
        </div>
        <p className="font-hand text-2xl leading-snug text-raspberry-deep">two people,<br />two places,<br />one little world.</p>
      </aside>

      <main className="mx-auto w-full max-w-2xl px-5 pb-32 pt-6 md:pb-12 md:pt-10">
        <div className="no-print mb-6 flex items-center justify-between md:hidden">
          <Logo />
          <Link to="/settings" aria-label="Settings" className="grid h-11 w-11 place-items-center rounded-full text-leaf hover:bg-paper"><Settings size={21} aria-hidden="true" /></Link>
        </div>
        {!online && (
          <p role="status" className="no-print mb-4 flex items-center gap-2 rounded-full border-[1.5px] border-leaf/20 bg-mustard-soft px-4 py-2 text-sm text-mustard-deep">
            <CloudOff size={15} aria-hidden="true" /> You're offline — this is what was last loaded. It'll refresh when you're back online.
          </p>
        )}
        <Outlet />
      </main>

      {/* mobile bottom bar — a floating pill; the Mailbox is a postage stamp in the middle */}
      <nav aria-label="Main" className="no-print pb-safe fixed inset-x-3 bottom-3 z-20 md:hidden">
        <ul className="mx-auto flex h-16 max-w-md items-center justify-between rounded-full bg-white px-2 shadow-photo">
          {MOBILE_NAV.map(({ to, label, icon: Icon, end }) => (
            <li key={to} className={to === "/mailbox" ? "-mt-9" : ""}>
              <NavLink
                to={to} end={end} aria-label={label}
                className={({ isActive }) => to === "/mailbox"
                  ? `relative block h-[68px] w-[60px] p-1.5 shadow-print transition ${isActive ? "-rotate-[8deg] scale-105" : "-rotate-[4deg]"}`
                  : `relative flex h-12 items-center justify-center gap-2 rounded-full text-sm font-semibold text-leaf transition ${isActive ? "bg-mustard px-4" : "w-12"}`}
                style={to === "/mailbox" ? { background: "radial-gradient(circle at 4px 4px, #FBF3EA 3px, transparent 3.5px) -4px -4px / 8px 8px, #E0614F" } : undefined}
              >
                {({ isActive }) => to === "/mailbox" ? (
                  <span className="flex h-full items-center justify-center border-[1.5px] border-leaf">
                    <Icon size={22} aria-hidden="true" />{dots[to] && <Dot />}
                    {dots[to] && <span className="sr-only"> (something new)</span>}
                  </span>
                ) : (
                  <>
                    <span className="relative"><Icon size={21} aria-hidden="true" />{dots[to] && <Dot />}</span>
                    {isActive && <span aria-hidden="true">{label}</span>}
                    {dots[to] && <span className="sr-only"> (something new)</span>}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
