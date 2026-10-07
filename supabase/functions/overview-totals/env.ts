// Must be imported before the bundle: the bundled code reads these when it creates its database client.
const g = globalThis as Record<string, unknown>;
g.__SB_URL = Deno.env.get("SUPABASE_URL");
g.__SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
