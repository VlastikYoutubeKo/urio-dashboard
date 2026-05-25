import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Install({ onInstalled, lang = 'cs' }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const isCs = lang === 'cs';
  const t = (en, cs) => isCs ? cs : en;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setError(t("Passwords don't match", "Hesla se neshodují"));
      return;
    }
    if (password.length < 6) {
      setError(t("Password must be at least 6 characters", "Heslo musí mít alespoň 6 znaků"));
      return;
    }

    try {
      const res = await fetch('/api/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_pass: password })
      });
      const data = await res.json();
      if (res.ok) {
        onInstalled();
        navigate('/dashboard');
      } else {
        setError(data.error || t('Failed to install', 'Instalace se nezdařila'));
      }
    } catch (err) {
      setError(t('Network error', 'Chyba sítě'));
    }
  };

  return (
    <div className="max-w-md mx-auto mt-20 card">
      <h1 className="text-2xl font-bold mb-2">{t("Initial Setup", "Výchozí nastavení")}</h1>
      <p className="text-[var(--color-text-muted)] mb-6">{t("Set an admin password for your dashboard.", "Nastavte heslo administrátora pro svůj přehled.")}</p>
      
      {error && <div className="bg-red-500/10 border-l-4 border-red-500 p-4 mb-6 text-red-400">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">{t("Admin Password", "Heslo administrátora")}</label>
          <input 
            type="password" 
            className="input" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder={t("Admin password", "Heslo administrátora")}
          />
        </div>
        <div>
          <label className="label">{t("Confirm Password", "Potvrzení hesla")}</label>
          <input 
            type="password" 
            className="input" 
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            placeholder={t("Confirm password", "Potvrzení hesla")}
          />
        </div>
        <button type="submit" className="btn btn-primary w-full mt-4">{t("Install Dashboard", "Instalovat přehled")}</button>
      </form>
    </div>
  );
}
