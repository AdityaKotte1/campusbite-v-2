import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

// Daily cron (Vercel Cron) — lapses subscriptions past their period (→ past_due,
// then expired after the 5-day grace). The DB trigger flips is_active_subscriber,
// which removes lapsed institutes from the student app automatically.
//
// Secured by CRON_SECRET: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });
    }
  }

  const service = createServiceClient();
  const { error } = await service.rpc('expire_due_subscriptions');
  if (error) {
    return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: error.message } }, { status: 500 });
  }

  return NextResponse.json({ success: true, ran_at: new Date().toISOString() });
}
