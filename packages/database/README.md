# MunchAdda — Database Package

This package contains all PostgreSQL schema definitions, RLS policies, and PL/pgSQL functions for the MunchAdda platform running on Supabase.

## Files

| File | Purpose |
|------|---------|
| `schema.sql` | All `CREATE TABLE` statements and indexes |
| `rls.sql` | Row Level Security policies for every table |
| `functions.sql` | Triggers, helper functions, and the QR token validation function |
| `migrations/001_initial.sql` | All-in-one migration that runs schema + RLS + functions in a single transaction |

## Running the Migration

### Option A: Supabase SQL Editor (Recommended for first setup)

1. Open your Supabase project dashboard
2. Go to **SQL Editor** → **New query**
3. Copy the entire contents of `migrations/001_initial.sql`
4. Click **Run** (or press `Ctrl+Enter`)

The migration is wrapped in a `BEGIN/COMMIT` transaction — if anything fails, the entire migration is rolled back cleanly.

### Option B: Supabase CLI

```bash
# Link your project
supabase link --project-ref your-project-ref

# Push migration
supabase db push

# Or execute directly
supabase db execute --file packages/database/migrations/001_initial.sql
```

### Option C: Run individual files (for debugging or partial re-runs)

Run in this order:

```
1. schema.sql
2. rls.sql
3. functions.sql
```

## Notes

- **Service role key** is required for kiosk endpoints — these bypass RLS intentionally.
- **`validate_and_use_qr_token`** is the critical atomic function. It uses `FOR UPDATE NOWAIT` to prevent concurrent double-scans.
- The `users` table mirrors `auth.users` — the `handle_new_user` trigger keeps them in sync automatically for both email and Google OAuth sign-ups.
- All monetary values are stored in **paise** (₹1 = 100 paise).
- **QR tokens** have a unique partial index ensuring only one `active` token per order at any time.
