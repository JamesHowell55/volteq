import type Stripe from 'stripe';
import { getStripe } from './_lib/stripeClient';
import { getSupabaseAdmin } from './_lib/supabaseAdmin';
import { readRawBody } from './_lib/rawBody';
import type { VercelRequest, VercelResponse } from './_lib/types';

// Stripe signature verification needs the raw, unparsed request body — disable
// Vercel's default JSON body parsing for this route (see _lib/rawBody.ts).
export const config = { api: { bodyParser: false } };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    res.status(500).json({ error: 'STRIPE_WEBHOOK_SECRET not configured' });
    return;
  }

  const signature = req.headers['stripe-signature'];
  const rawBody = await readRawBody(req);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature as string, webhookSecret);
  } catch (err) {
    res.status(400).json({ error: `Webhook signature verification failed: ${(err as Error).message}` });
    return;
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.supabase_user_id ?? session.client_reference_id;
      if (userId) {
        const plan = session.mode === 'payment' ? 'premium_lifetime' : 'premium_subscription';
        await supabaseAdmin.from('entitlements').upsert(
          {
            user_id: userId,
            plan,
            status: session.mode === 'subscription' ? 'active' : null,
            stripe_customer_id: typeof session.customer === 'string' ? session.customer : session.customer?.id,
            stripe_subscription_id: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );
      }
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
      const isActive = subscription.status === 'active' || subscription.status === 'trialing';
      // current_period_end moved off the top-level Subscription object onto each
      // subscription item in this Stripe API version (supports multi-item
      // subscriptions with independent billing cycles) — we only ever create
      // single-item subscriptions, so the first item's period end applies.
      const periodEndUnix = subscription.items.data[0]?.current_period_end;
      await supabaseAdmin
        .from('entitlements')
        .update({
          plan: isActive ? 'premium_subscription' : 'free',
          status: subscription.status,
          current_period_end: periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_customer_id', customerId);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    // Return 500 (not swallow) so Stripe's automatic retry schedule kicks in —
    // this is a webhook, so a transient DB hiccup should be retried rather than
    // silently marked "received" while the entitlement update never happened.
    console.error(`stripe-webhook failed processing ${event.type}:`, err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown server error' });
  }
}
