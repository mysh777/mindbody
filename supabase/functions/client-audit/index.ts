import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MINDBODY_BASE_URL = "https://api.mindbodyonline.com/public/v6";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("MINDBODY_API_KEY")!;
    const siteId = Deno.env.get("MINDBODY_SITE_ID")!;
    const staffUsername = Deno.env.get("MINDBODY_STAFF_USERNAME")!;
    const staffPassword = Deno.env.get("MINDBODY_STAFF_PASSWORD")!;

    // Get user token
    const tokenResp = await fetch(`${MINDBODY_BASE_URL}/usertoken/issue`, {
      method: "POST",
      headers: { "Api-Key": apiKey, "SiteId": siteId, "Content-Type": "application/json" },
      body: JSON.stringify({ Username: staffUsername, Password: staffPassword }),
    });
    const tokenData = await tokenResp.json();
    const userToken = tokenData.AccessToken || tokenData.Token;
    if (!userToken) {
      return new Response(JSON.stringify({ error: "Failed to get token", detail: tokenData }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const headers = {
      "Api-Key": apiKey,
      "SiteId": siteId,
      "Authorization": `Bearer ${userToken}`,
      "Content-Type": "application/json",
    };

    const { clientIds } = await req.json();
    if (!clientIds || !Array.isArray(clientIds) || clientIds.length > 5) {
      return new Response(JSON.stringify({ error: "Provide clientIds array (max 5)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Record<string, any> = {};

    for (const clientId of clientIds) {
      const result: any = { clientId };

      // 1. Client info
      const clientResp = await fetch(
        `${MINDBODY_BASE_URL}/client/clients?clientIds=${clientId}`,
        { headers }
      );
      result.clientRaw = await clientResp.json();

      // 2. Client services
      const servicesResp = await fetch(
        `${MINDBODY_BASE_URL}/client/clientservices?clientId=${clientId}`,
        { headers }
      );
      result.servicesRaw = await servicesResp.json();

      // 3. Client visits (last 6 months)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const startDate = sixMonthsAgo.toISOString().split("T")[0];
      const endDate = new Date().toISOString().split("T")[0];

      const visitsResp = await fetch(
        `${MINDBODY_BASE_URL}/client/clientvisits?clientId=${clientId}&startDate=${startDate}&endDate=${endDate}`,
        { headers }
      );
      result.visitsRaw = await visitsResp.json();

      results[clientId] = result;
    }

    return new Response(JSON.stringify(results, null, 2), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
