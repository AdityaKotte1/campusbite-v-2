import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // SECURITY: prevent open redirects. Resolve `next` against our origin and
      // only accept it if it stays same-origin. This defeats prefix-check
      // bypasses like `/%09/evil.com` (the URL parser strips the tab and
      // resolves to `//evil.com`), absolute URLs, and userinfo tricks.
      const target = new URL(next ?? '/', origin);
      const safeNext = target.origin === origin ? target.pathname + target.search : '/dashboard';
      return NextResponse.redirect(new URL(safeNext, origin));
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
