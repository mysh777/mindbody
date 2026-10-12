import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

async function recordCall(httpStatus: number, durationMs: number, error: string | null) {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { error: insertError } = await supabase.from("mindbody_api_calls").insert({
    method: "POST",
    endpoint: "0_5/SiteService.asmx GetActivationCode",
    step: "activation_code",
    run_type: "manual",
    http_status: httpStatus,
    duration_ms: durationMs,
    error,
  });
  if (insertError) console.error("Failed to record Mindbody call:", insertError.message);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const apiKey = Deno.env.get("MINDBODY_API_KEY");
    const siteId = Deno.env.get("MINDBODY_SITE_ID");
    const sourceName = Deno.env.get("MINDBODY_SOURCE_NAME");

    if (!apiKey || !siteId || !sourceName) {
      throw new Error("Missing required environment variables");
    }

    console.log("=== GetActivationCode Request ===");
    console.log("Site ID:", siteId);
    console.log("Source Name:", sourceName);

    const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <GetActivationCode xmlns="http://clients.mindbodyonline.com/api/0_5">
      <Request>
        <SourceCredentials>
          <SourceName>${sourceName}</SourceName>
          <Password>${apiKey}</Password>
          <SiteIDs>
            <int>${siteId}</int>
          </SiteIDs>
        </SourceCredentials>
      </Request>
    </GetActivationCode>
  </soap:Body>
</soap:Envelope>`;

    console.log("Sending SOAP request...");

    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(
        "https://api.mindbodyonline.com/0_5/SiteService.asmx",
        {
          method: "POST",
          headers: {
            "Content-Type": "text/xml; charset=utf-8",
            "SOAPAction": "http://clients.mindbodyonline.com/api/0_5/GetActivationCode",
          },
          body: soapEnvelope,
        }
      );
    } catch (fetchError) {
      await recordCall(0, Date.now() - started, fetchError instanceof Error ? fetchError.message : String(fetchError));
      throw fetchError;
    }
    await recordCall(response.status, Date.now() - started, null);

    const responseText = await response.text();
    console.log("Response status:", response.status);
    console.log("Response text:", responseText.substring(0, 1000));

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} - ${responseText}`);
    }

    const activationCodeMatch = responseText.match(
      /<ActivationCode>(.*?)<\/ActivationCode>/
    );
    const activationLinkMatch = responseText.match(
      /<ActivationLink>(.*?)<\/ActivationLink>/
    );
    const statusMatch = responseText.match(/<Status>(.*?)<\/Status>/);

    if (statusMatch && statusMatch[1] !== "Success") {
      const errorMatch = responseText.match(/<Message>(.*?)<\/Message>/);
      throw new Error(
        `API returned status: ${statusMatch[1]}${errorMatch ? ` - ${errorMatch[1]}` : ""}`
      );
    }

    if (!activationCodeMatch || !activationLinkMatch) {
      throw new Error("Could not parse activation code from response");
    }

    const result = {
      activationCode: activationCodeMatch[1],
      activationLink: activationLinkMatch[1],
    };

    console.log("=== Activation Code Generated ===");
    console.log("Code:", result.activationCode);
    console.log("Link:", result.activationLink);

    return new Response(JSON.stringify(result), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error generating activation code:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to generate activation code",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
