import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import {
  requireAdmin,
  allowedCanteenIds,
  canAccessCanteen,
  forbidden,
  notFound,
} from '@/lib/auth';

type RouteContext = { params: { id: string } };

export async function GET(_: NextRequest, { params }: RouteContext) {
  const { profile, response } = await requireAdmin();
  if (response) return response;

  const service = createServiceClient();
  const { data, error } = await service
    .from('menu_items')
    .select('*, categories(id, name), canteens(id, name)')
    .eq('id', params.id)
    .single();

  if (error || !data) return notFound('Not found');

  // Tenant scoping on the item's canteen.
  const allowed = await allowedCanteenIds(profile);
  if (!canAccessCanteen(data.canteen_id, allowed)) {
    return forbidden('Cannot access this menu item');
  }

  return NextResponse.json({ success: true, data });
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { profile, response } = await requireAdmin(['super_admin', 'canteen_admin']);
  if (response) return response;

  const service = createServiceClient();

  // Load the item to enforce tenant scoping before mutating.
  const { data: existing } = await service
    .from('menu_items')
    .select('id, canteen_id')
    .eq('id', params.id)
    .single();

  if (!existing) return notFound('Not found');

  const allowed = await allowedCanteenIds(profile);
  if (!canAccessCanteen(existing.canteen_id, allowed)) {
    return forbidden('Cannot manage this menu item');
  }

  const body = await request.json();

  // Whitelist updatable fields only — never allow changing canteen_id.
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description || null;
  if (body.price_paise !== undefined) updates.price_paise = body.price_paise;
  if (body.category_id !== undefined) updates.category_id = body.category_id || null;
  if (body.is_veg !== undefined) updates.is_veg = body.is_veg;
  if (body.is_available !== undefined) updates.is_available = body.is_available;
  if (body.image_url !== undefined) updates.image_url = body.image_url || null;
  if (body.prep_time_minutes !== undefined) updates.prep_time_minutes = body.prep_time_minutes;
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order;

  const { data, error } = await service
    .from('menu_items')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: error.message } }, { status: 500 });
  return NextResponse.json({ success: true, data });
}

export async function DELETE(_: NextRequest, { params }: RouteContext) {
  const { profile, response } = await requireAdmin(['super_admin', 'canteen_admin']);
  if (response) return response;

  const service = createServiceClient();

  const { data: existing } = await service
    .from('menu_items')
    .select('id, canteen_id')
    .eq('id', params.id)
    .single();

  if (!existing) return notFound('Not found');

  const allowed = await allowedCanteenIds(profile);
  if (!canAccessCanteen(existing.canteen_id, allowed)) {
    return forbidden('Cannot manage this menu item');
  }

  const { error } = await service.from('menu_items').delete().eq('id', params.id);

  if (error) return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: error.message } }, { status: 500 });
  return NextResponse.json({ success: true });
}
