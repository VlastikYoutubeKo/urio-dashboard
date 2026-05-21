import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Install({ onInstalled }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
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
        setError(data.error || 'Failed to install');
      }
    } catch (err) {
      setError('Network error');
    }
  };

  return (
    <div className="max-w-md mx-auto mt-20 card">
      <h1 className="text-2xl font-bold mb-2">Initial Setup</h1>
      <p className="text-[var(--color-text-muted)] mb-6">Set an admin password for your dashboard.</p>
      
      {error && <div className="bg-red-500/10 border-l-4 border-red-500 p-4 mb-6 text-red-400">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Admin Password</label>
          <input 
            type="password" 
            className="input" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="Admin password"
          />
        </div>
        <div>
          <label className="label">Confirm Password</label>
          <input 
            type="password" 
            className="input" 
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            placeholder="Confirm password"
          />
        </div>
        <button type="submit" className="btn btn-primary w-full mt-4">Install Dashboard</button>
      </form>
    </div>
  );
}
