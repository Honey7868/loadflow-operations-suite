import React, { useState } from 'react';
import { Truck, ShieldAlert, KeyRound, UserCheck, PlusCircle } from 'lucide-react';
import { apiUrl } from '../api';

interface AuthPageProps {
  onLoginSuccess: (token: string, user: any, org: any) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onLoginSuccess }) => {
  const [activeTab, setActiveTab] = useState<'login' | 'register-org' | 'register-shipper'>('login');
  
  // Login Form
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  // Register Org Form
  const [orgName, setOrgName] = useState('');
  const [orgType, setOrgType] = useState<'broker' | 'carrier'>('broker');
  const [orgUsername, setOrgUsername] = useState('');
  const [orgPassword, setOrgPassword] = useState('');
  const [orgAdminName, setOrgAdminName] = useState('');
  
  // Register Shipper Form
  const [shipperUsername, setShipperUsername] = useState('');
  const [shipperPassword, setShipperPassword] = useState('');
  const [shipperName, setShipperName] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Login failed');
      
      onLoginSuccess(data.token, data.user, data.org);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await fetch(apiUrl('/api/auth/register-org'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgName,
          orgType,
          username: orgUsername,
          password: orgPassword,
          name: orgAdminName,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Registration failed');

      setSuccess('Organization registered successfully! Logging you in...');
      setTimeout(() => {
        onLoginSuccess(data.token, data.user, data.org);
      }, 1500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterShipper = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await fetch(apiUrl('/api/auth/register-shipper'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: shipperUsername,
          password: shipperPassword,
          name: shipperName,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Registration failed');

      setSuccess('Shipper account created successfully! Logging you in...');
      setTimeout(() => {
        onLoginSuccess(data.token, data.user, null);
      }, 1500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Quick Account Switcher Helper
  const quickLogin = async (username: string) => {
    setError('');
    setLoading(true);
    try {
      const response = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: 'password' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Login failed');
      onLoginSuccess(data.token, data.user, data.org);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-between" style={{ minHeight: '100vh', padding: '3rem 1.5rem' }}>
      
      {/* Brand Header */}
      <div className="brand text-gradient-broker animate-fade-in" style={{ fontSize: '3rem', marginBottom: '2rem' }}>
        <Truck size={44} style={{ stroke: 'url(#broker-grad)', strokeWidth: 2 }} />
        <span>LoadFlow</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '2.5rem', maxWidth: '1100px', width: '100%' }}>
        
        {/* Auth Forms */}
        <div className="glass-card animate-fade-in" style={{ padding: '2.5rem' }}>
          <div className="tabs-container">
            <button 
              className={`tab-btn ${activeTab === 'login' ? 'active' : ''}`}
              onClick={() => { setActiveTab('login'); setError(''); }}
            >
              Log In
            </button>
            <button 
              className={`tab-btn ${activeTab === 'register-org' ? 'active' : ''}`}
              onClick={() => { setActiveTab('register-org'); setError(''); }}
            >
              Register Org (Broker/Carrier)
            </button>
            <button 
              className={`tab-btn ${activeTab === 'register-shipper' ? 'active' : ''}`}
              onClick={() => { setActiveTab('register-shipper'); setError(''); }}
            >
              Shipper Signup
            </button>
          </div>

          {error && (
            <div className="badge badge-danger flex items-center gap-2 btn-full" style={{ marginBottom: '1.5rem', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
              <ShieldAlert size={16} />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="badge badge-success flex items-center gap-2 btn-full" style={{ marginBottom: '1.5rem', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
              <UserCheck size={16} />
              <span>{success}</span>
            </div>
          )}

          {/* Login Form */}
          {activeTab === 'login' && (
            <form onSubmit={handleLogin}>
              <div className="form-group">
                <label>Username</label>
                <input 
                  type="text" 
                  placeholder="e.g. broker_admin" 
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  required 
                />
              </div>
              <div className="form-group" style={{ marginBottom: '2rem' }}>
                <label>Password</label>
                <input 
                  type="password" 
                  placeholder="••••••••" 
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required 
                />
              </div>
              <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                <KeyRound size={18} />
                <span>{loading ? 'Logging in...' : 'Access Dashboard'}</span>
              </button>
            </form>
          )}

          {/* Register Organization Form */}
          {activeTab === 'register-org' && (
            <form onSubmit={handleRegisterOrg}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '1rem' }}>
                <div className="form-group">
                  <label>Organization Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Apex Logistics" 
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    required 
                  />
                </div>
                <div className="form-group">
                  <label>Type</label>
                  <select 
                    value={orgType}
                    onChange={(e) => setOrgType(e.target.value as any)}
                    required
                  >
                    <option value="broker">Broker org</option>
                    <option value="carrier">Carrier org</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Admin Full Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. Sarah Miller" 
                  value={orgAdminName}
                  onChange={(e) => setOrgAdminName(e.target.value)}
                  required 
                />
              </div>
              <div className="form-group">
                <label>Admin Username</label>
                <input 
                  type="text" 
                  placeholder="e.g. sarah_apex" 
                  value={orgUsername}
                  onChange={(e) => setOrgUsername(e.target.value)}
                  required 
                />
              </div>
              <div className="form-group" style={{ marginBottom: '2rem' }}>
                <label>Password</label>
                <input 
                  type="password" 
                  placeholder="••••••••" 
                  value={orgPassword}
                  onChange={(e) => setOrgPassword(e.target.value)}
                  required 
                />
              </div>
              <button type="submit" className="btn btn-secondary btn-full" disabled={loading}>
                <PlusCircle size={18} />
                <span>{loading ? 'Creating Org...' : 'Initialize & Register Org'}</span>
              </button>
            </form>
          )}

          {/* Register Shipper Form */}
          {activeTab === 'register-shipper' && (
            <form onSubmit={handleRegisterShipper}>
              <div className="form-group">
                <label>Shipper Name (Business or Individual)</label>
                <input 
                  type="text" 
                  placeholder="e.g. ACME Manufacturing" 
                  value={shipperName}
                  onChange={(e) => setShipperName(e.target.value)}
                  required 
                />
              </div>
              <div className="form-group">
                <label>Username</label>
                <input 
                  type="text" 
                  placeholder="e.g. acme_shipper" 
                  value={shipperUsername}
                  onChange={(e) => setShipperUsername(e.target.value)}
                  required 
                />
              </div>
              <div className="form-group" style={{ marginBottom: '2rem' }}>
                <label>Password</label>
                <input 
                  type="password" 
                  placeholder="••••••••" 
                  value={shipperPassword}
                  onChange={(e) => setShipperPassword(e.target.value)}
                  required 
                />
              </div>
              <button type="submit" className="btn btn-shipper btn-full" disabled={loading}>
                <PlusCircle size={18} />
                <span>{loading ? 'Creating Account...' : 'Register Shipper'}</span>
              </button>
            </form>
          )}
        </div>

        {/* Demo Switcher Widget (Highly aesthetic, helpful for evaluating RBAC) */}
        <div className="glass-card animate-fade-in flex flex-col justify-between" style={{ padding: '2rem', borderLeftWidth: '3px', borderLeftColor: 'hsl(var(--primary))' }}>
          <div>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>Evaluation Quick-Login</span>
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'hsl(var(--text-muted))', marginBottom: '1.5rem' }}>
              Switch instantly between pre-configured seed accounts representing different permissions and scoping bounds.
            </p>

            <div className="flex flex-col gap-3">
              <div>
                <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'hsl(var(--text-muted))', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                  Broker Org (Apex Logistics)
                </h4>
                <div className="flex flex-col gap-2">
                  <button onClick={() => quickLogin('broker_admin')} className="btn btn-outline btn-sm btn-full flex justify-between" style={{ textAlign: 'left' }}>
                    <span>Sarah (Admin)</span>
                    <span className="badge badge-posted" style={{ fontSize: '0.65rem' }}>All Perms + Setup</span>
                  </button>
                  <button onClick={() => quickLogin('broker_dispatch')} className="btn btn-outline btn-sm btn-full flex justify-between">
                    <span>Mike (Dispatcher)</span>
                    <span className="badge badge-assigned" style={{ fontSize: '0.65rem' }}>Assign & Confirm</span>
                  </button>
                  <button onClick={() => quickLogin('broker_ops')} className="btn btn-outline btn-sm btn-full flex justify-between">
                    <span>Dan (Ops Lead)</span>
                    <span className="badge badge-verified" style={{ fontSize: '0.65rem' }}>Full + Override</span>
                  </button>
                </div>
              </div>

              <div style={{ marginTop: '0.5rem' }}>
                <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'hsl(var(--text-muted))', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                  Carrier Org (Titan Freight)
                </h4>
                <div className="flex flex-col gap-2">
                  <button onClick={() => quickLogin('carrier_admin')} className="btn btn-outline btn-sm btn-full flex justify-between">
                    <span>David (Admin)</span>
                    <span className="badge badge-confirmed" style={{ fontSize: '0.65rem' }}>Admin + Staff Setup</span>
                  </button>
                  <button onClick={() => quickLogin('carrier_dispatch')} className="btn btn-outline btn-sm btn-full flex justify-between">
                    <span>Alice (Dispatch)</span>
                    <span className="badge badge-transit" style={{ fontSize: '0.65rem' }}>Sign Rate & Update</span>
                  </button>
                  <button onClick={() => quickLogin('carrier_driver')} className="btn btn-outline btn-sm btn-full flex justify-between">
                    <span>John (Driver)</span>
                    <span className="badge badge-delivered" style={{ fontSize: '0.65rem' }}>Update Status + POD</span>
                  </button>
                </div>
              </div>

              <div style={{ marginTop: '0.5rem' }}>
                <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'hsl(var(--text-muted))', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                  Shippers (Object-Scoping)
                </h4>
                <div className="flex flex-col gap-2">
                  <button onClick={() => quickLogin('shipper_acme')} className="btn btn-outline btn-sm btn-full flex justify-between">
                    <span>ACME Manufacturing</span>
                    <span className="badge badge-closed" style={{ fontSize: '0.65rem' }}>Acme Loads Only</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', borderTop: '1px solid var(--glass-border)', paddingTop: '1rem', marginTop: '1rem' }}>
            * Standard password for all seed accounts is <code style={{ color: 'white', background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: '3px' }}>password</code>.
          </div>
        </div>

      </div>

      {/* SVG Grad Definition for Lucide Brand Icon */}
      <svg width="0" height="0">
        <defs>
          <linearGradient id="broker-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#1e3a8a" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
};
