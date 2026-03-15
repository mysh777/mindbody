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

async function saveRawData(supabase: any, endpointType: string, responseData: any, recordCount: number, paginationInfo: any = null) {
  try {
    await supabase.from("api_raw_data").insert({
      endpoint_type: endpointType,
      response_data: responseData,
      record_count: recordCount,
      pagination_info: paginationInfo,
    });
  } catch (err) {
    console.error("Failed to save raw data:", err);
  }
}

async function syncClients(supabase: any, config: MindbodyConfig, userToken?: string) {
  let offset = 0;
  const limit = 100;
  let totalSynced = 0;

  while (true) {
    const url = `${MINDBODY_BASE_URL}/client/clients?limit=${limit}&offset=${offset}`;
    console.log(`Fetching clients from: ${url}`);
    console.log(`Using ${userToken ? 'User Token' : 'Source credentials'}`);

    const startTime = Date.now();
    const response = await fetch(url, {
      headers: userToken ? getUserHeaders(config, userToken) : getSourceHeaders(config),
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

    // Save raw data for inspection
    if (offset === 0) {
      await saveRawData(supabase, 'clients', data, clients.length, data.PaginationResponse);
    }

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
    const url = `${MINDBODY_BASE_URL}/appointment/appointments?startDateTime=${startDate.toISOString()}&endDateTime=${endDate.toISOString()}&limit=${limit}&offset=${offset}`;
    const startTime = Date.now();

    console.log(`Fetching appointments from: ${url}`);

    const response = await fetch(url, {
      headers: getUserHeaders(config, userToken),
    });

    const durationMs = Date.now() - startTime;
    const responseText = await response.text();

    console.log(`Appointments API response status: ${response.status}`);

    let data;
    let error = null;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      error = `Failed to parse response: ${e.message}`;
      data = {};
    }

    await logApiCall(supabase, url, "GET", null, response.status, data, error, durationMs);

    if (!response.ok) {
      console.error(`❌ Appointments sync failed: ${response.status}`);
      console.error(`Response: ${responseText}`);
      break;
    }

    const appointments = data.Appointments || [];
    console.log(`Found ${appointments.length} appointments at offset ${offset}`);

    if (offset === 0) {
      await saveRawData(supabase, 'appointments', data, appointments.length, data.PaginationResponse);
    }

    if (appointments.length === 0) break;

    for (const appt of appointments) {
      let pricingOptionId = null;

      if (appt.SessionTypeId) {
        const { data: pricingOption } = await supabase
          .from("pricing_options")
          .select("id")
          .eq("mindbody_id", String(appt.SessionTypeId))
          .maybeSingle();

        if (pricingOption) {
          pricingOptionId = pricingOption.id;
        }
      }

      const apptData = {
        id: appt.Id || appt.UniqueId,
        mindbody_id: String(appt.Id || appt.UniqueId),
        client_id: appt.ClientId,
        staff_id: appt.StaffId,
        location_id: appt.LocationId,
        session_type_id: appt.SessionTypeId,
        pricing_option_id: pricingOptionId,
        service_name: appt.SessionTypeName || appt.ProgramName,
        start_datetime: appt.StartDateTime,
        end_datetime: appt.EndDateTime,
        status: appt.Status,
        duration: appt.Duration,
        price: appt.Price,
        notes: appt.Notes,
        staff_requested: appt.StaffRequested || false,
        raw_data: appt,
        synced_at: new Date().toISOString(),
      };

      await supabase.from("appointments").upsert(apptData, {
        onConflict: "mindbody_id",
      });

      totalSynced++;
    }

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
    const url = `${MINDBODY_BASE_URL}/class/classdescriptions?limit=${limit}&offset=${offset}`;
    const startTime = Date.now();

    const response = await fetch(url, {
      headers: getSourceHeaders(config),
    });

    const durationMs = Date.now() - startTime;
    const responseText = await response.text();

    let data;
    let error = null;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      error = `Failed to parse response: ${e.message}`;
      data = {};
    }

    await logApiCall(
      supabase,
      url,
      "GET",
      null,
      response.status,
      data,
      error,
      durationMs
    );

    if (!response.ok) {
      console.error(`❌ Class descriptions sync failed: ${response.status}`);
      break;
    }

    const descriptions = data.ClassDescriptions || [];

    // Save raw data for inspection
    if (offset === 0) {
      await saveRawData(supabase, 'class_descriptions', data, descriptions.length, data.PaginationResponse);
    }

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
    const url = `${MINDBODY_BASE_URL}/class/classes?startDateTime=${startDate.toISOString()}&endDateTime=${endDate.toISOString()}&limit=${limit}&offset=${offset}`;
    const startTime = Date.now();

    const response = await fetch(url, {
      headers: getSourceHeaders(config),
    });

    const durationMs = Date.now() - startTime;
    const responseText = await response.text();

    let data;
    let error = null;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      error = `Failed to parse response: ${e.message}`;
      data = {};
    }

    await logApiCall(
      supabase,
      url,
      "GET",
      null,
      response.status,
      data,
      error,
      durationMs
    );

    if (!response.ok) {
      console.error(`❌ Classes sync failed: ${response.status}`);
      break;
    }

    const classes = data.Classes || [];

    // Save raw data for inspection
    if (offset === 0) {
      await saveRawData(supabase, 'classes', data, classes.length, data.PaginationResponse);
    }

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

    // Save raw data for inspection
    if (offset === 0) {
      await saveRawData(supabase, 'sales', data, sales.length, data.PaginationResponse);
    }

    if (sales.length === 0) break;

    for (const sale of sales) {
      // Calculate total from Payments array
      const totalPaymentAmount = sale.Payments?.reduce((sum: number, payment: any) => {
        return sum + (payment.Amount || 0);
      }, 0) || 0;

      // Calculate total from PurchasedItems
      const totalItemsAmount = sale.PurchasedItems?.reduce((sum: number, item: any) => {
        return sum + (item.TotalAmount || 0);
      }, 0) || 0;

      const saleData = {
        id: sale.Id || sale.SaleId,
        mindbody_id: sale.Id || sale.SaleId,
        sale_date: sale.SaleDate,
        sale_time: sale.SaleTime,
        sale_datetime: sale.SaleDateTime,
        client_id: sale.ClientId,
        location_id: sale.LocationId,
        total: totalItemsAmount,
        payment_amount: totalPaymentAmount,
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
            item_type: item.IsService ? 'Service' : 'Product',
            item_id: item.Id,
            item_name: item.Description,
            amount: item.TotalAmount || 0,
            quantity: item.Quantity || 1,
            discount_amount: item.DiscountAmount || 0,
            tax: item.TaxAmount || 0,
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
    // Add StaffEmail=true to include email addresses in response
    const url = `${MINDBODY_BASE_URL}/staff/staff?limit=${limit}&offset=${offset}&StaffEmail=true`;
    const startTime = Date.now();

    const response = await fetch(url, {
      headers: getSourceHeaders(config),
    });

    const durationMs = Date.now() - startTime;
    const responseText = await response.text();

    let data;
    let error = null;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      error = `Failed to parse response: ${e.message}`;
      data = {};
    }

    await logApiCall(
      supabase,
      url,
      "GET",
      null,
      response.status,
      data,
      error,
      durationMs
    );

    if (!response.ok) {
      console.error(`❌ Staff sync failed: ${response.status}`);
      break;
    }

    const staffMembers = data.StaffMembers || [];

    // Save raw data for inspection
    if (offset === 0) {
      await saveRawData(supabase, 'staff', data, staffMembers.length, data.PaginationResponse);
    }

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

async function syncServices(supabase: any, config: MindbodyConfig, userToken: string) {
  console.log('Syncing services (pricing options)');

  const url = `${MINDBODY_BASE_URL}/sale/services`;
  const startTime = Date.now();

  let offset = 0;
  const limit = 100;
  let totalSynced = 0;

  while (true) {
    const fullUrl = `${url}?limit=${limit}&offset=${offset}`;
    console.log(`Fetching services: ${fullUrl}`);

    const response = await fetch(fullUrl, {
      headers: getUserHeaders(config, userToken),
    });

    const durationMs = Date.now() - startTime;
    const responseText = await response.text();

    let data;
    let error = null;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      error = `Failed to parse response: ${e.message}`;
      data = {};
    }

    await logApiCall(supabase, fullUrl, "GET", null, response.status, data, error, durationMs);

    if (!response.ok) {
      console.error(`Failed to fetch services: ${response.status}`);
      break;
    }

    const services = data.Services || [];
    console.log(`Found ${services.length} services at offset ${offset}`);

    if (offset === 0) {
      await saveRawData(supabase, 'services', data, services.length, data.PaginationResponse);
    }

    for (const service of services) {
      const serviceData = {
        mindbody_id: String(service.Id),
        name: service.Name,
        service_type: service.Type,
        service_category: service.ProgramName || service.CategoryName,
        price: service.Price || service.OnlinePrice,
        online_price: service.OnlinePrice,
        duration: service.DefaultTimeLength,
        tax_included: service.TaxIncluded || false,
        tax_rate: service.TaxRate,
        sold_online: service.SellOnline || false,
        bookable_online: service.BookableOnline || false,
        is_introductory: service.IsIntro || false,
        session_count: service.Count || null,
        expiration_days: service.ExpirationDays,
        revenue_category: service.RevenueCategory,
        active: service.Active !== false,
        raw_data: service,
        synced_at: new Date().toISOString(),
      };

      await supabase.from("pricing_options").upsert(serviceData, {
        onConflict: "mindbody_id",
      });

      totalSynced++;
    }

    offset += limit;
    if (services.length < limit) break;
  }

  return totalSynced;
}

async function syncProducts(supabase: any, config: MindbodyConfig) {
  console.log('Syncing retail products');

  const url = `${MINDBODY_BASE_URL}/site/products`;
  const startTime = Date.now();

  let offset = 0;
  const limit = 100;
  let totalSynced = 0;

  while (true) {
    const fullUrl = `${url}?limit=${limit}&offset=${offset}`;
    console.log(`Fetching products: ${fullUrl}`);

    const response = await fetch(fullUrl, {
      headers: getSourceHeaders(config),
    });

    const durationMs = Date.now() - startTime;
    const responseText = await response.text();

    let data;
    let error = null;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      error = `Failed to parse response: ${e.message}`;
      data = {};
    }

    await logApiCall(supabase, fullUrl, "GET", null, response.status, data, error, durationMs);

    if (!response.ok) {
      console.error(`Failed to fetch products: ${response.status}`);
      break;
    }

    const products = data.Products || [];
    console.log(`Found ${products.length} products at offset ${offset}`);

    if (offset === 0) {
      await saveRawData(supabase, 'products', data, products.length, data.PaginationResponse);
    }

    for (const product of products) {
      const productData = {
        mindbody_id: String(product.Id),
        name: product.Name,
        barcode: product.Barcode,
        retail_price: product.Price,
        online_price: product.OnlinePrice,
        cost: product.Cost,
        active: product.Active !== false,
        sell_online: product.SellOnline || false,
        description: product.LongDescription || product.ShortDescription,
        category: product.CategoryName,
        size: product.Size,
        color: product.Color,
        raw_data: product,
        created_at: product.CreatedDate,
        modified_at: product.LastModifiedDate,
        synced_at: new Date().toISOString(),
      };

      await supabase.from("retail_products").upsert(productData, {
        onConflict: "mindbody_id",
      });

      totalSynced++;
    }

    offset += limit;
    if (products.length < limit) break;
  }

  return totalSynced;
}

async function syncLocations(supabase: any, config: MindbodyConfig) {
  console.log('Entered syncLocations');
  console.log(`Using SiteId: ${config.siteId}`);

  const url = `${MINDBODY_BASE_URL}/site/locations`;
  console.log(`Fetching locations from: ${url}`);

  const startTime = Date.now();
  const response = await fetch(url, {
    headers: getSourceHeaders(config),
  });

  const durationMs = Date.now() - startTime;
  console.log(`Locations API response status: ${response.status}`);

  const responseText = await response.text();
  console.log(`Locations API response: ${responseText}`);

  let data;
  let error = null;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    error = `Failed to parse response: ${e.message}`;
    data = {};
  }

  await logApiCall(
    supabase,
    url,
    "GET",
    null,
    response.status,
    data,
    error,
    durationMs
  );

  if (!response.ok) {
    console.error(`Failed to fetch locations: ${response.status} - ${responseText}`);
    return 0;
  }

  const locations = data.Locations || [];

  console.log(`Found ${locations.length} locations in response`);

  // Save raw data for inspection
  await saveRawData(supabase, 'locations', data, locations.length, data.PaginationResponse);

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
    const { syncType = "quick" } = await req.json().catch(() => ({}));

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

      // Quick mode: only sync locations and last 100 sales (no staff, no classes)
      const isQuickMode = syncType === "quick";
      const shouldSyncAll = syncType === "all";

      if (shouldSyncAll || syncType === "locations" || isQuickMode) {
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

      // Services moved to Phase 2 - requires user token

      if (shouldSyncAll || syncType === "products") {
        try {
          console.log('\n--- Syncing Retail Products ---');
          results.products = await syncProducts(supabase, config);
          console.log(`Products synced: ${results.products}`);
        } catch (e) {
          console.error('Products sync failed:', e);
          results.products = 0;
        }
      }

      if (shouldSyncAll || syncType === "staff") {
        try {
          console.log('\n--- Syncing Staff ---');
          results.staff = await syncStaff(supabase, config);
          console.log(`Staff synced: ${results.staff}`);
        } catch (e) {
          console.error('Staff sync failed:', e);
          results.staff = 0;
        }
      }

      if (shouldSyncAll || syncType === "class_descriptions") {
        try {
          console.log('\n--- Syncing Class Descriptions ---');
          results.class_descriptions = await syncClassDescriptions(supabase, config);
          console.log(`Class descriptions synced: ${results.class_descriptions}`);
        } catch (e) {
          console.error('Class descriptions sync failed:', e);
          results.class_descriptions = 0;
        }
      }

      if (shouldSyncAll || syncType === "classes") {
        try {
          console.log('\n--- Syncing Classes ---');
          results.classes = await syncClasses(supabase, config);
          console.log(`Classes synced: ${results.classes}`);
        } catch (e) {
          console.error('Classes sync failed:', e);
          results.classes = 0;
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

      if (userToken && (shouldSyncAll || syncType === "clients")) {
        try {
          console.log('\n--- Syncing Clients (with User Token) ---');
          results.clients = await syncClients(supabase, config, userToken);
          console.log(`Clients synced: ${results.clients}`);
        } catch (e) {
          console.error('Clients sync failed:', e);
          results.clients = 0;
        }
      } else if (shouldSyncAll || syncType === "clients") {
        console.warn('⚠️ Skipping clients sync - no user token available');
        results.clients = 0;
      }

      if (userToken && (shouldSyncAll || syncType === "appointments")) {
        try {
          console.log('\n--- Syncing Appointments (with User Token) ---');
          results.appointments = await syncAppointments(supabase, config, userToken);
          console.log(`Appointments synced: ${results.appointments}`);
        } catch (e) {
          console.error('Appointments sync failed:', e);
          results.appointments = 0;
        }
      } else if (shouldSyncAll || syncType === "appointments") {
        console.warn('⚠️ Skipping appointments sync - no user token available');
        results.appointments = 0;
      }

      if (userToken && (shouldSyncAll || syncType === "sales" || isQuickMode)) {
        try {
          console.log('\n--- Syncing Sales (with User Token) ---');
          results.sales = await syncSales(supabase, config, userToken);
          console.log(`Sales synced: ${results.sales}`);
        } catch (e) {
          console.error('Sales sync failed:', e);
          results.sales = 0;
        }
      } else if (shouldSyncAll || syncType === "sales" || isQuickMode) {
        console.warn('⚠️ Skipping sales sync - no user token available');
        results.sales = 0;
      }

      if (userToken && (shouldSyncAll || syncType === "services" || isQuickMode)) {
        try {
          console.log('\n--- Syncing Services (with User Token) ---');
          results.services = await syncServices(supabase, config, userToken);
          console.log(`Services synced: ${results.services}`);
        } catch (e) {
          console.error('Services sync failed:', e);
          results.services = 0;
        }
      } else if (shouldSyncAll || syncType === "services" || isQuickMode) {
        console.warn('⚠️ Skipping services sync - no user token available');
        results.services = 0;
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
