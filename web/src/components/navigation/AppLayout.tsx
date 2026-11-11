import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, CalendarDays, ClipboardPaste, CloudOff, Compass, FolderOpen, FolderPlus, Home, LineChart, LogOut, Plus, ScanLine, Search, Settings, Sparkles, Upload, User as UserIcon, WifiOff } from 'lucide-react';
import { Logo } from '../ui/Logo';
import { useAuth } from '../../hooks/useAuth';
import { useOnline } from '../../hooks/useUtils';
import { useT, type TKey } from '../../lib/i18n';
import { api } from '../../lib/api';
import { useQuickActions } from '../../features/documents/QuickActions';

const primary: { to: string; key: TKey; icon: ReactNode; end?: boolean }[] = [
  { to: '/', key: 'nav.overview', icon: <Home size={18} />, end: true },
  { to: '/courses', key: 'nav.courses', icon: <FolderOpen size={18} /> },
  { to: '/revision', key: 'nav.revision', icon: <Sparkles size={18} /> },
  { to: '/coach', key: 'nav.coach', icon: <Compass size={18} /> },
  { to: '/calendar', key: 'nav.calendar', icon: <CalendarDays size={18} /> },
  { to: '/progress', key: 'nav.progress', icon: <LineChart size={18} /> },
  { to: '/offline', key: 'nav.offline', icon: <CloudOff size={18} /> },
  { to: '/settings', key: 'nav.settings', icon: <Settings size={18} /> },
];

const mobile: { to: string; key: TKey; icon: ReactNode; end?: boolean }[] = [
  { to: '/', key: 'nav.overview', icon: <Home size={20} />, end: true },
  { to: '/courses', key: 'nav.coursesShort', icon: <FolderOpen size={20} /> },
  { to: '/revision', key: 'nav.revision', icon: <Sparkles size={20} /> },
  { to: '/coach', key: 'nav.coach', icon: <Compass size={20} /> },
  { to: '/settings', key: 'nav.profile', icon: <UserIcon size={20} /> },
];

function SearchBox({ className = '' }: { className?: string }) {
  const t = useT();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  return (
    <form
      role="search"
      className={`relative ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim().length >= 2) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
      <input value={q} onChange={(e) => setQ(e.target.value)} type="search" aria-label="Recherche globale" placeholder={t('action.search')} className="field h-10 pl-9 text-sm" />
    </form>
  );
}

function NotificationBell() {
  const { data } = useQuery({ queryKey: ['notifications', 'count'], queryFn: () => api.page('/notifications?unread=true&pageSize=1'), refetchInterval: 60_000 });
  const unread = data?.meta.unread ?? 0;
  return (
    <Link to="/notifications" aria-label={`Notifications${unread ? ` (${unread} non lues)` : ''}`} className="relative inline-flex h-10 w-10 items-center justify-center rounded-md text-muted hover:bg-charcoal/5 hover:text-charcoal">
      <Bell size={19} />
      {unread > 0 && <span className="absolute right-1.5 top-1.5 min-w-[18px] rounded-full bg-crimson px-1 text-center text-[10.5px] font-semibold leading-[18px] text-white">{unread > 9 ? '9+' : unread}</span>}
    </Link>
  );
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const t = useT();
  const online = useOnline();
  const location = useLocation();
  const quick = useQuickActions();
  const [sheet, setSheet] = useState(false);
  const hideFab = /\/(quiz|attempts|study)/.test(location.pathname);

  return (
    <div className="min-h-screen md:flex">
      <a href="#contenu" className="sr-only z-50 rounded bg-white px-3 py-2 focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Aller au contenu
      </a>
      {/* Barre latérale (bureau) */}
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-line bg-white md:flex" aria-label="Navigation principale">
        <div className="px-5 pb-4 pt-5">
          <Link to="/" aria-label="Accueil">
            <Logo />
          </Link>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {primary.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `relative flex items-center gap-3 rounded-md px-3 py-2 text-[14px] font-medium transition-colors ${isActive ? 'bg-crimson-soft text-crimson-dark before:absolute before:left-0 before:top-1.5 before:h-[calc(100%-12px)] before:w-[3px] before:rounded-full before:bg-crimson' : 'text-charcoal/80 hover:bg-ivory hover:text-charcoal'}`
              }
            >
              {item.icon}
              {t(item.key)}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-2 border-t border-line p-3">
          <button type="button" onClick={() => quick.openNewCourse()} className="flex w-full items-center gap-3 rounded-md bg-crimson px-3 py-2 text-sm font-medium text-white hover:bg-crimson-dark">
            <FolderPlus size={17} /> {t('action.newCourse')}
          </button>
          <div className="flex items-center justify-between gap-2 px-1 pt-1">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user?.name}</p>
              <p className="truncate text-xs text-muted">{user?.email}</p>
            </div>
            <button type="button" onClick={logout} aria-label={t('action.logout')} title={t('action.logout')} className="rounded-md p-2 text-muted hover:bg-charcoal/5 hover:text-charcoal">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* En-tête */}
        <header className="sticky top-0 z-20 border-b border-line bg-ivory/95 backdrop-blur supports-[backdrop-filter]:bg-ivory/80">
          <div className="mx-auto flex h-14 max-w-content items-center gap-3 px-4 md:h-16 md:px-8">
            <Link to="/" className="md:hidden" aria-label="Accueil">
              <Logo size={28} />
            </Link>
            <SearchBox className="hidden flex-1 md:block md:max-w-md" />
            <div className="ml-auto flex items-center gap-1">
              <Link to="/search" className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted hover:bg-charcoal/5 md:hidden" aria-label="Rechercher">
                <Search size={19} />
              </Link>
              <NotificationBell />
            </div>
          </div>
          {!online && (
            <div className="flex items-center justify-center gap-2 bg-charcoal px-4 py-1.5 text-[13px] text-white" role="status">
              <WifiOff size={14} /> Hors connexion — les fonctions en ligne (IA, import, synchronisation) sont indisponibles.
            </div>
          )}
        </header>

        <main id="contenu" className="flex-1">
          <Outlet />
        </main>
      </div>

      {/* Action rapide (mobile) */}
      {!hideFab && (
        <button
          type="button"
          onClick={() => setSheet(true)}
          aria-label="Actions rapides : dossier, PDF, scan ou texte"
          className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-crimson text-white shadow-pop md:hidden"
        >
          <Plus size={22} />
        </button>
      )}
      {sheet && (
        <div className="fixed inset-0 z-40 bg-charcoal/40 md:hidden" onClick={() => setSheet(false)}>
          <div className="absolute inset-x-0 bottom-0 rounded-t-xl bg-white p-4 pb-[calc(16px+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Actions rapides">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
            {[
              { label: t('action.newCourse'), icon: <FolderPlus size={18} />, run: () => quick.openNewCourse() },
              { label: t('action.import'), icon: <Upload size={18} />, run: () => quick.openImport() },
              { label: t('action.scan'), icon: <ScanLine size={18} />, run: () => quick.openScan() },
              { label: t('action.paste'), icon: <ClipboardPaste size={18} />, run: () => quick.openPaste() },
            ].map((a) => (
              <button
                key={a.label}
                type="button"
                className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-[15px] hover:bg-ivory"
                onClick={() => {
                  setSheet(false);
                  a.run();
                }}
              >
                <span className="text-crimson">{a.icon}</span>
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Navigation inférieure (mobile) */}
      <nav aria-label="Navigation principale" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        <ul className="grid grid-cols-5">
          {mobile.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.end} className={({ isActive }) => `flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${isActive ? 'text-crimson' : 'text-muted'}`}>
                {item.icon}
                <span className="max-w-full truncate px-1">{t(item.key)}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
