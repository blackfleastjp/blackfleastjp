import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { AuthBootstrap } from './components/AuthBootstrap';
import { ProtectedRoute } from './components/ProtectedRoute';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { CompanyListPage } from './pages/CompanyListPage';
import { CompanyWizardPage } from './pages/CompanyWizardPage';
import { CompanyDetailPage } from './pages/CompanyDetailPage';
import { UserListPage } from './pages/UserListPage';
import { UserFormPage } from './pages/UserFormPage';
import { UserDetailPage } from './pages/UserDetailPage';
import { RoleManagementPage } from './pages/RoleManagementPage';

export function App(): JSX.Element {
  return (
    <>
      <AuthBootstrap />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/companies" element={<CompanyListPage />} />
            <Route path="/companies/new" element={<CompanyWizardPage />} />
            <Route path="/companies/:id/edit" element={<CompanyWizardPage />} />
            <Route path="/companies/:id" element={<CompanyDetailPage />} />
            <Route path="/users" element={<UserListPage />} />
            <Route path="/users/new" element={<UserFormPage />} />
            <Route path="/users/:id/edit" element={<UserFormPage />} />
            <Route path="/users/:id" element={<UserDetailPage />} />
            <Route path="/roles" element={<RoleManagementPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
