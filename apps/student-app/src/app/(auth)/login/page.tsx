'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Loader2, Mail, Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { loginSchema, type LoginInput } from '@/lib/validation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') ?? '/';
  const supabase = createClient();

  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isOAuthLoading, setIsOAuthLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(data: LoginInput) {
    setServerError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        setServerError('Invalid email or password. Please try again.');
      } else if (error.message.includes('Email not confirmed')) {
        setServerError(
          'Please verify your email address before signing in. Check your inbox.'
        );
      } else {
        setServerError(error.message);
      }
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  async function handleGoogleLogin() {
    setIsOAuthLoading(true);
    setServerError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
      },
    });
    if (error) {
      setServerError(error.message);
      setIsOAuthLoading(false);
    }
  }

  return (
    <>
      <div className="mb-6">
        <p className="eyebrow text-brand mb-1.5">Welcome back</p>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-text mb-1.5">
          Sign in to MunchAdda
        </h1>
        <div className="rule-amber mb-3" />
        <p className="text-text-2 text-sm">Skip the queue. Pick up where you left off.</p>
      </div>

      {/* Google OAuth */}
      <Button
        type="button"
        variant="secondary"
        size="lg"
        onClick={handleGoogleLogin}
        disabled={isOAuthLoading || isSubmitting}
        className="w-full mb-5 cursor-pointer"
      >
        {isOAuthLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M19.6 10.227c0-.709-.064-1.39-.182-2.045H10v3.868h5.382a4.6 4.6 0 0 1-1.996 3.018v2.51h3.232c1.891-1.742 2.982-4.305 2.982-7.35Z"
              fill="#4285F4"
            />
            <path
              d="M10 20c2.7 0 4.964-.895 6.618-2.423l-3.232-2.509c-.895.6-2.04.955-3.386.955-2.605 0-4.81-1.759-5.596-4.123H1.064v2.59A9.996 9.996 0 0 0 10 20Z"
              fill="#34A853"
            />
            <path
              d="M4.404 11.9a6.003 6.003 0 0 1 0-3.8V5.51H1.064a10.003 10.003 0 0 0 0 9.982l3.34-3.591Z"
              fill="#FBBC04"
            />
            <path
              d="M10 3.977c1.468 0 2.786.505 3.822 1.496l2.868-2.869C14.959 .99 12.695 0 10 0A9.996 9.996 0 0 0 1.064 5.51L4.404 8.1C5.19 5.736 7.395 3.977 10 3.977Z"
              fill="#E8390E"
            />
          </svg>
        )}
        {isOAuthLoading ? 'Redirecting...' : 'Continue with Google'}
      </Button>

      {/* Divider */}
      <div className="relative mb-5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-surface px-3 text-text-3">or sign in with email</span>
        </div>
      </div>

      {/* Error Banner */}
      {serverError && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2">
          <svg
            className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <p className="text-sm text-red-700">{serverError}</p>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {/* Email */}
        <Input
          {...register('email')}
          label="Email address"
          type="email"
          autoComplete="email"
          placeholder="you@college.edu"
          leftIcon={<Mail className="w-4 h-4" />}
          error={errors.email?.message}
        />

        {/* Password */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="login-password" className="block text-sm font-medium text-text-2">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs text-brand hover:text-brand-dark transition-colors cursor-pointer"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            {...register('password')}
            id="login-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Enter your password"
            leftIcon={<Lock className="w-4 h-4" />}
            error={errors.password?.message}
            rightIcon={
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                className="text-text-3 hover:text-text-2 transition-colors cursor-pointer"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            }
          />
        </div>

        {/* Submit */}
        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting || isOAuthLoading}
          className="w-full mt-1 cursor-pointer"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Signing in...
            </>
          ) : (
            'Sign in'
          )}
        </Button>
      </form>

      {/* Register link */}
      <p className="mt-5 text-center text-sm text-text-2">
        Don&apos;t have an account?{' '}
        <Link
          href="/register"
          className="text-brand font-semibold hover:text-brand-dark transition-colors"
        >
          Create account
        </Link>
      </p>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
