import "./env.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
// Built from src/jobs/overviewTotalsJob.ts (npm run build:overview-job) so the job uses the same calculations as the reports.
import { runOverviewTotals } from "./job.bundle.js";

let cachedCronSecret: string | null = null;

async function getCronSecret(): Promise<string> {
  if (cachedCronSecret !== null) return cachedCronSecret;
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data } = await client.from("_cron_secret").select("secret").eq("id", 1).maybeSingle();
  cachedCronSecret = data?.secret ?? "";
  return cachedCronSecret;
}

async function isAuthorized(req: Request): Promise<boolean> {
  const cronHeader = req.headers.get("X-Cron-Secret");
  if (cronHeader) {
    const secret = await getCronSecret();
    if (secret && cronHeader === secret) return true;
  }
  const auth = req.headers.get("Authorization");
  if (auth && auth.startsWith("Bearer ")) {
    const token = auth.slice(7);
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data } = await client.auth.getUser(token);
    if (data.user) return true;
  }
  return false;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const RUN_TYPES = new Set(["nightly", "quick", "full", "manual", "maintenance"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Wraps the job so it appears as an "overview_totals" step in Sync History.
async function runLogged(opts: Parameters<typeof runOverviewTotals>[0], runId: unknown, runType: unknown) {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: log, error: logErr } = await supabase
    .from("sync_logs")
    .insert({
      sync_type: "overview_totals",
      status: "started",
      started_at: new Date().toISOString(),
      run_id: typeof runId === "string" && UUID_RE.test(runId) ? runId : crypto.randomUUID(),
      run_type: typeof runType === "string" && RUN_TYPES.has(runType) ? runType : "manual",
    })
    .select("id")
    .maybeSingle();
  if (logErr) console.error("overview-totals: could not write sync log", logErr.message);

  const finish = async (fields: Record<string, unknown>) => {
    if (!log?.id) return;
    const { error } = await supabase
      .from("sync_logs")
      .update({ completed_at: new Date().toISOString(), ...fields })
      .eq("id", log.id);
    if (error) console.error("overview-totals: could not update sync log", error.message);
  };

  try {
    const result = await runOverviewTotals(opts);
    await finish({ status: "completed", records_synced: result.rows, raw_response: result });
    return result;
  } catch (e) {
    await finish({ status: "error", error_message: (e instanceof Error ? e.message : String(e)).slice(0, 2000) });
    throw e;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  if (!await isAuthorized(req)) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const opts = {
      fromMonth: typeof body.fromMonth === "string" ? body.fromMonth : undefined,
      toMonth: typeof body.toMonth === "string" ? body.toMonth : undefined,
      obligationsAsOf: typeof body.obligationsAsOf === "string" ? body.obligationsAsOf : undefined,
    };

    if (body.background === true) {
      const task = runLogged(opts, body.runId, body.runType)
        .then((r: unknown) => console.log("overview-totals done", JSON.stringify(r)))
        .catch((e: Error) => console.error("overview-totals failed", e.message));
      // deno-lint-ignore no-explicit-any
      (globalThis as any).EdgeRuntime?.waitUntil(task);
      return json({ success: true, started: true });
    }

    const result = await runLogged(opts, body.runId, body.runType);
    return json({ success: true, result });
  } catch (err) {
    return json({ success: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
