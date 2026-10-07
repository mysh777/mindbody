import "./env.ts";
// Built from src/jobs/overviewTotalsJob.ts (npm run build:overview-job) so the job uses the same calculations as the reports.
import { runOverviewTotals } from "./job.bundle.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const opts = {
      fromMonth: typeof body.fromMonth === "string" ? body.fromMonth : undefined,
      toMonth: typeof body.toMonth === "string" ? body.toMonth : undefined,
      obligationsAsOf: typeof body.obligationsAsOf === "string" ? body.obligationsAsOf : undefined,
    };

    if (body.background === true) {
      const task = runOverviewTotals(opts)
        .then((r: unknown) => console.log("overview-totals done", JSON.stringify(r)))
        .catch((e: Error) => console.error("overview-totals failed", e.message));
      // deno-lint-ignore no-explicit-any
      (globalThis as any).EdgeRuntime?.waitUntil(task);
      return json({ success: true, started: true });
    }

    const result = await runOverviewTotals(opts);
    return json({ success: true, result });
  } catch (err) {
    return json({ success: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
