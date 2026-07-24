import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useEntitlement, type Plan } from '../lib/useEntitlement';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';

const PLAN_LABELS: Record<Plan, string> = {
  free: 'Free',
  premium_subscription: 'Premium (subscription)',
  premium_lifetime: 'Premium (lifetime)',
};

async function callApi(path: string, body: unknown): Promise<{ url?: string; error?: string }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return res.json();
}

function AuthForm() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signIn' | 'signUp' | 'forgotPassword'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signedUpMessage, setSignedUpMessage] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    if (mode === 'forgotPassword') {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setBusy(false);
      if (err) { setError(err.message); return; }
      setResetSent(true);
      return;
    }
    const result = mode === 'signIn' ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (mode === 'signUp') setSignedUpMessage(true);
  };

  return (
    <div className="card" style={{ maxWidth: 420 }}>
      <div className="card-title">{mode === 'signIn' ? 'Log in' : mode === 'signUp' ? 'Create an account' : 'Reset password'}</div>
      {signedUpMessage ? (
        <p className="note">Check your email for a confirmation link from Supabase, then log in. If you don't see it, check your spam folder.</p>
      ) : resetSent ? (
        <p className="note">Check your email for a password reset link from Supabase. If you don't see it, check your spam folder.</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Email</label>
            <input autoComplete="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {mode !== 'forgotPassword' && (
            <div className="field">
              <label>Password</label>
              <input autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'} type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          )}
          {error && <p className="note" style={{ color: 'var(--neg)' }}>{error}</p>}
          <button className="btn primary" type="submit" disabled={busy} style={{ width: '100%', marginTop: '0.5rem' }}>
            {busy ? 'Please wait…' : mode === 'signIn' ? 'Log in' : mode === 'signUp' ? 'Sign up' : 'Send reset link'}
          </button>
        </form>
      )}
      {mode === 'signIn' && !signedUpMessage && (
        <button className="btn small" style={{ marginTop: '0.5rem' }} onClick={() => { setMode('forgotPassword'); setError(null); }}>
          Forgot password?
        </button>
      )}
      <button className="btn small" style={{ marginTop: mode === 'signIn' && !signedUpMessage ? '0.25rem' : '0.75rem' }} onClick={() => { setMode(m => (m === 'signUp' ? 'signIn' : 'signUp')); setError(null); setSignedUpMessage(false); setResetSent(false); }}>
        {mode === 'signUp' ? 'Already have an account? Log in' : "Don't have an account? Sign up"}
      </button>
      <p className="hint" style={{ marginTop: '0.75rem', lineHeight: 1.5 }}>
        Authentication is managed securely by <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>Supabase</a>, an
        open-source platform with enterprise-grade security. Your password is never stored by Volteq — all
        credentials are handled directly by Supabase's authentication service. Confirmation emails will come
        from a Supabase address (noreply@mail.supabase.io).
      </p>
    </div>
  );
}

function BrandingSection() {
  const { user } = useAuth();
  const [companyName, setCompanyName] = useState('');
  const [accentHex, setAccentHex] = useState('#5DCAA5');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from('branding').select('company_name, logo_url, accent_hex').eq('user_id', user.id).maybeSingle().then(({ data }) => {
      if (data) {
        setCompanyName(data.company_name ?? '');
        setAccentHex(data.accent_hex ?? '#5DCAA5');
        setLogoUrl(data.logo_url ?? null);
      }
    });
  }, [user]);

  const handleLogoUpload = async (file: File) => {
    if (!user) return;
    setUploading(true);
    const path = `${user.id}/logo-${Date.now()}.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('branding-logos').upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from('branding-logos').getPublicUrl(path);
      setLogoUrl(data.publicUrl);
    }
    setUploading(false);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    await supabase.from('branding').upsert({ user_id: user.id, company_name: companyName, logo_url: logoUrl, accent_hex: accentHex, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="card">
      <div className="card-title">Report branding</div>
      <p className="note" style={{ marginBottom: '0.85rem' }}>Shown on exported PDF reports in place of the Volteq mark.</p>
      <div className="grid grid-2">
        <div className="field">
          <label>Company name</label>
          <input autoComplete="off" type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        </div>
        <div className="field">
          <label>Accent colour</label>
          <input autoComplete="off" type="color" value={accentHex} onChange={(e) => setAccentHex(e.target.value)} style={{ height: '2.4rem' }} />
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>Company logo</label>
          <input type="file" accept="image/*" disabled={uploading} onChange={(e) => e.target.files?.[0] && handleLogoUpload(e.target.files[0])} />
          {logoUrl && <img src={logoUrl} alt="Company logo" style={{ height: '2.5rem', marginTop: '0.5rem', display: 'block' }} />}
        </div>
      </div>
      <button className="btn primary" onClick={handleSave} disabled={saving} style={{ marginTop: '0.5rem' }}>
        {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save branding'}
      </button>
    </div>
  );
}

const CALCULATOR_META: Record<string, { label: string; path: string }> = {
  'busbar': { label: 'Busbar Calculator', path: '/busbar' },
  'skin-depth': { label: 'Skin Depth Calculator', path: '/skin-depth' },
  'creepage-clearance': { label: 'Creepage & Clearance', path: '/creepage-clearance' },
  'cable-wire-sizing': { label: 'Cable / Wire Sizing', path: '/cable-sizing' },
  'battery-pack': { label: 'Battery Pack Series-Parallel', path: '/battery-pack-series-parallel' },
  'motor-torque-power-speed': { label: 'Motor Torque / Power / Speed', path: '/speed-torque-power' },
  'bundle-diameter': { label: 'Bundle Diameter', path: '/harness-bundle-diameter' },
  'bolted-joint': { label: 'Bolted Joint (VDI 2230)', path: '/bolted-joint' },
  'bolt-pattern': { label: 'Bolt Pattern', path: '/bolt-pattern' },
  'choke-sizing': { label: 'Choke Sizing', path: '/choke-sizing' },
  'mosfet-loss': { label: 'MOSFET Loss Calculator', path: '/mosfet-loss' },
  'harness-designer': { label: 'Harness Designer', path: '/harness-designer' },
  'o-ring': { label: 'O-Ring Seal Calculator', path: '/o-ring' },
  'fits-and-limits': { label: 'Fits & Limits Calculator', path: '/fits-and-limits' },
  'mohrs-circle': { label: "Mohr's Circle Stresses", path: '/mohrs-circle' },
  'dq-current': { label: 'Id / Iq Current Vector', path: '/id-iq-current' },
  'dc-link': { label: 'DC-Link Capacitor Sizing', path: '/dc-link' },
};

interface SaveRow {
  id: string;
  calculator: string;
  label: string;
  created_at: string;
  updated_at: string;
}

function SavedCalculationsOverview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [saves, setSaves] = useState<SaveRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user || !isSupabaseConfigured) return;
    setLoading(true);
    const { data } = await supabase
      .from('saved_calculations')
      .select('id, calculator, label, created_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    setSaves((data as SaveRow[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleDelete = async (id: string) => {
    await supabase.from('saved_calculations').delete().eq('id', id);
    setSaves((s) => s.filter((r) => r.id !== id));
  };

  if (loading) return <div className="card"><div className="card-title">My saved calculations</div><p className="note">Loading…</p></div>;
  if (saves.length === 0) return <div className="card"><div className="card-title">My saved calculations</div><p className="note">No saved calculations yet. Use the save button on any calculator page to store your inputs for later.</p></div>;

  const grouped = new Map<string, SaveRow[]>();
  for (const s of saves) {
    const arr = grouped.get(s.calculator) ?? [];
    arr.push(s);
    grouped.set(s.calculator, arr);
  }

  return (
    <div className="card">
      <div className="card-title">My saved calculations</div>
      {[...grouped.entries()].map(([slug, rows]) => {
        const meta = CALCULATOR_META[slug] ?? { label: slug, path: '/' };
        return (
          <div key={slug} style={{ marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '0.85rem', margin: '0.5rem 0 0.4rem', opacity: 0.7 }}>{meta.label}</h3>
            <table className="data-table" style={{ width: '100%', fontSize: '0.8rem' }}>
              <thead><tr><th>Name</th><th>Last saved</th><th></th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.label}</td>
                    <td>{new Date(r.updated_at).toLocaleString()}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn small" onClick={() => navigate(`${meta.path}?load=${r.id}`)}>Open</button>
                      <button className="btn small" style={{ marginLeft: '0.4rem' }} onClick={() => handleDelete(r.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

export default function AccountPage() {
  const { user, signOut } = useAuth();
  const { plan, isPremium, currentPeriodEnd } = useEntitlement();
  const [busyPlan, setBusyPlan] = useState<string | null>(null);

  const handleUpgrade = async (choice: 'monthly' | 'annual' | 'lifetime') => {
    setBusyPlan(choice);
    const result = await callApi('/api/create-checkout-session', { plan: choice });
    setBusyPlan(null);
    if (result.url) window.location.href = result.url;
    else if (result.error) alert(result.error);
  };

  const handleManageBilling = async () => {
    setBusyPlan('portal');
    const result = await callApi('/api/create-portal-session', {});
    setBusyPlan(null);
    if (result.url) window.location.href = result.url;
    else if (result.error) alert(result.error);
  };

  if (!user) {
    return (
      <div className="page">
        <div className="page-header">
          <div className="eyebrow">● Account</div>
          <h1>Log in or sign up</h1>
          <p>Manage your Volteq account and premium features (PDF export, custom report branding, advanced calculation modes).</p>
        </div>
        <AuthForm />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="eyebrow">● Account</div>
        <h1>Account</h1>
        <p>{user.email}</p>
      </div>

      <div className="card">
        <div className="card-title">
          <span>Plan</span>
          <span className="tag" style={isPremium ? { background: 'rgba(52,211,153,0.12)', color: 'var(--pos)', borderColor: 'transparent' } : undefined}>{PLAN_LABELS[plan]}</span>
        </div>
        {plan === 'premium_subscription' && currentPeriodEnd && (
          <p className="note">Renews {new Date(currentPeriodEnd).toLocaleDateString()}</p>
        )}
        {!isPremium && (
          <div className="grid grid-3" style={{ marginTop: '0.75rem' }}>
            <button className="btn primary" disabled={busyPlan !== null} onClick={() => handleUpgrade('monthly')}>{busyPlan === 'monthly' ? '…' : 'Upgrade — Monthly'}</button>
            <button className="btn primary" disabled={busyPlan !== null} onClick={() => handleUpgrade('annual')}>{busyPlan === 'annual' ? '…' : 'Upgrade — Annual'}</button>
            <button className="btn primary" disabled={busyPlan !== null} onClick={() => handleUpgrade('lifetime')}>{busyPlan === 'lifetime' ? '…' : 'Upgrade — Lifetime'}</button>
          </div>
        )}
        {plan === 'premium_subscription' && (
          <button className="btn" style={{ marginTop: '0.75rem' }} disabled={busyPlan !== null} onClick={handleManageBilling}>
            {busyPlan === 'portal' ? '…' : 'Manage billing'}
          </button>
        )}
        <button className="btn small" style={{ marginTop: '0.75rem', marginLeft: plan === 'premium_subscription' ? '0.5rem' : 0 }} onClick={signOut}>Log out</button>
      </div>

      <SavedCalculationsOverview />

      {isPremium && <BrandingSection />}
    </div>
  );
}
