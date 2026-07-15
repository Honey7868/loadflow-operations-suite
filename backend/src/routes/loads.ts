import { Router, Response } from 'express';
import { db } from '../db';
import { authenticateToken, requirePermission, AuthenticatedRequest } from '../middleware/auth';
import { evaluateCompliance } from './compliance';
import { LoadStatus, Permission, UserType } from '../types';

const router = Router();

// Helper to check object-level scoping for a load
function checkLoadScope(load: any, user: any): boolean {
  if (user.type === 'shipper') {
    return load.shipper_id === user.id;
  }
  if (user.type.startsWith('broker')) {
    return load.broker_id === user.org_id;
  }
  if (user.type.startsWith('carrier')) {
    // Carrier staff can see posted loads (market board) OR loads assigned to their carrier
    return load.status === 'Posted' || load.carrier_id === user.org_id;
  }
  return false;
}

// 1. Get Load Board (Search, filter, role-scoping, object-level scoping)
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { search, origin, destination, status, equipment } = req.query;

  try {
    let loads = [];
    if (user.type === 'shipper') {
      loads = await db.loads.findByShipperId(user.id);
    } else if (user.type.startsWith('broker')) {
      loads = await db.loads.findByBrokerId(user.org_id!);
    } else if (user.type.startsWith('carrier')) {
      // Get all loads. Later we will filter so they only see Posted loads OR loads assigned to their carrier.
      const allLoads = await db.loads.findAll();
      loads = allLoads.filter((l) => l.status === 'Posted' || l.carrier_id === user.org_id);
    }

    // Apply Search/Filters
    if (search) {
      const q = (search as string).toLowerCase();
      // Fetch shipper names for linkage search
      const shippers = await Promise.all(
        loads.map(async (l) => {
          const shipper = await db.users.findById(l.shipper_id);
          return { id: l.id, shipperName: shipper?.name.toLowerCase() || '' };
        })
      );
      loads = loads.filter((l) => {
        const sName = shippers.find((s) => s.id === l.id)?.shipperName || '';
        return (
          l.id.toLowerCase().includes(q) ||
          sName.includes(q) ||
          l.origin.toLowerCase().includes(q) ||
          l.destination.toLowerCase().includes(q) ||
          l.commodity_type.toLowerCase().includes(q)
        );
      });
    }

    if (origin) {
      loads = loads.filter((l) => l.origin.toLowerCase().includes((origin as string).toLowerCase()));
    }
    if (destination) {
      loads = loads.filter((l) => l.destination.toLowerCase().includes((destination as string).toLowerCase()));
    }
    if (status) {
      loads = loads.filter((l) => l.status === status);
    }
    if (equipment) {
      loads = loads.filter((l) => l.equipment_type === equipment);
    }

    // Add shipper name and carrier name to response
    const richLoads = await Promise.all(
      loads.map(async (l) => {
        const shipper = await db.users.findById(l.shipper_id);
        const carrier = l.carrier_id ? await db.organizations.findById(l.carrier_id) : null;
        const broker = await db.organizations.findById(l.broker_id);
        return {
          ...l,
          shipper_name: shipper?.name || 'Unknown Shipper',
          carrier_name: carrier?.name || 'Unassigned',
          broker_name: broker?.name || 'Unknown Broker'
        };
      })
    );

    return res.json(richLoads);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
});

// 2. Get Single Load + Versioned Rate Confirmations + Audit Trail
router.get('/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  try {
    const load = await db.loads.findById(id);
    if (!load) {
      return res.status(404).json({ error: 'Load not found' });
    }

    // Object level scoping
    if (!checkLoadScope(load, user)) {
      return res.status(403).json({ error: 'Forbidden: You do not have access to this load' });
    }

    // Fetch related entities
    const shipper = await db.users.findById(load.shipper_id);
    const broker = await db.organizations.findById(load.broker_id);
    const carrier = load.carrier_id ? await db.organizations.findById(load.carrier_id) : null;
    const rates = await db.rateConfirmations.findByLoadId(id);
    const auditLogs = await db.auditLogs.findByLoadId(id);

    return res.json({
      load: {
        ...load,
        shipper_name: shipper?.name || 'Unknown Shipper',
        broker_name: broker?.name || 'Unknown Broker',
        carrier_name: carrier?.name || 'Unassigned'
      },
      rates,
      auditLogs
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
});

// 3. Create Load (Broker staff with load.create permission)
router.post('/', authenticateToken, requirePermission('load.create'), async (req: AuthenticatedRequest, res: Response) => {
  const { shipperUsername, origin, destination, pickupDate, deliveryDate, equipmentType, commodityType, weight, notes } = req.body;
  const user = req.user!;

  if (!shipperUsername || !origin || !destination || !pickupDate || !deliveryDate || !equipmentType || !commodityType || !weight) {
    return res.status(400).json({ error: 'All fields (except notes) are required' });
  }

  try {
    // Resolve shipper user
    const shipper = await db.users.findByUsername(shipperUsername);
    if (!shipper || shipper.type !== 'shipper') {
      return res.status(400).json({ error: `Shipper with username "${shipperUsername}" not found.` });
    }

    const load = await db.loads.create(
      shipper.id,
      user.org_id!,
      origin,
      destination,
      pickupDate,
      deliveryDate,
      equipmentType,
      commodityType,
      Number(weight),
      notes || ''
    );

    // Audit log
    await db.auditLogs.create(
      load.id,
      user.id,
      user.username,
      user.type,
      'LOAD_CREATED',
      `Created load. Origin: ${origin}, Destination: ${destination}, Shipper: ${shipper.name}`
    );

    return res.status(201).json(load);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
});

// 4. Assign Carrier & Auto-evaluate Compliance (Broker staff with load.assign_carrier)
router.post('/:id/assign', authenticateToken, requirePermission('load.assign_carrier'), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { carrierId } = req.body;
  const user = req.user!;

  if (!carrierId) {
    return res.status(400).json({ error: 'Carrier ID is required' });
  }

  try {
    const load = await db.loads.findById(id);
    if (!load) {
      return res.status(404).json({ error: 'Load not found' });
    }

    // Scoping check
    if (load.broker_id !== user.org_id) {
      return res.status(403).json({ error: 'Forbidden: Load belongs to another organization' });
    }

    // Ensure load is in appropriate state
    if (load.status !== 'Posted' && load.status !== 'Carrier Assigned') {
      return res.status(400).json({ error: `Cannot assign carrier in "${load.status}" state` });
    }

    // Verify Carrier Org
    const carrier = await db.organizations.findById(carrierId);
    if (!carrier || carrier.type !== 'carrier') {
      return res.status(400).json({ error: 'Selected organization is not a valid carrier' });
    }

    // Auto check carrier compliance record
    const compCheck = await evaluateCompliance(load, carrierId);

    // Update Load
    const updatedLoad = await db.loads.update(id, {
      carrier_id: carrierId,
      status: 'Carrier Assigned',
      compliance_flagged: compCheck.flagged ? 1 : 0,
      compliance_notes: compCheck.flagged ? compCheck.reason : 'Carrier compliance verified successfully.'
    });

    // Audit log
    await db.auditLogs.create(
      id,
      user.id,
      user.username,
      user.type,
      'CARRIER_ASSIGNED',
      `Assigned carrier "${carrier.name}" (${carrierId}). Compliance Status: ${compCheck.flagged ? 'FLAGGED - ' + compCheck.reason : 'VERIFIED'}`
    );

    return res.json(updatedLoad);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
});

// 5. Override Compliance Flag (Broker staff with load.override_compliance_flag)
router.post('/:id/override-compliance', authenticateToken, requirePermission('load.override_compliance_flag'), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { reason } = req.body;
  const user = req.user!;

  if (!reason) {
    return res.status(400).json({ error: 'Override reason is required' });
  }

  try {
    const load = await db.loads.findById(id);
    if (!load) {
      return res.status(404).json({ error: 'Load not found' });
    }

    if (load.broker_id !== user.org_id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (load.compliance_flagged === 0) {
      return res.status(400).json({ error: 'Load is not compliance flagged' });
    }

    const updatedLoad = await db.loads.update(id, {
      compliance_flagged: 0,
      compliance_notes: `Compliance override by ${user.username}. Reason: ${reason}`
    });

    // Audit log
    await db.auditLogs.create(
      id,
      user.id,
      user.username,
      user.type,
      'COMPLIANCE_OVERRIDDEN',
      `Overrode compliance check. Reason: ${reason}`
    );

    return res.json(updatedLoad);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
});

// 6. Propose Rate Confirmation (Broker staff with rate.confirm permission)
router.post('/:id/rate-confirmation', authenticateToken, requirePermission('rate.confirm'), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { baseRate, accessorials } = req.body; // accessorials: object e.g. { fuel: 100, detention: 50 }
  const user = req.user!;

  if (!baseRate) {
    return res.status(400).json({ error: 'Base rate is required' });
  }

  try {
    const load = await db.loads.findById(id);
    if (!load) {
      return res.status(404).json({ error: 'Load not found' });
    }

    if (load.broker_id !== user.org_id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!load.carrier_id) {
      return res.status(400).json({ error: 'Cannot issue rate confirmation without an assigned carrier' });
    }

    const nextVersion = load.current_rate_version + 1;
    const accessorialsStr = JSON.stringify(accessorials || {});

    // Create rate confirmation (signed by Broker)
    const rate = await db.rateConfirmations.create(
      id,
      nextVersion,
      Number(baseRate),
      accessorialsStr,
      null, // not signed by carrier yet
      user.id, // signed by broker
      null
    );

    // Update load's pending rate version
    await db.loads.update(id, {
      current_rate_version: nextVersion
    });

    // Audit log
    await db.auditLogs.create(
      id,
      user.id,
      user.username,
      user.type,
      'RATE_CONFIRMATION_ISSUED',
      `Issued Rate Confirmation version ${nextVersion}. Base Rate: $${baseRate}. Accessorials: ${accessorialsStr}`
    );

    return res.status(201).json(rate);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
});

// 7. Accept/Sign Rate Confirmation (Carrier staff with rate.confirm permission)
router.post('/:id/rate-confirmation/accept', authenticateToken, requirePermission('rate.confirm'), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  try {
    const load = await db.loads.findById(id);
    if (!load) {
      return res.status(404).json({ error: 'Load not found' });
    }

    if (load.carrier_id !== user.org_id) {
      return res.status(403).json({ error: 'Forbidden: This load is not assigned to your carrier' });
    }

    const latestRate = await db.rateConfirmations.findLatestByLoadId(id);
    if (!latestRate) {
      return res.status(400).json({ error: 'No rate confirmation found to sign' });
    }

    if (latestRate.confirmed_by_carrier_user_id) {
      return res.status(400).json({ error: 'Rate confirmation already signed by carrier' });
    }

    // Sign
    const signedRate = await db.rateConfirmations.confirmRate(latestRate.id, 'carrier', user.id);

    // Audit log
    await db.auditLogs.create(
      id,
      user.id,
      user.username,
      user.type,
      'RATE_CONFIRMATION_ACCEPTED',
      `Signed Rate Confirmation version ${latestRate.version}`
    );

    // If compliance is NOT flagged, auto-promote to "Rate Confirmed" state!
    if (load.status === 'Carrier Assigned' && load.compliance_flagged === 0) {
      await db.loads.update(id, { status: 'Rate Confirmed' });
      await db.auditLogs.create(
        id,
        'system',
        'System',
        'broker_admin',
        'STATUS_CHANGE',
        'Auto-promoted state from Carrier Assigned to Rate Confirmed after both parties signed rate agreement.'
      );
    }

    return res.json(signedRate);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
});

// 8. Update Load Status (Blocks progression past Carrier Assigned if compliance is flagged)
router.post('/:id/status', authenticateToken, requirePermission('load.update_status'), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { status, podUrl } = req.body;
  const user = req.user!;

  if (!status) {
    return res.status(400).json({ error: 'Status is required' });
  }

  const validStatuses: LoadStatus[] = [
    'Posted',
    'Carrier Assigned',
    'Rate Confirmed',
    'Dispatched',
    'In Transit',
    'Delivered',
    'POD Verified',
    'Invoiced/Closed'
  ];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status type' });
  }

  try {
    const load = await db.loads.findById(id);
    if (!load) {
      return res.status(404).json({ error: 'Load not found' });
    }

    // Scoping check
    if (!checkLoadScope(load, user)) {
      return res.status(403).json({ error: 'Forbidden: No permission to modify this load' });
    }

    // COMPLIANCE BLOCK: Blocks progression past "Carrier Assigned" if flagged
    const currentStatusIdx = validStatuses.indexOf(load.status);
    const newStatusIdx = validStatuses.indexOf(status);

    if (currentStatusIdx <= 1 && newStatusIdx > 1) {
      // Attempting to move past Carrier Assigned
      if (load.compliance_flagged === 1) {
        // Block
        const errMsg = 'COMPLIANCE BLOCK: Cannot advance load state because carrier compliance is FLAGGED. Resolve expired credentials or have a Broker override the flag.';
        await db.auditLogs.create(
          id,
          user.id,
          user.username,
          user.type,
          'COMPLIANCE_BLOCKED',
          `Attempted status transition from "${load.status}" to "${status}" but was blocked by compliance flag.`
        );
        return res.status(400).json({ error: errMsg });
      }

      // Check if Rate Confirmation is fully signed!
      const rate = await db.rateConfirmations.findLatestByLoadId(id);
      if (!rate || !rate.confirmed_at) {
        return res.status(400).json({
          error: 'RATE CONTRACT REQUIRED: Both broker and carrier must sign the Rate Confirmation before load status can advance.'
        });
      }
    }

    // POD Upload Check
    if (status === 'Delivered') {
      if (user.type.startsWith('carrier')) {
        // Carrier is marking delivered: check pod.upload permission
        const hasPodPermission = user.type === 'carrier_admin' || (user.role_id && (await db.roles.findById(user.role_id))?.permissions.includes('pod.upload'));
        if (!hasPodPermission) {
          return res.status(403).json({ error: 'Forbidden: Missing "pod.upload" permission' });
        }
      }
    }

    // Perform Update
    const updates: Partial<Load> = { status };
    let auditMsg = `Changed load status from "${load.status}" to "${status}"`;

    if (status === 'Delivered' && podUrl) {
      updates.notes = (load.notes ? load.notes + '\n' : '') + `[POD UPLOADED]: ${podUrl}`;
      auditMsg += `. POD attached: ${podUrl}`;
    }

    const updatedLoad = await db.loads.update(id, updates);

    // Audit log
    await db.auditLogs.create(id, user.id, user.username, user.type, 'STATUS_CHANGE', auditMsg);

    return res.json(updatedLoad);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
});

// 9. POD File Upload Mock (Carrier staff with pod.upload permission)
router.post('/:id/pod-upload', authenticateToken, requirePermission('pod.upload'), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { fileName } = req.body;
  const user = req.user!;

  if (!fileName) {
    return res.status(400).json({ error: 'File name is required' });
  }

  try {
    const load = await db.loads.findById(id);
    if (!load) {
      return res.status(404).json({ error: 'Load not found' });
    }

    if (load.carrier_id !== user.org_id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const podMockUrl = `/uploads/pod_${id}_${Date.now()}_${fileName}`;

    // Mark as delivered and attach POD
    const updatedLoad = await db.loads.update(id, {
      status: 'Delivered',
      notes: (load.notes ? load.notes + '\n' : '') + `[POD UPLOADED]: ${podMockUrl}`
    });

    await db.auditLogs.create(
      id,
      user.id,
      user.username,
      user.type,
      'POD_UPLOADED',
      `Uploaded POD file: ${fileName}. State updated to Delivered.`
    );

    return res.json({ load: updatedLoad, podUrl: podMockUrl });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
});

export default router;
