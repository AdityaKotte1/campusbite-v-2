import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateOrderNumber } from '@/lib/formatting';
import { TAX_RATE } from '@/lib/constants';
import { orderLimiter } from '@/lib/rate-limit';

export async function GET(request: Request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'unauthorized', message: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const perPage = parseInt(searchParams.get('per_page') ?? '20', 10);
    const offset = (page - 1) * perPage;

    let query = supabase
      .from('orders')
      .select('*, canteen:canteens(id, name), items:order_items(id, menu_item_id, name:menu_item_name, price_paise:unit_price_paise, quantity, subtotal_paise:total_price_paise, special_note:customization_notes)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + perPage - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[orders GET] DB error:', JSON.stringify(error));
      return NextResponse.json({ error: 'database_error', message: error.message, detail: error.details }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    console.error('Orders GET error:', err);
    return NextResponse.json({ error: 'internal_error', message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'unauthorized', message: 'Not authenticated' }, { status: 401 });
    }

    const limit = orderLimiter(user.id);
    if (!limit.allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'RATE_LIMITED', message: 'Too many order requests. Please wait.' } },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((limit.resetAt - Date.now()) / 1000)) } }
      );
    }

    const body = await request.json();
    const { canteen_id, items, special_instructions, coupon_code } = body;

    if (!canteen_id || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'bad_request', message: 'Invalid order data' }, { status: 400 });
    }

    // Verify canteen exists and is open
    const { data: canteen, error: canteenErr } = await supabase
      .from('canteens')
      .select('id, is_open, is_active, institute_id, institutes(is_active_subscriber)')
      .eq('id', canteen_id)
      .single();

    if (canteenErr || !canteen) {
      return NextResponse.json({ error: 'not_found', message: 'Canteen not found' }, { status: 404 });
    }

    // Subscription gating: block new orders if the institute's subscription lapsed.
    const inst = canteen.institutes as unknown as { is_active_subscriber?: boolean } | null;
    if (inst && inst.is_active_subscriber === false) {
      return NextResponse.json({ error: 'institute_inactive', message: 'Ordering is currently unavailable for this canteen.' }, { status: 403 });
    }

    if (!canteen.is_active) {
      return NextResponse.json({ error: 'canteen_inactive', message: 'This canteen is not accepting orders' }, { status: 400 });
    }

    if (!canteen.is_open) {
      return NextResponse.json({ error: 'canteen_closed', message: 'This canteen is currently closed' }, { status: 400 });
    }

    // Fetch menu items (include stock fields)
    const menuItemIds = items.map((i: { menu_item_id: string }) => i.menu_item_id);
    const { data: menuItems, error: menuErr } = await supabase
      .from('menu_items')
      .select('id, name, price_paise, is_available, canteen_id, stock_enabled, stock_count')
      .in('id', menuItemIds)
      .eq('canteen_id', canteen_id);

    if (menuErr) {
      return NextResponse.json({ error: 'database_error', message: menuErr.message }, { status: 500 });
    }

    // Validate all items (availability + stock pre-check)
    const menuItemMap = new Map(menuItems?.map((m) => [m.id, m]) ?? []);
    for (const item of items) {
      const menuItem = menuItemMap.get(item.menu_item_id);
      if (!menuItem) {
        return NextResponse.json({ error: 'item_not_found', message: `Item ${item.menu_item_id} not found` }, { status: 400 });
      }
      if (!menuItem.is_available) {
        return NextResponse.json({ error: 'item_unavailable', message: `${menuItem.name} is currently unavailable` }, { status: 400 });
      }
      // Pre-check stock before creating the order (the atomic decrement happens after)
      if (menuItem.stock_enabled && menuItem.stock_count !== null && menuItem.stock_count < item.quantity) {
        const available = menuItem.stock_count;
        return NextResponse.json({
          error: 'insufficient_stock',
          message: available === 0
            ? `${menuItem.name} is sold out`
            : `Only ${available} unit${available === 1 ? '' : 's'} of ${menuItem.name} available`,
        }, { status: 400 });
      }
    }

    // Calculate totals
    let subtotalPaise = 0;
    const orderItemsData = items.map((item: { menu_item_id: string; quantity: number; special_note?: string }) => {
      const menuItem = menuItemMap.get(item.menu_item_id)!;
      const subtotal = menuItem.price_paise * item.quantity;
      subtotalPaise += subtotal;
      return {
        menu_item_id: item.menu_item_id,
        menu_item_name: menuItem.name,
        unit_price_paise: menuItem.price_paise,
        quantity: item.quantity,
        total_price_paise: subtotal,
        customization_notes: item.special_note ?? null,
      };
    });

    const taxPaise = Math.round(subtotalPaise * TAX_RATE);
    let discountPaise = 0;

    // Validate coupon
    if (coupon_code) {
      const { data: coupon } = await supabase
        .from('coupons')
        .select('*')
        .eq('code', coupon_code.toUpperCase())
        .eq('is_active', true)
        .lte('valid_from', new Date().toISOString())
        .gte('valid_until', new Date().toISOString())
        .single();

      if (coupon && subtotalPaise >= coupon.min_order_paise) {
        if (coupon.usage_limit === null || coupon.used_count < coupon.usage_limit) {
          discountPaise =
            coupon.discount_type === 'percentage'
              ? Math.min(
                  Math.round((subtotalPaise * coupon.discount_value) / 100),
                  coupon.max_discount_paise ?? Infinity
                )
              : coupon.discount_value * 100;
        }
      }
    }

    const totalPaise = Math.max(0, subtotalPaise + taxPaise - discountPaise);
    const orderNumber = generateOrderNumber();

    // Create order
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        user_id: user.id,
        canteen_id,
        status: 'payment_pending',
        payment_status: 'pending',
        subtotal_paise: subtotalPaise,
        tax_paise: taxPaise,
        discount_paise: discountPaise,
        total_paise: totalPaise,
        coupon_code: coupon_code ?? null,
        special_instructions: special_instructions ?? null,
      })
      .select()
      .single();

    if (orderErr || !order) {
      return NextResponse.json({ error: 'create_failed', message: orderErr?.message ?? 'Failed to create order' }, { status: 500 });
    }

    // Create order items
    const { error: itemsErr } = await supabase
      .from('order_items')
      .insert(orderItemsData.map((item: Record<string, unknown>) => ({ ...item, order_id: order.id })));

    if (itemsErr) {
      // Rollback order
      await supabase.from('orders').delete().eq('id', order.id);
      return NextResponse.json({ error: 'items_create_failed', message: itemsErr.message }, { status: 500 });
    }

    // Atomically decrement stock for each item that has stock tracking on
    for (const item of items) {
      const menuItem = menuItemMap.get(item.menu_item_id)!;
      if (menuItem.stock_enabled) {
        const { data: stockResult } = await supabase.rpc('decrement_item_stock', {
          p_menu_item_id: item.menu_item_id,
          p_quantity: item.quantity,
        });
        // If stock ran out between our pre-check and now (race condition), rollback
        if (stockResult && !stockResult.success && stockResult.error === 'INSUFFICIENT_STOCK') {
          await supabase.from('order_items').delete().eq('order_id', order.id);
          await supabase.from('orders').delete().eq('id', order.id);
          return NextResponse.json({
            error: 'insufficient_stock',
            message: `${menuItem.name} just sold out. Please update your cart.`,
          }, { status: 409 });
        }
      }
    }

    // Update coupon usage
    if (coupon_code && discountPaise > 0) {
      await supabase.rpc('increment_coupon_usage', { coupon_code: coupon_code.toUpperCase() });
    }

    return NextResponse.json({ data: order }, { status: 201 });
  } catch (err) {
    console.error('Orders POST error:', err);
    return NextResponse.json({ error: 'internal_error', message: 'Internal server error' }, { status: 500 });
  }
}
