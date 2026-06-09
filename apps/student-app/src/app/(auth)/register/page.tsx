'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Loader2, Mail, Lock, User } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { registerSchema, type RegisterInput } from '@/lib/validation';

export default function RegisterPage() {
  const router = useRouter();
  const supabase = createClient();

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isOAuthLoading, setIsOAuthLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { accept_terms: false },
  });

  async function onSubmit(data: RegisterInput) {
    setServerError(null);
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: { full_name: data.full_name },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      if (error.message.includes('already registered')) {
        setServerError(
          'An account with this email already exists. Please sign in instead.'
        );
      } else {
        setServerError(error.message);
      }
      return;
    }

    setIsSuccess(true);
  }

  async function handleGoogleLogin() {
    setIsOAuthLoading(true);
    setServerError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setServerError(error.message);
      setIsOAuthLoading(false);
    }
  }

  if (isSuccess) {
    return (
      <div className="text-center py-4">
        <div className="w-16 h-16 bg-green-light rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-8 h-8 text-green"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-text mb-2">Check your email!</h2>
        <p className="text-text-2 text-sm mb-6">
          We&apos;ve sent a verification link to your email. Click it to activate your
          account and start ordering.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-brand text-white font-semibold text-sm hover:bg-brand-dark transition-colors"
        >
          Back to Sign In
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text mb-1">Create account</h1>
        <p className="text-text-2 text-sm">Join CampusBite and order from your canteen</p>
      </div>

      {/* Google OAuth */}
      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={isOAuthLoading || isSubmitting}
        className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border-2 border-border hover:border-brand hover:bg-brand-pale transition-all duration-150 text-text font-medium text-sm mb-5 disabled:opacity-60 disabled:cursor-not-allowed"
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
              d="M10 3.977c1.468 0 2.786.505 3.822 1.496l2.868-2.869C14.959.99 12.695 0 10 0A9.996 9.996 0 0 0 1.064 5.51L4.404 8.1C5.19 5.736 7.395 3.977 10 3.977Z"
              fill="#E8390E"
            />
          </svg>
        )}
        {isOAuthLoading ? 'Redirecting...' : 'Continue with Google'}
      </button>

      {/* Divider */}
      <div className="relative mb-5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-white px-3 text-text-3">or sign up with email</span>
        </div>
      </div>

      {/* Error */}
      {serverError && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2">
          <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <p className="text-sm text-red-700">{serverError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {/* Full Name */}
        <div>
          <label className="block text-sm font-medium text-text mb-1.5">Full name</label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3 pointer-events-none" />
            <input
              {...register('full_name')}
              type="text"
              autoComplete="name"
              placeholder="Aarav Sharma"
              className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm transition-colors bg-white text-text placeholder:text-text-3 focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand ${
                errors.full_name ? 'border-red-400 bg-red-50' : 'border-border hover:border-border-2'
              }`}
            />
          </div>
          {errors.full_name && (
            <p className="mt-1 text-xs text-red-600">{errors.full_name.message}</p>
          )}
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-text mb-1.5">Email address</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3 pointer-events-none" />
            <input
              {...register('email')}
              type="email"
              autoComplete="email"
              placeholder="you@college.edu"
              className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm transition-colors bg-white text-text placeholder:text-text-3 focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand ${
                errors.email ? 'border-red-400 bg-red-50' : 'border-border hover:border-border-2'
              }`}
            />
          </div>
          {errors.email && (
            <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
          )}
        </div>

        {/* Password */}
        <div>
          <label className="block text-sm font-medium text-text mb-1.5">Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3 pointer-events-none" />
            <input
              {...register('password')}
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Min. 8 characters"
              className={`w-full pl-10 pr-10 py-3 rounded-xl border text-sm transition-colors bg-white text-text placeholder:text-text-3 focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand ${
                errors.password ? 'border-red-400 bg-red-50' : 'border-border hover:border-border-2'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((p) => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-3 hover:text-text-2 transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.password && (
            <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
          )}
        </div>

        {/* Confirm Password */}
        <div>
          <label className="block text-sm font-medium text-text mb-1.5">Confirm password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3 pointer-events-none" />
            <input
              {...register('confirm_password')}
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Re-enter your password"
              className={`w-full pl-10 pr-10 py-3 rounded-xl border text-sm transition-colors bg-white text-text placeholder:text-text-3 focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand ${
                errors.confirm_password ? 'border-red-400 bg-red-50' : 'border-border hover:border-border-2'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((p) => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-3 hover:text-text-2 transition-colors"
              tabIndex={-1}
            >
              {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.confirm_password && (
            <p className="mt-1 text-xs text-red-600">{errors.confirm_password.message}</p>
          )}
        </div>

        {/* Terms */}
        <div className="flex items-start gap-3">
          <input
            {...register('accept_terms')}
            type="checkbox"
            id="accept_terms"
            className="mt-0.5 w-4 h-4 rounded border-border-2 text-brand accent-brand cursor-pointer"
          />
          <label htmlFor="accept_terms" className="text-sm text-text-2 cursor-pointer">
            I agree to the{' '}
            <Link href="/terms" className="text-brand hover:text-brand-dark font-medium">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="text-brand hover:text-brand-dark font-medium">
              Privacy Policy
            </Link>
          </label>
        </div>
        {errors.accept_terms && (
          <p className="text-xs text-red-600">{errors.accept_terms.message}</p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting || isOAuthLoading}
          className="w-full py-3.5 px-4 rounded-xl bg-brand hover:bg-brand-dark text-white font-semibold text-sm transition-all duration-150 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Creating account...
            </>
          ) : (
            'Create account'
          )}
        </button>
      </form>

      {/* Login link */}
      <p className="mt-5 text-center text-sm text-text-2">
        Already have an account?{' '}
        <Link href="/login" className="text-brand font-semibold hover:text-brand-dark transition-colors">
          Sign in
        </Link>
      </p>
    </>
  );
}
