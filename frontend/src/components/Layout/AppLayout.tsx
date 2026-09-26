import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { AgentStatus } from '../AgentStatus';
import { Brand } from '../Brand';
import { Button } from '../ui/Button';

const NAV_ITEMS = [
  { to: '/app', label: 'Dashboard', end: true },
  { to: '/app/profile', label: 'Business profile', end: false },
  { to: '/app/policies', label: 'Policies', end: false },
  { to: '/app/analyses/new', label: 'New analysis', end: false },
  { to: '/app/analyses', label: 'History', end: true },
];

/** The frame around every logged-in page: header, navigation and the page itself. */
export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-brand-soft/40">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-brand focus:shadow"
      >
        Skip to content
      </a>
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Brand to="/app" />
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden md:inline-flex">
              <AgentStatus />
            </span>
            <span className="hidden truncate text-sm text-muted sm:inline" title={user?.email}>
              {user?.email}
            </span>
            <Button variant="secondary" onClick={handleLogout} className="px-3 py-1.5">
              Log out
            </Button>
          </div>
        </div>
        <nav aria-label="Main" className="mx-auto max-w-6xl px-2">
          <ul className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {NAV_ITEMS.map((item) => (
              <li key={item.to} className="shrink-0">
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `block border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${
                      isActive
                        ? 'border-brand text-brand'
                        : 'border-transparent text-muted-strong hover:text-ink-heading'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
