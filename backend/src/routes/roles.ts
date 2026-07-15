import { Router, Response } from 'express';
import { db } from '../db';
import { authenticateToken, requirePermission, AuthenticatedRequest } from '../middleware/auth';
import { Permission } from '../types';

const router = Router();

// Create a custom role with a list of permissions
router.post('/', authenticateToken, requirePermission('staff.manage'), async (req: AuthenticatedRequest, res: Response) => {
  const { name, permissions } = req.body;
  const user = req.user!;

  if (!name || !permissions || !Array.isArray(permissions)) {
    return res.status(400).json({ error: 'Name and permissions (array) are required' });
  }

  // Validate permissions are in the allowed catalog
  const catalog: Permission[] = [
    'load.create',
    'load.assign_carrier',
    'load.override_compliance_flag',
    'rate.confirm',
    'load.update_status',
    'staff.manage',
    'pod.upload'
  ];

  const invalidPermissions = permissions.filter((p) => !catalog.includes(p));
  if (invalidPermissions.length > 0) {
    return res.status(400).json({ error: `Invalid permissions: ${invalidPermissions.join(', ')}` });
  }

  try {
    const role = await db.roles.create(name, user.org_id!, permissions);

    // Audit log
    await db.auditLogs.create(
      null,
      user.id,
      user.username,
      user.type,
      'ROLE_CREATED',
      `Created custom role "${name}" with permissions: [${permissions.join(', ')}]`
    );

    return res.status(201).json(role);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
});

// Get all custom roles in the current organization
router.get('/', authenticateToken, requirePermission('staff.manage'), async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  try {
    const roles = await db.roles.findByOrgId(user.org_id!);
    return res.json(roles);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
});

// Delete a custom role
router.delete('/:id', authenticateToken, requirePermission('staff.manage'), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  try {
    const role = await db.roles.findById(id);
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

    // Security check: must belong to the same organization
    if (role.org_id !== user.org_id) {
      return res.status(403).json({ error: 'Forbidden: Cannot delete roles in another organization' });
    }

    const success = await db.roles.delete(id);
    if (success) {
      // Audit log
      await db.auditLogs.create(
        null,
        user.id,
        user.username,
        user.type,
        'ROLE_DELETED',
        `Deleted custom role "${role.name}" (${id})`
      );
      return res.json({ message: 'Role deleted successfully' });
    } else {
      return res.status(500).json({ error: 'Failed to delete role' });
    }
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
});

export default router;
