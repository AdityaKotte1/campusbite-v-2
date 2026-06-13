import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';

// Constant-time comparison of the provided Authorization header against the
// expected `Bearer <secret>` value, with a length guard so timingSafeEqual
// never throws on mismatched buffer lengths.
function isAuthorized(authHeader: string | null, secret: string): boolean {
  if (!authHeader) return false;
  const expected = Buffer.from(`Bearer ${secret}`, 'utf8');
  const provided = Buffer.from(authHeader, 'utf8');
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

// Daily cron (Vercel Cron) — lapses subscriptions past their period (→ past_due,
// then expired after the 5-day grace). The DB trigger flips is_active_subscriber,
// which removes lapsed institutes from the student app automatically.
//
// Secured by CRON_SECRET: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
export async function GET(request: NextRequest) {
  // Fail CLOSED: if no secret is configured the endpoint must not run.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_CONFIGURED', message: 'CRON_SECRET is not configured' } },
      { status: 500 }
    );
  }

  if (!isAuthorized(request.headers.get('authorization'), secret)) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
      { status: 401 }
    );
  }

  const service = createServiceClient();
  const { error } = await service.rpc('expire_due_subscriptions');
  if (error) {
    return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: error.message } }, { status: 500 });
  }

  return NextResponse.json({ success: true, ran_at: new Date().toISOString() });
}
