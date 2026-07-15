import React, { useState, useEffect } from 'react';
import { Load, CarrierCompliance, Role, User } from '../types';
import { LogOut, Eye, Search, AlertTriangle, ShieldCheck, FileText, CheckCircle, ShieldAlert, PlusCircle, Users, Settings } from 'lucide-react';

interface CarrierDashboardProps {
  user: any;
  token: string;
  onLogout: () => void;
}

export const CarrierDashboard: React.FC<CarrierDashboardProps> = ({ user, token, onLogout }) => {
  const [activeSubTab, setActiveSubTab] = useState<'loads' | 'compliance' | 'staff'>('loads');
  
  // States
  const [loads, setLoads] = useState<Load[]>([]);
  const [selectedLoadData, setSelectedLoadData] = useState<any>(null);
  const [compliance, setCompliance] = useState<CarrierCompliance | null>(null);
  
  // Load Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingLoads, setLoadingLoads] = useState(false);
  
  // Rate signing
  const [signing, setSigning] = useState(false);

  // Status updating
  const [updatingStatus, setUpdatingStatus] = useState(false);
  
  // POD Mock File Name
  const [podFileName, setPodFileName] = useState('');
  const [podUploading, setPodUploading] = useState(false);

  // Compliance Form
  const [insuranceExpiry, setInsuranceExpiry] = useState('');
  const [authorityStatus, setAuthorityStatus] = useState<'Active' | 'Inactive'>('Active');
  const [mcDotNumber, setMcDotNumber] = useState('');
  const [equipFlatbed, setEquipFlatbed] = useState(false);
  const [equipDryVan, setEquipDryVan] = useState(false);
  const [equipReefer, setEquipReefer] = useState(false);
  const [comGeneral, setComGeneral] = useState(false);
  const [comSteel, setComSteel] = useState(false);
  const [comProduce, setComProduce] = useState(false);
  const [savingCompliance, setSavingCompliance] = useState(false);
  const [complianceError, setComplianceError] = useState('');
  const [complianceSuccess, setComplianceSuccess] = useState('');

  // Staff & RBAC management
  const [roles, setRoles] = useState<Role[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  
  // Create Custom Role Form
  const [newRoleName, setNewRoleName] = useState('');
  const [permRateConfirm, setPermRateConfirm] = useState(false);
  const [permLoadStatus, setPermLoadStatus] = useState(false);
  const [permStaffManage, setPermStaffManage] = useState(false);
  const [permPodUpload, setPermPodUpload] = useState(false);
  
  // Add Staff Form
  const [staffName, setStaffName] = useState('');
  const [staffUsername, setStaffUsername] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffRoleId, setStaffRoleId] = useState('');
  
  const [rbacError, setRbacError] = useState('');
  const [rbacSuccess, setRbacSuccess] = useState('');

  // API Call: Fetch Loads
  const fetchLoads = async () => {
    setLoadingLoads(true);
    try {
      const query = searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : '';
      const response = await fetch(`/api/loads${query}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setLoads(data);
      }
    } catch (err) {
      console.error('Error fetching carrier loads:', err);
    } finally {
      setLoadingLoads(false);
    }
  };

  // API Call: Fetch Compliance Profile
  const fetchCompliance = async () => {
    try {
      const response = await fetch(`/api/compliance/${user.org_id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setCompliance(data);
        // Pre-fill form
        setInsuranceExpiry(data.insurance_expiry);
        setAuthorityStatus(data.authority_status);
        setMcDotNumber(data.mc_dot_number);
        
        let equip: string[] = [];
        try { equip = JSON.parse(data.approved_equipment_types); } catch(e) {}
        setEquipFlatbed(equip.includes('Flatbed'));
        setEquipDryVan(equip.includes('Dry Van'));
        setEquipReefer(equip.includes('Reefer'));
        
        let com: string[] = [];
        try { com = JSON.parse(data.approved_commodity_types); } catch(e) {}
        setComGeneral(com.includes('General Freight'));
        setComSteel(com.includes('Steel'));
        setComProduce(com.includes('Produce'));
      }
    } catch (err) {
      console.error('Error fetching compliance record:', err);
    }
  };

  // API Call: Fetch Staff & Roles
  const fetchStaffAndRoles = async () => {
    // Check if user has permission to manage staff (Admins can, or staff with staff.manage)
    try {
      const rolesRes = await fetch('/api/roles', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const staffRes = await fetch('/api/auth/staff', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (rolesRes.ok && staffRes.ok) {
        setRoles(await rolesRes.json());
        setStaff(await staffRes.json());
      }
    } catch (e) {
      console.warn('Unable to fetch staff/roles. Probably insufficient permissions.');
    }
  };

  useEffect(() => {
    fetchLoads();
    fetchCompliance();
    fetchStaffAndRoles();
  }, [searchTerm, activeSubTab]);

  // View Single Load
  const viewLoadDetails = async (loadId: string) => {
    try {
      const response = await fetch(`/api/loads/${loadId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setSelectedLoadData(await response.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Confirm Rate
  const handleConfirmRate = async () => {
    if (!selectedLoadData) return;
    setSigning(true);
    try {
      const response = await fetch(`/api/loads/${selectedLoadData.load.id}/rate-confirmation/accept`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to sign agreement');
      
      // Refresh
      await viewLoadDetails(selectedLoadData.load.id);
      await fetchLoads();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSigning(false);
    }
  };

  // Update Status
  const handleUpdateStatus = async (status: string, extra = {}) => {
    if (!selectedLoadData) return;
    setUpdatingStatus(true);
    try {
      const response = await fetch(`/api/loads/${selectedLoadData.load.id}/status`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status, ...extra })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update status');

      // Refresh
      await viewLoadDetails(selectedLoadData.load.id);
      await fetchLoads();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Mock POD Upload
  const handlePodUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoadData || !podFileName) return;
    setPodUploading(true);

    try {
      const response = await fetch(`/api/loads/${selectedLoadData.load.id}/pod-upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ fileName: podFileName })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to upload POD');

      setPodFileName('');
      // Refresh
      await viewLoadDetails(selectedLoadData.load.id);
      await fetchLoads();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setPodUploading(false);
    }
  };

  // Submit Compliance Form
  const handleSaveCompliance = async (e: React.FormEvent) => {
    e.preventDefault();
    setComplianceError('');
    setComplianceSuccess('');
    setSavingCompliance(true);

    const approvedEquipmentTypes: string[] = [];
    if (equipFlatbed) approvedEquipmentTypes.push('Flatbed');
    if (equipDryVan) approvedEquipmentTypes.push('Dry Van');
    if (equipReefer) approvedEquipmentTypes.push('Reefer');

    const approvedCommodityTypes: string[] = [];
    if (comGeneral) approvedCommodityTypes.push('General Freight');
    if (comSteel) approvedCommodityTypes.push('Steel');
    if (comProduce) approvedCommodityTypes.push('Produce');

    try {
      const response = await fetch('/api/compliance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          carrierId: user.org_id,
          insuranceExpiry,
          authorityStatus,
          mcDotNumber,
          approvedEquipmentTypes,
          approvedCommodityTypes
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update compliance');

      setComplianceSuccess('Compliance profile saved successfully. Assigned loads compliance checks re-evaluated.');
      await fetchCompliance();
    } catch (err: any) {
      setComplianceError(err.message);
    } finally {
      setSavingCompliance(false);
    }
  };

  // Add Custom Role
  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setRbacError('');
    setRbacSuccess('');

    const permissions: string[] = [];
    if (permRateConfirm) permissions.push('rate.confirm');
    if (permLoadStatus) permissions.push('load.update_status');
    if (permStaffManage) permissions.push('staff.manage');
    if (permPodUpload) permissions.push('pod.upload');

    try {
      const response = await fetch('/api/roles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: newRoleName, permissions })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to create role');

      setRbacSuccess(`Role "${newRoleName}" created successfully!`);
      setNewRoleName('');
      setPermRateConfirm(false);
      setPermLoadStatus(false);
      setPermStaffManage(false);
      setPermPodUpload(false);
      await fetchStaffAndRoles();
    } catch (err: any) {
      setRbacError(err.message);
    }
  };

  // Add Staff User
  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setRbacError('');
    setRbacSuccess('');

    try {
      const response = await fetch('/api/auth/staff', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          username: staffUsername,
          password: staffPassword,
          name: staffName,
          roleId: staffRoleId
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to add staff');

      setRbacSuccess(`Staff user "${staffUsername}" added successfully!`);
      setStaffName('');
      setStaffUsername('');
      setStaffPassword('');
      setStaffRoleId('');
      await fetchStaffAndRoles();
    } catch (err: any) {
      setRbacError(err.message);
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

  // Check if current compliance is active and not expired
  const isCompliant = compliance 
    ? compliance.authority_status === 'Active' && compliance.insurance_expiry >= new Date().toISOString().split('T')[0]
    : false;

  return (
    <div className="app-container">
      {/* Navbar */}
      <div className="navbar">
        <div className="brand text-gradient-carrier">
          <ShieldCheck size={28} />
          <span>LoadFlow <span style={{ fontWeight: 400, fontSize: '1rem', opacity: 0.8 }}>| Carrier</span></span>
        </div>
        <div className="user-profile">
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 600 }}>{user.name}</div>
            <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>
              {user.type === 'carrier_admin' ? 'Carrier Admin' : 'Carrier Staff'}
            </div>
          </div>
          <div className="user-avatar carrier">{user.name.charAt(0)}</div>
          <button onClick={onLogout} className="btn btn-outline btn-sm flex items-center gap-2">
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content animate-fade-in">
        
        {/* Navigation Subtabs */}
        <div className="tabs-container" style={{ marginBottom: '2rem' }}>
          <button 
            className={`tab-btn tab-carrier ${activeSubTab === 'loads' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('loads')}
          >
            Assigned Loads & Board
          </button>
          <button 
            className={`tab-btn tab-carrier ${activeSubTab === 'compliance' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('compliance')}
          >
            Compliance & Insurance Credentials
          </button>
          {/* Only show if user has staff manage permission or is admin */}
          {(user.type === 'carrier_admin' || roles.length > 0) && (
            <button 
              className={`tab-btn tab-carrier ${activeSubTab === 'staff' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('staff')}
            >
              Custom Roles & Driver Management
            </button>
          )}
        </div>

        {/* ==================== SUBTAB: LOADS ==================== */}
        {activeSubTab === 'loads' && (
          <div>
            <div style={{ marginBottom: '2rem' }}>
              <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Assigned Loads</h1>
              <p style={{ color: 'hsl(var(--text-secondary))' }}>
                Accept rate confirmations, update tracking, and upload POD documentation.
              </p>
            </div>

            {/* Board Controls */}
            <div className="board-controls">
              <div className="search-wrapper">
                <Search className="search-icon" size={18} />
                <input 
                  type="text" 
                  placeholder="Search loads..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {/* Compliance Warning Widget */}
            {!isCompliant && (
              <div className="badge badge-danger flex items-center gap-2 btn-full" style={{ marginBottom: '1.5rem', padding: '1rem', borderRadius: 'var(--radius-md)', width: '100%' }}>
                <AlertTriangle size={24} />
                <div>
                  <strong style={{ display: 'block' }}>Compliance Issue Detected</strong>
                  <span style={{ fontSize: '0.85rem' }}>
                    Your authority is INACTIVE or insurance expired. Brokers cannot dispatch loads to you until updated.
                  </span>
                </div>
              </div>
            )}

            {/* Table */}
            <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Load ID</th>
                      <th>Broker</th>
                      <th>Origin</th>
                      <th>Destination</th>
                      <th>Equipment</th>
                      <th>Status</th>
                      <th>Compliance</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingLoads ? (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>Loading loads...</td>
                      </tr>
                    ) : loads.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'hsl(var(--text-muted))' }}>
                          No active loads assigned.
                        </td>
                      </tr>
                    ) : (
                      loads.map((load) => (
                        <tr key={load.id}>
                          <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{load.id}</td>
                          <td>{load.broker_name}</td>
                          <td>{load.origin}</td>
                          <td>{load.destination}</td>
                          <td>{load.equipment_type}</td>
                          <td>
                            <span className={`badge ${getStatusBadgeClass(load.status)}`}>
                              {load.status}
                            </span>
                          </td>
                          <td>
                            {load.compliance_flagged === 1 ? (
                              <span className="badge badge-danger">Flagged</span>
                            ) : (
                              <span className="badge badge-success">OK</span>
                            )}
                          </td>
                          <td>
                            <button 
                              onClick={() => viewLoadDetails(load.id)} 
                              className="btn btn-outline btn-sm flex items-center gap-1"
                            >
                              <Eye size={14} />
                              <span>View Operations</span>
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
        )}

        {/* ==================== SUBTAB: COMPLIANCE ==================== */}
        {activeSubTab === 'compliance' && (
          <div style={{ maxWidth: '800px' }}>
            <div style={{ marginBottom: '2rem' }}>
              <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Compliance Profile</h1>
              <p style={{ color: 'hsl(var(--text-secondary))' }}>
                Manage your MC/DOT credentials, upload insurance proof, and state approved freight types.
              </p>
            </div>

            {complianceError && (
              <div className="badge badge-danger flex items-center gap-2 btn-full" style={{ marginBottom: '1.5rem', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
                <ShieldAlert size={16} />
                <span>{complianceError}</span>
              </div>
            )}

            {complianceSuccess && (
              <div className="badge badge-success flex items-center gap-2 btn-full" style={{ marginBottom: '1.5rem', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
                <ShieldCheck size={16} />
                <span>{complianceSuccess}</span>
              </div>
            )}

            <div className="glass-card">
              <form onSubmit={handleSaveCompliance}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                  <div className="form-group">
                    <label>MC/DOT Authority Number</label>
                    <input 
                      type="text" 
                      placeholder="e.g. MC-749204"
                      value={mcDotNumber}
                      onChange={(e) => setMcDotNumber(e.target.value)}
                      required 
                    />
                  </div>
                  <div className="form-group">
                    <label>Insurance Expiry Date</label>
                    <input 
                      type="date" 
                      value={insuranceExpiry}
                      onChange={(e) => setInsuranceExpiry(e.target.value)}
                      required 
                    />
                  </div>
                </div>

                <div className="form-group" style={{ margin: '1rem 0' }}>
                  <label>Authority Status</label>
                  <select 
                    value={authorityStatus}
                    onChange={(e) => setAuthorityStatus(e.target.value as any)}
                    required
                  >
                    <option value="Active">Active / Approved</option>
                    <option value="Inactive">Inactive / Suspended</option>
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', margin: '1.5rem 0' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Approved Equipment</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={equipFlatbed} onChange={(e) => setEquipFlatbed(e.target.checked)} style={{ width: 'auto' }} />
                        Flatbed
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={equipDryVan} onChange={(e) => setEquipDryVan(e.target.checked)} style={{ width: 'auto' }} />
                        Dry Van
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={equipReefer} onChange={(e) => setEquipReefer(e.target.checked)} style={{ width: 'auto' }} />
                        Reefer
                      </label>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Approved Commodities</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={comGeneral} onChange={(e) => setComGeneral(e.target.checked)} style={{ width: 'auto' }} />
                        General Freight
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={comSteel} onChange={(e) => setComSteel(e.target.checked)} style={{ width: 'auto' }} />
                        Steel
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={comProduce} onChange={(e) => setComProduce(e.target.checked)} style={{ width: 'auto' }} />
                        Produce / Refrigerated
                      </label>
                    </div>
                  </div>
                </div>

                <button type="submit" className="btn btn-secondary btn-full" disabled={savingCompliance}>
                  {savingCompliance ? 'Saving credentials...' : 'Save Compliance Record'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ==================== SUBTAB: STAFF & RBAC ==================== */}
        {activeSubTab === 'staff' && (
          <div>
            <div style={{ marginBottom: '2rem' }}>
              <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Driver & Dispatcher Management</h1>
              <p style={{ color: 'hsl(var(--text-secondary))' }}>
                Define custom roles from the permissions catalog and invite your staff members.
              </p>
            </div>

            {rbacError && (
              <div className="badge badge-danger flex items-center gap-2 btn-full" style={{ marginBottom: '1.5rem', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
                <ShieldAlert size={16} />
                <span>{rbacError}</span>
              </div>
            )}

            {rbacSuccess && (
              <div className="badge badge-success flex items-center gap-2 btn-full" style={{ marginBottom: '1.5rem', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
                <ShieldCheck size={16} />
                <span>{rbacSuccess}</span>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              
              {/* Custom Roles Column */}
              <div className="flex flex-col gap-6">
                
                {/* Create Custom Role */}
                <div className="glass-card">
                  <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Settings size={20} />
                    <span>Create Custom Role</span>
                  </h3>
                  <form onSubmit={handleCreateRole}>
                    <div className="form-group">
                      <label>Role Title</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Local Driver" 
                        value={newRoleName}
                        onChange={(e) => setNewRoleName(e.target.value)}
                        required 
                      />
                    </div>
                    
                    <label style={{ fontWeight: 600, display: 'block', margin: '1rem 0 0.5rem 0' }}>Select Permissions Bundle</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={permRateConfirm} onChange={(e) => setPermRateConfirm(e.target.checked)} style={{ width: 'auto' }} />
                        <span>Sign Rate Agreements (<code>rate.confirm</code>)</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={permLoadStatus} onChange={(e) => setPermLoadStatus(e.target.checked)} style={{ width: 'auto' }} />
                        <span>Update Status (<code>load.update_status</code>)</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={permPodUpload} onChange={(e) => setPermPodUpload(e.target.checked)} style={{ width: 'auto' }} />
                        <span>Upload PODs (<code>pod.upload</code>)</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={permStaffManage} onChange={(e) => setPermStaffManage(e.target.checked)} style={{ width: 'auto' }} />
                        <span>Manage Staff & Roles (<code>staff.manage</code>)</span>
                      </label>
                    </div>

                    <button type="submit" className="btn btn-outline btn-full">
                      <PlusCircle size={16} />
                      <span>Register Custom Role</span>
                    </button>
                  </form>
                </div>

                {/* Display Roles List */}
                <div className="glass-card">
                  <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Active Organization Roles</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div className="glass-card" style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.02)' }}>
                      <strong style={{ display: 'block' }}>Carrier Admin (Owner)</strong>
                      <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>Full access to all endpoints.</span>
                    </div>
                    {roles.length === 0 ? (
                      <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.9rem' }}>No custom staff roles defined yet.</p>
                    ) : (
                      roles.map((role) => (
                        <div key={role.id} className="glass-card" style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.02)' }}>
                          <strong style={{ display: 'block' }}>{role.name}</strong>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                            {role.permissions.map(p => (
                              <code key={p} style={{ fontSize: '0.7rem', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>{p}</code>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>

              {/* Staff Management Column */}
              <div className="flex flex-col gap-6">
                
                {/* Invite Staff */}
                <div className="glass-card">
                  <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Users size={20} />
                    <span>Register New Staff</span>
                  </h3>
                  <form onSubmit={handleAddStaff}>
                    <div className="form-group">
                      <label>Full Name</label>
                      <input 
                        type="text" 
                        placeholder="e.g. John Doe" 
                        value={staffName}
                        onChange={(e) => setStaffName(e.target.value)}
                        required 
                      />
                    </div>
                    <div className="form-group">
                      <label>Username</label>
                      <input 
                        type="text" 
                        placeholder="e.g. john_titan" 
                        value={staffUsername}
                        onChange={(e) => setStaffUsername(e.target.value)}
                        required 
                      />
                    </div>
                    <div className="form-group">
                      <label>Password</label>
                      <input 
                        type="password" 
                        placeholder="••••••••" 
                        value={staffPassword}
                        onChange={(e) => setStaffPassword(e.target.value)}
                        required 
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                      <label>Role Assignment</label>
                      <select 
                        value={staffRoleId}
                        onChange={(e) => setStaffRoleId(e.target.value)}
                        required
                      >
                        <option value="">Select custom role...</option>
                        {roles.map((role) => (
                          <option key={role.id} value={role.id}>{role.name}</option>
                        ))}
                      </select>
                    </div>

                    <button type="submit" className="btn btn-secondary btn-full" disabled={roles.length === 0}>
                      <span>Add Staff User</span>
                    </button>
                  </form>
                </div>

                {/* Staff List */}
                <div className="glass-card">
                  <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Active Team Members</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {staff.map((s) => {
                      const roleName = s.role_id 
                        ? roles.find((r) => r.id === s.role_id)?.name || 'Custom Staff' 
                        : 'Admin';
                      return (
                        <div key={s.id} className="flex justify-between items-center" style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid var(--glass-border)' }}>
                          <div>
                            <div style={{ fontWeight: 600 }}>{s.name}</div>
                            <div style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>@{s.username}</div>
                          </div>
                          <span className="badge badge-posted" style={{ fontSize: '0.7rem' }}>
                            {roleName}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>

            </div>
          </div>
        )}
      </div>

      {/* Operation / Detail Modal */}
      {selectedLoadData && (
        <div className="modal-overlay" onClick={() => setSelectedLoadData(null)}>
          <div className="modal-content" style={{ maxWidth: '850px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Load Operations: {selectedLoadData.load.id}</h3>
              <button className="modal-close" onClick={() => setSelectedLoadData(null)}>X</button>
            </div>
            
            <div className="modal-body">
              {/* Status Timeline */}
              <div className="status-timeline">
                {[
                  'Posted',
                  'Carrier Assigned',
                  'Rate Confirmed',
                  'Dispatched',
                  'In Transit',
                  'Delivered',
                  'POD Verified',
                  'Invoiced/Closed'
                ].map((s, idx, arr) => {
                  const currentIdx = arr.indexOf(selectedLoadData.load.status);
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

              {/* Compliance Flag inside Modal */}
              {selectedLoadData.load.compliance_flagged === 1 && (
                <div 
                  className="badge badge-danger flex items-center gap-2 btn-full"
                  style={{ padding: '0.75rem 1rem', width: '100%', marginBottom: '1.5rem', borderRadius: 'var(--radius-sm)' }}
                >
                  <AlertTriangle size={18} />
                  <div>
                    <strong>COMPLIANCE FLAG ACTIVE:</strong> {selectedLoadData.load.compliance_notes}
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '2rem', marginTop: '1.5rem' }}>
                <div>
                  <h4 style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
                    Specs & Routing
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.9rem' }}>
                    <div>
                      <span style={{ color: 'hsl(var(--text-muted))', display: 'block' }}>Origin:</span>
                      <strong>{selectedLoadData.load.origin}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'hsl(var(--text-muted))', display: 'block' }}>Destination:</span>
                      <strong>{selectedLoadData.load.destination}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'hsl(var(--text-muted))', display: 'block' }}>Pickup:</span>
                      <strong>{selectedLoadData.load.pickup_date}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'hsl(var(--text-muted))', display: 'block' }}>Delivery:</span>
                      <strong>{selectedLoadData.load.delivery_date}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'hsl(var(--text-muted))', display: 'block' }}>Equipment:</span>
                      <strong>{selectedLoadData.load.equipment_type}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'hsl(var(--text-muted))', display: 'block' }}>Commodity:</span>
                      <strong>{selectedLoadData.load.commodity_type}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'hsl(var(--text-muted))', display: 'block' }}>Weight:</span>
                      <strong>{selectedLoadData.load.weight.toLocaleString()} lbs</strong>
                    </div>
                    <div>
                      <span style={{ color: 'hsl(var(--text-muted))', display: 'block' }}>Shipper Linkage:</span>
                      <strong>{selectedLoadData.load.shipper_name}</strong>
                    </div>
                  </div>
                  
                  {selectedLoadData.load.notes && (
                    <div style={{ marginTop: '1.5rem' }}>
                      <span style={{ color: 'hsl(var(--text-muted))', display: 'block', marginBottom: '0.25rem' }}>Cargo Notes:</span>
                      <p style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '4px', fontStyle: 'italic', fontSize: '0.85rem' }}>
                        {selectedLoadData.load.notes}
                      </p>
                    </div>
                  )}
                </div>

                {/* Operations Actions & Agreement Column */}
                <div style={{ borderLeft: '1px solid var(--glass-border)', paddingLeft: '1.5rem' }}>
                  <h4 style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
                    Operations & Rate Contract
                  </h4>
                  
                  {/* Rate Confirmation panel */}
                  {selectedLoadData.rates.length === 0 ? (
                    <div style={{ fontSize: '0.9rem', color: 'hsl(var(--text-muted))', marginBottom: '1.5rem' }}>
                      No rate confirmation offered by broker yet.
                    </div>
                  ) : (() => {
                    const latest = selectedLoadData.rates.reduce((prev: any, cur: any) => (prev.version > cur.version ? prev : cur));
                    let accs = {};
                    try { accs = JSON.parse(latest.accessorials); } catch (e) {}
                    
                    return (
                      <div className="glass-card" style={{ padding: '0.75rem', marginBottom: '1.5rem', fontSize: '0.85rem', background: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                          <strong>Rate Contract v{latest.version}</strong>
                          <span style={{ color: 'hsl(var(--success))' }}>Active</span>
                        </div>
                        <div className="flex justify-between" style={{ marginBottom: '0.25rem' }}>
                          <span>Base Freight:</span>
                          <strong>${latest.base_rate}</strong>
                        </div>
                        {Object.entries(accs).map(([k, v]: any) => (
                          <div key={k} className="flex justify-between" style={{ textTransform: 'capitalize', marginBottom: '0.25rem' }}>
                            <span>{k}:</span>
                            <strong>${v}</strong>
                          </div>
                        ))}
                        <div className="flex justify-between" style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '0.5rem', marginTop: '0.5rem', fontSize: '0.95rem' }}>
                          <span>Total Agreed:</span>
                          <strong>${latest.base_rate + Object.values(accs).reduce((a: number, b: any) => a + Number(b), 0)}</strong>
                        </div>
                        
                        {/* Signing Controls */}
                        <div style={{ marginTop: '1rem' }}>
                          {latest.confirmed_by_carrier_user_id ? (
                            <span className="badge badge-success flex items-center gap-1">
                              <CheckCircle size={12} />
                              <span>Signed by Carrier</span>
                            </span>
                          ) : (
                            <button 
                              onClick={handleConfirmRate}
                              className="btn btn-secondary btn-sm btn-full"
                              disabled={signing}
                            >
                              <FileText size={14} />
                              <span>{signing ? 'Signing Contract...' : 'Sign Rate Agreement'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Shipment Tracking Progression Buttons */}
                  <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>Operational Actions</h4>
                  
                  {selectedLoadData.load.status === 'Rate Confirmed' && (
                    <button 
                      onClick={() => handleUpdateStatus('Dispatched')}
                      className="btn btn-primary btn-full"
                      disabled={updatingStatus}
                    >
                      Dispatch Cargo
                    </button>
                  )}
                  
                  {selectedLoadData.load.status === 'Dispatched' && (
                    <button 
                      onClick={() => handleUpdateStatus('In Transit')}
                      className="btn btn-primary btn-full"
                      disabled={updatingStatus}
                    >
                      Mark In Transit
                    </button>
                  )}

                  {selectedLoadData.load.status === 'In Transit' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <form onSubmit={handlePodUpload}>
                        <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                          <label style={{ fontSize: '0.75rem' }}>Attach POD Document (Mock Filename)</label>
                          <input 
                            type="text" 
                            placeholder="e.g. proof_of_delivery_bol.pdf" 
                            value={podFileName}
                            onChange={(e) => setPodFileName(e.target.value)}
                            required 
                          />
                        </div>
                        <button 
                          type="submit" 
                          className="btn btn-secondary btn-full"
                          disabled={podUploading}
                        >
                          {podUploading ? 'Uploading proof...' : 'Upload POD & Mark Delivered'}
                        </button>
                      </form>
                    </div>
                  )}

                  {selectedLoadData.load.status === 'Delivered' && (
                    <span className="badge badge-success flex items-center gap-1 btn-full" style={{ padding: '0.5rem' }}>
                      <CheckCircle size={14} />
                      <span>Cargo Delivered (Awaiting Verification)</span>
                    </span>
                  )}
                  
                  {selectedLoadData.load.status === 'POD Verified' && (
                    <span className="badge badge-success flex items-center gap-1 btn-full" style={{ padding: '0.5rem' }}>
                      <CheckCircle size={14} />
                      <span>POD Verified by Broker</span>
                    </span>
                  )}

                  {selectedLoadData.load.status === 'Invoiced/Closed' && (
                    <span className="badge badge-closed flex items-center gap-1 btn-full" style={{ padding: '0.5rem' }}>
                      <span>Closed / Invoiced</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Audit trail for the specific load */}
              <div style={{ marginTop: '2rem' }}>
                <h4 style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
                  Auditing & Tracking History
                </h4>
                <div className="audit-list">
                  {selectedLoadData.auditLogs.map((log: any) => (
                    <div key={log.id} className="audit-item">
                      <div className="audit-time">{new Date(log.timestamp).toLocaleString()}</div>
                      <div className="audit-action">{log.action.replace('_', ' ')}</div>
                      <div className="audit-details">
                        {log.details.startsWith('{') ? (() => {
                          try {
                            const parsed = JSON.parse(log.details);
                            return Object.entries(parsed).map(([k, v]: any) => `${k}: ${v}`).join(', ');
                          } catch (e) { return log.details; }
                        })() : log.details} — <span style={{ color: 'hsl(var(--text-muted))' }}>@{log.username} ({log.user_type})</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setSelectedLoadData(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
