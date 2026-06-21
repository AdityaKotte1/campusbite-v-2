import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { authenticateKiosk } from '@/lib/kiosk-auth';

/**
 * POST /api/v1/kiosk/print-queue/{id}/ack
 *
 * Kiosk-HMAC authed. Acknowledges the outcome of a print job.
 *
 * Body: { result: 'printed' | 'failed' }
 * HMAC payload: POST\n/api/v1/kiosk/print-queue/{id}/ack\n{timestamp}\n{sha256(body)}
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // The signed path MUST be the exact request path including the job id.
  const path = `/api/v1/kiosk/print-queue/${params.id}/ack`;
  const auth = await authenticateKiosk(request, path, 'POST');
  if ('response' in auth) return auth.response;
  const { kiosk, rawBody } = auth;

  let parsed: { result?: unknown };
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_BODY', message: 'Invalid JSON body' } },
      { status: 400 }
    );
  }

  const { result } = parsed;
  if (result !== 'printed' && result !== 'failed') {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_RESULT', message: "result must be 'printed' or 'failed'" } },
      { status: 400 }
    );
  }

  const service = createServiceClient();

  // Load the job and verify it belongs to THIS kiosk's canteen.
  const { data: job } = await service
    .from('print_jobs')
    .select('id, attempts')
    .eq('id', params.id)
    .eq('canteen_id', kiosk.canteen_id)
    .maybeSingle();

  if (!job) {
    return NextResponse.json(
      { success: false, error: { code: 'JOB_NOT_FOUND', message: 'Print job not found for this canteen' } },
      { status: 404 }
    );
  }

  await service
    .from('print_jobs')
    .update({
      status: result === 'printed' ? 'printed' : 'failed',
      printed_at: new Date().toISOString(),
      printed_by_kiosk: kiosk.id,
      attempts: (job.attempts ?? 0) + 1,
    })
    .eq('id', params.id)
    .eq('canteen_id', kiosk.canteen_id);

  return NextResponse.json({ success: true });
}
