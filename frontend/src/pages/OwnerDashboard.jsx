import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

function OverviewTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('combined');

  useEffect(() => {
    fetch('/api/dashboard/overview')
      .then(res => res.json())
      .then(data => {
        setData(data);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-t-white border-gray-800 rounded-full animate-spin"></div></div>;
  if (!data) return <div className="text-center py-10 text-red-500">Failed to load data.</div>;

  const combinedData = data.combined_chart.labels.map((label, idx) => ({
    time: label,
    Paid: data.combined_chart.paid_gb[idx],
    Unpaid: data.combined_chart.unpaid_gb[idx],
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card hover:border-[#666]"><div className="text-xs font-semibold text-[#888] uppercase mb-1">Total Paid Data</div><div className="text-3xl font-bold tracking-tight">{data.combined.paid_gb.toFixed(3)} GB</div></div>
        <div className="card hover:border-[#666]"><div className="text-xs font-semibold text-[#888] uppercase mb-1">Total Unpaid Data</div><div className="text-3xl font-bold tracking-tight">{data.combined.unpaid_gb.toFixed(3)} GB</div></div>
        <div className="card hover:border-[#666]"><div className="text-xs font-semibold text-[#888] uppercase mb-1">Total Earnings</div><div className="text-3xl font-bold tracking-tight">${data.total_earnings.toFixed(2)}</div></div>
        <div className="card hover:border-[#666]"><div className="text-xs font-semibold text-[#888] uppercase mb-1">Active Accounts</div><div className="text-3xl font-bold tracking-tight">{data.active_accounts}</div></div>
      </div>
      <div className="card">
        <div className="flex gap-3 mb-6">
          <button className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${viewMode === 'combined' ? 'bg-[#ededed] text-black' : 'bg-[#111] text-[#888] hover:text-white border border-[#333]'}`} onClick={() => setViewMode('combined')}>Combined</button>
          <button className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${viewMode === 'individual' ? 'bg-[#ededed] text-black' : 'bg-[#111] text-[#888] hover:text-white border border-[#333]'}`} onClick={() => setViewMode('individual')}>Individual</button>
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
            ) : <p className="text-center mt-20 text-[#888]">Not enough data to display.</p>}
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
                  <h3 className="text-sm font-semibold mb-4 text-[#888]"><span className="text-[#ededed]">{acc}</span> Data</h3>
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

function AccountInfoTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedAcc, setSelectedAcc] = useState('all');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/account?account_id=${selectedAcc}`)
      .then(res => res.json())
      .then(data => {
        setData(data);
        setLoading(false);
      });
  }, [selectedAcc]);

  const toggleVisibility = async () => {
    if(!data.account_details || !selectedAcc || selectedAcc === 'all') return;
    const isPublic = data.account_details.ranking?.leaderboard_public;
    const res = await fetch('/api/dashboard/network/visibility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: selectedAcc, is_public: !isPublic })
    });
    if(res.ok) {
       setData(prev => ({...prev, account_details: {...prev.account_details, ranking: {...prev.account_details.ranking, leaderboard_public: !isPublic}}}));
    } else {
       const d = await res.json(); alert(d.error || 'Failed');
    }
  };

  const handleSetReferral = async () => {
    const code = prompt("Enter the referral code of the network that referred you:");
    if(!code) return;
    const res = await fetch('/api/dashboard/network/set-referral', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: selectedAcc, referral_code: code })
    });
    if(res.ok) {
       window.location.reload();
    } else {
       const d = await res.json(); alert(d.error);
    }
  };
  
  const handleUnlinkReferral = async () => {
    if(!confirm("Unlink referral network?")) return;
    const res = await fetch('/api/dashboard/network/unlink-referral', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: selectedAcc })
    });
    if(res.ok) {
       window.location.reload();
    } else {
       const d = await res.json(); alert(d.error);
    }
  };

  const handleRedeemCode = async () => {
    const secret = prompt("Enter your balance code secret:");
    if(!secret) return;
    const res = await fetch('/api/dashboard/subscription/redeem', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: selectedAcc, secret })
    });
    const d = await res.json();
    alert(d.message || d.error);
    if(res.ok) window.location.reload();
  };

  const [associations, setAssociations] = useState(null);
  const [blockedLocs, setBlockedLocs] = useState([]);
  useEffect(() => {
    if(selectedAcc && selectedAcc !== 'all') {
      fetch(`/api/dashboard/network/locations/blocked?account_id=${selectedAcc}`)
        .then(res => res.json())
        .then(d => setBlockedLocs(d.blocked_locations || []));
      
      fetch(`/api/dashboard/devices/associations?account_id=${selectedAcc}`)
        .then(res => res.json())
        .then(d => setAssociations(d));
    } else {
      setBlockedLocs([]);
      setAssociations(null);
    }
  }, [selectedAcc]);

  const handleUnblock = async (locId) => {
    await fetch('/api/dashboard/network/locations/unblock', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: selectedAcc, location_id: locId })
    });
    fetch(`/api/dashboard/network/locations/blocked?account_id=${selectedAcc}`)
        .then(res => res.json())
        .then(d => setBlockedLocs(d.blocked_locations || []));
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-t-white border-gray-800 rounded-full animate-spin"></div></div>;
  if (!data) return <div className="text-center py-10 text-red-500">Failed to load data.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-2">
        <select className="input max-w-xs" value={selectedAcc} onChange={(e) => setSelectedAcc(e.target.value)}>
          <option value="all">All Accounts</option>
          {data.accounts?.map(acc => (
            <option key={acc.id} value={acc.id}>{acc.nickname || acc.username}</option>
          ))}
        </select>
        {selectedAcc !== 'all' && (
          <button onClick={handleRedeemCode} className="btn btn-secondary text-xs">Redeem Balance Code</button>
        )}
      </div>

      {selectedAcc !== 'all' && data.account_details && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          <div className="card bg-gradient-to-br from-[#111] to-[#0a0a0a]">
            <div className="text-xs font-semibold text-[#888] uppercase mb-2">Total Earnings & Pending</div>
            <div className="text-3xl font-bold text-[#0070f3]">
              ${data.total_earnings?.toFixed(2) || '0.00'}
            </div>
            <div className="text-xs text-[#888] mt-2 flex justify-between items-center">
              <span>+ ${data.account_details.approximate_payments?.toFixed(5) || '0.00'} pending</span>
            </div>
          </div>
          <div className="card">
            <div className="text-xs font-semibold text-[#888] uppercase mb-2">Network Score</div>
            <div className="text-3xl font-bold">{data.account_details.points || '0'} <span className="text-sm font-medium text-[#666]">pts</span></div>
            {data.account_details.reliability?.mean_reliability_weight && (
              <div className="text-xs text-[#888] mt-2">Reliability: {(data.account_details.reliability.mean_reliability_weight * 5).toFixed(2)}%</div>
            )}
          </div>
          <div className="card">
            <div className="flex justify-between items-start">
              <div className="text-xs font-semibold text-[#888] uppercase mb-2">Global Rank</div>
              <button onClick={toggleVisibility} className="text-[10px] bg-[#222] px-2 py-0.5 rounded text-[#888] hover:text-[#ededed]">
                {data.account_details.ranking?.leaderboard_public ? 'Public' : 'Hidden'}
              </button>
            </div>
            <div className="text-3xl font-bold">#{data.account_details.ranking?.leaderboard_rank || 'N/A'}</div>
          </div>
          <div className="card">
            <div className="text-xs font-semibold text-[#888] uppercase mb-2">Referrals</div>
            <div className="text-3xl font-bold">{data.account_details.referrals?.total_referrals || '0'}</div>
            <div className="text-xs text-[#888] mt-2 font-mono bg-[#111] p-1 rounded inline-block">Code: {data.account_details.referrals?.referral_code?.slice(0,8) || 'N/A'}</div>
            <div className="mt-2 text-xs border-t border-[#333] pt-2">
              {data.account_details.referral_network?.name ? (
                <div className="flex justify-between items-center">
                  <span className="text-[#888]">Referred by: <span className="text-[#ededed]">{data.account_details.referral_network.name}</span></span>
                  <button onClick={handleUnlinkReferral} className="text-red-500 hover:text-red-400">Unlink</button>
                </div>
              ) : (
                <button onClick={handleSetReferral} className="text-[#0070f3] hover:underline">Set Referral Network</button>
              )}
            </div>
          </div>
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
                  <th className="py-3 px-4 font-semibold">Name</th>
                  <th className="py-3 px-4 font-semibold">Type</th>
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

function DevicesTab() {
  const [devices, setDevices] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const fetchDevices = () => {
    setLoading(true);
    setDevices([]);
    fetch('/api/dashboard/devices/stream')
      .then(async response => {
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let done = false;
        let buffer = "";
        
        setLoading(false);
        while (!done) {
          const { value, done: doneReading } = await reader.read();
          done = doneReading;
          if (value) {
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            
            // Keep the last partial line in the buffer
            buffer = lines.pop();
            
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('data: ')) {
                const jsonStr = trimmed.substring(6).trim();
                if (jsonStr && jsonStr !== '{}') {
                  try {
                    const data = JSON.parse(jsonStr);
                    if (data && data.length > 0) {
                      setDevices(prev => [...(prev || []), ...data]);
                    }
                  } catch (e) {
                    console.error("SSE parse error", e, "on string:", jsonStr);
                  }
                }
              }
            }
          }
        }
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => { fetchDevices(); }, []);

  const handleRemove = async (accId, clientId) => {
    if (!confirm("Are you sure you want to remove this device?")) return;
    const res = await fetch(`/api/dashboard/devices/remove/${accId}/${clientId}`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) alert(data.message);
    else alert(data.error);
    fetchDevices();
  };

  const [selectedDevice, setSelectedDevice] = useState(null);
  const [deviceStats, setDeviceStats] = useState(null);

  const viewStats = async (dev) => {
    setSelectedDevice(dev);
    setDeviceStats(null);
    const res = await fetch(`/api/dashboard/devices/stats?account_id=${dev.account_id}&client_id=${dev.client_id}`);
    const data = await res.json();
    setDeviceStats(data);
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-t-white border-gray-800 rounded-full animate-spin"></div></div>;

  const handleProvideModeChange = async (accId, clientId, modeStr) => {
    const modes = {"Default": -1, "None": 0, "Network": 1, "Friends & Family": 2, "Public": 3, "Stream": 4};
    const mode = modes[modeStr];
    if (mode === undefined) return;
    const res = await fetch('/api/dashboard/devices/set-provide', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: accId, client_id: clientId, provide_mode: mode })
    });
    if (res.ok) {
       setDevices(prev => prev.map(d => d.client_id === clientId ? {...d, provide_mode_str: modeStr} : d));
    } else {
       const data = await res.json();
       alert(data.error || 'Failed to update mode');
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
      <div className="p-6 border-b border-[#333] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-[#ededed]">Device Management</h3>
          <p className="text-sm text-[#888] mt-1">Monitor and manage clients connected to your networks.</p>
        </div>
        <div className="flex gap-2">
          <input 
            type="text" 
            placeholder="Search devices..." 
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
              <th className="py-3 px-6 font-semibold">Account</th>
              <th className="py-3 px-6 font-semibold">Status</th>
              <th className="py-3 px-6 font-semibold">Device</th>
              <th className="py-3 px-6 font-semibold">Client ID</th>
              <th className="py-3 px-6 font-semibold">Mode</th>
              <th className="py-3 px-6 font-semibold text-right">Actions</th>
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
                    <span>{dev.device_name || 'Unnamed Device'}</span>
                    <button 
                      className="text-[#0070f3] opacity-0 group-hover:opacity-100 transition-opacity text-[10px]"
                      onClick={async () => {
                        const newName = prompt("Enter new device name:", dev.device_name || '');
                        if (newName && newName !== dev.device_name) {
                          const res = await fetch('/api/dashboard/devices/set-name', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ account_id: dev.account_id, device_id: dev.device_id, name: newName })
                          });
                          if(res.ok) fetchDevices();
                          else alert((await res.json()).error);
                        }
                      }}
                    >Rename</button>
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
                  <button className="text-xs text-[#0070f3] hover:underline font-medium" onClick={() => viewStats(dev)}>Stats</button>
                  <button className="text-xs text-red-500 hover:text-red-400 font-medium" onClick={() => handleRemove(dev.account_id, dev.client_id)}>Remove</button>
                </td>
              </tr>
            ))}
            {paginatedDevices.length === 0 && (
              <tr><td colSpan="6" className="py-12 text-center text-[#888]">No matching devices found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="card w-full max-w-2xl bg-[#0a0a0a] border-[#333]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Device Insights: {selectedDevice.device_name || 'Unnamed'}</h3>
              <button onClick={() => setSelectedDevice(null)} className="text-[#888] hover:text-white">✕</button>
            </div>
            
            {!deviceStats ? <div className="py-20 flex justify-center"><div className="w-6 h-6 border-2 border-t-white border-gray-800 rounded-full animate-spin"></div></div> : (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-[#111] rounded-lg border border-[#222]">
                    <div className="text-xs text-[#888] uppercase mb-1">Total Payout (24h)</div>
                    <div className="text-2xl font-bold text-[#0070f3]">${deviceStats.payout_last_24h || '0.00'}</div>
                  </div>
                  <div className="p-4 bg-[#111] rounded-lg border border-[#222]">
                    <div className="text-xs text-[#888] uppercase mb-1">Transfer (24h)</div>
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
                <button onClick={() => setSelectedDevice(null)} className="btn btn-secondary w-full">Close</button>
              </div>
            )}
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="p-4 border-t border-[#333] flex items-center justify-between">
          <div className="text-sm text-[#888]">
            Showing <span className="text-[#ededed]">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-[#ededed]">{Math.min(currentPage * itemsPerPage, filteredDevices.length)}</span> of <span className="text-[#ededed]">{filteredDevices.length}</span> devices
          </div>
          <div className="flex gap-2">
            <button 
              className="btn btn-secondary text-xs px-3 py-1.5"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button 
              className="btn btn-secondary text-xs px-3 py-1.5"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ApiKeysTab() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState([]);
  const [selectedAcc, setSelectedAcc] = useState('');
  const [newKeyName, setNewKeyName] = useState('');

  useEffect(() => {
    fetch('/api/dashboard/account')
      .then(res => res.json())
      .then(d => {
        setAccounts(d.accounts || []);
        if (d.accounts && d.accounts.length > 0) {
          setSelectedAcc(d.accounts[0].id);
        }
      });
  }, []);

  const fetchKeys = () => {
    if (!selectedAcc) return;
    setLoading(true);
    fetch(`/api/dashboard/api-keys?account_id=${selectedAcc}`)
      .then(res => res.json())
      .then(d => {
        setData(d.api_keys || []);
        setLoading(false);
      });
  };

  useEffect(() => { fetchKeys(); }, [selectedAcc]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newKeyName || !selectedAcc) return;
    const res = await fetch('/api/dashboard/api-keys/add', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: selectedAcc, name: newKeyName })
    });
    const result = await res.json();
    if (res.ok) {
      alert(`API Key Created!\n\nKey: ${result.api_key}\n\nPlease save this key now as it won't be shown again.`);
      setNewKeyName('');
      fetchKeys();
    } else {
      alert(result.error || "Failed to create API key");
    }
  };

  const handleRemove = async (keyId) => {
    if (!confirm("Remove this API key?")) return;
    await fetch('/api/dashboard/api-keys/remove', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: selectedAcc, key_id: keyId })
    });
    fetchKeys();
  };

  return (
    <div className="space-y-6">
      <div className="card">
        <select className="input max-w-xs mb-6" value={selectedAcc} onChange={(e) => setSelectedAcc(e.target.value)}>
          {accounts.map(acc => (
            <option key={acc.id} value={acc.id}>{acc.nickname || acc.username}</option>
          ))}
        </select>
        
        <form onSubmit={handleAdd} className="flex gap-4 mb-6">
          <input type="text" className="input max-w-sm" placeholder="New API Key Name" value={newKeyName} onChange={e => setNewKeyName(e.target.value)} required />
          <button type="submit" className="btn btn-primary">Create Key</button>
        </form>

        <h3 className="text-lg font-semibold mb-4 text-[#ededed]">API Keys</h3>
        {loading ? <div className="text-[#888]">Loading...</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-[#111]">
                <tr className="border-b border-[#333] text-[#888] uppercase tracking-wider">
                  <th className="py-3 px-4 font-semibold">Name</th>
                  <th className="py-3 px-4 font-semibold">Created</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#222]">
                {data.map(k => (
                  <tr key={k.id} className="hover:bg-[#111] transition-colors">
                    <td className="py-3 px-4 font-medium text-[#ededed]">{k.name}</td>
                    <td className="py-3 px-4 text-[#888]">{new Date(k.create_time).toLocaleString()}</td>
                    <td className="py-3 px-4 text-right">
                      <button className="text-xs text-red-500 hover:text-red-400 font-medium" onClick={() => handleRemove(k.id)}>Remove</button>
                    </td>
                  </tr>
                ))}
                {data.length === 0 && <tr><td colSpan="3" className="py-6 text-center text-[#888]">No API keys found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function WalletsTab() {
  const [data, setData] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [payoutWalletId, setPayoutWalletId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState([]);
  const [selectedAcc, setSelectedAcc] = useState('');
  
  const [newAddr, setNewAddr] = useState('');
  const [newBlockchain, setNewBlockchain] = useState('SOL');

  useEffect(() => {
    fetch('/api/dashboard/account')
      .then(res => res.json())
      .then(d => {
        setAccounts(d.accounts || []);
        if (d.accounts && d.accounts.length > 0) {
          setSelectedAcc(d.accounts[0].id);
        }
      });
  }, []);

  const fetchData = () => {
    if (!selectedAcc) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/dashboard/wallets?account_id=${selectedAcc}`).then(res => res.json()),
      fetch(`/api/account/payments?account_id=${selectedAcc}`).then(res => res.json()),
      fetch(`/api/dashboard/payout-wallet?account_id=${selectedAcc}`).then(res => res.json())
    ]).then(([wData, pData, pwData]) => {
      setData(wData.wallets || []);
      setPayouts(pData.account_payments || []);
      setPayoutWalletId(pwData.wallet_id);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [selectedAcc]);

  const handleAddWallet = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/dashboard/wallets/add', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: selectedAcc, blockchain: newBlockchain, address: newAddr })
    });
    if(res.ok) { setNewAddr(''); fetchData(); }
    else alert("Failed to add wallet");
  };

  const handleSetPayout = async (id) => {
    const res = await fetch('/api/dashboard/payout-wallet/set', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: selectedAcc, wallet_id: id })
    });
    if(res.ok) fetchData();
    else alert("Failed to set payout wallet");
  };

  const handleRemove = async (walletId) => {
    if (!confirm("Remove this wallet?")) return;
    await fetch('/api/dashboard/wallets/remove', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: selectedAcc, wallet_id: walletId })
    });
    fetchData();
  };

  const handleInitCircle = async () => {
    const res = await fetch('/api/dashboard/wallet/circle/init', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: selectedAcc })
    });
    const d = await res.json();
    if(res.ok) alert("Circle Wallet Initialized!\nChallenge ID: " + d.challenge_id);
    else alert(d.error || "Failed to init Circle wallet");
  };

  return (
    <div className="space-y-8">
      <div className="card">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <select className="input max-w-xs" value={selectedAcc} onChange={(e) => setSelectedAcc(e.target.value)}>
            {accounts.map(acc => (
              <option key={acc.id} value={acc.id}>{acc.nickname || acc.username}</option>
            ))}
          </select>
          <button onClick={handleInitCircle} className="btn btn-secondary text-xs">Init Circle Self-Custody</button>
        </div>

        <form onSubmit={handleAddWallet} className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 p-4 bg-[#111] rounded-lg border border-[#333]">
          <div>
            <label className="label">Blockchain</label>
            <select className="input" value={newBlockchain} onChange={e => setNewBlockchain(e.target.value)}>
              <option value="SOL">Solana (SOL)</option>
              <option value="MATIC">Polygon (MATIC)</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label">Wallet Address</label>
            <div className="flex gap-2">
              <input type="text" className="input" placeholder="Enter address" value={newAddr} onChange={e => setNewAddr(e.target.value)} required />
              <button type="submit" className="btn btn-primary whitespace-nowrap">Add Wallet</button>
            </div>
          </div>
        </form>
        
        <h3 className="text-lg font-semibold mb-4 text-[#ededed]">Connected Wallets</h3>
        {loading ? <div className="text-[#888]">Loading...</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-[#111]">
                <tr className="border-b border-[#333] text-[#888] uppercase tracking-wider">
                  <th className="py-3 px-4 font-semibold">Address</th>
                  <th className="py-3 px-4 font-semibold">Blockchain</th>
                  <th className="py-3 px-4 font-semibold">Type</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#222]">
                {data.map(w => (
                  <tr key={w.wallet_id} className="hover:bg-[#111] transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-[#ededed] truncate max-w-[200px]">{w.wallet_address || w.circle_wallet_id}</span>
                        {payoutWalletId === w.wallet_id && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-bold uppercase">Primary Payout</span>}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-[#888]">{w.blockchain}</td>
                    <td className="py-3 px-4 text-[#888]">{w.wallet_type}</td>
                    <td className="py-3 px-4 text-right space-x-2">
                      {payoutWalletId !== w.wallet_id && (
                        <button className="text-xs text-blue-400 hover:text-blue-300 font-medium" onClick={() => handleSetPayout(w.wallet_id)}>Set Primary</button>
                      )}
                      <button className="text-xs text-red-500 hover:text-red-400 font-medium" onClick={() => handleRemove(w.wallet_id)}>Remove</button>
                    </td>
                  </tr>
                ))}
                {data.length === 0 && <tr><td colSpan="4" className="py-6 text-center text-[#888]">No wallets connected.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="text-lg font-semibold mb-4 text-[#ededed]">Payout History</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="bg-[#111]">
              <tr className="border-b border-[#333] text-[#888] uppercase tracking-wider">
                <th className="py-3 px-4 font-semibold">Date</th>
                <th className="py-3 px-4 font-semibold">Amount</th>
                <th className="py-3 px-4 font-semibold">Data (GB)</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Transaction</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#222]">
              {payouts.map(p => (
                <tr key={p.payment_id} className="hover:bg-[#111] transition-colors">
                  <td className="py-3 px-4 text-[#888]">{new Date(p.create_time).toLocaleDateString()}</td>
                  <td className="py-3 px-4 font-bold text-[#0070f3]">
                    ${((p.payout_nano_cents + p.subsidy_payout_nano_cents + (p.reliability_subsidy_nano_cents || 0)) / 1e9).toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-[#888]">{(p.payout_byte_count / 1e9).toFixed(2)} GB</td>
                  <td className="py-3 px-4">
                    {p.completed ? <span className="text-emerald-500">Completed</span> : p.canceled ? <span className="text-red-500">Canceled</span> : <span className="text-yellow-500">Pending</span>}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {p.tx_hash ? (
                      <a href={p.blockchain === 'SOL' ? `https://solscan.io/tx/${p.tx_hash}` : `https://polygonscan.com/tx/${p.tx_hash}`} target="_blank" className="text-[#0070f3] hover:underline font-mono text-xs">
                        {p.tx_hash.slice(0, 8)}...
                      </a>
                    ) : <span className="text-[#444]">-</span>}
                  </td>
                </tr>
              ))}
              {payouts.length === 0 && <tr><td colSpan="5" className="py-6 text-center text-[#888]">No payouts found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PreferencesTab() {
  const [accounts, setAccounts] = useState([]);
  const [selectedAcc, setSelectedAcc] = useState('');
  const [prefs, setPrefs] = useState({ product_updates: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard/account')
      .then(res => res.json())
      .then(d => {
        setAccounts(d.accounts || []);
        if (d.accounts && d.accounts.length > 0) setSelectedAcc(d.accounts[0].id);
      });
  }, []);

  useEffect(() => {
    if(!selectedAcc) return;
    setLoading(true);
    fetch(`/api/preferences?account_id=${selectedAcc}`)
      .then(res => res.json())
      .then(d => { setPrefs(d); setLoading(false); });
  }, [selectedAcc]);

  const handleToggle = async () => {
    const newVal = !prefs.product_updates;
    const res = await fetch('/api/preferences/set', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: selectedAcc, product_updates: newVal })
    });
    if(res.ok) setPrefs({...prefs, product_updates: newVal});
  };

  return (
    <div className="card max-w-xl">
      <select className="input max-w-xs mb-6" value={selectedAcc} onChange={(e) => setSelectedAcc(e.target.value)}>
        {accounts.map(acc => (
          <option key={acc.id} value={acc.id}>{acc.nickname || acc.username}</option>
        ))}
      </select>
      <div className="flex items-center justify-between p-4 border border-[#333] rounded-lg bg-[#111]">
        <div>
          <div className="font-medium">Product Updates</div>
          <div className="text-sm text-[#888]">Receive emails about new features and updates.</div>
        </div>
        <button 
          onClick={handleToggle}
          className={`w-12 h-6 rounded-full transition-colors relative ${prefs.product_updates ? 'bg-[#0070f3]' : 'bg-[#333]'}`}
        >
          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${prefs.product_updates ? 'left-7' : 'left-1'}`}></div>
        </button>
      </div>
    </div>
  );
}

function FeedbackTab() {
  const [accounts, setAccounts] = useState([]);
  const [selectedAcc, setSelectedAcc] = useState('');
  const [stars, setStars] = useState(5);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch('/api/dashboard/account')
      .then(res => res.json())
      .then(d => {
        setAccounts(d.accounts || []);
        if (d.accounts && d.accounts.length > 0) setSelectedAcc(d.accounts[0].id);
      });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSending(true);
    const res = await fetch('/api/feedback/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: selectedAcc, star_count: stars, text })
    });
    setSending(false);
    if(res.ok) { alert("Feedback sent! Thank you."); setText(''); }
    else alert("Failed to send feedback.");
  };

  return (
    <div className="card max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="label">Account</label>
        <select className="input mb-4" value={selectedAcc} onChange={(e) => setSelectedAcc(e.target.value)}>
          {accounts.map(acc => (
            <option key={acc.id} value={acc.id}>{acc.nickname || acc.username}</option>
          ))}
        </select>
        
        <label className="label">Rating</label>
        <div className="flex gap-2 mb-4">
          {[1,2,3,4,5].map(s => (
            <button key={s} type="button" onClick={() => setStars(s)} className={`text-2xl ${stars >= s ? 'text-yellow-500' : 'text-[#333]'}`}>★</button>
          ))}
        </div>

        <label className="label">Message</label>
        <textarea className="input min-h-[120px]" value={text} onChange={e => setText(e.target.value)} placeholder="What can we improve?"></textarea>
        
        <button type="submit" disabled={sending} className="btn btn-primary w-full">
          {sending ? "Sending..." : "Submit Feedback"}
        </button>
      </form>
    </div>
  );
}

export default function OwnerDashboard() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Owner Dashboard</h1>
        <div className="flex bg-[#111] p-1 rounded-lg border border-[#333] overflow-x-auto">
          <button className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap ${activeTab === 'overview' ? 'bg-[#222] text-white shadow-sm' : 'text-[#888] hover:text-[#ededed]'}`} onClick={() => setActiveTab('overview')}>Overview</button>
          <button className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap ${activeTab === 'account' ? 'bg-[#222] text-white shadow-sm' : 'text-[#888] hover:text-[#ededed]'}`} onClick={() => setActiveTab('account')}>Network & Referrals</button>
          <button className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap ${activeTab === 'devices' ? 'bg-[#222] text-white shadow-sm' : 'text-[#888] hover:text-[#ededed]'}`} onClick={() => setActiveTab('devices')}>Devices</button>
          <button className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap ${activeTab === 'apikeys' ? 'bg-[#222] text-white shadow-sm' : 'text-[#888] hover:text-[#ededed]'}`} onClick={() => setActiveTab('apikeys')}>API Keys</button>
          <button className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap ${activeTab === 'wallets' ? 'bg-[#222] text-white shadow-sm' : 'text-[#888] hover:text-[#ededed]'}`} onClick={() => setActiveTab('wallets')}>Wallets</button>
          <button className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap ${activeTab === 'prefs' ? 'bg-[#222] text-white shadow-sm' : 'text-[#888] hover:text-[#ededed]'}`} onClick={() => setActiveTab('prefs')}>Preferences</button>
          <button className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap ${activeTab === 'feedback' ? 'bg-[#222] text-white shadow-sm' : 'text-[#888] hover:text-[#ededed]'}`} onClick={() => setActiveTab('feedback')}>Feedback</button>
        </div>
      </div>

      {activeTab === 'overview' && <OverviewTab />}
      {activeTab === 'account' && <AccountInfoTab />}
      {activeTab === 'devices' && <DevicesTab />}
      {activeTab === 'apikeys' && <ApiKeysTab />}
      {activeTab === 'wallets' && <WalletsTab />}
      {activeTab === 'prefs' && <PreferencesTab />}
      {activeTab === 'feedback' && <FeedbackTab />}
    </div>
  );
}
