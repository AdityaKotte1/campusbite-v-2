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
      return NextResponse.json(
        { error: 'database_error', message: error.message },
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
