import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

type RouteContext = { params: { id: string } };

// ─── POST /api/v1/admin/institutes/[id]/unassign-admin ───────────────────────
// Remove a user as canteen_admin of this institute and demote them to student.
// role → 'student', assigned_canteen_id → null; institute_id is KEPT (they stay
// a regular student at the same campus). Fully reversible via assign-admin.
// Body: { email: string }. super_admin only — the mirror of assign-admin.

export async function POST(request: NextRequest, { params }: RouteContext) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
      { status: 401 }
    );
  }

  const service = createServiceClient();

  // Verify caller is super_admin
  const { data: caller } = await service
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!caller || caller.role !== 'super_admin') {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Super admin only' } },
      { status: 403 }
    );
  }

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } },
      { status: 400 }
    );
  }

  const { email } = body;
  if (!email) {
    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION', message: 'email is required' } },
      { status: 400 }
    );
  }

  // Find the target user
  const { data: targetUser, error: findError } = await service
    .from('users')
    .select('id, email, full_name, role, institute_id')
    .eq('email', email)
    .single();

  if (findError || !targetUser) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'No user found with that email' } },
      { status: 404 }
    );
  }

  // The target must currently be THIS institute's canteen_admin — otherwise the
  // row the super admin clicked is stale (or the user was already changed).
  if (targetUser.role !== 'canteen_admin' || targetUser.institute_id !== params.id) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'NOT_ADMIN', message: 'This user is not a canteen admin of this institute' },
      },
      { status: 409 }
    );
  }

  // Demote to student. Keep institute_id (they remain a student at this campus);
  // clear any assigned canteen so no admin/staff scoping lingers.
  const { data: updated, error: updateError } = await service
    .from('users')
    .update({
      role: 'student',
      assigned_canteen_id: null,
    })
    .eq('id', targetUser.id)
    .select('id, email, full_name, role, institute_id')
    .single();

  if (updateError) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: updateError.message } },
      { status: 500 }
    );
  }

  const { error: auditError } = await service.from('audit_logs').insert({
    user_id: user.id,
    action: 'canteen_admin.unassigned',
    entity_type: 'user',
    entity_id: targetUser.id,
    metadata: { institute_id: params.id, demoted_to: 'student' },
  });
  if (auditError) {
    console.error('[institutes/unassign-admin] audit log insert failed:', auditError);
  }

  return NextResponse.json({
    success: true,
    data: updated,
    message: `${targetUser.full_name ?? email} is now a student`,
  });
}
