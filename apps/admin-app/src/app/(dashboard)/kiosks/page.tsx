'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Plus, Eye, Printer, MonitorOff } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { KioskStatusIndicator } from '@/components/kiosks/kiosk-status-indicator';
import { RegisterKioskDialog } from '@/components/kiosks/register-kiosk-dialog';
import { useAuthStore } from '@/store/auth-store';
import { useScopeStore } from '@/store/scope-store';
import type { Kiosk, Canteen } from '@/types';

interface KioskWithCanteen extends Kiosk {
  canteen?: Canteen;
}

export default function KiosksPage() {
  const [showRegister, setShowRegister] = useState(false);
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const { instituteId, canteenId } = useScopeStore();
  const role = (user as { role?: string } | null)?.role ?? '';
  const canManageKiosks = role === 'super_admin' || role === 'canteen_admin';

  const { data: kiosksData, isLoading } = useQuery<{ data: KioskWithCanteen[] }>({
    queryKey: ['kiosks', instituteId, canteenId],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (instituteId) params.institute_id = instituteId;
      if (canteenId) params.canteen_id = canteenId;
      const { data } = await axios.get('/api/v1/admin/kiosks', { params });
      return data;
    },
    refetchInterval: 30 * 1000,
  });

  const { data: canteensData } = useQuery<{ data: Canteen[] }>({
    queryKey: ['canteens', instituteId],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (instituteId) params.institute_id = instituteId;
      const { data } = await axios.get('/api/v1/admin/canteens', { params });
      return data;
    },
  });

  const kiosks = kiosksData?.data ?? [];
  const canteens = canteensData?.data ?? [];

  return (
    <div className="space-y-5">
      {canManageKiosks && (
        <div className="flex justify-end">
          <Button onClick={() => setShowRegister(true)}>
            <Plus className="w-4 h-4" /> Register Kiosk
          </Button>
        </div>
      )}

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr>
              {['Name', 'Canteen', 'Status', 'Last Seen', 'Printer', 'Device ID', 'Actions'].map((h) => (
                <th
                  key={h}
                  className="h-10 px-5 text-left text-xs font-semibold text-text-3 uppercase tracking-wide bg-bg-2 border-b border-border"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  {Array(7).fill(0).map((_, j) => (
                    <td key={j} className="px-5 py-3 border-b border-border">
                      <div className="h-4 bg-bg-2 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : kiosks.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-14">
                  <div className="flex flex-col items-center text-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-bg-2 flex items-center justify-center">
                      <MonitorOff className="w-5 h-5 text-text-3" />
                    </div>
                    <div>
                      <p className="font-display text-lg font-semibold text-text tracking-tight">
                        No kiosks registered yet
                      </p>
                      <p className="text-sm text-text-3 mt-0.5">
                        Register a kiosk to start scanning order tokens.
                      </p>
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              kiosks.map((kiosk) => {
                const printerStatus = (kiosk.heartbeat_data as Record<string, string> | null)?.printer_status ?? 'unknown';
                return (
                  <tr
                    key={kiosk.id}
                    className="border-b border-border last:border-0 hover:bg-bg-2 transition-colors"
                  >
                    <td className="px-5 py-3">
                      <p className="font-medium text-text">{kiosk.name}</p>
                      {kiosk.location && <p className="text-xs text-text-3">{kiosk.location}</p>}
                    </td>
                    <td className="px-5 py-3 text-text-2">{kiosk.canteen?.name ?? '—'}</td>
                    <td className="px-5 py-3">
                      <KioskStatusIndicator lastHeartbeat={kiosk.last_heartbeat} showTime={false} />
                    </td>
                    <td className="px-5 py-3">
                      <KioskStatusIndicator lastHeartbeat={kiosk.last_heartbeat} showTime />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        <Printer className="w-3.5 h-3.5 text-text-3" />
                        <Badge
                          variant={
                            printerStatus === 'ok' ? 'success' :
                            printerStatus === 'error' ? 'danger' : 'default'
                          }
                        >
                          {printerStatus}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="font-mono text-xs text-text-3">{kiosk.device_id}</span>
                    </td>
                    <td className="px-5 py-3">
                      <Link href={`/kiosks/${kiosk.id}`}>
                        <Button variant="ghost" size="icon-sm" title="View details">
                          <Eye className="w-4 h-4" />
                        </Button>
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>
      </div>

      {showRegister && (
        <RegisterKioskDialog
          canteens={canteens}
          onClose={() => setShowRegister(false)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['kiosks'] })}
        />
      )}
    </div>
  );
}
