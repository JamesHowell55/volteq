import { getResend, FEEDBACK_FROM_ADDRESS, FEEDBACK_TO_ADDRESS } from './_lib/resendClient.js';
import type { VercelRequest, VercelResponse } from './_lib/types.js';

interface FeedbackBody {
  email?: string;
  summary?: string;
  pageUrl?: string;
  pageTitle?: string;
  replicateUrl?: string;
  screenshotDataUrl?: string;
  userAgent?: string;
  // Hidden honeypot field — real users never fill this in (it's visually hidden),
  // so a non-empty value marks the submission as almost certainly a bot.
  website?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Data-URL string length cap (base64 is ~4/3 of raw bytes), generous headroom
// under Resend's 40MB/email attachment limit — this is really just to keep
// the serverless function's own request body reasonable.
const MAX_SCREENSHOT_DATA_URL_LEN = 6_000_000;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = req.body as FeedbackBody | undefined;

    // Honeypot tripped: pretend success so a bot doesn't learn to adapt, but send nothing.
    if (body?.website) {
      res.status(200).json({ ok: true });
      return;
    }

    const email = (body?.email ?? '').trim();
    const summary = (body?.summary ?? '').trim();
    const pageUrl = (body?.pageUrl ?? '').trim();

    if (!EMAIL_RE.test(email)) {
      res.status(400).json({ error: 'A valid email address is required.' });
      return;
    }
    if (summary.length < 3) {
      res.status(400).json({ error: 'Please describe the issue.' });
      return;
    }

    const attachments: { filename: string; content: string; contentType: string }[] = [];
    const screenshotDataUrl = body?.screenshotDataUrl;
    if (screenshotDataUrl) {
      if (screenshotDataUrl.length > MAX_SCREENSHOT_DATA_URL_LEN) {
        res.status(400).json({ error: 'Screenshot is too large.' });
        return;
      }
      const match = /^data:(image\/\w+);base64,(.+)$/.exec(screenshotDataUrl);
      if (match) {
        const [, contentType, base64] = match;
        const ext = contentType.split('/')[1] ?? 'png';
        attachments.push({ filename: `screenshot.${ext}`, content: base64, contentType });
      }
    }

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; color:#14170F;">
        <p><b>From:</b> ${escapeHtml(email)}</p>
        <p><b>Page:</b> <a href="${escapeHtml(pageUrl)}">${escapeHtml(body?.pageTitle || pageUrl)}</a></p>
        ${body?.replicateUrl ? `<p><b>Open this exact calculation:</b> <a href="${escapeHtml(body.replicateUrl)}">${escapeHtml(body.replicateUrl)}</a></p>` : ''}
        <p><b>Summary:</b></p>
        <p style="white-space:pre-wrap; background:#F5F6F4; border-radius:6px; padding:10px;">${escapeHtml(summary)}</p>
        ${body?.userAgent ? `<p style="color:#797D74; font-size:11px;">User agent: ${escapeHtml(body.userAgent)}</p>` : ''}
      </div>`;

    const resend = getResend();
    const { error } = await resend.emails.send({
      from: FEEDBACK_FROM_ADDRESS,
      to: FEEDBACK_TO_ADDRESS,
      replyTo: email,
      subject: `Feedback: ${body?.pageTitle || pageUrl || 'Volteq'}`,
      html,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    if (error) {
      console.error('feedback: resend send failed:', error);
      res.status(502).json({ error: error.message || 'Failed to send feedback email' });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('feedback failed:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown server error' });
  }
}
