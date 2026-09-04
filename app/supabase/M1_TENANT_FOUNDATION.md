# M1 Tenant Foundation

## Scope

This migration is additive-only and is not executed automatically by the application.

It creates the tenant foundation only when neither `tenants` nor `memberships` exists.
If an earlier tenant foundation is already present, the migration stops for manual
inspection instead of altering it.

## New Tables

### `tenants`

- `id uuid` primary key with `gen_random_uuid()` default.
- `name text not null`.
- `slug text unique not null`.
- `status text not null`, limited to `active`, `suspended`, `archived`.
- `created_at` and `updated_at` as `timestamptz not null` with `now()` defaults.

### `memberships`

- `id uuid` primary key with `gen_random_uuid()` default.
- `tenant_id` references `tenants(id)` with `ON DELETE CASCADE`.
- `user_id` references `auth.users(id)` with `ON DELETE CASCADE`.
- `role` limited to `OWNER`, `ADMIN`, `ACCOUNTANT`, `RECEPTIONIST`, `TEACHER`, `VIEWER`.
- `status` limited to `active` and `suspended`.
- `created_at` and `updated_at` as `timestamptz not null` with `now()` defaults.
- Unique membership per `(tenant_id, user_id)`.

## Helper Functions

- `public.m1_get_user_tenant_ids()` returns active Tenant IDs for `auth.uid()`.
- `public.m1_is_tenant_member(uuid)` checks active membership for `auth.uid()`.
- `public.m1_get_tenant_role(uuid)` returns the active role for `auth.uid()`.

All helpers are `STABLE SECURITY DEFINER` functions with a fixed `search_path` and
do not use `localStorage` or `user_metadata`.

## RLS

RLS is enabled only on the two new foundation tables.

- Authenticated users can select Tenants where they have an active membership.
- Users can select their own memberships.
- `OWNER` and `ADMIN` can select memberships in Tenants they manage.
- No public or anonymous policy is created.
- No INSERT, UPDATE, or DELETE policy is created for client-side provisioning.

## Explicitly Not Implemented

- No bootstrap Tenant or Owner membership.
- No changes to `students`, `payments`, or `app_settings`.
- No financial backfill.
- No `subscriptions` table.
- No Payment linking.
- No legacy RLS replacement.
- No modification or deletion of existing data, constraints, or indexes.
- No frontend, service, type, or component changes.

## Existing Migration 12

`12_tenant_foundation.sql` defines an older role vocabulary containing `ASSISTANT`.
This M1 migration does not alter or repair it. If either foundation table already
exists, the migration raises a blocking error for manual review.