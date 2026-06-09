'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { Copy, Check, AlertTriangle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const registerSchema = z.object({
  name: z.string().min(2, 'Name required'),
  canteen_id: z.string().uuid('Valid canteen UUID required'),
  location: z.string().optional(),
  device_id: z.string().min(4, 'Device ID required'),
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function KioskRegisterPage() {
  const router = useRouter();
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
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.error?.message ?? 'Registration failed'
        : 'Unknown error';
      setServerError(msg);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-lg space-y-5">
      <h2 className="text-lg font-bold text-text">Register Kiosk</h2>

      {step === 'form' ? (
        <Card>
          <CardHeader>
            <CardTitle>Kiosk Details</CardTitle>
          </CardHeader>
          <CardContent>
            {serverError && (
              <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {serverError}
              </p>
            )}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text mb-1.5">Canteen ID *</label>
                <Input {...register('canteen_id')} placeholder="uuid of canteen" error={!!errors.canteen_id} />
                {errors.canteen_id && <p className="mt-1 text-xs text-red-600">{errors.canteen_id.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-text mb-1.5">Kiosk Name *</label>
                <Input {...register('name')} placeholder="e.g. Main Counter" error={!!errors.name} />
                {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-text mb-1.5">Location</label>
                <Input {...register('location')} placeholder="e.g. Block A Ground Floor" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text mb-1.5">Device ID *</label>
                <Input {...register('device_id')} placeholder="e.g. RPI-001 or MAC" error={!!errors.device_id} />
                {errors.device_id && <p className="mt-1 text-xs text-red-600">{errors.device_id.message}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Register Kiosk
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Kiosk Registered Successfully</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-700">
                <strong>Save this API key immediately.</strong> For security, it will never be shown again after you leave this page.
              </p>
            </div>

            <div>
              <p className="text-xs text-text-3 mb-1.5">Kiosk ID</p>
              <p className="font-mono text-sm text-text bg-bg rounded-lg px-3 py-2 break-all">{kioskId}</p>
            </div>

            <div>
              <p className="text-xs text-text-3 mb-1.5">API Key</p>
              <div className="relative">
                <pre className="font-mono text-sm text-text bg-bg rounded-lg px-3 py-3 break-all whitespace-pre-wrap pr-12 leading-relaxed">
                  {apiKey}
                </pre>
                <button
                  onClick={handleCopy}
                  className="absolute top-2 right-2 p-1.5 rounded-md bg-surface border border-border text-text-2 hover:text-brand transition"
                >
                  {copied ? <Check className="w-4 h-4 text-green" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button className="w-full" onClick={() => router.push('/kiosks')}>
              Done – Go to Kiosks
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
