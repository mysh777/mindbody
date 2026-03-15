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
  const staffUsername = Deno.env.get("MINDBODY_STAFF_USERNAME");
  const staffPassword = Deno.env.get("MINDBODY_STAFF_PASSWORD");

  if (!staffUsername || !staffPassword) {
    console.warn("⚠️ Staff credentials not configured");
    console.warn("Protected endpoints (appointments, sales) will be SKIPPED");
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
  return {
    "Api-Key": config.apiKey,
    "SiteId": config.siteId,
    "Content-Type": "application/json",
  };
}

function getUserHeaders(config: MindbodyConfig, userToken: string) {
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

async function syncSites(supabase: any, config: MindbodyConfig) {
  console.log('Syncing site information');
  const url = `${MINDBODY_BASE_URL}/site/sites`;
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

  await logApiCall(supabase, url, "GET", null, response.status, data, error, durationMs);

  if (!response.ok) {
    console.error(`Failed to fetch sites: ${response.status}`);
    return 0;
  }

  const sites = data.Sites || [];
  console.log(`Found ${sites.length} sites`);
  await saveRawData(supabase, 'sites', data, sites.length, data.PaginationResponse);

  for (const site of sites) {
    const siteData = {
      mindbody_id: String(site.Id),
      name: site.Name,
      per_staff_pricing: site.PerStaffPricing || false,
      raw_data: site,
      synced_at: new Date().toISOString(),
    };

    await supabase.from("sites").upsert(siteData, {
      onConflict: "mindbody_id",
    });
  }

  return sites.length;
}

async function syncLocations(supabase: any, config: MindbodyConfig) {
  console.log('Syncing locations');
  const url = `${MINDBODY_BASE_URL}/site/locations`;
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

  await logApiCall(supabase, url, "GET", null, response.status, data, error, durationMs);

  if (!response.ok) {
    console.error(`Failed to fetch locations: ${response.status}`);
    return 0;
  }

  const locations = data.Locations || [];
  await saveRawData(supabase, 'locations', data, locations.length, data.PaginationResponse);

  let validCount = 0;
  for (const loc of locations) {
    if (!loc.Name || loc.Name.trim() === '') {
      console.log(`Skipping invalid location: ${loc.Id}`);
      continue;
    }

    const locData = {
      id: String(loc.Id || loc.LocationId),
      mindbody_id: String(loc.Id || loc.LocationId),
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
    validCount++;
  }

  console.log(`Valid locations synced: ${validCount}/${locations.length}`);
  return validCount;
}

async function syncStaff(supabase: any, config: MindbodyConfig) {
  console.log('Syncing staff');
  let offset = 0;
  const limit = 100;
  let totalSynced = 0;

  while (true) {
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

    await logApiCall(supabase, url, "GET", null, response.status, data, error, durationMs);

    if (!response.ok) {
      console.error(`Failed to fetch staff: ${response.status}`);
      break;
    }

    const staffMembers = data.StaffMembers || [];

    if (offset === 0) {
      await saveRawData(supabase, 'staff', data, staffMembers.length, data.PaginationResponse);
    }

    if (staffMembers.length === 0) break;

    for (const staff of staffMembers) {
      const staffData = {
        id: String(staff.Id),
        mindbody_id: String(staff.Id),
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

async function syncPrograms(supabase: any, config: MindbodyConfig) {
  console.log('Syncing programs (service categories)');

  const url = `${MINDBODY_BASE_URL}/site/programs`;
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

  await logApiCall(supabase, url, "GET", null, response.status, data, error, durationMs);

  if (!response.ok) {
    console.error(`Failed to fetch programs: ${response.status}`);
    return 0;
  }

  const programs = data.Programs || [];
  console.log(`Found ${programs.length} programs`);

  await saveRawData(supabase, 'programs', data, programs.length, null);

  for (const program of programs) {
    const categoryData = {
      id: String(program.Id),
      mindbody_id: String(program.Id),
      name: program.Name,
      description: program.Description,
      active: true,
    };

    await supabase.from("service_categories").upsert(categoryData, {
      onConflict: "mindbody_id",
    });
  }

  return programs.length;
}

async function syncSessionTypes(supabase: any, config: MindbodyConfig) {
  console.log('Syncing session types (appointment types)');

  let offset = 0;
  const limit = 100;
  let totalSynced = 0;

  while (true) {
    const url = `${MINDBODY_BASE_URL}/site/sessiontypes?limit=${limit}&offset=${offset}`;
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

    await logApiCall(supabase, url, "GET", null, response.status, data, error, durationMs);

    if (!response.ok) {
      console.error(`Failed to fetch session types: ${response.status}`);
      break;
    }

    const sessionTypes = data.SessionTypes || [];
    console.log(`Found ${sessionTypes.length} session types at offset ${offset}`);

    if (offset === 0) {
      await saveRawData(supabase, 'session_types', data, sessionTypes.length, data.PaginationResponse);
    }

    if (sessionTypes.length === 0) break;

    for (const st of sessionTypes) {
      const sessionTypeData = {
        id: String(st.Id),
        mindbody_id: String(st.Id),
        name: st.Name,
        service_category_id: st.ProgramId ? String(st.ProgramId) : null,
        default_duration_minutes: st.DefaultTimeLength,
        description: st.Description,
        active: st.Active !== false,
        online_booking_enabled: st.BookableOnline || false,
        program_id: st.ProgramId ? String(st.ProgramId) : null,
        raw_data: st,
        updated_at: new Date().toISOString(),
      };

      await supabase.from("session_types").upsert(sessionTypeData, {
        onConflict: "mindbody_id",
      });
    }

    totalSynced += sessionTypes.length;
    offset += limit;

    if (sessionTypes.length < limit) break;
  }

  return totalSynced;
}

async function syncStaffSessionTypes(supabase: any, config: MindbodyConfig) {
  console.log('Syncing staff session types (staff-service relationships)');

  const { data: allStaff } = await supabase.from("staff").select("id, mindbody_id");

  if (!allStaff || allStaff.length === 0) {
    console.warn('No staff found. Run staff sync first.');
    return 0;
  }

  let totalSynced = 0;

  for (const staff of allStaff) {
    const url = `${MINDBODY_BASE_URL}/staff/staffsessiontypes?staffId=${staff.mindbody_id}`;
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

    await logApiCall(supabase, url, "GET", null, response.status, data, error, durationMs);

    if (!response.ok) {
      console.error(`Failed to fetch session types for staff ${staff.mindbody_id}: ${response.status}`);
      continue;
    }

    const staffSessionTypes = data.StaffSessionTypes || [];
    console.log(`Found ${staffSessionTypes.length} session types for staff ${staff.mindbody_id}`);

    for (const sst of staffSessionTypes) {
      const { data: sessionType } = await supabase
        .from("session_types")
        .select("id")
        .eq("mindbody_id", String(sst.Id))
        .maybeSingle();

      if (!sessionType) {
        console.warn(`Session type ${sst.Id} not found in database`);
        continue;
      }

      const relationId = `${staff.id}_${sessionType.id}`;
      const relationData = {
        id: relationId,
        staff_id: staff.id,
        session_type_id: sessionType.id,
        is_active: true,
        raw_data: sst,
        updated_at: new Date().toISOString(),
      };

      await supabase.from("staff_session_types").upsert(relationData, {
        onConflict: "id",
      });

      totalSynced++;
    }
  }

  return totalSynced;
}

async function syncPricingOptions(supabase: any, config: MindbodyConfig, userToken: string) {
  console.log('Syncing pricing options');

  let offset = 0;
  const limit = 100;
  let totalSynced = 0;

  while (true) {
    const url = `${MINDBODY_BASE_URL}/sale/services?limit=${limit}&offset=${offset}`;
    const startTime = Date.now();

    const response = await fetch(url, {
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

    await logApiCall(supabase, url, "GET", null, response.status, data, error, durationMs);

    if (!response.ok) {
      console.error(`Failed to fetch pricing options: ${response.status}`);
      break;
    }

    const services = data.Services || [];
    console.log(`Found ${services.length} pricing options at offset ${offset}`);

    if (offset === 0) {
      await saveRawData(supabase, 'pricing_options', data, services.length, data.PaginationResponse);
    }

    if (services.length === 0) break;

    for (const service of services) {
      const pricingData = {
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

      const { data: insertedPricing } = await supabase.from("pricing_options").upsert(pricingData, {
        onConflict: "mindbody_id",
      }).select().single();

      if (insertedPricing && service.ProgramId) {
        const { data: sessionTypesForProgram } = await supabase
          .from("session_types")
          .select("id")
          .eq("program_id", String(service.ProgramId));

        if (sessionTypesForProgram && sessionTypesForProgram.length > 0) {
          for (const st of sessionTypesForProgram) {
            await supabase.from("pricing_option_session_types").upsert({
              pricing_option_id: insertedPricing.id,
              session_type_id: st.id,
            }, {
              onConflict: "pricing_option_id,session_type_id",
              ignoreDuplicates: true,
            });
          }
          console.log(`Linked pricing option ${service.Name} to ${sessionTypesForProgram.length} session types`);
        }
      }
    }

    totalSynced += services.length;
    offset += limit;

    if (services.length < limit) break;
  }

  return totalSynced;
}

async function syncAppointments(supabase: any, config: MindbodyConfig, userToken: string) {
  console.log('Syncing appointments');
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

    const response = await fetch(url, {
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

    await logApiCall(supabase, url, "GET", null, response.status, data, error, durationMs);

    if (!response.ok) {
      console.error(`Failed to fetch appointments: ${response.status}`);
      break;
    }

    const appointments = data.Appointments || [];
    console.log(`Found ${appointments.length} appointments at offset ${offset}`);

    if (offset === 0) {
      await saveRawData(supabase, 'appointments', data, appointments.length, data.PaginationResponse);
      if (appointments.length > 0) {
        console.log('Sample appointment data:', JSON.stringify(appointments[0], null, 2));
      }
    }

    if (appointments.length === 0) break;

    for (const appt of appointments) {
      const sessionTypeId = appt.SessionTypeId || appt.SessionType?.Id || null;

      const apptData = {
        id: String(appt.Id),
        mindbody_id: String(appt.Id),
        client_id: appt.ClientId ? String(appt.ClientId) : null,
        staff_id: appt.StaffId || appt.Staff?.Id ? String(appt.StaffId || appt.Staff?.Id) : null,
        location_id: appt.LocationId || appt.Location?.Id ? String(appt.LocationId || appt.Location?.Id) : null,
        session_type_id: sessionTypeId ? String(sessionTypeId) : null,
        start_datetime: appt.StartDateTime,
        end_datetime: appt.EndDateTime,
        duration_minutes: appt.Duration,
        status: appt.Status,
        notes: appt.Notes,
        first_appointment: appt.FirstAppointment || false,
        raw_data: appt,
        synced_at: new Date().toISOString(),
      };

      const { error: upsertError } = await supabase.from("appointments").upsert(apptData, {
        onConflict: "mindbody_id",
      });

      if (upsertError) {
        console.error(`Failed to upsert appointment ${appt.Id}:`, upsertError);
      }

      if (appt.AddOns && appt.AddOns.length > 0) {
        for (const addon of appt.AddOns) {
          const addonData = {
            appointment_id: String(appt.Id),
            addon_id: addon.Id ? String(addon.Id) : null,
            addon_name: addon.Name,
            addon_price: addon.Price,
          };

          await supabase.from("appointment_addons").insert(addonData);
        }
      }
    }

    totalSynced += appointments.length;
    offset += limit;

    if (appointments.length < limit) break;
  }

  return totalSynced;
}

async function syncClients(supabase: any, config: MindbodyConfig, userToken?: string) {
  console.log('Syncing clients');
  let offset = 0;
  const limit = 100;
  let totalSynced = 0;

  while (true) {
    const url = `${MINDBODY_BASE_URL}/client/clients?limit=${limit}&offset=${offset}`;
    const startTime = Date.now();

    const response = await fetch(url, {
      headers: userToken ? getUserHeaders(config, userToken) : getSourceHeaders(config),
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

    await logApiCall(supabase, url, "GET", null, response.status, data, error, durationMs);

    if (!response.ok) {
      console.error(`Failed to fetch clients: ${response.status}`);
      break;
    }

    const clients = data.Clients || [];

    if (offset === 0) {
      await saveRawData(supabase, 'clients', data, clients.length, data.PaginationResponse);
    }

    if (clients.length === 0) break;

    for (const client of clients) {
      const clientData = {
        id: String(client.Id || client.UniqueId),
        mindbody_id: String(client.Id || client.UniqueId),
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

async function syncSales(supabase: any, config: MindbodyConfig, userToken: string) {
  console.log('Syncing sales');
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
      console.error(`Failed to fetch sales: ${response.status}`);
      break;
    }

    const sales = data.Sales || [];

    if (offset === 0) {
      await saveRawData(supabase, 'sales', data, sales.length, data.PaginationResponse);
    }

    if (sales.length === 0) break;

    for (const sale of sales) {
      const totalPaymentAmount = sale.Payments?.reduce((sum: number, payment: any) => {
        return sum + (payment.Amount || 0);
      }, 0) || 0;

      const totalItemsAmount = sale.PurchasedItems?.reduce((sum: number, item: any) => {
        return sum + (item.TotalAmount || 0);
      }, 0) || 0;

      const saleData = {
        id: String(sale.Id || sale.SaleId),
        mindbody_id: String(sale.Id || sale.SaleId),
        sale_date: sale.SaleDate,
        sale_time: sale.SaleTime,
        sale_datetime: sale.SaleDateTime,
        client_id: sale.ClientId ? String(sale.ClientId) : null,
        location_id: sale.LocationId ? String(sale.LocationId) : null,
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
            item_id: String(item.Id),
            item_name: item.Description || item.Name,
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

async function syncProducts(supabase: any, config: MindbodyConfig) {
  console.log('Syncing retail products');

  let offset = 0;
  const limit = 100;
  let totalSynced = 0;

  while (true) {
    const url = `${MINDBODY_BASE_URL}/site/products?limit=${limit}&offset=${offset}`;
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

    await logApiCall(supabase, url, "GET", null, response.status, data, error, durationMs);

    if (!response.ok) {
      console.error(`Failed to fetch products: ${response.status}`);
      break;
    }

    const products = data.Products || [];

    if (offset === 0) {
      await saveRawData(supabase, 'products', data, products.length, data.PaginationResponse);
    }

    if (products.length === 0) break;

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
    }

    totalSynced += products.length;
    offset += limit;

    if (products.length < limit) break;
  }

  return totalSynced;
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
          error: "Missing Mindbody credentials",
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

    try {
      console.log('=== Starting Mindbody Sync (Appointment-Driven Model) ===');
      console.log(`Sync Type: ${syncType}`);

      const results: Record<string, number> = {};
      const isQuickMode = syncType === "quick";
      const shouldSyncAll = syncType === "all";

      console.log('\n=== Phase 1: Public Endpoints ===');

      if (shouldSyncAll || syncType === "sites" || isQuickMode) {
        try {
          console.log('\n--- Syncing Sites ---');
          results.sites = await syncSites(supabase, config);
          console.log(`✅ Sites synced: ${results.sites}`);
        } catch (e) {
          console.error('❌ Sites sync failed:', e);
          results.sites = 0;
        }
      }

      if (shouldSyncAll || syncType === "locations" || isQuickMode) {
        try {
          console.log('\n--- Syncing Locations ---');
          results.locations = await syncLocations(supabase, config);
          console.log(`✅ Locations synced: ${results.locations}`);
        } catch (e) {
          console.error('❌ Locations sync failed:', e);
          results.locations = 0;
        }
      }

      if (shouldSyncAll || syncType === "staff" || isQuickMode) {
        try {
          console.log('\n--- Syncing Staff ---');
          results.staff = await syncStaff(supabase, config);
          console.log(`✅ Staff synced: ${results.staff}`);
        } catch (e) {
          console.error('❌ Staff sync failed:', e);
          results.staff = 0;
        }
      }

      if (shouldSyncAll || syncType === "programs" || syncType === "session_types" || isQuickMode) {
        try {
          console.log('\n--- Syncing Programs (Service Categories) ---');
          results.programs = await syncPrograms(supabase, config);
          console.log(`✅ Programs synced: ${results.programs}`);
        } catch (e) {
          console.error('❌ Programs sync failed:', e);
          results.programs = 0;
        }
      }

      if (shouldSyncAll || syncType === "session_types" || isQuickMode) {
        try {
          console.log('\n--- Syncing Session Types ---');
          results.session_types = await syncSessionTypes(supabase, config);
          console.log(`✅ Session types synced: ${results.session_types}`);
        } catch (e) {
          console.error('❌ Session types sync failed:', e);
          results.session_types = 0;
        }
      }

      if (shouldSyncAll || syncType === "staff_session_types" || isQuickMode) {
        try {
          console.log('\n--- Syncing Staff-Session Type Relationships ---');
          results.staff_session_types = await syncStaffSessionTypes(supabase, config);
          console.log(`✅ Staff-Session relationships synced: ${results.staff_session_types}`);
        } catch (e) {
          console.error('❌ Staff-Session relationships sync failed:', e);
          results.staff_session_types = 0;
        }
      }

      console.log('\n=== Phase 2: Protected Endpoints (User Token Required) ===');

      let userToken: string | null = null;
      try {
        userToken = await getUserToken(supabase, config);
      } catch (e) {
        console.error('❌ Failed to get user token:', e);
      }

      if (userToken && (shouldSyncAll || syncType === "pricing_options" || isQuickMode)) {
        try {
          console.log('\n--- Syncing Pricing Options ---');
          results.pricing_options = await syncPricingOptions(supabase, config, userToken);
          console.log(`✅ Pricing options synced: ${results.pricing_options}`);
        } catch (e) {
          console.error('❌ Pricing options sync failed:', e);
          results.pricing_options = 0;
        }
      }

      if (userToken && (shouldSyncAll || syncType === "clients")) {
        try {
          console.log('\n--- Syncing Clients ---');
          results.clients = await syncClients(supabase, config, userToken);
          console.log(`✅ Clients synced: ${results.clients}`);
        } catch (e) {
          console.error('❌ Clients sync failed:', e);
          results.clients = 0;
        }
      }

      if (userToken && (shouldSyncAll || syncType === "appointments" || isQuickMode)) {
        try {
          console.log('\n--- Syncing Appointments ---');
          results.appointments = await syncAppointments(supabase, config, userToken);
          console.log(`✅ Appointments synced: ${results.appointments}`);
        } catch (e) {
          console.error('❌ Appointments sync failed:', e);
          results.appointments = 0;
        }
      }

      if (userToken && (shouldSyncAll || syncType === "sales" || isQuickMode)) {
        try {
          console.log('\n--- Syncing Sales ---');
          results.sales = await syncSales(supabase, config, userToken);
          console.log(`✅ Sales synced: ${results.sales}`);
        } catch (e) {
          console.error('❌ Sales sync failed:', e);
          results.sales = 0;
        }
      }

      if (shouldSyncAll || syncType === "retail_products") {
        try {
          console.log('\n--- Syncing Retail Products ---');
          results.retail_products = await syncProducts(supabase, config);
          console.log(`✅ Retail products synced: ${results.retail_products}`);
        } catch (e) {
          console.error('❌ Retail products sync failed:', e);
          results.retail_products = 0;
        }
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
