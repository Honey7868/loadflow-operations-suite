import { Router, Response } from 'express';
import { db } from '../db';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { CarrierCompliance, Load } from '../types';

const router = Router();

// Evaluate compliance for a specific load and carrier
export async function evaluateCompliance(load: Load, carrierId: string): Promise<{ flagged: boolean; reason: string }> {
  const compliance = await db.carrierCompliance.findByCarrierId(carrierId);
  if (!compliance) {
    return { flagged: true, reason: 'No compliance record found for assigned carrier.' };
  }

  const reasons: string[] = [];

  // Check insurance expiry
  const today = new Date().toISOString().split('T')[0];
  if (compliance.insurance_expiry < today) {
    reasons.push(`Insurance expired on ${compliance.insurance_expiry}.`);
  }

  // Check authority status
  if (compliance.authority_status !== 'Active') {
    reasons.push('Authority status is Inactive.');
  }

  // Check equipment type compatibility
  let approvedEquip: string[] = [];
  try {
    approvedEquip = JSON.parse(compliance.approved_equipment_types);
  } catch (e) {
    approvedEquip = [];
  }

  if (!approvedEquip.includes(load.equipment_type)) {
    reasons.push(`Carrier unauthorized for equipment type "${load.equipment_type}".`);
  }

  // Check commodity type compatibility
  let approvedCommodities: string[] = [];
  try {
    approvedCommodities = JSON.parse(compliance.approved_commodity_types);
  } catch (e) {
    approvedCommodities = [];
  }

  if (!approvedCommodities.includes(load.commodity_type)) {
    reasons.push(`Carrier unauthorized for commodity type "${load.commodity_type}".`);
  }

  return {
    flagged: reasons.length > 0,
    reason: reasons.join(' ')
  };
}

// Get compliance record for a carrier
router.get('/:carrierId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const { carrierId } = req.params;
  const user = req.user!;

  // Scoping: Carriers can only see their own. Brokers can see any carrier. Shippers cannot see any.
  if (user.type.startsWith('carrier') && user.org_id !== carrierId) {
    return res.status(403).json({ error: 'Forbidden: Cannot view other carrier compliance records' });
  }

  if (user.type === 'shipper') {
    return res.status(403).json({ error: 'Forbidden: Shippers cannot access compliance data' });
  }

  try {
    let compliance = await db.carrierCompliance.findByCarrierId(carrierId);
    if (!compliance) {
      // Bootstrap default empty compliance if not found
      return res.status(404).json({ error: 'Compliance record not found' });
    }
    return res.json(compliance);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
});

// Create or update compliance record (Only Carrier Admin or Carrier Staff with staff.manage/appropriate access)
// Since this is org compliance management, we let Carrier staff with 'staff.manage' permission or Carrier Admin do it
router.post('/', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const { carrierId, insuranceExpiry, authorityStatus, mcDotNumber, approvedEquipmentTypes, approvedCommodityTypes } = req.body;
  const user = req.user!;

  // Security checks: must be a carrier, and must match their own org ID
  if (!user.type.startsWith('carrier')) {
    return res.status(403).json({ error: 'Forbidden: Only carriers can manage compliance' });
  }

  if (user.org_id !== carrierId) {
    return res.status(403).json({ error: 'Forbidden: Cannot update compliance for another carrier' });
  }

  // Check authorization (Admins always allowed; staff must have staff.manage permission or be authorized)
  if (user.type === 'carrier_staff') {
    const role = user.role_id ? await db.roles.findById(user.role_id) : null;
    if (!role || !role.permissions.includes('staff.manage')) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges to update compliance' });
    }
  }

  if (!insuranceExpiry || !authorityStatus || !mcDotNumber || !approvedEquipmentTypes || !approvedCommodityTypes) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const compliance = await db.carrierCompliance.createOrUpdate(
      carrierId,
      insuranceExpiry,
      authorityStatus,
      mcDotNumber,
      approvedEquipmentTypes,
      approvedCommodityTypes
    );

    // Audit log
    await db.auditLogs.create(
      null,
      user.id,
      user.username,
      user.type,
      'COMPLIANCE_UPDATED',
      `Updated carrier compliance: Insurance Expiry=${insuranceExpiry}, Authority=${authorityStatus}, MC/DOT=${mcDotNumber}`
    );

    // After compliance updates, re-evaluate all loads assigned to this carrier to auto-clear flags if resolved!
    const loads = await db.loads.findByCarrierId(carrierId);
    for (const load of loads) {
      if (load.status === 'Carrier Assigned' && load.compliance_flagged === 1) {
        const check = await evaluateCompliance(load, carrierId);
        if (!check.flagged) {
          // Compliance is now resolved! Auto-clear compliance flag
          await db.loads.update(load.id, {
            compliance_flagged: 0,
            compliance_notes: 'Compliance resolved by carrier profile update.'
          });

          await db.auditLogs.create(
            load.id,
            'system',
            'System',
            'broker_admin',
            'COMPLIANCE_AUTO_RESOLVED',
            `Auto-resolved compliance flag for Load ${load.id} due to carrier profile update.`
          );
        } else {
          // Update details with new issues
          await db.loads.update(load.id, {
            compliance_notes: check.reason
          });
        }
      }
    }

    return res.json(compliance);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
});

export default router;
