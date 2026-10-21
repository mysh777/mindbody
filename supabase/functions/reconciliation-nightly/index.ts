import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

let cachedCronSecret: string | null = null;

async function getCronSecret(client: ReturnType<typeof createClient>): Promise<string> {
  if (cachedCronSecret !== null) return cachedCronSecret;
  const { data } = await client.from("_cron_secret").select("secret").eq("id", 1).maybeSingle();
  cachedCronSecret = data?.secret ?? "";
  return cachedCronSecret;
}

async function isAuthorized(req: Request): Promise<boolean> {
  const cronHeader = req.headers.get("X-Cron-Secret");
  if (cronHeader) {
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const secret = await getCronSecret(client);
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

interface NotificationSettings {
  email_recipients: string;
  notify_red_reconciliation: boolean;
  notify_sync_errors: boolean;
  notify_data_issues: boolean;
}

async function sendEmail(recipients: string, subject: string, body: string): Promise<void> {
  const emails = recipients.split(",").map(e => e.trim()).filter(Boolean);
  if (emails.length === 0) return;
  // Use Supabase's built-in email via the auth admin API
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  // Send each email individually
  for (const email of emails) {
    try {
      await supabase.auth.admin.inviteUserByEmail(email, {
        data: { notification_subject: subject, notification_body: body },
      });
    } catch {
      // If email sending fails, log but don't block
      console.error(`Failed to send email to ${email}`);
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  if (!await isAuthorized(req)) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load notification settings
    const { data: notifSettings } = await supabase
      .from("notification_settings")
      .select("email_recipients, notify_red_reconciliation, notify_sync_errors, notify_data_issues")
      .eq("id", 1)
      .maybeSingle() as { data: NotificationSettings | null };

    // Check for recent sync errors
    const syncErrorBody: string[] = [];
    if (notifSettings?.notify_sync_errors) {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: failedSyncs } = await supabase
        .from("sync_logs")
        .select("sync_type, error_message, completed_at")
        .eq("status", "error")
        .gte("completed_at", yesterday)
        .order("completed_at", { ascending: false })
        .limit(10);

      if (failedSyncs && failedSyncs.length > 0) {
        syncErrorBody.push("Recent sync errors:");
        for (const s of failedSyncs) {
          syncErrorBody.push(`  - ${s.sync_type}: ${(s.error_message || "").slice(0, 200)} (${s.completed_at})`);
        }
      }
    }

    // The reconciliation check runs client-side because it uses the anon key client
    // with FIFO calculations. For the nightly job, we trigger it via the app's
    // reconciliation endpoint. Here we just check the last status and send notifications.

    const { data: lastStatus } = await supabase
      .from("reconciliation_status")
      .select("checked_at, all_ok")
      .eq("id", 1)
      .maybeSingle();

    const reconBody: string[] = [];
    if (notifSettings?.notify_red_reconciliation && lastStatus && !lastStatus.all_ok) {
      reconBody.push(`Reconciliation check at ${lastStatus.checked_at} found issues.`);
      reconBody.push("Please check the Reconciliation page in the app for details.");
    }

    // Check for data quality issues (unknown payment types)
    const dataIssuesBody: string[] = [];
    if (notifSettings?.notify_data_issues) {
      const knownTypes = ["Visa/MC", "AMEX", "Check", "Cash", "Prepaid Gift Card", "Account", "Comp/Guest", "Other"];
      const { data: unknownPayments } = await supabase
        .from("payments")
        .select("type, amount")
        .not("type", "in", `(${knownTypes.map(t => `"${t}"`).join(",")})`);

      if (unknownPayments && unknownPayments.length > 0) {
        const typeMap = new Map<string, { count: number; total: number }>();
        for (const p of unknownPayments) {
          const t = (p.type || "").trim();
          if (!t || knownTypes.includes(t)) continue;
          const entry = typeMap.get(t) || { count: 0, total: 0 };
          entry.count++;
          entry.total += Number(p.amount) || 0;
          typeMap.set(t, entry);
        }
        if (typeMap.size > 0) {
          dataIssuesBody.push("Unknown payment types detected:");
          for (const [type, v] of typeMap) {
            dataIssuesBody.push(`  - ${type}: ${v.count} payments, total ${v.total.toFixed(2)}`);
          }
        }
      }
    }

    // Send combined email if any issues
    if (notifSettings && notifSettings.email_recipients) {
      const sections: string[] = [];
      if (reconBody.length > 0) sections.push(reconBody.join("\n"));
      if (syncErrorBody.length > 0) sections.push(syncErrorBody.join("\n"));
      if (dataIssuesBody.length > 0) sections.push(dataIssuesBody.join("\n"));

      if (sections.length > 0) {
        const subject = "Mindbody Reconciliation Alert";
        const body = sections.join("\n\n");
        await sendEmail(notifSettings.email_recipients, subject, body);
        console.log(`Notification email sent to ${notifSettings.email_recipients}`);
      }
    }

    return json({
      success: true,
      reconciliation: lastStatus ? { allOk: lastStatus.all_ok, checkedAt: lastStatus.checked_at } : null,
      notificationsSent: reconBody.length > 0 || syncErrorBody.length > 0 || dataIssuesBody.length > 0,
    });
  } catch (err) {
    return json({ success: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
