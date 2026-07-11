import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ──────────────────────────────────────────────────────────────────────────
// Storage layer: each "table" (users.json, products.json, etc.) is stored
// as a single JSON blob in one row of a Postgres table called `kv_store`.
// This keeps every route's existing read-full-array / write-full-array
// pattern working unchanged — only readJson/writeJson became async.
//
// Why a single blob per table instead of real relational rows?
// The whole app was built around "load the whole table into memory, do
// JS array logic, save the whole table back." Re-modeling every route
// into proper SQL queries would be a much bigger rewrite. This approach
// gets real persistence (survives Render free-tier restarts) with the
// smallest, safest change to the existing, already-tested route logic.
// ──────────────────────────────────────────────────────────────────────────

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error(
      'חסרים משתני סביבה SUPABASE_URL / SUPABASE_SERVICE_KEY. ' +
      'ראה קובץ SUPABASE_SETUP.md להוראות הגדרה.'
    );
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

// Simple in-memory cache so a single request that calls readJson() multiple
// times for the same table (common in this codebase) doesn't hit the DB
// more than once per table per process lifetime — refreshed on every write.
//
// IMPORTANT: we always return a deep copy of the cached value, never the
// live cached array itself. The original file-based readJson() returned a
// freshly-parsed object graph on every call (JSON.parse of a string), so
// nothing in the route code was ever shared between two readJson() calls.
// Handing out the same in-memory array reference here would let two
// concurrent requests mutate the exact same objects before either one
// calls writeJson — including a request that fails validation mid-mutation
// and never writes, silently corrupting what the next reader sees. Deep
// copying on every read preserves the original, safe behavior exactly.
const cache = new Map<string, unknown[]>();

export async function readJson<T>(filename: string): Promise<T[]> {
  if (cache.has(filename)) return structuredClone(cache.get(filename)) as T[];

  const sb = getClient();
  const { data, error } = await sb
    .from('kv_store')
    .select('value')
    .eq('key', filename)
    .maybeSingle();

  if (error) throw new Error(`Supabase read error (${filename}): ${error.message}`);

  const value = (data?.value as T[]) ?? [];
  cache.set(filename, value);
  return structuredClone(value);
}

export async function writeJson<T>(filename: string, data: T[]): Promise<void> {
  const sb = getClient();
  const { error } = await sb
    .from('kv_store')
    .upsert({ key: filename, value: data, updated_at: new Date().toISOString() }, { onConflict: 'key' });

  if (error) throw new Error(`Supabase write error (${filename}): ${error.message}`);

  cache.set(filename, structuredClone(data));
}
