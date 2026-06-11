import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Public — no auth required. Students need this to complete onboarding.
export async function GET() {
  try {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('institutes')
      .select('id, name, code:short_name, city, state, logo_url')
      .eq('is_active', true)
      .eq('is_active_subscriber', true) // hide institutes without an active subscription
      .order('name', { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: 'database_error', message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    console.error('[institutes]', err);
    return NextResponse.json(
      { error: 'internal_error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
