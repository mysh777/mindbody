import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface MindbodyConfig {
  apiKey: string;
  sourceName: string;
  sourcePassword: string;
  siteId: string;
}

const MINDBODY_BASE_URL = "https://api.mindbodyonline.com/public/v6";

async function getUserToken(supabase: any, config: MindbodyConfig): Promise<string | null> {
  // User Token is REQUIRED for protected endpoints:
  // - appointment/appointments
  // - sale/sales
  // - client/clientvisits

  const staffUsername = Deno.env.get("MINDBODY_STAFF_USERNAME");
  const staffPassword = Deno.env.get("MINDBODY_STAFF_PASSWORD");

  if (!staffUsername || !staffPassword) {
    console.warn("⚠️ Staff credentials not configured");
    console.warn("Protected endpoints (appointments, sales, clientvisits) will be SKIPPED");
    return null;
  }

  const url = `${MINDBODY_BASE_URL}/usertoken/issue`;
  const startTime = Date.now();

  const requestBody = {
    Username: staffUsername,
    Password: staffPassword,
  };

  console.log(`Requesting user token for: ${staffUsername}`);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Api-Key": config.apiKey,
        "SiteId": config.siteId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    const durationMs = Date.now() - startTime;

    let responseBody;
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = responseText;
    }

    await logApiCall(
      supabase,
      url,
      "POST",
      requestBody,
      response.status,
      responseBody,
      null,
      durationMs
    );

    if (!response.ok) {
      console.error(`❌ User token request failed: ${response.status}`);
      console.error(`Response: ${responseText}`);
      console.warn("Protected endpoints will be SKIPPED");
      return null;
    }

    const token = responseBody.AccessToken || responseBody.Token;
    if (token) {
      console.log("✅ User token obtained successfully");
    }

    return token;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    await logApiCall(
      supabase,
      url,
      "POST",
      requestBody,
      0,
      null,
      error instanceof Error ? error.message : String(error),
      durationMs
    );
    console.error("❌ User token request exception:", error);
    return null;
  }
}

function getSourceHeaders(config: MindbodyConfig) {
  // Source headers for public/open endpoints
  // Do NOT include Authorization header
  return {
    "Api-Key": config.apiKey,
    "SiteId": config.siteId,
    "Content-Type": "application/json",
  };
}

function getUserHeaders(config: MindbodyConfig, userToken: string) {
  // User token headers for protected endpoints
  return {
    "Api-Key": config.apiKey,
    "SiteId": config.siteId,
    "Authorization": `Bearer ${userToken}`,
    "Content-Type": "application/json",
  };
}

async function logApiCall(supabase: any, endpoint: string, method: string, requestBody: any, responseStatus: number, responseBody: any, error: any, durationMs: number) {
  try {
    await supabase.from("api_logs").insert({
      endpoint,
      method,
      request_body: requestBody,
      response_status: responseStatus,
      response_body: responseBody,
      error_message: error ? String(error) : null,
      duration_ms: durationMs,
    });
  } catch (err) {
    console.error("Failed to log API call:", err);
  }
}

async function syncClients(supabase: any, config: MindbodyConfig) {
  let offset = 0;
  const limit = 100;
  let totalSynced = 0;

  while (true) {
    const url = `${MINDBODY_BASE_URL}/client/clients?limit=${limit}&offset=${offset}`;
    console.log(`Fetching clients from: ${url}`);

    const startTime = Date.now();
    const response = await fetch(url, {
      headers: getSourceHeaders(config),
    });
    const durationMs = Date.now() - startTime;

    console.log(`Clients API response status: ${response.status}`);

    const responseText = await response.text();
    console.log(`Clients API response: ${responseText.substring(0, 500)}`);

    let parsedData = null;
    let error = null;

    try {
      parsedData = JSON.parse(responseText);
    } catch (e) {
      error = `Failed to parse response: ${e.message}`;
    }

    await logApiCall(
      supabase,
      url,
      "GET",
      null,
      response.status,
      parsedData || responseText.substring(0, 1000),
      error,
      durationMs
    );

    if (!response.ok) {
      console.error(`Failed to fetch clients: ${response.status} - ${responseText}`);
      break;
    }

    const data = parsedData;
    const clients = data.Clients || [];

    console.log(`Found ${clients.length} clients in response`);

    if (clients.length === 0) break;

    for (const client of clients) {
      const clientData = {
        id: client.Id || client.UniqueId,
        mindbody_id: client.Id || client.UniqueId,
        first_name: client.FirstName,
        last_name: client.LastName,
        email: client.Email,
        mobile_phone: client.MobilePhone,
        home_phone: client.HomePhone,
        address_line1: client.AddressLine1,
        address_line2: client.AddressLine2,
        city: client.City,
        state: client.State,
        postal_code: client.PostalCode,
        country: client.Country,
        birth_date: client.BirthDate,
        gender: client.Gender,
        status: client.Status,
        is_company: client.IsCompany || false,
        liability_release: client.LiabilityRelease || false,
        emergency_contact_name: client.EmergencyContactName,
        emergency_contact_phone: client.EmergencyContactPhone,
        creation_date: client.CreationDate,
        last_modified_date: client.LastModifiedDateTime,
        raw_data: client,
        synced_at: new Date().toISOString(),
      };

      await supabase.from("clients").upsert(clientData, {
        onConflict: "mindbody_id",
      });
    }

    totalSynced += clients.length;
    offset += limit;

    if (clients.length < limit) break;
  }

  return totalSynced;
}

async function syncAppointments(supabase: any, config: MindbodyConfig, userToken: string) {
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 3);
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + 1);

  let offset = 0;
  const limit = 100;
  let totalSynced = 0;

  while (true) {
    const url = `${MINDBODY_BASE_URL}/appointment/staffappointments?startDateTime=${startDate.toISOString()}&endDateTime=${endDate.toISOString()}&limit=${limit}&offset=${offset}`;
    const startTime = Date.now();

    const response = await fetch(url, {
      headers: getUserHeaders(config, userToken),
    });

    const durationMs = Date.now() - startTime;
    const responseText = await response.text();

    if (!response.ok) {
      console.error(`❌ Appointments sync failed: ${response.status}`);
      console.error(`Response: ${responseText}`);

      await logApiCall(
        supabase,
        url,
        "GET",
        null,
        response.status,
        responseText,
        `Failed to fetch appointments`,
        durationMs
      );
      break;
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = {};
    }

    const appointments = data.Appointments || [];

    if (appointments.length === 0) break;

    for (const appt of appointments) {
      const apptData = {
        id: appt.Id || appt.UniqueId,
        mindbody_id: appt.Id || appt.UniqueId,
        client_id: appt.ClientId,
        staff_id: appt.StaffId,
        location_id: appt.LocationId,
        session_type_id: appt.SessionTypeId,
        start_datetime: appt.StartDateTime,
        end_datetime: appt.EndDateTime,
        status: appt.Status,
        duration: appt.Duration,
        notes: appt.Notes,
        staff_requested: appt.StaffRequested || false,
        raw_data: appt,
        synced_at: new Date().toISOString(),
      };

      await supabase.from("appointments").upsert(apptData, {
        onConflict: "mindbody_id",
      });
    }

    totalSynced += appointments.length;
    offset += limit;

    if (appointments.length < limit) break;
  }

  return totalSynced;
}

async function syncClassDescriptions(supabase: any, config: MindbodyConfig) {
  let offset = 0;
  const limit = 100;
  let totalSynced = 0;

  while (true) {
    const response = await fetch(
      `${MINDBODY_BASE_URL}/class/classdescriptions?limit=${limit}&offset=${offset}`,
      {
        headers: getSourceHeaders(config),
      }
    );

    if (!response.ok) break;

    const data = await response.json();
    const descriptions = data.ClassDescriptions || [];

    if (descriptions.length === 0) break;

    for (const desc of descriptions) {
      const descData = {
        id: desc.Id || desc.UniqueId,
        mindbody_id: desc.Id || desc.UniqueId,
        name: desc.Name,
        description: desc.Description,
        category_id: desc.CategoryId,
        category_name: desc.Category?.Name,
        subcategory_id: desc.SubcategoryId,
        subcategory_name: desc.Subcategory?.Name,
        level_id: desc.LevelId,
        level_name: desc.Level?.Name,
        raw_data: desc,
        synced_at: new Date().toISOString(),
      };

      await supabase.from("class_descriptions").upsert(descData, {
        onConflict: "mindbody_id",
      });
    }

    totalSynced += descriptions.length;
    offset += limit;

    if (descriptions.length < limit) break;
  }

  return totalSynced;
}

async function syncClasses(supabase: any, config: MindbodyConfig) {
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 3);
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + 1);

  let offset = 0;
  const limit = 100;
  let totalSynced = 0;

  while (true) {
    const response = await fetch(
      `${MINDBODY_BASE_URL}/class/classes?startDateTime=${startDate.toISOString()}&endDateTime=${endDate.toISOString()}&limit=${limit}&offset=${offset}`,
      {
        headers: getSourceHeaders(config),
      }
    );

    if (!response.ok) break;

    const data = await response.json();
    const classes = data.Classes || [];

    if (classes.length === 0) break;

    for (const cls of classes) {
      const clsData = {
        id: cls.Id || cls.UniqueId,
        mindbody_id: cls.Id || cls.UniqueId,
        class_description_id: cls.ClassDescription?.Id,
        location_id: cls.Location?.Id,
        staff_id: cls.Staff?.Id,
        start_datetime: cls.StartDateTime,
        end_datetime: cls.EndDateTime,
        max_capacity: cls.MaxCapacity || 0,
        web_capacity: cls.WebCapacity || 0,
        total_booked: cls.TotalBooked || 0,
        web_booked: cls.WebBooked || 0,
        total_wait_listed: cls.TotalWaitlisted || 0,
        is_canceled: cls.IsCanceled || false,
        is_available: cls.IsAvailable || true,
        is_waitlist_available: cls.IsWaitlistAvailable || false,
        raw_data: cls,
        synced_at: new Date().toISOString(),
      };

      await supabase.from("classes").upsert(clsData, {
        onConflict: "mindbody_id",
      });
    }

    totalSynced += classes.length;
    offset += limit;

    if (classes.length < limit) break;
  }

  return totalSynced;
}

async function syncSales(supabase: any, config: MindbodyConfig, userToken: string) {
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 3);
  const endDate = new Date();

  let offset = 0;
  const limit = 100;
  let totalSynced = 0;

  while (true) {
    const url = `${MINDBODY_BASE_URL}/sale/sales?startSaleDateTime=${startDate.toISOString()}&endSaleDateTime=${endDate.toISOString()}&limit=${limit}&offset=${offset}`;
    const startTime = Date.now();

    const response = await fetch(url, {
      headers: getUserHeaders(config, userToken),
    });

    const durationMs = Date.now() - startTime;
    const responseText = await response.text();

    if (!response.ok) {
      console.error(`❌ Sales sync failed: ${response.status}`);
      console.error(`Response: ${responseText}`);

      await logApiCall(
        supabase,
        url,
        "GET",
        null,
        response.status,
        responseText,
        `Failed to fetch sales`,
        durationMs
      );
      break;
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = {};
    }

    const sales = data.Sales || [];

    if (sales.length === 0) break;

    for (const sale of sales) {
      const saleData = {
        id: sale.Id || sale.SaleId,
        mindbody_id: sale.Id || sale.SaleId,
        sale_date: sale.SaleDate,
        sale_time: sale.SaleTime,
        sale_datetime: sale.SaleDateTime,
        client_id: sale.ClientId,
        location_id: sale.LocationId,
        total: sale.Total || 0,
        payment_amount: sale.PaymentAmount || 0,
        raw_data: sale,
        synced_at: new Date().toISOString(),
      };

      const { data: insertedSale } = await supabase.from("sales").upsert(saleData, {
        onConflict: "mindbody_id",
      }).select().single();

      if (sale.PurchasedItems && insertedSale) {
        for (const item of sale.PurchasedItems) {
          const itemData = {
            sale_id: insertedSale.id,
            item_type: item.Type,
            item_id: item.Id,
            item_name: item.Name,
            amount: item.Amount || 0,
            quantity: item.Quantity || 1,
            discount_amount: item.DiscountAmount || 0,
            tax: item.Tax || 0,
            raw_data: item,
          };

          await supabase.from("sale_items").insert(itemData);
        }
      }
    }

    totalSynced += sales.length;
    offset += limit;

    if (sales.length < limit) break;
  }

  return totalSynced;
}

async function syncStaff(supabase: any, config: MindbodyConfig) {
  let offset = 0;
  const limit = 100;
  let totalSynced = 0;

  while (true) {
    const response = await fetch(
      `${MINDBODY_BASE_URL}/staff/staff?limit=${limit}&offset=${offset}`,
      {
        headers: getSourceHeaders(config),
      }
    );

    if (!response.ok) break;

    const data = await response.json();
    const staffMembers = data.StaffMembers || [];

    if (staffMembers.length === 0) break;

    for (const staff of staffMembers) {
      const staffData = {
        id: staff.Id || staff.UniqueId,
        mindbody_id: staff.Id || staff.UniqueId,
        first_name: staff.FirstName,
        last_name: staff.LastName,
        email: staff.Email,
        mobile_phone: staff.MobilePhone,
        home_phone: staff.HomePhone,
        address_line1: staff.AddressLine1,
        address_line2: staff.AddressLine2,
        city: staff.City,
        state: staff.State,
        postal_code: staff.PostalCode,
        country: staff.Country,
        bio: staff.Bio,
        is_male: staff.IsMale,
        sort_order: staff.SortOrder,
        is_independent_contractor: staff.IsIndependentContractor || false,
        always_allow_double_booking: staff.AlwaysAllowDoubleBooking || false,
        raw_data: staff,
        synced_at: new Date().toISOString(),
      };

      await supabase.from("staff").upsert(staffData, {
        onConflict: "mindbody_id",
      });
    }

    totalSynced += staffMembers.length;
    offset += limit;

    if (staffMembers.length < limit) break;
  }

  return totalSynced;
}

async function syncLocations(supabase: any, config: MindbodyConfig) {
  console.log('Entered syncLocations');
  console.log(`Using SiteId: ${config.siteId}`);

  const url = `${MINDBODY_BASE_URL}/site/locations`;
  console.log(`Fetching locations from: ${url}`);

  const response = await fetch(url, {
    headers: getSourceHeaders(config),
  });

  console.log(`Locations API response status: ${response.status}`);

  const responseText = await response.text();
  console.log(`Locations API response: ${responseText}`);

  if (!response.ok) {
    console.error(`Failed to fetch locations: ${response.status} - ${responseText}`);
    return 0;
  }

  const data = JSON.parse(responseText);
  const locations = data.Locations || [];

  console.log(`Found ${locations.length} locations in response`);

  for (const loc of locations) {
    const locData = {
      id: loc.Id || loc.LocationId,
      mindbody_id: loc.Id || loc.LocationId,
      name: loc.Name,
      address_line1: loc.Address,
      address_line2: loc.Address2,
      city: loc.City,
      state_prov_code: loc.StateProvCode,
      postal_code: loc.PostalCode,
      phone: loc.Phone,
      latitude: loc.Latitude,
      longitude: loc.Longitude,
      raw_data: loc,
      synced_at: new Date().toISOString(),
    };

    await supabase.from("locations").upsert(locData, {
      onConflict: "mindbody_id",
    });
  }

  return locations.length;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { syncType = "locations" } = await req.json().catch(() => ({}));

    if (syncType === "ping") {
      return new Response(
        JSON.stringify({ success: true, message: "Function is alive", timestamp: new Date().toISOString() }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const mindbodyApiKey = Deno.env.get("MINDBODY_API_KEY");
    const mindbodySourceName = Deno.env.get("MINDBODY_SOURCE_NAME");
    const mindbodySourcePassword = Deno.env.get("MINDBODY_SOURCE_PASSWORD");
    const mindbodySiteId = Deno.env.get("MINDBODY_SITE_ID");

    if (!mindbodyApiKey || !mindbodySourceName || !mindbodySourcePassword || !mindbodySiteId) {
      return new Response(
        JSON.stringify({
          error: "Missing Mindbody credentials. Please configure MINDBODY_API_KEY, MINDBODY_SOURCE_NAME, MINDBODY_SOURCE_PASSWORD, and MINDBODY_SITE_ID environment variables.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const config: MindbodyConfig = {
      apiKey: mindbodyApiKey,
      sourceName: mindbodySourceName,
      sourcePassword: mindbodySourcePassword,
      siteId: mindbodySiteId,
    };

    console.log('ENV check ok');
    console.log('About to insert sync_logs');

    const { data: logData } = await supabase
      .from("sync_logs")
      .insert({
        sync_type: syncType,
        status: "started",
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    const logId = logData?.id;
    console.log('Sync log created:', logId);

    try {
      console.log('=== Starting Mindbody Sync ===');
      console.log(`API Key: ${config.apiKey.substring(0, 8)}...`);
      console.log(`Site ID: ${config.siteId}`);
      console.log(`Source Name: ${config.sourceName}`);
      console.log(`Sync Type: ${syncType}`);

      console.log('\n=== Phase 1: Public Endpoints (Source Credentials) ===');
      console.log('Using Api-Key + SiteId only (NO Authorization header)');

      const results: Record<string, number> = {};

      if (syncType === "all" || syncType === "locations") {
        try {
          console.log('\n--- Syncing Locations ---');
          console.log('About to start locations sync');
          results.locations = await syncLocations(supabase, config);
          console.log(`Locations synced: ${results.locations}`);
        } catch (e) {
          console.error('Locations sync failed:', e);
          results.locations = 0;
        }
      }

      if (syncType === "all" || syncType === "staff") {
        try {
          console.log('\n--- Syncing Staff ---');
          results.staff = await syncStaff(supabase, config);
          console.log(`Staff synced: ${results.staff}`);
        } catch (e) {
          console.error('Staff sync failed:', e);
          results.staff = 0;
        }
      }

      if (syncType === "all" || syncType === "class_descriptions") {
        try {
          console.log('\n--- Syncing Class Descriptions ---');
          results.class_descriptions = await syncClassDescriptions(supabase, config);
          console.log(`Class descriptions synced: ${results.class_descriptions}`);
        } catch (e) {
          console.error('Class descriptions sync failed:', e);
          results.class_descriptions = 0;
        }
      }

      if (syncType === "all" || syncType === "classes") {
        try {
          console.log('\n--- Syncing Classes ---');
          results.classes = await syncClasses(supabase, config);
          console.log(`Classes synced: ${results.classes}`);
        } catch (e) {
          console.error('Classes sync failed:', e);
          results.classes = 0;
        }
      }

      if (syncType === "all" || syncType === "clients") {
        try {
          console.log('\n--- Syncing Clients ---');
          results.clients = await syncClients(supabase, config);
          console.log(`Clients synced: ${results.clients}`);
        } catch (e) {
          console.error('Clients sync failed:', e);
          results.clients = 0;
        }
      }

      console.log('\n=== Phase 2: Protected Endpoints (User Token Required) ===');

      let userToken: string | null = null;
      try {
        userToken = await getUserToken(supabase, config);
        console.log(`User token obtained: ${userToken ? 'yes' : 'no'}`);
      } catch (e) {
        console.error('Failed to get user token:', e);
      }

      if (userToken && (syncType === "all" || syncType === "appointments")) {
        try {
          console.log('\n--- Syncing Appointments (with User Token) ---');
          results.appointments = await syncAppointments(supabase, config, userToken);
          console.log(`Appointments synced: ${results.appointments}`);
        } catch (e) {
          console.error('Appointments sync failed:', e);
          results.appointments = 0;
        }
      } else if (syncType === "all" || syncType === "appointments") {
        console.warn('⚠️ Skipping appointments sync - no user token available');
        results.appointments = 0;
      }

      if (userToken && (syncType === "all" || syncType === "sales")) {
        try {
          console.log('\n--- Syncing Sales (with User Token) ---');
          results.sales = await syncSales(supabase, config, userToken);
          console.log(`Sales synced: ${results.sales}`);
        } catch (e) {
          console.error('Sales sync failed:', e);
          results.sales = 0;
        }
      } else if (syncType === "all" || syncType === "sales") {
        console.warn('⚠️ Skipping sales sync - no user token available');
        results.sales = 0;
      }

      const totalRecords = Object.values(results).reduce((sum, count) => sum + count, 0);

      console.log('\n=== Sync Completed Successfully ===');
      console.log('Results:', JSON.stringify(results, null, 2));
      console.log(`Total records synced: ${totalRecords}`);

      if (logId) {
        await supabase
          .from("sync_logs")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            records_synced: totalRecords,
            raw_response: results,
          })
          .eq("id", logId);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Sync completed successfully",
          results,
          totalRecords,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } catch (error) {
      if (logId) {
        await supabase
          .from("sync_logs")
          .update({
            status: "failed",
            completed_at: new Date().toISOString(),
            error_message: error.message,
          })
          .eq("id", logId);
      }

      throw error;
    }
  } catch (error) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to sync data",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
