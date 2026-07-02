'use client';

import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Loader2, Upload, ImageIcon, X, AlertTriangle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatPaise } from '@/lib/subscription-pricing';

const schema = z.object({
  name: z.string().min(2, 'Name is required'),
  location: z.string().min(1, 'Location is required'),
  opening_time: z.string().min(1, 'Opening time required'),
  closing_time: z.string().min(1, 'Closing time required'),
  description: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

interface AddonQuote { remainingDays: number; subtotalPaise: number; gstPaise: number; totalPaise: number }
interface AddonInfo { allowed: boolean; reason?: string; quote?: AddonQuote; period_end?: string }

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if ((window as unknown as { Razorpay?: unknown }).Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

const REASON_TEXT: Record<string, string> = {
  not_active: 'You need an active subscription to add a canteen.',
  razorpay_disabled: 'Online payment isn’t enabled yet. Contact MunchAdda.',
  no_institute: 'Your account isn’t linked to an institute.',
};

export function AddCanteenDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [imageUrl, setImageUrl] = useState('');
  const [imageUploading, setImageUploading] = useState(false);
  const [serverError, setServerError] = useState('');
  const [paying, setPaying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data } = useQuery<{ data: AddonInfo }>({
    queryKey: ['add-canteen-quote'],
    queryFn: () => axios.get('/api/v1/admin/canteens/add-on').then((r) => r.data),
  });
  const info = data?.data;

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const handleImageUpload = async (file: File) => {
    setImageUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/v1/admin/upload', { method: 'POST', body: formData });
      const json = await res.json();
      if (json.url) setImageUrl(json.url);
      else setServerError(json.error?.message ?? 'Upload failed');
    } catch {
      setServerError('Upload failed. Please try again.');
    } finally {
      setImageUploading(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    setServerError('');
    setPaying(true);
    try {
      const ok = await loadRazorpay();
      if (!ok) throw new Error('Could not load the payment gateway');

      const { data: co } = await axios.post('/api/v1/admin/canteens/add-on/checkout', {
        ...values, image_url: imageUrl || null,
      });
      const order = co.data;

      if (order.free) { onSuccess(); return; } // ₹0 prorate → already active

      await new Promise<void>((resolve, reject) => {
        const RZP = (window as unknown as { Razorpay: new (o: unknown) => { open: () => void } }).Razorpay;
        const rzp = new RZP({
          key: order.key_id,
          amount: order.amount,
          currency: order.currency,
          name: 'MunchAdda',
          description: `Add canteen: ${values.name}`,
          order_id: order.order_id,
          theme: { color: '#E8390E' },
          handler: async (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
            try { await axios.post('/api/v1/admin/subscriptions/verify', resp); resolve(); }
            catch (e) { reject(e); }
          },
          modal: { ondismiss: () => reject(new Error('Payment cancelled')) },
        });
        rzp.open();
      });
      onSuccess();
    } catch (e) {
      const text = axios.isAxiosError(e) ? e.response?.data?.error?.message ?? 'Payment failed' : (e as Error).message;
      setServerError(text);
    } finally {
      setPaying(false);
    }
  };

  const quote = info?.quote;
  const blocked = info && !info.allowed;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
      <div className="bg-surface rounded-2xl border border-border shadow-lg w-full max-w-lg my-4">
        <div className="px-5 py-4 border-b border-border flex items-start justify-between">
          <div>
            <p className="eyebrow">Canteen</p>
            <h2 className="font-display text-lg font-semibold tracking-tight text-text">Add Canteen</h2>
            <p className="text-xs text-text-3 mt-0.5">Prorated for the rest of your current plan.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-text-3 hover:text-text transition rounded-lg p-1 hover:bg-bg-2">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          {serverError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{serverError}</p>
          )}

          {blocked && (
            <p className="flex items-start gap-2 text-sm text-amber-dark bg-amber-pale border border-amber/25 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                {REASON_TEXT[info!.reason ?? ''] ?? 'Adding a canteen isn’t available right now.'}{' '}
                {info!.reason === 'not_active' && <a href="/billing" className="font-semibold underline">Go to Billing</a>}
              </span>
            </p>
          )}

          {/* Photo */}
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="h-36 bg-bg-2 relative overflow-hidden">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-brand-pale">
                  <ImageIcon className="w-8 h-8 text-brand opacity-50" />
                </div>
              )}
            </div>
            <div className="px-4 py-3 flex items-center gap-3">
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={imageUploading}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-bg-2 transition disabled:opacity-60">
                {imageUploading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</> : <><Upload className="w-3.5 h-3.5" /> {imageUrl ? 'Change Photo' : 'Upload Photo'}</>}
              </button>
              <span className="text-xs text-text-3 ml-auto">Max 5 MB</span>
            </div>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ''; }} />
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-1.5">Canteen Name <span className="text-red-500">*</span></label>
            <Input {...register('name')} placeholder="e.g. Main Canteen" error={!!errors.name} />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-1.5">Location / Building <span className="text-red-500">*</span></label>
            <Input {...register('location')} placeholder="e.g. Block A, Ground Floor" error={!!errors.location} />
            {errors.location && <p className="text-xs text-red-500 mt-1">{errors.location.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">Opening Time <span className="text-red-500">*</span></label>
              <Input {...register('opening_time')} type="time" error={!!errors.opening_time} />
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">Closing Time <span className="text-red-500">*</span></label>
              <Input {...register('closing_time')} type="time" error={!!errors.closing_time} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-1.5">Description</label>
            <textarea {...register('description')} rows={2} placeholder="Short description of the canteen…"
              className="w-full px-3 py-2 rounded-lg border border-border-2 bg-surface text-sm text-text placeholder:text-text-3 hover:border-text-3 focus:outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand resize-none transition-all" />
          </div>

          {/* Prorated charge summary */}
          {quote && (
            <div className="bg-bg-2 rounded-xl border border-border p-4 text-sm space-y-1.5">
              <div className="flex justify-between">
                <span className="text-text-2">Prorated ({quote.remainingDays} days left in current plan)</span>
                <span className="tabular-nums">{formatPaise(quote.subtotalPaise)}</span>
              </div>
              {quote.gstPaise > 0 && (
                <div className="flex justify-between"><span className="text-text-2">GST (18%)</span><span className="tabular-nums">{formatPaise(quote.gstPaise)}</span></div>
              )}
              <div className="flex items-baseline justify-between pt-2 mt-1 border-t border-border">
                <span className="font-semibold text-text">Pay now</span>
                <span className="font-display text-xl font-semibold text-text tabular-nums tracking-tight">{formatPaise(quote.totalPaise)}</span>
              </div>
              <p className="text-xs text-text-3">Then ₹2,000/mo, included automatically at your next renewal.</p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={paying || imageUploading || blocked || !info}>
              {paying && <Loader2 className="w-4 h-4 animate-spin" />}
              {quote ? `Pay ${formatPaise(quote.totalPaise)}` : 'Add Canteen'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
