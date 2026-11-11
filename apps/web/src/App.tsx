import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { MeT } from "@orynt/sdk";
import { api, SessionCtx, setCsrf } from "./api";
import { Layout } from "./components/Layout";
import { Toaster, Skeleton } from "./components/ui";
import { MfaPrompt } from "./components/MfaPrompt";
import { AuthPage } from "./pages/Auth";
import { Overview } from "./pages/Overview";
import { Payouts } from "./pages/Payouts";
import { NewPayout } from "./pages/NewPayout";
import { PayoutDetail } from "./pages/PayoutDetail";
import { Approvals } from "./pages/Approvals";
import { Incidents } from "./pages/Incidents";
import { IncidentDetail } from "./pages/IncidentDetail";
import { Connections } from "./pages/Connections";
import { Team } from "./pages/Team";
import { Activity } from "./pages/Activity";
import { Developers } from "./pages/Developers";
import { Settings } from "./pages/Settings";
import { VerifyReceipt } from "./pages/VerifyReceipt";
import { Guide } from "./pages/Guide";
import { Billing } from "./pages/Billing";
import { Start } from "./pages/Start";
import { Batches, Reports, Schedules, Support } from "./pages/Work";
import { AcceptInvite, Forgot, ResetPassword, SupportPublic, VerifyEmail } from "./pages/Links";

export function App() {
  const [me, setMeState] = useState<MeT | null>(null);
  const [loading, setLoading] = useState(true);
  const setMe = useCallback((m: MeT | null) => { setCsrf(m?.csrf_token); setMeState(m); }, []);
  const refresh = useCallback(async () => { try { const m = await api.me(); setMe(m); return m; } catch { setMe(null); return null; } finally { setLoading(false); } }, [setMe]);
  useEffect(() => { void refresh(); }, [refresh]);
  const loc = useLocation();
  const publicPath = loc.pathname.startsWith("/verify") || loc.pathname.startsWith("/guide");

  return (
    <SessionCtx.Provider value={{ me, loading, refresh, setMe }}>
      <Toaster />
      <MfaPrompt />
      {loading ? <div className="boot"><Skeleton rows={4} /></div> : (
        <Routes>
          <Route path="/login" element={me ? <Navigate to="/" replace /> : <AuthPage mode="login" />} />
          <Route path="/signup" element={me ? <Navigate to="/" replace /> : <AuthPage mode="signup" />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/forgot" element={<Forgot />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/accept-invite" element={<AcceptInvite />} />
          <Route path="/contact-support" element={<SupportPublic />} />
          <Route path="/verify" element={publicPath && !me ? <div className="public-wrap"><VerifyReceipt /></div> : <Layout><VerifyReceipt /></Layout>} />
          <Route path="/guide" element={!me ? <div className="public-wrap"><Guide /></div> : <Layout><Guide /></Layout>} />
          {me ? (
            <Route element={<Layout />}>
              <Route index element={<Overview />} />
              <Route path="start" element={<Start />} />
              <Route path="payouts" element={<Payouts />} />
              <Route path="payouts/new" element={<NewPayout />} />
              <Route path="payouts/:id" element={<PayoutDetail />} />
              <Route path="approvals" element={<Approvals />} />
              <Route path="incidents" element={<Incidents />} />
              <Route path="incidents/:id" element={<IncidentDetail />} />
              <Route path="connections" element={<Connections />} />
              <Route path="team" element={<Team />} />
              <Route path="activity" element={<Activity />} />
              <Route path="developers" element={<Developers />} />
              <Route path="settings" element={<Settings />} />
              <Route path="billing" element={<Billing />} />
              <Route path="reports" element={<Reports />} />
              <Route path="batches" element={<Batches />} />
              <Route path="schedules" element={<Schedules />} />
              <Route path="support" element={<Support />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          ) : <Route path="*" element={<Navigate to="/login" replace state={{ from: loc.pathname }} />} />}
        </Routes>
      )}
    </SessionCtx.Provider>
  );
}
