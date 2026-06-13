import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import {
  requireAdmin,
  allowedCanteenIds,
  canAccessCanteen,
  forbidden,
  notFound,
  type CallerProfile,
} from '@/lib/auth';

// Staff AND admins can manage stock
const STOCK_ROLES = ['super_admin', 'canteen_admin', 'staff'] as const;

/**
 * Authenticate, enforce stock roles, then tenant-scope to the target item's
 * canteen. allowedCanteenIds()/canAccessCanteen() already encode the rule:
 * super_admin → any; canteen_admin → canteens in their institute; staff →
 * their assigned canteen only.
 */
async function authoriseForItem(
  itemId: string
): Promise<
  | { profile: CallerProfile; canteenId: string; response?: undefined }
  | { profile?: undefined; canteenId?: undefined; response: NextResponse }
> {
  const { profile, response } = await requireAdmin([...STOCK_ROLES]);
  if (response) return { response };

  const service = createServiceClient();
  const { data: item } = await service
    .from('menu_items')
    .select('id, canteen_id')
    .eq('id', itemId)
    .single();

  if (!item) return { response: notFound('Not found') };

  const allowed = await allowedCanteenIds(profile);
  if (!canAccessCanteen(item.canteen_id, allowed)) {
    return { response: forbidden('Cannot manage stock for this item') };
  }

  return { profile, canteenId: item.canteen_id };
}

// GET — return current stock info for one item
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const { response } = await authoriseForItem(params.id);
  if (response) return response;

  const service = createServiceClient();
  const { data, error: dbErr } = await service
    .from('menu_items')
    .select('id, name, stock_enabled, stock_count, is_available')
    .eq('id', params.id)
    .single();

  if (dbErr || !data) return NextResponse.json({ success: false, error: { code: 'NOT_FOUND' } }, { status: 404 });
  return NextResponse.json({ success: true, data });
}

// PATCH — update stock settings or refill
// Body options:
//   { action: 'refill', count: 50 }       → set new stock count (re-enables tracking)
//   { action: 'disable' }                  → disable stock tracking (unlimited)
//   { action: 'toggle_available', is_available: bool } → manual toggle without touching stock
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { response } = await authoriseForItem(params.id);
  if (response) return response;

  const service = createServiceClient();
  const body = await request.json();
  const { action } = body;

  if (action === 'refill') {
    const count = parseInt(body.count, 10);
    if (isNaN(count) || count < 0) {
      return NextResponse.json({ success: false, error: { code: 'INVALID_COUNT', message: 'Count must be 0 or more' } }, { status: 400 });
    }

    const { data, error: dbErr } = await service
      .from('menu_items')
      .update({
        stock_enabled: true,
        stock_count: count,
        is_available: count > 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .select('id, name, stock_enabled, stock_count, is_available')
      .single();

    if (dbErr) return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: dbErr.message } }, { status: 500 });
    return NextResponse.json({ success: true, data });
  }

  if (action === 'disable') {
    const { data, error: dbErr } = await service
      .from('menu_items')
      .update({ stock_enabled: false, stock_count: null, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select('id, name, stock_enabled, stock_count, is_available')
      .single();

    if (dbErr) return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: dbErr.message } }, { status: 500 });
    return NextResponse.json({ success: true, data });
  }

  if (action === 'toggle_available') {
    const { is_available } = body;
    if (typeof is_available !== 'boolean') {
      return NextResponse.json({ success: false, error: { code: 'INVALID_BODY' } }, { status: 400 });
    }

    const { data, error: dbErr } = await service
      .from('menu_items')
      .update({ is_available, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select('id, name, stock_enabled, stock_count, is_available')
      .single();

    if (dbErr) return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: dbErr.message } }, { status: 500 });
    return NextResponse.json({ success: true, data });
  }

  return NextResponse.json({ success: false, error: { code: 'UNKNOWN_ACTION' } }, { status: 400 });
}
