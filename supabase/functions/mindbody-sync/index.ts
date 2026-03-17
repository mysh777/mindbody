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
      await saveRawData(supabase, 'services', data, sessionTypes.length, data.PaginationResponse);
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

async function syncServiceCategories(supabase: any, config: MindbodyConfig) {
  console.log('Syncing service categories and subcategories');
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
    console.error(`Failed to fetch service categories: ${response.status}`);
    return 0;
  }

  const programs = data.Programs || [];
  console.log(`Found ${programs.length} service categories with subcategories`);
  await saveRawData(supabase, 'service_categories', data, programs.length, null);

  let totalCategories = 0;
  let totalSubcategories = 0;

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
    totalCategories++;

    if (program.ScheduleTypes && Array.isArray(program.ScheduleTypes)) {
      for (const scheduleType of program.ScheduleTypes) {
        const subcategoryData = {
          id: String(scheduleType.Id),
          mindbody_id: String(scheduleType.Id),
          category_id: String(program.Id),
          name: scheduleType.Name,
          description: scheduleType.Description,
          active: true,
          raw_data: scheduleType,
        };

        await supabase.from("service_subcategories").upsert(subcategoryData, {
          onConflict: "mindbody_id",
        });
        totalSubcategories++;
      }
    }
  }

  console.log(`Synced ${totalCategories} categories and ${totalSubcategories} subcategories`);
  return totalCategories + totalSubcategories;
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
        product_id: service.ProductId ? String(service.ProductId) : null,
        program_id: service.ProgramId ? String(service.ProgramId) : null,
        program_name: service.Program,
        priority: service.Priority,
        discontinued: service.Discontinued || false,
        is_intro_offer: service.IsIntroOffer || false,
        membership_id: service.MembershipId ? String(service.MembershipId) : null,
        expiration_type: service.ExpirationType,
        expiration_unit: service.ExpirationUnit,
        expiration_length: service.ExpirationLength,
        intro_offer_type: service.IntroOfferType,
        use_at_location_ids: service.UseAtLocationIds ? JSON.stringify(service.UseAtLocationIds) : null,
        sell_at_location_ids: service.SellAtLocationIds ? JSON.stringify(service.SellAtLocationIds) : null,
        sale_in_contract_only: service.SaleInContractOnly || false,
        restrict_to_membership_ids: service.RestrictToMembershipIds ? JSON.stringify(service.RestrictToMembershipIds) : null,
        is_third_party_discount_pricing: service.IsThirdPartyDiscountPricing || false,
        apply_member_discounts_of_membership_ids: service.ApplyMemberDiscountsOfMembershipIds ? JSON.stringify(service.ApplyMemberDiscountsOfMembershipIds) : null,
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

async function syncAppointments(supabase: any, config: MindbodyConfig, userToken: string, year?: number) {
  const targetYear = year || new Date().getFullYear();
  console.log(`=== APPOINTMENTS SYNC START for year ${targetYear} ===`);

  const startDate = new Date(targetYear, 0, 1);
  const endDate = targetYear === new Date().getFullYear()
    ? new Date(new Date().getFullYear(), new Date().getMonth() + 3, 0)
    : new Date(targetYear, 11, 31);

  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  let totalSynced = 0;

  const { data: allStaff } = await supabase.from("staff").select("id, mindbody_id");

  if (!allStaff || allStaff.length === 0) {
    console.warn('No staff found. Trying direct appointments endpoint...');
    return await syncAppointmentsDirect(supabase, config, userToken, startDateStr, endDateStr);
  }

  console.log(`[APPOINTMENTS] Fetching for ${allStaff.length} staff from ${startDateStr} to ${endDateStr}`);

  for (const staff of allStaff) {
    let offset = 0;
    const limit = 200;
    let staffTotal = 0;

    while (true) {
      const url = `${MINDBODY_BASE_URL}/appointment/staffappointments?staffIds=${staff.mindbody_id}&startDate=${startDateStr}&endDate=${endDateStr}&limit=${limit}&offset=${offset}`;
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

      if (staffTotal === 0 && totalSynced === 0) {
        await logApiCall(supabase, url, "GET", { staffId: staff.mindbody_id, year: targetYear }, response.status, data, error, durationMs);
      }

      if (!response.ok) {
        console.error(`[APPOINTMENTS] Failed for staff ${staff.mindbody_id}: ${response.status}`);
        break;
      }

      const appointments = data.Appointments || [];

      if (offset === 0 && totalSynced === 0 && appointments.length > 0) {
        await saveRawData(supabase, 'appointments', data, appointments.length, data.PaginationResponse);
      }

      if (appointments.length === 0) break;

      const syncedAt = new Date().toISOString();
      const appointmentsData = appointments.map((appt: any) => {
        const sessionTypeId = appt.SessionTypeId || appt.SessionType?.Id || null;
        const clientId = appt.ClientId || appt.Client?.Id || null;
        const staffId = appt.StaffId || appt.Staff?.Id || staff.mindbody_id;
        const locationId = appt.LocationId || appt.Location?.Id || null;
        const clientServiceId = appt.ClientServiceId || null;

        return {
          id: String(appt.Id),
          mindbody_id: String(appt.Id),
          client_id: clientId ? String(clientId) : null,
          staff_id: staffId ? String(staffId) : null,
          location_id: locationId ? String(locationId) : null,
          session_type_id: sessionTypeId ? String(sessionTypeId) : null,
          client_service_id: clientServiceId ? String(clientServiceId) : null,
          start_datetime: appt.StartDateTime,
          end_datetime: appt.EndDateTime,
          duration_minutes: appt.Duration,
          status: appt.Status,
          notes: appt.Notes,
          first_appointment: appt.FirstAppointment || false,
          raw_data: appt,
          synced_at: syncedAt,
        };
      });

      const { error: upsertError } = await supabase.from("appointments").upsert(appointmentsData, {
        onConflict: "mindbody_id",
      });

      if (upsertError) {
        console.error(`[APPOINTMENTS] Batch upsert error:`, upsertError.message);
      }

      staffTotal += appointments.length;
      totalSynced += appointments.length;
      offset += limit;

      if (appointments.length < limit) break;
    }

    if (staffTotal > 0) {
      console.log(`[APPOINTMENTS] Staff ${staff.mindbody_id}: ${staffTotal} appointments`);
    }
  }

  console.log(`=== APPOINTMENTS SYNC COMPLETE: ${totalSynced} records for year ${targetYear} ===`);
  return totalSynced;
}

async function syncAppointmentsDirect(supabase: any, config: MindbodyConfig, userToken: string, startDateStr: string, endDateStr: string) {
  console.log('Trying direct appointments endpoint...');

  let offset = 0;
  const limit = 200;
  let totalSynced = 0;

  while (true) {
    const url = `${MINDBODY_BASE_URL}/appointment/appointments?startDate=${startDateStr}&endDate=${endDateStr}&limit=${limit}&offset=${offset}`;
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

    if (offset === 0) {
      await saveRawData(supabase, 'appointments', data, appointments.length, data.PaginationResponse);
    }

    if (appointments.length === 0) break;

    console.log(`Found ${appointments.length} appointments at offset ${offset}`);

    for (const appt of appointments) {
      const sessionTypeId = appt.SessionTypeId || appt.SessionType?.Id || null;

      const clientServiceId = appt.ClientServiceId || null;

      const apptData = {
        id: String(appt.Id),
        mindbody_id: String(appt.Id),
        client_id: appt.ClientId ? String(appt.ClientId) : null,
        staff_id: appt.StaffId || appt.Staff?.Id ? String(appt.StaffId || appt.Staff?.Id) : null,
        location_id: appt.LocationId || appt.Location?.Id ? String(appt.LocationId || appt.Location?.Id) : null,
        session_type_id: sessionTypeId ? String(sessionTypeId) : null,
        client_service_id: clientServiceId ? String(clientServiceId) : null,
        start_datetime: appt.StartDateTime,
        end_datetime: appt.EndDateTime,
        duration_minutes: appt.Duration,
        status: appt.Status,
        notes: appt.Notes,
        first_appointment: appt.FirstAppointment || false,
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

async function syncClients(supabase: any, config: MindbodyConfig, userToken?: string) {
  console.log('=== CLIENTS SYNC START ===');
  console.log('Strategy: Full pagination with batch upsert');

  let offset = 0;
  const limit = 200;
  let totalSynced = 0;
  let totalResults = 0;
  let pageNumber = 1;

  while (true) {
    const url = `${MINDBODY_BASE_URL}/client/clients?limit=${limit}&offset=${offset}&searchText=`;
    const startTime = Date.now();

    console.log(`[CLIENTS] Page ${pageNumber} | Offset: ${offset} | Limit: ${limit}`);

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

    await logApiCall(supabase, url, "GET", { offset, limit, page: pageNumber }, response.status, data, error, durationMs);

    if (!response.ok) {
      console.error(`[CLIENTS] ERROR: Failed at offset ${offset} - Status: ${response.status}`);
      break;
    }

    const clients = data.Clients || [];
    const pagination = data.PaginationResponse;
    const returnedCount = clients.length;

    if (offset === 0) {
      await saveRawData(supabase, 'clients', data, returnedCount, pagination);
      totalResults = pagination?.TotalResults || 0;
      console.log(`[CLIENTS] API reports TotalResults: ${totalResults}`);
    }

    console.log(`[CLIENTS] Page ${pageNumber} | Returned: ${returnedCount} | Accumulated: ${totalSynced + returnedCount}${totalResults > 0 ? ` / ${totalResults}` : ''} | API: ${durationMs}ms`);

    if (returnedCount === 0) {
      console.log(`[CLIENTS] Empty page received - sync complete`);
      break;
    }

    const syncedAt = new Date().toISOString();
    const clientsData = clients.map((client: any) => ({
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
      synced_at: syncedAt,
    }));

    const upsertStart = Date.now();
    const { error: upsertError } = await supabase.from("clients").upsert(clientsData, {
      onConflict: "mindbody_id",
    });

    if (upsertError) {
      console.error(`[CLIENTS] Batch upsert error:`, upsertError);
    }

    const upsertMs = Date.now() - upsertStart;
    console.log(`[CLIENTS] Batch upsert: ${returnedCount} records in ${upsertMs}ms`);

    totalSynced += returnedCount;
    offset += limit;
    pageNumber++;

    if (returnedCount < limit) {
      console.log(`[CLIENTS] Partial page (${returnedCount} < ${limit}) - sync complete`);
      break;
    }
  }

  console.log(`=== CLIENTS SYNC COMPLETE: ${totalSynced} records ===`);
  return totalSynced;
}

async function syncSales(supabase: any, config: MindbodyConfig, userToken: string, year?: number) {
  const targetYear = year || new Date().getFullYear();
  console.log(`=== SALES SYNC START for year ${targetYear} ===`);

  const startDate = new Date(targetYear, 0, 1);
  const endDate = targetYear === new Date().getFullYear()
    ? new Date()
    : new Date(targetYear, 11, 31, 23, 59, 59);

  let offset = 0;
  const limit = 200;
  let totalSynced = 0;
  let totalResults = 0;
  let pageNumber = 1;

  while (true) {
    const url = `${MINDBODY_BASE_URL}/sale/sales?startSaleDateTime=${startDate.toISOString()}&endSaleDateTime=${endDate.toISOString()}&limit=${limit}&offset=${offset}`;
    const startTime = Date.now();

    console.log(`[SALES] Page ${pageNumber} | Offset: ${offset} | Year: ${targetYear}`);

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

    await logApiCall(supabase, url, "GET", { offset, limit, year: targetYear, page: pageNumber }, response.status, data, error, durationMs);

    if (!response.ok) {
      console.error(`[SALES] ERROR: Failed at offset ${offset} - Status: ${response.status}`);
      break;
    }

    const sales = data.Sales || [];
    const pagination = data.PaginationResponse;
    const returnedCount = sales.length;

    if (offset === 0) {
      await saveRawData(supabase, 'sales', data, returnedCount, pagination);
      totalResults = pagination?.TotalResults || 0;
      console.log(`[SALES] API reports TotalResults: ${totalResults} for year ${targetYear}`);
    }

    console.log(`[SALES] Page ${pageNumber} | Returned: ${returnedCount} | Accumulated: ${totalSynced + returnedCount}${totalResults > 0 ? ` / ${totalResults}` : ''} | API: ${durationMs}ms`);

    if (returnedCount === 0) {
      console.log(`[SALES] Empty page received - sync complete`);
      break;
    }

    const syncedAt = new Date().toISOString();
    const salesData: any[] = [];
    const paymentsData: any[] = [];
    const saleItemsData: any[] = [];

    for (const sale of sales) {
      const saleId = String(sale.Id);

      const totalPaymentAmount = sale.Payments?.reduce((sum: number, payment: any) => sum + (payment.Amount || 0), 0) || 0;
      const totalItemsAmount = sale.PurchasedItems?.reduce((sum: number, item: any) => sum + (item.TotalAmount || 0), 0) || 0;

      salesData.push({
        id: saleId,
        mindbody_id: saleId,
        mindbody_sale_id: saleId,
        mindbody_client_id: sale.ClientId ? String(sale.ClientId) : null,
        sale_date: sale.SaleDate,
        sale_time: sale.SaleTime,
        sale_datetime: sale.SaleDateTime,
        mindbody_location_id: sale.LocationId,
        sales_rep_id: sale.SalesRepId ? String(sale.SalesRepId) : null,
        recipient_client_id: sale.RecipientClientId ? String(sale.RecipientClientId) : null,
        original_sale_datetime: sale.OriginalSaleDateTime,
        client_id: sale.ClientId ? String(sale.ClientId) : null,
        location_id: sale.LocationId ? String(sale.LocationId) : null,
        total: totalItemsAmount,
        payment_amount: totalPaymentAmount,
        raw_data: sale,
        synced_at: syncedAt,
      });

      if (sale.Payments && Array.isArray(sale.Payments)) {
        for (const payment of sale.Payments) {
          const paymentId = String(payment.Id);
          paymentsData.push({
            mindbody_id: `${saleId}-${paymentId}`,
            sale_id: saleId,
            mindbody_sale_id: saleId,
            type: payment.Type,
            method: payment.Method,
            amount: payment.Amount || 0,
            notes: payment.Notes || null,
            transaction_id: payment.TransactionId ? String(payment.TransactionId) : null,
            raw_data: payment,
            synced_at: syncedAt,
          });
        }
      }

      if (sale.PurchasedItems && Array.isArray(sale.PurchasedItems)) {
        for (const item of sale.PurchasedItems) {
          const saleDetailId = item.SaleDetailId;
          if (!saleDetailId) {
            console.warn(`[SALE_ITEMS] Missing SaleDetailId for item in sale ${saleId}`);
            continue;
          }

          saleItemsData.push({
            sale_id: saleId,
            sale_detail_id: saleDetailId,
            mindbody_id: String(item.Id),
            item_id: String(item.Id),
            description: item.Description || item.Name || null,
            item_name: item.Description || item.Name || null,
            item_type: item.IsService ? 'Service' : 'Product',
            quantity: item.Quantity || 1,
            unit_price: item.UnitPrice || 0,
            total_amount: item.TotalAmount || 0,
            amount: item.TotalAmount || 0,
            discount_amount: item.DiscountAmount || 0,
            discount_percent: item.DiscountPercent || 0,
            tax_amount: item.TaxAmount || 0,
            tax: item.TaxAmount || 0,
            tax1: item.Tax1 || 0,
            tax2: item.Tax2 || 0,
            tax3: item.Tax3 || 0,
            tax4: item.Tax4 || 0,
            tax5: item.Tax5 || 0,
            is_service: item.IsService || false,
            payment_ref_id: item.PaymentRefId || null,
            recipient_client_id: item.RecipientClientId ? String(item.RecipientClientId) : null,
            notes: item.Notes || null,
            exp_date: item.ExpDate && item.ExpDate !== '0001-01-01T00:00:00' ? item.ExpDate : null,
            active_date: item.ActiveDate && item.ActiveDate !== '0001-01-01T00:00:00' ? item.ActiveDate : null,
            returned: item.Returned || false,
            barcode_id: item.BarcodeId || null,
            category_id: item.CategoryId || null,
            sub_category_id: item.SubCategoryId || null,
            contract_id: item.ContractId ? String(item.ContractId) : null,
            gift_card_barcode_id: item.GiftCardBarcodeId || null,
            raw_data: item,
          });
        }
      }
    }

    const upsertStart = Date.now();

    const { error: salesError } = await supabase.from("sales").upsert(salesData, { onConflict: "mindbody_id" });
    if (salesError) console.error(`[SALES] Batch upsert error:`, salesError);

    if (paymentsData.length > 0) {
      const { error: paymentsError } = await supabase.from("payments").upsert(paymentsData, { onConflict: "mindbody_id" });
      if (paymentsError) console.error(`[PAYMENTS] Batch upsert error:`, paymentsError);
    }

    if (saleItemsData.length > 0) {
      for (const item of saleItemsData) {
        const { error: itemError } = await supabase.from("sale_items").upsert(item, {
          onConflict: "sale_detail_id",
          ignoreDuplicates: false
        });
        if (itemError) {
          console.error(`[SALE_ITEMS] Upsert error for sale_detail_id ${item.sale_detail_id}:`, itemError.message);
        }
      }
    }

    const upsertMs = Date.now() - upsertStart;
    console.log(`[SALES] Batch upsert: ${salesData.length} sales, ${paymentsData.length} payments, ${saleItemsData.length} items in ${upsertMs}ms`);

    totalSynced += returnedCount;
    offset += limit;
    pageNumber++;

    if (returnedCount < limit) {
      console.log(`[SALES] Partial page (${returnedCount} < ${limit}) - sync complete`);
      break;
    }
  }

  console.log(`=== SALES SYNC COMPLETE: ${totalSynced} records for year ${targetYear} ===`);
  return totalSynced;
}

async function syncClientServices(supabase: any, config: MindbodyConfig, userToken: string, year?: number) {
  console.log(`=== CLIENT SERVICES SYNC START ===`);

  const { data: clientsWithAppointments } = await supabase
    .from("appointments")
    .select("client_id")
    .not("client_id", "is", null)
    .not("client_service_id", "is", null);

  const uniqueClientIds = [...new Set((clientsWithAppointments || []).map((a: any) => a.client_id))];
  console.log(`[CLIENT_SERVICES] Found ${uniqueClientIds.length} unique clients with pricing option appointments`);

  if (uniqueClientIds.length === 0) {
    console.log(`[CLIENT_SERVICES] No clients with client_service_id in appointments. Trying full client list...`);

    const { data: allClients } = await supabase
      .from("clients")
      .select("id")
      .limit(500);

    if (allClients && allClients.length > 0) {
      uniqueClientIds.push(...allClients.map((c: any) => c.id));
    }
  }

  let totalSynced = 0;
  let processedClients = 0;

  for (const clientId of uniqueClientIds) {
    processedClients++;

    const url = `${MINDBODY_BASE_URL}/client/clientservices?clientId=${clientId}`;
    const startTime = Date.now();

    try {
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

      if (processedClients <= 5 || processedClients % 50 === 0) {
        await logApiCall(supabase, url, "GET", { clientId }, response.status, data, error, durationMs);
      }

      if (!response.ok) {
        if (response.status !== 404) {
          console.error(`[CLIENT_SERVICES] Failed for client ${clientId}: ${response.status}`);
        }
        continue;
      }

      const clientServices = data.ClientServices || [];

      if (clientServices.length === 0) continue;

      if (totalSynced === 0) {
        await saveRawData(supabase, 'client_services', data, clientServices.length, null);
        console.log('Sample ClientService:', JSON.stringify(clientServices[0], null, 2));
      }

      const syncedAt = new Date().toISOString();

      for (const cs of clientServices) {
        const csData = {
          mindbody_id: String(cs.Id),
          client_id: clientId,
          product_id: cs.ProductId ? String(cs.ProductId) : String(cs.Id),
          name: cs.Name,
          payment_date: cs.PaymentDate,
          active_date: cs.ActiveDate,
          expiration_date: cs.ExpirationDate,
          count: cs.Count,
          remaining: cs.Remaining,
          current: cs.Current || false,
          program_id: cs.Program?.Id ? String(cs.Program.Id) : null,
          program_name: cs.Program?.Name || cs.Program,
          status: cs.Active ? 'Active' : 'Inactive',
          activation_type: cs.ActivationType,
          raw_data: cs,
          synced_at: syncedAt,
        };

        const { error: upsertError } = await supabase.from("client_services").upsert(csData, {
          onConflict: "mindbody_id",
        });

        if (upsertError) {
          console.error(`[CLIENT_SERVICES] Upsert error for ${cs.Id}:`, upsertError.message);
        } else {
          totalSynced++;
        }
      }

      if (processedClients % 50 === 0) {
        console.log(`[CLIENT_SERVICES] Progress: ${processedClients}/${uniqueClientIds.length} clients, ${totalSynced} services synced`);
      }

    } catch (err) {
      console.error(`[CLIENT_SERVICES] Exception for client ${clientId}:`, err);
    }
  }

  console.log(`=== CLIENT_SERVICES SYNC COMPLETE: ${totalSynced} records from ${processedClients} clients ===`);
  return totalSynced;
}

async function syncTransactions(supabase: any, config: MindbodyConfig, userToken: string, year?: number) {
  const targetYear = year || new Date().getFullYear();
  console.log(`=== TRANSACTIONS SYNC START for year ${targetYear} ===`);

  const startDate = new Date(targetYear, 0, 1);
  const endDate = targetYear === new Date().getFullYear()
    ? new Date()
    : new Date(targetYear, 11, 31, 23, 59, 59);

  let offset = 0;
  const limit = 200;
  let totalSynced = 0;
  let totalResults = 0;
  let pageNumber = 1;

  while (true) {
    const url = `${MINDBODY_BASE_URL}/sale/sales?startSaleDateTime=${startDate.toISOString()}&endSaleDateTime=${endDate.toISOString()}&limit=${limit}&offset=${offset}`;
    const startTime = Date.now();

    console.log(`[TRANSACTIONS] Page ${pageNumber} | Offset: ${offset} | Year: ${targetYear}`);

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

    await logApiCall(supabase, url, "GET", { offset, limit, year: targetYear, page: pageNumber, type: 'transactions' }, response.status, data, error, durationMs);

    if (!response.ok) {
      console.error(`[TRANSACTIONS] ERROR: Failed at offset ${offset} - Status: ${response.status}`);
      break;
    }

    const sales = data.Sales || [];
    const pagination = data.PaginationResponse;
    const returnedCount = sales.length;

    if (offset === 0) {
      totalResults = pagination?.TotalResults || 0;
      console.log(`[TRANSACTIONS] API reports TotalResults: ${totalResults} sales for year ${targetYear}`);
    }

    if (returnedCount === 0) {
      console.log(`[TRANSACTIONS] Empty page received - sync complete`);
      break;
    }

    const syncedAt = new Date().toISOString();
    const transactionsData: any[] = [];

    for (const sale of sales) {
      if (sale.Payments && Array.isArray(sale.Payments)) {
        for (const payment of sale.Payments) {
          const paymentId = String(payment.Id);
          transactionsData.push({
            mindbody_id: `${sale.Id}-${paymentId}`,
            transaction_id: payment.TransactionId ? String(payment.TransactionId) : `${sale.Id}-${paymentId}`,
            sale_id: String(sale.Id),
            payment_processor: payment.Type || 'Unknown',
            transaction_status: 'Completed',
            amount: payment.Amount || 0,
            transaction_date: sale.SaleDateTime,
            raw_data: {
              sale_id: sale.Id,
              sale_datetime: sale.SaleDateTime,
              client_id: sale.ClientId,
              location_id: sale.LocationId,
              payment: payment,
              purchased_items: sale.PurchasedItems || []
            },
            synced_at: syncedAt,
          });
        }
      }
    }

    if (transactionsData.length > 0) {
      const upsertStart = Date.now();
      const { error: upsertError } = await supabase.from("transactions").upsert(transactionsData, {
        onConflict: "mindbody_id",
      });

      if (upsertError) {
        console.error(`[TRANSACTIONS] Batch upsert error:`, upsertError);
      }

      const upsertMs = Date.now() - upsertStart;
      console.log(`[TRANSACTIONS] Batch upsert: ${transactionsData.length} records in ${upsertMs}ms`);
      totalSynced += transactionsData.length;
    }

    console.log(`[TRANSACTIONS] Page ${pageNumber} | Sales: ${returnedCount} | Transactions: ${transactionsData.length} | Total: ${totalSynced}`);

    offset += limit;
    pageNumber++;

    if (returnedCount < limit) {
      console.log(`[TRANSACTIONS] Partial page (${returnedCount} < ${limit}) - sync complete`);
      break;
    }
  }

  console.log(`=== TRANSACTIONS SYNC COMPLETE: ${totalSynced} records for year ${targetYear} ===`);
  return totalSynced;
}

async function syncClientVisits(supabase: any, config: MindbodyConfig, userToken: string) {
  console.log('Syncing client visits');
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 6);
  const endDate = new Date();

  let offset = 0;
  const limit = 100;
  let totalSynced = 0;

  while (true) {
    const url = `${MINDBODY_BASE_URL}/client/clientvisits?startDate=${startDate.toISOString().split('T')[0]}&endDate=${endDate.toISOString().split('T')[0]}&limit=${limit}&offset=${offset}`;
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
      console.error(`Failed to fetch client visits: ${response.status}`);
      break;
    }

    const visits = data.Visits || [];
    console.log(`Found ${visits.length} visits at offset ${offset}`);

    if (offset === 0) {
      await saveRawData(supabase, 'client_visits', data, visits.length, data.PaginationResponse);
    }

    if (visits.length === 0) break;

    for (const visit of visits) {
      const visitData = {
        mindbody_id: String(visit.Id),
        visit_id: String(visit.Id),
        client_id: visit.ClientId ? String(visit.ClientId) : null,
        class_id: visit.ClassId ? String(visit.ClassId) : null,
        visit_datetime: visit.StartDateTime,
        service_id: visit.ServiceId ? String(visit.ServiceId) : null,
        service_name: visit.ServiceName,
        session_type_id: visit.SessionTypeId ? String(visit.SessionTypeId) : null,
        location_id: visit.LocationId ? String(visit.LocationId) : null,
        staff_id: visit.StaffId ? String(visit.StaffId) : null,
        signed_in: visit.SignedIn || false,
        make_up: visit.MakeUp || false,
        late_cancelled: visit.LateCancelled || false,
        web_signup: visit.WebSignup || false,
        appointment_id: visit.AppointmentId ? String(visit.AppointmentId) : null,
        appointment_status: visit.AppointmentStatus,
        raw_data: visit,
        synced_at: new Date().toISOString(),
      };

      await supabase.from("client_visits").upsert(visitData, {
        onConflict: "mindbody_id",
      });
    }

    totalSynced += visits.length;
    offset += limit;

    if (visits.length < limit) break;
  }

  return totalSynced;
}

async function syncPackages(supabase: any, config: MindbodyConfig, userToken: string) {
  console.log('Syncing packages');

  let offset = 0;
  const limit = 100;
  let totalSynced = 0;

  while (true) {
    const url = `${MINDBODY_BASE_URL}/sale/packages?limit=${limit}&offset=${offset}`;
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
      console.error(`Failed to fetch packages: ${response.status}`);
      break;
    }

    const packages = data.Packages || [];
    console.log(`Found ${packages.length} packages at offset ${offset}`);

    if (offset === 0) {
      await saveRawData(supabase, 'packages', data, packages.length, data.PaginationResponse);
    }

    if (packages.length === 0) break;

    for (const pkg of packages) {
      const packageData = {
        id: String(pkg.Id),
        mindbody_id: String(pkg.Id),
        name: pkg.Name,
        description: pkg.Description,
        sell_online: pkg.SellOnline || false,
        price: pkg.Price,
        online_price: pkg.OnlinePrice,
        discontinued: pkg.Discontinued || false,
        raw_data: pkg,
        synced_at: new Date().toISOString(),
      };

      await supabase.from("packages").upsert(packageData, {
        onConflict: "mindbody_id",
      });
    }

    totalSynced += packages.length;
    offset += limit;

    if (packages.length < limit) break;
  }

  return totalSynced;
}

async function buildPricingSessionTypeLinks(supabase: any, config: MindbodyConfig, userToken: string) {
  console.log('Building accurate pricing_option ↔ session_type links via API');

  const { data: sessionTypes } = await supabase
    .from("session_types")
    .select("id, mindbody_id, name")
    .order("id");

  if (!sessionTypes || sessionTypes.length === 0) {
    console.warn('No session types found. Run session types sync first.');
    return 0;
  }

  console.log(`Processing ${sessionTypes.length} session types to build pricing links`);

  let totalLinksCreated = 0;
  let processedCount = 0;

  await supabase.from("pricing_option_session_types").delete().neq("pricing_option_id", "00000000-0000-0000-0000-000000000000");
  console.log('Cleared existing pricing_option_session_types links');

  for (const sessionType of sessionTypes) {
    processedCount++;

    const url = `${MINDBODY_BASE_URL}/sale/services?request.sessionTypeIds[]=${sessionType.mindbody_id}&request.limit=200`;
    const startTime = Date.now();

    try {
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

      if (processedCount <= 5 || processedCount % 20 === 0) {
        await logApiCall(supabase, url, "GET", { sessionTypeId: sessionType.mindbody_id }, response.status, data, error, durationMs);
      }

      if (!response.ok) {
        console.error(`Failed to fetch services for session type ${sessionType.mindbody_id}: ${response.status}`);
        continue;
      }

      const services = data.Services || [];

      if (services.length > 0) {
        console.log(`Session type "${sessionType.name}" (${sessionType.mindbody_id}): ${services.length} pricing options`);

        for (const service of services) {
          const { data: pricingOption } = await supabase
            .from("pricing_options")
            .select("id")
            .eq("mindbody_id", String(service.Id))
            .maybeSingle();

          if (pricingOption) {
            const { error: linkError } = await supabase.from("pricing_option_session_types").upsert({
              pricing_option_id: pricingOption.id,
              session_type_id: sessionType.id,
            }, {
              onConflict: "pricing_option_id,session_type_id",
              ignoreDuplicates: true,
            });

            if (!linkError) {
              totalLinksCreated++;
            }
          } else {
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
              product_id: service.ProductId ? String(service.ProductId) : null,
              program_id: service.ProgramId ? String(service.ProgramId) : null,
              program_name: service.Program,
              raw_data: service,
              synced_at: new Date().toISOString(),
            };

            const { data: newPricing, error: insertError } = await supabase
              .from("pricing_options")
              .upsert(pricingData, { onConflict: "mindbody_id" })
              .select()
              .single();

            if (newPricing && !insertError) {
              await supabase.from("pricing_option_session_types").upsert({
                pricing_option_id: newPricing.id,
                session_type_id: sessionType.id,
              }, {
                onConflict: "pricing_option_id,session_type_id",
                ignoreDuplicates: true,
              });
              totalLinksCreated++;
            }
          }
        }
      }

      if (processedCount % 10 === 0) {
        console.log(`Progress: ${processedCount}/${sessionTypes.length} session types processed, ${totalLinksCreated} links created`);
      }

    } catch (err) {
      console.error(`Error processing session type ${sessionType.mindbody_id}:`, err);
    }
  }

  console.log(`✅ Completed: ${totalLinksCreated} pricing-session links created for ${sessionTypes.length} session types`);
  return totalLinksCreated;
}

async function syncProducts(supabase: any, config: MindbodyConfig, userToken?: string) {
  console.log('Syncing retail products');

  let offset = 0;
  const limit = 200;
  let totalSynced = 0;
  let totalResults = 0;

  while (true) {
    const url = `${MINDBODY_BASE_URL}/sale/products?limit=${limit}&offset=${offset}`;
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
      console.error(`Failed to fetch products: ${response.status}`);
      console.error(`Response: ${responseText}`);
      break;
    }

    const products = data.Products || [];
    const pagination = data.PaginationResponse;

    if (offset === 0) {
      await saveRawData(supabase, 'products', data, products.length, pagination);
      totalResults = pagination?.TotalResults || 0;
      console.log(`Total products in Mindbody: ${totalResults}`);
      if (products.length > 0) {
        console.log('Sample product data:', JSON.stringify(products[0], null, 2));
      }
    }

    console.log(`Fetched ${products.length} products at offset ${offset} (total so far: ${totalSynced + products.length}/${totalResults})`);

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
    if (totalResults > 0 && totalSynced >= totalResults) break;
  }

  console.log(`Total retail products synced: ${totalSynced}`);
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
    const { syncType = "quick", year } = await req.json().catch(() => ({}));
    const targetYear = year ? parseInt(year) : undefined;

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

      if (shouldSyncAll || syncType === "programs" || syncType === "services" || isQuickMode) {
        try {
          console.log('\n--- Syncing Programs (Service Categories with Subcategories) ---');
          results.service_categories = await syncServiceCategories(supabase, config);
          console.log(`✅ Service categories synced: ${results.service_categories}`);
        } catch (e) {
          console.error('❌ Service categories sync failed:', e);
          results.service_categories = 0;
        }
      }

      if (shouldSyncAll || syncType === "services" || isQuickMode) {
        try {
          console.log('\n--- Syncing Session Types (Bookable Services) ---');
          results.session_types = await syncSessionTypes(supabase, config);
          console.log(`✅ Session types synced: ${results.session_types}`);
        } catch (e) {
          console.error('❌ Session types sync failed:', e);
          results.session_types = 0;
        }
      }

      if (shouldSyncAll || syncType === "staff_services" || isQuickMode) {
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

      if (userToken && (shouldSyncAll || syncType === "clients" || isQuickMode)) {
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
          results.appointments = await syncAppointments(supabase, config, userToken, targetYear);
          console.log(`✅ Appointments synced: ${results.appointments}`);
        } catch (e) {
          console.error('❌ Appointments sync failed:', e);
          results.appointments = 0;
        }
      }

      if (userToken && (shouldSyncAll || syncType === "sales" || isQuickMode)) {
        try {
          console.log('\n--- Syncing Sales ---');
          results.sales = await syncSales(supabase, config, userToken, targetYear);
          console.log(`✅ Sales synced: ${results.sales}`);
        } catch (e) {
          console.error('❌ Sales sync failed:', e);
          results.sales = 0;
        }
      }

      if (userToken && (shouldSyncAll || syncType === "client_services" || isQuickMode)) {
        try {
          console.log('\n--- Syncing Client Services (Ownership/Entitlements) ---');
          results.client_services = await syncClientServices(supabase, config, userToken, targetYear);
          console.log(`✅ Client services synced: ${results.client_services}`);
        } catch (e) {
          console.error('❌ Client services sync failed:', e);
          results.client_services = 0;
        }
      }

      if (userToken && (shouldSyncAll || syncType === "transactions")) {
        try {
          console.log('\n--- Syncing Transactions ---');
          results.transactions = await syncTransactions(supabase, config, userToken, targetYear);
          console.log(`✅ Transactions synced: ${results.transactions}`);
        } catch (e) {
          console.error('❌ Transactions sync failed:', e);
          results.transactions = 0;
        }
      }

      if (userToken && (shouldSyncAll || syncType === "client_visits")) {
        try {
          console.log('\n--- Syncing Client Visits ---');
          results.client_visits = await syncClientVisits(supabase, config, userToken);
          console.log(`✅ Client visits synced: ${results.client_visits}`);
        } catch (e) {
          console.error('❌ Client visits sync failed:', e);
          results.client_visits = 0;
        }
      }

      if (userToken && (shouldSyncAll || syncType === "packages")) {
        try {
          console.log('\n--- Syncing Packages ---');
          results.packages = await syncPackages(supabase, config, userToken);
          console.log(`✅ Packages synced: ${results.packages}`);
        } catch (e) {
          console.error('❌ Packages sync failed:', e);
          results.packages = 0;
        }
      }

      if (shouldSyncAll || syncType === "retail_products" || isQuickMode) {
        try {
          console.log('\n--- Syncing Retail Products ---');
          results.retail_products = await syncProducts(supabase, config, userToken || undefined);
          console.log(`✅ Retail products synced: ${results.retail_products}`);
        } catch (e) {
          console.error('❌ Retail products sync failed:', e);
          results.retail_products = 0;
        }
      }

      if (userToken && syncType === "build_pricing_links") {
        try {
          console.log('\n--- Building Pricing ↔ Session Type Links ---');
          results.pricing_links = await buildPricingSessionTypeLinks(supabase, config, userToken);
          console.log(`✅ Pricing links built: ${results.pricing_links}`);
        } catch (e) {
          console.error('❌ Pricing links building failed:', e);
          results.pricing_links = 0;
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
