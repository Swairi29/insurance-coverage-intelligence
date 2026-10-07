import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { AgentStatus } from '../AgentStatus';
import { Brand } from '../Brand';
import { Popover } from '../Popover';

const NAV_ITEMS = [
  { to: '/app', label: 'Overview', icon: 'overview', end: true },
  { to: '/app/businesses', label: 'Businesses', icon: 'businesses', end: false },
  { to: '/app/policies', label: 'Policies', icon: 'policies', end: false },
  // `end`: only the list itself, not New Analysis or a result.
  { to: '/app/analyses', label: 'History', icon: 'history', end: true },
];

function initials(email: string | undefined): string {
  const name = (email ?? '').split('@')[0];
  const parts = name.split(/[._-]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase() || '?';
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const signOut = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="dark-ui min-h-screen bg-[#050b18] text-slate-100 lg:flex print:block print:min-h-0 print:bg-white print:text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3 focus:text-blue-700 print:hidden"
      >
        Skip to content
      </a>
      <aside
        aria-label="Sidebar"
        className="hidden w-[250px] shrink-0 flex-col border-r border-white/10 bg-[#071225] px-4 py-6 text-white lg:fixed lg:inset-y-0 lg:flex print:hidden"
      >
        <Brand to="/app" tone="dark" />
        <p className="mb-3 mt-10 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
          Workspace
        </p>
        <SidebarLinks label="Main" onNavigate={() => setMobileOpen(false)} />
        <div className="mt-auto">
          <Link
            to="/app/settings"
            className="mb-4 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
          >
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-blue-200">
              <NavigationIcon name="settings" />
            </span>
            Settings
          </Link>
          <Link
            to="/app/analyses/new"
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-3 text-sm font-bold text-white shadow-[0_8px_30px_rgba(37,99,235,.28)] hover:brightness-110 focus-visible:outline-white"
          >
            <span aria-hidden="true" className="text-lg leading-none">
              +
            </span>{' '}
            New Analysis
          </Link>
          <div className="mt-5 border-t border-white/10 pt-4">
            <Popover
              triggerLabel={`Account menu for ${user?.email ?? 'your account'}`}
              triggerClassName="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-white/5"
              trigger={
                <>
                  <span
                    aria-hidden="true"
                    className="grid h-9 w-9 place-items-center rounded-full bg-blue-500/20 text-xs font-bold text-blue-200"
                  >
                    {initials(user?.email)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold">{user?.email ?? 'Account'}</span>
                    <span className="block text-[10px] text-slate-400">InsureIntel workspace</span>
                  </span>
                  <span aria-hidden="true" className="text-slate-400">
                    ···
                  </span>
                </>
              }
            >
              {(close) => (
                <div className="min-w-48">
                  <p className="px-2 text-xs text-muted">Signed in as</p>
                  <p className="truncate px-2 py-1 text-sm font-semibold">{user?.email}</p>
                  <div className="my-2 border-t border-line" />
                  <button
                    className="w-full rounded px-2 py-2 text-left text-sm hover:bg-canvas"
                    onClick={() => {
                      close();
                      signOut();
                    }}
                  >
                    Log out
                  </button>
                </div>
              )}
            </Popover>
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden print:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        aria-label="Navigation menu"
        className={`fixed inset-y-0 left-0 z-50 flex w-[270px] flex-col border-r border-white/10 bg-[#071225] px-4 py-6 text-white transition-[transform,visibility] lg:hidden print:hidden ${mobileOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'}`}
      >
        <div className="flex items-center justify-between">
          <Brand to="/app" tone="dark" />
          <button
            aria-label="Close navigation"
            className="rounded-lg px-3 py-2 text-slate-300 hover:bg-white/10"
            onClick={() => setMobileOpen(false)}
          >
            ×
          </button>
        </div>
        <p className="mb-3 mt-10 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
          Workspace
        </p>
        <SidebarLinks label="Main (menu)" onNavigate={() => setMobileOpen(false)} />
        <Link
          onClick={() => setMobileOpen(false)}
          to="/app/settings"
          className="mt-auto rounded-xl px-3 py-3 text-sm text-slate-300 hover:bg-white/5"
        >
          Settings
        </Link>
        <Link
          onClick={() => setMobileOpen(false)}
          to="/app/analyses/new"
          className="mt-3 rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-bold"
        >
          + New Analysis
        </Link>
      </aside>

      <div className="min-w-0 flex-1 lg:ml-[250px] print:ml-0">
        <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-white/10 bg-[#071225]/90 px-4 text-white backdrop-blur sm:px-7 lg:px-10 print:hidden">
          <div className="flex items-center gap-3">
            <button
              aria-label="Open navigation"
              className="grid h-10 w-10 place-items-center rounded-xl border border-white/15 text-slate-200 lg:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <span aria-hidden="true">☰</span>
            </button>
            <span className="hidden text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 sm:block">
              Insurance intelligence workspace
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Live: polls /health/agents and lists any agent that is down. */}
            <AgentStatus tone="dark" />
            <Link
              to="/app/settings"
              aria-label="Account settings"
              className="grid h-10 w-10 place-items-center rounded-full bg-[#102449] text-xs font-bold text-white"
            >
              {initials(user?.email)}
            </Link>
          </div>
        </header>
        <main
          id="main"
          className="mx-auto min-h-[calc(100vh-72px)] max-w-[1500px] px-4 py-6 sm:px-7 sm:py-8 lg:px-10 lg:py-10 print:min-h-0 print:max-w-none print:px-[14mm] print:py-0"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SidebarLinks({ label, onNavigate }: { label: string; onNavigate: () => void }) {
  return (
    <nav aria-label={label} className="space-y-1">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? 'bg-blue-500/15 text-white ring-1 ring-inset ring-blue-400/20' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`
          }
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-slate-400 transition-colors group-[.active]:bg-blue-400/10 group-[.active]:text-cyan-200">
            <NavigationIcon name={item.icon} />
          </span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

function NavigationIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    overview: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    businesses: 'M3 21V7l9-4 9 4v14 M9 21v-6h6v6 M8 10h.01 M16 10h.01',
    policies: 'M6 3h9l4 4v14H6z M14 3v5h5 M9 13h7 M9 17h7',
    analyses: 'M4 19V5 M4 19h17 M8 15l4-4 3 2 5-7',
    history: 'M3 12a9 9 0 1 0 2.6-6.4L3 8 M3 3v5h5 M12 7v5l3 2',
    settings:
      'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.6 2.8-.2-.1a1.7 1.7 0 0 0-1.8.5l-.1.2h-3.2l-.1-.2a1.7 1.7 0 0 0-1.8-.5l-.2.1-1.6-2.8.1-.1a1.7 1.7 0 0 0 .3-1.9l-.1-.2-2.1-1.1v-3.2l2.1-1.1.1-.2a1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.6-2.8.2.1a1.7 1.7 0 0 0 1.8-.5l.1-.2h3.2l.1.2a1.7 1.7 0 0 0 1.8.5l.2-.1 1.6 2.8-.1.1a1.7 1.7 0 0 0-.3 1.9l.1.2 2.1 1.1v3.2L19.4 15z',
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[17px] w-[17px]"
    >
      <path d={paths[name] ?? paths.overview} />
    </svg>
  );
}
