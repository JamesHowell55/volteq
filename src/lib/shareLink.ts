// Encodes a calculator's inputs directly into a URL query-string value so a
// link can reproduce the same calculation with no server round-trip and no
// sign-in (the "no-login shareable link" growth loop). Every calculator's
// getInputs() output is already plain JSON (it's stored as-is in Supabase's
// jsonb saved_calculations.inputs column), so JSON + base64 round-trips it
// exactly.

// Chat tools and some browsers choke on very long URLs; the only calculator
// whose encoded state can realistically get this large is Harness Designer
// with many connectors/pins, so we refuse to produce a link past this size
// rather than hand back something that breaks when pasted.
const MAX_SHARE_LEN = 6000;

export function encodeShareState(inputs: Record<string, unknown>): string | null {
  const encoded = encodeURIComponent(btoa(JSON.stringify(inputs)));
  return encoded.length > MAX_SHARE_LEN ? null : encoded;
}

export function decodeShareState(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(atob(decodeURIComponent(raw)));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}
