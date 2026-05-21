import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function Login({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (res.ok) {
        onLogin();
        navigate('/dashboard');
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err) {
      setError('Network error');
    }
  };

  return (
    <div className="max-w-md mx-auto mt-20 card">
      <h1 className="text-2xl font-bold mb-2">Login</h1>
      <p className="text-[var(--color-text-muted)] mb-6">Sign in to your dashboard</p>
      
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
            placeholder="Password"
          />
        </div>
        <button type="submit" className="btn btn-primary w-full mt-4">Sign In</button>
      </form>
    </div>
  );
}
