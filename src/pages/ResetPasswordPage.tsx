import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setDone(true);
  };

  if (done) {
    return (
      <div className="page">
        <div className="page-header">
          <div className="eyebrow">● Account</div>
          <h1>Password updated</h1>
          <p>Your password has been changed successfully.</p>
        </div>
        <div className="card" style={{ maxWidth: 420 }}>
          <button className="btn primary" style={{ width: '100%' }} onClick={() => navigate('/account')}>Go to account</button>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="page">
        <div className="page-header">
          <div className="eyebrow">● Account</div>
          <h1>Reset password</h1>
          <p>Verifying your reset link…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="eyebrow">● Account</div>
        <h1>Set new password</h1>
        <p>Enter your new password below.</p>
      </div>
      <div className="card" style={{ maxWidth: 420 }}>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>New password</label>
            <input autoComplete="new-password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="field">
            <label>Confirm password</label>
            <input autoComplete="new-password" type="password" required minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {error && <p className="note" style={{ color: 'var(--neg)' }}>{error}</p>}
          <button className="btn primary" type="submit" disabled={busy} style={{ width: '100%', marginTop: '0.5rem' }}>
            {busy ? 'Please wait…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  );
}
