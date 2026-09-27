import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/query-client.js";
import { PermissionRoute, ProtectedLayout, CompanySettingsPage } from "./components/layout.js";
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
const CompanyListPage = lazy(() =>
  import("./pages/company-pages.js").then((module) => ({ default: module.CompanyListPage })),
);
const CompanyFormPage = lazy(() =>
  import("./pages/company-pages.js").then((module) => ({ default: module.CompanyFormPage })),
);
const CompanyDetailPage = lazy(() =>
  import("./pages/company-pages.js").then((module) => ({ default: module.CompanyDetailPage })),
);
const CompanyFeaturesPage = lazy(() =>
  import("./pages/company-pages.js").then((module) => ({ default: module.CompanyFeaturesPage })),
);
const UserListPage = lazy(() =>
  import("./pages/user-role-pages.js").then((module) => ({ default: module.UserListPage })),
);
const UserFormPage = lazy(() =>
  import("./pages/user-role-pages.js").then((module) => ({ default: module.UserFormPage })),
);
const UserDetailPage = lazy(() =>
  import("./pages/user-role-pages.js").then((module) => ({ default: module.UserDetailPage })),
);
const RoleListPage = lazy(() =>
  import("./pages/user-role-pages.js").then((module) => ({ default: module.RoleListPage })),
);
const RoleDetailPage = lazy(() =>
  import("./pages/user-role-pages.js").then((module) => ({ default: module.RoleDetailPage })),
);
const ForgotPasswordPage = lazy(() =>
  import("./pages/auth-recovery-pages.js").then((module) => ({
    default: module.ForgotPasswordPage,
  })),
);
const ResetPasswordPage = lazy(() =>
  import("./pages/auth-recovery-pages.js").then((module) => ({
    default: module.ResetPasswordPage,
  })),
);
const ChangePasswordPage = lazy(() =>
  import("./pages/auth-recovery-pages.js").then((module) => ({
    default: module.ChangePasswordPage,
  })),
);
const SessionExpiredPage = lazy(() =>
  import("./pages/auth-recovery-pages.js").then((module) => ({
    default: module.SessionExpiredPage,
  })),
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
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/session-expired" element={<SessionExpiredPage />} />
            <Route path="/app" element={<ProtectedLayout />}>
              <Route
                index
                element={
                  <PermissionRoute permission="company.read">
                    <DashboardPage />
                  </PermissionRoute>
                }
              />
              <Route
                path="companies"
                element={
                  <PermissionRoute permission="company.read">
                    <CompanyListPage />
                  </PermissionRoute>
                }
              />
              <Route
                path="companies/new"
                element={
                  <PermissionRoute permission="company.create">
                    <CompanyFormPage />
                  </PermissionRoute>
                }
              />
              <Route
                path="companies/:id/features"
                element={
                  <PermissionRoute permission="company.read">
                    <CompanyFeaturesPage />
                  </PermissionRoute>
                }
              />
              <Route
                path="companies/:id"
                element={
                  <PermissionRoute permission="company.read">
                    <CompanyDetailPage />
                  </PermissionRoute>
                }
              />
              <Route
                path="companies/:id/edit"
                element={
                  <PermissionRoute permission="company.update">
                    <CompanyFormPage />
                  </PermissionRoute>
                }
              />
              <Route
                path="people"
                element={
                  <PermissionRoute permission="users.read">
                    <PeoplePage />
                  </PermissionRoute>
                }
              />
              <Route
                path="users"
                element={
                  <PermissionRoute permission="users.read">
                    <UserListPage />
                  </PermissionRoute>
                }
              />
              <Route
                path="users/new"
                element={
                  <PermissionRoute permission="users.create">
                    <UserFormPage />
                  </PermissionRoute>
                }
              />
              <Route
                path="users/:id"
                element={
                  <PermissionRoute permission="users.read">
                    <UserDetailPage />
                  </PermissionRoute>
                }
              />
              <Route
                path="users/:id/edit"
                element={
                  <PermissionRoute permission="users.update">
                    <UserFormPage />
                  </PermissionRoute>
                }
              />
              <Route
                path="roles"
                element={
                  <PermissionRoute permission="roles.read">
                    <RoleListPage />
                  </PermissionRoute>
                }
              />
              <Route
                path="roles/:id"
                element={
                  <PermissionRoute permission="roles.read">
                    <RoleDetailPage />
                  </PermissionRoute>
                }
              />
              <Route
                path="activity"
                element={
                  <PermissionRoute permission="audit.read">
                    <ActivityPage />
                  </PermissionRoute>
                }
              />
              <Route path="settings/password" element={<ChangePasswordPage />} />
              <Route
                path="settings"
                element={
                  <PermissionRoute permission="company.read">
                    <CompanySettingsPage />
                  </PermissionRoute>
                }
              />
              <Route path="*" element={<MissingRoute />} />
            </Route>
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
