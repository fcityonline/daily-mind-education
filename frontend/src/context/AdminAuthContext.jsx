// frontend/src/context/AdminAuthContext.jsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import API from '../utils/api.js';
import AdminAPI from '../utils/adminApi.js';

const AdminAuthContext = createContext();

export default function AdminAuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAdminAuth();
  }, []);

  const checkAdminAuth = async () => {
    try {
      const response = await AdminAPI.get('/admin-auth/profile');
      if (response.data) {
        setAdmin(response.data);
      }
    } catch (error) {
      console.log('No admin session found');
      setAdmin(null);
    } finally {
      setLoading(false);
    }
  };

  const adminLogin = async (credentials) => {
    try {
      const response = await API.post('/admin-auth/login', credentials);
      if (response.data) {
        setAdmin(response.data.admin);
        // Store admin token in localStorage for persistence
        if (response.data.token) {
          localStorage.setItem('adminToken', response.data.token);
        }
        return { success: true, data: response.data };
      }
    } catch (error) {
      console.error('Admin login error:', error);
      return { 
        success: false, 
        error: error.response?.data?.message || 'Login failed' 
      };
    }
  };

  const adminRegister = async (registrationData) => {
    try {
      const response = await API.post('/admin-auth/verify-otp', registrationData);
      if (response.data) {
        setAdmin(response.data.admin);
        // Store admin token in localStorage for persistence
        if (response.data.token) {
          localStorage.setItem('adminToken', response.data.token);
        }
        return { success: true, data: response.data };
      }
    } catch (error) {
      console.error('Admin registration error:', error);
      return { 
        success: false, 
        error: error.response?.data?.message || 'Registration failed' 
      };
    }
  };

  const sendAdminOtp = async (otpData) => {
    try {
      const response = await API.post('/admin-auth/send-otp', otpData);
      return { success: true, data: response.data };
    } catch (error) {
      console.error('Send admin OTP error:', error);
      return { 
        success: false, 
        error: error.response?.data?.message || 'Failed to send OTP' 
      };
    }
  };

  const adminLogout = async () => {
    try {
      await AdminAPI.post('/admin-auth/logout');
    } catch (error) {
      console.error('Admin logout error:', error);
    } finally {
      setAdmin(null);
      localStorage.removeItem('adminToken');
    }
  };

  const updateAdmin = (updatedAdmin) => {
    setAdmin(updatedAdmin);
  };

  const refreshAdmin = async () => {
    try {
      const response = await AdminAPI.get('/admin-auth/profile');
      if (response.data) {
        setAdmin(response.data);
      }
    } catch (error) {
      console.error('Refresh admin error:', error);
      setAdmin(null);
    }
  };

  const forgotAdminPassword = async (phone, email) => {
    try {
      const payload = phone ? { phone } : { email };
      const response = await API.post('/admin-auth/forgot-password', payload);
      return { success: true, data: response.data };
    } catch (error) {
      console.error('Forgot admin password error:', error);
      return { 
        success: false, 
        error: error.response?.data?.message || 'Failed to send reset OTP' 
      };
    }
  };

  const resetAdminPassword = async (payload) => {
    try {
      const response = await API.post('/admin-auth/reset-password', payload);
      return { success: true, data: response.data };
    } catch (error) {
      console.error('Reset admin password error:', error);
      return { 
        success: false, 
        error: error.response?.data?.message || 'Password reset failed' 
      };
    }
  };

  const value = {
    admin,
    loading,
    adminLogin,
    adminRegister,
    sendAdminOtp,
    adminLogout,
    updateAdmin,
    refreshAdmin,
    checkAdminAuth,
    forgotAdminPassword,
    resetAdminPassword
  };

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export const useAdminAuth = () => {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return context;
};

