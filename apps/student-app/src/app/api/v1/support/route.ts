import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const createTicketSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000),
  category: z.enum(['order', 'payment', 'refund', 'account', 'other']),
  order_number: z.string().trim().max(32).optional().nullable(),
});

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: 'database_error', message: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = createTicketSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', message: parsed.error.errors[0].message },
      { status: 400 }
    );
  }
  const { category, order_number, subject, message } = parsed.data;

  const { data: profile } = await supabase
    .from('users')
    .select('full_name, email')
    .eq('id', user.id)
    .single();

  const { data, error } = await supabase
    .from('support_tickets')
    .insert({
      user_id: user.id,
      email: profile?.email ?? user.email ?? null,
      name: profile?.full_name ?? null,
      category,
      order_number: order_number || null,
      subject,
      message,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'database_error', message: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
