import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { randomUUID } from 'crypto';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export async function POST(request: NextRequest) {
  // Auth check
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
      { status: 401 }
    );
  }

  const service = createServiceClient();

  // Role check
  const { data: profile, error: profileError } = await service
    .from('users')
    .select('role, is_active')
    .eq('id', user.id)
    .single();

  const ALLOWED_ROLES = ['super_admin', 'canteen_admin'];
  if (profileError || !profile || !ALLOWED_ROLES.includes(profile.role) || !profile.is_active) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } },
      { status: 403 }
    );
  }

  // Parse multipart
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_BODY', message: 'Expected multipart/form-data' } },
      { status: 400 }
    );
  }

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { success: false, error: { code: 'MISSING_FILE', message: 'No file provided' } },
      { status: 400 }
    );
  }

  // Validate type
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INVALID_TYPE',
          message: 'Only JPEG, PNG, and WebP images are allowed',
        },
      },
      { status: 400 }
    );
  }

  // Validate size
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { success: false, error: { code: 'FILE_TOO_LARGE', message: 'File must be under 5 MB' } },
      { status: 400 }
    );
  }

  const ext = EXT_MAP[file.type];
  const path = `menu-items/${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await service.storage
    .from('menu-images')
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    return NextResponse.json(
      { success: false, error: { code: 'UPLOAD_ERROR', message: uploadError.message } },
      { status: 500 }
    );
  }

  const { data: urlData } = service.storage.from('menu-images').getPublicUrl(path);

  return NextResponse.json({ success: true, url: urlData.publicUrl });
}
