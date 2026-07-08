import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';

const updateSchema = z.object({
  institute_id: z.string().uuid().optional(),
  full_name: z.string().min(1).max(100).optional(),
  phone: z.string().max(20).optional().nullable(),
  avatar_url: z.string().url().refine((u) => /^https?:\/\//i.test(u), 'Must be an http(s) URL').optional().nullable(),
});

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('users')
    .select('*, institute:institutes!users_institute_id_fkey(id, name, code:short_name, city, state)')
    .eq('id', user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({ data });
}

export async function PATCH(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', message: parsed.error.errors[0].message },
      { status: 400 }
    );
  }

  const updates = parsed.data;

  // If setting institute_id, verify the institute exists and is active.
  // Students may change their institute from the profile picker (consistent with
  // onboarding, which already lets them pick any institute); we only require the
  // target institute to exist and be active.
  if (updates.institute_id) {
    const { data: institute, error: instErr } = await supabase
      .from('institutes')
      .select('id')
      .eq('id', updates.institute_id)
      .eq('is_active', true)
      .single();

    if (instErr || !institute) {
      return NextResponse.json(
        { error: 'invalid_institute', message: 'Institute not found or inactive' },
        { status: 400 }
      );
    }
  }

  const { data, error } = await supabase
    .from('users')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', user.id)
    .select()
    .single();

  if (error) {
    console.error('[users/me PATCH]', error);
    return NextResponse.json(
      { error: 'database_error' },
      { status: 500 }
    );
  }

  return NextResponse.json({ data });
}

// DELETE — account deletion (DPDP erasure). Removes personal data and
// deactivates the account. Transactional records (orders/payments) are retained
// in anonymised form as required for tax/accounting and dispute resolution.
export async function DELETE() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const service = createServiceClient();
  const { error } = await service
    .from('users')
    .update({
      full_name: 'Deleted User',
      phone: null,
      avatar_url: null,
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (error) {
    console.error('[users/me DELETE]', error);
    return NextResponse.json({ error: 'database_error' }, { status: 500 });
  }

  return NextResponse.json({ data: { deleted: true } });
}
