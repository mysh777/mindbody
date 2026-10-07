const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BASE = "https://api.mindbodyonline.com/public/v6";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  try {
    const apiKey = Deno.env.get("MINDBODY_API_KEY")!;
    const siteId = Deno.env.get("MINDBODY_SITE_ID")!;
    const body = await req.json().catch(() => ({}));
    const start = String(body.start || "2026-08-03");
    const end = String(body.end || "2026-08-09");
    const extra = typeof body.query === "string" ? body.query.replace(/[^A-Za-z0-9=&\[\]._:-]/g, "") : "";

    const tokRes = await fetch(`${BASE}/usertoken/issue`, {
      method: "POST",
      headers: { "Api-Key": apiKey, "SiteId": siteId, "Content-Type": "application/json" },
      body: JSON.stringify({ Username: Deno.env.get("MINDBODY_STAFF_USERNAME"), Password: Deno.env.get("MINDBODY_STAFF_PASSWORD") }),
    });
    const tok = await tokRes.json().catch(() => ({}));
    const token = tok.AccessToken || tok.Token;
    if (!token) return json({ error: "token failed", status: tokRes.status });

    const headers = { "Api-Key": apiKey, "SiteId": siteId, "Authorization": `Bearer ${token}`, "Content-Type": "application/json" };
    const paths: string[] = Array.isArray(body.paths) ? body.paths : [];
    const endpoints = (paths.length ? paths : [`/appointment/scheduleitems?request.startDate=${start}&request.endDate=${end}&request.limit=200${extra ? "&" + extra : ""}`])
      .filter((p) => /^\/(appointment\/(scheduleitems|availabledates|bookableitems)|staff\/staff)\?[A-Za-z0-9=&\[\]._:%-]*$/.test(p))
      .slice(0, 6)
      .map((p) => BASE + p);
    const results = [];
    for (const url of endpoints) {
      const r = await fetch(url, { headers });
      const text = await r.text();
      let summary: unknown = null;
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed.StaffMembers)) {
          summary = parsed.StaffMembers.map((s: any) => ({
            Id: s.Id, Name: s.DisplayName,
            appointments: (s.Appointments || []).length,
            firstAppointment: (s.Appointments || [])[0] ?? null,
            Availabilities: s.Availabilities,
            Unavailabilities: s.Unavailabilities,
          }));
        }
      } catch { /* non-JSON */ }
      results.push({ url: url.replace(BASE, ""), status: r.status, length: text.length, summary, body: summary ? "" : text.substring(0, 3000) });
    }
    return json({ results });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
