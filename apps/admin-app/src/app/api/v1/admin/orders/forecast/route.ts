import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin, allowedCanteenIds, canAccessCanteen, forbidden } from '@/lib/auth';

type Row = { menu_item_id: string; name: string; predicted: number | null; basis: string };

export async function GET(request: NextRequest) {
  const { profile, response } = await requireAdmin();
  if (response) return response;

  const params = new URL(request.url).searchParams;
  const canteenId = params.get('canteen_id');
  const dateStr = params.get('date');
  if (!canteenId || !dateStr) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'canteen_id and date are required' } },
      { status: 400 }
    );
  }
  const allowed = await allowedCanteenIds(profile);
  if (!canAccessCanteen(canteenId, allowed)) return forbidden('Cannot access this canteen');

  const tomorrow = new Date(dateStr + 'T00:00:00Z');
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const service = createServiceClient();
  const run = async (d: string): Promise<Row[]> => {
    const { data, error } = await service.rpc('forecast_canteen_demand', {
      p_canteen_id: canteenId,
      p_target_date: d,
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as Row[];
  };

  try {
    const [today, nextDay] = await Promise.all([run(dateStr), run(tomorrowStr)]);
    return NextResponse.json({ success: true, data: { today, tomorrow: nextDay } });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'FORECAST_ERROR', message: (e as Error).message } },
      { status: 500 }
    );
  }
}
