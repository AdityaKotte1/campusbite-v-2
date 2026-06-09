'use client';

import { useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store/auth-store';
import type { User } from '@/types';

export function useAuth() {
  const { user, isAuthenticated, isLoading, setUser, clearUser, setLoading } =
    useAuthStore();
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    // Get initial session
    setLoading(true);
    supabase.auth.getUser().then(({ data: { user: authUser } }) => {
      if (authUser) {
        // Fetch full profile
        supabase
          .from('users')
          .select('*, institute:institutes(*)')
          .eq('id', authUser.id)
          .single()
          .then(({ data }) => {
            if (data) {
              setUser(data as User);
            } else {
              // Fallback minimal user from auth
              setUser({
                id: authUser.id,
                email: authUser.email ?? '',
                full_name:
                  authUser.user_metadata?.full_name ??
                  authUser.email?.split('@')[0] ??
                  'User',
                avatar_url: authUser.user_metadata?.avatar_url ?? null,
                phone: null,
                role: 'student',
                institute_id: null,
                is_active: true,
                created_at: authUser.created_at,
                updated_at: authUser.updated_at ?? authUser.created_at,
              });
            }
          });
      } else {
        clearUser();
      }
    });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const { data } = await supabase
          .from('users')
          .select('*, institute:institutes(*)')
          .eq('id', session.user.id)
          .single();

        if (data) {
          setUser(data as User);
        } else {
          setUser({
            id: session.user.id,
            email: session.user.email ?? '',
            full_name:
              session.user.user_metadata?.full_name ??
              session.user.email?.split('@')[0] ??
              'User',
            avatar_url: session.user.user_metadata?.avatar_url ?? null,
            phone: null,
            role: 'student',
            institute_id: null,
            is_active: true,
            created_at: session.user.created_at,
            updated_at: session.user.updated_at ?? session.user.created_at,
          });
        }
      } else if (event === 'SIGNED_OUT') {
        clearUser();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = useCallback(async () => {
    setLoading(true);
    await supabase.auth.signOut();
    clearUser();
    router.push('/login');
  }, [supabase, clearUser, router, setLoading]);

  return {
    user,
    isAuthenticated,
    loading: isLoading,
    signOut,
  };
}
