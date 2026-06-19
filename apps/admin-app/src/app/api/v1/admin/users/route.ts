import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
      { status: 401 }
    );
  }

  const service = createServiceClient();

  // Fetch caller's profile for role-based scoping
  const { data: profile, error: profileError } = await service
    .from('users')
    .select('role, is_active, institute_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || !profile.is_active) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } },
      { status: 403 }
    );
  }

  // staff cannot list users
  if (profile.role === 'staff') {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Staff cannot list users' } },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const role = searchParams.get('role');
  const isActive = searchParams.get('is_active');
  const page = parseInt(searchParams.get('page') ?? '1');
  const limit = parseInt(searchParams.get('limit') ?? '50');

  let query = service
    .from('users')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  // canteen_admin: scope to their institute only
  if (profile.role === 'canteen_admin') {
    if (!profile.institute_id) {
      return NextResponse.json({
        success: true,
        data: [],
        pagination: { page, limit, total: 0, total_pages: 0 },
      });
    }
    query = query.eq('institute_id', profile.institute_id);
  }

  if (role && role !== 'all') {
    // Support comma-separated roles e.g. ?role=staff,canteen_admin
    const roles = role.split(',');
    query = query.in('role', roles);
  }

  if (isActive !== null && isActive !== '') {
    query = query.eq('is_active', isActive === 'true');
  }

  // Security: super_admins are invisible to non-super-admin callers.
  if (profile.role !== 'super_admin') query = query.neq('role', 'super_admin');

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: data ?? [],
    pagination: { page, limit, total: count ?? 0, total_pages: Math.ceil((count ?? 0) / limit) },
  });
}
