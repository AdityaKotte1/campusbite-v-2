import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'unauthorized', message: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { code, canteen_id } = body;

    if (!code) {
      return NextResponse.json({ error: 'bad_request', message: 'Coupon code is required' }, { status: 400 });
    }

    const now = new Date().toISOString();

    const { data: coupon, error: couponErr } = await supabase
      .from('coupons')
      .select('*')
      .eq('code', code.toUpperCase().trim())
      .eq('is_active', true)
      .lte('valid_from', now)
      .gte('valid_until', now)
      .single();

    if (couponErr || !coupon) {
      return NextResponse.json({
        error: 'invalid_coupon',
        message: 'This coupon code is invalid or expired',
      }, { status: 404 });
    }

    // Check canteen restriction
    if (coupon.canteen_id && canteen_id && coupon.canteen_id !== canteen_id) {
      return NextResponse.json({
        error: 'coupon_not_applicable',
        message: 'This coupon is not valid for this canteen',
      }, { status: 400 });
    }

    // Check usage limit
    if (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit) {
      return NextResponse.json({
        error: 'coupon_exhausted',
        message: 'This coupon has reached its usage limit',
      }, { status: 400 });
    }

    return NextResponse.json({
      data: {
        id: coupon.id,
        code: coupon.code,
        description: coupon.description,
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value,
        min_order_paise: coupon.min_order_paise,
        max_discount_paise: coupon.max_discount_paise,
        valid_until: coupon.valid_until,
      },
    });
  } catch (err) {
    console.error('Coupon validate error:', err);
    return NextResponse.json({ error: 'internal_error', message: 'Internal server error' }, { status: 500 });
  }
}
