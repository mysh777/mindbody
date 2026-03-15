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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const syncResponse = await fetch(`${supabaseUrl}/functions/v1/mindbody-sync`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ syncType: 'all' }),
    });

    if (!syncResponse.ok) {
      const error = await syncResponse.text();
      throw new Error(`Sync failed: ${error}`);
    }

    const result = await syncResponse.json();

    return new Response(
      JSON.stringify({
        success: true,
        message: "Daily sync completed successfully",
        timestamp: new Date().toISOString(),
        result,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Daily sync error:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Daily sync failed",
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
