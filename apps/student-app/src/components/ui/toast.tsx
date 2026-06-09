'use client';

import { useEffect } from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { useUIStore } from '@/store/ui-store';
import { cn } from '@/lib/utils';

const TOAST_DURATION = 4000;

export function ToastContainer() {
  const { toast, clearToast } = useUIStore();

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(clearToast, TOAST_DURATION);
      return () => clearTimeout(timer);
    }
  }, [toast, clearToast]);

  const icon = toast?.type === 'success'
    ? <CheckCircle2 className="w-5 h-5 text-green flex-shrink-0" />
    : toast?.type === 'error'
    ? <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
    : <Info className="w-5 h-5 text-blue-500 flex-shrink-0" />;

  return (
    <ToastPrimitive.Provider swipeDirection="right" duration={TOAST_DURATION}>
      <ToastPrimitive.Root
        open={!!toast}
        onOpenChange={(open) => { if (!open) clearToast(); }}
        className={cn(
          'fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-sm',
          'flex items-start gap-3 p-4 rounded-2xl shadow-xl border',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=closed]:slide-out-to-bottom-4 data-[state=open]:slide-in-from-bottom-4',
          'transition-all duration-200',
          toast?.type === 'success'
            ? 'bg-white border-green/30'
            : toast?.type === 'error'
            ? 'bg-white border-red-200'
            : 'bg-white border-blue-200'
        )}
      >
        {icon}
        <div className="flex-1 min-w-0">
          <ToastPrimitive.Description className="text-sm font-medium text-text leading-snug">
            {toast?.message}
          </ToastPrimitive.Description>
        </div>
        <ToastPrimitive.Close
          onClick={clearToast}
          className="flex-shrink-0 text-text-3 hover:text-text transition-colors"
        >
          <X className="w-4 h-4" />
        </ToastPrimitive.Close>
      </ToastPrimitive.Root>

      <ToastPrimitive.Viewport className="fixed inset-0 pointer-events-none z-50" />
    </ToastPrimitive.Provider>
  );
}

// Standalone toast component for direct usage
interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  onDismiss?: () => void;
}

export function Toast({ message, type = 'info', onDismiss }: ToastProps) {
  const icon = type === 'success'
    ? <CheckCircle2 className="w-5 h-5 text-green flex-shrink-0" />
    : type === 'error'
    ? <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
    : <Info className="w-5 h-5 text-blue-500 flex-shrink-0" />;

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-2xl shadow-lg border',
        type === 'success' ? 'bg-white border-green/30' : '',
        type === 'error' ? 'bg-white border-red-200' : '',
        type === 'info' ? 'bg-white border-blue-200' : ''
      )}
    >
      {icon}
      <p className="flex-1 text-sm font-medium text-text">{message}</p>
      {onDismiss && (
        <button onClick={onDismiss} className="text-text-3 hover:text-text">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
