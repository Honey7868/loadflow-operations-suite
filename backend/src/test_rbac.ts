import express from 'express';
import cors from 'cors';
import { db } from './db';
import { bootstrapDb } from './seed';
import authRoutes from './routes/auth';
import rolesRoutes from './routes/roles';
import loadsRoutes from './routes/loads';
import complianceRoutes from './routes/compliance';
import auditRoutes from './routes/audit';
import http from 'http';

// Create a test server instance
const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/loads', loadsRoutes);
app.use('/api/compliance', complianceRoutes);
app.use('/api/audit-logs', auditRoutes);

const TEST_PORT = 5099;
const BASE_URL = `http://localhost:${TEST_PORT}/api`;

let server: http.Server;

function startServer(): Promise<void> {
  return new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`Test server started on port ${TEST_PORT}`);
      resolve();
    });
  });
}

function stopServer() {
  server.close(() => {
    console.log('Test server stopped.');
  });
}

// Helper to make API requests
async function request(path: string, options: { method?: string; body?: any; token?: string } = {}) {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : await response.text();

  return {
    status: response.status,
    data
  };
}

async function runTests() {
  console.log('=== STARTING RBAC & INTEGRATION TESTS ===');
  await db.reset();
  await bootstrapDb(true);
  await startServer();

  try {
    let tokens = {
      brokerAdmin: '',
      brokerDispatch: '',
      carrierAdmin: '',
      carrierDriver: '',
      shipperAcme: '',
      shipperWalmart: ''
    };

    // 1. Log in all seed users
    const usersToLogin = [
      { key: 'brokerAdmin', user: 'broker_admin' },
      { key: 'brokerDispatch', user: 'broker_dispatch' },
      { key: 'carrierAdmin', user: 'carrier_admin' },
      { key: 'carrierDriver', user: 'carrier_driver' },
      { key: 'shipperAcme', user: 'shipper_acme' },
      { key: 'shipperWalmart', user: 'shipper_walmart' }
    ];

    for (const item of usersToLogin) {
      const res = await request('/auth/login', {
        method: 'POST',
        body: { username: item.user, password: 'password' }
      });
      if (res.status !== 200) {
        throw new Error(`Failed to log in as ${item.user}: ${JSON.stringify(res.data)}`);
      }
      (tokens as any)[item.key] = res.data.token;
    }
    console.log('✔ All test users authenticated successfully.');

    // 2. Test: Broker Dispatch attempts to create a load (Should fail: lacks load.create permission)
    console.log('Testing: Broker Dispatch load creation (should be blocked)');
    const resCreateFail = await request('/loads', {
      method: 'POST',
      token: tokens.brokerDispatch,
      body: {
        shipperUsername: 'shipper_acme',
        origin: 'Detroit, MI',
        destination: 'Chicago, IL',
        pickupDate: '2026-07-20',
        deliveryDate: '2026-07-22',
        equipmentType: 'Dry Van',
        commodityType: 'General Freight',
        weight: 40000
      }
    });
    if (resCreateFail.status !== 403) {
      throw new Error(`RBAC FAIL: Broker Dispatch should have been blocked (403), got ${resCreateFail.status}`);
    }
    console.log('✔ Correctly blocked Broker Dispatch load creation (403).');

    // 3. Test: Broker Admin creates a load (Should succeed)
    console.log('Testing: Broker Admin load creation (should succeed)');
    const resCreateSuccess = await request('/loads', {
      method: 'POST',
      token: tokens.brokerAdmin,
      body: {
        shipperUsername: 'shipper_acme',
        origin: 'Detroit, MI',
        destination: 'Chicago, IL',
        pickupDate: '2026-07-20',
        deliveryDate: '2026-07-22',
        equipmentType: 'Dry Van',
        commodityType: 'General Freight',
        weight: 40000,
        notes: 'Integration test load.'
      }
    });
    if (resCreateSuccess.status !== 201) {
      throw new Error(`FAIL: Broker Admin load creation failed with status ${resCreateSuccess.status}: ${JSON.stringify(resCreateSuccess.data)}`);
    }
    const loadId = resCreateSuccess.data.id;
    console.log(`✔ Broker Admin successfully created load ${loadId} (201).`);

    // 4. Test: Object scoping check on Shippers
    // Shipper Acme should be able to view their own load
    console.log('Testing: Shipper Acme viewing their own load (should succeed)');
    const resShipperAcmeView = await request(`/loads/${loadId}`, {
      token: tokens.shipperAcme
    });
    if (resShipperAcmeView.status !== 200) {
      throw new Error(`FAIL: Shipper Acme could not view own load, got status ${resShipperAcmeView.status}`);
    }
    console.log('✔ Shipper Acme successfully viewed their own load (200).');

    // Shipper Walmart should be blocked from viewing Shipper Acme's load
    console.log("Testing: Shipper Walmart viewing Shipper Acme's load (should be blocked)");
    const resShipperWalmartView = await request(`/loads/${loadId}`, {
      token: tokens.shipperWalmart
    });
    if (resShipperWalmartView.status !== 403) {
      throw new Error(`RBAC FAIL: Shipper Walmart should have been blocked (403), got ${resShipperWalmartView.status}`);
    }
    console.log("✔ Correctly blocked Shipper Walmart from viewing Shipper Acme's load (403).");

    // 5. Test: Carrier Assignment & Compliance evaluation
    // Let's resolve the Carrier Org ID first (Titan Freight)
    const carrierRes = await request('/auth/login', {
      method: 'POST',
      body: { username: 'carrier_admin', password: 'password' }
    });
    const carrierId = carrierRes.data.org.id;

    console.log(`Testing: Assigning carrier "${carrierId}" to load`);
    const resAssign = await request(`/loads/${loadId}/assign`, {
      method: 'POST',
      token: tokens.brokerDispatch,
      body: { carrierId }
    });
    if (resAssign.status !== 200) {
      throw new Error(`FAIL: Carrier assignment failed: ${JSON.stringify(resAssign.data)}`);
    }
    if (resAssign.data.compliance_flagged !== 0) {
      throw new Error('FAIL: Carrier should be compliant with Dry Van/General Freight.');
    }
    console.log('✔ Carrier assigned successfully, compliance verified (no flags).');

    // 6. Test: Block Status progression if Rate Confirmation is not signed
    console.log('Testing: Advancing load status to Dispatched without signed Rate Confirmation (should be blocked)');
    const resStatusFail = await request(`/loads/${loadId}/status`, {
      method: 'POST',
      token: tokens.brokerDispatch,
      body: { status: 'Dispatched' }
    });
    if (resStatusFail.status !== 400) {
      throw new Error(`FAIL: Should have blocked status advancement without signed rate contract, got ${resStatusFail.status}`);
    }
    console.log('✔ Correctly blocked status advancement. Message: ', resStatusFail.data.error);

    // 7. Test: Create and sign Rate Confirmation
    console.log('Testing: Proposing rate confirmation');
    const resRateProp = await request(`/loads/${loadId}/rate-confirmation`, {
      method: 'POST',
      token: tokens.brokerDispatch,
      body: {
        baseRate: 1500,
        accessorials: { fuel: 120 }
      }
    });
    if (resRateProp.status !== 201) {
      throw new Error(`FAIL: Rate proposal failed: ${JSON.stringify(resRateProp.data)}`);
    }
    console.log('✔ Rate confirmation proposed successfully.');

    console.log('Testing: Carrier accepting/signing rate confirmation');
    const resRateAccept = await request(`/loads/${loadId}/rate-confirmation/accept`, {
      method: 'POST',
      token: tokens.carrierAdmin
    });
    if (resRateAccept.status !== 200) {
      throw new Error(`FAIL: Carrier rate acceptance failed: ${JSON.stringify(resRateAccept.data)}`);
    }
    console.log('✔ Carrier signed rate confirmation successfully.');

    // Verify auto-promotion to 'Rate Confirmed'
    const resLoadCheck = await request(`/loads/${loadId}`, {
      token: tokens.brokerDispatch
    });
    if (resLoadCheck.data.load.status !== 'Rate Confirmed') {
      throw new Error(`FAIL: Load should have auto-promoted to "Rate Confirmed", got "${resLoadCheck.data.load.status}"`);
    }
    console.log('✔ Load state auto-promoted to "Rate Confirmed".');

    // 8. Test: Dispatch load (Carrier Driver updates status)
    console.log('Testing: Carrier Driver updates status to Dispatched');
    const resDispatch = await request(`/loads/${loadId}/status`, {
      method: 'POST',
      token: tokens.carrierDriver,
      body: { status: 'Dispatched' }
    });
    if (resDispatch.status !== 200) {
      throw new Error(`FAIL: Driver dispatch update failed: ${JSON.stringify(resDispatch.data)}`);
    }
    console.log('✔ Load status successfully updated to Dispatched.');

    // 9. Test: Carrier Driver uploads POD and marks Delivered
    console.log('Testing: Carrier Driver uploads POD');
    const resPod = await request(`/loads/${loadId}/pod-upload`, {
      method: 'POST',
      token: tokens.carrierDriver,
      body: { fileName: 'signed_bol.pdf' }
    });
    if (resPod.status !== 200) {
      throw new Error(`FAIL: POD upload failed: ${JSON.stringify(resPod.data)}`);
    }
    if (resPod.data.load.status !== 'Delivered') {
      throw new Error(`FAIL: Status should be Delivered after POD upload, got "${resPod.data.load.status}"`);
    }
    console.log('✔ POD uploaded successfully. Load status is now Delivered.');

    // 10. Verify Security Violations are logged
    console.log('Testing: Fetching audit logs to verify security violation logs');
    const auditRes = await request('/audit-logs', {
      token: tokens.brokerAdmin
    });
    const deniedLogs = auditRes.data.filter((l: any) => l.action === 'PERMISSION_DENIED');
    if (deniedLogs.length === 0) {
      throw new Error('FAIL: No security violation audit log was written for the blocked attempts.');
    }
    console.log(`✔ Verified ${deniedLogs.length} security/permission denials were correctly logged to audit trail.`);

    console.log('\n=============================================');
    console.log('ALL TESTS PASSED SUCCESSFULLY! 💯');
    console.log('=============================================');
    stopServer();
    process.exit(0);
  } catch (err: any) {
    console.error('\n❌ INTEGRATION TESTS FAILED:');
    console.error(err.message || err);
    stopServer();
    process.exit(1);
  }
}

runTests();
