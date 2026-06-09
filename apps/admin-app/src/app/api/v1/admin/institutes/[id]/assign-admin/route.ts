import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

type RouteContext = { params: { id: string } };

// ─── POST /api/v1/admin/institutes/[id]/assign-admin ─────────────────────────
// Assign an existing user as canteen_admin for this institute.
// Body: { email: string }
// super_admin only.

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

  const body = await request.json();
  const { email } = body;

  if (!email) {
    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION', message: 'email is required' } },
      { status: 400 }
    );
  }

  // Find the target user by email
  const { data: targetUser, error: findError } = await service
    .from('users')
    .select('id, email, full_name, is_active, role, institute_id')
    .eq('email', email)
    .single();

  if (findError || !targetUser) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'No user found with that email' } },
      { status: 404 }
    );
  }

  if (!targetUser.is_active) {
    return NextResponse.json(
      { success: false, error: { code: 'INACTIVE_USER', message: 'User account is inactive' } },
      { status: 400 }
    );
  }

  // Verify institute exists
  const { data: institute } = await service
    .from('institutes')
    .select('id, name')
    .eq('id', params.id)
    .single();

  if (!institute) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Institute not found' } },
      { status: 404 }
    );
  }

  // Update the user's role and institute_id
  const { data: updated, error: updateError } = await service
    .from('users')
    .update({
      role: 'canteen_admin',
      institute_id: params.id,
      assigned_canteen_id: null, // canteen_admin manages all canteens under their institute
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

  return NextResponse.json({
    success: true,
    data: updated,
    message: `${targetUser.full_name ?? email} is now canteen admin for ${institute.name}`,
  });
}
