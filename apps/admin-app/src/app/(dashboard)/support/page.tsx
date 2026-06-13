'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Loader2, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Ticket {
  id: string;
  user_id: string | null;
  name: string | null;
  email: string | null;
  category: string;
  order_number: string | null;
  subject: string;
  message: string;
  status: string;
  admin_response: string | null;
  created_at: string;
}

const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  open: 'warning',
  in_progress: 'default',
  resolved: 'success',
  closed: 'default',
};

function TicketCard({ t, onSaved }: { t: Ticket; onSaved: () => void }) {
  const [response, setResponse] = useState(t.admin_response ?? '');
  const [status, setStatus] = useState(t.status);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await axios.patch('/api/v1/admin/support', { id: t.id, status, admin_response: response });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-surface rounded-xl border border-border shadow-sm p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-text">{t.subject}</p>
          <p className="text-xs text-text-3 mt-0.5 capitalize">
            {t.category}{t.order_number ? ` · ${t.order_number}` : ''} · {t.name ?? 'User'} ({t.email ?? '—'}) ·{' '}
            <span className="tabular-nums">{new Date(t.created_at).toLocaleString('en-IN')}</span>
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[t.status] ?? 'default'}>{t.status.replace('_', ' ')}</Badge>
      </div>

      <p className="text-sm text-text-2 bg-bg-2 rounded-lg p-3 border border-border">{t.message}</p>

      <textarea
        value={response}
        onChange={(e) => setResponse(e.target.value)}
        rows={3}
        placeholder="Write a response to the user…"
        className="w-full px-3 py-2 rounded-lg border border-border-2 bg-surface text-sm text-text placeholder:text-text-3 focus:outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand resize-none transition-all"
      />

      <div className="flex items-center gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-9 px-2 rounded-lg border border-border-2 bg-surface text-sm text-text capitalize focus:outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Save
        </Button>
      </div>
    </div>
  );
}

export default function AdminSupportPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState('');

  const { data, isLoading } = useQuery<{ data: Ticket[] }>({
    queryKey: ['admin-support', filter],
    queryFn: () => axios.get('/api/v1/admin/support' + (filter ? `?status=${filter}` : '')).then((r) => r.data),
  });
  const tickets = data?.data ?? [];

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Help desk</p>
          <h2 className="font-display text-2xl font-semibold text-text tracking-tight">Support</h2>
          <p className="text-sm text-text-3 mt-1">Respond to user tickets.</p>
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-9 px-2 rounded-lg border border-border-2 bg-surface text-sm text-text capitalize focus:outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all"
        >
          <option value="">All</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-text-3" /></div>
      ) : tickets.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border shadow-sm p-12 flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full bg-bg-2 flex items-center justify-center mb-3">
            <Inbox className="w-5 h-5 text-text-3" />
          </div>
          <p className="font-display text-lg font-semibold text-text">No tickets</p>
          <p className="text-sm text-text-3 mt-1">Support requests from users will show up here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <TicketCard key={t.id} t={t} onSaved={() => qc.invalidateQueries({ queryKey: ['admin-support'] })} />
          ))}
        </div>
      )}
    </div>
  );
}
