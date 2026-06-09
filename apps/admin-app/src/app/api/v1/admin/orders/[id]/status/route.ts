import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { VALID_STATUS_TRANSITIONS } from '@/lib/constants';

const statusSchema = z.object({
  status: z.string(),
});

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });
  }

  const service = createServiceClient();

  // Verify admin role
  const { data: profile, error: profileError } = await service
    .from('users')
    .select('role, is_active')
    .eq('id', user.id)
    .single();

  const ADMIN_ROLES = ['super_admin', 'canteen_admin', 'staff'];
  if (profileError || !profile || !ADMIN_ROLES.includes(profile.role) || !profile.is_active) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } },
      { status: 403 }
    );
  }

  const body = await request.json();
  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_INPUT', message: 'Invalid status' } },
      { status: 400 }
    );
  }

  const { status: newStatus } = parsed.data;

  // Get current order status
  const { data: order, error: fetchError } = await service
    .from('orders')
    .select('id, status')
    .eq('id', params.id)
    .single();

  if (fetchError || !order) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } },
      { status: 404 }
    );
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
    user_id: user.id,
    action: `order.status_change`,
    entity_type: 'order',
    entity_id: params.id,
    metadata: { from: order.status, to: newStatus },
  });

  return NextResponse.json({ success: true, data });
}
