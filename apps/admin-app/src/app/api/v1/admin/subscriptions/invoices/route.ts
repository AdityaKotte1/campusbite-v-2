import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin, canAccessInstitute, forbidden } from '@/lib/auth';

// GET /api/v1/admin/subscriptions/invoices?institute_id=<uuid>
// List an institute's subscription invoices. super_admin: any institute;
// canteen_admin: their own institute only. (Single invoice + the printable
// page live at /invoices/[id].)
export async function GET(request: NextRequest) {
  const { profile, response } = await requireAdmin(['super_admin', 'canteen_admin']);
  if (response) return response;

  const instituteId = new URL(request.url).searchParams.get('institute_id');
  if (!instituteId) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'institute_id is required' } },
      { status: 400 }
    );
  }
  if (!canAccessInstitute(profile, instituteId)) {
    return forbidden('Cannot access this institute');
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from('subscription_invoices')
    .select('id, billing_cycle, subtotal_paise, gst_paise, total_paise, status, created_at')
    .eq('institute_id', instituteId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: error.message } }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: data ?? [] });
}
