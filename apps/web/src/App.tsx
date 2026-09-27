import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/query-client.js";
import { ProtectedLayout, CompanySettingsPage } from "./components/layout.js";
import { LoadingState } from "./components/feedback.js";

const LoginPage = lazy(() =>
  import("./pages/login-page.js").then((module) => ({ default: module.LoginPage })),
);
const DashboardPage = lazy(() =>
  import("./pages/dashboard-page.js").then((module) => ({ default: module.DashboardPage })),
);
const PeoplePage = lazy(() =>
  import("./pages/people-page.js").then((module) => ({ default: module.PeoplePage })),
);
const ActivityPage = lazy(() =>
  import("./pages/activity-page.js").then((module) => ({ default: module.ActivityPage })),
);

function MissingRoute() {
  return (
    <section className="page-section">
      <div className="not-found">
        <span>404</span>
        <h1>That page isn't here.</h1>
        <p>The address may have changed, or the page is outside your workspace.</p>
        <a className="button button-primary" href="/app">
          Return to overview
        </a>
      </div>
    </section>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<LoadingState />}>
          <Routes>
            <Route path="/" element={<Navigate to="/app" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/app" element={<ProtectedLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="people" element={<PeoplePage />} />
              <Route path="activity" element={<ActivityPage />} />
              <Route path="settings" element={<CompanySettingsPage />} />
              <Route path="*" element={<MissingRoute />} />
            </Route>
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
