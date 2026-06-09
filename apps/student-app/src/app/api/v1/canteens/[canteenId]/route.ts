import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface Params {
  params: { canteenId: string };
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { canteenId } = params;

    if (!canteenId) {
      return NextResponse.json(
        { error: 'bad_request', message: 'Canteen ID is required' },
        { status: 400 }
      );
    }

    const supabase = createClient();

    const { data, error } = await supabase
      .from('canteens')
      .select('*, institute:institutes(id, name, code:short_name, city, state)')
      .eq('id', canteenId)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: 'not_found', message: 'Canteen not found' },
        { status: 404 }
      );
    }

    // If the user is logged in and has an institute assigned,
    // ensure they can only access canteens in their own institute.
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('users')
        .select('institute_id')
        .eq('id', user.id)
        .single();

      if (profile?.institute_id && profile.institute_id !== data.institute_id) {
        return NextResponse.json(
          { error: 'forbidden', message: 'This canteen does not belong to your institute' },
          { status: 403 }
        );
      }
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error('Canteen detail route error:', err);
    return NextResponse.json(
      { error: 'internal_error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
