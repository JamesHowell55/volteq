export interface FeedbackSubmission {
  email: string;
  summary: string;
  pageUrl: string;
  pageTitle?: string;
  replicateUrl?: string;
  screenshotDataUrl?: string | null;
  website?: string; // honeypot — always left blank by real users
}

export async function submitFeedback(payload: FeedbackSubmission): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, userAgent: navigator.userAgent }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || 'Failed to send feedback.' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Network error — please check your connection and try again.' };
  }
}
