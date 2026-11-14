import { Navigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { OuterPage, Card } from "../../components/ui";
import { AuthForm } from "./AuthForm";

export function Welcome() {
  const { session } = useAuth();
  if (session) return <Navigate to="/" replace />;
  return (
    <OuterPage>
      <h1 className="text-4xl leading-tight">A little something,<br />every week.</h1>
      <p className="mt-3 text-bark">A private journal for two. One small ritual each Monday, revealed only when you've both taken part.</p>
      <Card className="mt-8"><AuthForm /></Card>
    </OuterPage>
  );
}
