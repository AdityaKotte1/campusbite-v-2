'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  Save, Eye, EyeOff, CheckCircle2, AlertCircle,
  CreditCard, Building2, Store, ChevronDown, ChevronRight, Trash2, Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const TABS = ['General', 'Payment', 'Notifications', 'Security'] as const;
type Tab = typeof TABS[number];

// ─── Types ────────────────────────────────────────────────────────────────────
interface CanteenConfig {
  id: string;
  name: string;
  use_own_razorpay: boolean;
  is_configured: boolean;
  razorpay_key_id_masked: string | null;
  razorpay_configured_at: string | null;
}
interface InstituteConfig {
  id: string;
  name: string;
  code: string;
  city: string;
  is_configured: boolean;
  razorpay_key_id_masked: string | null;
  razorpay_configured_at: string | null;
  canteens: CanteenConfig[];
}

// ─── Razorpay Key Form ────────────────────────────────────────────────────────
function RazorpayKeyForm({
  target,
  id,
  name,
  currentKeyMask,
  onSuccess,
  onRemove,
}: {
  target: 'institute' | 'canteen';
  id: string;
  name: string;
  currentKeyMask: string | null;
  onSuccess: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [keyId, setKeyId] = useState('');
  const [keySecret, setKeySecret] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [showWebhook, setShowWebhook] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const save = async () => {
    if (!keyId.startsWith('rzp_')) { setError('Key ID must start with rzp_'); return; }
    if (keySecret.length < 10) { setError('Key Secret is too short'); return; }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await axios.post('/api/v1/admin/payment-config', {
        target, id,
        key_id: keyId.trim(),
        key_secret: keySecret.trim(),
        webhook_secret: webhookSecret.trim() || undefined,
      });
      setSuccess('Keys saved securely.');
      setKeyId(''); setKeySecret(''); setWebhookSecret('');
      setOpen(false);
      onSuccess();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: { message?: string } } } };
      setError(err?.response?.data?.error?.message ?? 'Failed to save keys');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Remove Razorpay keys for ${name}? Payments will fall back to the ${target === 'canteen' ? 'institute' : 'platform'} account.`)) return;
    await axios.delete(`/api/v1/admin/payment-config?target=${target}&id=${id}`);
    onRemove();
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {currentKeyMask ? (
            <CheckCircle2 className="w-4 h-4 text-green flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
          )}
          <div>
            <p className="text-sm font-medium text-text">{name}</p>
            {currentKeyMask ? (
              <p className="text-xs text-text-3 font-mono">{currentKeyMask}</p>
            ) : (
              <p className="text-xs text-amber-600">Not configured — will use {target === 'canteen' ? 'institute' : 'platform'} account</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {currentKeyMask && (
            <Button variant="ghost" size="icon-sm" onClick={remove} className="text-red-400 hover:text-red-600">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
            {open ? 'Cancel' : currentKeyMask ? 'Update Keys' : 'Configure'}
          </Button>
        </div>
      </div>

      {open && (
        <div className="mt-3 rounded-xl border border-border bg-bg-2 p-4 space-y-3">
          <p className="text-xs text-text-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            ⚠ Keys are encrypted with AES-256-GCM before storage. The secret is never stored in plaintext and cannot be retrieved after saving.
          </p>

          <div>
            <label className="block text-xs font-medium text-text mb-1">Razorpay Key ID *</label>
            <Input
              value={keyId}
              onChange={(e) => setKeyId(e.target.value)}
              placeholder="rzp_live_xxxxxxxxxxxx"
              className="font-mono text-sm"
            />
            <p className="text-xs text-text-3 mt-1">Starts with rzp_test_ (test mode) or rzp_live_ (production)</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-text mb-1">Razorpay Key Secret *</label>
            <div className="relative">
              <Input
                value={keySecret}
                onChange={(e) => setKeySecret(e.target.value)}
                type={showSecret ? 'text' : 'password'}
                placeholder="••••••••••••••••••••••"
                className="font-mono text-sm pr-9"
              />
              <button
                type="button"
                onClick={() => setShowSecret((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-3 hover:text-text"
              >
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-text mb-1">
              Webhook Secret <span className="text-text-3">(optional — recommended)</span>
            </label>
            <div className="relative">
              <Input
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                type={showWebhook ? 'text' : 'password'}
                placeholder="The webhook secret from Razorpay dashboard"
                className="font-mono text-sm pr-9"
              />
              <button
                type="button"
                onClick={() => setShowWebhook((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-3 hover:text-text"
              >
                {showWebhook ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-text-3 mt-1">
              In Razorpay → Settings → Webhooks, add{' '}
              <code className="bg-bg-2 px-1 rounded">
                {(process.env.NEXT_PUBLIC_STUDENT_APP_URL ?? 'https://your-student-app-domain') + '/api/v1/payments/webhook'}
              </code>{' '}
              — this is your <strong>student app</strong> URL (not this admin URL), with events <em>payment.captured</em>, <em>payment.failed</em>.
            </p>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
          {success && <p className="text-xs text-green">{success}</p>}

          <Button onClick={save} disabled={saving} className="w-full">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Keys Securely
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Payment Settings Tab ─────────────────────────────────────────────────────
function PaymentSettings() {
  const queryClient = useQueryClient();
  const [expandedInstitutes, setExpandedInstitutes] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery<{ success: boolean; data: InstituteConfig[] }>({
    queryKey: ['payment-config'],
    queryFn: () => axios.get('/api/v1/admin/payment-config').then((r) => r.data),
  });

  const institutes = data?.data ?? [];

  const toggleInstitute = (id: string) => {
    setExpandedInstitutes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['payment-config'] });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-text-3" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Explainer */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-3">
            <CreditCard className="w-5 h-5 text-brand flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-text">Direct-to-Institute Payments</p>
              <p className="text-sm text-text-2 mt-0.5">
                Configure each institute's Razorpay account so student payments go directly to them — CampusBite is never a middleman.
                Individual canteens can optionally use their own separate Razorpay account.
              </p>
              <div className="mt-3 text-xs text-text-3 space-y-1">
                <p><span className="font-semibold text-text">Key resolution order:</span> Canteen own keys → Institute keys → Platform fallback</p>
                <p><span className="font-semibold text-text">Security:</span> Secrets are AES-256-GCM encrypted at rest and never returned via API.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {institutes.length === 0 && (
        <div className="text-center py-12 text-text-3 text-sm">
          No institutes found. Create an institute first.
        </div>
      )}

      {/* Institute list */}
      {institutes.map((inst) => (
        <Card key={inst.id} className="overflow-hidden">
          <CardHeader className="py-3 px-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Building2 className="w-4 h-4 text-text-3" />
                <div>
                  <p className="text-sm font-semibold text-text">{inst.name}</p>
                  <p className="text-xs text-text-3">{inst.city} · {inst.code}</p>
                </div>
              </div>
              <button
                onClick={() => toggleInstitute(inst.id)}
                className="text-text-3 hover:text-text transition"
              >
                {expandedInstitutes.has(inst.id)
                  ? <ChevronDown className="w-5 h-5" />
                  : <ChevronRight className="w-5 h-5" />}
              </button>
            </div>
          </CardHeader>

          <CardContent className="pt-0 pb-4 px-5 space-y-4">
            {/* Institute-level Razorpay config */}
            <div className="border border-border rounded-xl p-4">
              <p className="text-xs font-semibold text-text-3 uppercase tracking-wide mb-3">
                Institute Razorpay Account
              </p>
              <RazorpayKeyForm
                target="institute"
                id={inst.id}
                name={`${inst.name} — Institute Account`}
                currentKeyMask={inst.razorpay_key_id_masked}
                onSuccess={refresh}
                onRemove={refresh}
              />
            </div>

            {/* Per-canteen configs — expandable */}
            {expandedInstitutes.has(inst.id) && inst.canteens.length > 0 && (
              <div className="border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-bg-2 border-b border-border flex items-center gap-2">
                  <Store className="w-3.5 h-3.5 text-text-3" />
                  <p className="text-xs font-semibold text-text-3 uppercase tracking-wide">
                    Per-Canteen Override ({inst.canteens.length})
                  </p>
                </div>
                <div className="divide-y divide-border">
                  {inst.canteens.map((canteen) => (
                    <div key={canteen.id} className="px-4 py-3">
                      <RazorpayKeyForm
                        target="canteen"
                        id={canteen.id}
                        name={canteen.name}
                        currentKeyMask={canteen.razorpay_key_id_masked}
                        onSuccess={refresh}
                        onRemove={refresh}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {expandedInstitutes.has(inst.id) && inst.canteens.length === 0 && (
              <p className="text-xs text-text-3 text-center py-2">No canteens under this institute yet.</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Main Settings Page ───────────────────────────────────────────────────────
export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('General');

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex gap-1 bg-bg rounded-lg p-1 w-fit flex-wrap">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
              tab === t ? 'bg-surface shadow-sm text-text' : 'text-text-2 hover:text-text'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'General' && (
        <Card>
          <CardHeader><CardTitle>General Settings</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Field label="Platform Name" defaultValue="CampusBite" />
            <Field label="Support Email" defaultValue="support@campusbite.in" type="email" />
            <Field label="Timezone" defaultValue="Asia/Kolkata" />
            <Field label="Currency" defaultValue="INR" />
            <Button><Save className="w-4 h-4" /> Save Changes</Button>
          </CardContent>
        </Card>
      )}

      {tab === 'Payment' && <PaymentSettings />}

      {tab === 'Notifications' && (
        <Card>
          <CardHeader><CardTitle>Notification Settings</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Toggle label="Order confirmation emails" defaultChecked />
            <Toggle label="Order ready SMS" defaultChecked />
            <Toggle label="Daily revenue digest" />
            <Toggle label="Kiosk offline alerts" defaultChecked />
            <Button><Save className="w-4 h-4" /> Save Changes</Button>
          </CardContent>
        </Card>
      )}

      {tab === 'Security' && (
        <Card>
          <CardHeader><CardTitle>Security Settings</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Toggle label="Require 2FA for admin accounts" />
            <Toggle label="Enforce password rotation (90 days)" defaultChecked />
            <Toggle label="Session timeout (15 minutes)" defaultChecked />
            <Field label="IP Allowlist (comma-separated, empty = all)" placeholder="e.g. 192.168.1.0/24" />
            <Button><Save className="w-4 h-4" /> Save Changes</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, defaultValue, type = 'text', placeholder }: { label: string; defaultValue?: string; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-text mb-1.5">{label}</label>
      <Input type={type} defaultValue={defaultValue} placeholder={placeholder} className="max-w-sm" />
    </div>
  );
}

function Toggle({ label, defaultChecked = false }: { label: string; defaultChecked?: boolean }) {
  const [checked, setChecked] = useState(defaultChecked);
  return (
    <label className="flex items-center justify-between cursor-pointer py-1">
      <span className="text-sm text-text">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => setChecked(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-brand' : 'bg-border-2'}`}
      >
        <span className={`inline-block h-4 w-4 m-0.5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </button>
    </label>
  );
}
