import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Zap, LogOut, Settings, Users, Monitor, LayoutDashboard, BarChart3, Menu, X, Wallet, Network, BookOpen } from 'lucide-react';
import clsx from 'clsx';
import PublicDashboard from './pages/PublicDashboard';
import OwnerDashboard from './pages/OwnerDashboard';
import Accounts from './pages/Accounts';
import SettingsPage from './pages/SettingsPage';
import Login from './pages/Login';
import Install from './pages/Install';
import ProvidersDashboard from './pages/ProvidersDashboard';
import AboutProject from './pages/AboutProject';

function App() {
  const [status, setStatus] = useState({ installed: null, logged_in: false });
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const getInitialLang = () => {
    const saved = localStorage.getItem('ur_lang');
    if (saved) return saved;
    const browserLangs = navigator.languages || [navigator.language];
    for (const l of browserLangs) {
      const lower = l.toLowerCase();
      if (lower.startsWith('cs') || lower.startsWith('sk')) return 'cs';
      if (lower.startsWith('en')) return 'en';
    }
    return 'en'; // Default fallback
  };
  const [lang, setLang] = useState(getInitialLang());
  const navigate = useNavigate();
  const location = useLocation();

  const toggleLang = () => {
    const newLang = lang === 'cs' ? 'en' : 'cs';
    setLang(newLang);
    localStorage.setItem('ur_lang', newLang);
  };

  const checkStatus = () => {
    fetch('/api/status')
      .then(res => res.json())
      .then(data => {
        setStatus(data);
        setLoading(false);
        if (!data.installed && location.pathname !== '/install') {
          navigate('/install');
        }
      })
      .catch(err => {
        console.error('Failed to fetch status:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    checkStatus();
  }, [location.pathname]);

  const handleLogout = () => {
    fetch('/api/auth/logout', { method: 'POST' })
      .then(() => {
        setStatus({ ...status, logged_in: false });
        navigate('/login');
      });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-t-white border-gray-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  const NavLink = ({ to, icon: Icon, children }) => {
    const active = location.pathname === to;
    return (
      <Link
        to={to}
        onClick={() => setSidebarOpen(false)}
        className={clsx(
          "flex items-center gap-3 px-3 py-2 rounded-lg font-medium text-sm transition-all",
          active
            ? "bg-[#111111] text-white"
            : "text-[#888888] hover:bg-[#111111] hover:text-white"
        )}
      >
        {Icon && <Icon className="w-4 h-4" />}
        {children}
      </Link>
    );
  };

  const Sidebar = () => (
    <aside className={clsx(
      "fixed inset-y-0 left-0 z-40 w-64 bg-[#0a0a0a] border-r border-[#333] transform transition-transform duration-200 ease-in-out flex flex-col",
      sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
    )}>
      <div className="h-16 flex items-center px-6 border-b border-[#333] justify-between">
        <div className="flex items-center gap-2 text-lg font-semibold text-white tracking-tight">
          <div className="w-7 h-7 bg-white rounded flex items-center justify-center">
            <Zap className="w-4 h-4 text-black" fill="currentColor" />
          </div>
          UrNetwork
        </div>
        <button 
          onClick={toggleLang}
          className="px-2 py-1 rounded bg-[#111] border border-[#333] hover:border-[#555] text-xs font-semibold font-mono text-gray-300 hover:text-white transition-all cursor-pointer"
        >
          {lang.toUpperCase()}
        </button>
      </div>
      
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        <div className="px-3 mb-2 text-xs font-semibold text-[#666] uppercase tracking-wider">
          {lang === 'cs' ? 'Přehled' : 'Overview'}
        </div>
        <NavLink to="/" icon={BarChart3}>
          {lang === 'cs' ? 'Veřejný přehled' : 'Public Dashboard'}
        </NavLink>
        <NavLink to="/providers" icon={Network}>
          {lang === 'cs' ? 'Poskytovatelé' : 'Providers'}
        </NavLink>
        <NavLink to="/about" icon={BookOpen}>
          {lang === 'cs' ? 'O projektu' : 'About Project'}
        </NavLink>
        
        {status.logged_in && (
          <>
            <div className="px-3 mt-6 mb-2 text-xs font-semibold text-[#666] uppercase tracking-wider">
              {lang === 'cs' ? 'Nástroje správce' : 'Owner Tools'}
            </div>
            <NavLink to="/dashboard" icon={LayoutDashboard}>
              {lang === 'cs' ? 'Můj dashboard' : 'My Dashboard'}
            </NavLink>
            <NavLink to="/accounts" icon={Users}>
              {lang === 'cs' ? 'Účty' : 'Accounts'}
            </NavLink>
            <NavLink to="/settings" icon={Settings}>
              {lang === 'cs' ? 'Nastavení' : 'Settings'}
            </NavLink>
          </>
        )}
      </nav>

      <div className="p-4 border-t border-[#333]">
        <DiscoveryFooter />
      </div>

      {status.logged_in ? (
        <div className="p-4 border-t border-[#333]">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-3 py-2 rounded-lg font-medium text-sm text-[#888] hover:bg-[#111] hover:text-white transition-all"
          >
            <LogOut className="w-4 h-4" />
            {lang === 'cs' ? 'Odhlásit se' : 'Logout'}
          </button>
        </div>
      ) : (
        <div className="p-4 border-t border-[#333]">
          <Link
            to="/login"
            className="flex w-full items-center justify-center gap-2 px-3 py-2 bg-white text-black hover:bg-gray-200 rounded-lg font-medium text-sm transition-colors"
          >
            {lang === 'cs' ? 'Přihlásit se' : 'Login'}
          </Link>
        </div>
      )}
    </aside>
  );

  return (
    <div className="min-h-screen bg-black text-[#ededed] flex">
      {status.installed && <Sidebar />}
      
      <div className={clsx(
        "flex-1 flex flex-col min-w-0 transition-all duration-200 ease-in-out",
        status.installed ? "lg:ml-64" : ""
      )}>
        
        {status.installed && (
          <header className="h-16 border-b border-[#333] flex items-center justify-between px-4 lg:hidden sticky top-0 bg-black/80 backdrop-blur z-30">
            <div className="flex items-center gap-2 text-lg font-semibold text-white tracking-tight">
              <Zap className="w-5 h-5 text-white" fill="currentColor" />
              UrNetwork
            </div>
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-[#888]">
              {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </header>
        )}

        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <main className="flex-1 p-6 lg:p-8 max-w-[1600px] mx-auto w-full">
          <Routes>
            <Route path="/" element={<PublicDashboard lang={lang} />} />
            <Route path="/install" element={<Install onInstalled={checkStatus} lang={lang} />} />
            <Route path="/login" element={<Login onLogin={checkStatus} lang={lang} />} />
            <Route path="/providers" element={<ProvidersDashboard lang={lang} />} />
            <Route path="/about" element={<AboutProject lang={lang} />} />
            <Route path="/dashboard" element={status.logged_in ? <OwnerDashboard lang={lang} /> : <Login onLogin={checkStatus} lang={lang} />} />
            <Route path="/accounts" element={status.logged_in ? <Accounts lang={lang} /> : <Login onLogin={checkStatus} lang={lang} />} />
            <Route path="/settings" element={status.logged_in ? <SettingsPage lang={lang} /> : <Login onLogin={checkStatus} lang={lang} />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function DiscoveryFooter() {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    // Fetch directly from client side to get browser's actual IP, with fallback to proxy route
    fetch('https://api.bringyour.com/hello')
      .then(res => res.json())
      .then(setInfo)
      .catch(() => {
        fetch('/api/hello').then(res => res.json()).then(setInfo).catch(() => {});
      });
  }, []);

  if(!info || !info.client_address) return null;
  return (
    <div className="text-[10px] text-[#555] font-mono uppercase tracking-tighter">
      IP: {info.client_address}
    </div>
  );
}

export default App;
