export type ThemeMode = 'light' | 'dark';

export interface ThemeState {
  mode: ThemeMode;
  accentHex: string;
}

export const DEFAULT_ACCENT = '#5DCAA5'; // Voltaic teal 200
const STORAGE_KEY = 'ec-theme';

export const HEX_PATTERN = /^#(?:[0-9a-fA-F]{3}){1,2}$/;

interface Hsl { h: number; s: number; l: number }

function hexToHsl(hex: string): Hsl {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(ch => ch + ch).join('');
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
    case g: h = ((b - r) / d + 2) / 6; break;
    default: h = ((r - g) / d + 4) / 6;
  }
  return { h: h * 360, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Derives a contrast-appropriate variant of the user's accent colour for a
 *  given background: the colour as-given reads well on dark surfaces (it's
 *  presumably chosen to "pop"), but usually needs darkening for legible text/
 *  border contrast against a white page — mirroring the brand guide's own
 *  note that a darker stop (teal 600) is used for light-background headings. */
export function deriveAccentOnDark(baseHex: string): string {
  return baseHex;
}

export function deriveAccentOnLight(baseHex: string): string {
  const { h, s } = hexToHsl(baseHex);
  return hslToHex(h, Math.min(s, 0.75), 0.32);
}

export function isValidHex(hex: string): boolean {
  return HEX_PATTERN.test(hex);
}

export function loadTheme(): ThemeState {
  if (typeof window === 'undefined') return { mode: 'dark', accentHex: DEFAULT_ACCENT };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { mode: 'dark', accentHex: DEFAULT_ACCENT };
    const parsed = JSON.parse(raw);
    return {
      mode: parsed.mode === 'light' ? 'light' : 'dark',
      accentHex: isValidHex(parsed.accentHex) ? parsed.accentHex : DEFAULT_ACCENT,
    };
  } catch {
    return { mode: 'dark', accentHex: DEFAULT_ACCENT };
  }
}

export function saveTheme(state: ThemeState): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function applyTheme(state: ThemeState): void {
  const root = document.documentElement;
  root.dataset.theme = state.mode;
  root.style.setProperty('--accent-on-dark', deriveAccentOnDark(state.accentHex));
  root.style.setProperty('--accent-on-light', deriveAccentOnLight(state.accentHex));
}
