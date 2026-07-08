import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const isOpen = searchParams.get('is_open');
    const limit = parseInt(searchParams.get('limit') ?? '20', 10);

    const supabase = createClient();

    // Get the logged-in user's institute_id to scope canteens
    let instituteId: string | null = null;
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from('users')
        .select('institute_id')
        .eq('id', user.id)
        .single();

      instituteId = profile?.institute_id ?? null;
    }

    let query = supabase
      .from('canteens')
      .select('*, institute:institutes(id, name, code:short_name, city, state)')
      .eq('is_active', true)
      .eq('billing_state', 'active') // never surface an unpaid/pending canteen to students
      .order('name', { ascending: true })
      .limit(Math.min(limit, 50));

    // Subscription gating: only surface canteens whose institute is an active
    // subscriber. (Two-step keeps the query simple and avoids embedded-filter
    // ambiguity; institutes are few per tenant, so this is cheap.)
    const { data: activeInsts } = await supabase
      .from('institutes')
      .select('id')
      .eq('is_active_subscriber', true);
    const activeIds = (activeInsts ?? []).map((r) => r.id as string);

    if (instituteId) {
      // A scoped user whose institute lapsed sees nothing.
      if (!activeIds.includes(instituteId)) {
        return NextResponse.json({ data: [], meta: { institute_id: instituteId, scoped: true, inactive_subscription: true } });
      }
      query = query.eq('institute_id', instituteId);
    } else {
      // Sentinel id ensures "no active subscribers" returns nothing, not all.
      query = query.in('institute_id', activeIds.length ? activeIds : ['00000000-0000-0000-0000-000000000000']);
    }

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    if (isOpen !== null) {
      query = query.eq('is_open', isOpen === 'true');
    }

    const { data, error } = await query;

    if (error) {
      console.error('Canteens fetch error:', error);
      return NextResponse.json(
        { error: 'database_error' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: data ?? [],
      meta: {
        institute_id: instituteId,
        scoped: !!instituteId,
      },
    });
  } catch (err) {
    console.error('Canteens route error:', err);
    return NextResponse.json(
      { error: 'internal_error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
