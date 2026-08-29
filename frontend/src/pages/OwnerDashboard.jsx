import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, apiJson, errorMessage } from '../lib/api';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

function OverviewTab({ lang = 'cs' }) {
  const isCs = lang === 'cs';
  const t = useCallback((en, cs) => isCs ? cs : en, [isCs]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState('combined');

  useEffect(() => {
    let cancelled = false;
    const loadOverview = async () => {
      try {
        const result = await apiJson('/api/dashboard/overview');
        if (cancelled) return;
        setData(result);
        setError('');
      } catch (requestError) {
        if (!cancelled) setError(errorMessage(requestError, t('Could not load dashboard data.', 'Data dashboardu se nepodařilo načíst.')));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadOverview();
    return () => { cancelled = true; };
  }, [t]);

  if (loading) return <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-t-white border-gray-800 rounded-full animate-spin"></div></div>;
  if (!data) return <div role="alert" className="text-center py-10 text-red-500">{error || t("Failed to load data.", "Nepodařilo se načíst data.")}</div>;

  const combinedData = data.combined_chart.labels.map((label, idx) => ({
    time: label,
    Paid: data.combined_chart.paid_gb[idx],
    Unpaid: data.combined_chart.unpaid_gb[idx],
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card hover:border-[#666]"><div className="text-xs font-semibold text-[#888] uppercase mb-1">{t("Total Paid Data", "Celkem vyplacená data")}</div><div className="text-3xl font-bold tracking-tight">{data.combined.paid_gb.toFixed(3)} GB</div></div>
        <div className="card hover:border-[#666]"><div className="text-xs font-semibold text-[#888] uppercase mb-1">{t("Total Unpaid Data", "Celkem nevyplacená data")}</div><div className="text-3xl font-bold tracking-tight">{data.combined.unpaid_gb.toFixed(3)} GB</div></div>
        <div className="card hover:border-[#666]"><div className="text-xs font-semibold text-[#888] uppercase mb-1">{t("Total Earnings", "Celkové výdělky")}</div><div className="text-3xl font-bold tracking-tight">${data.total_earnings.toFixed(2)}</div></div>
        <div className="card hover:border-[#666]"><div className="text-xs font-semibold text-[#888] uppercase mb-1">{t("Active Accounts", "Aktivní účty")}</div><div className="text-3xl font-bold tracking-tight">{data.active_accounts}</div></div>
      </div>
      <div className="card">
        <div className="flex gap-3 mb-6">
          <button className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${viewMode === 'combined' ? 'bg-[#ededed] text-black' : 'bg-[#111] text-[#888] hover:text-white border border-[#333]'}`} onClick={() => setViewMode('combined')}>{t("Combined", "Sloučené")}</button>
          <button className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${viewMode === 'individual' ? 'bg-[#ededed] text-black' : 'bg-[#111] text-[#888] hover:text-white border border-[#333]'}`} onClick={() => setViewMode('individual')}>{t("Individual", "Jednotlivé")}</button>
        </div>
        {viewMode === 'combined' && (
          <div className="h-[400px]">
            {combinedData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={combinedData}>
                  <defs>
                    <linearGradient id="colorPaid" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorUnpaid" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                  <XAxis dataKey="time" stroke="#888" tick={{fill: '#888', fontSize: 12}} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888" tick={{fill: '#888', fontSize: 12}} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{backgroundColor: '#0a0a0a', borderColor: '#333', color: '#ededed', borderRadius: '8px'}} itemStyle={{color: '#ededed'}} />
                  <Legend wrapperStyle={{paddingTop: '20px'}} />
                  <Line type="monotone" dataKey="Paid" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{r: 6}} fill="url(#colorPaid)" />
                  <Line type="monotone" dataKey="Unpaid" stroke="#f59e0b" strokeWidth={2} dot={false} activeDot={{r: 6}} fill="url(#colorUnpaid)" />
                </LineChart>
              </ResponsiveContainer>
            ) : <p className="text-center mt-20 text-[#888]">{t("Not enough data to display.", "Nedostatek dat pro zobrazení.")}</p>}
          </div>
        )}
        {viewMode === 'individual' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {Object.entries(data.account_charts).map(([acc, info], idx) => {
              const cData = info.labels.map((label, i) => ({ time: label, [acc]: info.data[i] }));
              const colors = ['#0070f3', '#7928ca', '#f5a623', '#10b981', '#f00', '#f5a623'];
              const color = colors[idx % colors.length];
              return (
                <div key={acc} className="mt-4 border border-[#333] rounded-lg p-4 bg-[#111]">
                  <h3 className="text-sm font-semibold mb-4 text-[#888]"><span className="text-[#ededed]">{acc}</span> {t("Data", "Data")}</h3>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={cData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                        <XAxis dataKey="time" stroke="#888" tick={{fill: '#888', fontSize: 10}} tickLine={false} axisLine={false} />
                        <YAxis stroke="#888" tick={{fill: '#888', fontSize: 10}} tickLine={false} axisLine={false} width={40} />
                        <Tooltip contentStyle={{backgroundColor: '#0a0a0a', borderColor: '#333', borderRadius: '8px'}} itemStyle={{color: '#ededed'}} />
                        <Line type="monotone" dataKey={acc} stroke={color} strokeWidth={2} dot={false} activeDot={{r: 4}} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function AccountInfoTab({ lang = 'cs' }) {
  const isCs = lang === 'cs';
  const t = useCallback((en, cs) => isCs ? cs : en, [isCs]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedAcc, setSelectedAcc] = useState('all');
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      setLoading(true);
      apiJson(`/api/dashboard/account?account_id=${encodeURIComponent(selectedAcc)}`)
        .then((nextData) => {
          if (cancelled) return;
          setData(nextData);
          setError('');
        })
        .catch((requestError) => {
          if (cancelled) return;
          setData(null);
          setError(errorMessage(requestError, t('Could not load account data.', 'Data účtu se nepodařilo načíst.')));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [selectedAcc, refreshKey, t]);

  const refreshAccount = () => setRefreshKey((current) => current + 1);

  const toggleVisibility = async () => {
    if (!data?.account_details || !selectedAcc || selectedAcc === 'all') return;
    const isPublic = data.account_details.ranking?.leaderboard_public;
    try {
      await apiJson('/api/dashboard/network/visibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: selectedAcc, is_public: !isPublic }),
      });
      setData((current) => ({
        ...current,
        account_details: {
          ...current.account_details,
          ranking: { ...current.account_details.ranking, leaderboard_public: !isPublic },
        },
      }));
    } catch (requestError) {
      setError(errorMessage(requestError, t('Could not update ranking visibility.', 'Viditelnost žebříčku se nepodařilo upravit.')));
    }
  };

  const handleSetReferral = async () => {
    const code = window.prompt(t("Enter the referral code of the network that referred you:", "Zadejte doporučující kód sítě, která vás doporučila:"));
    if (!code?.trim()) return;
    try {
      await apiJson('/api/dashboard/network/set-referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: selectedAcc, referral_code: code.trim() }),
      });
      refreshAccount();
    } catch (requestError) {
      setError(errorMessage(requestError, t('Could not set referral network.', 'Doporučující síť se nepodařilo nastavit.')));
    }
  };

  const handleUnlinkReferral = async () => {
    if (!window.confirm(t("Unlink referral network?", "Odpojit doporučující síť?"))) return;
    try {
      await apiJson('/api/dashboard/network/unlink-referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: selectedAcc }),
      });
      refreshAccount();
    } catch (requestError) {
      setError(errorMessage(requestError, t('Could not unlink referral network.', 'Doporučující síť se nepodařilo odpojit.')));
    }
  };

  const handleRedeemCode = async () => {
    const secret = window.prompt(t("Enter your balance code secret:", "Zadejte tajný kód zůstatku:"));
    if (!secret) return;
    try {
      const result = await apiJson('/api/dashboard/subscription/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: selectedAcc, secret }),
      });
      window.alert(result.message || t('Balance code redeemed.', 'Kód zůstatku byl uplatněn.'));
      refreshAccount();
    } catch (requestError) {
      setError(errorMessage(requestError, t('Could not redeem balance code.', 'Kód zůstatku se nepodařilo uplatnit.')));
    }
  };

  const [authCode, setAuthCode] = useState(null);
  const [authCodeLoading, setAuthCodeLoading] = useState(false);
  const [authCodeDuration, setAuthCodeDuration] = useState(5);
  const [authCodeCopied, setAuthCodeCopied] = useState(false);

  const handleGenerateAuthCode = async () => {
    if (!selectedAcc || selectedAcc === 'all') return;
    setAuthCodeLoading(true);
    setAuthCode(null);
    setAuthCodeCopied(false);
    try {
      const result = await apiJson('/api/dashboard/generate-auth-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: selectedAcc, uses: 1, duration_minutes: authCodeDuration }),
      });
      if (result.auth_code) setAuthCode(result.auth_code);
      else setError(t('URnetwork did not return an auth code.', 'URnetwork nevrátil auth kód.'));
    } catch (requestError) {
      setError(errorMessage(requestError, t('Could not generate auth code.', 'Auth kód se nepodařilo vygenerovat.')));
    } finally {
      setAuthCodeLoading(false);
    }
  };

  const handleCopyAuthCode = async () => {
    if (!authCode) return;
    try {
      await navigator.clipboard.writeText(authCode);
      setAuthCodeCopied(true);
      window.setTimeout(() => setAuthCodeCopied(false), 2000);
    } catch {
      setError(t('Could not copy the auth code.', 'Auth kód se nepodařilo zkopírovat.'));
    }
  };

  const [associations, setAssociations] = useState(null);
  const [blockedLocs, setBlockedLocs] = useState([]);
  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      if (selectedAcc && selectedAcc !== 'all') {
        Promise.all([
          apiJson(`/api/dashboard/network/locations/blocked?account_id=${encodeURIComponent(selectedAcc)}`),
          apiJson(`/api/dashboard/devices/associations?account_id=${encodeURIComponent(selectedAcc)}`),
        ]).then(([locations, nextAssociations]) => {
          if (cancelled) return;
          setBlockedLocs(locations.blocked_locations || []);
          setAssociations(nextAssociations);
        }).catch((requestError) => {
          if (cancelled) return;
          setBlockedLocs([]);
          setAssociations(null);
          setError(errorMessage(requestError, t('Could not load account connections.', 'Připojení účtu se nepodařilo načíst.')));
        });
      } else {
        setBlockedLocs([]);
        setAssociations(null);
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [selectedAcc, t]);

  const handleUnblock = async (locId) => {
    try {
      await apiJson('/api/dashboard/network/locations/unblock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: selectedAcc, location_id: locId }),
      });
      const locations = await apiJson(`/api/dashboard/network/locations/blocked?account_id=${encodeURIComponent(selectedAcc)}`);
      setBlockedLocs(locations.blocked_locations || []);
    } catch (requestError) {
      setError(errorMessage(requestError, t('Could not unblock location.', 'Lokalitu se nepodařilo odblokovat.')));
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-t-white border-gray-800 rounded-full animate-spin"></div></div>;
  if (!data) return <div className="text-center py-10 text-red-500">{t("Failed to load data.", "Nepodařilo se načíst data.")}</div>;

  return (
    <div className="space-y-6">
      {error && <div role="alert" className="bg-red-500/10 border-l-4 border-red-500 p-4 text-red-400">{error}</div>}
      <div className="flex items-center justify-between mb-2">
        <select className="input max-w-xs" value={selectedAcc} onChange={(e) => setSelectedAcc(e.target.value)}>
          <option value="all">{t("All Accounts", "Všechny účty")}</option>
          {data.accounts?.map(acc => (
            <option key={acc.id} value={acc.id}>{acc.nickname || acc.username}</option>
          ))}
        </select>
        {selectedAcc !== 'all' && (
          <button onClick={handleRedeemCode} className="btn btn-secondary text-xs">{t("Redeem Balance Code", "Uplatnit kód zůstatku")}</button>
        )}
      </div>

      {selectedAcc !== 'all' && data.account_details && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          <div className="card bg-gradient-to-br from-[#111] to-[#0a0a0a]">
            <div className="text-xs font-semibold text-[#888] uppercase mb-2">{t("Total Earnings & Estimate", "Celkové výdělky a odhad")}</div>
            <div className="text-3xl font-bold text-[#0070f3]">
              ${data.total_earnings?.toFixed(2) || '0.00'}
            </div>
            <div className="text-sm font-medium text-emerald-500 mt-2 bg-emerald-500/10 inline-block px-3 py-1 rounded-full">+ ${data.account_details.approximate_payments?.toFixed(5) || '0.00'} {t("estimated from unpaid data", "odhad za nevyplacená data")}</div>
          </div>
          <div className="card">
            <div className="text-xs font-semibold text-[#888] uppercase mb-2">{t("Network Score", "Skóre sítě")}</div>
            <div className="text-3xl font-bold">{data.account_details.points || '0'} <span className="text-sm font-medium text-[#666]">pts</span></div>
            {data.account_details.reliability?.mean_reliability_weight && (
              <div className="text-xs text-[#888] mt-2">{t("Reliability:", "Spolehlivost:")} {(data.account_details.reliability.mean_reliability_weight * 5).toFixed(2)}%</div>
            )}
          </div>
          <div className="card">
            <div className="flex justify-between items-start">
              <div className="text-xs font-semibold text-[#888] uppercase mb-2">{t("Global Rank", "Globální pořadí")}</div>
              <button onClick={toggleVisibility} className="text-[10px] bg-[#222] px-2 py-0.5 rounded text-[#888] hover:text-[#ededed]">
                {data.account_details.ranking?.leaderboard_public ? 'Public' : 'Hidden'}
              </button>
            </div>
            <div className="text-3xl font-bold">#{data.account_details.ranking?.leaderboard_rank || 'N/A'}</div>
          </div>
          <div className="card">
            <div className="text-xs font-semibold text-[#888] uppercase mb-2">{t("Referrals", "Doporučení")}</div>
            <div className="text-3xl font-bold">{data.account_details.referrals?.total_referrals || '0'}</div>
            <div className="text-xs text-[#888] mt-2 font-mono bg-[#111] p-1 rounded inline-block">{t("Code:", "Kód:")} {data.account_details.referrals?.referral_code?.slice(0,8) || 'N/A'}</div>
            <div className="mt-2 text-xs border-t border-[#333] pt-2">
              {data.account_details.referral_network?.name ? (
                <div className="flex justify-between items-center">
                  <span className="text-[#888]">{t("Referred by:", "Doporučeno od:")} <span className="text-[#ededed]">{data.account_details.referral_network.name}</span></span>
                  <button onClick={handleUnlinkReferral} className="text-red-500 hover:text-red-400">{t("Unlink", "Odpojit")}</button>
                </div>
              ) : (
                <button onClick={handleSetReferral} className="text-[#0070f3] hover:underline">{t("Set Referral Network", "Nastavit doporučující síť")}</button>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedAcc !== 'all' && (
        <div className="card">
          <h3 className="text-lg font-semibold mb-1 text-[#ededed]">{t("Auth Code Generator", "Generátor Auth Kódu")}</h3>
          <p className="text-xs text-[#888] mb-4">{t("Generate a one-time auth code to log in on another device or authorize a provider node without entering your password.", "Vygeneruje jednorázový kód pro přihlášení na jiném zařízení nebo autorizaci provider uzlu bez zadání hesla.")}</p>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-[#888] mb-1 block">{t("Validity (minutes)", "Platnost (minuty)")}</label>
              <select
                className="input text-sm"
                value={authCodeDuration}
                onChange={e => { setAuthCodeDuration(Number(e.target.value)); setAuthCode(null); }}
              >
                <option value={1}>1 {t("minute", "minuta")}</option>
                <option value={5}>5 {t("minutes", "minut")}</option>
                <option value={15}>15 {t("minutes", "minut")}</option>
                <option value={60}>60 {t("minutes", "minut")}</option>
              </select>
            </div>
            <button
              onClick={handleGenerateAuthCode}
              disabled={authCodeLoading}
              className="btn btn-primary text-sm flex items-center gap-2"
            >
              {authCodeLoading ? (
                <><div className="w-4 h-4 border-2 border-t-white border-white/30 rounded-full animate-spin"></div>{t("Generating...", "Generuji...")}</>
              ) : t("Generate Auth Code", "Vygenerovat Auth Kód")}
            </button>
          </div>

          {authCode && (
            <div className="mt-4 p-4 bg-[#0a0a0a] border border-[#333] rounded-lg">
              <div className="text-xs text-[#888] mb-2">{t("Your auth code (valid for", "Váš auth kód (platí")} {authCodeDuration} {t("minutes, single-use):", "minut, jednorázový):")}</div>
              <div className="flex items-center gap-3">
                <code className="flex-1 text-emerald-400 font-mono text-base bg-[#111] px-4 py-3 rounded-lg break-all select-all">{authCode}</code>
                <button
                  onClick={handleCopyAuthCode}
                  className={`btn text-sm whitespace-nowrap ${authCodeCopied ? 'bg-emerald-600 text-white' : 'btn-secondary'}`}
                >
                  {authCodeCopied ? t("✓ Copied!", "✓ Zkopírováno!") : t("Copy", "Kopírovat")}
                </button>
              </div>
              <p className="text-xs text-[#555] mt-2">{t("Use this code at", "Použij tento kód na")} <span className="text-[#888]">https://ur.io</span> {t("or run:", "nebo spusť:")} <code className="text-[#888] bg-[#111] px-1 rounded">./provider auth</code></p>
            </div>
          )}
        </div>
      )}

      {data.leaderboard && data.leaderboard.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold mb-4 text-[#ededed]">Global Leaderboard</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#333] text-[#888] uppercase tracking-wider">
                  <th className="py-3 px-4 font-semibold">Rank</th>
                  <th className="py-3 px-4 font-semibold">Network Name</th>
                  <th className="py-3 px-4 font-semibold">Data Provided (MiB)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#222]">
                {data.leaderboard.map((earner, idx) => (
                  <tr key={idx} className="hover:bg-[#111] transition-colors">
                    <td className="py-3 px-4 font-bold text-[#ededed]">{idx + 1}</td>
                    <td className="py-3 px-4 text-[#a1a1aa]">{earner.is_public && !earner.contains_profanity ? earner.network_name : <span className="text-[#666] italic">[private]</span>}</td>
                    <td className="py-3 px-4 font-mono text-[#0070f3]">{earner.net_mib_count.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedAcc !== 'all' && blockedLocs.length > 0 && (
        <div className="card border-red-900/50">
          <h3 className="text-lg font-semibold mb-4 text-red-400">Blocked Locations</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#333] text-[#888] uppercase tracking-wider">
                  <th className="py-3 px-4 font-semibold">{t("Name", "Název")}</th>
                  <th className="py-3 px-4 font-semibold">{t("Type", "Typ")}</th>
                  <th className="py-3 px-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#222]">
                {blockedLocs.map((loc, idx) => (
                  <tr key={idx} className="hover:bg-[#111] transition-colors">
                    <td className="py-3 px-4 font-medium text-[#ededed]">{loc.location_name}</td>
                    <td className="py-3 px-4 text-[#a1a1aa]">{loc.location_type}</td>
                    <td className="py-3 px-4 text-right">
                       <button onClick={() => handleUnblock(loc.location_id)} className="text-emerald-500 hover:text-emerald-400">Unblock</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedAcc !== 'all' && associations && (associations.pending_adoption_devices?.length > 0 || associations.incoming_shared_devices?.length > 0 || associations.outgoing_shared_devices?.length > 0) && (
        <div className="card">
          <h3 className="text-lg font-semibold mb-4 text-[#ededed]">Device Associations</h3>
          <div className="space-y-6">
            {associations.pending_adoption_devices?.length > 0 && (
              <div>
                <h4 className="text-sm font-bold text-[#888] mb-2 uppercase">Pending Adoptions</h4>
                <div className="grid gap-2">
                  {associations.pending_adoption_devices.map(dev => (
                    <div key={dev.code} className="flex justify-between items-center bg-[#111] p-3 rounded-lg border border-[#333]">
                      <span>{dev.device_name} <span className="text-[#666] text-xs">({dev.duration_minutes}m left)</span></span>
                      <span className="text-xs font-mono text-[#888]">{dev.code}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {associations.incoming_shared_devices?.length > 0 && (
              <div>
                <h4 className="text-sm font-bold text-[#888] mb-2 uppercase">Incoming Shares</h4>
                <div className="grid gap-2">
                  {associations.incoming_shared_devices.map(dev => (
                    <div key={dev.code} className="flex justify-between items-center bg-[#111] p-3 rounded-lg border border-[#333]">
                      <span>{dev.device_name} <span className="text-[#666] text-xs">from {dev.network_name}</span></span>
                      <span className={`text-xs ${dev.pending ? 'text-yellow-500' : 'text-emerald-500'}`}>{dev.pending ? 'Pending' : 'Active'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DevicesTab({ lang = 'cs' }) {
  const isCs = lang === 'cs';
  const t = useCallback((en, cs) => isCs ? cs : en, [isCs]);
  const [devices, setDevices] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const devicesAbortRef = useRef(null);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const fetchDevices = useCallback(async () => {
    devicesAbortRef.current?.abort();
    const controller = new AbortController();
    devicesAbortRef.current = controller;
    setLoading(true);
    setError('');
    setDevices([]);
    setCurrentPage(1);
    try {
      const response = await apiFetch('/api/dashboard/devices/stream', { signal: controller.signal });
      if (!response.ok || !response.body) throw new Error('Could not load device stream.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      if (!controller.signal.aborted) setLoading(false);

      while (!controller.signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const jsonString = trimmed.slice(6).trim();
          if (!jsonString || jsonString === '{}') continue;
          try {
            const batch = JSON.parse(jsonString);
            if (Array.isArray(batch) && batch.length && !controller.signal.aborted) {
              setDevices((current) => [...(current || []), ...batch]);
            } else if (batch && typeof batch === 'object' && typeof batch.error === 'string') {
              setError(batch.error);
            }
          } catch {
            // Skip a malformed SSE event while preserving successfully loaded devices.
            setError(t('Some device data could not be read.', 'Část dat zařízení se nepodařilo načíst.'));
          }
        }
      }
    } catch (requestError) {
      if (!controller.signal.aborted) {
        setError(errorMessage(requestError, t('Could not load devices.', 'Zařízení se nepodařilo načíst.')));
      }
    } finally {
      if (devicesAbortRef.current === controller) {
        devicesAbortRef.current = null;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
  }, [t]);

  useEffect(() => {
    const timeout = window.setTimeout(() => { void fetchDevices(); }, 0);
    return () => {
      window.clearTimeout(timeout);
      devicesAbortRef.current?.abort();
      devicesAbortRef.current = null;
    };
  }, [fetchDevices]);

  const handleRemove = async (accId, clientId) => {
    if (!window.confirm(t("Are you sure you want to remove this device?", "Opravdu chcete toto zařízení odebrat?"))) return;
    try {
      const result = await apiJson(`/api/dashboard/devices/remove/${encodeURIComponent(accId)}/${encodeURIComponent(clientId)}`, { method: 'POST' });
      window.alert(result.message || t('Device removed.', 'Zařízení bylo odebráno.'));
      await fetchDevices();
    } catch (requestError) {
      setError(errorMessage(requestError, t('Could not remove device.', 'Zařízení se nepodařilo odebrat.')));
    }
  };

  const [selectedDevice, setSelectedDevice] = useState(null);
  const [deviceStats, setDeviceStats] = useState(null);

  const viewStats = async (device) => {
    setSelectedDevice(device);
    setDeviceStats(null);
    try {
      const result = await apiJson(`/api/dashboard/devices/stats?account_id=${encodeURIComponent(device.account_id)}&client_id=${encodeURIComponent(device.client_id)}`);
      setDeviceStats(result);
    } catch (requestError) {
      setSelectedDevice(null);
      setError(errorMessage(requestError, t('Could not load device statistics.', 'Statistiky zařízení se nepodařilo načíst.')));
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-t-white border-gray-800 rounded-full animate-spin"></div></div>;

  const handleProvideModeChange = async (accId, clientId, modeStr) => {
    const modes = { Default: -1, None: 0, Network: 1, 'Friends & Family': 2, Public: 3, Stream: 4 };
    const mode = modes[modeStr];
    if (mode === undefined) return;
    try {
      await apiJson('/api/dashboard/devices/set-provide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accId, client_id: clientId, provide_mode: mode }),
      });
      setDevices((current) => current.map((device) => device.client_id === clientId ? { ...device, provide_mode_str: modeStr } : device));
    } catch (requestError) {
      setError(errorMessage(requestError, t('Could not update mode.', 'Režim se nepodařilo aktualizovat.')));
    }
  };

  const handleRename = async (device) => {
    const newName = window.prompt(t('Enter new device name:', 'Zadejte nový název zařízení:'), device.device_name || '');
    if (!newName?.trim() || newName.trim() === device.device_name) return;
    try {
      await apiJson('/api/dashboard/devices/set-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: device.account_id, device_id: device.device_id, name: newName.trim() }),
      });
      await fetchDevices();
    } catch (requestError) {
      setError(errorMessage(requestError, t('Could not rename device.', 'Zařízení se nepodařilo přejmenovat.')));
    }
  };

  const filteredDevices = devices ? devices.filter(d => 
    (d.device_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (d.client_id || '').toLowerCase().includes(search.toLowerCase()) ||
    (d.account_nickname || '').toLowerCase().includes(search.toLowerCase())
  ) : [];

  const totalPages = Math.max(1, Math.ceil(filteredDevices.length / itemsPerPage));
  const paginatedDevices = filteredDevices.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="card p-0 overflow-hidden">
      {error && <div role="alert" className="m-4 bg-red-500/10 border-l-4 border-red-500 p-4 text-red-400">{error}</div>}
      <div className="p-6 border-b border-[#333] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-[#ededed]">{t("Device Management", "Správa zařízení")}</h3>
          <p className="text-sm text-[#888] mt-1">{t("Monitor and manage clients connected to your networks.", "Sledujte a spravujte klienty připojené k vašim sítím.")}</p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder={t("Search devices...", "Hledat zařízení...")}
            className="input w-64 text-sm"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead className="bg-[#111]">
            <tr className="border-b border-[#333] text-[#888] uppercase tracking-wider">
              <th className="py-3 px-6 font-semibold">{t("Account", "Účet")}</th>
              <th className="py-3 px-6 font-semibold">{t("Status", "Stav")}</th>
              <th className="py-3 px-6 font-semibold">{t("Device", "Zařízení")}</th>
              <th className="py-3 px-6 font-semibold">{t("Client ID", "ID klienta")}</th>
              <th className="py-3 px-6 font-semibold">{t("Mode", "Režim")}</th>
              <th className="py-3 px-6 font-semibold text-right">{t("Actions", "Akce")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#222]">
            {paginatedDevices.map(dev => (
              <tr key={`${dev.account_id}-${dev.client_id}`} className="hover:bg-[#111] transition-colors">
                <td className="py-4 px-6">
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-[#222] text-[#ededed]">
                    {dev.account_nickname}
                  </span>
                </td>
                <td className="py-4 px-6">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${dev.connections ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                    <span className={`font-medium ${dev.connections ? 'text-emerald-500' : 'text-red-500'}`}>
                      {dev.connections ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </td>
                <td className="py-4 px-6 font-medium text-[#ededed]">
                  <div className="flex items-center gap-2 group">
                    <span>{dev.device_name || t('Unnamed Device', 'Nepojmenované zařízení')}</span>
                    <button
                      type="button"
                      className="text-[#0070f3] opacity-0 group-hover:opacity-100 transition-opacity text-[10px]"
                      onClick={() => void handleRename(dev)}
                    >{t("Rename", "Přejmenovat")}</button>
                  </div>
                </td>
                <td className="py-4 px-6 font-mono text-xs text-[#888]">{dev.client_id}</td>
                <td className="py-4 px-6 text-[#a1a1aa]">
                  <select
                    className="bg-[#222] border border-[#333] text-[#ededed] text-xs rounded px-2 py-1 outline-none"
                    value={dev.provide_mode_str}
                    onChange={e => handleProvideModeChange(dev.account_id, dev.client_id, e.target.value)}
                  >
                    <option value="Default">Default</option>
                    <option value="None">None</option>
                    <option value="Network">Network</option>
                    <option value="Friends & Family">Friends & Family</option>
                    <option value="Public">Public</option>
                    <option value="Stream">Stream</option>
                  </select>
                </td>
                <td className="py-4 px-6 text-right space-x-3">
                  <button className="text-xs text-[#0070f3] hover:underline font-medium" onClick={() => viewStats(dev)}>{t("Stats", "Statistiky")}</button>
                  <button className="text-xs text-red-500 hover:text-red-400 font-medium" onClick={() => handleRemove(dev.account_id, dev.client_id)}>{t("Remove", "Odebrat")}</button>
                </td>
              </tr>
            ))}
            {paginatedDevices.length === 0 && (
              <tr><td colSpan="6" className="py-12 text-center text-[#888]">{t("No matching devices found.", "Nebyla nalezena žádná vyhovující zařízení.")}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="card w-full max-w-2xl bg-[#0a0a0a] border-[#333]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">{t("Device Insights:", "Podrobnosti o zařízení:")} {selectedDevice.device_name || 'Unnamed'}</h3>
              <button onClick={() => setSelectedDevice(null)} className="text-[#888] hover:text-white">✕</button>
            </div>

            {!deviceStats ? <div className="py-20 flex justify-center"><div className="w-6 h-6 border-2 border-t-white border-gray-800 rounded-full animate-spin"></div></div> : (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-[#111] rounded-lg border border-[#222]">
                    <div className="text-xs text-[#888] uppercase mb-1">{t("Total Payout (24h)", "Celková výplata (24h)")}</div>
                    <div className="text-2xl font-bold text-[#0070f3]">${deviceStats.payout_last_24h || '0.00'}</div>
                  </div>
                  <div className="p-4 bg-[#111] rounded-lg border border-[#222]">
                    <div className="text-xs text-[#888] uppercase mb-1">{t("Transfer (24h)", "Přenos (24h)")}</div>
                    <div className="text-2xl font-bold">{(deviceStats.transfer_data_last_24h || 0).toFixed(3)} GB</div>
                  </div>
                </div>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={Object.entries(deviceStats.transfer_data || {}).map(([d,v]) => ({date: d, GB: v})).sort((a,b)=>a.date.localeCompare(b.date))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                      <XAxis dataKey="date" hide />
                      <YAxis stroke="#888" tick={{fontSize: 10}} />
                      <Tooltip contentStyle={{backgroundColor: '#0a0a0a', borderColor: '#333'}} />
                      <Line type="monotone" dataKey="GB" stroke="#0070f3" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <button onClick={() => setSelectedDevice(null)} className="btn btn-secondary w-full">{t("Close", "Zavřít")}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="p-4 border-t border-[#333] flex items-center justify-between">
          <div className="text-sm text-[#888]">
            {t("Showing", "Zobrazeno")} <span className="text-[#ededed]">{(currentPage - 1) * itemsPerPage + 1}</span> {t("to", "až")} <span className="text-[#ededed]">{Math.min(currentPage * itemsPerPage, filteredDevices.length)}</span> {t("of", "z")} <span className="text-[#ededed]">{filteredDevices.length}</span> {t("devices", "zařízení")}
          </div>
          <div className="flex gap-2">
            <button
              className="btn btn-secondary text-xs px-3 py-1.5"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            >
              {t("Previous", "Předchozí")}
            </button>
            <button
              className="btn btn-secondary text-xs px-3 py-1.5"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            >
              {t("Next", "Další")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ApiKeysTab({ lang = 'cs' }) {
  const isCs = lang === 'cs';
  const t = useCallback((en, cs) => isCs ? cs : en, [isCs]);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState([]);
  const [selectedAcc, setSelectedAcc] = useState('');
  const [newKeyName, setNewKeyName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [removingKeyId, setRemovingKeyId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const loadAccounts = async () => {
      try {
        const result = await apiJson('/api/dashboard/account');
        if (cancelled) return;
        const nextAccounts = result.accounts || [];
        setAccounts(nextAccounts);
        setSelectedAcc((current) => current || String(nextAccounts[0]?.id || ''));
      } catch (requestError) {
        if (!cancelled) setError(errorMessage(requestError, t('Could not load accounts.', 'Účty se nepodařilo načíst.')));
      }
    };
    void loadAccounts();
    return () => { cancelled = true; };
  }, [t]);

  const fetchKeys = useCallback(async () => {
    if (!selectedAcc) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await apiJson(`/api/dashboard/api-keys?account_id=${encodeURIComponent(selectedAcc)}`);
      setData(result.api_keys || []);
      setError('');
    } catch (requestError) {
      setData([]);
      setError(errorMessage(requestError, t('Could not load API keys.', 'API klíče se nepodařilo načíst.')));
    } finally {
      setLoading(false);
    }
  }, [selectedAcc, t]);

  useEffect(() => {
    const timeout = window.setTimeout(() => { fetchKeys(); }, 0);
    return () => window.clearTimeout(timeout);
  }, [fetchKeys]);

  const handleAdd = async (event) => {
    event.preventDefault();
    const name = newKeyName.trim();
    if (!name || !selectedAcc || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await apiJson('/api/dashboard/api-keys/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: selectedAcc, name }),
      });
      window.alert(`${t('API key created!', 'API klíč byl vytvořen!')}\n\n${t('Key:', 'Klíč:')} ${result.api_key}\n\n${t('Please save this key now; it will not be shown again.', 'Uložte si tento klíč nyní; později se již znovu nezobrazí.')}`);
      setNewKeyName('');
      await fetchKeys();
    } catch (requestError) {
      setError(errorMessage(requestError, t('Could not create API key.', 'API klíč se nepodařilo vytvořit.')));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (keyId) => {
    if (!window.confirm(t('Remove this API key?', 'Odebrat tento API klíč?')) || removingKeyId) return;
    setRemovingKeyId(keyId);
    setError('');
    try {
      await apiJson('/api/dashboard/api-keys/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: selectedAcc, key_id: keyId }),
      });
      await fetchKeys();
    } catch (requestError) {
      setError(errorMessage(requestError, t('Could not remove API key.', 'API klíč se nepodařilo odebrat.')));
    } finally {
      setRemovingKeyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="card">
        {error && <div role="alert" className="mb-6 bg-red-500/10 border-l-4 border-red-500 p-4 text-red-400">{error}</div>}
        <select className="input max-w-xs mb-6" value={selectedAcc} onChange={(e) => setSelectedAcc(e.target.value)} disabled={accounts.length === 0}>
          {accounts.map(acc => (
            <option key={acc.id} value={acc.id}>{acc.nickname || acc.username}</option>
          ))}
        </select>

        <form onSubmit={handleAdd} className="flex gap-4 mb-6">
          <input type="text" className="input max-w-sm" placeholder={t("New API Key Name", "Nový název API klíče")} value={newKeyName} onChange={e => setNewKeyName(e.target.value)} required />
          <button type="submit" className="btn btn-primary" disabled={!selectedAcc || submitting}>{submitting ? t('Creating…', 'Vytváření…') : t('Create Key', 'Vytvořit klíč')}</button>
        </form>

        <h3 className="text-lg font-semibold mb-4 text-[#ededed]">API Keys</h3>
        {loading ? <div className="text-[#888]">Loading...</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-[#111]">
                <tr className="border-b border-[#333] text-[#888] uppercase tracking-wider">
                  <th className="py-3 px-4 font-semibold">{t("Name", "Název")}</th>
                  <th className="py-3 px-4 font-semibold">{t("Created", "Vytvořeno")}</th>
                  <th className="py-3 px-4 font-semibold text-right">{t("Actions", "Akce")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#222]">
                {data.map(k => (
                  <tr key={k.id} className="hover:bg-[#111] transition-colors">
                    <td className="py-3 px-4 font-medium text-[#ededed]">{k.name}</td>
                    <td className="py-3 px-4 text-[#888]">{new Date(k.create_time).toLocaleString()}</td>
                    <td className="py-3 px-4 text-right">
                      <button type="button" className="text-xs text-red-500 hover:text-red-400 font-medium disabled:opacity-50" disabled={removingKeyId === k.id} onClick={() => void handleRemove(k.id)}>{removingKeyId === k.id ? t('Removing…', 'Odebírání…') : t('Remove', 'Odebrat')}</button>
                    </td>
                  </tr>
                ))}
                {data.length === 0 && <tr><td colSpan="3" className="py-6 text-center text-[#888]">{t("No API keys found.", "Nebyly nalezeny žádné API klíče.")}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function WalletsTab({ lang = 'cs' }) {
  const isCs = lang === 'cs';
  const t = useCallback((en, cs) => isCs ? cs : en, [isCs]);
  const [wallets, setWallets] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [payoutWalletId, setPayoutWalletId] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [selectedAcc, setSelectedAcc] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newBlockchain, setNewBlockchain] = useState('SOL');
  const [addressStatus, setAddressStatus] = useState(null);
  const [circleAddress, setCircleAddress] = useState('');
  const [circleAmount, setCircleAmount] = useState('');
  const [circleConfirmed, setCircleConfirmed] = useState(false);
  const [acting, setActing] = useState(false);

  const loadAccounts = useCallback(async () => {
    try {
      const result = await apiJson('/api/dashboard/account');
      setAccounts(result.accounts || []);
      setSelectedAcc((current) => current || String(result.accounts?.[0]?.id || ''));
    } catch (requestError) {
      setError(errorMessage(requestError, t('Could not load accounts.', 'Účty se nepodařilo načíst.')));
    }
  }, [t]);

  const loadWalletData = useCallback(async (accountId = selectedAcc) => {
    if (!accountId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [walletData, paymentData, payoutData] = await Promise.all([
        apiJson(`/api/dashboard/wallets?account_id=${encodeURIComponent(accountId)}`),
        apiJson(`/api/account/payments?account_id=${encodeURIComponent(accountId)}`),
        apiJson(`/api/dashboard/payout-wallet?account_id=${encodeURIComponent(accountId)}`),
      ]);
      setWallets(walletData.wallets || []);
      setPayouts(paymentData.account_payments || []);
      setPayoutWalletId(payoutData.wallet_id || null);
      setError('');
    } catch (requestError) {
      setError(errorMessage(requestError, t('Could not load wallet data.', 'Data peněženky se nepodařilo načíst.')));
    } finally {
      setLoading(false);
    }
  }, [selectedAcc, t]);

  useEffect(() => {
    const timeout = window.setTimeout(() => { void loadAccounts(); }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadAccounts]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (selectedAcc) void loadWalletData(selectedAcc);
      else setLoading(false);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [selectedAcc, loadWalletData]);

  const validateAddress = async () => {
    if (!newAddress.trim() || !selectedAcc) return false;
    setAddressStatus({ loading: true });
    try {
      const result = await apiJson('/api/dashboard/wallet/validate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: selectedAcc, address: newAddress.trim() }),
      });
      setAddressStatus({ valid: result.valid, message: result.message });
      return result.valid;
    } catch (requestError) {
      const validationError = errorMessage(requestError, t('Address validation failed.', 'Ověření adresy selhalo.'));
      setAddressStatus({ valid: false, message: validationError });
      return false;
    }
  };

  const addWallet = async (event) => {
    event.preventDefault();
    if (!selectedAcc) return;
    setActing(true); setError(''); setMessage('');
    try {
      const valid = await validateAddress();
      if (!valid) return;
      await apiJson('/api/dashboard/wallets/add', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: selectedAcc, blockchain: newBlockchain, address: newAddress.trim() }),
      });
      setNewAddress(''); setAddressStatus(null);
      setMessage(t('Wallet added successfully.', 'Peněženka byla úspěšně přidána.'));
      await loadWalletData();
    } catch (requestError) {
      setError(errorMessage(requestError, t('Could not add wallet.', 'Peněženku se nepodařilo přidat.')));
    } finally { setActing(false); }
  };

  const setPayout = async (walletId) => {
    setActing(true); setError('');
    try {
      await apiJson('/api/dashboard/payout-wallet/set', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account_id: selectedAcc, wallet_id: walletId }) });
      setMessage(t('Primary payout wallet updated.', 'Hlavní výplatní peněženka byla změněna.'));
      await loadWalletData();
    } catch (requestError) { setError(errorMessage(requestError, t('Could not set primary wallet.', 'Hlavní peněženku se nepodařilo nastavit.'))); }
    finally { setActing(false); }
  };

  const removeWallet = async (walletId) => {
    if (!window.confirm(t('Remove this wallet? This can affect future payouts.', 'Odebrat tuto peněženku? Může to ovlivnit budoucí výplaty.'))) return;
    setActing(true); setError('');
    try {
      await apiJson('/api/dashboard/wallets/remove', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account_id: selectedAcc, wallet_id: walletId }) });
      setMessage(t('Wallet removed.', 'Peněženka byla odebrána.'));
      await loadWalletData();
    } catch (requestError) { setError(errorMessage(requestError, t('Could not remove wallet.', 'Peněženku se nepodařilo odebrat.'))); }
    finally { setActing(false); }
  };

  const initCircle = async () => {
    if (!selectedAcc || !window.confirm(t('Initialize a Circle self-custody wallet for this account?', 'Inicializovat Circle self-custody peněženku pro tento účet?'))) return;
    setActing(true); setError('');
    try {
      const result = await apiJson('/api/dashboard/wallet/circle/init', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account_id: selectedAcc }) });
      setMessage(`${t('Circle wallet initialization started.', 'Inicializace Circle peněženky byla spuštěna.')}${result.challenge_id ? ` ${t('Challenge ID:', 'Challenge ID:')} ${result.challenge_id}` : ''}`);
      await loadWalletData();
    } catch (requestError) { setError(errorMessage(requestError, t('Could not initialize Circle wallet.', 'Circle peněženku se nepodařilo inicializovat.'))); }
    finally { setActing(false); }
  };

  const transferCircle = async (event) => {
    event.preventDefault();
    if (!selectedAcc || !circleConfirmed) return;
    if (!window.confirm(t(`Transfer ${circleAmount} USDC to the entered address? This may be irreversible.`, `Odeslat ${circleAmount} USDC na zadanou adresu? Tato akce může být nevratná.`))) return;
    setActing(true); setError(''); setMessage('');
    try {
      await apiJson('/api/dashboard/wallet/circle/transfer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: selectedAcc, address: circleAddress.trim(), amount_usdc: circleAmount, confirmed: true }),
      });
      setCircleAddress(''); setCircleAmount(''); setCircleConfirmed(false);
      setMessage(t('Circle transfer request submitted.', 'Požadavek na Circle převod byl odeslán.'));
      await loadWalletData();
    } catch (requestError) { setError(errorMessage(requestError, t('Circle transfer failed.', 'Circle převod selhal.'))); }
    finally { setActing(false); }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"><select aria-label={t('Account', 'Účet')} className="input max-w-xs" value={selectedAcc} onChange={(event) => setSelectedAcc(event.target.value)}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.nickname || account.username}</option>)}</select><button type="button" disabled={!selectedAcc || acting} onClick={() => void initCircle()} className="btn btn-secondary text-xs disabled:opacity-60">{t('Init Circle Self-Custody', 'Inicializovat Circle self-custody')}</button></div>
      {error && <div role="alert" className="bg-red-500/10 border-l-4 border-red-500 p-4 text-red-400">{error}</div>}
      {message && <div role="status" className="bg-emerald-500/10 border-l-4 border-emerald-500 p-4 text-emerald-400">{message}</div>}
      <div className="card"><h2 className="text-xl font-bold mb-2">{t('Connected Wallets', 'Připojené peněženky')}</h2><p className="text-sm text-[#888] mb-6">{t('Addresses are validated before being sent to URnetwork.', 'Adresy se před odesláním do URnetwork ověřují.')}</p><form onSubmit={addWallet} className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 p-4 bg-[#111] rounded-lg border border-[#333]"><div><label className="label" htmlFor="wallet-chain">{t('Blockchain', 'Blockchain')}</label><select id="wallet-chain" className="input" value={newBlockchain} onChange={(event) => setNewBlockchain(event.target.value)}><option value="SOL">Solana (SOL)</option><option value="MATIC">Polygon (MATIC)</option></select></div><div className="md:col-span-2"><label className="label" htmlFor="wallet-address">{t('Wallet Address', 'Adresa peněženky')}</label><div className="flex gap-2"><input id="wallet-address" type="text" className="input" placeholder={t('Enter address', 'Zadejte adresu')} value={newAddress} onChange={(event) => { setNewAddress(event.target.value); setAddressStatus(null); }} required maxLength="256" /><button type="submit" disabled={acting || !selectedAcc} className="btn btn-primary whitespace-nowrap disabled:opacity-60">{addressStatus?.loading ? t('Checking…', 'Ověřuji…') : t('Add Wallet', 'Přidat peněženku')}</button></div>{addressStatus && !addressStatus.loading && <p className={`text-xs mt-2 ${addressStatus.valid ? 'text-emerald-400' : 'text-red-400'}`}>{addressStatus.message || (addressStatus.valid ? t('Address is valid.', 'Adresa je platná.') : t('Address is invalid.', 'Adresa není platná.'))}</p>}</div></form>{loading ? <p className="text-[#888]">{t('Loading…', 'Načítání…')}</p> : <div className="overflow-x-auto"><table className="w-full text-left border-collapse text-sm"><thead className="bg-[#111]"><tr className="border-b border-[#333] text-[#888] uppercase tracking-wider"><th className="py-3 px-4">{t('Address', 'Adresa')}</th><th className="py-3 px-4">{t('Blockchain', 'Blockchain')}</th><th className="py-3 px-4">{t('Type', 'Typ')}</th><th className="py-3 px-4 text-right">{t('Actions', 'Akce')}</th></tr></thead><tbody className="divide-y divide-[#222]">{wallets.map((wallet) => <tr key={wallet.wallet_id} className="hover:bg-[#111]"><td className="py-3 px-4"><div className="flex items-center gap-2"><span className="font-mono text-xs text-[#ededed] truncate max-w-[200px]">{wallet.wallet_address || wallet.circle_wallet_id}</span>{payoutWalletId === wallet.wallet_id && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-bold uppercase">{t('Primary Payout', 'Hlavní výplata')}</span>}</div></td><td className="py-3 px-4 text-[#888]">{wallet.blockchain}</td><td className="py-3 px-4 text-[#888]">{wallet.wallet_type}</td><td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">{payoutWalletId !== wallet.wallet_id && <button type="button" disabled={acting} className="text-xs text-blue-400 hover:text-blue-300 font-medium disabled:opacity-60" onClick={() => void setPayout(wallet.wallet_id)}>{t('Set Primary', 'Nastavit jako hlavní')}</button>}<button type="button" disabled={acting} className="text-xs text-red-500 hover:text-red-400 font-medium disabled:opacity-60" onClick={() => void removeWallet(wallet.wallet_id)}>{t('Remove', 'Odebrat')}</button></td></tr>)}{wallets.length === 0 && <tr><td colSpan="4" className="py-6 text-center text-[#888]">{t('No wallets connected.', 'Žádné připojené peněženky.')}</td></tr>}</tbody></table></div>}</div>
      <div className="card border-amber-500/30"><h2 className="text-xl font-bold mb-2">{t('Circle transfer', 'Circle převod')}</h2><p className="text-sm text-[#888] mb-5">{t('Review the recipient and amount carefully. Transfers may be irreversible.', 'Pečlivě zkontrolujte příjemce a částku. Převody mohou být nevratné.')}</p><form onSubmit={transferCircle} className="grid grid-cols-1 md:grid-cols-2 gap-4"><div><label className="label" htmlFor="circle-address">{t('Recipient address', 'Adresa příjemce')}</label><input id="circle-address" className="input" value={circleAddress} onChange={(event) => setCircleAddress(event.target.value)} required maxLength="256" /></div><div><label className="label" htmlFor="circle-amount">{t('Amount (USDC)', 'Částka (USDC)')}</label><input id="circle-amount" type="number" inputMode="decimal" min="0.000000001" max="1000000" step="0.000001" className="input" value={circleAmount} onChange={(event) => setCircleAmount(event.target.value)} required /></div><label className="md:col-span-2 flex items-start gap-2 text-sm text-[#ccc]"><input type="checkbox" checked={circleConfirmed} onChange={(event) => setCircleConfirmed(event.target.checked)} className="mt-1" />{t('I have verified the recipient address and understand that the transfer may be irreversible.', 'Ověřil(a) jsem adresu příjemce a rozumím tomu, že převod může být nevratný.')}</label><button type="submit" disabled={acting || !circleConfirmed || !selectedAcc} className="btn btn-danger justify-self-start disabled:opacity-60">{t('Submit Circle transfer', 'Odeslat Circle převod')}</button></form></div>
      <div className="card"><h2 className="text-xl font-bold mb-4">{t('Payout History', 'Historie výplat')}</h2><div className="overflow-x-auto"><table className="w-full text-left border-collapse text-sm"><thead className="bg-[#111]"><tr className="border-b border-[#333] text-[#888] uppercase tracking-wider"><th className="py-3 px-4">{t('Date', 'Datum')}</th><th className="py-3 px-4">{t('Amount', 'Částka')}</th><th className="py-3 px-4">{t('Data (GB)', 'Data (GB)')}</th><th className="py-3 px-4">{t('Status', 'Stav')}</th><th className="py-3 px-4 text-right">{t('Transaction', 'Transakce')}</th></tr></thead><tbody className="divide-y divide-[#222]">{payouts.map((payment) => { const amount = Number(payment.token_amount ?? Number(payment.payout_nano_cents || 0) / 1e9); const bytes = Number(payment.payout_byte_count || 0); return <tr key={payment.payment_id || `${payment.create_time}-${payment.tx_hash}`} className="hover:bg-[#111]"><td className="py-3 px-4 text-[#888]">{payment.create_time ? new Date(payment.create_time).toLocaleString() : '—'}</td><td className="py-3 px-4 font-bold text-[#0070f3]">${Number.isFinite(amount) ? amount.toFixed(2) : '0.00'}</td><td className="py-3 px-4 text-[#888]">{(bytes / 1e9).toFixed(2)} GB</td><td className="py-3 px-4">{payment.completed ? <span className="text-emerald-500">{t('Completed', 'Dokončeno')}</span> : payment.canceled ? <span className="text-red-500">{t('Canceled', 'Zrušeno')}</span> : <span className="text-yellow-500">{t('Pending', 'Čekající')}</span>}</td><td className="py-3 px-4 text-right">{payment.tx_hash ? <a href={payment.blockchain === 'SOL' ? `https://solscan.io/tx/${payment.tx_hash}` : `https://polygonscan.com/tx/${payment.tx_hash}`} target="_blank" rel="noopener noreferrer" className="text-[#0070f3] hover:underline font-mono text-xs">{payment.tx_hash.slice(0, 8)}…</a> : <span className="text-[#444]">—</span>}</td></tr>; })}{payouts.length === 0 && <tr><td colSpan="5" className="py-6 text-center text-[#888]">{t('No payouts found.', 'Nebyly nalezeny žádné platby.')}</td></tr>}</tbody></table></div></div>
    </div>
  );
}

function PreferencesTab({ lang = 'cs' }) {
  const isCs = lang === 'cs';
  const t = useCallback((en, cs) => isCs ? cs : en, [isCs]);
  const [accounts, setAccounts] = useState([]);
  const [selectedAcc, setSelectedAcc] = useState('');
  const [prefs, setPrefs] = useState({ product_updates: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadAccounts = async () => {
      try {
        const result = await apiJson('/api/dashboard/account');
        if (cancelled) return;
        const nextAccounts = result.accounts || [];
        setAccounts(nextAccounts);
        setSelectedAcc((current) => current || String(nextAccounts[0]?.id || ''));
      } catch (requestError) {
        if (!cancelled) setError(errorMessage(requestError, t('Could not load accounts.', 'Účty se nepodařilo načíst.')));
      }
    };
    void loadAccounts();
    return () => { cancelled = true; };
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();
    const loadPreferences = async () => {
      if (!selectedAcc) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const result = await apiJson(`/api/preferences?account_id=${encodeURIComponent(selectedAcc)}`, { signal: controller.signal });
        if (!controller.signal.aborted) {
          setPrefs({ product_updates: Boolean(result.product_updates) });
          setError('');
        }
      } catch (requestError) {
        if (!controller.signal.aborted) setError(errorMessage(requestError, t('Could not load preferences.', 'Předvolby se nepodařilo načíst.')));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void loadPreferences();
    return () => controller.abort();
  }, [selectedAcc, t]);

  const handleToggle = async () => {
    if (!selectedAcc || saving) return;
    const productUpdates = !prefs.product_updates;
    setSaving(true);
    setError('');
    try {
      await apiJson('/api/preferences/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: selectedAcc, product_updates: productUpdates }),
      });
      setPrefs((current) => ({ ...current, product_updates: productUpdates }));
    } catch (requestError) {
      setError(errorMessage(requestError, t('Could not save preferences.', 'Předvolby se nepodařilo uložit.')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card max-w-xl">
      {error && <div role="alert" className="mb-6 bg-red-500/10 border-l-4 border-red-500 p-4 text-red-400">{error}</div>}
      <select className="input max-w-xs mb-6" value={selectedAcc} onChange={(e) => setSelectedAcc(e.target.value)} disabled={accounts.length === 0}>
        {accounts.map(acc => (
          <option key={acc.id} value={acc.id}>{acc.nickname || acc.username}</option>
        ))}
      </select>
      <div className="flex items-center justify-between p-4 border border-[#333] rounded-lg bg-[#111]">
        <div>
          <div className="font-medium">{t("Product Updates", "Aktualizace produktu")}</div>
          <div className="text-sm text-[#888]">{t("Receive emails about new features and updates.", "Dostávejte e-maily o nových funkcích a aktualizacích.")}</div>
        </div>
        <button
          type="button"
          disabled={loading || saving || !selectedAcc}
          onClick={() => void handleToggle()}
          className={`w-12 h-6 rounded-full transition-colors relative disabled:opacity-50 ${prefs.product_updates ? 'bg-[#0070f3]' : 'bg-[#333]'}`}
        >
          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${prefs.product_updates ? 'left-7' : 'left-1'}`}></div>
        </button>
      </div>
    </div>
  );
}

function FeedbackTab({ lang = 'cs' }) {
  const isCs = lang === 'cs';
  const t = useCallback((en, cs) => isCs ? cs : en, [isCs]);
  const [accounts, setAccounts] = useState([]);
  const [selectedAcc, setSelectedAcc] = useState('');
  const [stars, setStars] = useState(5);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    const loadAccounts = async () => {
      try {
        const result = await apiJson('/api/dashboard/account');
        if (cancelled) return;
        const nextAccounts = result.accounts || [];
        setAccounts(nextAccounts);
        setSelectedAcc((current) => current || String(nextAccounts[0]?.id || ''));
      } catch (requestError) {
        if (!cancelled) setError(errorMessage(requestError, t('Could not load accounts.', 'Účty se nepodařilo načíst.')));
      }
    };
    void loadAccounts();
    return () => { cancelled = true; };
  }, [t]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selectedAcc || sending) return;
    setSending(true);
    setError('');
    setMessage('');
    try {
      await apiJson('/api/feedback/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: selectedAcc, star_count: stars, text: text.trim() }),
      });
      setText('');
      setMessage(t('Feedback sent! Thank you.', 'Zpětná vazba byla odeslána. Děkujeme.'));
    } catch (requestError) {
      setError(errorMessage(requestError, t('Could not send feedback.', 'Zpětnou vazbu se nepodařilo odeslat.')));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card max-w-xl">
      {error && <div role="alert" className="mb-6 bg-red-500/10 border-l-4 border-red-500 p-4 text-red-400">{error}</div>}
      {message && <div role="status" className="mb-6 bg-emerald-500/10 border-l-4 border-emerald-500 p-4 text-emerald-400">{message}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="label">{t("Account", "Účet")}</label>
        <select className="input mb-4" value={selectedAcc} onChange={(e) => setSelectedAcc(e.target.value)} disabled={accounts.length === 0}>
          {accounts.map(acc => (
            <option key={acc.id} value={acc.id}>{acc.nickname || acc.username}</option>
          ))}
        </select>

        <label className="label">{t("Rating", "Hodnocení")}</label>
        <div className="flex gap-2 mb-4">
          {[1,2,3,4,5].map(s => (
            <button key={s} type="button" onClick={() => setStars(s)} className={`text-2xl ${stars >= s ? 'text-yellow-500' : 'text-[#333]'}`}>★</button>
          ))}
        </div>

        <label className="label">{t("Message", "Zpráva")}</label>
        <textarea className="input min-h-[120px]" value={text} onChange={e => setText(e.target.value)} placeholder={t("What can we improve?", "Co můžeme zlepšit?")}></textarea>

        <button type="submit" disabled={sending || !selectedAcc} className="btn btn-primary w-full">
          {sending ? t('Sending…', 'Odesílání…') : t('Submit Feedback', 'Odeslat zpětnou vazbu')}
        </button>
      </form>
    </div>
  );
}

export default function OwnerDashboard({ lang = "cs" }) {
  const isCs = lang === "cs";
  const t = (en, cs) => isCs ? cs : en;
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{t("Owner Dashboard", "Přehled správce")}</h1>
        <div className="flex bg-[#111] p-1 rounded-lg border border-[#333] overflow-x-auto">
          <button className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap ${activeTab === 'overview' ? 'bg-[#222] text-white shadow-sm' : 'text-[#888] hover:text-[#ededed]'}`} onClick={() => setActiveTab('overview')}>{t("Overview", "Přehled")}</button>
          <button className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap ${activeTab === 'account' ? 'bg-[#222] text-white shadow-sm' : 'text-[#888] hover:text-[#ededed]'}`} onClick={() => setActiveTab('account')}>{t("Network & Referrals", "Síť a doporučení")}</button>
          <button className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap ${activeTab === 'devices' ? 'bg-[#222] text-white shadow-sm' : 'text-[#888] hover:text-[#ededed]'}`} onClick={() => setActiveTab('devices')}>{t("Devices", "Zařízení")}</button>
          <button className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap ${activeTab === 'apikeys' ? 'bg-[#222] text-white shadow-sm' : 'text-[#888] hover:text-[#ededed]'}`} onClick={() => setActiveTab('apikeys')}>{t("API Keys", "API klíče")}</button>
          <button className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap ${activeTab === 'wallets' ? 'bg-[#222] text-white shadow-sm' : 'text-[#888] hover:text-[#ededed]'}`} onClick={() => setActiveTab('wallets')}>{t("Wallets", "Peněženky")}</button>
          <button className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap ${activeTab === 'prefs' ? 'bg-[#222] text-white shadow-sm' : 'text-[#888] hover:text-[#ededed]'}`} onClick={() => setActiveTab('prefs')}>{t("Preferences", "Předvolby")}</button>
          <button className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap ${activeTab === 'feedback' ? 'bg-[#222] text-white shadow-sm' : 'text-[#888] hover:text-[#ededed]'}`} onClick={() => setActiveTab('feedback')}>{t("Feedback", "Zpětná vazba")}</button>
        </div>
      </div>

      {activeTab === 'overview' && <OverviewTab lang={lang} />}
      {activeTab === 'account' && <AccountInfoTab lang={lang} />}
      {activeTab === 'devices' && <DevicesTab lang={lang} />}
      {activeTab === 'apikeys' && <ApiKeysTab lang={lang} />}
      {activeTab === 'wallets' && <WalletsTab lang={lang} />}
      {activeTab === 'prefs' && <PreferencesTab lang={lang} />}
      {activeTab === 'feedback' && <FeedbackTab lang={lang} />}
    </div>
  );
}
