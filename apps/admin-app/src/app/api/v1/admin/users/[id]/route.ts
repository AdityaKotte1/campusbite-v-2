import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import {
  requireAdmin,
  forbidden,
  notFound,
  canAccessInstitute,
  instituteIdForCanteen,
  type Role,
} from '@/lib/auth';

const ASSIGNABLE_ROLES: Role[] = ['super_admin', 'canteen_admin', 'staff'];

// ─── GET /api/v1/admin/users/[id] ────────────────────────────────────────────
// super_admin: any user. canteen_admin: only users in their own institute.
// staff: not allowed (no business reason to read arbitrary user PII).
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const { profile, response } = await requireAdmin(['super_admin', 'canteen_admin']);
  if (response) return response;

  const service = createServiceClient();
  const { data, error } = await service.from('users').select('*').eq('id', params.id).single();
  if (error || !data) return notFound('User not found');

  if (!canAccessInstitute(profile, data.institute_id)) {
    return forbidden('Cannot view a user outside your institute');
  }

  return NextResponse.json({ success: true, data });
}

// ─── PUT /api/v1/admin/users/[id] ────────────────────────────────────────────
// Hardened against privilege escalation:
//   • only super_admin may change `role` or `institute_id`
//   • canteen_admin may only edit users within their own institute, and only
//     is_active / full_name / assigned_canteen_id (the canteen must be theirs)
//   • nobody may change their OWN role or active flag through this route
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const { profile, response } = await requireAdmin(['super_admin', 'canteen_admin']);
  if (response) return response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } },
      { status: 400 }
    );
  }

  const service = createServiceClient();

  // Load the target so we can scope and gate by its current state.
  const { data: target } = await service
    .from('users')
    .select('id, role, institute_id, assigned_canteen_id')
    .eq('id', params.id)
    .single();
  if (!target) return notFound('User not found');

  // Tenant scope: a canteen_admin can only act on users in their own institute.
  if (!canAccessInstitute(profile, target.institute_id)) {
    return forbidden('Cannot manage a user outside your institute');
  }

  // Self-protection: you cannot change your own role / active flag here.
  const isSelf = target.id === profile.id;
  if (isSelf && ('role' in body || 'is_active' in body)) {
    return forbidden('You cannot change your own role or active status');
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // Fields any permitted admin may set.
  if ('full_name' in body) {
    if (typeof body.full_name !== 'string' || body.full_name.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'full_name must be a non-empty string' } },
        { status: 400 }
      );
    }
    updates.full_name = body.full_name.trim().slice(0, 100);
  }
  if ('is_active' in body) {
    if (typeof body.is_active !== 'boolean') {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'is_active must be a boolean' } },
        { status: 400 }
      );
    }
    updates.is_active = body.is_active;
  }
  if ('assigned_canteen_id' in body) {
    const cid = body.assigned_canteen_id;
    if (cid !== null && typeof cid !== 'string') {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'assigned_canteen_id must be a uuid or null' } },
        { status: 400 }
      );
    }
    // The assigned canteen must belong to a tenant the caller controls.
    if (typeof cid === 'string') {
      const instId = await instituteIdForCanteen(cid);
      if (!instId || !canAccessInstitute(profile, instId)) {
        return forbidden('Cannot assign a canteen outside your institute');
      }
    }
    updates.assigned_canteen_id = cid;
  }

  // Privileged fields — super_admin only.
  if ('role' in body || 'institute_id' in body) {
    if (profile.role !== 'super_admin') {
      return forbidden('Only a super admin can change role or institute');
    }
    if ('role' in body) {
      if (typeof body.role !== 'string' || !ASSIGNABLE_ROLES.includes(body.role as Role)) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid role' } },
          { status: 400 }
        );
      }
      updates.role = body.role;
    }
    if ('institute_id' in body) {
      const iid = body.institute_id;
      if (iid !== null && typeof iid !== 'string') {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: 'institute_id must be a uuid or null' } },
          { status: 400 }
        );
      }
      updates.institute_id = iid;
    }
  }

  const { data, error } = await service
    .from('users')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: error.message } }, { status: 500 });

  await service.from('audit_logs').insert({
    user_id: profile.id,
    action: 'user.update',
    entity_type: 'user',
    entity_id: params.id,
    metadata: { fields: Object.keys(updates) },
  });

  return NextResponse.json({ success: true, data });
}
