import { useCallback, useEffect, useState } from 'react';
import { apiJson, errorMessage } from '../lib/api';

const emptyPrivacy = {
  public_dashboard_enabled: false,
  public_dashboard_show_financials: false,
  auto_remove_offline_devices: false,
  stats_retention_days: 90,
  provider_stats_retention_days: 90,
};

function PrivacyToggle({ checked, onChange, label, description, disabled = false }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className="w-full flex items-center justify-between gap-5 p-4 border border-[#333] rounded-lg bg-[#111] text-left disabled:opacity-60">
      <span><span className="block font-medium">{label}</span><span className="block text-sm text-[#888] mt-1">{description}</span></span>
      <span className={`shrink-0 w-12 h-6 rounded-full transition-colors relative ${checked ? 'bg-[#0070f3]' : 'bg-[#333]'}`}><span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${checked ? 'left-7' : 'left-1'}`} /></span>
    </button>
  );
}

export default function SettingsPage({ lang = 'cs' }) {
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState('');
  const [payload, setPayload] = useState('');
  const [onPayment, setOnPayment] = useState(true);
  const [onChange, setOnChange] = useState(false);
  const [onSummary, setOnSummary] = useState(true);
  const [summaryInterval, setSummaryInterval] = useState('1h');
  const [privacy, setPrivacy] = useState(emptyPrivacy);
  const [health, setHealth] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actingWebhook, setActingWebhook] = useState(null);
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const isCs = lang === 'cs';
  const t = useCallback((en, cs) => (isCs ? cs : en), [isCs]);

  const loadSettings = useCallback(async () => {
    try {
      const [hooks, nextPrivacy, nextHealth] = await Promise.all([
        apiJson('/api/webhooks'),
        apiJson('/api/settings/privacy'),
        apiJson('/api/settings/health'),
      ]);
      setWebhooks(hooks);
      setPrivacy(nextPrivacy);
      setHealth(nextHealth);
      setError('');
    } catch (requestError) {
      setError(errorMessage(requestError, t('Could not load settings.', 'Nastavení se nepodařilo načíst.')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timeout = window.setTimeout(() => { void loadSettings(); }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadSettings]);

  const handleAdd = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      await apiJson('/api/webhooks/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, payload, on_payment: onPayment, on_change: onChange, on_summary: onSummary, summary_interval: summaryInterval }),
      });
      setSuccess(t('Webhook added successfully.', 'Webhook byl úspěšně přidán.'));
      setUrl('');
      setPayload('');
      await loadSettings();
    } catch (requestError) {
      setError(errorMessage(requestError, t('Could not add webhook.', 'Webhook se nepodařilo přidat.')));
    } finally {
      setSubmitting(false);
    }
  };

  const handleTest = async (id) => {
    setActingWebhook(id);
    setError('');
    try {
      await apiJson(`/api/webhooks/test/${id}`, { method: 'POST' });
      setSuccess(t('Test webhook delivered.', 'Testovací webhook byl doručen.'));
      await loadSettings();
    } catch (requestError) {
      setError(errorMessage(requestError, t('Webhook test failed.', 'Test webhooku selhal.')));
      await loadSettings();
    } finally {
      setActingWebhook(null);
    }
  };

  const handleRemove = async (id) => {
    if (!window.confirm(t('Remove this webhook?', 'Odebrat tento webhook?'))) return;
    setActingWebhook(id);
    setError('');
    try {
      await apiJson(`/api/webhooks/remove/${id}`, { method: 'POST' });
      setSuccess(t('Webhook removed.', 'Webhook byl odebrán.'));
      await loadSettings();
    } catch (requestError) {
      setError(errorMessage(requestError, t('Could not remove webhook.', 'Webhook se nepodařilo odebrat.')));
    } finally {
      setActingWebhook(null);
    }
  };

  const updatePrivacy = async (key, value) => {
    if (savingPrivacy) return;
    const previous = privacy;
    setSavingPrivacy(true);
    setError('');
    setPrivacy((current) => ({ ...current, [key]: value }));
    try {
      const next = await apiJson('/api/settings/privacy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
      setPrivacy(next);
      setSuccess(t('Privacy setting saved.', 'Nastavení soukromí bylo uloženo.'));
    } catch (requestError) {
      setPrivacy(previous);
      setError(errorMessage(requestError, t('Could not save privacy setting.', 'Nastavení soukromí se nepodařilo uložit.')));
    } finally {
      setSavingPrivacy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div><h1 className="text-2xl font-bold">{t('Settings', 'Nastavení')}</h1><p className="text-sm text-[#888] mt-1">{t('Manage delivery, privacy and dashboard health.', 'Spravujte doručování, soukromí a stav dashboardu.')}</p></div>
      {error && <div role="alert" className="bg-red-500/10 border-l-4 border-red-500 p-4 text-red-400">{error}</div>}
      {success && <div role="status" className="bg-emerald-500/10 border-l-4 border-emerald-500 p-4 text-emerald-400">{success}</div>}

      <section className="card space-y-5">
        <div><h2 className="text-xl font-bold">{t('Public Dashboard Privacy', 'Soukromí veřejného dashboardu')}</h2><p className="text-sm text-[#888] mt-1">{t('Public access is disabled by default. Per-account names and charts are never exposed.', 'Veřejný přístup je ve výchozím stavu vypnutý. Názvy ani grafy jednotlivých účtů se nikdy nezveřejňují.')}</p></div>
        <PrivacyToggle checked={privacy.public_dashboard_enabled} disabled={savingPrivacy} onChange={(value) => void updatePrivacy('public_dashboard_enabled', value)} label={t('Enable the public dashboard', 'Povolit veřejný dashboard')} description={t('Visitors can view global provider information.', 'Návštěvníci mohou zobrazit globální informace o providerech.')} />
        <PrivacyToggle checked={privacy.public_dashboard_show_financials} disabled={savingPrivacy || !privacy.public_dashboard_enabled} onChange={(value) => void updatePrivacy('public_dashboard_show_financials', value)} label={t('Show aggregate financial metrics', 'Zobrazit souhrnné finanční metriky')} description={t('Shares only combined totals; no account names or account-level history.', 'Zveřejní pouze souhrnné hodnoty; nikdy názvy ani historii jednotlivých účtů.')} />
      </section>

      <section className="card">
        <h2 className="text-xl font-bold mb-2">{t('Webhook Management', 'Správa webhooků')}</h2>
        <p className="text-sm text-[#888] mb-6">{t('For safety, webhook delivery is limited to HTTPS Discord-compatible endpoints. Tokens are redacted after saving.', 'Z bezpečnostních důvodů je doručování omezeno na HTTPS endpointy kompatibilní s Discordem. Tokeny se po uložení skryjí.')}</p>
        <form onSubmit={handleAdd} className="space-y-4">
          <div><label className="label" htmlFor="webhook-url">{t('Discord Webhook URL', 'Discord Webhook URL')}</label><input id="webhook-url" type="url" className="input" value={url} onChange={(event) => setUrl(event.target.value)} required placeholder="https://discord.com/api/webhooks/..." /></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-black/20 rounded-lg">
            <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={onPayment} onChange={(event) => setOnPayment(event.target.checked)} /><span>{t('Payment alerts', 'Upozornění na platby')}</span></label>
            <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={onChange} onChange={(event) => setOnChange(event.target.checked)} /><span>{t('Balance changes', 'Změny zůstatku')}</span></label>
            <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={onSummary} onChange={(event) => setOnSummary(event.target.checked)} /><span>{t('Periodic summaries', 'Pravidelné souhrny')}</span></label>
          </div>
          {onSummary && <div><label className="label" htmlFor="summary-interval">{t('Summary Interval', 'Interval souhrnu')}</label><select id="summary-interval" className="input" value={summaryInterval} onChange={(event) => setSummaryInterval(event.target.value)}><option value="30m">{t('Every 30 minutes', 'Každých 30 minut')}</option><option value="1h">{t('Every hour', 'Každou hodinu')}</option><option value="12h">{t('Every 12 hours', 'Každých 12 hodin')}</option><option value="1d">{t('Every 24 hours', 'Každých 24 hodin')}</option></select></div>}
          <div><label className="label" htmlFor="webhook-payload">{t('Custom JSON Payload (optional)', 'Vlastní JSON payload (volitelné)')}</label><textarea id="webhook-payload" className="input font-mono text-sm" rows="4" value={payload} onChange={(event) => setPayload(event.target.value)} placeholder={'{"content":"Account: ${account}, Data: ${total_gb} GB"}'} /><p className="text-xs text-[#888] mt-2">{t('Available variables:', 'Dostupné proměnné:')} <code>${'{account}'}</code>, <code>${'{paid_gb}'}</code>, <code>${'{unpaid_gb}'}</code>, <code>${'{total_gb}'}</code>, <code>${'{update_time}'}</code></p></div>
          <button type="submit" disabled={submitting} className="btn btn-primary disabled:opacity-60">{submitting ? t('Saving…', 'Ukládám…') : t('Add Webhook', 'Přidat webhook')}</button>
        </form>
      </section>

      <section className="card"><h2 className="text-xl font-bold mb-4">{t('Current Webhooks', 'Aktuální webhooky')}</h2>{loading ? <p className="text-[#888]">{t('Loading…', 'Načítání…')}</p> : <div className="space-y-4">{webhooks.map((hook) => <div key={hook.id} className="p-4 border border-[var(--color-border)] rounded-lg bg-[#0f172a]"><div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4"><div className="flex-1 min-w-0"><div className="font-medium truncate">{hook.display_url}</div><div className="flex flex-wrap gap-2 mt-2"><span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${hook.on_payment ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-500'}`}>{t('Payment', 'Platby')}</span><span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${hook.on_change ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-500'}`}>{t('Change', 'Změna')}</span><span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${hook.on_summary ? 'bg-purple-500/20 text-purple-400' : 'bg-gray-500/20 text-gray-500'}`}>{t('Summary', 'Souhrn')} ({hook.summary_interval})</span></div></div><div className="flex gap-2 shrink-0"><button type="button" disabled={actingWebhook === hook.id} className="btn btn-secondary text-sm" onClick={() => void handleTest(hook.id)}>{t('Send test', 'Odeslat test')}</button><button type="button" disabled={actingWebhook === hook.id} className="btn btn-danger text-sm" onClick={() => void handleRemove(hook.id)}>{t('Delete', 'Smazat')}</button></div></div><pre className="bg-black/50 p-3 rounded text-xs text-[var(--color-text-muted)] overflow-x-auto mb-2">{hook.payload || t('Default Discord Embed Payload', 'Výchozí Discord Embed payload')}</pre>{hook.last_delivery_error && <p className="text-xs text-red-400 mb-2">{t('Last delivery error:', 'Poslední chyba doručení:')} {hook.last_delivery_error}</p>}{hook.last_delivery_at && <p className="text-[10px] text-[var(--color-text-muted)]">{t('Last delivery:', 'Poslední doručení:')} {new Date(hook.last_delivery_at).toLocaleString()}</p>}{hook.last_summary_at && <p className="text-[10px] text-[var(--color-text-muted)]">{t('Last summary:', 'Poslední souhrn:')} {new Date(hook.last_summary_at).toLocaleString()}</p>}</div>)}{webhooks.length === 0 && <p className="text-[var(--color-text-muted)]">{t('No webhooks configured yet.', 'Zatím nejsou nakonfigurovány žádné webhooky.')}</p>}</div>}</section>

      <section className="card"><h2 className="text-xl font-bold mb-4">{t('Health & retention', 'Stav a retence')}</h2>{health ? <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm"><div className="p-4 bg-[#111] rounded-lg"><span className="text-[#888] block">{t('Scheduler', 'Scheduler')}</span><strong className={health.scheduler_enabled ? 'text-emerald-400' : 'text-yellow-400'}>{health.scheduler_enabled ? t('Enabled', 'Zapnutý') : t('Disabled', 'Vypnutý')}</strong></div><div className="p-4 bg-[#111] rounded-lg"><span className="text-[#888] block">{t('Active accounts', 'Aktivní účty')}</span><strong>{health.active_accounts}</strong></div><div className="p-4 bg-[#111] rounded-lg"><span className="text-[#888] block">{t('Latest account snapshot', 'Poslední snapshot účtu')}</span><strong>{health.latest_account_snapshot ? new Date(health.latest_account_snapshot).toLocaleString() : '—'}</strong></div><div className="p-4 bg-[#111] rounded-lg"><span className="text-[#888] block">{t('Latest provider snapshot', 'Poslední snapshot providerů')}</span><strong>{health.latest_provider_snapshot ? new Date(health.latest_provider_snapshot).toLocaleString() : '—'}</strong></div></div> : <p className="text-[#888]">{t('Health information is unavailable.', 'Informace o stavu nejsou dostupné.')}</p>}<p className="text-xs text-[#888] mt-5">{t(`Account history is retained for ${privacy.stats_retention_days} days; provider history for ${privacy.provider_stats_retention_days} days. Automatic deletion of offline devices is ${privacy.auto_remove_offline_devices ? 'enabled' : 'disabled'} and can only be changed through server configuration.`, `Historie účtů se uchovává ${privacy.stats_retention_days} dní; historie providerů ${privacy.provider_stats_retention_days} dní. Automatické mazání offline zařízení je ${privacy.auto_remove_offline_devices ? 'zapnuté' : 'vypnuté'} a lze jej změnit pouze v konfiguraci serveru.`)}</p></section>
    </div>
  );
}
