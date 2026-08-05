import { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { encodeShareState } from '../lib/shareLink';
import { captureScreenshot } from '../lib/feedbackScreenshot';
import { submitFeedback } from '../lib/feedback';
import { FeedbackIcon } from './icons';

interface Props {
  // Optional: when provided, a "replicate this" link (the same encoding the
  // Share button uses) is included in the feedback email so the exact inputs
  // that produced the issue can be reopened with one click.
  getInputs?: () => Record<string, unknown>;
}

type Phase = 'idle' | 'open' | 'submitting' | 'done' | 'error';

export default function FeedbackButton({ getInputs }: Props) {
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>('idle');
  const [email, setEmail] = useState('');
  const [summary, setSummary] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [website, setWebsite] = useState(''); // honeypot

  const [includeScreenshot, setIncludeScreenshot] = useState(true);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotState, setScreenshotState] = useState<'capturing' | 'ready' | 'failed'>('capturing');

  const open = () => {
    setEmail(user?.email ?? '');
    setSummary('');
    setErrorMsg('');
    setWebsite('');
    setIncludeScreenshot(true);
    setScreenshot(null);
    setScreenshotState('capturing');
    setPhase('open');
  };
  const close = () => setPhase('idle');

  useEffect(() => {
    if (phase !== 'open') return;
    let cancelled = false;
    // Small delay so the modal itself isn't in the captured frame.
    const timer = window.setTimeout(async () => {
      const dataUrl = await captureScreenshot();
      if (cancelled) return;
      setScreenshot(dataUrl);
      setScreenshotState(dataUrl ? 'ready' : 'failed');
    }, 120);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [phase]);

  const doSubmit = async () => {
    if (website) { setPhase('done'); return; } // honeypot tripped — pretend success, send nothing
    const trimmedEmail = email.trim();
    const trimmedSummary = summary.trim();
    if (!trimmedEmail || !trimmedSummary) {
      setErrorMsg('Please enter your email and describe the issue.');
      return;
    }
    setPhase('submitting');
    setErrorMsg('');
    const replicateUrl = getInputs
      ? (() => {
        const encoded = encodeShareState(getInputs());
        return encoded ? `${window.location.origin}${window.location.pathname}?share=${encoded}` : undefined;
      })()
      : undefined;
    const result = await submitFeedback({
      email: trimmedEmail,
      summary: trimmedSummary,
      pageUrl: window.location.href,
      pageTitle: document.title,
      replicateUrl,
      screenshotDataUrl: includeScreenshot ? screenshot : null,
      website,
    });
    if (!result.ok) {
      setErrorMsg(result.error || 'Something went wrong — please try again.');
      setPhase('error');
      return;
    }
    setPhase('done');
  };

  return (
    <>
      <button type="button" className="calc-action-btn" onClick={open} title="Send feedback" aria-label="Send feedback">
        <FeedbackIcon />
      </button>

      {phase !== 'idle' && (
        <div className="save-modal-backdrop" onClick={close} role="presentation">
          <div className="save-modal-panel card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            {phase === 'done' ? (
              <>
                <div className="card-title">✓ Thanks for the feedback</div>
                <p className="note">We've received it and will follow up by email if we need more details.</p>
                <div className="save-modal-actions">
                  <button className="btn primary" onClick={close}>Close</button>
                </div>
              </>
            ) : (
              <>
                <div className="card-title">Send feedback</div>
                <p className="note" style={{ marginTop: 0 }}>
                  Found a bug, or something confusing? Let us know — we'll see exactly what you saw, on this page,
                  with these inputs.
                </p>
                <div className="field">
                  <label>Your email</label>
                  <input
                    autoComplete="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="field" style={{ marginTop: '0.6rem' }}>
                  <label>What happened?</label>
                  <textarea
                    autoFocus
                    placeholder="What were you trying to do, and what went wrong?"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                  />
                </div>
                <div className="feedback-checkbox-row" style={{ marginTop: '0.6rem' }}>
                  <input
                    type="checkbox"
                    id="feedback-include-screenshot"
                    checked={includeScreenshot}
                    onChange={(e) => setIncludeScreenshot(e.target.checked)}
                  />
                  <label htmlFor="feedback-include-screenshot" style={{ margin: 0 }}>Include a screenshot of this page</label>
                </div>
                {includeScreenshot && (
                  <div className="feedback-screenshot-preview" style={{ marginTop: '0.5rem' }}>
                    {screenshotState === 'capturing' && <span className="status">Capturing screenshot…</span>}
                    {screenshotState === 'failed' && <span className="status">Couldn't capture a screenshot — feedback will be sent without one.</span>}
                    {screenshotState === 'ready' && screenshot && (
                      <>
                        <img src={screenshot} alt="Page screenshot preview" />
                        <span className="status">This is what we'll receive.</span>
                      </>
                    )}
                  </div>
                )}
                {/* Honeypot: visually hidden, real users never see or fill this in. */}
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  className="feedback-honeypot"
                  aria-hidden="true"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
                {errorMsg && <p className="note" style={{ color: 'var(--neg)' }}>{errorMsg}</p>}
                <div className="save-modal-actions">
                  <button className="btn" onClick={close}>Cancel</button>
                  <button className="btn primary" disabled={phase === 'submitting'} onClick={doSubmit}>
                    {phase === 'submitting' ? 'Sending…' : 'Send feedback'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
