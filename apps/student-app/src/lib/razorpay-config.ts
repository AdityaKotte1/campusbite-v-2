/**
 * Server-side only. Resolves the correct Razorpay credentials for a given canteen.
 *
 * Key hierarchy (first match wins):
 *   1. Canteen has use_own_razorpay=true AND has its own keys  → use canteen keys
 *   2. Canteen's institute has keys                             → use institute keys
 *   3. Neither configured                                       → use platform env vars
 *
 * The secret is decrypted here and returned in memory. It NEVER leaves server-side code.
 */

import { createDecipheriv } from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';

export interface RazorpayCredentials {
  keyId: string;
  keySecret: string;
  webhookSecret: string | null;
  /** Where the keys came from — useful for debugging */
  source: 'canteen' | 'institute' | 'platform';
}

function decrypt(encryptedHex: string, encryptionKey: string): string {
  // Format stored: hex(iv):hex(authTag):hex(ciphertext)
  const parts = encryptedHex.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted format');
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const key = Buffer.from(encryptionKey, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export async function getRazorpayForCanteen(
  canteenId: string,
  supabase: SupabaseClient
): Promise<RazorpayCredentials> {
  const encKey = process.env.SECRET_ENCRYPTION_KEY;
  if (!encKey) throw new Error('SECRET_ENCRYPTION_KEY not configured');

  // Fetch canteen + institute in one query
  const { data: canteen, error } = await supabase
    .from('canteens')
    .select(`
      id, name, use_own_razorpay,
      razorpay_key_id, razorpay_key_secret_enc, razorpay_webhook_secret_enc,
      institute:institutes(
        id, name,
        razorpay_key_id, razorpay_key_secret_enc, razorpay_webhook_secret_enc
      )
    `)
    .eq('id', canteenId)
    .single();

  if (error || !canteen) {
    throw new Error(`Canteen ${canteenId} not found`);
  }

  const institute = canteen.institute as unknown as {
    id: string;
    name: string;
    razorpay_key_id: string | null;
    razorpay_key_secret_enc: string | null;
    razorpay_webhook_secret_enc: string | null;
  } | null;

  // 1. Canteen's own keys
  if (
    canteen.use_own_razorpay &&
    canteen.razorpay_key_id &&
    canteen.razorpay_key_secret_enc
  ) {
    return {
      keyId: canteen.razorpay_key_id,
      keySecret: decrypt(canteen.razorpay_key_secret_enc, encKey),
      webhookSecret: canteen.razorpay_webhook_secret_enc
        ? decrypt(canteen.razorpay_webhook_secret_enc, encKey)
        : null,
      source: 'canteen',
    };
  }

  // 2. Institute-level keys
  if (institute?.razorpay_key_id && institute.razorpay_key_secret_enc) {
    return {
      keyId: institute.razorpay_key_id,
      keySecret: decrypt(institute.razorpay_key_secret_enc, encKey),
      webhookSecret: institute.razorpay_webhook_secret_enc
        ? decrypt(institute.razorpay_webhook_secret_enc, encKey)
        : null,
      source: 'institute',
    };
  }

  // 3. Platform fallback (env vars)
  const platformKeyId = process.env.RAZORPAY_KEY_ID;
  const platformKeySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!platformKeyId || !platformKeySecret) {
    throw new Error(
      `No Razorpay keys configured for canteen ${canteenId} or its institute, and no platform fallback set.`
    );
  }

  return {
    keyId: platformKeyId,
    keySecret: platformKeySecret,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? null,
    source: 'platform',
  };
}
