export type OrgType = 'broker' | 'carrier';

export interface Organization {
  id: string;
  name: string;
  type: OrgType;
  created_at: string;
}

export type UserType = 'broker_admin' | 'broker_staff' | 'carrier_admin' | 'carrier_staff' | 'shipper';

export interface User {
  id: string;
  username: string;
  password_hash: string;
  name: string;
  org_id: string | null; // null for shippers
  role_id: string | null; // null for shippers and org admins (admins have all permissions)
  type: UserType;
  created_at: string;
}

export type Permission =
  | 'load.create'
  | 'load.assign_carrier'
  | 'load.override_compliance_flag'
  | 'rate.confirm'
  | 'load.update_status'
  | 'staff.manage'
  | 'pod.upload';

export interface Role {
  id: string;
  name: string;
  org_id: string; // scoped to specific organization
  permissions: Permission[];
  created_at: string;
}

export type LoadStatus =
  | 'Posted'
  | 'Carrier Assigned'
  | 'Rate Confirmed'
  | 'Dispatched'
  | 'In Transit'
  | 'Delivered'
  | 'POD Verified'
  | 'Invoiced/Closed';

export interface Load {
  id: string;
  shipper_id: string; // User ID of shipper
  broker_id: string; // Org ID of broker
  carrier_id: string | null; // Org ID of carrier (null if not assigned yet)
  status: LoadStatus;
  origin: string;
  destination: string;
  pickup_date: string;
  delivery_date: string;
  equipment_type: string;
  commodity_type: string;
  weight: number;
  notes: string;
  compliance_flagged: 0 | 1; // SQLite uses 0/1 for booleans
  compliance_notes: string;
  current_rate_version: number;
  created_at: string;
  updated_at: string;
}

export interface RateConfirmation {
  id: string;
  load_id: string;
  version: number;
  base_rate: number;
  accessorials: string; // JSON string of accessorials (e.g. {"fuel": 100, "tarp": 50})
  confirmed_by_carrier_user_id: string | null;
  confirmed_by_broker_user_id: string | null;
  confirmed_at: string | null;
  created_at: string;
}

export interface CarrierCompliance {
  id: string;
  carrier_id: string; // Org ID
  insurance_expiry: string; // YYYY-MM-DD
  authority_status: 'Active' | 'Inactive';
  mc_dot_number: string;
  approved_equipment_types: string; // JSON string of equipment types (e.g. ["Flatbed", "Dry Van"])
  approved_commodity_types: string; // JSON string of commodity types (e.g. ["Produce", "Steel"])
  updated_at: string;
}

export interface AuditLog {
  id: string;
  load_id: string | null;
  user_id: string;
  username: string;
  user_type: UserType;
  action: string;
  details: string; // JSON or descriptive text
  timestamp: string;
}
