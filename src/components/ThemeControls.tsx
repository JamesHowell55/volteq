import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { DEFAULT_ACCENT, isValidHex } from '../lib/theme';

export default function ThemeControls() {
  const { mode, accentHex, setMode, setAccentHex, resetAccent } = useTheme();
  const [open, setOpen] = useState(false);
  const [draftHex, setDraftHex] = useState(accentHex);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setDraftHex(accentHex), [accentHex]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const draftValid = isValidHex(draftHex);

  return (
    <div style={{ position: 'relative' }} ref={panelRef}>
      <button className="navbar-theme-btn" onClick={() => setOpen(v => !v)} aria-label="Theme settings">
        Theme
      </button>
      {open && (
        <div className="theme-panel">
          <div className="field">
            <label>Appearance</label>
            <div className="segmented">
              <button className={mode === 'dark' ? 'active' : ''} onClick={() => setMode('dark')}>Dark</button>
              <button className={mode === 'light' ? 'active' : ''} onClick={() => setMode('light')}>Light</button>
            </div>
          </div>
          <div className="field" style={{ marginTop: '0.85rem' }}>
            <label>Brand colour</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="color"
                value={draftValid ? draftHex : accentHex}
                onChange={e => { setDraftHex(e.target.value); setAccentHex(e.target.value); }}
                style={{ width: 36, height: 32, padding: 2 }}
              />
              <input
                autoComplete="off"
                type="text"
                value={draftHex}
                onChange={e => {
                  setDraftHex(e.target.value);
                  if (isValidHex(e.target.value)) setAccentHex(e.target.value);
                }}
                placeholder="#5DCAA5"
                style={{ fontFamily: 'var(--font-mono)' }}
              />
            </div>
            {!draftValid && <span className="hint" style={{ color: 'var(--neg)' }}>Enter a valid hex code, e.g. #5DCAA5</span>}
            <button className="btn small" style={{ marginTop: '0.6rem' }} onClick={resetAccent} disabled={accentHex === DEFAULT_ACCENT}>
              Reset to Volteq default
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
