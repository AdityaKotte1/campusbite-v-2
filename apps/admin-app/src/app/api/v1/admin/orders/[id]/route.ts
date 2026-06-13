import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import {
  requireAdmin,
  allowedCanteenIds,
  canAccessCanteen,
  forbidden,
  notFound,
} from '@/lib/auth';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const { profile, response } = await requireAdmin();
  if (response) return response;

  const service = createServiceClient();
  const { data, error } = await service
    .from('orders')
    .select('*, users(id, full_name, email, phone), canteens(id, name, location), order_items(*)')
    .eq('id', params.id)
    .single();

  if (error || !data) {
    return notFound('Order not found');
  }

  // Tenant scoping: caller may only view orders for canteens they can access.
  const allowed = await allowedCanteenIds(profile);
  if (!canAccessCanteen(data.canteen_id, allowed)) {
    return notFound('Order not found');
  }

  return NextResponse.json({ success: true, data });
}

// Fields a tenant admin may safely edit on an order via this route.
// Financial fields (payment_status, total_paise, subtotal), ownership fields
// (user_id, canteen_id), and lifecycle `status` are intentionally excluded.
// Status transitions belong to the dedicated status route.
const ALLOWED_PATCH_FIELDS = ['special_instructions'] as const;

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { profile, response } = await requireAdmin(['super_admin', 'canteen_admin', 'staff']);
  if (response) return response;

  const service = createServiceClient();

  // Load the order first to enforce tenant scoping before any write.
  const { data: order, error: fetchError } = await service
    .from('orders')
    .select('id, canteen_id')
    .eq('id', params.id)
    .single();

  if (fetchError || !order) {
    return notFound('Order not found');
  }

  const allowed = await allowedCanteenIds(profile);
  if (!canAccessCanteen(order.canteen_id, allowed)) {
    return forbidden('Cannot manage this order');
  }

  const body = await request.json();

  // Whitelist: never spread the body. Only accept known, non-financial fields.
  const updates: Record<string, unknown> = {};
  for (const field of ALLOWED_PATCH_FIELDS) {
    if (body[field] !== undefined) updates[field] = body[field];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_INPUT', message: 'No editable fields supplied' } },
      { status: 400 }
    );
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await service
    .from('orders')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, data });
}
