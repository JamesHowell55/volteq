import { getStripe } from './_lib/stripeClient.js';
import { getSupabaseAdmin, getUserIdFromRequest } from './_lib/supabaseAdmin.js';
import type { VercelRequest, VercelResponse } from './_lib/types.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: entitlementRow } = await supabaseAdmin
      .from('entitlements')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .maybeSingle();

    const customerId = entitlementRow?.stripe_customer_id as string | undefined;
    if (!customerId) {
      res.status(400).json({ error: 'No billing account found for this user yet' });
      return;
    }

    const origin = req.headers.origin ?? `https://${req.headers.host}`;
    const stripe = getStripe();
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/account`,
    });

    res.status(200).json({ url: portalSession.url });
  } catch (err) {
    console.error('create-portal-session failed:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown server error' });
  }
}
