'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { RefreshCw, Shield, AlertTriangle, Loader2 } from 'lucide-react';
import { getCountdownFromNow } from '@/lib/formatting';
import { cn } from '@/lib/utils';
import type { QRToken } from '@/types';

interface QRDisplayProps {
  orderId: string;
}

async function fetchQRToken(orderId: string): Promise<QRToken> {
  const res = await fetch(`/api/v1/orders/${orderId}/qr`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message ?? 'Failed to load QR code');
  }
  const json = await res.json();
  return json.data;
}

async function regenerateQRToken(orderId: string): Promise<QRToken> {
  const res = await fetch(`/api/v1/orders/${orderId}/qr`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message ?? 'Failed to regenerate QR');
  }
  const json = await res.json();
  return json.data;
}

function useCountdown(expiresAt: string | undefined) {
  const [countdown, setCountdown] = useState(() =>
    expiresAt ? getCountdownFromNow(expiresAt) : null
  );

  useEffect(() => {
    if (!expiresAt) return;

    const tick = () => setCountdown(getCountdownFromNow(expiresAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return countdown;
}

export function QRDisplay({ orderId }: QRDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const queryClient = useQueryClient();

  const { data: token, isLoading, error } = useQuery({
    queryKey: ['qr-token', orderId],
    queryFn: () => fetchQRToken(orderId),
    refetchInterval: 60 * 1000, // Refresh every minute
  });

  const regenerateMutation = useMutation({
    mutationFn: () => regenerateQRToken(orderId),
    onSuccess: (newToken) => {
      queryClient.setQueryData(['qr-token', orderId], newToken);
    },
  });

  const countdown = useCountdown(token?.expires_at);
  const isExpired = countdown?.isExpired ?? false;
  const isUrgent = !isExpired && (countdown?.totalSeconds ?? Infinity) < 10 * 60; // < 10 minutes

  // Draw QR on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !token?.token) return;

    const qrContent = `campusbite://qr/${token.token}`;

    QRCode.toCanvas(canvas, qrContent, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 240,
      color: {
        dark: '#111111',
        light: '#FFFFFF',
      },
    });
  }, [token?.token]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-brand animate-spin mb-3" />
        <p className="text-sm text-text-2">Loading QR code...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <AlertTriangle className="w-10 h-10 text-red-400 mb-3" />
        <p className="text-sm font-semibold text-text mb-1">Failed to load QR code</p>
        <p className="text-xs text-text-2 mb-4">{(error as Error).message}</p>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['qr-token', orderId] })}
          className="px-4 py-2 bg-brand text-white rounded-xl text-sm font-semibold hover:bg-brand-dark transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!token) return null;

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      {/* QR Canvas */}
      <div
        className={cn(
          'p-4 bg-white rounded-2xl border-4 transition-all duration-300 shadow-lg',
          isExpired
            ? 'border-red-300 opacity-40'
            : isUrgent
            ? 'border-red-400 animate-pulse shadow-red-200'
            : 'border-green/40 shadow-green-100'
        )}
      >
        <canvas
          ref={canvasRef}
          className={cn('block', isExpired && 'filter blur-sm')}
        />
      </div>

      {/* Expired overlay */}
      {isExpired ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span className="text-sm font-semibold text-red-700">QR Code Expired</span>
          </div>
          <p className="text-xs text-text-2">Your QR has expired. Request a new one.</p>
          <button
            onClick={() => regenerateMutation.mutate()}
            disabled={regenerateMutation.isPending}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand text-white rounded-xl font-semibold text-sm hover:bg-brand-dark disabled:opacity-60 transition-colors"
          >
            {regenerateMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Request New QR
          </button>
        </div>
      ) : (
        <>
          {/* Countdown timer */}
          <div
            className={cn(
              'flex flex-col items-center gap-1 px-6 py-3 rounded-2xl border',
              isUrgent
                ? 'bg-red-50 border-red-200'
                : 'bg-green-light border-green/30'
            )}
          >
            <p className={cn('text-xs font-medium mb-1', isUrgent ? 'text-red-600' : 'text-green-dark')}>
              {isUrgent ? '⚠️ Expiring soon!' : 'QR Valid for'}
            </p>
            <div className="flex items-center gap-2">
              {[
                { value: countdown?.hours ?? 0, label: 'hrs' },
                { value: countdown?.minutes ?? 0, label: 'min' },
                { value: countdown?.seconds ?? 0, label: 'sec' },
              ].map(({ value, label }, i) => (
                <div key={label} className="flex items-center gap-2">
                  {i > 0 && <span className={cn('font-bold', isUrgent ? 'text-red-600' : 'text-green-dark')}>:</span>}
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        'text-2xl font-mono font-bold tabular-nums',
                        isUrgent ? 'text-red-600' : 'text-green-dark'
                      )}
                    >
                      {String(value).padStart(2, '0')}
                    </span>
                    <span className={cn('text-[10px]', isUrgent ? 'text-red-500' : 'text-green')}>{label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Security notice */}
          <div className="flex items-center gap-2 px-4 py-2 bg-bg border border-border rounded-xl">
            <Shield className="w-3.5 h-3.5 text-text-3 flex-shrink-0" />
            <p className="text-xs text-text-3 text-center">
              Do not share this QR code with anyone
            </p>
          </div>

          {/* Regenerate option */}
          <button
            onClick={() => regenerateMutation.mutate()}
            disabled={regenerateMutation.isPending}
            className="flex items-center gap-1.5 text-xs text-text-3 hover:text-brand transition-colors"
          >
            {regenerateMutation.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            Regenerate QR code
          </button>
        </>
      )}
    </div>
  );
}
