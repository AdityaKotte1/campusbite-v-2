import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin, forbidden, notFound, type CallerProfile } from '@/lib/auth';

// support_tickets has no institute_id/canteen_id column; tickets are tenant-scoped
// via their owner (user_id → users.institute_id), mirroring the RLS policy in
// supabase-support.sql. super_admin sees all; canteen_admin is scoped to tickets
// owned by users in their institute; staff is blocked entirely.
const SUPPORT_ROLES = ['super_admin', 'canteen_admin'] as const;

const VALID_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
const MAX_ADMIN_RESPONSE = 5000;

/**
 * IDs of users belonging to the caller's institute (for ticket scoping).
 * Returns null for super_admin (unrestricted). A misconfigured canteen_admin
 * with no institute, or an institute with no users, yields [].
 */
async function scopedOwnerIds(
  profile: CallerProfile,
  service: ReturnType<typeof createServiceClient>
): Promise<string[] | null> {
  if (profile.role === 'super_admin') return null;
  if (!profile.institute_id) return [];
  const { data } = await service
    .from('users')
    .select('id')
    .eq('institute_id', profile.institute_id);
  return (data ?? []).map((u: { id: string }) => u.id);
}

export async function GET(request: NextRequest) {
  const { profile, response } = await requireAdmin([...SUPPORT_ROLES]);
  if (response) return response;

  const service = createServiceClient();
  const ownerIds = await scopedOwnerIds(profile, service);

  // Scoped caller with no in-institute users → no visible tickets.
  if (ownerIds !== null && ownerIds.length === 0) {
    return NextResponse.json({ success: true, data: [] });
  }

  const status = new URL(request.url).searchParams.get('status');
  let q = service.from('support_tickets').select('*').order('created_at', { ascending: false }).limit(200);
  if (ownerIds !== null) q = q.in('user_id', ownerIds);
  if (status) q = q.eq('status', status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: error.message } }, { status: 500 });
  return NextResponse.json({ success: true, data: data ?? [] });
}

export async function PATCH(request: NextRequest) {
  const { profile, response } = await requireAdmin([...SUPPORT_ROLES]);
  if (response) return response;

  const service = createServiceClient();

  const body = await request.json();
  const { id, status, admin_response } = body as { id?: string; status?: string; admin_response?: string };
  if (!id) return NextResponse.json({ success: false, error: { code: 'INVALID_INPUT', message: 'id required' } }, { status: 400 });

  // Validate status against the allowed enum.
  if (status !== undefined && !VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_INPUT', message: `status must be one of: ${VALID_STATUSES.join(', ')}` } },
      { status: 400 }
    );
  }
  // Cap admin_response length.
  if (admin_response !== undefined && (typeof admin_response !== 'string' || admin_response.length > MAX_ADMIN_RESPONSE)) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_INPUT', message: `admin_response must be a string of at most ${MAX_ADMIN_RESPONSE} characters` } },
      { status: 400 }
    );
  }

  // Tenant check: the ticket must be in the caller's scope before we touch it.
  const { data: existing, error: fetchErr } = await service
    .from('support_tickets')
    .select('id, user_id')
    .eq('id', id)
    .single();
  if (fetchErr || !existing) return notFound('Ticket not found');

  const ownerIds = await scopedOwnerIds(profile, service);
  if (ownerIds !== null) {
    if (!existing.user_id || !ownerIds.includes(existing.user_id)) {
      return forbidden('Ticket is outside your institute');
    }
  }

  // Whitelist mutable fields only.
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (status !== undefined) updates.status = status;
  if (admin_response !== undefined) {
    updates.admin_response = admin_response;
    updates.responded_by = profile.id;
  }

  const { data, error } = await service.from('support_tickets').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: error.message } }, { status: 500 });
  return NextResponse.json({ success: true, data });
}
