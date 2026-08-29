import { useCallback, useEffect, useMemo, useState } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Network, TrendingUp, AlertTriangle, Search, Activity, Globe, Scale, Clock, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { apiJson, errorMessage } from '../lib/api';

const comparisonColors = ['#60a5fa', '#f59e0b', '#4ade80', '#f87171', '#a78bfa', '#14b8a6'];
const formatDateTime = (value) => new Date(value).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

const MoversTable = ({ rows, type, t }) => <div className="card overflow-x-auto"><div className="mb-6"><h2 className="text-lg font-semibold text-white">{type === 'gainers' ? t('Top 20 Gainers (24h Trend)', 'Top 20 rostoucích zemí (24 h)') : t('Top 20 Losers (24h Trend)', 'Top 20 klesajících zemí (24 h)')}</h2><p className="text-xs text-[#888] mt-1">{t('Provider count changes across multiple time windows.', 'Změny počtu providerů v několika časových oknech.')}</p></div><table className="w-full text-left border-collapse text-xs"><thead><tr className="border-b border-[#222] text-[#888] uppercase tracking-wider font-semibold"><th className="py-3 px-4">{t('Country', 'Země')}</th><th className="py-3 px-4">{t('Current', 'Aktuálně')}</th>{['15m', '1h', '6h', '24h', '7d'].map((window) => <th key={window} className="py-3 px-4">{window} Δ</th>)}</tr></thead><tbody className="divide-y divide-[#1a1a1a]">{rows.slice(0, 20).map((row) => <tr key={row.code} className="hover:bg-white/5 transition-colors"><td className="py-3.5 px-4 font-semibold text-white">{row.name}<span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] border font-mono uppercase ${type === 'gainers' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>{row.code}</span></td><td className="py-3.5 px-4 font-mono font-bold text-gray-300">{row.current.toLocaleString()}</td>{['15m', '1h', '6h', '24h', '7d'].map((window) => <td key={window} className={clsx('py-3.5 px-4 font-mono', row.deltas[window] >= 0 ? 'text-emerald-500' : 'text-red-500')}>{row.deltas[window] >= 0 ? '+' : ''}{row.deltas[window]}</td>)}</tr>)}{rows.length === 0 && <tr><td colSpan="7" className="py-8 text-center text-[#888]">{t('Not enough history yet.', 'Zatím není dostatek historie.')}</td></tr>}</tbody></table></div>;

export default function ProvidersDashboard({ lang = 'cs' }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);
  const [networkTotal, setNetworkTotal] = useState([]);
  const [movers, setMovers] = useState({ gainers: [], losers: [] });
  const [anomalies, setAnomalies] = useState([]);
  const [growth, setGrowth] = useState(null);
  const [regions, setRegions] = useState([]);
  const [atRisk, setAtRisk] = useState({ disappeared: [], near_zero: [] });
  const [countryNames, setCountryNames] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [searchedCountry, setSearchedCountry] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [comparisonCodes, setComparisonCodes] = useState(['us', 'de', 'ca']);
  const [comparisonInput, setComparisonInput] = useState('');
  const [comparisonChartData, setComparisonChartData] = useState([]);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [refreshTimer, setRefreshTimer] = useState(300);
  const isCs = lang === 'cs';
  const t = useCallback((en, cs) => (isCs ? cs : en), [isCs]);

  const loadData = useCallback(async ({ initial = false } = {}) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    try {
      const [nextSummary, total, detailedMovers, anomalyData, nextGrowth, nextRegions, nextAtRisk, countries] = await Promise.all([
        apiJson('/api/provider/summary'), apiJson('/api/provider/network_total'), apiJson('/api/provider/movers-detailed'), apiJson('/api/provider/anomalies?threshold=15'), apiJson('/api/provider/growth-projection'), apiJson('/api/provider/regions'), apiJson('/api/provider/at-risk'), apiJson('/api/provider/countries'),
      ]);
      setSummary(nextSummary);
      setNetworkTotal(total);
      setMovers(detailedMovers);
      setAnomalies(anomalyData.anomalies || []);
      setGrowth(nextGrowth);
      setRegions(nextRegions);
      setAtRisk(nextAtRisk);
      setCountryNames(Object.fromEntries(countries.map((country) => [country.code.toLowerCase(), country.name])));
      setError('');
    } catch (requestError) {
      setError(errorMessage(requestError, t('Could not load provider analytics.', 'Analytiku providerů se nepodařilo načíst.')));
    } finally {
      setLoading(false);
      setRefreshing(false);
      setRefreshTimer(300);
    }
  }, [t]);

  useEffect(() => {
    const timeout = window.setTimeout(() => { void loadData({ initial: true }); }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadData]);
  useEffect(() => {
    const interval = window.setInterval(() => {
      setRefreshTimer((current) => {
        if (current <= 1) {
          void loadData();
          return 300;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [loadData]);

  useEffect(() => {
    let cancelled = false;
    const loadComparison = async () => {
      if (comparisonCodes.length < 2) {
        setComparisonChartData([]);
        return;
      }
      setComparisonLoading(true);
      try {
        const entries = await Promise.all(comparisonCodes.map(async (code) => [code, await apiJson(`/api/provider/country/${code}`)]));
        if (cancelled) return;
        const dataByCode = Object.fromEntries(entries);
        const timestamps = [...new Set(Object.values(dataByCode).flat().map((entry) => entry.timestamp))].sort();
        setComparisonChartData(timestamps.map((timestamp) => {
          const row = { time: formatDateTime(timestamp) };
          comparisonCodes.forEach((code) => {
            const entry = dataByCode[code].find((item) => item.timestamp === timestamp);
            row[code.toUpperCase()] = entry ? entry.count : null;
          });
          return row;
        }));
      } catch (requestError) {
        if (!cancelled) setError(errorMessage(requestError, t('Could not compare countries.', 'Země se nepodařilo porovnat.')));
      } finally {
        if (!cancelled) setComparisonLoading(false);
      }
    };
    void loadComparison();
    return () => { cancelled = true; };
  }, [comparisonCodes, t]);

  const networkChartData = useMemo(() => networkTotal.map((entry) => ({ time: formatDateTime(entry.timestamp), Providers: entry.total, '24h MA': entry.ma })), [networkTotal]);
  const formatTimer = (seconds) => `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const addComparison = (rawCode) => {
    const code = rawCode.trim().toLowerCase();
    if (!/^[a-z]{2}$/.test(code) || comparisonCodes.includes(code) || comparisonCodes.length >= 6) return;
    setComparisonCodes((current) => [...current, code]);
    setComparisonInput('');
  };
  const removeComparison = (code) => setComparisonCodes((current) => current.filter((item) => item !== code));

  const searchCountry = async (event) => {
    event.preventDefault();
    const code = searchQuery.trim().toLowerCase();
    if (!/^[a-z]{2}$/.test(code)) {
      setSearchedCountry({ code: searchQuery.toUpperCase(), name: t('Enter a two-letter country code.', 'Zadejte dvoupísmenný kód země.'), history: [] });
      return;
    }
    setSearchLoading(true);
    try {
      const [history, stats] = await Promise.all([apiJson(`/api/provider/country/${code}`), apiJson(`/api/provider/country-stats/${code}`)]);
      setSearchedCountry({ code: code.toUpperCase(), name: countryNames[code] || code.toUpperCase(), history: history.map((entry) => ({ time: formatDateTime(entry.timestamp), Count: entry.count })), volatility: stats.volatility || 'N/A', churnRate: stats.churn_rate || 0 });
    } catch (requestError) {
      setError(errorMessage(requestError, t('Could not search this country.', 'Tuto zemi se nepodařilo vyhledat.')));
    } finally {
      setSearchLoading(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-t-white border-gray-800 rounded-full animate-spin" /></div>;

  const tabs = [
    { id: 'overview', name: t('Global Overview', 'Přehled sítě'), icon: Globe },
    { id: 'movers', name: t('Movers & Churn', 'Změny a churn'), icon: TrendingUp },
    { id: 'atrisk', name: t('At Risk Alert', 'Rizikové země'), icon: AlertTriangle },
    { id: 'compare', name: t('Compare Countries', 'Srovnání zemí'), icon: Scale },
  ];


  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4"><div><h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3"><Network className="w-8 h-8 text-blue-500" />{t('Provider Tracking', 'Sledování providerů')}</h1><p className="text-sm text-[#888] mt-1">{t('Hourly global snapshots, change analysis and outage detection.', 'Hodinové globální snapshoty, analýza změn a detekce výpadků.')}</p></div><div className="flex items-center gap-4 bg-[#0a0a0a] border border-[#222] px-4 py-2 rounded-xl text-xs font-mono"><span className="flex items-center gap-1.5 text-blue-400"><Clock className="w-3.5 h-3.5" />{t('Refreshing in:', 'Aktualizace za:')}</span><span className="text-white font-bold">{formatTimer(refreshTimer)}</span><button type="button" disabled={refreshing} onClick={() => void loadData()} className="text-gray-400 hover:text-white disabled:opacity-50" title={t('Refresh now', 'Aktualizovat nyní')}><RefreshCw className={clsx('w-3.5 h-3.5', refreshing && 'animate-spin')} /></button></div></div>
      {error && <div role="alert" className="bg-red-500/10 border border-red-500/20 text-red-200 px-4 py-3.5 rounded-xl flex items-center justify-between gap-4"><span>{error}</span><button type="button" className="btn btn-secondary text-xs" onClick={() => void loadData()}> {t('Retry', 'Zkusit znovu')} </button></div>}
      {anomalies.length > 0 && <div className="bg-red-500/10 border border-red-500/20 text-red-200 px-4 py-3.5 rounded-xl flex items-start gap-3"><AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" /><div className="text-sm"><strong className="text-red-400">{t('Anomalies detected:', 'Detekované anomálie:')}</strong>{anomalies.map((anomaly) => <span key={anomaly.country_code} className="inline-block bg-red-950/40 border border-red-900/40 rounded px-1.5 py-0.5 text-xs mr-2 font-mono">{anomaly.country_name} ({anomaly.country_code.toUpperCase()}): {anomaly.delta >= 0 ? '+' : ''}{anomaly.delta} ({anomaly.pct_change >= 0 ? '+' : ''}{anomaly.pct_change.toFixed(1)}%)</span>)}</div></div>}
      <div className="flex border-b border-[#222] gap-1 overflow-x-auto pb-px">{tabs.map((tab) => { const Icon = tab.icon; return <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={clsx('flex items-center gap-2 px-5 py-3 border-b-2 text-sm font-semibold whitespace-nowrap transition-all', activeTab === tab.id ? 'border-blue-500 text-white' : 'border-transparent text-[#888] hover:text-white')}><Icon className="w-4 h-4" />{tab.name}</button>; })}</div>

      {activeTab === 'overview' && <div className="space-y-6"><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"><div className="card"><div className="text-xs font-semibold text-[#888] uppercase mb-1 flex justify-between">{t('Total Providers', 'Providerů celkem')}<Network className="w-4 h-4 text-blue-500" /></div><div className="text-3xl font-bold text-white">{(summary?.total || 0).toLocaleString()}</div><div className="text-xs text-[#888] mt-2">{summary?.timestamp ? `${t('Updated:', 'Aktualizováno:')} ${formatDateTime(summary.timestamp)}` : t('No snapshot yet', 'Zatím bez snapshotu')}</div></div><div className="card"><div className="text-xs font-semibold text-[#888] uppercase mb-1 flex justify-between">{t('24h Change', 'Změna za 24 h')}<TrendingUp className="w-4 h-4 text-emerald-500" /></div><div className={clsx('text-3xl font-bold', (summary?.day_delta || 0) >= 0 ? 'text-emerald-500' : 'text-red-500')}>{(summary?.day_delta || 0) >= 0 ? '+' : ''}{(summary?.day_delta || 0).toLocaleString()}</div></div><div className="card"><div className="text-xs font-semibold text-[#888] uppercase mb-1 flex justify-between">{t('1h Change', 'Změna za 1 h')}<Activity className="w-4 h-4 text-purple-500" /></div><div className={clsx('text-3xl font-bold', (summary?.hour_delta || 0) >= 0 ? 'text-emerald-500' : 'text-red-500')}>{(summary?.hour_delta || 0) >= 0 ? '+' : ''}{(summary?.hour_delta || 0).toLocaleString()}</div></div><div className="card"><div className="text-xs font-semibold text-[#888] uppercase mb-1 flex justify-between">{t('Daily Growth Rate', 'Denní tempo růstu')}<Globe className="w-4 h-4 text-orange-500" /></div><div className={clsx('text-3xl font-bold', (growth?.growth_rate || 0) >= 0 ? 'text-emerald-500' : 'text-red-500')}>{(growth?.growth_rate || 0) >= 0 ? '+' : ''}{(growth?.growth_rate || 0).toFixed(2)}%</div><div className="text-xs text-[#888] mt-2">{t('30-day estimate:', 'Odhad za 30 dní:')} {(growth?.projected_30d || 0).toLocaleString()}</div></div></div>
        <div className="card"><h2 className="text-lg font-semibold text-white">{t('Total Providers Over Time', 'Celkový počet providerů v čase')}</h2><p className="text-xs text-[#888] mt-1 mb-6">{t('Raw hourly totals and a 24-hour moving average.', 'Hodinové součty a 24hodinový klouzavý průměr.')}</p><div className="h-[400px]">{networkChartData.length > 0 ? <ResponsiveContainer width="100%" height="100%"><LineChart data={networkChartData}><CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} /><XAxis dataKey="time" stroke="#666" tick={{ fill: '#888', fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis stroke="#666" tick={{ fill: '#888', fontSize: 11 }} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ backgroundColor: '#0a0a0a', borderColor: '#333', color: '#ededed', borderRadius: '8px' }} /><Legend wrapperStyle={{ paddingTop: '20px' }} /><Line type="monotone" dataKey="Providers" stroke="#0070f3" strokeWidth={2.5} dot={false} /><Line type="monotone" dataKey="24h MA" stroke="#888" strokeWidth={1.5} strokeDasharray="5 5" dot={false} /></LineChart></ResponsiveContainer> : <p className="text-[#888] text-center mt-20">{t('No historical data yet.', 'Zatím nejsou historická data.')}</p>}</div></div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6"><div className="card"><h2 className="text-lg font-semibold text-white mb-6">{t('Regional Network Capacity', 'Regionální přehled sítě')}</h2><div className="h-[300px]">{regions.length > 0 ? <ResponsiveContainer width="100%" height="100%"><BarChart data={regions}><CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} /><XAxis dataKey="region" stroke="#666" tick={{ fill: '#888', fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis stroke="#666" tick={{ fill: '#888', fontSize: 11 }} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ backgroundColor: '#0a0a0a', borderColor: '#333', borderRadius: '8px' }} /><Bar dataKey="total" fill="#0070f3" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer> : <p className="text-[#888] text-center mt-20">{t('No regional data.', 'Žádná regionální data.')}</p>}</div></div><div className="card"><h2 className="text-lg font-semibold text-white mb-6">{t('Largest Node Locations', 'Největší země podle providerů')}</h2><div className="space-y-3">{(summary?.top_10 || []).map((country, index) => <div key={country.country_code} className="flex items-center justify-between p-3 rounded-lg bg-black/40 border border-[#1a1a1a]"><div className="flex items-center gap-3"><span className="text-sm font-bold text-gray-500 w-5">#{index + 1}</span><span className="font-semibold text-white">{country.country_name}</span><span className="text-xs uppercase text-[#666] font-mono">{country.country_code}</span></div><strong className="text-sm font-mono text-blue-400">{country.provider_count.toLocaleString()}</strong></div>)}{!summary?.top_10?.length && <p className="text-[#888]">{t('No snapshot yet.', 'Zatím bez snapshotu.')}</p>}</div></div></div></div>}
      {activeTab === 'movers' && <div className="space-y-8"><MoversTable rows={movers.gainers} type="gainers" t={t} /><MoversTable rows={movers.losers} type="losers" t={t} /></div>}
      {activeTab === 'atrisk' && <div className="grid grid-cols-1 md:grid-cols-2 gap-6"><div className="card space-y-6"><div><h2 className="text-lg font-semibold text-white flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500" />{t('Disappeared Nodes', 'Zmizelé uzly')}</h2><p className="text-xs text-[#888] mt-1">{t('Countries active in the previous snapshot but absent or zero now.', 'Země aktivní v předchozím snapshotu, které nyní chybí nebo mají nulu.')}</p></div>{atRisk.disappeared.length === 0 ? <p className="text-sm text-[#666] italic text-center py-6">{t('No disappeared countries.', 'Žádná zmizelá země.')}</p> : atRisk.disappeared.map((country) => <div key={country.country_code} className="flex justify-between p-3 rounded-lg bg-red-950/20 border border-red-900/20"><span><strong className="block">{country.country_name}</strong><small className="text-[#888] font-mono uppercase">{country.country_code}</small></span><span className="text-red-400 font-bold self-center">{country.prev_count} {t('previously', 'předtím')}</span></div>)}</div><div className="card space-y-6"><div><h2 className="text-lg font-semibold text-white flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-yellow-500" />{t('Critical Low Capacity', 'Kriticky nízká kapacita')}</h2><p className="text-xs text-[#888] mt-1">{t('Countries with 1–5 providers and a negative daily change.', 'Země s 1–5 providery a zápornou denní změnou.')}</p></div>{atRisk.near_zero.length === 0 ? <p className="text-sm text-[#666] italic text-center py-6">{t('No countries are in critical decline.', 'Žádná země není v kritickém poklesu.')}</p> : atRisk.near_zero.map((country) => <div key={country.country_code} className="flex justify-between p-3 rounded-lg bg-yellow-950/20 border border-yellow-900/20"><span><strong className="block">{country.country_name}</strong><small className="text-[#888] font-mono uppercase">{country.country_code}</small></span><span className="text-yellow-400 font-bold self-center">{country.provider_count} ({country.delta_24h})</span></div>)}</div></div>}
      {activeTab === 'compare' && <div className="space-y-8"><div className="card space-y-6"><div><h2 className="text-lg font-semibold text-white flex items-center gap-2"><Scale className="w-5 h-5 text-blue-500" />{t('Compare Countries Side-by-Side', 'Porovnání zemí vedle sebe')}</h2><p className="text-xs text-[#888] mt-1">{t('Compare up to six valid ISO country codes.', 'Porovnejte až šest platných ISO kódů zemí.')}</p></div><div className="flex flex-wrap gap-2.5 items-center">{comparisonCodes.map((code) => <span key={code} className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-white rounded-lg px-3 py-1.5 text-xs font-semibold"><span className="uppercase font-mono">{code}</span><span className="text-[#888]">({countryNames[code] || code.toUpperCase()})</span><button type="button" onClick={() => removeComparison(code)} className="text-gray-500 hover:text-red-400 font-bold ml-1">×</button></span>)}<div className="inline-flex items-center"><input list="provider-country-codes" type="text" placeholder={t('e.g. us', 'např. cz')} value={comparisonInput} onChange={(event) => setComparisonInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addComparison(comparisonInput); } }} maxLength="2" className="bg-black/60 border border-[#222] rounded-lg px-3 py-1.5 text-xs w-28 text-white focus:outline-none focus:border-blue-500 uppercase font-mono" /><datalist id="provider-country-codes">{Object.entries(countryNames).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</datalist><button type="button" disabled={comparisonCodes.length >= 6} onClick={() => addComparison(comparisonInput)} className="ml-1.5 px-3 py-1.5 bg-white text-black text-xs font-semibold rounded-lg hover:bg-gray-200 disabled:opacity-50">+ {t('Add', 'Přidat')}</button></div></div><div className="h-[350px]">{comparisonLoading ? <div className="flex justify-center items-center h-full"><div className="w-6 h-6 border-2 border-t-white border-gray-800 rounded-full animate-spin" /></div> : comparisonChartData.length > 0 ? <ResponsiveContainer width="100%" height="100%"><LineChart data={comparisonChartData}><CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} /><XAxis dataKey="time" stroke="#666" tick={{ fill: '#888', fontSize: 10 }} tickLine={false} axisLine={false} /><YAxis stroke="#666" tick={{ fill: '#888', fontSize: 10 }} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ backgroundColor: '#0a0a0a', borderColor: '#333', borderRadius: '8px' }} /><Legend wrapperStyle={{ paddingTop: '20px' }} />{comparisonCodes.map((code, index) => <Line key={code} type="monotone" dataKey={code.toUpperCase()} stroke={comparisonColors[index]} strokeWidth={2} dot={false} />)}</LineChart></ResponsiveContainer> : <p className="text-[#888] text-center mt-20">{t('Add at least two countries with history to compare.', 'Přidejte alespoň dvě země s historií.')}</p>}</div></div><div className="card space-y-6"><div><h2 className="text-lg font-semibold text-white flex items-center gap-2"><Search className="w-5 h-5 text-blue-500" />{t('Search Country Details', 'Vyhledat detail země')}</h2><p className="text-xs text-[#888] mt-1">{t('Use a two-letter ISO country code.', 'Použijte dvoupísmenný ISO kód země.')}</p></div><form onSubmit={searchCountry} className="flex gap-2 max-w-md"><input list="provider-country-codes" type="text" placeholder={t("Country code, e.g. 'cz'", "Kód země, např. 'cz'")} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} maxLength="2" className="bg-black/60 border border-[#222] rounded-lg px-4 py-2.5 text-sm flex-1 text-white focus:outline-none focus:border-blue-500 uppercase font-mono" /><button type="submit" disabled={searchLoading} className="px-5 py-2.5 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 disabled:opacity-60">{searchLoading ? t('Searching…', 'Hledám…') : t('Search', 'Hledat')}</button></form>{searchedCountry && <div className="border-t border-[#222] pt-6 space-y-6"><div className="flex flex-wrap items-center justify-between gap-4"><h3 className="text-xl font-bold text-white">{searchedCountry.name} <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400">{searchedCountry.code}</span></h3>{searchedCountry.history.length > 0 && <div className="text-xs text-[#888]">{t('Volatility:', 'Volatilita:')} <strong className="text-white uppercase">{searchedCountry.volatility}</strong> · {t('Avg. change per snapshot:', 'Průměrná změna za snapshot:')} {searchedCountry.churnRate}</div>}</div>{searchedCountry.history.length > 0 ? <div className="h-[300px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={searchedCountry.history}><CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} /><XAxis dataKey="time" stroke="#666" tick={{ fill: '#888', fontSize: 10 }} tickLine={false} axisLine={false} /><YAxis stroke="#666" tick={{ fill: '#888', fontSize: 10 }} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ backgroundColor: '#0a0a0a', borderColor: '#333', borderRadius: '8px' }} /><Line type="monotone" dataKey="Count" stroke="#60a5fa" strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer></div> : <p className="text-sm text-red-400">{t('No historical snapshots found for this country.', 'Pro tuto zemi nebyly nalezeny historické snapshoty.')}</p>}</div>}</div></div>}
    </div>
  );
}
