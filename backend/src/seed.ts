import bcrypt from 'bcryptjs';
import { db } from './db';

export async function bootstrapDb(force = false) {
  try {
    const existingUsers = await db.users.findByUsername('broker_admin');
    if (existingUsers && !force) {
      console.log('Database already bootstrapped.');
      return;
    }

    console.log('Seeding LoadFlow database...');

    // If force is true, we should clear the caches/files or reset them.
    // In our db.ts, we can just edit the schema.
    // For simplicity, if force is true, we can clear the database arrays.
    if (force) {
      (db.users as any)._clear = true; // custom trigger or handle inside db.ts if needed
      // Let's write a simpler way: just reset the database file
      // Actually, since db.ts maintains cache, let's just reset the JSON fields:
      const schema = {
        organizations: [],
        users: [],
        roles: [],
        loads: [],
        rateConfirmations: [],
        carrierCompliances: [],
        auditLogs: []
      };
      // We will access loadDb / saveDb. Let's do it by importing db and resetting.
      // But we can also just overwrite db.json since it's a file!
      // In db.ts, let's add a reset method, or we can just empty the DB arrays.
    }

    // 1. Create Broker Organization
    const brokerOrg = await db.organizations.create('Apex Logistics (Broker)', 'broker');
    const pwdHash = await bcrypt.hash('password', 10);
    // Create Broker Admin
    const brokerAdmin = await db.users.create('broker_admin', pwdHash, 'Sarah Miller (Broker Admin)', brokerOrg.id, null, 'broker_admin');

    // Create custom Broker Roles
    const dispatcherRole = await db.roles.create('Dispatcher', brokerOrg.id, [
      'load.assign_carrier',
      'rate.confirm',
      'load.update_status'
    ]);
    const opsLeadRole = await db.roles.create('Ops Lead', brokerOrg.id, [
      'load.create',
      'load.assign_carrier',
      'load.override_compliance_flag',
      'rate.confirm',
      'load.update_status',
      'staff.manage'
    ]);

    // Create Broker Staff
    await db.users.create('broker_dispatch', pwdHash, 'Mike Jones (Dispatcher)', brokerOrg.id, dispatcherRole.id, 'broker_staff');
    await db.users.create('broker_ops', pwdHash, 'Dan Brown (Ops Lead)', brokerOrg.id, opsLeadRole.id, 'broker_staff');

    // 2. Create Carrier Organization
    const carrierOrg = await db.organizations.create('Titan Freight (Carrier)', 'carrier');
    // Create Carrier Admin
    const carrierAdmin = await db.users.create('carrier_admin', pwdHash, 'David Clark (Carrier Admin)', carrierOrg.id, null, 'carrier_admin');

    // Create Carrier Compliance (Active, Valid)
    await db.carrierCompliance.createOrUpdate(
      carrierOrg.id,
      new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 60 days expiry
      'Active',
      'MC-749204',
      ['Flatbed', 'Dry Van', 'Reefer'],
      ['General Freight', 'Steel', 'Produce']
    );

    // Create custom Carrier Roles
    const driverRole = await db.roles.create('Driver', carrierOrg.id, [
      'load.update_status',
      'pod.upload'
    ]);
    const carrierDispatchRole = await db.roles.create('Carrier Dispatcher', carrierOrg.id, [
      'rate.confirm',
      'load.update_status',
      'pod.upload'
    ]);

    // Create Carrier Staff
    await db.users.create('carrier_driver', pwdHash, 'John Doe (Driver)', carrierOrg.id, driverRole.id, 'carrier_staff');
    await db.users.create('carrier_dispatch', pwdHash, 'Alice Smith (Carrier Dispatch)', carrierOrg.id, carrierDispatchRole.id, 'carrier_staff');

    // 3. Create Shipper (individual, no org)
    const shipper = await db.users.create('shipper_acme', pwdHash, 'ACME Manufacturing (Shipper)', null, null, 'shipper');
    const shipper2 = await db.users.create('shipper_walmart', pwdHash, 'Retail Giant Corp (Shipper)', null, null, 'shipper');

    // 4. Create initial Loads
    const load1 = await db.loads.create(
      shipper.id,
      brokerOrg.id,
      'Chicago, IL',
      'Dallas, TX',
      new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      'Dry Van',
      'General Freight',
      42000,
      'Fragile items. Handle with care.'
    );

    const load2 = await db.loads.create(
      shipper2.id,
      brokerOrg.id,
      'Los Angeles, CA',
      'Seattle, WA',
      new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      'Reefer',
      'Produce',
      38000,
      'Keep refrigerated at 34F.'
    );

    // Audit logs
    await db.auditLogs.create(null, 'system', 'System', 'broker_admin', 'BOOTSTRAP', 'Database initialized and seeded.');
    await db.auditLogs.create(load1.id, 'system', 'System', 'broker_admin', 'LOAD_CREATED', 'Seed load 1 created.');
    await db.auditLogs.create(load2.id, 'system', 'System', 'broker_admin', 'LOAD_CREATED', 'Seed load 2 created.');

    console.log('Seeding finished.');
  } catch (error) {
    console.error('Error during database bootstrap:', error);
  }
}
