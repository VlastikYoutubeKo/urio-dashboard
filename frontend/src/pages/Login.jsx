import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiJson, errorMessage } from '../lib/api';

export default function Login({ onLogin, lang = 'cs' }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const isCs = lang === 'cs';
  const t = (en, cs) => (isCs ? cs : en);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await apiJson('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      setPassword('');
      await onLogin();
      navigate('/dashboard', { replace: true });
    } catch (requestError) {
      setError(errorMessage(requestError, t('Login failed.', 'Přihlášení se nezdařilo.')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-20 card">
      <h1 className="text-2xl font-bold mb-2">{t('Login', 'Přihlášení')}</h1>
      <p className="text-[var(--color-text-muted)] mb-6">{t('Sign in to manage your private dashboard.', 'Přihlaste se pro správu soukromého dashboardu.')}</p>
      {error && <div role="alert" className="bg-red-500/10 border-l-4 border-red-500 p-4 mb-6 text-red-400">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="login-password">{t('Admin Password', 'Heslo administrátora')}</label>
          <input id="login-password" type="password" autoComplete="current-password" className="input" value={password} onChange={(event) => setPassword(event.target.value)} required placeholder={t('Password', 'Heslo')} />
        </div>
        <button type="submit" disabled={submitting} className="btn btn-primary w-full mt-4 disabled:opacity-60">
          {submitting ? t('Signing in…', 'Přihlašuji…') : t('Sign In', 'Přihlásit se')}
        </button>
      </form>
    </div>
  );
}
