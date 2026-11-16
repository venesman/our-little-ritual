import { Navigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { Logo } from "../../components/ui";
import { AuthForm } from "./AuthForm";

/** A pinned polaroid with tape (decoration only — no photos are shown before you sign in). */
function Pinned({ className, tint, caption, tape }: { className: string; tint: string; caption: string; tape: string }) {
  return (
    <figure aria-hidden="true" className={`polaroid absolute ${className}`}>
      <span className={`tape ${tape}`} />
      <div className={`h-full rounded-[4px] ${tint}`} style={{ backgroundImage: "repeating-linear-gradient(135deg, rgba(31,61,43,0.06) 0 9px, transparent 9px 18px)" }} />
      <figcaption className="absolute inset-x-0 bottom-2.5 text-center font-hand text-2xl font-bold leading-none md:bottom-3.5 md:text-[1.7rem]">{caption}</figcaption>
    </figure>
  );
}

/**
 * Sign in — "Scrapbook desk": lined journal paper with taped polaroids,
 * a "private" stamp and a postmark; the form is a white note card held on with tape.
 */
export function Welcome() {
  const { session } = useAuth();
  if (session) return <Navigate to="/" replace />;
  return (
    <main className="relative min-h-[100dvh] overflow-hidden md:grid md:grid-cols-[1.1fr_1fr]">
      {/* the scrapbook page */}
      <section className="relative h-[300px] px-6 pt-7 md:h-auto md:px-14 md:pt-12">
        <Logo />
        <Pinned className="left-6 top-24 h-[176px] w-[150px] -rotate-[6deg] pb-11 md:left-[8%] md:top-[22%] md:h-[320px] md:w-[280px] md:pb-14" tint="bg-raspberry" caption="us ♡" tape="" />
        <Pinned className="left-[150px] top-[132px] h-[140px] w-[124px] rotate-[6deg] pb-9 md:left-[40%] md:top-[40%] md:h-[236px] md:w-[210px] md:pb-11" tint="bg-mint" caption="next time" tape="tape-tangerine" />
        <div aria-hidden="true" className="absolute right-8 top-24 h-[92px] w-[78px] rotate-[9deg] p-1.5 shadow-print md:left-[44%] md:right-auto md:top-[16%] md:h-[116px] md:w-[96px] md:p-2"
          style={{ background: "radial-gradient(circle at 5px 5px, #FBF3EA 4px, transparent 4.5px) -5px -5px / 10px 10px, #E0614F" }}>
          <div className="flex h-full flex-col items-center justify-center gap-1 border-[1.5px] border-leaf bg-peach">
            <svg viewBox="0 0 24 24" className="h-6 w-6 md:h-8 md:w-8"><path d="M 12 20 C 4 14 2 9.5 5 6.5 C 7.5 4 11 5 12 8 C 13 5 16.5 4 19 6.5 C 22 9.5 20 14 12 20 Z" fill="#E0614F" stroke="#1F3D2B" strokeWidth="1.4" /></svg>
            <span className="text-[8px] font-bold tracking-[0.14em] md:text-[9px]">PRIVATE</span>
          </div>
        </div>
        <svg aria-hidden="true" viewBox="0 0 110 110" className="absolute right-3 top-[205px] h-20 w-20 -rotate-[14deg] md:left-[7%] md:right-auto md:top-auto md:bottom-[12%] md:h-32 md:w-32">
          <circle cx="55" cy="55" r="48" fill="none" stroke="#2F5A9A" strokeWidth="2.4" />
          <circle cx="55" cy="55" r="33" fill="none" stroke="#2F5A9A" strokeWidth="1.4" />
          <path id="welcome-pm" d="M 15 55 A 40 40 0 0 1 95 55" fill="none" />
          <text fontFamily="DM Sans Variable, sans-serif" fontSize="9" fontWeight="700" fill="#2F5A9A" letterSpacing="2.2"><textPath href="#welcome-pm" startOffset="50%" textAnchor="middle">KUCHING · SANTIAGO</textPath></text>
          <text x="55" y="60" textAnchor="middle" fontFamily="DM Serif Display, serif" fontStyle="italic" fontSize="15" fill="#2F5A9A">with love</text>
          <path d="M 22 82 q 6 -5 12 0 t 12 0 t 12 0 t 12 0 t 12 0 t 12 0" fill="none" stroke="#2F5A9A" strokeWidth="1.5" />
        </svg>
        <div className="absolute bottom-[9%] left-[30%] hidden max-w-xs md:block">
          <p className="font-hand text-3xl font-bold leading-none text-raspberry-deep">two people · two places</p>
          <p className="mt-1.5 font-display text-3xl leading-tight">one little ritual, every week.</p>
        </div>
      </section>

      {/* the note card */}
      <section className="fade-up relative px-5 pb-12 md:flex md:items-center md:justify-center md:px-12 md:pb-0">
        <div className="relative mx-auto w-full max-w-md rotate-[1.2deg] rounded-[26px] bg-white px-7 pb-8 pt-10 shadow-photo md:px-10">
          <span aria-hidden="true" className="tape !h-7 !w-28 !-ml-14 !-top-3.5" />
          <p className="font-hand text-2xl font-bold leading-none text-raspberry-deep">welcome back</p>
          <h1 className="mb-6 mt-1.5 text-[2.6rem] italic leading-none">Hello again, you.</h1>
          <AuthForm />
        </div>
        <p className="mt-6 text-center text-sm text-muted md:hidden">A private journal for two. One small ritual each Monday, revealed only when you've both taken part.</p>
      </section>
    </main>
  );
}
