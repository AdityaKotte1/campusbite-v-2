import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const ADMIN_ROLES = ['super_admin', 'canteen_admin', 'staff'] as const;
type AdminRole = typeof ADMIN_ROLES[number];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === '/login';
  const isAuthCallback = pathname.startsWith('/auth/');
  const isApiRoute = pathname.startsWith('/api/v1/kiosk/');
  const isHealthCheck = pathname === '/api/health';
  const isRoot = pathname === '/';

  // Allow kiosk API routes and the public health check without session check
  if (isApiRoute || isHealthCheck) {
    return supabaseResponse;
  }

  // Redirect root to dashboard
  if (isRoot) {
    if (user) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // If on login page and already authenticated, check role and redirect
  if (isLoginPage && user) {
    const { data: profile } = await supabase
      .from('users')
      .select('role, is_active')
      .eq('id', user.id)
      .single();

    if (
      profile &&
      ADMIN_ROLES.includes(profile.role as AdminRole) &&
      profile.is_active
    ) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    // Not an admin — sign out and stay on login with error
    await supabase.auth.signOut();
    return NextResponse.redirect(
      new URL('/login?error=unauthorized', request.url)
    );
  }

  // Allow auth callbacks without session check
  if (isAuthCallback) {
    return supabaseResponse;
  }

  // Protected routes
  if (!isLoginPage) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Validate role and active status
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('role, is_active')
      .eq('id', user.id)
      .single();

    // Debug log — visible in admin-app terminal (remove after confirmed working)
    console.log('[admin middleware]', {
      path: pathname,
      userId: user.id,
      profile,
      profileError: profileError?.message,
    });

    if (
      !profile ||
      !ADMIN_ROLES.includes(profile.role as AdminRole) ||
      !profile.is_active
    ) {
      await supabase.auth.signOut();
      return NextResponse.redirect(
        new URL('/login?error=unauthorized', request.url)
      );
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
