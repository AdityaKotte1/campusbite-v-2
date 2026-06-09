/**
 * GET  /api/v1/admin/payment-config
 *   Returns: institutes with their Razorpay config status (key_id only — never secret)
 *            and each canteen's config status.
 *
 * POST /api/v1/admin/payment-config
 *   Save Razorpay keys for an institute or canteen.
 *   Body: { target: 'institute' | 'canteen', id: uuid, key_id, key_secret, webhook_secret? }
 *
 * Only super_admin can configure institute-level keys.
 * canteen_admin can configure their own institute and canteens under it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { createCipheriv, randomBytes } from 'crypto';
import { z } from 'zod';

const SUPER_ADMIN_ROLES = ['super_admin'];
const ADMIN_ROLES = ['super_admin', 'canteen_admin'];

function encrypt(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

async function getAuthenticatedAdmin(supabase: ReturnType<typeof createClient>, service: ReturnType<typeof createServiceClient>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, profile: null };

  const { data: profile } = await service
    .from('users')
    .select('id, role, institute_id, is_active')
    .eq('id', user.id)
    .single();

  return { user, profile };
}

// GET — return config status for all institutes + canteens visible to this admin
export async function GET(_: NextRequest) {
  const supabase = createClient();
  const service = createServiceClient();
  const { user, profile } = await getAuthenticatedAdmin(supabase, service);

  if (!user || !profile || !ADMIN_ROLES.includes(profile.role) || !profile.is_active) {
    return NextResponse.json({ success: false, error: { code: 'FORBIDDEN' } }, { status: 403 });
  }

  // Super admin sees all; canteen_admin sees only their institute
  let institutesQuery = service
    .from('institutes')
    .select('id, name, short_name, city, razorpay_key_id, razorpay_configured_at')
    .eq('is_active', true);

  if (!SUPER_ADMIN_ROLES.includes(profile.role) && profile.institute_id) {
    institutesQuery = institutesQuery.eq('id', profile.institute_id);
  }

  const { data: institutes, error: instError } = await institutesQuery.order('name');
  if (instError) {
    console.error('[payment-config GET] institutes error:', instError.message);
    return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: instError.message } }, { status: 500 });
  }

  // Get canteens for each visible institute
  const instituteIds = (institutes ?? []).map((i: { id: string }) => i.id);
  if (instituteIds.length === 0) {
    return NextResponse.json({ success: true, data: [] });
  }

  const { data: canteens, error: cantError } = await service
    .from('canteens')
    .select('id, name, institute_id, use_own_razorpay, razorpay_key_id, razorpay_configured_at')
    .in('institute_id', instituteIds)
    .eq('is_active', true)
    .order('name');
  if (cantError) {
    console.error('[payment-config GET] canteens error:', cantError.message);
  }

  // Group canteens under their institute
  const canteensByInstitute = (canteens ?? []).reduce<Record<string, Record<string, unknown>[]>>((acc, c) => {
    const row = c as Record<string, unknown>;
    const iid = row.institute_id as string;
    if (!acc[iid]) acc[iid] = [];
    acc[iid]!.push(row);
    return acc;
  }, {});

  const result = (institutes ?? []).map((inst: Record<string, unknown>) => ({
    id: inst.id,
    name: inst.name,
    code: inst.short_name ?? '',       // alias short_name → code for the frontend
    city: inst.city ?? '',
    is_configured: !!inst.razorpay_key_id,
    razorpay_key_id_masked: inst.razorpay_key_id
      ? `${String(inst.razorpay_key_id).slice(0, 12)}...`
      : null,
    razorpay_configured_at: inst.razorpay_configured_at ?? null,
    canteens: (canteensByInstitute[inst.id as string] ?? []).map((c: Record<string, unknown>) => ({
      id: c.id,
      name: c.name,
      use_own_razorpay: c.use_own_razorpay ?? false,
      is_configured: !!c.razorpay_key_id,
      razorpay_key_id_masked: c.razorpay_key_id
        ? `${String(c.razorpay_key_id).slice(0, 12)}...`
        : null,
      razorpay_configured_at: c.razorpay_configured_at ?? null,
    })),
  }));

  return NextResponse.json({ success: true, data: result });
}

const saveSchema = z.object({
  target: z.enum(['institute', 'canteen']),
  id: z.string().uuid(),
  key_id: z.string().min(10).startsWith('rzp_', { message: 'Key ID must start with rzp_' }),
  key_secret: z.string().min(10),
  webhook_secret: z.string().optional(),
});

// POST — save or update Razorpay keys
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const service = createServiceClient();
  const { user, profile } = await getAuthenticatedAdmin(supabase, service);

  if (!user || !profile || !ADMIN_ROLES.includes(profile.role) || !profile.is_active) {
    return NextResponse.json({ success: false, error: { code: 'FORBIDDEN' } }, { status: 403 });
  }

  const encKey = process.env.SECRET_ENCRYPTION_KEY;
  if (!encKey) {
    return NextResponse.json({ success: false, error: { code: 'MISCONFIGURED', message: 'SECRET_ENCRYPTION_KEY not set' } }, { status: 500 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ success: false, error: { code: 'INVALID_JSON' } }, { status: 400 });
  }

  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: { code: 'VALIDATION', message: parsed.error.errors[0].message } }, { status: 400 });
  }

  const { target, id, key_id, key_secret, webhook_secret } = parsed.data;

  // Institute config — super_admin only
  if (target === 'institute') {
    if (!SUPER_ADMIN_ROLES.includes(profile.role)) {
      return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Only super_admin can configure institute-level payment keys' } }, { status: 403 });
    }

    const { error } = await service
      .from('institutes')
      .update({
        razorpay_key_id: key_id,
        razorpay_key_secret_enc: encrypt(key_secret, encKey),
        razorpay_webhook_secret_enc: webhook_secret ? encrypt(webhook_secret, encKey) : null,
        razorpay_configured_at: new Date().toISOString(),
        razorpay_configured_by: user.id,
      })
      .eq('id', id);

    if (error) return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: error.message } }, { status: 500 });

    return NextResponse.json({ success: true, message: 'Institute Razorpay keys saved securely.' });
  }

  // Canteen config — canteen_admin can set for their own canteens
  if (target === 'canteen') {
    // Verify canteen belongs to the admin's institute (non-super_admin)
    if (!SUPER_ADMIN_ROLES.includes(profile.role) && profile.institute_id) {
      const { data: canteen } = await service
        .from('canteens')
        .select('institute_id')
        .eq('id', id)
        .single();

      if (!canteen || canteen.institute_id !== profile.institute_id) {
        return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'This canteen does not belong to your institute' } }, { status: 403 });
      }
    }

    const { error } = await service
      .from('canteens')
      .update({
        use_own_razorpay: true,
        razorpay_key_id: key_id,
        razorpay_key_secret_enc: encrypt(key_secret, encKey),
        razorpay_webhook_secret_enc: webhook_secret ? encrypt(webhook_secret, encKey) : null,
        razorpay_configured_at: new Date().toISOString(),
        razorpay_configured_by: user.id,
      })
      .eq('id', id);

    if (error) return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: error.message } }, { status: 500 });

    return NextResponse.json({ success: true, message: 'Canteen Razorpay keys saved securely.' });
  }
}

// DELETE — remove keys (revert to parent/platform)
export async function DELETE(request: NextRequest) {
  const supabase = createClient();
  const service = createServiceClient();
  const { user, profile } = await getAuthenticatedAdmin(supabase, service);

  if (!user || !profile || !ADMIN_ROLES.includes(profile.role) || !profile.is_active) {
    return NextResponse.json({ success: false, error: { code: 'FORBIDDEN' } }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const target = searchParams.get('target') as 'institute' | 'canteen' | null;
  const id = searchParams.get('id');

  if (!target || !id) {
    return NextResponse.json({ success: false, error: { code: 'MISSING_PARAMS' } }, { status: 400 });
  }

  if (target === 'institute') {
    if (!SUPER_ADMIN_ROLES.includes(profile.role)) {
      return NextResponse.json({ success: false, error: { code: 'FORBIDDEN' } }, { status: 403 });
    }
    await service.from('institutes').update({
      razorpay_key_id: null,
      razorpay_key_secret_enc: null,
      razorpay_webhook_secret_enc: null,
      razorpay_configured_by: user.id,
    }).eq('id', id);
  } else {
    await service.from('canteens').update({
      use_own_razorpay: false,
      razorpay_key_id: null,
      razorpay_key_secret_enc: null,
      razorpay_webhook_secret_enc: null,
    }).eq('id', id);
  }

  return NextResponse.json({ success: true });
}
