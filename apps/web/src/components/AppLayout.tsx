import { Outlet } from 'react-router-dom';
import { Footer } from './Footer';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export function AppLayout(): JSX.Element {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-column">
        <Header />
        <main className="page-content">
          <Outlet />
        </main>
        <Footer />
      </div>
    </div>
  );
}
