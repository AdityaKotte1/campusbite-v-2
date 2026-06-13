import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import {
  requireAdmin,
  canAccessInstitute,
  instituteIdForCanteen,
  forbidden,
  notFound,
} from '@/lib/auth';

type RouteContext = { params: { id: string } };

export async function GET(_: NextRequest, { params }: RouteContext) {
  const { profile, response } = await requireAdmin();
  if (response) return response;

  const service = createServiceClient();
  const { data, error } = await service
    .from('categories')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !data) return notFound('Category not found');

  // Tenant scoping: resolve the category's canteen → institute.
  const instituteId = await instituteIdForCanteen(data.canteen_id);
  if (!canAccessInstitute(profile, instituteId)) {
    return forbidden('Cannot access this category');
  }

  return NextResponse.json({ success: true, data });
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { profile, response } = await requireAdmin(['super_admin', 'canteen_admin']);
  if (response) return response;

  const service = createServiceClient();

  // Load existing category to enforce tenant scoping before mutating.
  const { data: existing } = await service
    .from('categories')
    .select('id, canteen_id')
    .eq('id', params.id)
    .single();

  if (!existing) return notFound('Category not found');

  const instituteId = await instituteIdForCanteen(existing.canteen_id);
  if (!canAccessInstitute(profile, instituteId)) {
    return forbidden('Cannot manage this category');
  }

  const body = await request.json();

  // Whitelist updatable fields only — never allow changing canteen_id.
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description || null;
  if (body.icon !== undefined) updates.icon = body.icon || null;
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order;
  if (body.is_active !== undefined) updates.is_active = body.is_active;

  const { data, error } = await service
    .from('categories')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    );
  }
  return NextResponse.json({ success: true, data });
}

export async function DELETE(_: NextRequest, { params }: RouteContext) {
  const { profile, response } = await requireAdmin(['super_admin', 'canteen_admin']);
  if (response) return response;

  const service = createServiceClient();

  const { data: existing } = await service
    .from('categories')
    .select('id, canteen_id')
    .eq('id', params.id)
    .single();

  if (!existing) return notFound('Category not found');

  const instituteId = await instituteIdForCanteen(existing.canteen_id);
  if (!canAccessInstitute(profile, instituteId)) {
    return forbidden('Cannot manage this category');
  }

  const { error } = await service.from('categories').delete().eq('id', params.id);
  if (error) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    );
  }
  return NextResponse.json({ success: true });
}
