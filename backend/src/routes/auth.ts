import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db';
import { authenticateToken, requirePermission, JWT_SECRET, AuthenticatedRequest } from '../middleware/auth';
import { UserType } from '../types';

const router = Router();

// Register a new Broker or Carrier Org + Admin account
router.post('/register-org', async (req, res) => {
  const { orgName, orgType, username, password, name } = req.body;

  if (!orgName || !orgType || !username || !password || !name) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (orgType !== 'broker' && orgType !== 'carrier') {
    return res.status(400).json({ error: 'Invalid organization type' });
  }

  try {
    // Check if user already exists
    const existingUser = await db.users.findByUsername(username);
    if (existingUser) {
      return res.status(400).json({ error: 'Username is already taken' });
    }

    // 1. Create Organization
    const org = await db.organizations.create(orgName, orgType);

    // 2. Hash Password
    const passwordHash = await bcrypt.hash(password, 10);

    // 3. Create Admin User
    const userType: UserType = orgType === 'broker' ? 'broker_admin' : 'carrier_admin';
    const user = await db.users.create(username, passwordHash, name, org.id, null, userType);

    // If carrier, bootstrap a default compliance record
    if (orgType === 'carrier') {
      await db.carrierCompliance.createOrUpdate(
        org.id,
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days expiry
        'Active',
        'MC-' + Math.floor(100000 + Math.random() * 900000),
        ['Flatbed', 'Dry Van', 'Reefer'],
        ['General Freight', 'Produce']
      );
    }

    // Create Audit Log for bootstrap
    await db.auditLogs.create(
      null,
      user.id,
      user.username,
      user.type,
      'ORG_REGISTERED',
      `Registered ${orgType} organization "${orgName}" with Admin user "${username}"`
    );

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, username: user.username, org_id: org.id, role_id: null, type: user.type },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.status(201).json({
      token,
      user: { id: user.id, username: user.username, name: user.name, type: user.type, org_id: user.org_id },
      org
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
});

// Register Shipper (no organization, no sub-roles)
router.post('/register-shipper', async (req, res) => {
  const { username, password, name } = req.body;

  if (!username || !password || !name) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const existingUser = await db.users.findByUsername(username);
    if (existingUser) {
      return res.status(400).json({ error: 'Username is already taken' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await db.users.create(username, passwordHash, name, null, null, 'shipper');

    // Create Audit Log
    await db.auditLogs.create(
      null,
      user.id,
      user.username,
      user.type,
      'SHIPPER_REGISTERED',
      `Registered Shipper account "${username}"`
    );

    const token = jwt.sign(
      { id: user.id, username: user.username, org_id: null, role_id: null, type: user.type },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.status(201).json({
      token,
      user: { id: user.id, username: user.username, name: user.name, type: user.type, org_id: null }
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
});

// Create Staff User (Admins or users with staff.manage permission)
router.post('/staff', authenticateToken, requirePermission('staff.manage'), async (req: AuthenticatedRequest, res: Response) => {
  const { username, password, name, roleId } = req.body;
  const adminUser = req.user!;

  if (!username || !password || !name || !roleId) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    // Check username
    const existingUser = await db.users.findByUsername(username);
    if (existingUser) {
      return res.status(400).json({ error: 'Username is already taken' });
    }

    // Verify role exists and is in the same organization
    const role = await db.roles.findById(roleId);
    if (!role || role.org_id !== adminUser.org_id) {
      return res.status(400).json({ error: 'Invalid role selection' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userType: UserType = adminUser.type.startsWith('broker') ? 'broker_staff' : 'carrier_staff';

    // Create User
    const user = await db.users.create(username, passwordHash, name, adminUser.org_id, roleId, userType);

    // Audit Log
    await db.auditLogs.create(
      null,
      adminUser.id,
      adminUser.username,
      adminUser.type,
      'STAFF_CREATED',
      `Created staff member "${username}" with role "${role.name}"`
    );

    return res.status(201).json({
      id: user.id,
      username: user.username,
      name: user.name,
      type: user.type,
      role_id: user.role_id
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
});

// Get all staff members for current organization
router.get('/staff', authenticateToken, requirePermission('staff.manage'), async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  try {
    const staff = await db.users.findByOrgId(user.org_id!);
    // Map response to hide password hashes
    const sanitizedStaff = staff.map((s) => ({
      id: s.id,
      username: s.username,
      name: s.name,
      type: s.type,
      role_id: s.role_id,
      created_at: s.created_at
    }));
    return res.json(sanitizedStaff);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
});

// Login endpoint
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const user = await db.users.findByUsername(username);
    if (!user) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    // Get org if user belongs to one
    let org = null;
    if (user.org_id) {
      org = await db.organizations.findById(user.org_id);
    }

    // Token payload
    const token = jwt.sign(
      { id: user.id, username: user.username, org_id: user.org_id, role_id: user.role_id, type: user.type },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Audit Log for successful login
    await db.auditLogs.create(
      null,
      user.id,
      user.username,
      user.type,
      'LOGIN_SUCCESS',
      `User logged in successfully`
    );

    return res.json({
      token,
      user: { id: user.id, username: user.username, name: user.name, type: user.type, org_id: user.org_id, role_id: user.role_id },
      org
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
});

export default router;
