import { createClient } from '@supabase/supabase-js';
import type { VercelRequest } from './types.js';

// Service-role client: bypasses row-level security. Only ever used inside
// serverless functions (never imported by client code) — this key must never
// reach the browser bundle.
export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not configured');
  return createClient(url, serviceRoleKey);
}

// Verifies the bearer token the frontend sends (the user's Supabase session
// access token) and returns the authenticated user id, or null if missing/invalid.
export async function getUserIdFromRequest(req: VercelRequest): Promise<string | null> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
  if (!token) return null;
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}
