import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { QR_EXPIRY_HOURS } from '@/lib/constants';
import { randomUUID } from 'crypto';

interface Params {
  params: { id: string };
}

async function getOrCreateQRToken(orderId: string, userId: string) {
  const supabase = createClient();

  // Verify order belongs to user and is paid
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, user_id, payment_status, status')
    .eq('id', orderId)
    .eq('user_id', userId)
    .single();

  if (orderErr || !order) {
    return { error: 'not_found', message: 'Order not found', status: 404 };
  }

  if (order.payment_status !== 'paid') {
    return { error: 'payment_required', message: 'Payment must be completed first', status: 402 };
  }

  if (['cancelled', 'payment_failed', 'collected'].includes(order.status)) {
    return { error: 'order_invalid', message: 'QR not available for this order status', status: 400 };
  }

  // Check for existing valid token
  const now = new Date().toISOString();
  const { data: existingToken } = await supabase
    .from('qr_tokens')
    .select('*')
    .eq('order_id', orderId)
    .eq('status', 'active')
    .gt('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (existingToken) {
    return { data: existingToken };
  }

  // Create new token
  const expiresAt = new Date(Date.now() + QR_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
  const token = randomUUID();

  // Mint the token with the SERVICE client — students no longer have a direct
  // qr_tokens INSERT policy (fix-order-integrity.sql). Ownership + paid status
  // were already verified above, so this only ever mints for the caller's own
  // paid order.
  const { data: newToken, error: createErr } = await createServiceClient()
    .from('qr_tokens')
    .insert({
      order_id: orderId,
      token,
      expires_at: expiresAt,
      status: 'active',
    })
    .select()
    .single();

  if (createErr || !newToken) {
    return { error: 'create_failed', message: createErr?.message ?? 'Failed to create QR token', status: 500 };
  }

  return { data: newToken };
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = params;
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'unauthorized', message: 'Not authenticated' }, { status: 401 });
    }

    const result = await getOrCreateQRToken(id, user.id);

    if ('error' in result) {
      return NextResponse.json(
        { error: result.error, message: result.message },
        { status: result.status ?? 500 }
      );
    }

    return NextResponse.json({ data: result.data });
  } catch (err) {
    console.error('QR GET error:', err);
    return NextResponse.json({ error: 'internal_error', message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(_request: Request, { params }: Params) {
  try {
    const { id } = params;
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'unauthorized', message: 'Not authenticated' }, { status: 401 });
    }

    // Verify ownership BEFORE revoking (the service client below bypasses RLS,
    // so we must not let a user revoke another user's tokens via the id param).
    const { data: ownedOrder } = await supabase
      .from('orders')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();
    if (!ownedOrder) {
      return NextResponse.json({ error: 'not_found', message: 'Order not found' }, { status: 404 });
    }

    // Invalidate existing tokens (service client — students have no qr_tokens UPDATE policy)
    await createServiceClient()
      .from('qr_tokens')
      .update({ status: 'revoked' })
      .eq('order_id', id)
      .eq('status', 'active');

    const result = await getOrCreateQRToken(id, user.id);

    if ('error' in result) {
      return NextResponse.json(
        { error: result.error, message: result.message },
        { status: result.status ?? 500 }
      );
    }

    return NextResponse.json({ data: result.data }, { status: 201 });
  } catch (err) {
    console.error('QR POST error:', err);
    return NextResponse.json({ error: 'internal_error', message: 'Internal server error' }, { status: 500 });
  }
}
