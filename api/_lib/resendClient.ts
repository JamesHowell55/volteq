import { Resend } from 'resend';

export function getResend(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY not configured');
  return new Resend(apiKey);
}

// volteq.io verified with Resend 2026-08-05 (auto DNS config) — sending from
// the real domain now, confirmed working end-to-end with a live test send to
// support@volteq.io. If this domain ever loses verification, fall back to
// 'Volteq Feedback <onboarding@resend.dev>', which works with no DNS setup
// but only reliably delivers to the Resend account owner's own address.
export const FEEDBACK_FROM_ADDRESS = 'Volteq Feedback <feedback@volteq.io>';
export const FEEDBACK_TO_ADDRESS = 'support@volteq.io';
