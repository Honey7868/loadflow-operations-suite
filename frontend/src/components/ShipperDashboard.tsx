import React, { useState, useEffect } from 'react';
import { Load } from '../types';
import { LogOut, Eye, Search, AlertCircle, Compass } from 'lucide-react';
import { apiUrl } from '../api';

interface ShipperDashboardProps {
  user: any;
  token: string;
  onLogout: () => void;
}

export const ShipperDashboard: React.FC<ShipperDashboardProps> = ({ user, token, onLogout }) => {
  const [loads, setLoads] = useState<Load[]>([]);
  const [selectedLoad, setSelectedLoad] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchLoads = async () => {
    setLoading(true);
    try {
      const query = searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : '';
      const response = await fetch(apiUrl(`/api/loads${query}`), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setLoads(data);
      }
    } catch (err) {
      console.error('Error fetching shipper loads:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLoads();
  }, [searchTerm]);

  const viewLoadDetails = async (loadId: string) => {
    try {
      const response = await fetch(apiUrl(`/api/loads/${loadId}`), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setSelectedLoad(data);
      }
    } catch (err) {
      console.error('Error viewing load details:', err);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Posted': return 'badge-posted';
      case 'Carrier Assigned': return 'badge-assigned';
      case 'Rate Confirmed': return 'badge-confirmed';
      case 'Dispatched': return 'badge-dispatched';
      case 'In Transit': return 'badge-transit';
      case 'Delivered': return 'badge-delivered';
      case 'POD Verified': return 'badge-verified';
      case 'Invoiced/Closed': return 'badge-closed';
      default: return '';
    }
  };

  const statuses = [
    'Posted',
    'Carrier Assigned',
    'Rate Confirmed',
    'Dispatched',
    'In Transit',
    'Delivered',
    'POD Verified',
    'Invoiced/Closed'
  ];

  return (
    <div className="app-container">
      {/* Navbar */}
      <div className="navbar">
        <div className="brand text-gradient-shipper">
          <Compass size={28} />
          <span>LoadFlow <span style={{ fontWeight: 400, fontSize: '1rem', opacity: 0.8 }}>| Shipper</span></span>
        </div>
        <div className="user-profile">
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 600 }}>{user.name}</div>
            <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>Shipper Account</div>
          </div>
          <div className="user-avatar shipper">{user.name.charAt(0)}</div>
          <button onClick={onLogout} className="btn btn-outline btn-sm flex items-center gap-2">
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content animate-fade-in">
        
        {/* Header Title */}
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Track Shipments</h1>
          <p style={{ color: 'hsl(var(--text-secondary))' }}>
            Live status monitoring for all your active logistics movements.
          </p>
        </div>

        {/* Board Search */}
        <div className="board-controls">
          <div className="search-wrapper">
            <Search className="search-icon" size={18} />
            <input 
              type="text" 
              placeholder="Search loads by destination, ID, or description..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Load Table */}
        <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Load ID</th>
                  <th>Origin</th>
                  <th>Destination</th>
                  <th>Est. Delivery Date</th>
                  <th>Equipment Type</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>Loading shipments...</td>
                  </tr>
                ) : loads.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'hsl(var(--text-muted))' }}>
                      No active shipments found.
                    </td>
                  </tr>
                ) : (
                  loads.map((load) => (
                    <tr key={load.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{load.id}</td>
                      <td>{load.origin}</td>
                      <td>{load.destination}</td>
                      <td>{load.delivery_date}</td>
                      <td>{load.equipment_type}</td>
                      <td>
                        <span className={`badge ${getStatusBadgeClass(load.status)}`}>
                          {load.status}
                        </span>
                      </td>
                      <td>
                        <button 
                          onClick={() => viewLoadDetails(load.id)} 
                          className="btn btn-outline btn-sm flex items-center gap-1"
                        >
                          <Eye size={14} />
                          <span>Track</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Tracking / Detail Modal */}
      {selectedLoad && (
        <div className="modal-overlay" onClick={() => setSelectedLoad(null)}>
          <div className="modal-content" style={{ maxWidth: '800px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Track Shipment: {selectedLoad.load.id}</h3>
              <button className="modal-close" onClick={() => setSelectedLoad(null)}>X</button>
            </div>
            
            <div className="modal-body">
              {/* Status Timeline */}
              <div className="status-timeline">
                {statuses.map((s, idx) => {
                  const currentIdx = statuses.indexOf(selectedLoad.load.status);
                  const isCompleted = idx < currentIdx;
                  const isActive = idx === currentIdx;
                  
                  return (
                    <div 
                      key={s} 
                      className={`timeline-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
                    >
                      <div className="timeline-node">
                        {isCompleted ? '✓' : idx + 1}
                      </div>
                      <div className="timeline-label">{s}</div>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '2rem' }}>
                {/* Specs */}
                <div>
                  <h4 style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
                    Shipment Details
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.95rem' }}>
                    <div className="flex justify-between">
                      <span style={{ color: 'hsl(var(--text-muted))' }}>Origin:</span>
                      <strong>{selectedLoad.load.origin}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: 'hsl(var(--text-muted))' }}>Destination:</span>
                      <strong>{selectedLoad.load.destination}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: 'hsl(var(--text-muted))' }}>Pickup Date:</span>
                      <strong>{selectedLoad.load.pickup_date}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: 'hsl(var(--text-muted))' }}>Delivery Date:</span>
                      <strong>{selectedLoad.load.delivery_date}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: 'hsl(var(--text-muted))' }}>Commodity:</span>
                      <strong>{selectedLoad.load.commodity_type}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: 'hsl(var(--text-muted))' }}>Weight:</span>
                      <strong>{selectedLoad.load.weight.toLocaleString()} lbs</strong>
                    </div>
                  </div>
                </div>

                {/* Tracking & Carrier Info */}
                <div>
                  <h4 style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
                    Broker & Transit Operations
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.95rem' }}>
                    <div className="flex justify-between">
                      <span style={{ color: 'hsl(var(--text-muted))' }}>Managing Broker:</span>
                      <strong>{selectedLoad.load.broker_name}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: 'hsl(var(--text-muted))' }}>Assigned Carrier:</span>
                      <strong>{selectedLoad.load.carrier_name}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: 'hsl(var(--text-muted))' }}>Shipment State:</span>
                      <span className={`badge ${getStatusBadgeClass(selectedLoad.load.status)}`}>
                        {selectedLoad.load.status}
                      </span>
                    </div>
                  </div>

                  {selectedLoad.load.notes.includes('[POD UPLOADED]') && (
                    <div 
                      className="badge badge-success flex items-center gap-2 btn-full"
                      style={{ marginTop: '1.5rem', padding: '0.75rem', width: '100%', borderRadius: 'var(--radius-sm)' }}
                    >
                      <AlertCircle size={16} />
                      <span>Proof of Delivery (POD) Uploaded</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              {selectedLoad.load.notes && (
                <div style={{ marginTop: '2rem' }}>
                  <h4 style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
                    Delivery Notes / Status Updates
                  </h4>
                  <p style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: 'var(--radius-sm)', whiteSpace: 'pre-line', fontSize: '0.9rem' }}>
                    {selectedLoad.load.notes}
                  </p>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setSelectedLoad(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
