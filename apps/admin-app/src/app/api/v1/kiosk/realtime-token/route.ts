import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { authenticateKiosk } from '@/lib/kiosk-auth';

/**
 * GET /api/v1/kiosk/realtime-token
 *
 * Kiosk-HMAC authed. Mints a short-lived (1h) canteen-scoped Supabase JWT the
 * kiosk uses to subscribe to realtime print-job notifications. The JWT carries
 * `kiosk_canteen_id` so RLS / realtime policies can scope to this canteen only.
 *
 * HMAC payload: GET\n/api/v1/kiosk/realtime-token\n{timestamp}\n{sha256(body)}
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateKiosk(request, '/api/v1/kiosk/realtime-token', 'GET');
  if ('response' in auth) return auth.response;
  const { kiosk } = auth;

  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (!jwtSecret) {
    console.error('[kiosk/realtime-token] SUPABASE_JWT_SECRET is not set');
    return NextResponse.json(
      { success: false, error: { code: 'JWT_SECRET_MISSING', message: 'Realtime token signing is not configured' } },
      { status: 500 }
    );
  }

  const secret = new TextEncoder().encode(jwtSecret);
  const jwt = await new SignJWT({ role: 'authenticated', kiosk_canteen_id: kiosk.canteen_id })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .setAudience('authenticated')
    .sign(secret);

  return NextResponse.json({
    success: true,
    data: {
      token: jwt,
      expires_in: 3600,
      supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      anon_key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
  });
}
