import "./env.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
// Built from src/jobs/reconciliationJob.ts (npm run build:reconciliation-job) so the job uses the
// same calculation as the browser's "Check now" button.
import { runReconciliationJob } from "./job.bundle.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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

async function sendEmailViaResend(recipients: string, subject: string, body: string): Promise<{ sent: boolean; error: string | null }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { sent: false, error: "RESEND_API_KEY not set" };
  const emails = recipients.split(",").map((e) => e.trim()).filter(Boolean);
  if (emails.length === 0) return { sent: false, error: "No recipients configured" };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Reconciliation <onboarding@resend.dev>", to: emails, subject, text: body }),
    });
    if (!response.ok) {
      const errText = await response.text();
      return { sent: false, error: `Resend API error ${response.status}: ${errText}` };
    }
    return { sent: true, error: null };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function runLogged(sendTestEmail: boolean, runId: string, wait: boolean) {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: logRow } = await supabase.from("sync_logs").insert({
    sync_type: "reconciliation_nightly", status: "started", started_at: new Date().toISOString(),
    run_id: runId, run_type: "nightly",
  }).select("id").maybeSingle();
  const logId = logRow?.id;
  const finishLog = async (fields: Record<string, unknown>) => {
    if (!logId) return;
    await supabase.from("sync_logs").update({ completed_at: new Date().toISOString(), ...fields }).eq("id", logId);
  };

  try {
    const result = await runReconciliationJob();

    // Email notifications
    const { data: notifData } = await supabase.from("notification_settings")
      .select("email_recipients, notify_red_reconciliation, notify_sync_errors, notify_data_issues")
      .eq("id", 1).maybeSingle();
    const notif = notifData as { email_recipients: string; notify_red_reconciliation: boolean; notify_sync_errors: boolean; notify_data_issues: boolean } | null;

    let emailSent = false;
    let emailError: string | null = null;
    const emailSections: string[] = [];

    if (notif?.notify_red_reconciliation && !result.allOk && result.errors.length === 0) {
      emailSections.push(
        `Reconciliation check found issues (${result.checkedAt}).`,
        `Provisional mismatches: ${result.provisionalMismatches}`,
        `Auto-confirmed: ${result.autoConfirmed.length}`,
        "",
        "Auto-confirmed entries:",
        ...result.autoConfirmed.map((e) => `  - ${e.period} ${e.checkType}: +${e.diff.toFixed(2)} — ${e.explanation}`),
        "",
        "Please check the Reconciliation page in the app for details.",
      );
    }

    if (notif?.notify_sync_errors) {
      const yesterday = new Date(Date.now() - 86400000).toISOString();
      const { data: failedSyncs } = await supabase.from("sync_logs")
        .select("sync_type, error_message, completed_at")
        .eq("status", "error").gte("completed_at", yesterday)
        .order("completed_at", { ascending: false }).limit(10);
      if (failedSyncs && failedSyncs.length > 0) {
        emailSections.push("", "Recent sync errors:");
        for (const s of failedSyncs) emailSections.push(`  - ${s.sync_type}: ${(s.error_message || "").slice(0, 200)} (${s.completed_at})`);
      }
    }

    if (notif?.email_recipients) {
      if (emailSections.length > 0 || sendTestEmail) {
        const subject = sendTestEmail ? "Reconciliation test email" : "Mindbody Reconciliation Alert";
        const body = sendTestEmail
          ? `This is a test email from the reconciliation system.\n\nRecipients: ${notif.email_recipients}\nTime: ${new Date().toISOString()}`
          : emailSections.join("\n");
        const er = await sendEmailViaResend(notif.email_recipients, subject, body);
        emailSent = er.sent;
        emailError = er.error;
      }
    }

    await finishLog({
      status: result.errors.length > 0 ? "error" : "completed",
      records_synced: result.autoConfirmed.length,
      raw_response: { ...result, emailSent, emailError },
      error_message: result.errors.length > 0 ? result.errors.join("; ").slice(0, 2000) : null,
    });

    console.log("reconciliation-nightly completed", JSON.stringify({ allOk: result.allOk, autoConfirmed: result.autoConfirmed.length, snapshotSaved: result.snapshotSaved, emailSent }));
    return { ...result, emailSent, emailError };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("reconciliation-nightly failed", msg);
    await finishLog({ status: "error", error_message: msg.slice(0, 2000) });
    throw err;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (!await isAuthorized(req)) return json({ success: false, error: "Unauthorized" }, 401);

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const sendTestEmail = body.testEmail === true;
    const runId = typeof body.runId === "string" ? body.runId : crypto.randomUUID();
    const wait = body.wait === true;

    if (wait) {
      const result = await runLogged(sendTestEmail, runId, true);
      return json({ success: true, started: false, runId, result });
    }

    const task = runLogged(sendTestEmail, runId, false)
      .then(() => console.log("reconciliation-nightly background done"))
      .catch((e: Error) => console.error("reconciliation-nightly background error", e.message));
    (globalThis as Record<string, unknown>).EdgeRuntime?.waitUntil?.(task);
    return json({ success: true, started: true, runId });
  } catch (err) {
    return json({ success: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
