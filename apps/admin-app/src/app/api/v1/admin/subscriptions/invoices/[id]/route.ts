import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin, canAccessInstitute, forbidden, notFound } from '@/lib/auth';

// GET /api/v1/admin/subscriptions/invoices/[id] — one subscription invoice,
// scoped to the caller's institute. Used by the printable invoice page.
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const { profile, response } = await requireAdmin(['super_admin', 'canteen_admin']);
  if (response) return response;

  const service = createServiceClient();
  const { data: inv } = await service
    .from('subscription_invoices')
    .select('*, institute:institutes(id, name, address, city, state, pincode, contact_email)')
    .eq('id', params.id)
    .single();

  if (!inv) return notFound('Invoice not found');
  if (!canAccessInstitute(profile, inv.institute_id)) {
    return forbidden('Cannot access this invoice');
  }

  return NextResponse.json({ success: true, data: inv });
}
