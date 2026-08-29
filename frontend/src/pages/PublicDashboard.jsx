import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { apiJson, errorMessage } from '../lib/api';

export default function PublicDashboard({ lang = 'cs' }) {
  const [data, setData] = useState(null);
  const [locations, setLocations] = useState(null);
  const [geoData, setGeoData] = useState(null);
  const [networkGrowth, setNetworkGrowth] = useState([]);
  const [error, setError] = useState('');
  const isCs = lang === 'cs';
  const t = useCallback((en, cs) => (isCs ? cs : en), [isCs]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const [dashboardData, locData, geoJson, netGrowth] = await Promise.all([
          apiJson('/api/public/dashboard', { signal: controller.signal }),
          apiJson('/api/locations', { signal: controller.signal }),
          fetch('/countries.geojson', { signal: controller.signal }).then((response) => response.ok ? response.json() : null),
          apiJson('/api/provider/network_total', { signal: controller.signal }),
        ]);
        if (controller.signal.aborted) return;
        setData(dashboardData);
        setLocations(locData);
        setGeoData(geoJson);
        setNetworkGrowth(netGrowth);
      } catch (requestError) {
        if (!controller.signal.aborted) setError(errorMessage(requestError, t('Could not load public data.', 'Veřejná data se nepodařilo načíst.')));
      }
    };
    void load();
    return () => controller.abort();
  }, [t]);

  if (error) return <div role="alert" className="text-center py-10 text-red-400">{error}</div>;
  if (!data) return <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-t-white border-gray-800 rounded-full animate-spin" /></div>;

  const chartData = (data.chart_data?.labels || []).map((label, index) => ({ time: new Date(label).toLocaleString(), Total: data.chart_data.data[index] }));
  const longTermData = networkGrowth.map((entry) => ({ date: new Date(entry.timestamp).toLocaleDateString(), Providers: entry.total, MA: entry.ma }));
  let mapDataWithDensity = geoData;
  if (geoData && locations?.locations) {
    const providerCounts = Object.fromEntries(locations.locations.filter((location) => location.country_code).map((location) => [location.country_code.toUpperCase(), location.provider_count]));
    mapDataWithDensity = {
      ...geoData,
      features: geoData.features.map((feature) => ({
        ...feature,
        properties: {
          ...feature.properties,
          density: providerCounts[feature.properties['ISO3166-1-Alpha-2']] || providerCounts[feature.properties.iso_a2] || 0,
        },
      })),
    };
  }

  const getStyle = (feature) => {
    const density = feature.properties.density || 0;
    return {
      fillColor: density > 100 ? '#0070f3' : density > 25 ? '#3291ff' : density > 10 ? '#005cc5' : density > 0 ? '#003e87' : '#111111',
      weight: 1,
      opacity: 1,
      color: '#222222',
      fillOpacity: density > 0 ? 0.8 : 0.4,
    };
  };
  const onEachFeature = (feature, layer) => {
    layer.bindTooltip(`<b>${feature.properties.name}</b><br/>${feature.properties.density || 0} ${t('providers', 'poskytovatelů')}`);
    layer.on({ mouseover: (event) => { event.target.setStyle({ weight: 2, color: '#ededed', fillOpacity: 1 }); event.target.bringToFront(); }, mouseout: () => layer.setStyle(getStyle(feature)) });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between gap-4"><div><h1 className="text-3xl font-bold tracking-tight">{t('Public Dashboard', 'Veřejný přehled')}</h1><p className="text-sm text-[#888] mt-1">{t('Global provider information. Private account data is hidden by default.', 'Globální informace o providerech. Soukromá data účtů jsou ve výchozím stavu skrytá.')}</p></div><Link to="/providers" className="btn btn-secondary self-start">{t('Explore provider analytics', 'Prozkoumat analytiku providerů')}</Link></div>

      {!data.enabled && <div className="card border-blue-500/30 bg-blue-500/5"><h2 className="font-semibold text-blue-300">{t('Account metrics are private', 'Metriky účtu jsou soukromé')}</h2><p className="text-sm text-[#888] mt-2">{t('The dashboard owner has not enabled public account statistics. Global provider analytics and the map remain available below.', 'Majitel dashboardu nepovolil veřejné statistiky účtu. Globální analytika providerů a mapa jsou stále dostupné níže.')}</p></div>}
      {data.enabled && !data.financials_available && <div className="card border-blue-500/30 bg-blue-500/5"><p className="text-sm text-[#888]">{t('The owner enabled this public page, but aggregate financial metrics remain private.', 'Majitel povolil tuto veřejnou stránku, ale souhrnné finanční metriky zůstávají soukromé.')}</p></div>}

      {data.financials_available && data.combined && <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="card hover:border-[#666]"><div className="text-xs font-semibold text-[#888] uppercase mb-1">{t('Total Paid Data', 'Celkem vyplacená data')}</div><div className="text-3xl font-bold tracking-tight">{data.combined.paid_gb.toFixed(3)} GB</div></div>
          <div className="card hover:border-[#666]"><div className="text-xs font-semibold text-[#888] uppercase mb-1">{t('Total Unpaid Data', 'Celkem nevyplacená data')}</div><div className="text-3xl font-bold tracking-tight">{data.combined.unpaid_gb.toFixed(3)} GB</div></div>
          <div className="card hover:border-[#666]"><div className="text-xs font-semibold text-[#888] uppercase mb-1">{t('Active Accounts', 'Aktivní účty')}</div><div className="text-3xl font-bold tracking-tight">{data.active_accounts}</div></div>
          <div className="card hover:border-[#666]"><div className="text-xs font-semibold text-[#888] uppercase mb-1">{t('Earnings (30 Days)', 'Výdělky (30 dní)')}</div><div className="text-3xl font-bold tracking-tight">${data.monthly_earnings.toFixed(2)}</div></div>
        </div>
        <div className="card"><h2 className="text-lg font-semibold mb-4 text-[#ededed]">{t('Total Data Provided (GB)', 'Celkem poskytnutá data (GB)')}</h2><div className="h-[400px]">{chartData.length > 0 ? <ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} /><XAxis dataKey="time" stroke="#888" tick={{ fill: '#888', fontSize: 12 }} tickLine={false} axisLine={false} /><YAxis stroke="#888" tick={{ fill: '#888', fontSize: 12 }} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ backgroundColor: '#0a0a0a', borderColor: '#333', color: '#ededed', borderRadius: '8px' }} itemStyle={{ color: '#ededed' }} /><Line type="monotone" dataKey="Total" stroke="#0070f3" strokeWidth={2} dot={false} activeDot={{ r: 6 }} /></LineChart></ResponsiveContainer> : <p className="text-[#888] text-center mt-20">{t('Not enough data to display.', 'Nedostatek dat pro zobrazení.')}</p>}</div></div>
      </>}

      <div className="card"><h2 className="text-lg font-semibold mb-4 text-[#ededed]">{t('Network Growth (Providers)', 'Růst sítě (poskytovatelé)')}</h2><div className="h-[400px]">{longTermData.length > 0 ? <ResponsiveContainer width="100%" height="100%"><LineChart data={longTermData}><CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} /><XAxis dataKey="date" stroke="#888" tick={{ fill: '#888', fontSize: 10 }} tickLine={false} axisLine={false} /><YAxis stroke="#888" tick={{ fill: '#888', fontSize: 12 }} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ backgroundColor: '#0a0a0a', borderColor: '#333', color: '#ededed', borderRadius: '8px' }} itemStyle={{ color: '#ededed' }} /><Line type="monotone" dataKey="Providers" name={t('Providers', 'Poskytovatelé')} stroke="#4ade80" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="MA" name={t('24h moving average', '24h klouzavý průměr')} stroke="#9ca3af" strokeDasharray="5 5" strokeWidth={1} dot={false} /></LineChart></ResponsiveContainer> : <p className="text-[#888] text-center mt-20">{t('No historical provider data yet.', 'Zatím nejsou k dispozici historická data providerů.')}</p>}</div></div>

      <div className="card p-0 overflow-hidden"><div className="p-6 border-b border-[#333]"><h2 className="text-lg font-semibold text-[#ededed]">{t('Global Provider Distribution', 'Globální distribuce providerů')}</h2><p className="text-sm text-[#888] mt-1">{t('Density map of network providers worldwide.', 'Mapa hustoty poskytovatelů sítě po celém světě.')}</p></div><div className="h-[500px] w-full bg-[#000] map-tile-inverted">{mapDataWithDensity ? <MapContainer center={[20, 10]} zoom={2} minZoom={2} maxZoom={6} style={{ height: '100%', width: '100%', background: '#000' }}><TileLayer url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png" attribution="&copy; OpenStreetMap &copy; CARTO" /><GeoJSON data={mapDataWithDensity} style={getStyle} onEachFeature={onEachFeature} /></MapContainer> : <div className="h-full flex items-center justify-center text-[#888]">{t('Map data is unavailable.', 'Mapová data nejsou dostupná.')}</div>}</div></div>
    </div>
  );
}
