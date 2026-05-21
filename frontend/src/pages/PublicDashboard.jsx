import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export default function PublicDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState(null);
  const [geoData, setGeoData] = useState(null);
  const [stats90, setStats90] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/public/dashboard').then(res => res.json()),
      fetch('/api/locations').then(res => res.json()).catch(() => null),
      fetch('/countries.geojson').then(res => res.json()).catch(() => null),
      fetch('/api/stats/last-90').then(res => res.json()).catch(() => null)
    ])
    .then(([dashboardData, locData, geoJson, s90]) => {
      setData(dashboardData);
      setLocations(locData);
      setGeoData(geoJson);
      setStats90(s90);
      setLoading(false);
    })
    .catch(err => {
      console.error('Failed to fetch public dashboard:', err);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-t-white border-gray-800 rounded-full animate-spin"></div></div>;
  if (!data) return <div className="text-center py-10 text-red-500">Failed to load data.</div>;

  const chartData = data.chart_data.labels.map((label, idx) => ({
    time: label,
    Total: data.chart_data.data[idx]
  }));

  const longTermData = stats90?.all_transfer_data ? Object.entries(stats90.all_transfer_data).map(([day, val]) => ({
    date: day,
    Usage: val / 1e9
  })).sort((a,b) => a.date.localeCompare(b.date)) : [];

  // Prepare map data
  let mapDataWithDensity = geoData;
  if (geoData && locations && locations.locations) {
    const providerCounts = {};
    locations.locations.forEach(loc => {
      if (loc.country_code) {
        providerCounts[loc.country_code.toUpperCase()] = loc.provider_count;
      }
    });

    mapDataWithDensity = {
      ...geoData,
      features: geoData.features.map(f => ({
        ...f,
        properties: {
          ...f.properties,
          density: providerCounts[f.properties['ISO3166-1-Alpha-2']] || providerCounts[f.properties.iso_a2] || 0
        }
      }))
    };
  }

  const getStyle = (feature) => {
    const d = feature.properties.density;
    const fillColor = d > 100 ? '#0070f3' :
                      d > 25  ? '#3291ff' :
                      d > 10  ? '#005cc5' :
                      d > 0   ? '#003e87' : '#111111';
    return {
      fillColor,
      weight: 1,
      opacity: 1,
      color: '#222222',
      fillOpacity: d > 0 ? 0.8 : 0.4
    };
  };

  const onEachFeature = (feature, layer) => {
    layer.bindTooltip(`<b>${feature.properties.name}</b><br/>${feature.properties.density || 0} providers`);
    layer.on({
      mouseover: (e) => {
        const l = e.target;
        l.setStyle({ weight: 2, color: '#ededed', fillOpacity: 1 });
        l.bringToFront();
      },
      mouseout: (e) => {
        layer.setStyle(getStyle(feature));
      }
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <h1 className="text-3xl font-bold tracking-tight">Public Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card hover:border-[#666]"><div className="text-xs font-semibold text-[#888] uppercase mb-1">Total Paid Data</div><div className="text-3xl font-bold tracking-tight">{data.combined.paid_gb.toFixed(3)} GB</div></div>
        <div className="card hover:border-[#666]"><div className="text-xs font-semibold text-[#888] uppercase mb-1">Total Unpaid Data</div><div className="text-3xl font-bold tracking-tight">{data.combined.unpaid_gb.toFixed(3)} GB</div></div>
        <div className="card hover:border-[#666]"><div className="text-xs font-semibold text-[#888] uppercase mb-1">Active Accounts</div><div className="text-3xl font-bold tracking-tight">{data.active_accounts}</div></div>
        <div className="card hover:border-[#666]"><div className="text-xs font-semibold text-[#888] uppercase mb-1">Earnings (30 Days)</div><div className="text-3xl font-bold tracking-tight">${data.monthly_earnings.toFixed(2)}</div></div>
      </div>

      <div className="card">
        <h3 className="text-lg font-semibold mb-4 text-[#ededed]">Total Data Provided (GB)</h3>
        <div className="h-[400px]">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0070f3" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#0070f3" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                <XAxis dataKey="time" stroke="#888" tick={{fill: '#888', fontSize: 12}} tickLine={false} axisLine={false} />
                <YAxis stroke="#888" tick={{fill: '#888', fontSize: 12}} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{backgroundColor: '#0a0a0a', borderColor: '#333', color: '#ededed', borderRadius: '8px'}} itemStyle={{color: '#ededed'}} />
                <Legend wrapperStyle={{paddingTop: '20px'}} />
                <Line type="monotone" dataKey="Total" stroke="#0070f3" strokeWidth={2} dot={false} activeDot={{r: 6}} fill="url(#colorTotal)" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-[#888] text-center mt-20">Not enough data to display.</p>
          )}
        </div>
      </div>

      {Object.entries(data.account_charts).length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {Object.entries(data.account_charts).map(([acc, info], idx) => {
            const cData = info.labels.map((label, i) => ({
              time: label,
              [acc]: info.data[i]
            }));
            const colors = ['#0070f3', '#7928ca', '#f5a623', '#10b981', '#f00', '#f5a623'];
            const color = colors[idx % colors.length];

            return (
              <div key={acc} className="card">
                <h3 className="text-sm font-semibold mb-4 text-[#888]"><span className="text-[#ededed]">{acc}</span> Data</h3>
                <div className="h-[250px]">
                  {cData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={cData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                        <XAxis dataKey="time" stroke="#888" tick={{fill: '#888', fontSize: 10}} tickLine={false} axisLine={false} />
                        <YAxis stroke="#888" tick={{fill: '#888', fontSize: 10}} tickLine={false} axisLine={false} width={40} />
                        <Tooltip contentStyle={{backgroundColor: '#0a0a0a', borderColor: '#333', borderRadius: '8px'}} itemStyle={{color: '#ededed'}} />
                        <Line type="monotone" dataKey={acc} stroke={color} strokeWidth={2} dot={false} activeDot={{r: 4}} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-[#888] text-center mt-20">Not enough data to display.</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
        <h3 className="text-lg font-semibold mb-4 text-[#ededed]">Network Growth (90 Days - GB)</h3>
        <div className="h-[400px]">
          {longTermData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={longTermData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                <XAxis dataKey="date" stroke="#888" tick={{fill: '#888', fontSize: 10}} tickLine={false} axisLine={false} />
                <YAxis stroke="#888" tick={{fill: '#888', fontSize: 12}} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{backgroundColor: '#0a0a0a', borderColor: '#333', color: '#ededed', borderRadius: '8px'}} itemStyle={{color: '#ededed'}} />
                <Line type="monotone" dataKey="Usage" stroke="#7928ca" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-[#888] text-center mt-20">Loading 90-day historical data...</p>
          )}
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="p-6 border-b border-[#333]">
          <h3 className="text-lg font-semibold text-[#ededed]">Global Provider Distribution</h3>
          <p className="text-sm text-[#888] mt-1">Density map of network providers worldwide.</p>
        </div>
        <div className="h-[500px] w-full bg-[#000] filter-invert">
          <MapContainer center={[20, 10]} zoom={2} minZoom={2} maxZoom={6} style={{ height: '100%', width: '100%', background: '#000' }}>
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            {mapDataWithDensity && (
              <GeoJSON 
                data={mapDataWithDensity} 
                style={getStyle}
                onEachFeature={onEachFeature}
              />
            )}
          </MapContainer>
        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .filter-invert .leaflet-tile-pane {
          filter: invert(1) hue-rotate(180deg) brightness(0.8) contrast(1.2);
        }
      `}} />
    </div>
  );
}
