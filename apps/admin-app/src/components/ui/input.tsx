import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-3',
          'focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'transition',
          error && 'border-red-400 focus:ring-red-400',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
