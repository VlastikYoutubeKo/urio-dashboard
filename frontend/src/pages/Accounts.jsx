import { useCallback, useEffect, useState } from 'react';
import { apiJson, errorMessage } from '../lib/api';

export default function Accounts({ lang = 'cs' }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actingId, setActingId] = useState(null);
  const isCs = lang === 'cs';
  const t = useCallback((en, cs) => (isCs ? cs : en), [isCs]);

  const fetchAccounts = useCallback(async () => {
    try {
      const data = await apiJson('/api/accounts');
      setAccounts(data);
      setError('');
    } catch (requestError) {
      setError(errorMessage(requestError, t('Could not load accounts.', 'Účty se nepodařilo načíst.')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timeout = window.setTimeout(() => { void fetchAccounts(); }, 0);
    return () => window.clearTimeout(timeout);
  }, [fetchAccounts]);

  const handleAdd = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      await apiJson('/api/accounts/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, nickname }),
      });
      setSuccess(t('Account added and credentials verified.', 'Účet byl přidán a přihlašovací údaje ověřeny.'));
      setUsername('');
      setPassword('');
      setNickname('');
      await fetchAccounts();
    } catch (requestError) {
      setError(errorMessage(requestError, t('Could not add account.', 'Účet se nepodařilo přidat.')));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (id) => {
    setActingId(id);
    setError('');
    try {
      await apiJson(`/api/accounts/toggle/${id}`, { method: 'POST' });
      await fetchAccounts();
    } catch (requestError) {
      setError(errorMessage(requestError, t('Could not update account.', 'Účet se nepodařilo upravit.')));
    } finally {
      setActingId(null);
    }
  };

  const handleRemove = async (id) => {
    if (!window.confirm(t('Remove this account and all of its local statistics?', 'Odebrat tento účet a všechny jeho lokální statistiky?'))) return;
    setActingId(id);
    setError('');
    try {
      await apiJson(`/api/accounts/remove/${id}`, { method: 'POST' });
      setSuccess(t('Account removed.', 'Účet byl odebrán.'));
      await fetchAccounts();
    } catch (requestError) {
      setError(errorMessage(requestError, t('Could not remove account.', 'Účet se nepodařilo odebrat.')));
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">{t('Account Management', 'Správa účtů')}</h1>
        <p className="text-sm text-[#888] mt-1">{t('URnetwork passwords are encrypted locally before they are stored.', 'Hesla k URnetwork se před uložením lokálně šifrují.')}</p>
      </div>
      <div className="card">
        <h2 className="text-xl font-bold mb-4">{t('Add New Account', 'Přidat nový účet')}</h2>
        {error && <div role="alert" className="bg-red-500/10 border-l-4 border-red-500 p-4 mb-4 text-red-400">{error}</div>}
        {success && <div role="status" className="bg-emerald-500/10 border-l-4 border-emerald-500 p-4 mb-4 text-emerald-400">{success}</div>}
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="account-username">{t('URnetwork Username (Email/Phone)', 'Uživatelské jméno URnetwork (e-mail/telefon)')}</label>
              <input id="account-username" type="text" autoComplete="username" className="input" value={username} onChange={(event) => setUsername(event.target.value)} required maxLength="100" />
            </div>
            <div>
              <label className="label" htmlFor="account-password">{t('URnetwork Password', 'Heslo k URnetwork')}</label>
              <input id="account-password" type="password" autoComplete="current-password" className="input" value={password} onChange={(event) => setPassword(event.target.value)} required maxLength="1024" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="account-nickname">{t('Nickname (optional)', 'Přezdívka (volitelné)')}</label>
            <input id="account-nickname" type="text" className="input" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength="100" placeholder={t('e.g. Home Network', 'např. Domácí síť')} />
          </div>
          <button type="submit" disabled={submitting} className="btn btn-success disabled:opacity-60">{submitting ? t('Verifying…', 'Ověřuji…') : t('Add Account', 'Přidat účet')}</button>
        </form>
      </div>

      <div className="card">
        <h2 className="text-xl font-bold mb-4">{t('Current Accounts', 'Aktuální účty')}</h2>
        {loading ? <p className="text-[#888]">{t('Loading…', 'Načítání…')}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)] text-sm uppercase tracking-wider"><th className="py-3 px-4">{t('Nickname', 'Přezdívka')}</th><th className="py-3 px-4">{t('Username', 'Uživatelské jméno')}</th><th className="py-3 px-4">{t('Status', 'Stav')}</th><th className="py-3 px-4">{t('Actions', 'Akce')}</th></tr></thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id} className="border-b border-[var(--color-border)] hover:bg-[#1e2124] transition-colors">
                    <td className="py-3 px-4"><span className="px-3 py-1 rounded-md text-sm font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">{account.nickname || account.username}</span></td>
                    <td className="py-3 px-4">{account.username}</td>
                    <td className="py-3 px-4"><span className={`font-medium ${account.is_active ? 'text-emerald-400' : 'text-red-400'}`}>{account.is_active ? t('Active', 'Aktivní') : t('Inactive', 'Neaktivní')}</span></td>
                    <td className="py-3 px-4 space-x-2 whitespace-nowrap">
                      <button type="button" disabled={actingId === account.id} className="btn btn-secondary text-xs inline-flex disabled:opacity-60" onClick={() => void handleToggle(account.id)}>{t('Toggle', 'Přepnout')}</button>
                      <button type="button" disabled={actingId === account.id} className="btn btn-danger text-xs inline-flex disabled:opacity-60" onClick={() => void handleRemove(account.id)}>{t('Remove', 'Odebrat')}</button>
                    </td>
                  </tr>
                ))}
                {accounts.length === 0 && <tr><td colSpan="4" className="py-6 text-center text-[var(--color-text-muted)]">{t('No accounts added yet.', 'Zatím nebyly přidány žádné účty.')}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
