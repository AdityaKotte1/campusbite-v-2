'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import axios from 'axios';
import { Copy, Check, AlertTriangle, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const registerSchema = z.object({
  name: z.string().min(2, 'Name required'),
  canteen_id: z.string().uuid('Select a canteen'),
  location: z.string().optional(),
  device_id: z.string().min(4, 'Device ID required'),
});

type RegisterForm = z.infer<typeof registerSchema>;

interface Canteen {
  id: string;
  name: string;
}

interface RegisterKioskDialogProps {
  canteens: Canteen[];
  onClose: () => void;
  onSuccess: () => void;
}

export function RegisterKioskDialog({
  canteens,
  onClose,
  onSuccess,
}: RegisterKioskDialogProps) {
  const [step, setStep] = useState<'form' | 'success'>('form');
  const [apiKey, setApiKey] = useState('');
  const [kioskId, setKioskId] = useState('');
  const [copied, setCopied] = useState(false);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  const onSubmit = async (values: RegisterForm) => {
    setServerError('');
    try {
      const { data } = await axios.post('/api/v1/admin/kiosks', values);
      setKioskId(data.data.kiosk_id);
      setApiKey(data.data.api_key);
      setStep('success');
    } catch (err: unknown) {
      const msg =
        axios.isAxiosError(err) ? err.response?.data?.error?.message ?? 'Failed to register kiosk' : 'Unknown error';
      setServerError(msg);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDone = () => {
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-surface rounded-xl border border-border shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-display text-lg font-semibold text-text tracking-tight">
            {step === 'form' ? 'Register New Kiosk' : 'Kiosk Registered'}
          </h2>
          {step === 'form' && (
            <button onClick={onClose} className="p-1 rounded text-text-3 hover:text-text transition">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="p-5">
          {step === 'form' ? (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {serverError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {serverError}
                </p>
              )}

              <div>
                <label className="block text-sm font-medium text-text mb-1.5">Canteen *</label>
                <select
                  {...register('canteen_id')}
                  className="w-full h-9 px-3 rounded-lg border border-border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-brand"
                >
                  <option value="">Select canteen…</option>
                  {canteens.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {errors.canteen_id && (
                  <p className="mt-1 text-xs text-red-600">{errors.canteen_id.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-text mb-1.5">Kiosk Name *</label>
                <Input {...register('name')} placeholder="e.g. Main Counter Kiosk" error={!!errors.name} />
                {errors.name && (
                  <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-text mb-1.5">Location</label>
                <Input {...register('location')} placeholder="e.g. Ground Floor, Block A" />
              </div>

              <div>
                <label className="block text-sm font-medium text-text mb-1.5">Device ID *</label>
                <Input
                  {...register('device_id')}
                  placeholder="e.g. RPI-001 or MAC address"
                  error={!!errors.device_id}
                />
                {errors.device_id && (
                  <p className="mt-1 text-xs text-red-600">{errors.device_id.message}</p>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Register
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              {/* Warning */}
              <div className="flex gap-3 p-3 bg-amber-pale border border-amber/25 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber shrink-0 mt-0.5" />
                <p className="text-sm text-amber-dark">
                  <strong>Save this API key now.</strong> It will not be shown again after you close this dialog.
                </p>
              </div>

              <div>
                <p className="text-xs text-text-3 mb-1">Kiosk ID</p>
                <p className="text-sm font-mono text-text bg-bg rounded-lg px-3 py-2 break-all">
                  {kioskId}
                </p>
              </div>

              <div>
                <p className="text-xs text-text-3 mb-1">API Key (one-time display)</p>
                <div className="relative">
                  <pre className="text-sm font-mono text-text bg-bg rounded-lg px-3 py-3 break-all whitespace-pre-wrap pr-12 leading-relaxed">
                    {apiKey}
                  </pre>
                  <button
                    onClick={handleCopy}
                    className="absolute top-2 right-2 p-1.5 rounded-md bg-surface border border-border text-text-2 hover:text-brand transition"
                    title="Copy API key"
                  >
                    {copied ? <Check className="w-4 h-4 text-green" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button className="w-full" onClick={handleDone}>
                Done – I've saved the key
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
