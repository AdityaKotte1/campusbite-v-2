import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED_ROUTES = ['/orders', '/cart', '/profile', '/checkout'];
const AUTH_ROUTES = ['/login', '/register'];
const PUBLIC_ROUTES = ['/onboarding', '/api', '/legal'];

export async function middleware(request: NextRequest) {
  // Skip if Supabase is not configured (local dev without .env.local)
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://your-project.supabase.co'
  ) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as Parameters<typeof supabaseResponse.cookies.set>[2])
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  const isProtectedRoute = PROTECTED_ROUTES.some((r) => pathname.startsWith(r));
  const isAuthRoute = AUTH_ROUTES.some((r) => pathname.startsWith(r));
  const isPublicRoute = PUBLIC_ROUTES.some((r) => pathname.startsWith(r));

  // 1. Not logged in → redirect to login for protected routes
  if (isProtectedRoute && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }

  // 2. Already logged in → redirect away from auth pages
  if (isAuthRoute && user) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  // 3. Logged in but skip onboarding check for api/public/auth routes
  if (!user || isPublicRoute || isAuthRoute) {
    return supabaseResponse;
  }

  // 4. Logged in — check if institute is set (skip if already on /onboarding)
  if (pathname === '/onboarding') {
    return supabaseResponse;
  }

  // Fetch user profile to check institute_id
  // Wrapped in try/catch in case the users table doesn't exist yet (DB not set up)
  try {
    const { data: profile } = await supabase
      .from('users')
      .select('institute_id')
      .eq('id', user.id)
      .single();

    // Redirect to onboarding if:
    // - No profile row found (registered before DB was set up, trigger missed)
    // - Profile exists but institute_id is null (normal new user)
    if (!profile || !profile.institute_id) {
      const url = request.nextUrl.clone();
      url.pathname = '/onboarding';
      return NextResponse.redirect(url);
    }
  } catch {
    // DB not reachable or table missing — let the request through
    return supabaseResponse;
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|\\.well-known|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
