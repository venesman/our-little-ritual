import { Navigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { Card, LoopField, Logo } from "../../components/ui";
import { AuthForm } from "./AuthForm";

export function Welcome() {
  const { session } = useAuth();
  if (session) return <Navigate to="/" replace />;
  return (
    <main className="min-h-[100dvh] md:grid md:grid-cols-2">
      {/* colour-block cover, like the front of a travel journal */}
      <section className="relative overflow-hidden bg-leaf px-6 pb-16 pt-8 text-cream md:flex md:flex-col md:justify-between md:px-12 md:py-12">
        <div className="pointer-events-none absolute -right-12 -top-14 h-52 w-52 md:-right-16 md:-top-16 md:h-[26rem] md:w-[26rem]">
          <LoopField className="h-full w-full" />
        </div>
        <svg viewBox="0 0 100 100" className="pointer-events-none absolute -bottom-14 right-8 hidden h-40 w-40 md:block" aria-hidden="true">
          <circle cx="50" cy="50" r="36" fill="none" stroke="#ECB53D" strokeWidth="10" />
        </svg>
        <div className="relative"><Logo tone="cream" /></div>
        <div className="relative mt-24 max-w-sm md:mt-0">
          <p className="font-hand text-2xl text-mustard">two people · two places</p>
          <h1 className="mt-1 text-[2.6rem] leading-[1.05] text-cream md:text-6xl">A little something, every week.</h1>
          <p className="mt-4 max-w-[19rem] text-sm leading-relaxed text-cream/85">
            A private journal for two. One small ritual each Monday, revealed only when you've both taken part.
          </p>
        </div>
      </section>

      <section className="fade-up relative -mt-8 px-5 pb-10 md:mt-0 md:flex md:items-center md:justify-center md:px-12">
        <Card className="mx-auto w-full max-w-md">
          <h2 className="mb-5 text-2xl">Open your journal</h2>
          <AuthForm />
        </Card>
      </section>
    </main>
  );
}
