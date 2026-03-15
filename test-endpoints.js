// Script to test available Mindbody API endpoints
// Run with: node test-endpoints.js

import { readFileSync } from 'fs';

const MINDBODY_BASE_URL = 'https://api.mindbodyonline.com/public/v6';

// Read .env file
const envFile = readFileSync('.env', 'utf-8');
const envVars = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    envVars[match[1]] = match[2];
  }
});

const config = {
  apiKey: envVars.MINDBODY_API_KEY,
  siteId: envVars.MINDBODY_SITE_ID,
  username: envVars.MINDBODY_USERNAME,
  password: envVars.MINDBODY_PASSWORD,
};

async function getUserToken() {
  const url = `${MINDBODY_BASE_URL}/usertoken/issue`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Api-Key': config.apiKey,
      'SiteId': config.siteId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      Username: config.username,
      Password: config.password,
    }),
  });

  const data = await response.json();
  return data.AccessToken;
}

// List of all known Public API v6 endpoints from Mindbody documentation
const endpoints = {
  // SITE endpoints (usually public - source credentials only)
  site: [
    '/site/activationsessions',
    '/site/countries',
    '/site/genders',
    '/site/locations',
    '/site/memberships',
    '/site/programs',
    '/site/products',
    '/site/relationships',
    '/site/resources',
    '/site/services',
    '/site/sessiontypes',
    '/site/sites',
  ],

  // APPOINTMENT endpoints (usually require user token)
  appointment: [
    '/appointment/activeappointments',
    '/appointment/appointments',
    '/appointment/bookableappts',
    '/appointment/staffappointments',
  ],

  // CLASS endpoints (mixed - some public, some protected)
  class: [
    '/class/classdescriptions',
    '/class/classes',
    '/class/classschedules',
    '/class/classvisits',
    '/class/waitlistentries',
  ],

  // CLIENT endpoints (require user token)
  client: [
    '/client/activecontractsmembers',
    '/client/clients',
    '/client/clientcontracts',
    '/client/clientindexes',
    '/client/clientpurchases',
    '/client/clientreferraltypes',
    '/client/clientvisits',
    '/client/contacts',
    '/client/crossregionalclientassociations',
    '/client/customclientfields',
    '/client/requiredclientfields',
  ],

  // ENROLLMENT endpoints (require user token)
  enrollment: [
    '/enrollment/enrollments',
  ],

  // SALE endpoints (require user token)
  sale: [
    '/sale/contracts',
    '/sale/sales',
    '/sale/transactions',
  ],

  // STAFF endpoints (usually public)
  staff: [
    '/staff/staff',
    '/staff/staffpermissions',
  ],

  // PAYROLL endpoints (require special permissions)
  payroll: [
    '/payroll/tips',
  ],
};

async function testEndpoint(endpoint, useAuth = false, userToken = null) {
  const url = `${MINDBODY_BASE_URL}${endpoint}?limit=1`;

  const headers = {
    'Api-Key': config.apiKey,
    'SiteId': config.siteId,
    'Content-Type': 'application/json',
  };

  if (useAuth && userToken) {
    headers['Authorization'] = `Bearer ${userToken}`;
  }

  try {
    const response = await fetch(url, { headers });
    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    return {
      endpoint,
      status: response.status,
      ok: response.ok,
      hasData: data && typeof data === 'object' && Object.keys(data).length > 0,
      dataKeys: data && typeof data === 'object' ? Object.keys(data) : [],
    };
  } catch (error) {
    return {
      endpoint,
      status: 'ERROR',
      error: error.message,
    };
  }
}

async function main() {
  console.log('🔑 Getting user token...');
  const userToken = await getUserToken();
  console.log('✅ User token obtained\n');

  console.log('=' .repeat(80));
  console.log('TESTING MINDBODY API ENDPOINTS');
  console.log('=' .repeat(80));
  console.log('');

  for (const [category, endpointList] of Object.entries(endpoints)) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📁 ${category.toUpperCase()} ENDPOINTS`);
    console.log('='.repeat(80));

    // Test without auth first
    console.log('\n--- Without User Token (Source Credentials Only) ---');
    for (const endpoint of endpointList) {
      const result = await testEndpoint(endpoint, false, null);
      const icon = result.ok ? '✅' : '❌';
      console.log(`${icon} ${endpoint}`);
      console.log(`   Status: ${result.status}`);
      if (result.dataKeys && result.dataKeys.length > 0) {
        console.log(`   Keys: ${result.dataKeys.join(', ')}`);
      }
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    }

    // Test with auth
    console.log('\n--- With User Token ---');
    for (const endpoint of endpointList) {
      const result = await testEndpoint(endpoint, true, userToken);
      const icon = result.ok ? '✅' : '❌';
      console.log(`${icon} ${endpoint}`);
      console.log(`   Status: ${result.status}`);
      if (result.dataKeys && result.dataKeys.length > 0) {
        console.log(`   Keys: ${result.dataKeys.join(', ')}`);
      }
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    }

    console.log('');
  }

  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log('Check the results above to see which endpoints work.');
  console.log('✅ = Working (200 OK)');
  console.log('❌ = Not working (404, 401, etc.)');
}

main().catch(console.error);
