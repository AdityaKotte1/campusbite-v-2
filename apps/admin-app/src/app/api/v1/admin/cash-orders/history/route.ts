import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin, resolveCanteenScope, type CallerProfile } from '@/lib/auth';

// Cash-approval history = the audit trail of approved cash orders. Derived from
// `orders` (NOT audit_logs): orders.approved_by / approved_at already record who
// approved and when, and orders.canteen_id lets us scope per-canteen safely.
// (audit_logs has no canteen_id, which is exactly why canteen-admin audit reads
// were locked to super_admin only — see security-hardening Fix 4.)
//
// Scoping is the same pattern as the pending list: resolveCanteenScope() returns
// null for super_admin (optionally narrowed by the scope selector's
// institute_id/canteen_id params) and the caller's own canteens otherwise.

type Joined = {
  id: string;
  order_number: string;
  total_paise: number;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
  user: { full_name: string | null; phone: string | null } | null;
  canteen: { id: string; name: string | null } | null;
};

export async function GET(request: NextRequest) {
  // Cash-approval history is for canteen_admin + super_admin only — staff can
  // approve (pending list) but must not see the approval history/audit.
  const { profile, response } = await requireAdmin(['super_admin', 'canteen_admin']);
  if (response) return response;
  const sp = new URL(request.url).searchParams;

  const scope = await resolveCanteenScope(profile as CallerProfile, {
    instituteId: sp.get('institute_id'),
    canteenId: sp.get('canteen_id'),
  });
  // A non-super-admin scoped to no canteens can see nothing — short-circuit.
  if (scope !== null && scope.length === 0) {
    return NextResponse.json({ success: true, data: [] });
  }

  const dateFrom = sp.get('date_from'); // YYYY-MM-DD (inclusive)
  const dateTo = sp.get('date_to');     // YYYY-MM-DD (inclusive)

  const service = createServiceClient();
  let q = service
    .from('orders')
    .select(
      'id, order_number, total_paise, created_at, approved_at, approved_by, user:users(full_name, phone), canteen:canteens(id, name)'
    )
    .eq('payment_method', 'cash')
    .not('approved_at', 'is', null) // approved cash orders only
    .order('approved_at', { ascending: false });

  if (scope !== null) q = q.in('canteen_id', scope);
  if (dateFrom) q = q.gte('approved_at', dateFrom);
  if (dateTo) q = q.lte('approved_at', dateTo + 'T23:59:59');

  const { data, error } = await q;
  if (error) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as unknown as Joined[];

  // approved_by is intentionally NOT a foreign key (a 2nd orders→users FK makes
  // the user:users(...) embed ambiguous → PGRST201 → 500), so resolve approver
  // names with one extra batched lookup instead of a PostgREST embed.
  const approverIds = [...new Set(rows.map((r) => r.approved_by).filter(Boolean) as string[])];
  let approverMap: Record<string, string> = {};
  if (approverIds.length) {
    const { data: approvers } = await service
      .from('users')
      .select('id, full_name')
      .in('id', approverIds);
    approverMap = Object.fromEntries(
      (approvers ?? []).map((u: { id: string; full_name: string | null }) => [u.id, u.full_name ?? '—'])
    );
  }

  const result = rows.map((r) => ({
    id: r.id,
    order_number: r.order_number,
    total_paise: r.total_paise,
    created_at: r.created_at,
    approved_at: r.approved_at,
    customer_name: r.user?.full_name ?? null,
    customer_phone: r.user?.phone ?? null,
    canteen_name: r.canteen?.name ?? null,
    approved_by_name: r.approved_by ? approverMap[r.approved_by] ?? '—' : '—',
  }));

  return NextResponse.json({ success: true, data: result });
}
