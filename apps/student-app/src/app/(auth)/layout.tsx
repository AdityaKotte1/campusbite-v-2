import type { Metadata } from 'next';
import Image from 'next/image';

export const metadata: Metadata = {
  title: 'Sign In',
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-pale via-white to-orange-50 flex flex-col items-center justify-center p-4">
      {/* Logo */}
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="w-14 h-14 rounded-2xl bg-brand flex items-center justify-center shadow-lg">
          <svg
            width="32"
            height="32"
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M16 4C9.373 4 4 9.373 4 16C4 22.627 9.373 28 16 28C22.627 28 28 22.627 28 16C28 9.373 22.627 4 16 4Z"
              fill="white"
              fillOpacity="0.2"
            />
            <path
              d="M10 12C10 11.448 10.448 11 11 11H21C21.552 11 22 11.448 22 12V13C22 16.866 18.866 20 15 20H14C14 21.105 14.895 22 16 22H18C18.552 22 19 22.448 19 23C19 23.552 18.552 24 18 24H14C12.343 24 11 22.657 11 21V20C11 19.448 11.448 19 12 19V13H11C10.448 13 10 12.552 10 12Z"
              fill="white"
            />
            <circle cx="22" cy="9" r="3" fill="#FF6B40" />
          </svg>
        </div>
        <span className="text-2xl font-bold text-text tracking-tight">
          Campus<span className="text-brand">Bite</span>
        </span>
        <p className="text-sm text-text-2">Skip the queue. Get it fresh.</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-border p-6 md:p-8">
        {children}
      </div>

      <p className="mt-6 text-xs text-text-3 text-center">
        &copy; {new Date().getFullYear()} CampusBite. All rights reserved.
      </p>
    </div>
  );
}
