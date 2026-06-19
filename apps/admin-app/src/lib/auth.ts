// Shared admin authorization helpers.
//
// Every admin API route uses the service-role client (which BYPASSES RLS), so
// these in-route checks are the ONLY access control. Route handlers MUST:
//   1. authenticate the caller            → requireAdmin()
//   2. enforce the allowed role set       → requireAdmin(roles)
//   3. enforce tenant scoping on the      → allowedCanteenIds() / canAccessCanteen()
//      specific resource being touched      / canAccessInstitute()
//
// Standardising this here removes the copy-paste drift that caused the
// cross-tenant IDOR / privilege-escalation findings in the security audit.

import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export type Role = 'super_admin' | 'canteen_admin' | 'staff';

export interface CallerProfile {
  id: string;
  role: Role;
  is_active: boolean;
  institute_id: string | null;
  assigned_canteen_id: string | null;
}

export const ALL_ADMIN_ROLES: Role[] = ['super_admin', 'canteen_admin', 'staff'];

export function unauthorized(): NextResponse {
  return NextResponse.json(
    { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
    { status: 401 }
  );
}

export function forbidden(message = 'Forbidden'): NextResponse {
  return NextResponse.json(
    { success: false, error: { code: 'FORBIDDEN', message } },
    { status: 403 }
  );
}

export function notFound(message = 'Not found'): NextResponse {
  return NextResponse.json(
    { success: false, error: { code: 'NOT_FOUND', message } },
    { status: 404 }
  );
}

type RequireAdminResult =
  | { profile: CallerProfile; response?: undefined }
  | { profile?: undefined; response: NextResponse };

/**
 * Authenticate the caller, load their profile, and enforce the allowed role set.
 * Returns `{ profile }` on success or `{ response }` (a 401/403) to return as-is.
 *
 *   const { profile, response } = await requireAdmin(['super_admin', 'canteen_admin']);
 *   if (response) return response;
 */
export async function requireAdmin(
  allowedRoles: Role[] = ALL_ADMIN_ROLES
): Promise<RequireAdminResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { response: unauthorized() };

  const service = createServiceClient();
  const { data: profile } = await service
    .from('users')
    .select('id, role, is_active, institute_id, assigned_canteen_id')
    .eq('id', user.id)
    .single();

  if (
    !profile ||
    !profile.is_active ||
    !allowedRoles.includes(profile.role as Role)
  ) {
    return { response: forbidden('Admin access required') };
  }

  return { profile: profile as CallerProfile };
}

/**
 * Canteen IDs this caller may act on. `null` means unrestricted (super_admin).
 * staff → their assigned canteen only; canteen_admin → all canteens in their
 * institute; a misconfigured non-super-admin (no institute/canteen) → [] (none).
 */
export async function allowedCanteenIds(
  profile: CallerProfile
): Promise<string[] | null> {
  if (profile.role === 'super_admin') return null;
  if (profile.role === 'staff') {
    return profile.assigned_canteen_id ? [profile.assigned_canteen_id] : [];
  }
  // canteen_admin
  if (!profile.institute_id) return [];
  const service = createServiceClient();
  const { data } = await service
    .from('canteens')
    .select('id')
    .eq('institute_id', profile.institute_id);
  return (data ?? []).map((c: { id: string }) => c.id);
}

/** True if the caller may touch the given canteen. `allowed` from allowedCanteenIds(). */
export function canAccessCanteen(
  canteenId: string,
  allowed: string[] | null
): boolean {
  if (allowed === null) return true; // super_admin
  return allowed.includes(canteenId);
}

/** True if the caller may touch a resource owned by the given institute. */
export function canAccessInstitute(
  profile: CallerProfile,
  instituteId: string | null
): boolean {
  if (profile.role === 'super_admin') return true;
  return !!instituteId && profile.institute_id === instituteId;
}

/**
 * Final canteen-id restriction for a list query, honoring the caller's allowed
 * scope AND optional narrowing filters (from the super_admin scope selector).
 * Returns `null` = no restriction (super_admin, no filter). Returns `[]` = nothing
 * in scope. NEVER widens: a non-super-admin's allowed set always bounds the result.
 */
export async function resolveCanteenScope(
  profile: CallerProfile,
  filters: { instituteId?: string | null; canteenId?: string | null }
): Promise<string[] | null> {
  const base = await allowedCanteenIds(profile); // null = unrestricted (super_admin)

  // Compute the requested narrowing set (or null = no narrowing requested).
  let requested: string[] | null = null;
  if (filters.canteenId) {
    requested = [filters.canteenId];
  } else if (filters.instituteId) {
    const service = createServiceClient();
    const { data } = await service
      .from('canteens')
      .select('id')
      .eq('institute_id', filters.instituteId);
    requested = (data ?? []).map((c: { id: string }) => c.id);
  }

  if (requested === null) return base;          // no narrowing → caller's own scope
  if (base === null) return requested;          // super_admin → exactly the requested set
  return base.filter((id) => requested!.includes(id)); // intersect (never widens)
}

/**
 * Resolve a canteen's institute_id (for institute-level scoping of a canteen
 * resource). Returns null if the canteen does not exist.
 */
export async function instituteIdForCanteen(
  canteenId: string
): Promise<string | null> {
  const service = createServiceClient();
  const { data } = await service
    .from('canteens')
    .select('institute_id')
    .eq('id', canteenId)
    .single();
  return data?.institute_id ?? null;
}
