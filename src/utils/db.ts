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

// NOTE: there is intentionally NO in-memory cache here. An earlier version
// cached each table for the lifetime of the Node process, which caused a
// real bug: any write that happened outside that specific running process
// (for example the randomize-quantities.ts script writing directly to
// Supabase, or simply Render spinning up a fresh instance after a restart)
// left the cache silently stale, so different requests could see different,
// inconsistent data depending on which process happened to handle them.
// Supabase reads are cheap and fast enough for this app's scale — always
// reading fresh removes that whole class of bug.

export async function readJson<T>(filename: string): Promise<T[]> {
  const sb = getClient();
  const { data, error } = await sb
    .from('kv_store')
    .select('value')
    .eq('key', filename)
    .maybeSingle();

  if (error) throw new Error(`Supabase read error (${filename}): ${error.message}`);

  return (data?.value as T[]) ?? [];
}

export async function writeJson<T>(filename: string, data: T[]): Promise<void> {
  const sb = getClient();
  const { error } = await sb
    .from('kv_store')
    .upsert({ key: filename, value: data, updated_at: new Date().toISOString() }, { onConflict: 'key' });

  if (error) throw new Error(`Supabase write error (${filename}): ${error.message}`);
}
