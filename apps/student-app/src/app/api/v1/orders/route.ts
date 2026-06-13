import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { generateOrderNumber } from '@/lib/formatting';
import { TAX_RATE } from '@/lib/constants';
import { orderLimiter } from '@/lib/rate-limit';

const orderItemSchema = z.object({
  menu_item_id: z.string().uuid(),
  quantity: z.number().int().positive().max(50),
  special_note: z.string().max(500).optional().nullable(),
});

const createOrderSchema = z.object({
  canteen_id: z.string().uuid(),
  items: z.array(orderItemSchema).min(1).max(50),
  special_instructions: z.string().max(1000).optional().nullable(),
  coupon_code: z.string().max(64).optional().nullable(),
});

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
      return NextResponse.json({ error: 'database_error' }, { status: 500 });
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

    const limit = await orderLimiter(user.id);
    if (!limit.allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'RATE_LIMITED', message: 'Too many order requests. Please wait.' } },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((limit.resetAt - Date.now()) / 1000)) } }
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: 'bad_request', message: 'Invalid JSON' }, { status: 400 });
    }

    // FIX: validate the request shape before any DB work.
    const parsed = createOrderSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'validation_error', message: parsed.error.errors[0].message },
        { status: 400 }
      );
    }
    const { canteen_id, items, special_instructions, coupon_code } = parsed.data;

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
    const menuItemIds = items.map((i) => i.menu_item_id);
    const { data: menuItems, error: menuErr } = await supabase
      .from('menu_items')
      .select('id, name, price_paise, is_available, canteen_id, stock_enabled, stock_count')
      .in('id', menuItemIds)
      .eq('canteen_id', canteen_id);

    if (menuErr) {
      console.error('[orders POST] menu fetch error:', menuErr);
      return NextResponse.json({ error: 'database_error' }, { status: 500 });
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
    const orderItemsData = items.map((item) => {
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
    let claimedCouponId: string | null = null;

    // Validate + atomically claim the coupon in a single locked DB call.
    // claim_coupon (SECURITY DEFINER) enforces canteen scope, min-order, the
    // GLOBAL usage_limit, and the per-user limit, and reserves a global slot —
    // closing the unlimited-redemption and per-user-bypass holes. Called via
    // the service client because it updates coupons.used_count, which students
    // cannot write under RLS.
    if (coupon_code) {
      const svc = createServiceClient();
      const { data: claim, error: claimErr } = await svc.rpc('claim_coupon', {
        p_code: coupon_code,
        p_user_id: user.id,
        p_subtotal_paise: subtotalPaise,
        p_canteen_id: canteen_id,
      });

      if (claimErr) {
        console.error('[orders POST] claim_coupon error:', claimErr);
        return NextResponse.json(
          { error: 'coupon_error', message: 'Could not apply this coupon. Please try again.' },
          { status: 400 }
        );
      }

      if (claim?.valid) {
        discountPaise = claim.discount_paise ?? 0;
        claimedCouponId = claim.coupon_id ?? null;
      } else {
        const messages: Record<string, string> = {
          COUPON_NOT_FOUND: 'This coupon is invalid or has expired.',
          NOT_APPLICABLE: 'This coupon is not valid for this canteen.',
          ORDER_TOO_SMALL: 'Your order does not meet this coupon’s minimum.',
          EXHAUSTED: 'This coupon is no longer available.',
          USER_LIMIT: 'You have already used this coupon.',
        };
        return NextResponse.json(
          {
            error: 'coupon_invalid',
            message: messages[claim?.error as string] ?? 'This coupon could not be applied.',
          },
          { status: 400 }
        );
      }
    }

    // If anything below fails after the coupon slot was reserved, hand the slot
    // back so a failed order doesn't permanently consume a redemption.
    const releaseCoupon = async () => {
      if (claimedCouponId) {
        await createServiceClient().rpc('release_coupon', { p_coupon_id: claimedCouponId });
      }
    };

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
      console.error('[orders POST] order create error:', orderErr);
      await releaseCoupon();
      return NextResponse.json({ error: 'create_failed' }, { status: 500 });
    }

    // Create order items
    const { error: itemsErr } = await supabase
      .from('order_items')
      .insert(orderItemsData.map((item: Record<string, unknown>) => ({ ...item, order_id: order.id })));

    if (itemsErr) {
      console.error('[orders POST] order items create error:', itemsErr);
      // Rollback order
      await supabase.from('orders').delete().eq('id', order.id);
      await releaseCoupon();
      return NextResponse.json({ error: 'items_create_failed' }, { status: 500 });
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
          await releaseCoupon();
          return NextResponse.json({
            error: 'insufficient_stock',
            message: `${menuItem.name} just sold out. Please update your cart.`,
          }, { status: 409 });
        }
      }
    }

    // Record the redemption (per-user enforcement counts these rows + audit).
    // The global slot was already reserved atomically by claim_coupon above.
    if (claimedCouponId) {
      const { error: redemptionErr } = await createServiceClient()
        .from('user_coupons')
        .insert({
          user_id: user.id,
          coupon_id: claimedCouponId,
          order_id: order.id,
          discount_applied_paise: discountPaise,
        });
      if (redemptionErr) {
        // Non-fatal: the order is valid and the discount already applied. Log
        // for reconciliation rather than failing a paid-for order.
        console.error('[orders POST] user_coupons insert error:', redemptionErr);
      }
    }

    return NextResponse.json({ data: order }, { status: 201 });
  } catch (err) {
    console.error('Orders POST error:', err);
    return NextResponse.json({ error: 'internal_error', message: 'Internal server error' }, { status: 500 });
  }
}
