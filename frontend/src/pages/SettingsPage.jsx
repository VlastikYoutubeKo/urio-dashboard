import { useEffect, useState } from 'react';

export default function SettingsPage() {
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState('');
  const [payload, setPayload] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
        body: JSON.stringify({ url, payload })
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess('Webhook added successfully');
        setUrl('');
        setPayload('');
        fetchWebhooks();
      } else {
        setError(data.error || 'Failed to add webhook');
      }
    } catch (err) {
      setError('Network error');
    }
  };

  const handleRemove = async (id) => {
    if (!confirm('Remove this webhook?')) return;
    await fetch(`/api/webhooks/remove/${id}`, { method: 'POST' });
    fetchWebhooks();
  };

  if (loading) return <div className="text-center py-20">Loading...</div>;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="card">
        <h2 className="text-xl font-bold mb-2">Webhook Management</h2>
        <p className="text-[var(--color-text-muted)] mb-6">Add webhooks to send notifications when stats are fetched.</p>
        
        {error && <div className="bg-red-500/10 border-l-4 border-red-500 p-4 mb-4 text-red-400">{error}</div>}
        {success && <div className="bg-emerald-500/10 border-l-4 border-emerald-500 p-4 mb-4 text-emerald-400">{success}</div>}
        
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="label">Webhook URL</label>
            <input type="url" className="input" value={url} onChange={e => setUrl(e.target.value)} required />
          </div>
          <div>
            <label className="label">Custom JSON Payload (optional)</label>
            <textarea 
              className="input font-mono text-sm" 
              rows="4" 
              value={payload} 
              onChange={e => setPayload(e.target.value)} 
              placeholder='E.g.: {"content": "Account: ${account}, Data: ${total_gb} GB"}'
            ></textarea>
            <p className="text-xs text-[var(--color-text-muted)] mt-2">Available variables: ${'{account}'}, ${'{paid_gb}'}, ${'{unpaid_gb}'}, ${'{total_gb}'}, ${'{update_time}'}</p>
          </div>
          <button type="submit" className="btn btn-primary">Add Webhook</button>
        </form>
      </div>

      <div className="card">
        <h2 className="text-xl font-bold mb-4">Current Webhooks</h2>
        <div className="space-y-4">
          {webhooks.map(hook => (
            <div key={hook.id} className="p-4 border border-[var(--color-border)] rounded-lg bg-[#0f172a]">
              <div className="flex items-center justify-between mb-4">
                <div className="font-medium truncate mr-4">{hook.url}</div>
                <button className="btn btn-danger text-sm shrink-0" onClick={() => handleRemove(hook.id)}>Delete</button>
              </div>
              <pre className="bg-black/50 p-3 rounded text-xs text-[var(--color-text-muted)] overflow-x-auto">
                {hook.payload || 'Default Discord Embed Payload'}
              </pre>
            </div>
          ))}
          {webhooks.length === 0 && (
            <p className="text-[var(--color-text-muted)]">No webhooks configured yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
