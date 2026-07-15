import fs from 'fs/promises';
import path from 'path';
import {
  Organization,
  User,
  Role,
  Load,
  RateConfirmation,
  CarrierCompliance,
  AuditLog,
  UserType,
  Permission,
  LoadStatus
} from './types';

const DB_PATH = path.join(__dirname, '..', 'db.json');

interface Schema {
  organizations: Organization[];
  users: User[];
  roles: Role[];
  loads: Load[];
  rateConfirmations: RateConfirmation[];
  carrierCompliances: CarrierCompliance[];
  auditLogs: AuditLog[];
}

let dbCache: Schema | null = null;

// Helper to generate UUID-like IDs
function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

// Read database from file
async function loadDb(): Promise<Schema> {
  if (dbCache) return dbCache;
  try {
    const data = await fs.readFile(DB_PATH, 'utf-8');
    dbCache = JSON.parse(data);
    return dbCache!;
  } catch (error) {
    // If file doesn't exist, initialize default database schema
    const initialDb: Schema = {
      organizations: [],
      users: [],
      roles: [],
      loads: [],
      rateConfirmations: [],
      carrierCompliances: [],
      auditLogs: []
    };
    await saveDb(initialDb);
    dbCache = initialDb;
    return dbCache;
  }
}

// Write database to file (atomic write)
async function saveDb(data: Schema): Promise<void> {
  dbCache = data;
  const tempPath = `${DB_PATH}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tempPath, DB_PATH);
}

export const db = {
  organizations: {
    async create(name: string, type: 'broker' | 'carrier'): Promise<Organization> {
      const schema = await loadDb();
      const newOrg: Organization = {
        id: 'org_' + generateId(),
        name,
        type,
        created_at: new Date().toISOString()
      };
      schema.organizations.push(newOrg);
      await saveDb(schema);
      return newOrg;
    },

    async findById(id: string): Promise<Organization | undefined> {
      const schema = await loadDb();
      return schema.organizations.find((o) => o.id === id);
    },

    async findAll(): Promise<Organization[]> {
      const schema = await loadDb();
      return schema.organizations;
    }
  },

  users: {
    async create(
      username: string,
      passwordHash: string,
      name: string,
      orgId: string | null,
      roleId: string | null,
      type: UserType
    ): Promise<User> {
      const schema = await loadDb();
      const newUser: User = {
        id: 'usr_' + generateId(),
        username: username.toLowerCase().trim(),
        password_hash: passwordHash,
        name,
        org_id: orgId,
        role_id: roleId,
        type,
        created_at: new Date().toISOString()
      };
      schema.users.push(newUser);
      await saveDb(schema);
      return newUser;
    },

    async findById(id: string): Promise<User | undefined> {
      const schema = await loadDb();
      return schema.users.find((u) => u.id === id);
    },

    async findByUsername(username: string): Promise<User | undefined> {
      const schema = await loadDb();
      return schema.users.find((u) => u.username === username.toLowerCase().trim());
    },

    async findByOrgId(orgId: string): Promise<User[]> {
      const schema = await loadDb();
      return schema.users.filter((u) => u.org_id === orgId);
    },

    async update(id: string, updates: Partial<User>): Promise<User | undefined> {
      const schema = await loadDb();
      const idx = schema.users.findIndex((u) => u.id === id);
      if (idx === -1) return undefined;
      schema.users[idx] = { ...schema.users[idx], ...updates };
      await saveDb(schema);
      return schema.users[idx];
    }
  },

  roles: {
    async create(name: string, orgId: string, permissions: Permission[]): Promise<Role> {
      const schema = await loadDb();
      const newRole: Role = {
        id: 'role_' + generateId(),
        name,
        org_id: orgId,
        permissions,
        created_at: new Date().toISOString()
      };
      schema.roles.push(newRole);
      await saveDb(schema);
      return newRole;
    },

    async findById(id: string): Promise<Role | undefined> {
      const schema = await loadDb();
      return schema.roles.find((r) => r.id === id);
    },

    async findByOrgId(orgId: string): Promise<Role[]> {
      const schema = await loadDb();
      return schema.roles.filter((r) => r.org_id === orgId);
    },

    async delete(id: string): Promise<boolean> {
      const schema = await loadDb();
      const initialLength = schema.roles.length;
      schema.roles = schema.roles.filter((r) => r.id !== id);
      if (schema.roles.length === initialLength) return false;
      await saveDb(schema);
      return true;
    }
  },

  loads: {
    async create(
      shipperId: string,
      brokerId: string,
      origin: string,
      destination: string,
      pickupDate: string,
      deliveryDate: string,
      equipmentType: string,
      commodityType: string,
      weight: number,
      notes: string
    ): Promise<Load> {
      const schema = await loadDb();
      const newLoad: Load = {
        id: 'load_' + generateId(),
        shipper_id: shipperId,
        broker_id: brokerId,
        carrier_id: null,
        status: 'Posted',
        origin,
        destination,
        pickup_date: pickupDate,
        delivery_date: deliveryDate,
        equipment_type: equipmentType,
        commodity_type: commodityType,
        weight,
        notes,
        compliance_flagged: 0,
        compliance_notes: '',
        current_rate_version: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      schema.loads.push(newLoad);
      await saveDb(schema);
      return newLoad;
    },

    async findById(id: string): Promise<Load | undefined> {
      const schema = await loadDb();
      return schema.loads.find((l) => l.id === id);
    },

    async findAll(): Promise<Load[]> {
      const schema = await loadDb();
      return schema.loads;
    },

    async findByBrokerId(brokerId: string): Promise<Load[]> {
      const schema = await loadDb();
      return schema.loads.filter((l) => l.broker_id === brokerId);
    },

    async findByCarrierId(carrierId: string): Promise<Load[]> {
      const schema = await loadDb();
      return schema.loads.filter((l) => l.carrier_id === carrierId);
    },

    async findByShipperId(shipperId: string): Promise<Load[]> {
      const schema = await loadDb();
      return schema.loads.filter((l) => l.shipper_id === shipperId);
    },

    async update(id: string, updates: Partial<Load>): Promise<Load | undefined> {
      const schema = await loadDb();
      const idx = schema.loads.findIndex((l) => l.id === id);
      if (idx === -1) return undefined;
      schema.loads[idx] = {
        ...schema.loads[idx],
        ...updates,
        updated_at: new Date().toISOString()
      } as Load;
      await saveDb(schema);
      return schema.loads[idx];
    }
  },

  rateConfirmations: {
    async create(
      loadId: string,
      version: number,
      baseRate: number,
      accessorials: string,
      confirmedByCarrierUserId: string | null = null,
      confirmedByBrokerUserId: string | null = null,
      confirmedAt: string | null = null
    ): Promise<RateConfirmation> {
      const schema = await loadDb();
      const newRate: RateConfirmation = {
        id: 'rate_' + generateId(),
        load_id: loadId,
        version,
        base_rate: baseRate,
        accessorials,
        confirmed_by_carrier_user_id: confirmedByCarrierUserId,
        confirmed_by_broker_user_id: confirmedByBrokerUserId,
        confirmed_at: confirmedAt,
        created_at: new Date().toISOString()
      };
      schema.rateConfirmations.push(newRate);
      await saveDb(schema);
      return newRate;
    },

    async findByLoadId(loadId: string): Promise<RateConfirmation[]> {
      const schema = await loadDb();
      return schema.rateConfirmations.filter((rc) => rc.load_id === loadId);
    },

    async findLatestByLoadId(loadId: string): Promise<RateConfirmation | undefined> {
      const schema = await loadDb();
      const list = schema.rateConfirmations.filter((rc) => rc.load_id === loadId);
      if (list.length === 0) return undefined;
      return list.reduce((prev, current) => (prev.version > current.version ? prev : current));
    },

    async confirmRate(id: string, party: 'broker' | 'carrier', userId: string): Promise<RateConfirmation | undefined> {
      const schema = await loadDb();
      const idx = schema.rateConfirmations.findIndex((rc) => rc.id === id);
      if (idx === -1) return undefined;

      const now = new Date().toISOString();
      if (party === 'broker') {
        schema.rateConfirmations[idx].confirmed_by_broker_user_id = userId;
      } else {
        schema.rateConfirmations[idx].confirmed_by_carrier_user_id = userId;
      }

      // If both confirmed, set general confirmed timestamp
      if (
        schema.rateConfirmations[idx].confirmed_by_broker_user_id &&
        schema.rateConfirmations[idx].confirmed_by_carrier_user_id
      ) {
        schema.rateConfirmations[idx].confirmed_at = now;
      }

      await saveDb(schema);
      return schema.rateConfirmations[idx];
    }
  },

  carrierCompliance: {
    async findByCarrierId(carrierId: string): Promise<CarrierCompliance | undefined> {
      const schema = await loadDb();
      return schema.carrierCompliances.find((cc) => cc.carrier_id === carrierId);
    },

    async createOrUpdate(
      carrierId: string,
      insuranceExpiry: string,
      authorityStatus: 'Active' | 'Inactive',
      mcDotNumber: string,
      approvedEquipmentTypes: string[],
      approvedCommodityTypes: string[]
    ): Promise<CarrierCompliance> {
      const schema = await loadDb();
      const idx = schema.carrierCompliances.findIndex((cc) => cc.carrier_id === carrierId);

      const record: CarrierCompliance = {
        id: idx !== -1 ? schema.carrierCompliances[idx].id : 'comp_' + generateId(),
        carrier_id: carrierId,
        insurance_expiry: insuranceExpiry,
        authority_status: authorityStatus,
        mc_dot_number: mcDotNumber,
        approved_equipment_types: JSON.stringify(approvedEquipmentTypes),
        approved_commodity_types: JSON.stringify(approvedCommodityTypes),
        updated_at: new Date().toISOString()
      };

      if (idx !== -1) {
        schema.carrierCompliances[idx] = record;
      } else {
        schema.carrierCompliances.push(record);
      }

      await saveDb(schema);
      return record;
    }
  },

  auditLogs: {
    async create(
      loadId: string | null,
      userId: string,
      username: string,
      userType: UserType,
      action: string,
      details: string
    ): Promise<AuditLog> {
      const schema = await loadDb();
      const newLog: AuditLog = {
        id: 'log_' + generateId(),
        load_id: loadId,
        user_id: userId,
        username,
        user_type: userType,
        action,
        details,
        timestamp: new Date().toISOString()
      };
      schema.auditLogs.push(newLog);
      await saveDb(schema);
      return newLog;
    },

    async findAll(): Promise<AuditLog[]> {
      const schema = await loadDb();
      return schema.auditLogs.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    },

    async findByLoadId(loadId: string): Promise<AuditLog[]> {
      const schema = await loadDb();
      return schema.auditLogs
        .filter((l) => l.load_id === loadId)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }
  },

  async reset(): Promise<void> {
    dbCache = {
      organizations: [],
      users: [],
      roles: [],
      loads: [],
      rateConfirmations: [],
      carrierCompliances: [],
      auditLogs: []
    };
    await saveDb(dbCache);
  }
};
