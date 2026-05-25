import { useEffect, useState } from 'react';

export default function Accounts({ lang = 'cs' }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const isCs = lang === 'cs';
  const t = (en, cs) => isCs ? cs : en;

  const fetchAccounts = () => {
    fetch('/api/accounts')
      .then(res => res.json())
      .then(data => {
        setAccounts(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/accounts/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, nickname })
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(t('Account added successfully', 'Účet byl úspěšně přidán'));
        setUsername('');
        setPassword('');
        setNickname('');
        fetchAccounts();
      } else {
        setError(data.error || t('Failed to add account', 'Přidání účtu selhalo'));
      }
    } catch (err) {
      setError(t('Network error', 'Chyba sítě'));
    }
  };

  const handleToggle = async (id) => {
    await fetch(`/api/accounts/toggle/${id}`, { method: 'POST' });
    fetchAccounts();
  };

  const handleRemove = async (id) => {
    if (!confirm(t('Are you sure you want to remove this account? All associated stats will be deleted.', 'Opravdu chcete tento účet odebrat? Veškeré přidružené statistiky budou smazány.'))) return;
    await fetch(`/api/accounts/remove/${id}`, { method: 'POST' });
    fetchAccounts();
  };

  if (loading) return <div className="text-center py-20">{t("Loading...", "Načítání...")}</div>;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">{t("Account Management", "Správa účtů")}</h1>

      <div className="card">
        <h2 className="text-xl font-bold mb-4">{t("Add New Account", "Přidat nový účet")}</h2>
        {error && <div className="bg-red-500/10 border-l-4 border-red-500 p-4 mb-4 text-red-400">{error}</div>}
        {success && <div className="bg-emerald-500/10 border-l-4 border-emerald-500 p-4 mb-4 text-emerald-400">{success}</div>}
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">{t("UrNetwork Username (Email/Phone)", "UrNetwork uživatelské jméno (Email/Telefon)")}</label>
              <input type="text" className="input" value={username} onChange={e => setUsername(e.target.value)} required />
            </div>
            <div>
              <label className="label">{t("UrNetwork Password", "UrNetwork heslo")}</label>
              <input type="password" className="input" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
          </div>
          <div>
            <label className="label">{t("Nickname (Optional)", "Přezdívka (volitelné)")}</label>
            <input type="text" className="input" value={nickname} onChange={e => setNickname(e.target.value)} placeholder={t("e.g. Home Network", "např. Domácí síť")} />
          </div>
          <button type="submit" className="btn btn-success">{t("Add Account", "Přidat účet")}</button>
        </form>
      </div>

      <div className="card">
        <h2 className="text-xl font-bold mb-4">{t("Current Accounts", "Aktuální účty")}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)] text-sm uppercase tracking-wider">
                <th className="py-3 px-4">{t("Nickname", "Přezdívka")}</th>
                <th className="py-3 px-4">{t("Username", "Uživatelské jméno")}</th>
                <th className="py-3 px-4">{t("Status", "Stav")}</th>
                <th className="py-3 px-4">{t("Actions", "Akce")}</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map(acc => (
                <tr key={acc.id} className="border-b border-[var(--color-border)] hover:bg-[#1e2124] transition-colors">
                  <td className="py-3 px-4">
                    <span className="px-3 py-1 rounded-md text-sm font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      {acc.nickname || acc.username}
                    </span>
                  </td>
                  <td className="py-3 px-4">{acc.username}</td>
                  <td className="py-3 px-4">
                    <span className={`font-medium ${acc.is_active ? 'text-emerald-400' : 'text-red-400'}`}>
                      {acc.is_active ? t('Active', 'Aktivní') : t('Inactive', 'Neaktivní')}
                    </span>
                  </td>
                  <td className="py-3 px-4 space-x-2">
                    <button className="btn btn-secondary text-xs" onClick={() => handleToggle(acc.id)}>{t("Toggle", "Přepnout")}</button>
                    <button className="btn btn-danger text-xs" onClick={() => handleRemove(acc.id)}>{t("Remove", "Odebrat")}</button>
                  </td>
                </tr>
              ))}
              {accounts.length === 0 && (
                <tr>
                  <td colSpan="4" className="py-6 text-center text-[var(--color-text-muted)]">{t("No accounts added yet.", "Zatím nebyly přidány žádné účty.")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
