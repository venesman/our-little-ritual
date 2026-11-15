import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { SpaceProvider } from "./hooks/useSpace";
import { supabaseConfigured } from "./lib/supabase";
import { RequireAuth, RequireNoSpace, RequireSpace } from "./routes/guards";
import { AppShell } from "./components/AppShell";
import { OuterPage } from "./components/ui";
import { Welcome } from "./screens/auth/Welcome";
import { ForgotPassword, UpdatePassword } from "./screens/auth/PasswordScreens";
import { CreateSpace } from "./screens/pair/CreateSpace";
import { Join } from "./screens/pair/Join";
import { Home } from "./screens/Home";
import { Settings } from "./screens/Settings";
import { Rituals } from "./screens/Rituals";
import { RitualDetail } from "./screens/RitualDetail";
import { Visits } from "./screens/Visits";
import { Play } from "./screens/Play";
import { ApartMission } from "./screens/Apart";
import { Us } from "./screens/Us";
import { MomentEditor } from "./screens/Scrapbook";
import { ExportStory } from "./screens/Export";
import { CheckIn } from "./screens/CheckIn";
import { LetterComposer, LetterView, Mailbox } from "./screens/Mailbox";

export default function App() {
  if (!supabaseConfigured) return <SetupNotice />;
  return (
    <AuthProvider>
      <SpaceProvider>
        <Routes>
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/forgot" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<UpdatePassword />} />
          <Route path="/join" element={<Join />} />
          <Route path="/start" element={<RequireAuth><RequireNoSpace><CreateSpace /></RequireNoSpace></RequireAuth>} />
          <Route element={<RequireAuth><RequireSpace><AppShell /></RequireSpace></RequireAuth>}>
            <Route index element={<Home />} />
            <Route path="rituals" element={<Rituals />} />
            <Route path="rituals/:weeklyId" element={<RitualDetail />} />
            <Route path="visits" element={<Visits />} />
            <Route path="play" element={<Play />} />
            <Route path="play/apart/:missionId" element={<ApartMission />} />
            <Route path="us" element={<Us />} />
            <Route path="us/moment/new" element={<MomentEditor />} />
            <Route path="us/moment/:id" element={<MomentEditor />} />
            <Route path="us/export" element={<ExportStory />} />
            <Route path="story" element={<Navigate to="/us?tab=story" replace />} />
            <Route path="checkin" element={<CheckIn />} />
            <Route path="mailbox" element={<Mailbox />} />
            <Route path="mailbox/new" element={<LetterComposer />} />
            <Route path="mailbox/:id/edit" element={<LetterComposer />} />
            <Route path="mailbox/:id" element={<LetterView />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </SpaceProvider>
    </AuthProvider>
  );
}

function SetupNotice() {
  return (
    <OuterPage>
      <h1 className="text-3xl">Almost there</h1>
      <p className="mt-3 text-muted">
        This build has no Supabase connection. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to
        your environment (locally in <code>.env.local</code>, or in Vercel → Settings → Environment Variables) and redeploy.
      </p>
    </OuterPage>
  );
}

function NotFound() {
  return <Navigate to="/" replace />;
}
