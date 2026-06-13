import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { VALID_STATUS_TRANSITIONS } from '@/lib/constants';
import {
  requireAdmin,
  allowedCanteenIds,
  canAccessCanteen,
  forbidden,
  notFound,
} from '@/lib/auth';

const statusSchema = z.object({
  status: z.string(),
});

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const { profile, response } = await requireAdmin(['super_admin', 'canteen_admin', 'staff']);
  if (response) return response;

  const service = createServiceClient();

  const body = await request.json();
  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_INPUT', message: 'Invalid status' } },
      { status: 400 }
    );
  }

  const { status: newStatus } = parsed.data;

  // Get current order status + canteen for tenant scoping
  const { data: order, error: fetchError } = await service
    .from('orders')
    .select('id, status, canteen_id')
    .eq('id', params.id)
    .single();

  if (fetchError || !order) {
    return notFound('Order not found');
  }

  // Tenant scoping: caller may only drive orders for canteens they can access.
  const allowed = await allowedCanteenIds(profile);
  if (!canAccessCanteen(order.canteen_id, allowed)) {
    return forbidden('Cannot manage this order');
  }

  // Validate transition
  const validTransitions = VALID_STATUS_TRANSITIONS[order.status] ?? [];
  if (!validTransitions.includes(newStatus)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INVALID_TRANSITION',
          message: `Cannot transition from ${order.status} to ${newStatus}`,
        },
      },
      { status: 400 }
    );
  }

  // Extra fields per status
  const extra: Record<string, unknown> = {};
  if (newStatus === 'ready') extra.ready_at = new Date().toISOString();
  if (newStatus === 'collected') extra.collected_at = new Date().toISOString();
  if (newStatus === 'cancelled') extra.cancelled_at = new Date().toISOString();

  const { data, error } = await service
    .from('orders')
    .update({ status: newStatus, updated_at: new Date().toISOString(), ...extra })
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    );
  }

  // Log to audit_logs
  await service.from('audit_logs').insert({
    user_id: profile.id,
    action: `order.status_change`,
    entity_type: 'order',
    entity_id: params.id,
    metadata: { from: order.status, to: newStatus },
  });

  return NextResponse.json({ success: true, data });
}
