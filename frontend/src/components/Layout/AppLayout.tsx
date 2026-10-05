import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { AgentStatus } from '../AgentStatus';
import { Brand } from '../Brand';
import { ChevronDownIcon } from '../icons';
import { Popover } from '../Popover';

const NAV_ITEMS = [
  { to: '/app', label: 'Dashboard', end: true },
  { to: '/app/profile', label: 'Business profile', end: false },
  { to: '/app/policies', label: 'Policies', end: false },
  { to: '/app/analyses/new', label: 'New analysis', end: false },
  { to: '/app/analyses', label: 'History', end: true },
];

/** "owner@sunrise.test" -> "OW"; "jane.doe@x" -> "JD". */
function initials(email: string | undefined): string {
  const name = (email ?? '').split('@')[0];
  const parts = name.split(/[._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
  return letters.toUpperCase() || '?';
}

/** The frame around every logged-in page: header, navigation and the page itself. */
export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-canvas print:bg-white">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-brand focus:shadow"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-white/80 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Brand to="/app" />
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden md:inline-flex">
              <AgentStatus />
            </span>
            <Popover
              triggerLabel={`Account menu for ${user?.email ?? 'your account'}`}
              triggerClassName="inline-flex items-center gap-1.5 rounded-pill p-1 pr-2 text-muted-strong hover:bg-brand-soft"
              trigger={
                <>
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-xs font-bold text-white"
                  >
                    {initials(user?.email)}
                  </span>
                  <ChevronDownIcon className="h-4 w-4" />
                </>
              }
            >
              {(close) => (
                <div>
                  <p className="px-2 text-meta text-muted">Signed in as</p>
                  <p
                    className="truncate px-2 text-sm font-semibold text-ink-heading"
                    title={user?.email}
                  >
                    {user?.email}
                  </p>
                  <div className="my-2 border-t border-line" />
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      handleLogout();
                    }}
                    className="w-full rounded-control px-2 py-2 text-left text-sm font-semibold text-ink-heading hover:bg-brand-soft hover:text-brand"
                  >
                    Log out
                  </button>
                </div>
              )}
            </Popover>
          </div>
        </div>
        <nav aria-label="Main" className="mx-auto max-w-6xl px-3 pb-2.5">
          <ul className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {NAV_ITEMS.map((item) => (
              <li key={item.to} className="shrink-0">
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    // The ring is drawn inside the pill: the scrolling list would clip one outside it.
                    `block rounded-pill px-3.5 py-1.5 text-sm font-semibold transition-colors focus-visible:-outline-offset-2 ${
                      isActive
                        ? 'bg-brand-tint text-brand'
                        : 'text-muted-strong hover:bg-canvas hover:text-ink-heading'
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
      <main
        id="main"
        className="mx-auto max-w-6xl px-4 py-8 print:max-w-none print:px-[14mm] print:py-0"
      >
        <Outlet />
      </main>
    </div>
  );
}
