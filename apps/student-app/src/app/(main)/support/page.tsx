'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import Link from 'next/link';
import { ArrowLeft, Loader2, Send, Inbox, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Ticket {
  id: string;
  category: string;
  order_number: string | null;
  subject: string;
  message: string;
  status: string;
  admin_response: string | null;
  created_at: string;
}

const CATEGORIES = [
  { value: 'order', label: 'Order issue' },
  { value: 'payment', label: 'Payment' },
  { value: 'refund', label: 'Refund' },
  { value: 'account', label: 'Account' },
  { value: 'other', label: 'Other' },
];

const STATUS_STYLE: Record<string, string> = {
  open: 'bg-amber-pale text-amber-dark border-amber-light',
  in_progress: 'bg-brand-pale text-brand border-brand/30',
  resolved: 'bg-green-light text-green-dark border-green/30',
  closed: 'bg-bg-2 text-text-3 border-border',
};

const FIELD_CLASS =
  'w-full px-3.5 py-3 rounded-lg border border-border-2 bg-surface text-sm text-text placeholder:text-text-3 transition-all hover:border-text-3 focus:outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand';

export default function SupportPage() {
  const qc = useQueryClient();
  const [category, setCategory] = useState('order');
  const [orderNumber, setOrderNumber] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery<{ data: Ticket[] }>({
    queryKey: ['support'],
    queryFn: () => axios.get('/api/v1/support').then((r) => r.data),
  });
  const tickets = data?.data ?? [];

  const mutation = useMutation({
    mutationFn: () => axios.post('/api/v1/support', { category, order_number: orderNumber, subject, message }),
    onSuccess: () => {
      setSubject('');
      setMessage('');
      setOrderNumber('');
      setError('');
      qc.invalidateQueries({ queryKey: ['support'] });
    },
    onError: (e) => {
      setError(axios.isAxiosError(e) ? e.response?.data?.message ?? 'Failed to submit' : 'Failed to submit');
    },
  });

  const submit = () => {
    if (!subject.trim() || !message.trim()) {
      setError('Please add a subject and a message.');
      return;
    }
    mutation.mutate();
  };

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-10 space-y-6 animate-fade-up">
      <Link
        href="/profile"
        className="inline-flex items-center gap-2 text-sm text-text-2 hover:text-text transition-colors duration-150"
      >
        <ArrowLeft className="w-4 h-4" /> Profile
      </Link>

      <header>
        <p className="eyebrow">We&apos;re here to help</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-text mt-1">
          Help &amp; Support
        </h1>
        <div className="rule-amber mt-3" />
      </header>

      {/* New ticket */}
      <div className="bg-surface rounded-2xl border border-border p-5 space-y-4 shadow-sm">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight text-text">Raise a ticket</h2>
          <p className="text-sm text-text-2 mt-0.5">Tell us what went wrong and we&apos;ll follow up.</p>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}
        {mutation.isSuccess && (
          <p className="text-sm text-green-dark bg-green-light border border-green/30 rounded-lg px-3 py-2 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-green" />
            Thanks! Your ticket has been submitted. We&apos;ll get back to you soon.
          </p>
        )}

        <div>
          <label htmlFor="support-category" className="block text-sm font-medium text-text-2 mb-1.5">Category</label>
          <select
            id="support-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={FIELD_CLASS}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        <Input
          label="Order number (optional)"
          value={orderNumber}
          onChange={(e) => setOrderNumber(e.target.value)}
          placeholder="e.g. CB-260612-XXXX"
        />

        <Input
          label="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Brief summary"
        />

        <div>
          <label htmlFor="support-message" className="block text-sm font-medium text-text-2 mb-1.5">Describe the issue</label>
          <textarea
            id="support-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder="Tell us what happened…"
            className={`${FIELD_CLASS} resize-none`}
          />
        </div>

        <Button
          onClick={submit}
          disabled={mutation.isPending}
          loading={mutation.isPending}
          size="lg"
          className="w-full"
        >
          {!mutation.isPending && <Send className="w-4 h-4" />}
          Submit ticket
        </Button>
      </div>

      {/* My tickets */}
      <div>
        <p className="eyebrow mb-3">Your tickets</p>
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-text-3" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="bg-surface rounded-2xl border border-border p-8 text-center shadow-sm">
            <div className="w-14 h-14 rounded-full bg-amber-pale flex items-center justify-center mx-auto mb-3">
              <Inbox className="w-6 h-6 text-amber" />
            </div>
            <h3 className="font-display text-lg font-semibold tracking-tight text-text">No tickets yet</h3>
            <p className="text-sm text-text-2 mt-1">When you raise a ticket, it will show up here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tickets.map((t) => (
              <div key={t.id} className="bg-surface rounded-2xl border border-border p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text">{t.subject}</p>
                    <p className="text-xs text-text-3 mt-0.5 capitalize tabular-nums">
                      {t.category}{t.order_number ? ` · ${t.order_number}` : ''} · {new Date(t.created_at).toLocaleDateString('en-IN')}
                    </p>
                  </div>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border capitalize flex-shrink-0 ${STATUS_STYLE[t.status] ?? STATUS_STYLE.closed}`}>
                    {t.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-sm text-text-2 mt-2 leading-relaxed">{t.message}</p>
                {t.admin_response && (
                  <div className="mt-3 bg-bg-2 rounded-xl p-3 border border-border">
                    <p className="text-xs font-semibold text-brand mb-1">MunchAdda Support</p>
                    <p className="text-sm text-text-2 leading-relaxed">{t.admin_response}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
