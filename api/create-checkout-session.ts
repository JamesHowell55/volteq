import { getStripe } from './_lib/stripeClient.js';
import { getSupabaseAdmin, getUserIdFromRequest } from './_lib/supabaseAdmin.js';
import type { VercelRequest, VercelResponse } from './_lib/types.js';

type PlanChoice = 'monthly' | 'annual' | 'lifetime';

// Never trust a client-supplied Stripe price ID directly — map a small closed
// enum to the real price IDs from server-only env vars.
function priceIdForPlan(plan: PlanChoice): string | undefined {
  if (plan === 'monthly') return process.env.STRIPE_PRICE_MONTHLY;
  if (plan === 'annual') return process.env.STRIPE_PRICE_ANNUAL;
  return process.env.STRIPE_PRICE_LIFETIME;
}

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

    const body = req.body as { plan?: PlanChoice } | undefined;
    const plan = body?.plan;
    if (plan !== 'monthly' && plan !== 'annual' && plan !== 'lifetime') {
      res.status(400).json({ error: 'plan must be one of monthly, annual, lifetime' });
      return;
    }

    const priceId = priceIdForPlan(plan);
    if (!priceId) {
      res.status(500).json({ error: `Stripe price for plan "${plan}" is not configured` });
      return;
    }

    const stripe = getStripe();
    const supabaseAdmin = getSupabaseAdmin();

    const { data: entitlementRow } = await supabaseAdmin
      .from('entitlements')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .maybeSingle();

    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = userData.user?.email;

    let customerId = entitlementRow?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({ email, metadata: { supabase_user_id: userId } });
      customerId = customer.id;
      await supabaseAdmin.from('entitlements').upsert({ user_id: userId, stripe_customer_id: customerId }, { onConflict: 'user_id' });
    }

    const origin = req.headers.origin ?? `https://${req.headers.host}`;
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: plan === 'lifetime' ? 'payment' : 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/account?checkout=success`,
      cancel_url: `${origin}/account?checkout=cancelled`,
      client_reference_id: userId,
      metadata: { supabase_user_id: userId, plan },
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    // Surface the real cause instead of an opaque platform 500 page — this is
    // the boundary where a missing/wrong env var, an invalid Stripe key, or a
    // missing Supabase table would otherwise throw uncaught.
    console.error('create-checkout-session failed:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown server error' });
  }
}
