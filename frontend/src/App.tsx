import React, { useState, useEffect } from 'react';
import { AuthPage } from './components/AuthPage';
import { BrokerDashboard } from './components/BrokerDashboard';
import { CarrierDashboard } from './components/CarrierDashboard';
import { ShipperDashboard } from './components/ShipperDashboard';
import './styles/global.css';
import './styles/components.css';
import './styles/dashboards.css';

export const App: React.FC = () => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session on reload
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const handleLoginSuccess = (newToken: string, newUser: any, newOrg: any) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    if (newOrg) {
      localStorage.setItem('org', JSON.stringify(newOrg));
    } else {
      localStorage.removeItem('org');
    }

    setToken(newToken);
    setUser(newUser);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('org');
    
    setToken(null);
    setUser(null);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <h2>Loading LoadFlow Suite...</h2>
      </div>
    );
  }

  // Not logged in -> Show login/register
  if (!token || !user) {
    return <AuthPage onLoginSuccess={handleLoginSuccess} />;
  }

  // Scoped views based on account types
  if (user.type === 'shipper') {
    return <ShipperDashboard user={user} token={token} onLogout={handleLogout} />;
  }

  if (user.type === 'broker_admin' || user.type === 'broker_staff') {
    return <BrokerDashboard user={user} token={token} onLogout={handleLogout} />;
  }

  if (user.type === 'carrier_admin' || user.type === 'carrier_staff') {
    return <CarrierDashboard user={user} token={token} onLogout={handleLogout} />;
  }

  // Fallback
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h2>Account type unrecognized. Please contact admin.</h2>
      <button onClick={handleLogout} className="btn btn-primary" style={{ marginTop: '1rem' }}>Log Out</button>
    </div>
  );
};

export default App;
