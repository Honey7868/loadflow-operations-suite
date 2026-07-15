import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db';
import { Permission, UserType } from '../types';

export const JWT_SECRET = process.env.JWT_SECRET || 'loadflow_super_secret_hackathon_key';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    org_id: string | null;
    role_id: string | null;
    type: UserType;
  };
}

// Log permission violations to console and database
async function logPermissionDenied(req: AuthenticatedRequest, reason: string, requiredPermission?: string) {
  const userId = req.user?.id || 'anonymous';
  const username = req.user?.username || 'anonymous';
  const userType = req.user?.type || ('anonymous' as UserType);
  const path = req.originalUrl || req.url;
  const method = req.method;

  const logMessage = `[SECURITY WARNING] Permission Denied: User "${username}" (${userType}) attempted ${method} ${path}. Reason: ${reason}. Required Permission: ${requiredPermission || 'None'}`;
  console.warn(logMessage);

  // Write to DB Audit Log
  try {
    await db.auditLogs.create(
      null,
      userId,
      username,
      userType,
      'PERMISSION_DENIED',
      JSON.stringify({
        path,
        method,
        reason,
        requiredPermission
      })
    );
  } catch (err) {
    console.error('Failed to write security log to DB:', err);
  }
}

// Authenticate JWT token
export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = decoded as any;
    next();
  });
}

// Check permissions (RBAC)
export function requirePermission(permission: Permission) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id, type, role_id, org_id } = req.user;

    // 1. Admins have all permissions for their respective org scope
    if (type === 'broker_admin') {
      // Broker admins have all broker permissions
      const brokerPermissions: Permission[] = [
        'load.create',
        'load.assign_carrier',
        'load.override_compliance_flag',
        'rate.confirm',
        'load.update_status',
        'staff.manage'
      ];
      if (brokerPermissions.includes(permission)) {
        return next();
      }
    }

    if (type === 'carrier_admin') {
      // Carrier admins have all carrier permissions
      const carrierPermissions: Permission[] = [
        'rate.confirm',
        'load.update_status',
        'staff.manage',
        'pod.upload'
      ];
      if (carrierPermissions.includes(permission)) {
        return next();
      }
    }

    // 2. Staff roles check
    if (type === 'broker_staff' || type === 'carrier_staff') {
      if (role_id) {
        const role = await db.roles.findById(role_id);
        if (role && role.permissions.includes(permission)) {
          // Double check org scoping matches
          if (role.org_id === org_id) {
            return next();
          }
        }
      }
    }

    // If we reach here, access is denied
    const reason = `Missing required permission: ${permission}`;
    await logPermissionDenied(req, reason, permission);
    return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
  };
}

// Scoping helper: Ensure Broker user can only access their Broker Org
export function requireBrokerOrg(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || (req.user.type !== 'broker_admin' && req.user.type !== 'broker_staff')) {
    logPermissionDenied(req, 'Must be a broker account to access this endpoint');
    return res.status(403).json({ error: 'Forbidden: Broker access only' });
  }
  next();
}

// Scoping helper: Ensure Carrier user can only access their Carrier Org
export function requireCarrierOrg(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || (req.user.type !== 'carrier_admin' && req.user.type !== 'carrier_staff')) {
    logPermissionDenied(req, 'Must be a carrier account to access this endpoint');
    return res.status(403).json({ error: 'Forbidden: Carrier access only' });
  }
  next();
}
