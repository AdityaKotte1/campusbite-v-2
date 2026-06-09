import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

// ─── Auth helper ─────────────────────────────────────────────────────────────

async function getAdminProfile(userId: string) {
  const service = createServiceClient();
  const { data, error } = await service
    .from('users')
    .select('role, is_active, institute_id, assigned_canteen_id')
    .eq('id', userId)
    .single();
  return { profile: data, error };
}

// ─── GET /api/v1/admin/staff ──────────────────────────────────────────────────
// List users with role = 'staff'
// super_admin  → all staff
// canteen_admin → staff in their institute (assigned_canteen_id belongs to their institute)

export async function GET(_: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
      { status: 401 }
    );
  }

  const { profile, error: profileError } = await getAdminProfile(user.id);

  if (profileError || !profile || !profile.is_active) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } },
      { status: 403 }
    );
  }

  if (profile.role === 'staff') {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Staff cannot list staff' } },
      { status: 403 }
    );
  }

  const service = createServiceClient();

  let query = service
    .from('users')
    .select('id, email, full_name, avatar_url, role, institute_id, assigned_canteen_id, is_active, created_at, canteens:assigned_canteen_id(id, name, code)')
    .eq('role', 'staff')
    .order('created_at', { ascending: false });

  if (profile.role === 'canteen_admin') {
    if (!profile.institute_id) {
      return NextResponse.json({ success: true, data: [] });
    }
    // Get canteen IDs in this institute
    const { data: canteens } = await service
      .from('canteens')
      .select('id')
      .eq('institute_id', profile.institute_id);

    const canteenIds = (canteens ?? []).map((c: { id: string }) => c.id);
    if (canteenIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }
    query = query.in('assigned_canteen_id', canteenIds);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, data: data ?? [] });
}

// ─── POST /api/v1/admin/staff ─────────────────────────────────────────────────
// Body: { email: string, canteen_id: string }
// Finds user by email, sets role = 'staff', assigned_canteen_id = canteen_id
// Also sets institute_id from the canteen

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
      { status: 401 }
    );
  }

  const { profile, error: profileError } = await getAdminProfile(user.id);

  if (profileError || !profile || !profile.is_active) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } },
      { status: 403 }
    );
  }

  if (!['super_admin', 'canteen_admin'].includes(profile.role)) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Only admins can assign staff' } },
      { status: 403 }
    );
  }

  let body: { email?: string; canteen_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' } },
      { status: 400 }
    );
  }

  const { email, canteen_id } = body;

  if (!email || !canteen_id) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'email and canteen_id are required' } },
      { status: 400 }
    );
  }

  const service = createServiceClient();

  // Look up the canteen to get institute_id and validate it exists
  const { data: canteen, error: canteenError } = await service
    .from('canteens')
    .select('id, institute_id, name')
    .eq('id', canteen_id)
    .single();

  if (canteenError || !canteen) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Canteen not found' } },
      { status: 404 }
    );
  }

  // canteen_admin can only assign to canteens in their own institute
  if (profile.role === 'canteen_admin' && canteen.institute_id !== profile.institute_id) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Canteen does not belong to your institute' } },
      { status: 403 }
    );
  }

  // Find the target user by email
  const { data: targetUser, error: userError } = await service
    .from('users')
    .select('id, email, role, full_name, is_active')
    .eq('email', email.toLowerCase().trim())
    .single();

  if (userError || !targetUser) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'No user found with that email address' } },
      { status: 404 }
    );
  }

  // Prevent demoting canteen_admin or super_admin
  if (['canteen_admin', 'super_admin'].includes(targetUser.role)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'CONFLICT',
          message: `User is already a ${targetUser.role} and cannot be assigned as staff`,
        },
      },
      { status: 409 }
    );
  }

  // Prevent re-assigning if already staff of same canteen
  if (targetUser.role === 'staff') {
    // Allow re-assignment to a different canteen — update proceeds
  }

  // Update the user
  const { data: updated, error: updateError } = await service
    .from('users')
    .update({
      role: 'staff',
      assigned_canteen_id: canteen_id,
      institute_id: canteen.institute_id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', targetUser.id)
    .select('id, email, full_name, avatar_url, role, institute_id, assigned_canteen_id, is_active, created_at, updated_at')
    .single();

  if (updateError) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: updateError.message } },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, data: updated }, { status: 201 });
}

// ─── DELETE /api/v1/admin/staff?user_id=xxx ───────────────────────────────────
// Resets user back to role = 'student', clears assigned_canteen_id

export async function DELETE(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
      { status: 401 }
    );
  }

  const { profile, error: profileError } = await getAdminProfile(user.id);

  if (profileError || !profile || !profile.is_active) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } },
      { status: 403 }
    );
  }

  if (!['super_admin', 'canteen_admin'].includes(profile.role)) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Only admins can remove staff' } },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('user_id');

  if (!userId) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'user_id query param is required' } },
      { status: 400 }
    );
  }

  const service = createServiceClient();

  // Verify the target is actually a staff member
  const { data: targetUser, error: fetchError } = await service
    .from('users')
    .select('id, role, assigned_canteen_id, institute_id')
    .eq('id', userId)
    .single();

  if (fetchError || !targetUser) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'User not found' } },
      { status: 404 }
    );
  }

  if (targetUser.role !== 'staff') {
    return NextResponse.json(
      { success: false, error: { code: 'CONFLICT', message: 'User is not a staff member' } },
      { status: 409 }
    );
  }

  // canteen_admin can only remove staff from their own institute
  if (profile.role === 'canteen_admin' && targetUser.institute_id !== profile.institute_id) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Cannot remove staff from another institute' } },
      { status: 403 }
    );
  }

  const { error: updateError } = await service
    .from('users')
    .update({
      role: 'student',
      assigned_canteen_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (updateError) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: updateError.message } },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, message: 'Staff member removed' });
}
