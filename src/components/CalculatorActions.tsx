import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { useSavedCalculations } from '../lib/useSavedCalculations';
import { encodeShareState } from '../lib/shareLink';
import GatedIconButton from './GatedIconButton';
import FeedbackButton from './FeedbackButton';
import { ShareIcon, SaveIcon } from './icons';

// The icon action row on every calculator page: the (premium) Export PDF
// button passed in as children, a free "Share" button, and a "Save calculation"
// button. Saving opens a small modal to name the calculation, then confirms
// it was stored and is available in the Account section — replacing the old
// inline save box at the bottom of the page.

interface Props {
  saved: ReturnType<typeof useSavedCalculations>;
  getInputs: () => Record<string, unknown>;
  children?: ReactNode; // the Export PDF button (GatedIconButton)
}

type Phase = 'idle' | 'naming' | 'saving' | 'done' | 'error';
type SharePhase = 'idle' | 'copied' | 'too-large' | 'unsupported';

export default function CalculatorActions({ saved, getInputs, children }: Props) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('idle');
  const [label, setLabel] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [savedName, setSavedName] = useState('');
  const [sharePhase, setSharePhase] = useState<SharePhase>('idle');

  const open = () => { setLabel(''); setErrorMsg(''); setPhase('naming'); };
  const close = () => setPhase('idle');

  const doShare = async () => {
    const encoded = encodeShareState(getInputs());
    if (!encoded) { setSharePhase('too-large'); return; }
    const url = `${window.location.origin}${window.location.pathname}?share=${encoded}`;
    if (!navigator.clipboard) { setSharePhase('unsupported'); return; }
    try {
      await navigator.clipboard.writeText(url);
      setSharePhase('copied');
    } catch {
      setSharePhase('unsupported');
    }
  };

  const doSave = async () => {
    const name = label.trim();
    if (!name) return;
    setPhase('saving');
    const { error } = await saved.save(name, getInputs());
    if (error) { setErrorMsg(error); setPhase('error'); return; }
    setSavedName(name);
    setPhase('done');
  };

  return (
    <div className="calc-actions">
      {children}
      <button type="button" className="calc-action-btn" onClick={doShare} title="Share" aria-label="Share">
        <ShareIcon />
      </button>
      <FeedbackButton getInputs={getInputs} />
      <GatedIconButton label="Save calculation" icon={<SaveIcon />} onClick={open} />

      {sharePhase !== 'idle' && (
        <div className="save-modal-backdrop" onClick={() => setSharePhase('idle')} role="presentation">
          <div className="save-modal-panel card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            {sharePhase === 'copied' ? (
              <>
                <div className="card-title">✓ Link copied</div>
                <p className="note">Anyone can open it and see this calculation, exactly as it is now — no sign-in required.</p>
                <div className="save-modal-actions">
                  <button className="btn primary" onClick={() => setSharePhase('idle')}>Done</button>
                </div>
              </>
            ) : sharePhase === 'too-large' ? (
              <>
                <div className="card-title">Too large to share via link</div>
                <p className="note" style={{ color: 'var(--neg)' }}>This calculation has too much data to fit in a shareable link. Try “Save calculation” instead.</p>
                <div className="save-modal-actions">
                  <button className="btn primary" onClick={() => setSharePhase('idle')}>Close</button>
                </div>
              </>
            ) : (
              <>
                <div className="card-title">Couldn’t copy link</div>
                <p className="note" style={{ color: 'var(--neg)' }}>Clipboard access isn’t available in this browser. Copy the page URL from the address bar instead.</p>
                <div className="save-modal-actions">
                  <button className="btn primary" onClick={() => setSharePhase('idle')}>Close</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {phase !== 'idle' && (
        <div className="save-modal-backdrop" onClick={close} role="presentation">
          <div className="save-modal-panel card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            {!saved.loggedIn ? (
              <>
                <div className="card-title">Sign in to save</div>
                <p className="note">You need to be signed in to save calculations. Once signed in, your saves appear here and in your Account section.</p>
                <div className="save-modal-actions">
                  <button className="btn" onClick={close}>Cancel</button>
                  <button className="btn primary" onClick={() => { close(); navigate('/account'); }}>Go to sign in</button>
                </div>
              </>
            ) : phase === 'done' ? (
              <>
                <div className="card-title">✓ Calculation saved</div>
                <p className="note">
                  “{savedName}” has been saved. You can find it any time in your <b>Account</b> section, or reload it from
                  the <b>Saved calculations</b> panel further down this page.
                </p>
                <div className="save-modal-actions">
                  <button className="btn" onClick={close}>Done</button>
                  <button className="btn primary" onClick={() => { close(); navigate('/account'); }}>Go to Account</button>
                </div>
              </>
            ) : phase === 'error' ? (
              <>
                <div className="card-title">Couldn’t save</div>
                <p className="note" style={{ color: 'var(--neg)' }}>{errorMsg}</p>
                <p className="hint">If this mentions a missing table or permission, the Supabase database still needs the <code>saved_calculations</code> table and its policies.</p>
                <div className="save-modal-actions">
                  <button className="btn" onClick={close}>Close</button>
                  <button className="btn primary" onClick={() => setPhase('naming')}>Try again</button>
                </div>
              </>
            ) : (
              <>
                <div className="card-title">Save calculation</div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Name this calculation</label>
                  <input
                    autoFocus
                    autoComplete="off"
                    placeholder="e.g. 150 mm copper busbar, 1 kA"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') doSave(); if (e.key === 'Escape') close(); }}
                  />
                  <span className="hint">Stores the current inputs so you can reload them later.</span>
                </div>
                <div className="save-modal-actions">
                  <button className="btn" onClick={close}>Cancel</button>
                  <button className="btn primary" disabled={phase === 'saving' || !label.trim()} onClick={doSave}>
                    {phase === 'saving' ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
