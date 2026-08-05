import { Resend } from 'resend';

export function getResend(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY not configured');
  return new Resend(apiKey);
}

// Sandbox sender until volteq.io is verified with Resend — works immediately
// with no DNS setup, but Resend's sandbox domain only reliably delivers to
// the Resend account owner's own address. Swap to a verified volteq.io
// sender (e.g. feedback@volteq.io) once that domain is added and verified
// in the Resend dashboard.
export const FEEDBACK_FROM_ADDRESS = 'Volteq Feedback <onboarding@resend.dev>';
export const FEEDBACK_TO_ADDRESS = 'support@volteq.io';
