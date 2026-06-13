import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth';

export async function GET(request: NextRequest) {
  // The audit trail is a platform-wide function and exposes joined user PII.
  // Restrict to super_admin only — staff/canteen_admin must not read it.
  const { response } = await requireAdmin(['super_admin']);
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const userId = searchParams.get('user_id');
  const dateFrom = searchParams.get('date_from');
  const dateTo = searchParams.get('date_to');
  const page = parseInt(searchParams.get('page') ?? '1');
  const limit = parseInt(searchParams.get('limit') ?? '50');

  const service = createServiceClient();

  let query = service
    .from('audit_logs')
    .select('*, users(id, full_name, email)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (action) query = query.ilike('action', `%${action}%`);
  if (userId) query = query.eq('user_id', userId);
  if (dateFrom) query = query.gte('created_at', dateFrom);
  if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59');

  const { data, error, count } = await query;

  if (error) return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: error.message } }, { status: 500 });

  return NextResponse.json({
    success: true,
    data: data ?? [],
    pagination: { page, limit, total: count ?? 0, total_pages: Math.ceil((count ?? 0) / limit) },
  });
}
