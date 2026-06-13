import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface Params {
  params: { canteenId: string };
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { canteenId } = params;
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('category_id');
    const isVeg = searchParams.get('is_veg');
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') ?? '100', 10);

    const supabase = createClient();

    // Subscription gating: don't serve menu items for canteens whose institute's
    // subscription has lapsed (mirrors the check in orders/route.ts). Resolve the
    // canteen's institute and return an empty list if it isn't an active subscriber.
    const { data: canteen } = await supabase
      .from('canteens')
      .select('id, institutes(is_active_subscriber)')
      .eq('id', canteenId)
      .single();

    const inst = canteen?.institutes as unknown as { is_active_subscriber?: boolean } | null;
    if (inst && inst.is_active_subscriber === false) {
      return NextResponse.json({ data: [] });
    }

    let query = supabase
      .from('menu_items')
      .select('*, category:categories(id, name)')
      .eq('canteen_id', canteenId)
      .eq('is_available', true)
      .order('sort_order', { ascending: true })
      .limit(Math.min(limit, 200));

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    if (isVeg !== null) {
      query = query.eq('is_veg', isVeg === 'true');
    }

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    // is_featured not in schema — ignore the filter but don't break

    const { data, error } = await query;

    if (error) {
      console.error('[canteens menu-items] DB error:', error);
      return NextResponse.json(
        { error: 'database_error' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    console.error('Menu items route error:', err);
    return NextResponse.json(
      { error: 'internal_error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
