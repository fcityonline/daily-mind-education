// // frontend/src/context/AuthContext.jsx

import React, { createContext, useEffect, useState } from "react";
import API from "../utils/api";

export const AuthContext = createContext();

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check for existing token on mount
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      (async () => {
        try {
          const res = await API.get("/auth/profile");
          setUser(res.data);
        } catch (err) {
          localStorage.removeItem("token");
          setUser(null);
        } finally {
          setLoading(false);
        }
      })();
    } else {
      setLoading(false);
    }
  }, []);

  const sendOtp = async (phone) => {
    // Centralized sendOtp which also persists resend cooldown info to localStorage
    const normalized = normalizePhone(phone);
    try {
      const res = await API.post("/auth/send-otp", { phone: normalized });
      // Use server-provided retryAfter when available
      const serverRetry = res?.data?.retryAfter || res?.data?.full?.retryAfter || null;
      if (serverRetry) {
        setResendUntil(normalized, Number(serverRetry));
      } else {
        // default 60s cooldown after send
        setResendUntil(normalized, 60);
      }
      return res;
    } catch (error) {
      // If server provided retry info on error (429), honor it
      const retry = error?.response?.data?.retryAfter || error?.response?.data?.retry_after || null;
      if (retry) setResendUntil(normalized, Number(retry));
      throw error;
    }
  };

  // Helpers for resend persistence (per-phone)
  const RESEND_KEY = (phone) => `otp_resend_until:${phone}`;
  const RESEND_TTL_KEY = (phone) => `otp_resend_ttl:${phone}`;

  const normalizePhone = (phone) => {
    if (!phone) return "";
    const sanitized = String(phone).replace(/\D/g, "").replace(/^0+/, "");
    if (sanitized.length > 10 && sanitized.startsWith("91")) return sanitized.slice(-10);
    if (sanitized.length > 10) return sanitized.slice(-10);
    return sanitized;
  };

  const setResendUntil = (phone, secondsFromNow) => {
    try {
      const until = Date.now() + Number(secondsFromNow) * 1000;
      localStorage.setItem(RESEND_KEY(phone), String(until));
      localStorage.setItem(RESEND_TTL_KEY(phone), String(Number(secondsFromNow)));
    } catch (e) {
      // ignore storage errors
    }
  };

  const getResendUntil = (phone) => {
    try {
      const raw = localStorage.getItem(RESEND_KEY(phone));
      if (!raw) return null;
      const until = Number(raw);
      if (Number.isNaN(until)) return null;
      return until;
    } catch (e) {
      return null;
    }
  };

  const getResendRemaining = (phone) => {
    const normalized = normalizePhone(phone);
    const until = getResendUntil(normalized);
    if (!until) return 0;
    const sec = Math.ceil(Math.max(0, (until - Date.now()) / 1000));
    return sec;
  };

  const getResendInitialTtl = (phone) => {
    try {
      const normalized = normalizePhone(phone);
      const raw = localStorage.getItem(RESEND_TTL_KEY(normalized));
      if (!raw) return 60;
      const ttl = Number(raw);
      if (Number.isNaN(ttl)) return 60;
      return ttl;
    } catch (e) {
      return 60;
    }
  };

  // --- Email resend persistence (same semantics as phone, keyed by email)
  const RESEND_EMAIL_KEY = (email) => `otp_resend_until:email:${email}`;
  const RESEND_EMAIL_TTL_KEY = (email) => `otp_resend_ttl:email:${email}`;

  const setResendUntilEmail = (email, secondsFromNow) => {
    try {
      const until = Date.now() + Number(secondsFromNow) * 1000;
      localStorage.setItem(RESEND_EMAIL_KEY(email), String(until));
      localStorage.setItem(RESEND_EMAIL_TTL_KEY(email), String(Number(secondsFromNow)));
    } catch (e) {
      // ignore storage errors
    }
  };

  const getResendUntilEmail = (email) => {
    try {
      const raw = localStorage.getItem(RESEND_EMAIL_KEY(email));
      if (!raw) return null;
      const until = Number(raw);
      if (Number.isNaN(until)) return null;
      return until;
    } catch (e) {
      return null;
    }
  };

  const getResendRemainingEmail = (email) => {
    try {
      if (!email) return 0;
      const rawUntil = getResendUntilEmail(email);
      if (!rawUntil) return 0;
      const sec = Math.ceil(Math.max(0, (rawUntil - Date.now()) / 1000));
      return sec;
    } catch (e) {
      return 0;
    }
  };

  const getResendInitialTtlEmail = (email) => {
    try {
      const raw = localStorage.getItem(RESEND_EMAIL_TTL_KEY(email));
      if (!raw) return 60;
      const ttl = Number(raw);
      if (Number.isNaN(ttl)) return 60;
      return ttl;
    } catch (e) {
      return 60;
    }
  };

  const sendEmailOtp = async (email) => {
    try {
      const res = await API.post("/auth/send-email-otp", { email });
      const serverRetry = res?.data?.retryAfter || res?.data?.full?.retryAfter || null;
      if (serverRetry) {
        setResendUntilEmail(email, Number(serverRetry));
      } else {
        setResendUntilEmail(email, 60);
      }
      return res;
    } catch (error) {
      const retry = error?.response?.data?.retryAfter || error?.response?.data?.retry_after || null;
      if (retry) setResendUntilEmail(email, Number(retry));
      throw error;
    }
  };

  const formatSecondsMMSS = (seconds) => {
    const s = Math.max(0, Number(seconds) || 0);
    const mm = Math.floor(s / 60).toString().padStart(2, "0");
    const ss = Math.floor(s % 60).toString().padStart(2, "0");
    return `${mm}:${ss}`;
  };

  const verifyOtp = async (payload) => {
    try {
      const res = await API.post("/auth/verify-otp", payload);
      if (res?.data?.user) {
        setUser(res.data.user);
        // backend may return either `token` or `accessToken` depending on implementation
        const token = res.data.token || res.data.accessToken;
        if (token) localStorage.setItem("token", token);
      }
      return res;
    } catch (error) {
      throw error;
    }
  };

  const login = async (phone, password) => {
    try {
      const res = await API.post("/auth/login", { phone, password });
      const token = res.data.token || res.data.accessToken;
      if (token) {
        localStorage.setItem("token", token);
        // Fetch profile immediately after login with credentials:include to ensure UI updates
        try {
          const profileRes = await API.get("/auth/profile", {
            withCredentials: true,
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          if (profileRes?.data) {
            setUser(profileRes.data);
          } else if (res?.data?.user) {
            setUser(res.data.user);
          }
        } catch (profileError) {
          console.warn("Profile fetch failed after login, using response data:", profileError);
          // Fallback to user data from login response
          if (res?.data?.user) {
            setUser(res.data.user);
          }
        }
      } else if (res?.data?.user) {
        setUser(res.data.user);
      }
      return res;
    } catch (error) {
      throw error;
    }
  };

  const logout = async () => {
    try {
      await API.post("/auth/logout");
    } catch (e) {
      // ignore errors
    } finally {
      localStorage.removeItem("token");
      setUser(null);
    }
  };

  const updateUser = (updatedUser) => {
    setUser(prevUser => ({ ...prevUser, ...updatedUser }));
  };

  const refreshUser = async () => {
    try {
      const res = await API.get("/auth/profile");
      setUser(res.data);
    } catch (err) {
      console.error("Failed to refresh user:", err);
    }
  };

  const forgotPassword = async (phone, email) => {
    try {
      const payload = phone ? { phone } : { email };
      const res = await API.post("/auth/forgot-password", payload);
      return res;
    } catch (error) {
      throw error;
    }
  };

  const resetPassword = async (payload) => {
    try {
      const res = await API.post("/auth/reset-password", payload);
      return res;
    } catch (error) {
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        sendOtp,
        normalizePhone,
        getResendRemaining,
        getResendInitialTtl,
  // email helpers
  sendEmailOtp,
  getResendRemainingEmail,
  getResendInitialTtlEmail,
        formatSecondsMMSS,
        verifyOtp,
        login,
        logout,
        updateUser,
        refreshUser,
        forgotPassword,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};


// import React, { createContext, useEffect, useState } from "react";
// import API from "../utils/api";

// export const AuthContext = createContext();

// export default function AuthProvider({ children }) {
//   const [user, setUser] = useState(null);
//   const [loading, setLoading] = useState(true);

//   // Check for existing token on mount
//   useEffect(() => {
//     const token = localStorage.getItem("token");
//     if (token) {
//       // Verify token by fetching profile
//       (async () => {
//         try {
//           const res = await API.get("/auth/profile");
//           setUser(res.data);
//         } catch (err) {
//           // Token is invalid, remove it
//           localStorage.removeItem("token");
//           setUser(null);
//         } finally {
//           setLoading(false);
//         }
//       })();
//     } else {
//       setLoading(false);
//     }
//   }, []);

//   const sendOtp = async (phone) => {
//     try {
//       const res = await API.post("/auth/send-otp", { phone });
//       return res;
//     } catch (error) {
//       throw error;
//     }
//   };

//   const verifyOtp = async (payload) => {
//     try {
//       const res = await API.post("/auth/verify-otp", payload);
//       if (res?.data?.user) {
//         setUser(res.data.user);
//         // Store token if provided
//         if (res.data.token) {
//           localStorage.setItem("token", res.data.token);
//         }
//       }
//       return res;
//     } catch (error) {
//       throw error;
//     }
//   };

//   const login = async (phone, password) => {
//     try {
//       const res = await API.post("/auth/login", { phone, password });
//       if (res?.data?.user) {
//         setUser(res.data.user);
//         // Store token if provided
//         if (res.data.token) {
//           localStorage.setItem("token", res.data.token);
//         }
//       }
//       return res;
//     } catch (error) {
//       throw error;
//     }
//   };

//   const logout = async () => {
//     try {
//       await API.post("/auth/logout");
//     } catch (e) {
//       // ignore errors
//     } finally {
//       // Clear local state and token
//       localStorage.removeItem("token");
//       setUser(null);
//     }
//   };

//   const updateUser = (updatedUser) => {
//     setUser(updatedUser);
//     // Force a re-render by updating the state
//     setUser(prevUser => ({ ...prevUser, ...updatedUser }));
//   };

//   const refreshUser = async () => {
//     try {
//       const res = await API.get("/auth/profile");
//       setUser(res.data);
//     } catch (err) {
//       console.error("Failed to refresh user:", err);
//     }
//   };

//   return (
//     <AuthContext.Provider value={{ 
//       user, 
//       loading, 
//       sendOtp, 
//       verifyOtp, 
//       login, 
//       logout,
//       updateUser,
//       refreshUser
//     }}>
//       {children}
//     </AuthContext.Provider>
//   );
// }

// // Custom hook to use auth context
// export const useAuth = () => {
//   const context = React.useContext(AuthContext);
//   if (!context) {
//     throw new Error('useAuth must be used within AuthProvider');
//   }
//   return context;
// };