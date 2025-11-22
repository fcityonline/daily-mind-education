// frontend/src/components/AdminProtectedRoute.jsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';

export default function AdminProtectedRoute({ children }) {
  const { admin, loading } = useAdminAuth();

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        background: 'linear-gradient(to bottom, #3b060e, #200307, #000000)',
        color: 'white'
      }}>
        <div className="spinner" style={{
          border: '8px solid #f3f3f3',
          borderTop: '8px solid #00ff00',
          borderRadius: '50%',
          width: '60px',
          height: '60px',
          animation: 'spin 1s linear infinite'
        }}></div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (!admin) {
    return <Navigate to="/admin-login" replace />;
  }

  return children;
}
