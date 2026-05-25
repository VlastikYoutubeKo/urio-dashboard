import { useEffect, useState } from 'react';

export default function SettingsPage({ lang = 'cs' }) {
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState('');
  const [payload, setPayload] = useState('');
  const [onPayment, setOnPayment] = useState(true);
  const [onChange, setOnChange] = useState(false);
  const [onSummary, setOnSummary] = useState(true);
  const [summaryInterval, setSummaryInterval] = useState('1h');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const isCs = lang === 'cs';
  const t = (en, cs) => isCs ? cs : en;

  const fetchWebhooks = () => {
    fetch('/api/webhooks')
      .then(res => res.json())
      .then(data => {
        setWebhooks(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchWebhooks();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/webhooks/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url, 
          payload, 
          on_payment: onPayment, 
          on_change: onChange, 
          on_summary: onSummary, 
          summary_interval: summaryInterval 
        })
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(t('Webhook added successfully', 'Webhook byl úspěšně přidán'));
        setUrl('');
        setPayload('');
        fetchWebhooks();
      } else {
        setError(data.error || t('Failed to add webhook', 'Přidání webhooku selhalo'));
      }
    } catch (err) {
      setError(t('Network error', 'Chyba sítě'));
    }
  };

  const handleUpdate = async (hook) => {
    try {
      const res = await fetch(`/api/webhooks/update/${hook.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hook)
      });
      if (res.ok) {
        setSuccess(t('Webhook updated successfully', 'Webhook byl úspěšně aktualizován'));
        fetchWebhooks();
      }
    } catch (err) {
      setError(t('Failed to update', 'Aktualizace selhala'));
    }
  };

  const handleRemove = async (id) => {
    if (!confirm(t('Remove this webhook?', 'Odebrat tento webhook?'))) return;
    await fetch(`/api/webhooks/remove/${id}`, { method: 'POST' });
    fetchWebhooks();
  };

  if (loading) return <div className="text-center py-20">{t("Loading...", "Načítání...")}</div>;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">{t("Settings", "Nastavení")}</h1>

      <div className="card">
        <h2 className="text-xl font-bold mb-2">{t("Webhook Management", "Správa webhooků")}</h2>
        <p className="text-[var(--color-text-muted)] mb-6">{t("Configure notifications for payments, balance changes, and traffic summaries.", "Nakonfigurujte upozornění na platby, změny zůstatku a souhrny provozu.")}</p>
        
        {error && <div className="bg-red-500/10 border-l-4 border-red-500 p-4 mb-4 text-red-400">{error}</div>}
        {success && <div className="bg-emerald-500/10 border-l-4 border-emerald-500 p-4 mb-4 text-emerald-400">{success}</div>}
        
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="label">{t("Webhook URL", "URL adresa webhooku")}</label>
            <input type="url" className="input" value={url} onChange={e => setUrl(e.target.value)} required placeholder="https://discord.com/api/webhooks/..." />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-black/20 rounded-lg">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input type="checkbox" checked={onPayment} onChange={e => setOnPayment(e.target.checked)} />
              <span>{t("Payment Alerts", "Upozornění na platby")}</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input type="checkbox" checked={onChange} onChange={e => setOnChange(e.target.checked)} />
              <span>{t("Balance Changes", "Změny zůstatku")}</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input type="checkbox" checked={onSummary} onChange={e => setOnSummary(e.target.checked)} />
              <span>{t("Periodic Summaries", "Pravidelné souhrny")}</span>
            </label>
          </div>

          {onSummary && (
            <div>
              <label className="label">{t("Summary Interval", "Interval souhrnu")}</label>
              <select className="input" value={summaryInterval} onChange={e => setSummaryInterval(e.target.value)}>
                <option value="30m">{t("Every 30 Minutes", "Každých 30 minut")}</option>
                <option value="1h">{t("Every 1 Hour", "Každou hodinu")}</option>
                <option value="12h">{t("Every 12 Hours", "Každých 12 hodin")}</option>
                <option value="1d">{t("Every 24 Hours", "Každých 24 hodin")}</option>
              </select>
            </div>
          )}

          <div>
            <label className="label">{t("Custom JSON Payload (optional)", "Vlastní tělo JSON (volitelné)")}</label>
            <textarea 
              className="input font-mono text-sm" 
              rows="4" 
              value={payload} 
              onChange={e => setPayload(e.target.value)} 
              placeholder='E.g.: {"content": "Account: ${account}, Data: ${total_gb} GB"}'
            ></textarea>
            <p className="text-xs text-[var(--color-text-muted)] mt-2">{t("Available variables:", "Dostupné proměnné:")} {'${account}'}, {'${paid_gb}'}, {'${unpaid_gb}'}, {'${total_gb}'}, {'${update_time}'}</p>
          </div>
          <button type="submit" className="btn btn-primary">{t("Add Webhook", "Přidat webhook")}</button>
        </form>
      </div>

      <div className="card">
        <h2 className="text-xl font-bold mb-4">{t("Current Webhooks", "Aktuální webhooky")}</h2>
        <div className="space-y-4">
          {webhooks.map(hook => (
            <div key={hook.id} className="p-4 border border-[var(--color-border)] rounded-lg bg-[#0f172a]">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{hook.url}</div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${hook.on_payment ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-500'}`}>{t("Payment", "Platby")}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${hook.on_change ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-500'}`}>{t("Change", "Změna")}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${hook.on_summary ? 'bg-purple-500/20 text-purple-400' : 'bg-gray-500/20 text-gray-500'}`}>{t("Summary", "Souhrn")} ({hook.summary_interval})</span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button className="btn btn-danger text-sm" onClick={() => handleRemove(hook.id)}>{t("Delete", "Smazat")}</button>
                </div>
              </div>
              <pre className="bg-black/50 p-3 rounded text-xs text-[var(--color-text-muted)] overflow-x-auto mb-2">
                {hook.payload || t('Default Discord Embed Payload', 'Výchozí struktura Discord zprávy')}
              </pre>
              {hook.last_summary_at && (
                <div className="text-[10px] text-[var(--color-text-muted)]">{t("Last summary sent: ", "Poslední odeslaný souhrn: ")}{new Date(hook.last_summary_at).toLocaleString()}</div>
              )}
            </div>
          ))}
          {webhooks.length === 0 && (
            <p className="text-[var(--color-text-muted)]">{t("No webhooks configured yet.", "Zatím nejsou nakonfigurovány žádné webhooky.")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
