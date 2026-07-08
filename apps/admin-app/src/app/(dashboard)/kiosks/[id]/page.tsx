'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useParams } from 'next/navigation';
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { KioskStatusIndicator } from '@/components/kiosks/kiosk-status-indicator';
import { formatDateTime } from '@/lib/formatting';
import type { Kiosk, KioskScan } from '@/types';

interface KioskDetail extends Kiosk {
  scans: KioskScan[];
}

export default function KioskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ data: KioskDetail }>({
    queryKey: ['kiosk', id],
    queryFn: () => axios.get(`/api/v1/admin/kiosks/${id}`).then((r) => r.data),
  });

  const kiosk = data?.data;

  const handleDeactivate = async () => {
    if (!confirm('Deactivate this kiosk? It will stop accepting scans.')) return;
    await axios.delete(`/api/v1/admin/kiosks/${id}`);
    queryClient.invalidateQueries({ queryKey: ['kiosks'] });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-text-3" />
      </div>
    );
  }

  if (!kiosk) {
    return <div className="text-center py-20 text-text-3">Kiosk not found.</div>;
  }

  const heartbeatData = kiosk.heartbeat_data as Record<string, string> | null;

  return (
    <div className="max-w-4xl space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/kiosks">
          <Button variant="outline" size="icon-sm">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-xl font-semibold text-text tracking-tight">{kiosk.name}</h2>
          <p className="text-xs text-text-3">{kiosk.location ?? 'No location set'}</p>
        </div>
        <KioskStatusIndicator lastHeartbeat={kiosk.last_heartbeat} />
        <Button
          variant="destructive"
          size="sm"
          onClick={handleDeactivate}
        >
          <Trash2 className="w-4 h-4" /> Deactivate
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Hardware Info */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader><CardTitle className="font-display tracking-tight">Hardware Info</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Device ID" value={kiosk.device_id} mono />
              <Row label="Firmware" value={kiosk.firmware_version ?? '—'} />
              <Row label="Canteen" value={kiosk.canteen?.name ?? kiosk.canteen_id} />
              <Row label="Active" value={kiosk.is_active ? 'Yes' : 'No'} />
              <Row label="Registered" value={formatDateTime(kiosk.created_at)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="font-display tracking-tight">Last Heartbeat</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Time" value={kiosk.last_heartbeat ? formatDateTime(kiosk.last_heartbeat) : 'Never'} />
              <Row label="Printer" value={heartbeatData?.printer_status ?? '—'} />
              <Row label="App Version" value={heartbeatData?.app_version ?? '—'} />
            </CardContent>
          </Card>
        </div>

        {/* Scan History */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader><CardTitle className="font-display tracking-tight">Last 100 Scans</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr>
                      {['Token', 'Order', 'Result', 'Time'].map((h) => (
                        <th key={h} className="h-10 px-5 text-left text-xs font-semibold text-text-3 uppercase tracking-wide bg-bg-2 border-b border-border">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {kiosk.scans.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-5 py-10 text-center text-text-3">
                          No scans yet
                        </td>
                      </tr>
                    ) : (
                      kiosk.scans.map((scan) => (
                        <tr key={scan.id} className="border-b border-border last:border-0 hover:bg-bg-2 transition-colors">
                          <td className="px-5 py-2.5 font-mono text-xs text-text-2">
                            {scan.token ? scan.token.slice(0, 12) + '…' : '—'}
                          </td>
                          <td className="px-5 py-2.5 font-mono text-xs text-text-2">
                            {scan.order_id ? scan.order_id.slice(0, 8) + '…' : '—'}
                          </td>
                          <td className="px-5 py-2.5">
                            <Badge
                              variant={
                                scan.result === 'success' ? 'success' :
                                scan.result === 'already_used' ? 'warning' :
                                scan.result === 'expired' ? 'default' : 'danger'
                              }
                            >
                              {scan.result}
                            </Badge>
                          </td>
                          <td className="px-5 py-2.5 text-xs text-text-3">
                            {formatDateTime(scan.scanned_at)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-text-3 shrink-0">{label}</span>
      <span className={`text-text text-right ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}
