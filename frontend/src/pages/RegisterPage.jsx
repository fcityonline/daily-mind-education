// // frontend/src/pages/RegisterPage.jsx


// frontend/src/pages/RegisterPage.jsx
import React, { useState, useEffect, useContext } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import DarkModeToggle from "../components/DarkModeToggle";
import API from "../utils/api";
import "../styles/global.css";

export default function RegisterPage() {
  const [step, setStep] = useState(1); // 1: Form, 2: SMS OTP, 3: Email OTP
  const [form, setForm] = useState({ name: "", phone: "", email: "", password: "" });
  const [otpMethod, setOtpMethod] = useState("sms"); // 'sms' or 'email'
  const [smsSessionId, setSmsSessionId] = useState("");
  const [smsOtp, setSmsOtp] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [resendSeconds, setResendSeconds] = useState(0);
  const [resendTotal, setResendTotal] = useState(60);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { sendOtp, sendEmailOtp, verifyOtp, getResendRemaining, getResendRemainingEmail, formatSecondsMMSS, normalizePhone, getResendInitialTtl, getResendInitialTtlEmail } = useContext(AuthContext);
  const nav = useNavigate();

  // initialize countdown from persisted storage for the current phone/email
  useEffect(() => {
    if (otpMethod === "sms") {
      const normalized = normalizePhone(form.phone || "");
      if (!normalized) return;
      const rem = getResendRemaining(normalized);
      setResendSeconds(rem);
      const ttl = getResendInitialTtl ? getResendInitialTtl(normalized) : 60;
      setResendTotal(ttl);
    } else {
      if (!form.email) return;
      const rem = getResendRemainingEmail(form.email);
      setResendSeconds(rem);
      const ttl = getResendInitialTtlEmail ? getResendInitialTtlEmail(form.email) : 60;
      setResendTotal(ttl);
    }
  }, [form.phone, form.email, otpMethod, getResendRemaining, getResendRemainingEmail, normalizePhone, getResendInitialTtl, getResendInitialTtlEmail]);

  // Countdown interval
  useEffect(() => {
    if (resendSeconds <= 0) return;
    const t = setInterval(() => setResendSeconds(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendSeconds]);

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Basic validation
      if (!form.name || !form.password) {
        setError("Please fill in all required fields");
        return;
      }
      if (form.password.length < 6) {
        setError("Password must be at least 6 characters");
        return;
      }

      if (otpMethod === "sms") {
        if (!form.phone) {
          setError("Phone is required for SMS OTP");
          return;
        }
        const res = await sendOtp(form.phone);
        const sessionId = res?.data?.sessionId || res?.data?.SessionId || res?.data?.Details || res?.data?.full?.SessionId || "";
        setSmsSessionId(sessionId);

        const rem = getResendRemaining(form.phone);
        setResendSeconds(rem || 60);
        const ttl = getResendInitialTtl ? getResendInitialTtl(normalizePhone(form.phone)) : 60;
        setResendTotal(ttl);

        setStep(2);
      } else {
        // email OTP flow (email optional)
        if (form.email && form.email.trim() !== "") {
          await sendEmailOtp(form.email);
          setResendSeconds(getResendRemainingEmail(form.email) || 60);
          const ttl = getResendInitialTtlEmail ? getResendInitialTtlEmail(form.email) : 60;
          setResendTotal(ttl);
        }
        // always require phone
        if (!form.phone) {
          setError("Phone number is required");
          return;
        }
        // move to email OTP step if email provided, else stay on form (or handle accordingly)
        setStep(3);
      }
    } catch (err) {
      console.error(err);
      if (otpMethod === "sms") {
        const rem = getResendRemaining(form.phone);
        if (rem > 0) {
          setResendSeconds(rem);
          setError(err.response?.data?.message || `Please wait ${rem}s before retrying`);
        } else {
          setError(err.response?.data?.message || "Failed to send SMS OTP");
        }
      } else {
        const rem = getResendRemainingEmail(form.email);
        if (rem > 0) {
          setResendSeconds(rem);
          setError(err.response?.data?.message || `Please wait ${rem}s before retrying`);
        } else {
          setError(err.response?.data?.message || "Failed to send Email OTP");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendSms = async () => {
    if (resendSeconds > 0) return;
    setLoading(true);
    setError("");
    try {
      if (otpMethod === "sms") {
        const sanitizedPhone = String(form.phone).replace(/\D/g, "").replace(/^0+/, "");
        const finalPhone = sanitizedPhone.length > 10 && sanitizedPhone.startsWith("91") ? sanitizedPhone.slice(-10) : (sanitizedPhone.length > 10 ? sanitizedPhone.slice(-10) : sanitizedPhone);

        const res = await sendOtp(finalPhone);
        const sessionId = res?.data?.sessionId || res?.data?.SessionId || res?.data?.Details || res?.data?.full?.SessionId || "";
        setSmsSessionId(sessionId);
        setForm(f => ({ ...f, phone: finalPhone }));

        const rem = getResendRemaining(finalPhone);
        setResendSeconds(rem || 60);
        const ttl = getResendInitialTtl ? getResendInitialTtl(normalizePhone(finalPhone)) : 60;
        setResendTotal(ttl);
      } else {
        // resend email OTP
        if (form.email && form.email.trim() !== "") {
          await sendEmailOtp(form.email);
          setResendSeconds(getResendRemainingEmail(form.email) || 60);
          const ttl = getResendInitialTtlEmail ? getResendInitialTtlEmail(form.email) : 60;
          setResendTotal(ttl);
        }
      }
    } catch (err) {
      console.error("Resend SMS error", err);
      if (otpMethod === "sms") {
        const rem = getResendRemaining(form.phone);
        if (rem > 0) {
          setResendSeconds(rem);
          setError(err.response?.data?.message || `Please wait ${rem}s before retrying`);
        } else {
          setError(err.response?.data?.message || "Failed to resend SMS OTP");
        }
      } else {
        const rem = getResendRemainingEmail(form.email);
        if (rem > 0) {
          setResendSeconds(rem);
          setError(err.response?.data?.message || `Please wait ${rem}s before retrying`);
        } else {
          setError(err.response?.data?.message || "Failed to resend Email OTP");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySmsOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (!smsOtp) {
        setError("Please enter SMS OTP");
        return;
      }
      // email is optional, but if provided, include in payload
      if (form.email && form.email.trim() !== "") {
        // ok
      } else {
        // no email, optional
      }

      try {
        const payload = {
          phone: form.phone,
          otp: smsOtp,
          sessionId: smsSessionId,
          name: form.name,
          password: form.password,
        };
        if (form.email && form.email.trim() !== "") {
          payload.email = form.email;
        }

        const verifyRes = await verifyOtp(payload);
        if (verifyRes?.data?.user || verifyRes?.data?.token || verifyRes?.data?.accessToken) {
          nav("/home");
          return;
        }

        if (verifyRes?.data?.requiresEmailOtp || verifyRes?.data?.phoneVerified) {
          await API.post("/auth/send-email-otp", { email: form.email });
          setStep(3);
          return;
        }

        await API.post("/auth/verify-otp", { phone: form.phone, otp: smsOtp });
        if (form.email && form.email.trim() !== "") {
          await API.post("/auth/send-email-otp", { email: form.email });
        }
        setStep(3);
      } catch (err) {
        console.error(err);
        setError(err.response?.data?.message || err.message || "SMS OTP verification failed");
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || "SMS OTP verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmailOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (!emailOtp) {
        setError("Please enter Email OTP");
        return;
      }

      // Verify email OTP first
      const res = await API.post("/auth/verify-email-otp", {
        email: form.email,
        otp: emailOtp,
        name: form.name,
        phone: form.phone,
        password: form.password,
      });
      const token = res?.data?.token || res?.data?.accessToken;
      if (token) {
        localStorage.setItem("token", token);
      }
      nav("/home");
      return;
    } catch (err) {
      console.error(err);
      const errorMsg = err.response?.data?.message || "Email OTP verification failed";
      setError(errorMsg);
      if (err.response?.data?.requiresEmailOtp && err.response?.data?.phoneVerified) {
        setStep(3);
      }
    } finally {
      setLoading(false);
    }
  };

  const progressPct = resendTotal > 0 ? Math.round(((resendTotal - resendSeconds) / resendTotal) * 100) : 0;

  return (
    <>
      <header className="header">
        <div className="logo">
          <img src="/imgs/logo-DME.png" alt="Logo" />
        </div>
        <DarkModeToggle />
        <h2>REGISTER</h2>
      </header>

      <div className="auth-container">
        <div className="auth-box">
          {step === 1 ? (
            <>
              <h2>Create Account</h2>
              <p className="auth-subtitle">Join our community today</p>
              {error && <div className="error-message">{error}</div>}

              <form onSubmit={handleSendOtp}>
                <div className="input-group">
                  <label>Full Name *</label>
                  <input
                    type="text"
                    placeholder="Enter your full name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </div>

                <div className="input-group">
                  <label>Choose OTP method</label>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="radio" name="otpMethod" value="sms" checked={otpMethod === 'sms'} onChange={() => setOtpMethod('sms')} /> SMS
                    </label>
                    <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="radio" name="otpMethod" value="email" checked={otpMethod === 'email'} onChange={() => setOtpMethod('email')} /> Email
                    </label>
                  </div>
                </div>

                <div className="input-group">
                  <label>Phone Number *</label>
                  <input
                    type="tel"
                    placeholder="Enter your phone number"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    required
                  />
                </div>

                <div className="input-group">
                  <label>Email Address</label> {/* Remove * to indicate optional */}
                  <input
                    type="email"
                    placeholder="Enter your email address"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                  <small style={{ color: '#999', fontSize: '12px' }}>
                    Choose any one method — you'll receive an OTP via the selected method(s).
                  </small>
                </div>

                <div className="input-group">
                  <label>Password *</label>
                  <input
                    type="password"
                    placeholder="Create a password (min 6 characters)"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required
                    minLength="6"
                  />
                </div>

                <button type="submit" className="auth-button" disabled={loading}>
                  {loading ? "⌛️Sending OTP..." : (otpMethod === 'sms' ? 'Send SMS OTP' : 'Send Email OTP')}
                </button>
              </form>
            </>
          ) : step === 2 ? (
            <>
              <h2>Verify SMS OTP</h2>
              <p className="auth-subtitle">Enter the OTP sent to {form.phone}</p>
              {error && <div className="error-message">{error}</div>}

              <form onSubmit={handleVerifySmsOtp}>
                <div className="input-group">
                  <label>SMS OTP Code</label>
                  <input
                    type="text"
                    placeholder="Enter 6-digit OTP"
                    value={smsOtp}
                    onChange={(e) => setSmsOtp(e.target.value)}
                    maxLength="6"
                    required
                  />
                </div>

                <button type="submit" className="auth-button" disabled={loading}>
                  {loading ? "⌛️Verifying..." : form.email ? "Verify & Continue" : "Verify & Register"}
                </button>
              </form>

              <div className="auth-footer" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button type="button" className="back-button" onClick={() => { setStep(1); setSmsOtp(""); setError(""); }}>
                  ← Back to Registration
                </button>

                <div style={{ marginLeft: 'auto', minWidth: 180 }}>
                  <button type="button" className="back-button" onClick={handleResendSms} disabled={loading || resendSeconds > 0}>
                    {resendSeconds > 0 ? `Resend OTP (${formatSecondsMMSS(resendSeconds)})` : 'Resend OTP'}
                  </button>
                  {resendSeconds > 0 && (
                    <div style={{ height: 6, background: '#eee', borderRadius: 4, marginTop: 6 }}>
                      <div style={{ height: 6, borderRadius: 4, background: '#4caf50', width: `${Math.max(0, Math.min(100, progressPct))}%` }} />
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <h2>Verify Email OTP</h2>
              <p className="auth-subtitle">Enter the OTP sent to {form.email}</p>
              {error && <div className="error-message">{error}</div>}

              <form onSubmit={handleVerifyEmailOtp}>
                <div className="input-group">
                  <label>Email OTP Code</label>
                  <input
                    type="text"
                    placeholder="Enter 6-digit OTP"
                    value={emailOtp}
                    onChange={(e) => setEmailOtp(e.target.value)}
                    maxLength="6"
                    required
                  />
                </div>

                <button type="submit" className="auth-button" disabled={loading}>
                  {loading ? "⌛️Verifying..." : "Complete Registration"}
                </button>
              </form>

              <div className="auth-footer">
                <button type="button" className="back-button" onClick={() => { setStep(2); setEmailOtp(""); setError(""); }}>
                  ← Back to SMS OTP
                </button>
              </div>
            </>
          )}

          <div className="auth-footer">
            <p>Already have an account? <Link to="/login">Sign In</Link></p>
          </div>
        </div>
      </div>
    </>
  );
}






// import React, { useState, useEffect, useContext } from "react";
// import { useNavigate, Link } from "react-router-dom";
// import { AuthContext } from "../context/AuthContext";
// import DarkModeToggle from "../components/DarkModeToggle";
// import API from "../utils/api";
// import "../styles/global.css";

// export default function RegisterPage() {
//   const [step, setStep] = useState(1); // 1: Form, 2: SMS OTP, 3: Email OTP
//   const [form, setForm] = useState({ name: "", phone: "", email: "", password: "" });
//   const [otpMethod, setOtpMethod] = useState("sms"); // 'sms' or 'email'
//   const [smsSessionId, setSmsSessionId] = useState("");
//   const [smsOtp, setSmsOtp] = useState("");
//   const [emailOtp, setEmailOtp] = useState("");
//   const [resendSeconds, setResendSeconds] = useState(0);
//   const [resendTotal, setResendTotal] = useState(60);
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState("");

//   const { sendOtp, sendEmailOtp, verifyOtp, getResendRemaining, getResendRemainingEmail, formatSecondsMMSS, normalizePhone, getResendInitialTtl, getResendInitialTtlEmail } = useContext(AuthContext);
//   const nav = useNavigate();

//   // initialize countdown from persisted storage for the current phone
//   useEffect(() => {
//     // initialize countdown from persisted storage for the current phone or email depending on method
//     if (otpMethod === "sms") {
//       const normalized = normalizePhone(form.phone || "");
//       if (!normalized) return;
//       const rem = getResendRemaining(normalized);
//       setResendSeconds(rem);
//       const ttl = getResendInitialTtl ? getResendInitialTtl(normalized) : 60;
//       setResendTotal(ttl);
//     } else {
//       if (!form.email) return;
//       const rem = getResendRemainingEmail(form.email);
//       setResendSeconds(rem);
//       const ttl = getResendInitialTtlEmail ? getResendInitialTtlEmail(form.email) : 60;
//       setResendTotal(ttl);
//     }
//   }, [form.phone, form.email, otpMethod, getResendRemaining, getResendRemainingEmail, normalizePhone, getResendInitialTtl, getResendInitialTtlEmail]);

//   // Countdown interval
//   useEffect(() => {
//     if (resendSeconds <= 0) return;
//     const t = setInterval(() => setResendSeconds(s => Math.max(0, s - 1)), 1000);
//     return () => clearInterval(t);
//   }, [resendSeconds]);

//   const handleSendOtp = async (e) => {
//     e.preventDefault();
//     setLoading(true);
//     setError("");

//     try {
//       if (!form.name || !form.password) {
//         setError("Please fill in all required fields");
//         return;
//       }
//       if (form.password.length < 6) {
//         setError("Password must be at least 6 characters");
//         return;
//       }

//       if (otpMethod === "sms") {
//         if (!form.phone) {
//           setError("Phone is required for SMS OTP");
//           return;
//         }
//         const res = await sendOtp(form.phone);
//         const sessionId = res?.data?.sessionId || res?.data?.SessionId || res?.data?.Details || res?.data?.full?.SessionId || "";
//         setSmsSessionId(sessionId);

//         const rem = getResendRemaining(form.phone);
//         setResendSeconds(rem || 60);
//         const ttl = getResendInitialTtl ? getResendInitialTtl(normalizePhone(form.phone)) : 60;
//         setResendTotal(ttl);

//         setStep(2);
//       } else {
//         // email-first flow: require email and phone (phone will be used after email verification to complete registration)
//         if (!form.email) {
//           setError("Email is required for Email OTP");
//           return;
//         }
//         if (!form.phone) {
//           setError("Please provide a phone number as well - we will send SMS to complete registration after email verification.");
//           return;
//         }

//   await sendEmailOtp(form.email);
//   setResendSeconds(getResendRemainingEmail(form.email) || 60);
//         const ttl = getResendInitialTtlEmail ? getResendInitialTtlEmail(form.email) : 60;
//         setResendTotal(ttl);

//         // move to email verification step
//         setStep(3);
//       }
//     } catch (err) {
//       console.error(err);
//       if (otpMethod === "sms") {
//         const rem = getResendRemaining(form.phone);
//         if (rem > 0) {
//           setResendSeconds(rem);
//           setError(err.response?.data?.message || `Please wait ${rem}s before retrying`);
//         } else {
//           setError(err.response?.data?.message || "Failed to send SMS OTP");
//         }
//       } else {
//         const rem = getResendRemainingEmail(form.email);
//         if (rem > 0) {
//           setResendSeconds(rem);
//           setError(err.response?.data?.message || `Please wait ${rem}s before retrying`);
//         } else {
//           setError(err.response?.data?.message || "Failed to send Email OTP");
//         }
//       }
//     } finally {
//       setLoading(false);
//     }
//   };

//   const handleResendSms = async () => {
//     if (resendSeconds > 0) return;
//     setLoading(true);
//     setError("");
//     try {
//       if (otpMethod === "sms") {
//         // sanitize phone to consistent 10-digit
//         const sanitizedPhone = String(form.phone).replace(/\D/g, "").replace(/^0+/, "");
//         const finalPhone = sanitizedPhone.length > 10 && sanitizedPhone.startsWith("91") ? sanitizedPhone.slice(-10) : (sanitizedPhone.length > 10 ? sanitizedPhone.slice(-10) : sanitizedPhone);

//         const res = await sendOtp(finalPhone);
//         const sessionId = res?.data?.sessionId || res?.data?.SessionId || res?.data?.Details || res?.data?.full?.SessionId || "";
//         setSmsSessionId(sessionId);
//         setForm(f => ({ ...f, phone: finalPhone }));

//         const rem = getResendRemaining(finalPhone);
//         setResendSeconds(rem || 60);
//         const ttl = getResendInitialTtl ? getResendInitialTtl(normalizePhone(finalPhone)) : 60;
//         setResendTotal(ttl);
//       } else {
//         // resend email OTP
//   await sendEmailOtp(form.email);
//   setResendSeconds(getResendRemainingEmail(form.email) || 60);
//         const ttl = getResendInitialTtlEmail ? getResendInitialTtlEmail(form.email) : 60;
//         setResendTotal(ttl);
//       }
//     } catch (err) {
//       console.error("Resend SMS error", err);
//       if (otpMethod === "sms") {
//         const rem = getResendRemaining(form.phone);
//         if (rem > 0) {
//           setResendSeconds(rem);
//           setError(err.response?.data?.message || `Please wait ${rem}s before retrying`);
//         } else {
//           setError(err.response?.data?.message || "Failed to resend SMS OTP");
//         }
//       } else {
//         const rem = getResendRemainingEmail(form.email);
//         if (rem > 0) {
//           setResendSeconds(rem);
//           setError(err.response?.data?.message || `Please wait ${rem}s before retrying`);
//         } else {
//           setError(err.response?.data?.message || "Failed to resend Email OTP");
//         }
//       }
//     } finally {
//       setLoading(false);
//     }
//   };

//   const handleVerifySmsOtp = async (e) => {
//     e.preventDefault();
//     setLoading(true);
//     setError("");

//     try {
//       if (!smsOtp) {
//         setError("Please enter SMS OTP");
//         return;
//       }
//       if (!form.email || !form.email.trim()) {
//         setError("Email is required for registration");
//         return;
//       }

//       try {
//         const payload = {
//           phone: form.phone,
//           otp: smsOtp,
//           sessionId: smsSessionId,
//           name: form.name,
//           password: form.password,
//           email: form.email,
//         };

//         const verifyRes = await verifyOtp(payload);
//         if (verifyRes?.data?.user || verifyRes?.data?.token || verifyRes?.data?.accessToken) {
//           nav("/home");
//           return;
//         }

//         if (verifyRes?.data?.requiresEmailOtp || verifyRes?.data?.phoneVerified) {
//           await API.post("/auth/send-email-otp", { email: form.email });
//           setStep(3);
//           return;
//         }

//         await API.post("/auth/verify-otp", { phone: form.phone, otp: smsOtp });
//         await API.post("/auth/send-email-otp", { email: form.email });
//         setStep(3);
//       } catch (err) {
//         console.error(err);
//         setError(err.response?.data?.message || err.message || "SMS OTP verification failed");
//       }
//     } catch (err) {
//       console.error(err);
//       setError(err.response?.data?.message || "SMS OTP verification failed");
//     } finally {
//       setLoading(false);
//     }
//   };

//   const handleVerifyEmailOtp = async (e) => {
//     e.preventDefault();
//     setLoading(true);
//     setError("");

//     try {
//       if (!emailOtp) {
//         setError("Please enter Email OTP");
//         return;
//       }

//       // Verify email OTP first. Backend's verify-email-otp endpoint will mark the email as verified
//       // For registration, we then send SMS OTP to complete phone verification (which creates the account)
//       try {
//         // Send registration fields with email verification so backend can create the user
//         const res = await API.post("/auth/verify-email-otp", {
//           email: form.email,
//           otp: emailOtp,
//           name: form.name,
//           phone: form.phone,
//           password: form.password,
//         });

//         // If backend returned a token (created user), store it and navigate home
//         const token = res?.data?.token || res?.data?.accessToken;
//         if (token) {
//           localStorage.setItem("token", token);
//         }
//         nav("/home");
//         return;
//       } catch (err) {
//         console.error(err);
//         const errorMsg = err.response?.data?.message || "Email OTP verification failed";
//         setError(errorMsg);
//       }
//     } catch (err) {
//       console.error(err);
//       const errorMsg = err.response?.data?.message || "Email OTP verification failed";
//       setError(errorMsg);
//       if (err.response?.data?.requiresEmailOtp && err.response?.data?.phoneVerified) {
//         setStep(3);
//       }
//     } finally {
//       setLoading(false);
//     }
//   };

//   const progressPct = resendTotal > 0 ? Math.round(((resendTotal - resendSeconds) / resendTotal) * 100) : 0;

//   return (
//     <>
//       <header className="header">
//         <div className="logo">
//           <img src="/imgs/logo-DME.png" alt="Logo" />
//         </div>
//         <DarkModeToggle />
//         <h2>REGISTER</h2>
//       </header>

//       <div className="auth-container">
//         <div className="auth-box">
//           {step === 1 ? (
//             <>
//               <h2>Create Account</h2>
//               <p className="auth-subtitle">Join our community today</p>
//               {error && <div className="error-message">{error}</div>}

//               <form onSubmit={handleSendOtp}>
//                 <div className="input-group">
//                   <label>Full Name *</label>
//                   <input
//                     type="text"
//                     placeholder="Enter your full name"
//                     value={form.name}
//                     onChange={(e) => setForm({ ...form, name: e.target.value })}
//                     required
//                   />
//                 </div>

//                 <div className="input-group">
//                   <label>Choose OTP method</label>
//                   <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
//                     <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
//                       <input type="radio" name="otpMethod" value="sms" checked={otpMethod === 'sms'} onChange={() => setOtpMethod('sms')} /> SMS
//                     </label>
//                     <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
//                       <input type="radio" name="otpMethod" value="email" checked={otpMethod === 'email'} onChange={() => setOtpMethod('email')} /> Email
//                     </label>
//                   </div>
//                 </div>

//                 <div className="input-group">
//                   <label>Phone Number *</label>
//                   <input
//                     type="tel"
//                     placeholder="Enter your phone number"
//                     value={form.phone}
//                     onChange={(e) => setForm({ ...form, phone: e.target.value })}
//                     required
//                   />
//                 </div>

//                 <div className="input-group">
//                   <label>Email Address *</label>
//                   <input
//                     type="email"
//                     placeholder="Enter your email address"
//                     value={form.email}
//                     onChange={(e) => setForm({ ...form, email: e.target.value })}
//                     required
//                   />
//                   <small style={{ color: '#999', fontSize: '12px' }}>
//                     Choose one method — you'll receive a single OTP via the selected method to complete registration.
//                   </small>
//                 </div>

//                 <div className="input-group">
//                   <label>Password *</label>
//                   <input
//                     type="password"
//                     placeholder="Create a password (min 6 characters)"
//                     value={form.password}
//                     onChange={(e) => setForm({ ...form, password: e.target.value })}
//                     required
//                     minLength="6"
//                   />
//                 </div>

//                 <button type="submit" className="auth-button" disabled={loading}>
//                   {loading ? "Sending OTP..." : (otpMethod === 'sms' ? 'Send SMS OTP' : 'Send Email OTP')}
//                 </button>
//               </form>
//             </>
//           ) : step === 2 ? (
//             <>
//               <h2>Verify SMS OTP</h2>
//               <p className="auth-subtitle">Enter the OTP sent to {form.phone}</p>
//               {error && <div className="error-message">{error}</div>}

//               <form onSubmit={handleVerifySmsOtp}>
//                 <div className="input-group">
//                   <label>SMS OTP Code</label>
//                   <input
//                     type="text"
//                     placeholder="Enter 6-digit OTP"
//                     value={smsOtp}
//                     onChange={(e) => setSmsOtp(e.target.value)}
//                     maxLength="6"
//                     required
//                   />
//                 </div>

//                 <button type="submit" className="auth-button" disabled={loading}>
//                   {loading ? "Verifying..." : form.email ? "Verify & Continue" : "Verify & Register"}
//                 </button>
//               </form>

//               <div className="auth-footer" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
//                 <button type="button" className="back-button" onClick={() => { setStep(1); setSmsOtp(""); setError(""); }}>
//                   ← Back to Registration
//                 </button>

//                 <div style={{ marginLeft: 'auto', minWidth: 180 }}>
//                   <button type="button" className="back-button" onClick={handleResendSms} disabled={loading || resendSeconds > 0}>
//                     {resendSeconds > 0 ? `Resend OTP (${formatSecondsMMSS(resendSeconds)})` : 'Resend OTP'}
//                   </button>
//                   {resendSeconds > 0 && (
//                     <div style={{ height: 6, background: '#eee', borderRadius: 4, marginTop: 6 }}>
//                       <div style={{ height: 6, borderRadius: 4, background: '#4caf50', width: `${Math.max(0, Math.min(100, progressPct))}%` }} />
//                     </div>
//                   )}
//                 </div>
//               </div>
//             </>
//           ) : (
//             <>
//               <h2>Verify Email OTP</h2>
//               <p className="auth-subtitle">Enter the OTP sent to {form.email}</p>
//               {error && <div className="error-message">{error}</div>}

//               <form onSubmit={handleVerifyEmailOtp}>
//                 <div className="input-group">
//                   <label>Email OTP Code</label>
//                   <input
//                     type="text"
//                     placeholder="Enter 6-digit OTP"
//                     value={emailOtp}
//                     onChange={(e) => setEmailOtp(e.target.value)}
//                     maxLength="6"
//                     required
//                   />
//                 </div>

//                 <button type="submit" className="auth-button" disabled={loading}>
//                   {loading ? "Verifying..." : "Complete Registration"}
//                 </button>
//               </form>

//               <div className="auth-footer">
//                 <button type="button" className="back-button" onClick={() => { setStep(2); setEmailOtp(""); setError(""); }}>
//                   ← Back to SMS OTP
//                 </button>
//               </div>
//             </>
//           )}

//           <div className="auth-footer">
//             <p>Already have an account? <Link to="/login">Sign In</Link></p>
//           </div>
//         </div>
//       </div>
//     </>
//   );
// }

