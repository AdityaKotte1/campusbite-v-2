import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyKioskHmac, isTimestampValid } from '@/lib/kiosk-auth';
import { decryptApiKey } from '@/lib/encryption';
import { MAX_KIOSK_CACHE_TOKENS } from '@/lib/constants';

/**
 * POST /api/v1/kiosk/cache
 * Body: { canteen_id: string }
 *
 * Returns up to MAX_KIOSK_CACHE_TOKENS active (non-expired, status='active') QR tokens
 * for the given canteen so the kiosk can work offline.
 *
 * Only tokens for 'ready' orders are included (student is at canteen to pick up).
 */
export async function POST(request: NextRequest) {
  const kioskId = request.headers.get('X-Kiosk-ID');
  const timestamp = request.headers.get('X-Kiosk-Timestamp');
  const signature = request.headers.get('X-Kiosk-Signature');

  if (!kioskId || !timestamp || !signature) {
    return NextResponse.json(
      { success: false, error: { code: 'MISSING_AUTH_HEADERS', message: 'Missing authentication headers' } },
      { status: 401 }
    );
  }

  if (!isTimestampValid(timestamp)) {
    return NextResponse.json(
      { success: false, error: { code: 'TIMESTAMP_INVALID', message: 'Timestamp out of valid window' } },
      { status: 401 }
    );
  }

  const rawBody = await request.text();
  let body: { canteen_id?: string } = {};
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_BODY', message: 'Invalid JSON body' } },
      { status: 400 }
    );
  }

  const service = createServiceClient();

  const { data: kiosk } = await service
    .from('kiosks')
    .select('id, canteen_id, api_key_encrypted, is_active')
    .eq('id', kioskId)
    .single();

  if (!kiosk?.is_active) {
    return NextResponse.json(
      { success: false, error: { code: 'KIOSK_NOT_FOUND', message: 'Kiosk not found or inactive' } },
      { status: 401 }
    );
  }

  let apiKey: string;
  try {
    apiKey = await decryptApiKey(kiosk.api_key_encrypted);
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'AUTH_ERROR', message: 'Authentication error' } },
      { status: 500 }
    );
  }

  const hmacValid = await verifyKioskHmac({
    method: 'POST',
    path: '/api/v1/kiosk/cache',
    timestamp,
    body: rawBody,
    signature,
    apiKey,
  });

  if (!hmacValid) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_SIGNATURE', message: 'HMAC verification failed' } },
      { status: 401 }
    );
  }

  // SECURITY: the cache must ONLY ever return the authenticated kiosk's OWN
  // canteen tokens. Never trust a client-supplied canteen_id — doing so would
  // leak another canteen's live QR tokens.
  const canteenId = kiosk.canteen_id;

  const now = new Date().toISOString();

  // Fetch active tokens with full order details so kiosk can print receipts offline
  const { data: tokens, error } = await service
    .from('qr_tokens')
    .select(`
      token, expires_at, order_id,
      orders!inner(
        order_number, status, canteen_id, subtotal_paise, tax_paise, discount_paise, total_paise,
        canteens!inner(name),
        order_items(menu_item_name, quantity, unit_price_paise, total_price_paise)
      )
    `)
    .eq('status', 'active')
    .eq('orders.canteen_id', canteenId)
    .eq('orders.status', 'ready')
    .gt('expires_at', now)
    .order('expires_at', { ascending: true })
    .limit(MAX_KIOSK_CACHE_TOKENS);

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    );
  }

  const cachePayload = (tokens ?? []).map((t) => {
    const order = t.orders as unknown as {
      order_number: string;
      subtotal_paise: number;
      tax_paise: number;
      discount_paise: number;
      total_paise: number;
      canteens: { name: string };
      order_items: { menu_item_name: string; quantity: number; unit_price_paise: number; total_price_paise: number }[];
    };
    return {
      token: t.token,
      expires_at: t.expires_at,
      order_id: t.order_id,
      order_data: {
        order_number: order.order_number,
        canteen_name: order.canteens?.name ?? '',
        items: (order.order_items ?? []).map((i) => ({
          name: i.menu_item_name,
          quantity: i.quantity,
          unit_price_paise: i.unit_price_paise,
          total_price_paise: i.total_price_paise,
        })),
        subtotal_paise: order.subtotal_paise,
        tax_paise: order.tax_paise,
        discount_paise: order.discount_paise,
        total_paise: order.total_paise,
      },
    };
  });

  return NextResponse.json({
    success: true,
    data: {
      tokens: cachePayload,
      count: cachePayload.length,
      generated_at: now,
    },
  });
}
