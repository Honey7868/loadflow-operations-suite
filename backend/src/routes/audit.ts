import { Router, Response } from 'express';
import { db } from '../db';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Get all audit logs (Broker gets all, Carrier gets only logs relating to their assigned loads or actions)
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;

  try {
    const allLogs = await db.auditLogs.findAll();

    if (user.type.startsWith('broker')) {
      // Brokers see everything
      return res.json(allLogs);
    }

    if (user.type.startsWith('carrier')) {
      // Carriers see logs matching their user OR logs that belong to loads assigned to them
      const carrierLoads = await db.loads.findByCarrierId(user.org_id!);
      const carrierLoadIds = carrierLoads.map((l) => l.id);

      const filtered = allLogs.filter((log) => {
        if (log.user_id === user.id) return true;
        if (log.load_id && carrierLoadIds.includes(log.load_id)) return true;
        return false;
      });
      return res.json(filtered);
    }

    // Shippers see only logs for their own loads
    if (user.type === 'shipper') {
      const shipperLoads = await db.loads.findByShipperId(user.id);
      const shipperLoadIds = shipperLoads.map((l) => l.id);
      const filtered = allLogs.filter((log) => log.load_id && shipperLoadIds.includes(log.load_id));
      return res.json(filtered);
    }

    return res.status(403).json({ error: 'Forbidden' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
});

export default router;
