import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiJson, errorMessage } from '../lib/api';

export default function Install({ onInstalled, lang = 'cs' }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const isCs = lang === 'cs';
  const t = (en, cs) => (isCs ? cs : en);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (password !== confirm) {
      setError(t("Passwords don't match.", 'Hesla se neshodují.'));
      return;
    }
    if (password.length < 12) {
      setError(t('Use at least 12 characters for the admin password.', 'Heslo administrátora musí mít alespoň 12 znaků.'));
      return;
    }

    setSubmitting(true);
    try {
      await apiJson('/api/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_pass: password }),
      });
      await onInstalled();
      navigate('/dashboard', { replace: true });
    } catch (requestError) {
      setError(errorMessage(requestError, t('Installation failed.', 'Instalace se nezdařila.')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-20 card">
      <h1 className="text-2xl font-bold mb-2">{t('Initial Setup', 'Výchozí nastavení')}</h1>
      <p className="text-[var(--color-text-muted)] mb-2">{t('Create a strong password for the local dashboard.', 'Vytvořte silné heslo pro lokální dashboard.')}</p>
      <p className="text-xs text-[#666] mb-6">{t('The password is stored as a secure hash. Your URnetwork credentials will be encrypted locally.', 'Heslo se uloží jako bezpečný hash. Přihlašovací údaje k URnetwork budou lokálně šifrovány.')}</p>
      {error && <div role="alert" className="bg-red-500/10 border-l-4 border-red-500 p-4 mb-6 text-red-400">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="admin-password">{t('Admin Password', 'Heslo administrátora')}</label>
          <input id="admin-password" type="password" autoComplete="new-password" className="input" value={password} onChange={(event) => setPassword(event.target.value)} required minLength="12" placeholder={t('At least 12 characters', 'Alespoň 12 znaků')} />
        </div>
        <div>
          <label className="label" htmlFor="admin-password-confirm">{t('Confirm Password', 'Potvrzení hesla')}</label>
          <input id="admin-password-confirm" type="password" autoComplete="new-password" className="input" value={confirm} onChange={(event) => setConfirm(event.target.value)} required minLength="12" placeholder={t('Repeat your password', 'Zopakujte heslo')} />
        </div>
        <button type="submit" disabled={submitting} className="btn btn-primary w-full mt-4 disabled:opacity-60">
          {submitting ? t('Installing…', 'Instaluji…') : t('Install Dashboard', 'Instalovat dashboard')}
        </button>
      </form>
    </div>
  );
}
