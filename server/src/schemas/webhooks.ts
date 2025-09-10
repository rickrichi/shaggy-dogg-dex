// server/src/schemas/webhooks.ts
import { z } from 'zod'

/** Common string schema: non-empty. */
const NonEmpty = z.string().min(1)

/** Supabase DB event types. */
export const DbEvent = z.enum(['INSERT', 'UPDATE', 'DELETE'])
export type DbEvent = z.infer<typeof DbEvent>

/** Arbitrary row payload (record/old_record). */
const Row = z.record(NonEmpty, z.unknown())

/**
 * Supabase Database Webhook payload (for a single table).
 * - `schema` defaults to "public" if omitted
 * - `record`/`old_record` may be null (DELETE/INSERT cases) or absent
 */
export const SupabaseDbWebhookSchema = z.object({
  type: DbEvent,
  table: NonEmpty,
  schema: NonEmpty.default('public'),
  record: Row.nullable().optional(),
  old_record: Row.nullable().optional(),
})

export type SupabaseDbWebhook = z.infer<typeof SupabaseDbWebhookSchema>

/**
 * Supabase Auth Hook payload.
 * Shape varies by hook; keep permissive but typed.
 * See: Authentication → Auth Hooks (HTTP)
 */
export const SupabaseAuthHookSchema = z.object({
  type: z
    .enum([
      'before_user_created',
      'after_user_created',
      'before_user_updated',
      'after_user_updated',
      'before_user_deleted',
      'after_user_deleted',
      'after_user_confirmed',
      'customize_access_token',
    ])
    .optional(),
  event: z.string().optional(), // some hook variants provide an event label
  user: z.record(NonEmpty, z.unknown()).optional(),
  session: z.record(NonEmpty, z.unknown()).optional(),
  // Some hooks (e.g., customize_access_token) may include extra bags:
  claims: z.record(NonEmpty, z.unknown()).optional(),
  context: z.record(NonEmpty, z.unknown()).optional(),
})

export type SupabaseAuthHook = z.infer<typeof SupabaseAuthHookSchema>
