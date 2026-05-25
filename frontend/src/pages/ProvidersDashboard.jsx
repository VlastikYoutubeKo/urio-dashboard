import { useEffect, useState, useRef } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  Network, TrendingUp, AlertTriangle, Search, Activity, Globe, Scale, Clock, ArrowUpRight, ArrowDownRight, RefreshCw, Server, MapPin, Database, Cpu
} from 'lucide-react';
import clsx from 'clsx';

export default function ProvidersDashboard({ lang = 'cs' }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const isCs = lang === 'cs';
  const t = (en, cs) => isCs ? cs : en;

  // States
  const [summary, setSummary] = useState(null);
  const [networkTotal, setNetworkTotal] = useState([]);
  const [movers, setMovers] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const [growth, setGrowth] = useState(null);
  const [regions, setRegions] = useState([]);
  const [atRisk, setAtRisk] = useState(null);
  const [globalStats, setGlobalStats] = useState(null);

  // Country search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchedCountry, setSearchedCountry] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);

  // Multi-country comparison state
  const [comparisonCodes, setComparisonCodes] = useState(['us', 'de', 'ca']);
  const [comparisonInput, setComparisonInput] = useState('');
  const [comparisonChartData, setComparisonChartData] = useState([]);
  const [compLoading, setCompLoading] = useState(false);

  // Timers
  const [refreshTimer, setRefreshTimer] = useState(300);

  const countryNamesCache = useRef({});

  // Format bytes helper
  const formatBytes = (bytes) => {
    if (!bytes) return '0 GB';
    const k = 1000;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Fetch all core data
  const fetchData = async () => {
    try {
      const [summaryRes, totalRes, moversRes, anomaliesRes, growthRes, regionsRes, atRiskRes, globalStatsRes] = await Promise.all([
        fetch('/api/provider/summary').then(r => r.json()),
        fetch('/api/provider/network_total').then(r => r.json()),
        fetch('/api/provider/movers-detailed').then(r => r.json()),
        fetch('/api/provider/anomalies?threshold=15').then(r => r.json()),
        fetch('/api/provider/growth-projection').then(r => r.json()),
        fetch('/api/provider/regions').then(r => r.json()),
        fetch('/api/provider/at-risk').then(r => r.json()),
        fetch('/api/stats/last-90').then(r => r.json()).catch(() => null)
      ]);

      setSummary(summaryRes);
      setNetworkTotal(totalRes);
      setMovers(moversRes);
      setAnomalies(anomaliesRes.anomalies || []);
      setGrowth(growthRes);
      setRegions(regionsRes);
      setAtRisk(atRiskRes);
      setGlobalStats(globalStatsRes);

      // Populate country names cache from movers
      const cache = {};
      if (moversRes.gainers) {
        moversRes.gainers.forEach(c => {
          cache[c.code.toLowerCase()] = c.name;
        });
      }
      if (moversRes.losers) {
        moversRes.losers.forEach(c => {
          cache[c.code.toLowerCase()] = c.name;
        });
      }
      countryNamesCache.current = cache;

      setLoading(false);
    } catch (e) {
      console.error('Error fetching provider metrics:', e);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Timer Countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setRefreshTimer(t => {
        if (t <= 1) {
          fetchData();
          return 300;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Comparison logic
  const handleAddComparison = (code) => {
    const lower = code.toLowerCase().trim();
    if (lower.length === 2 && !comparisonCodes.includes(lower)) {
      setComparisonCodes([...comparisonCodes, lower]);
      setComparisonInput('');
    }
  };

  const handleRemoveComparison = (code) => {
    setComparisonCodes(comparisonCodes.filter(c => c !== code));
  };

  const fetchComparisonData = async () => {
    if (comparisonCodes.length < 2) {
      setComparisonChartData([]);
      return;
    }
    setCompLoading(true);
    try {
      const allData = {};
      await Promise.all(
        comparisonCodes.map(async (code) => {
          const res = await fetch(`/api/provider/country/${code}`).then(r => r.json()).catch(() => []);
          allData[code] = res;
        })
      );

      // Group timestamps
      const allTs = [...new Set(Object.values(allData).flat().map(d => d.timestamp))].sort();
      const formatted = allTs.map(t => {
        const row = { time: new Date(t).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) };
        comparisonCodes.forEach(code => {
          const entry = (allData[code] || []).find(x => x.timestamp === t);
          row[code.toUpperCase()] = entry ? entry.count : null;
        });
        return row;
      });
      setComparisonChartData(formatted);
      setCompLoading(false);
    } catch (e) {
      console.error(e);
      setCompLoading(false);
    }
  };

  useEffect(() => {
    fetchComparisonData();
  }, [comparisonCodes]);

  // Country Search logic
  const handleSearchCountry = async (e) => {
    e.preventDefault();
    if (!searchQuery) return;
    setSearchLoading(true);
    try {
      const code = searchQuery.toLowerCase().trim();
      const res = await fetch(`/api/provider/country/${code}`).then(r => r.json());
      const stats = await fetch(`/api/provider/country-stats/${code}`).then(r => r.json()).catch(() => null);

      if (res && res.length > 0) {
        setSearchedCountry({
          code: code.toUpperCase(),
          name: countryNamesCache.current[code] || code.toUpperCase(),
          history: res.map(d => ({
            time: new Date(d.timestamp).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
            Count: d.count
          })),
          volatility: stats?.volatility || 'medium',
          churnRate: stats?.churn_rate || 0
        });
      } else {
        setSearchedCountry({ code: code.toUpperCase(), name: t('Not Found', 'Nenalezeno'), history: [] });
      }
      setSearchLoading(false);
    } catch (e) {
      console.error(e);
      setSearchLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-6 h-6 border-2 border-t-white border-gray-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // format timers
  const formatTimer = (s) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* Title / Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <Network className="w-8 h-8 text-blue-500" />
            {t("Provider Tracking", "Sledování poskytovatelů")}
          </h1>
          <p className="text-sm text-[#888] mt-1">
            {t("Real-time analytics and monitoring dashboard for BringYour/ur.io providers.", "Analytický panel pro sledování stavu sítě a poskytovatelů BringYour/ur.io v reálném čase.")}
          </p>
        </div>
        
        <div className="flex items-center gap-4 bg-[#0a0a0a] border border-[#222] px-4 py-2 rounded-xl text-xs font-mono">
          <span className="flex items-center gap-1.5 text-blue-400">
            <Clock className="w-3.5 h-3.5" />
            {t("Refreshing in:", "Aktualizace za:")}
          </span>
          <span className="text-white font-bold">{formatTimer(refreshTimer)}</span>
          <button 
            onClick={() => { setLoading(true); fetchData(); }} 
            className="text-gray-400 hover:text-white transition-colors cursor-pointer"
            title={t("Force Refresh", "Vynutit aktualizaci")}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Anomaly banner */}
      {anomalies.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-200 px-4 py-3.5 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <span className="font-bold text-red-400">{t("Anomalies Detected:", "Detekovány anomálie:")}</span>{' '}
            {anomalies.map((a) => {
              const sign = a.delta >= 0 ? '+' : '';
              return (
                <span key={a.country_code} className="inline-block bg-red-950/40 border border-red-900/40 rounded px-1.5 py-0.5 text-xs mr-2 font-mono">
                  {a.country_name} ({a.country_code.toUpperCase()}): {sign}{a.delta} ({a.pct_change >= 0 ? '+' : ''}{a.pct_change.toFixed(1)}%)
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabs list */}
      <div className="flex border-b border-[#222] gap-1 overflow-x-auto pb-px">
        {[
          { id: 'overview', name: t('Global Overview', 'Přehled sítě'), icon: Globe },
          { id: 'movers', name: t('Movers & Churn', 'Změny & Churn'), icon: TrendingUp },
          { id: 'atrisk', name: t('At Risk Alert', 'At Risk'), icon: AlertTriangle },
          { id: 'compare', name: t('Compare Countries', 'Srovnání zemí'), icon: Scale }
        ].map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                "flex items-center gap-2 px-5 py-3 border-b-2 text-sm font-semibold whitespace-nowrap transition-all cursor-pointer",
                active 
                  ? "border-blue-500 text-white" 
                  : "border-transparent text-[#888] hover:text-white"
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.name}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENTS */}
      <div className="space-y-8">
        
        {/* Tab 1: Overview */}
        {activeTab === 'overview' && (
          <>
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="card hover:border-[#444]">
                <div className="text-xs font-semibold text-[#888] uppercase mb-1 flex items-center justify-between">
                  {t("Total Providers", "Poskytovatelé celkem")}
                  <Network className="w-4 h-4 text-blue-500" />
                </div>
                <div className="text-3xl font-bold tracking-tight text-white">{(summary?.total || 0).toLocaleString()}</div>
                <div className="text-xs text-[#888] mt-2 flex items-center gap-1">
                  <span>{t("Updated at:", "Aktualizováno v:")}</span>
                  <span className="font-mono text-gray-300">{summary?.timestamp ? summary.timestamp.split(' ')[1] : ''}</span>
                </div>
              </div>

              <div className="card hover:border-[#444]">
                <div className="text-xs font-semibold text-[#888] uppercase mb-1 flex items-center justify-between">
                  {t("24h Delta Change", "Změna za 24h")}
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                </div>
                <div className={clsx(
                  "text-3xl font-bold tracking-tight",
                  (summary?.day_delta || 0) >= 0 ? "text-emerald-500" : "text-red-500"
                )}>
                  {((summary?.day_delta || 0) >= 0 ? '+' : '') + (summary?.day_delta || 0).toLocaleString()}
                </div>
                <div className="text-xs text-[#888] mt-2 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{t("Shift since yesterday", "Posun od včerejška")}</span>
                </div>
              </div>

              <div className="card hover:border-[#444]">
                <div className="text-xs font-semibold text-[#888] uppercase mb-1 flex items-center justify-between">
                  {t("1h Delta Change", "Změna za 1h")}
                  <Activity className="w-4 h-4 text-purple-500" />
                </div>
                <div className={clsx(
                  "text-3xl font-bold tracking-tight",
                  (summary?.hour_delta || 0) >= 0 ? "text-emerald-500" : "text-red-500"
                )}>
                  {((summary?.hour_delta || 0) >= 0 ? '+' : '') + (summary?.hour_delta || 0).toLocaleString()}
                </div>
                <div className="text-xs text-[#888] mt-2 flex items-center gap-1">
                  <span>{t("Hourly delta change", "Hodinový delta rozdíl")}</span>
                </div>
              </div>

              <div className="card hover:border-[#444]">
                <div className="text-xs font-semibold text-[#888] uppercase mb-1 flex items-center justify-between">
                  {t("Daily Growth Rate", "Denní Růst / 30d")}
                  <Globe className="w-4 h-4 text-orange-500" />
                </div>
                <div className={clsx(
                  "text-3xl font-bold tracking-tight",
                  (growth?.growth_rate || 0) >= 0 ? "text-emerald-500" : "text-red-500"
                )}>
                  {((growth?.growth_rate || 0) >= 0 ? '+' : '') + (growth?.growth_rate || 0).toFixed(2)}%
                </div>
                <div className="text-xs text-[#888] mt-2 flex items-center gap-1">
                  <span>{t("Forecast:", "Predikce:")}</span>
                  <span className="font-semibold text-gray-300">{(growth?.projected_30d || 0).toLocaleString()} {t("in 30 days", "za 30 dní")}</span>
                </div>
              </div>
            </div>

            {/* Global API stats cards (Last 90 days stats) */}
            {globalStats && (
              <div className="space-y-4">
                <div className="text-sm font-semibold text-[#888] uppercase tracking-wider px-1">
                  {t("⚡ Global Network Statistics (Public API)", "⚡ Globální statistiky sítě (Veřejné API)")}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
                  
                  <div className="card hover:border-[#3a3a3a] bg-[#070709] p-5">
                    <div className="text-xs text-[#888] mb-1 flex items-center justify-between">
                      {t("Global Active Nodes", "Aktivní uzly sítě")}
                      <Server className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="text-2xl font-bold text-white">{(globalStats.providers_summary || 0).toLocaleString()}</div>
                    <p className="text-[10px] text-gray-500 mt-1">{t("Active global provider nodes", "Počet aktivních uzlů globálně")}</p>
                  </div>

                  <div className="card hover:border-[#3a3a3a] bg-[#070709] p-5">
                    <div className="text-xs text-[#888] mb-1 flex items-center justify-between">
                      {t("Supported Countries", "Pokryté státy")}
                      <MapPin className="w-4 h-4 text-purple-400" />
                    </div>
                    <div className="text-2xl font-bold text-white">{(globalStats.countries_summary || 0).toLocaleString()}</div>
                    <p className="text-[10px] text-gray-500 mt-1">{t("Countries with active nodes", "Země s aktivním připojením")}</p>
                  </div>

                  <div className="card hover:border-[#3a3a3a] bg-[#070709] p-5">
                    <div className="text-xs text-[#888] mb-1 flex items-center justify-between">
                      {t("Active Cities", "Aktivní města")}
                      <Globe className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="text-2xl font-bold text-white">{(globalStats.cities_summary || 0).toLocaleString()}</div>
                    <p className="text-[10px] text-gray-500 mt-1">{t("Distinct regional cities", "Města s aktivními providery")}</p>
                  </div>

                  <div className="card hover:border-[#3a3a3a] bg-[#070709] p-5">
                    <div className="text-xs text-[#888] mb-1 flex items-center justify-between">
                      {t("Connected Devices", "Připojená zařízení")}
                      <Cpu className="w-4 h-4 text-orange-400" />
                    </div>
                    <div className="text-2xl font-bold text-white">{(globalStats.devices_summary || 0).toLocaleString()}</div>
                    <p className="text-[10px] text-gray-500 mt-1">{t("Active network devices", "Počet sdílejících zařízení")}</p>
                  </div>

                  <div className="card hover:border-[#3a3a3a] bg-[#070709] p-5">
                    <div className="text-xs text-[#888] mb-1 flex items-center justify-between">
                      {t("Bandwidth Transferred", "Přenesený provoz")}
                      <Database className="w-4 h-4 text-teal-400" />
                    </div>
                    <div className="text-2xl font-bold text-white">{formatBytes(globalStats.all_transfer_summary)}</div>
                    <p className="text-[10px] text-gray-500 mt-1">{t("Decentralized data delivered", "Celkový objem přenesených dat")}</p>
                  </div>

                </div>
              </div>
            )}

            {/* Historical Total Area Chart */}
            <div className="card">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-white">{t("Total Providers Over Time", "Celkový počet poskytovatelů v čase")}</h3>
                  <p className="text-xs text-[#888] mt-1">{t("Timeline view of total nodes alongside 24h moving average (MA).", "Zobrazení historie a 24-hodinového klouzavého průměru (MA).")}</p>
                </div>
              </div>
              <div className="h-[400px]">
                {networkTotal.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={networkTotal.map(d => ({
                      time: new Date(d.timestamp).toLocaleDateString(),
                      Providers: d.total,
                      '24h MA': d.ma
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                      <XAxis dataKey="time" stroke="#666" tick={{ fill: '#888', fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis stroke="#666" tick={{ fill: '#888', fontSize: 11 }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', borderColor: '#333', color: '#ededed', borderRadius: '8px' }} />
                      <Legend wrapperStyle={{ paddingTop: '20px' }} />
                      <Line type="monotone" dataKey="Providers" stroke="#0070f3" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                      <Line type="monotone" dataKey="24h MA" stroke="#888" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-[#888] text-center mt-20">{t("No historical data.", "Žádná historická data.")}</p>
                )}
              </div>
            </div>

            {/* Region breakdown and Top 10 countries */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              
              {/* Regions list */}
              <div className="card">
                <h3 className="text-lg font-semibold text-white mb-6">{t("Regional Network Capacity", "Regionální přehled sítě")}</h3>
                <div className="h-[300px]">
                  {regions.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={regions}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                        <XAxis dataKey="region" stroke="#666" tick={{ fill: '#888', fontSize: 11 }} tickLine={false} axisLine={false} />
                        <YAxis stroke="#666" tick={{ fill: '#888', fontSize: 11 }} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', borderColor: '#333', borderRadius: '8px' }} />
                        <Bar dataKey="total" fill="#0070f3" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-[#888] text-center mt-20">{t("No data available for regions.", "Žádná data pro regiony.")}</p>
                  )}
                </div>
              </div>

              {/* Top 10 Countries summary */}
              <div className="card">
                <h3 className="text-lg font-semibold text-white mb-6">{t("Largest Node Locations", "Největší země dle poskytovatelů")}</h3>
                <div className="space-y-4">
                  {summary?.top_10.map((c, idx) => (
                    <div key={c.country_code} className="flex items-center justify-between p-3 rounded-lg bg-black/40 border border-[#1a1a1a]">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-gray-500 w-5">#{idx + 1}</span>
                        <span className="font-semibold text-white">{c.country_name}</span>
                        <span className="text-xs uppercase text-[#666] font-mono">{c.country_code}</span>
                      </div>
                      <div className="text-sm font-mono font-bold text-blue-400">
                        {c.provider_count.toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </>
        )}

        {/* Tab 2: Movers */}
        {activeTab === 'movers' && (
          <div className="space-y-8">
            
            {/* Gainers Table */}
            <div className="card overflow-x-auto">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white">{t("Top 20 Gainers (24h Trend)", "Top 20 Rostoucí země (24h posun)")}</h3>
                <p className="text-xs text-[#888] mt-1">{t("Highlighting countries with largest provider growth across multiple intervals.", "Přehled zemí s největším přírůstkem poskytovatelů v různých časových oknech.")}</p>
              </div>
              
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#222] text-[#888] uppercase tracking-wider font-semibold">
                    <th className="py-3 px-4">{t("Country", "Země")}</th>
                    <th className="py-3 px-4">{t("Current", "Aktuální")}</th>
                    <th className="py-3 px-4">15m Δ</th>
                    <th className="py-3 px-4">1h Δ</th>
                    <th className="py-3 px-4">6h Δ</th>
                    <th className="py-3 px-4">24h Δ</th>
                    <th className="py-3 px-4">7d Δ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1a1a1a]">
                  {movers?.gainers.slice(0, 20).map((row) => (
                    <tr key={row.code} className="hover:bg-white/5 transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-white">
                        {row.name}
                        <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-blue-500/10 border border-blue-500/20 text-blue-400 font-mono uppercase">{row.code}</span>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-gray-300">{row.current.toLocaleString()}</td>
                      <td className={clsx("py-3.5 px-4 font-mono", row.deltas['15m'] >= 0 ? "text-emerald-500" : "text-red-500")}>
                        {(row.deltas['15m'] >= 0 ? '+' : '') + row.deltas['15m']}
                      </td>
                      <td className={clsx("py-3.5 px-4 font-mono", row.deltas['1h'] >= 0 ? "text-emerald-500" : "text-red-500")}>
                        {(row.deltas['1h'] >= 0 ? '+' : '') + row.deltas['1h']}
                      </td>
                      <td className={clsx("py-3.5 px-4 font-mono", row.deltas['6h'] >= 0 ? "text-emerald-500" : "text-red-500")}>
                        {(row.deltas['6h'] >= 0 ? '+' : '') + row.deltas['6h']}
                      </td>
                      <td className={clsx("py-3.5 px-4 font-mono font-bold", row.deltas['24h'] >= 0 ? "text-emerald-500" : "text-red-500")}>
                        {(row.deltas['24h'] >= 0 ? '+' : '') + row.deltas['24h']}
                      </td>
                      <td className={clsx("py-3.5 px-4 font-mono", row.deltas['7d'] >= 0 ? "text-emerald-500" : "text-red-500")}>
                        {(row.deltas['7d'] >= 0 ? '+' : '') + row.deltas['7d']}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Losers Table */}
            <div className="card overflow-x-auto">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white">{t("Top 20 Losers (24h Trend)", "Top 20 Klesající země (24h posun)")}</h3>
                <p className="text-xs text-[#888] mt-1">{t("Listing countries losing provider node counts over time.", "Země s největším úbytkem poskytovatelů v čase.")}</p>
              </div>

              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#222] text-[#888] uppercase tracking-wider font-semibold">
                    <th className="py-3 px-4">{t("Country", "Země")}</th>
                    <th className="py-3 px-4">{t("Current", "Aktuální")}</th>
                    <th className="py-3 px-4">15m Δ</th>
                    <th className="py-3 px-4">1h Δ</th>
                    <th className="py-3 px-4">6h Δ</th>
                    <th className="py-3 px-4">24h Δ</th>
                    <th className="py-3 px-4">7d Δ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1a1a1a]">
                  {movers?.losers.slice(0, 20).map((row) => (
                    <tr key={row.code} className="hover:bg-white/5 transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-white">
                        {row.name}
                        <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-red-500/10 border border-red-500/20 text-red-400 font-mono uppercase">{row.code}</span>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-gray-300">{row.current.toLocaleString()}</td>
                      <td className={clsx("py-3.5 px-4 font-mono", row.deltas['15m'] >= 0 ? "text-emerald-500" : "text-red-500")}>
                        {(row.deltas['15m'] >= 0 ? '+' : '') + row.deltas['15m']}
                      </td>
                      <td className={clsx("py-3.5 px-4 font-mono", row.deltas['1h'] >= 0 ? "text-emerald-500" : "text-red-500")}>
                        {(row.deltas['1h'] >= 0 ? '+' : '') + row.deltas['1h']}
                      </td>
                      <td className={clsx("py-3.5 px-4 font-mono", row.deltas['6h'] >= 0 ? "text-emerald-500" : "text-red-500")}>
                        {(row.deltas['6h'] >= 0 ? '+' : '') + row.deltas['6h']}
                      </td>
                      <td className={clsx("py-3.5 px-4 font-mono font-bold", row.deltas['24h'] >= 0 ? "text-emerald-500" : "text-red-500")}>
                        {(row.deltas['24h'] >= 0 ? '+' : '') + row.deltas['24h']}
                      </td>
                      <td className={clsx("py-3.5 px-4 font-mono", row.deltas['7d'] >= 0 ? "text-emerald-500" : "text-red-500")}>
                        {(row.deltas['7d'] >= 0 ? '+' : '') + row.deltas['7d']}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>
        )}

        {/* Tab 3: At Risk */}
        {activeTab === 'atrisk' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Disappeared */}
            <div className="card space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                  {t("Disappeared Nodes (0 Providers)", "Zmizelé země (0 providerů)")}
                </h3>
                <p className="text-xs text-[#888] mt-1">{t("Countries that previously had active providers and recently fell to zero.", "Země, které měly dříve aktivní providery a nyní klesly na nulu.")}</p>
              </div>

              <div className="space-y-4">
                {atRisk?.disappeared.length === 0 ? (
                  <p className="text-sm text-[#666] italic text-center py-6">{t("No countries have disappeared from the active roster.", "Žádné země nezmizely z mapy poskytovatelů.")}</p>
                ) : (
                  atRisk?.disappeared.map(c => (
                    <div key={c.country_code} className="flex justify-between items-center p-3 rounded-lg bg-red-950/20 border border-red-900/20">
                      <div>
                        <span className="font-semibold text-white block">{c.country_name}</span>
                        <span className="text-[10px] text-[#888] font-mono uppercase">{c.country_code}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-[#888] block">{t("Last Status", "Poslední stav")}</span>
                        <span className="text-sm font-bold text-red-400">{c.prev_count} {t("providers", "providerů")}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Near Zero */}
            <div className="card space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-500" />
                  {t("Critical Low capacity (1-5 & Declining)", "Země blízko nuly (1-5, klesající)")}
                </h3>
                <p className="text-xs text-[#888] mt-1">{t("Countries with critically low provider counts that are currently declining.", "Země s kriticky nízkým počtem poskytovatelů, které zaznamenaly úbytek.")}</p>
              </div>

              <div className="space-y-4">
                {atRisk?.near_zero.length === 0 ? (
                  <p className="text-sm text-[#666] italic text-center py-6">{t("No countries are currently in critical decline.", "Žádná země není v kritickém klesajícím stavu.")}</p>
                ) : (
                  atRisk?.near_zero.map(c => (
                    <div key={c.country_code} className="flex justify-between items-center p-3 rounded-lg bg-yellow-950/20 border border-yellow-900/20">
                      <div>
                        <span className="font-semibold text-white block">{c.country_name}</span>
                        <span className="text-[10px] text-[#888] font-mono uppercase">{c.country_code}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-[#888] block">{t("Status / Shift (24h)", "Stav / Posun (24h)")}</span>
                        <span className="text-sm font-bold text-yellow-400">
                          {c.provider_count} ({c.delta_24h})
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        )}

        {/* Tab 4: Compare & Search */}
        {activeTab === 'compare' && (
          <div className="space-y-8">
            
            {/* Dynamic Comparison Chart */}
            <div className="card space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Scale className="w-5 h-5 text-blue-500" />
                  {t("Compare Countries Side-by-Side", "Porovnat země vedle sebe")}
                </h3>
                <p className="text-xs text-[#888] mt-1">{t("Compare timelines for up to six selected countries.", "Porovnejte časové osy až šesti vybraných zemí.")}</p>
              </div>

              {/* Comp active list */}
              <div className="flex flex-wrap gap-2.5 items-center">
                {comparisonCodes.map(code => (
                  <span key={code} className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-white rounded-lg px-3 py-1.5 text-xs font-semibold">
                    <span className="uppercase font-mono">{code}</span>
                    <span className="text-[#888]">({countryNamesCache.current[code] || code.toUpperCase()})</span>
                    <button 
                      onClick={() => handleRemoveComparison(code)} 
                      className="text-gray-500 hover:text-red-400 font-bold ml-1 transition-colors cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                ))}

                {/* Add country input */}
                <div className="relative inline-flex items-center">
                  <input
                    type="text"
                    placeholder={t("e.g. us, de...", "Např. us, de...")}
                    value={comparisonInput}
                    onChange={(e) => setComparisonInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleAddComparison(comparisonInput);
                      }
                    }}
                    maxLength={2}
                    className="bg-black/60 border border-[#222] rounded-lg px-3 py-1.5 text-xs w-28 text-white focus:outline-none focus:border-blue-500 transition-colors uppercase font-mono"
                  />
                  <button 
                    onClick={() => handleAddComparison(comparisonInput)}
                    className="ml-1.5 px-3 py-1.5 bg-white text-black text-xs font-semibold rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
                  >
                    + {t("Add", "Přidat")}
                  </button>
                </div>
              </div>

              {/* Multi-Line Chart */}
              <div className="h-[350px]">
                {compLoading ? (
                  <div className="flex justify-center items-center h-full">
                    <div className="w-6 h-6 border-2 border-t-white border-gray-800 rounded-full animate-spin"></div>
                  </div>
                ) : comparisonChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={comparisonChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                      <XAxis dataKey="time" stroke="#666" tick={{ fill: '#888', fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis stroke="#666" tick={{ fill: '#888', fontSize: 10 }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', borderColor: '#333', borderRadius: '8px' }} />
                      <Legend wrapperStyle={{ paddingTop: '20px' }} />
                      {comparisonCodes.map((code, idx) => {
                        const colors = ['#60a5fa', '#f59e0b', '#4ade80', '#f87171', '#a78bfa', '#14b8a6'];
                        return (
                          <Line
                            key={code}
                            type="monotone"
                            dataKey={code.toUpperCase()}
                            stroke={colors[idx % colors.length]}
                            strokeWidth={2}
                            dot={false}
                          />
                        );
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-[#888] text-center mt-20">{t("Add at least 2 valid country codes to compare.", "Přidejte alespoň 2 platné kódy zemí pro srovnání.")}</p>
                )}
              </div>
            </div>

            {/* Individual Country Search */}
            <div className="card space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Search className="w-5 h-5 text-blue-500" />
                  {t("Search Specific Country Details", "Vyhledat konkrétní zemi")}
                </h3>
                <p className="text-xs text-[#888] mt-1">{t("Enter a 2-character country code to query historical stats and volatility metrics.", "Zadejte dvoumístný kód země pro zobrazení historického detailu a volatility.")}</p>
              </div>

              <form onSubmit={handleSearchCountry} className="flex gap-2 max-w-md">
                <input
                  type="text"
                  placeholder={t("Country Code (e.g. 'us', 'cz', 'de')", "Kód země (např. 'us', 'cz', 'de')")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  maxLength={15}
                  className="bg-black/60 border border-[#222] rounded-lg px-4 py-2.5 text-sm flex-1 text-white focus:outline-none focus:border-blue-500 transition-colors uppercase font-mono"
                />
                <button
                  type="submit"
                  disabled={searchLoading}
                  className="px-5 py-2.5 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2 text-sm cursor-pointer"
                >
                  {searchLoading ? t('Searching...', 'Hledám...') : t('Search', 'Hledat')}
                </button>
              </form>

              {/* Search result view */}
              {searchedCountry && (
                <div className="border-t border-[#222] pt-6 space-y-6 animate-in fade-in duration-300">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h4 className="text-xl font-bold text-white flex items-center gap-2">
                        {searchedCountry.name}
                        <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400">
                          {searchedCountry.code}
                        </span>
                      </h4>
                    </div>
                    {searchedCountry.history.length > 0 && (
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-[#888]">{t("Volatility:", "Volatilita:")}</span>
                        <span className={clsx(
                          "px-2 py-0.5 rounded text-xs font-bold font-mono uppercase border",
                          searchedCountry.volatility === 'high' ? "bg-red-500/10 border-red-500/20 text-red-500" :
                          searchedCountry.volatility === 'medium' ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-500" :
                          "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                        )}>
                          {searchedCountry.volatility}
                        </span>
                        <span className="text-xs font-mono text-[#888] italic">
                          ({t("Avg. change:", "Prům. změna:")} {searchedCountry.churnRate}/h)
                        </span>
                      </div>
                    )}
                  </div>

                  {searchedCountry.history.length > 0 ? (
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={searchedCountry.history}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                          <XAxis dataKey="time" stroke="#666" tick={{ fill: '#888', fontSize: 10 }} tickLine={false} axisLine={false} />
                          <YAxis stroke="#666" tick={{ fill: '#888', fontSize: 10 }} tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', borderColor: '#333', borderRadius: '8px' }} />
                          <Line type="monotone" dataKey="Count" stroke="#60a5fa" strokeWidth={2.5} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-sm text-red-400">{t("No historical node snapshots found for the requested country.", "Pro zadanou zemi nebyly v naší historii nalezeny žádné záznamy o poskytovatelích.")}</p>
                  )}
                </div>
              )}
            </div>

          </div>
        )}

      </div>

    </div>
  );
}
