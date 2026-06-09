import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  if (error) {
    const errorUrl = new URL('/login', origin);
    errorUrl.searchParams.set('error', errorDescription ?? error);
    return NextResponse.redirect(errorUrl);
  }

  if (code) {
    const supabase = createClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (!exchangeError) {
      // Ensure next is a relative path to prevent open redirects
      const safeNext = next.startsWith('/') ? next : '/';
      return NextResponse.redirect(`${origin}${safeNext}`);
    }

    const errorUrl = new URL('/login', origin);
    errorUrl.searchParams.set('error', 'Authentication failed. Please try again.');
    return NextResponse.redirect(errorUrl);
  }

  // No code — redirect to error
  const errorUrl = new URL('/login', origin);
  errorUrl.searchParams.set('error', 'No authentication code received.');
  return NextResponse.redirect(errorUrl);
}
