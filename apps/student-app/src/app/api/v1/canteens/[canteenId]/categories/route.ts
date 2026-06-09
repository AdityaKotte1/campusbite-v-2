import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface Params {
  params: { canteenId: string };
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { canteenId } = params;
    const supabase = createClient();

    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('canteen_id', canteenId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: 'database_error', message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    console.error('Categories route error:', err);
    return NextResponse.json(
      { error: 'internal_error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
