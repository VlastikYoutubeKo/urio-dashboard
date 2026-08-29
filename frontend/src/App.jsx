import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { Zap, LogOut, Settings, Users, BarChart3, Menu, X, Network, BookOpen } from 'lucide-react';
import clsx from 'clsx';
import { apiJson, errorMessage } from './lib/api';

const PublicDashboard = lazy(() => import('./pages/PublicDashboard'));
const OwnerDashboard = lazy(() => import('./pages/OwnerDashboard'));
const Accounts = lazy(() => import('./pages/Accounts'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const Login = lazy(() => import('./pages/Login'));
const Install = lazy(() => import('./pages/Install'));
const ProvidersDashboard = lazy(() => import('./pages/ProvidersDashboard'));
const AboutProject = lazy(() => import('./pages/AboutProject'));

function LoadingScreen() {
  return (
    <div className="flex justify-center py-20" role="status" aria-label="Loading">
      <div className="w-6 h-6 border-2 border-t-white border-gray-800 rounded-full animate-spin" />
    </div>
  );
}

function NavigationLink({ to, icon: Icon, children, active, onNavigate }) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className={clsx(
        'flex items-center gap-3 px-3 py-2 rounded-lg font-medium text-sm transition-all',
        active ? 'bg-[#111111] text-white' : 'text-[#888888] hover:bg-[#111111] hover:text-white',
      )}
    >
      {Icon && <Icon className="w-4 h-4" aria-hidden="true" />}
      {children}
    </Link>
  );
}

function DiscoveryFooter({ lang }) {
  const isCs = lang === 'cs';
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const revealIp = async () => {
    setLoading(true);
    setError(false);
    try {
      // This intentionally runs only after an explicit click: an IP lookup
      // tells BringYour the visitor's IP address.
      const response = await fetch('https://api.bringyour.com/hello');
      if (!response.ok) throw new Error('IP lookup failed');
      setInfo(await response.json());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  if (info?.client_address) {
    return <div className="text-[10px] text-[#555] font-mono uppercase tracking-tighter">IP: {info.client_address}</div>;
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={revealIp}
        disabled={loading}
        className="text-left text-[10px] text-[#666] hover:text-[#aaa] underline underline-offset-2 disabled:opacity-60"
      >
        {loading
          ? (isCs ? 'Zjišťuji veřejnou IP…' : 'Checking public IP…')
          : (isCs ? 'Zjistit veřejnou IP' : 'Show public IP')}
      </button>
      {!error && <p className="text-[9px] leading-tight text-[#444]">{isCs ? 'Odešle dotaz na api.bringyour.com.' : 'Sends a request to api.bringyour.com.'}</p>}
      {error && <p className="text-[9px] leading-tight text-red-400">{isCs ? 'IP se nepodařilo zjistit.' : 'Could not look up IP.'}</p>}
    </div>
  );
}

function Sidebar({ lang, onToggleLang, status, sidebarOpen, setSidebarOpen, pathname, onLogout }) {
  const isCs = lang === 'cs';
  const closeSidebar = () => setSidebarOpen(false);
  const label = (en, cs) => (isCs ? cs : en);

  return (
    <aside
      className={clsx(
        'fixed inset-y-0 left-0 z-40 w-64 bg-[#0a0a0a] border-r border-[#333] transform transition-transform duration-200 ease-in-out flex flex-col',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      )}
    >
      <div className="h-16 flex items-center px-6 border-b border-[#333] justify-between">
        <div className="flex items-center gap-2 text-lg font-semibold text-white tracking-tight">
          <div className="w-7 h-7 bg-white rounded flex items-center justify-center">
            <Zap className="w-4 h-4 text-black" fill="currentColor" aria-hidden="true" />
          </div>
          URnetwork
        </div>
        <button
          type="button"
          onClick={onToggleLang}
          aria-label={label('Switch language', 'Přepnout jazyk')}
          className="px-2 py-1 rounded bg-[#111] border border-[#333] hover:border-[#555] text-xs font-semibold font-mono text-gray-300 hover:text-white transition-all cursor-pointer"
        >
          {lang.toUpperCase()}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1" aria-label={label('Main navigation', 'Hlavní navigace')}>
        <div className="px-3 mb-2 text-xs font-semibold text-[#666] uppercase tracking-wider">{label('Overview', 'Přehled')}</div>
        <NavigationLink to="/" icon={BarChart3} active={pathname === '/'} onNavigate={closeSidebar}>{label('Public Dashboard', 'Veřejný přehled')}</NavigationLink>
        <NavigationLink to="/providers" icon={Network} active={pathname === '/providers'} onNavigate={closeSidebar}>{label('Providers', 'Poskytovatelé')}</NavigationLink>
        <NavigationLink to="/about" icon={BookOpen} active={pathname === '/about'} onNavigate={closeSidebar}>{label('About Project', 'O projektu')}</NavigationLink>

        {status.logged_in && (
          <>
            <div className="px-3 mt-6 mb-2 text-xs font-semibold text-[#666] uppercase tracking-wider">{label('Owner tools', 'Nástroje správce')}</div>
            <NavigationLink to="/dashboard" icon={BarChart3} active={pathname === '/dashboard'} onNavigate={closeSidebar}>{label('My Dashboard', 'Můj dashboard')}</NavigationLink>
            <NavigationLink to="/accounts" icon={Users} active={pathname === '/accounts'} onNavigate={closeSidebar}>{label('Accounts', 'Účty')}</NavigationLink>
            <NavigationLink to="/settings" icon={Settings} active={pathname === '/settings'} onNavigate={closeSidebar}>{label('Settings', 'Nastavení')}</NavigationLink>
          </>
        )}
      </nav>

      <div className="p-4 border-t border-[#333]"><DiscoveryFooter lang={lang} /></div>
      {status.logged_in ? (
        <div className="p-4 border-t border-[#333]">
          <button type="button" onClick={onLogout} className="flex w-full items-center gap-3 px-3 py-2 rounded-lg font-medium text-sm text-[#888] hover:bg-[#111] hover:text-white transition-all">
            <LogOut className="w-4 h-4" aria-hidden="true" />
            {label('Logout', 'Odhlásit se')}
          </button>
        </div>
      ) : (
        <div className="p-4 border-t border-[#333]">
          <Link to="/login" onClick={closeSidebar} className="flex w-full items-center justify-center gap-2 px-3 py-2 bg-white text-black hover:bg-gray-200 rounded-lg font-medium text-sm transition-colors">
            {label('Login', 'Přihlásit se')}
          </Link>
        </div>
      )}
    </aside>
  );
}

export default function App() {
  const [status, setStatus] = useState({ installed: null, logged_in: false });
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem('ur_lang');
    if (saved === 'cs' || saved === 'en') return saved;
    const browserLangs = navigator.languages || [navigator.language];
    return browserLangs.some((language) => /^(cs|sk)/i.test(language)) ? 'cs' : 'en';
  });
  const navigate = useNavigate();
  const location = useLocation();

  const checkStatus = useCallback(async () => {
    try {
      const nextStatus = await apiJson('/api/status');
      setStatus(nextStatus);
      setConnectionError('');
      if (!nextStatus.installed && location.pathname !== '/install') navigate('/install', { replace: true });
    } catch (error) {
      setConnectionError(errorMessage(error, 'Could not reach the dashboard API.'));
    } finally {
      setLoading(false);
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    // Schedule the initial request after paint rather than synchronously
    // cascading state work from the effect itself.
    const timeout = window.setTimeout(() => { void checkStatus(); }, 0);
    return () => window.clearTimeout(timeout);
  }, [checkStatus]);

  useEffect(() => {
    const handleUnauthorized = () => {
      setStatus((current) => ({ ...current, logged_in: false }));
      if (location.pathname !== '/login') navigate('/login');
    };
    window.addEventListener('urio:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('urio:unauthorized', handleUnauthorized);
  }, [location.pathname, navigate]);

  const toggleLang = () => {
    setLang((current) => {
      const next = current === 'cs' ? 'en' : 'cs';
      localStorage.setItem('ur_lang', next);
      return next;
    });
  };

  const handleLogout = async () => {
    try {
      await apiJson('/api/auth/logout', { method: 'POST' });
    } catch {
      // The local UI should still become logged out if a session has expired.
    }
    setStatus((current) => ({ ...current, logged_in: false }));
    navigate('/login');
  };

  if (loading) return <div className="min-h-screen bg-black"><LoadingScreen /></div>;

  if (connectionError) {
    return (
      <div className="min-h-screen bg-black text-[#ededed] flex items-center justify-center p-6">
        <div className="card max-w-md text-center space-y-4">
          <h1 className="text-xl font-bold">{lang === 'cs' ? 'Dashboard není dostupný' : 'Dashboard is unavailable'}</h1>
          <p className="text-sm text-[#888]">{connectionError}</p>
          <button type="button" className="btn btn-primary mx-auto" onClick={() => { setLoading(true); void checkStatus(); }}>
            {lang === 'cs' ? 'Zkusit znovu' : 'Try again'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-[#ededed] flex">
      {status.installed && <Sidebar lang={lang} onToggleLang={toggleLang} status={status} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} pathname={location.pathname} onLogout={handleLogout} />}
      <div className={clsx('flex-1 flex flex-col min-w-0 transition-all duration-200 ease-in-out', status.installed ? 'lg:ml-64' : '')}>
        {status.installed && (
          <header className="h-16 border-b border-[#333] flex items-center justify-between px-4 lg:hidden sticky top-0 bg-black/80 backdrop-blur z-30">
            <div className="flex items-center gap-2 text-lg font-semibold text-white tracking-tight"><Zap className="w-5 h-5 text-white" fill="currentColor" aria-hidden="true" />URnetwork</div>
            <button type="button" onClick={() => setSidebarOpen((open) => !open)} aria-label={lang === 'cs' ? 'Otevřít navigaci' : 'Open navigation'} className="p-2 text-[#888]">
              {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </header>
        )}
        {sidebarOpen && <button type="button" aria-label="Close navigation" className="fixed inset-0 bg-black/50 z-30 lg:hidden cursor-default" onClick={() => setSidebarOpen(false)} />}
        <main className="flex-1 p-6 lg:p-8 max-w-[1600px] mx-auto w-full">
          <Suspense fallback={<LoadingScreen />}>
            <Routes>
              <Route path="/" element={<PublicDashboard lang={lang} />} />
              <Route path="/install" element={<Install onInstalled={checkStatus} lang={lang} />} />
              <Route path="/login" element={<Login onLogin={checkStatus} lang={lang} />} />
              <Route path="/providers" element={<ProvidersDashboard lang={lang} />} />
              <Route path="/about" element={<AboutProject lang={lang} />} />
              <Route path="/dashboard" element={status.logged_in ? <OwnerDashboard lang={lang} /> : <Login onLogin={checkStatus} lang={lang} />} />
              <Route path="/accounts" element={status.logged_in ? <Accounts lang={lang} /> : <Login onLogin={checkStatus} lang={lang} />} />
              <Route path="/settings" element={status.logged_in ? <SettingsPage lang={lang} /> : <Login onLogin={checkStatus} lang={lang} />} />
              <Route path="*" element={<PublicDashboard lang={lang} />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}
