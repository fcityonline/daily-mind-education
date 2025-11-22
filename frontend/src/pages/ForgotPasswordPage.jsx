// frontend/src/pages/ForgotPasswordPage.jsx
import React, { useState, useContext, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import DarkModeToggle from "../components/DarkModeToggle";
import "../styles/global.css";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState(1); // 1: Enter phone/email, 2: Enter OTP, 3: Reset password
  const [method, setMethod] = useState("sms"); // "sms" or "email"
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const { forgotPassword, resetPassword, sendOtp, sendEmailOtp, getResendRemaining, getResendRemainingEmail, formatSecondsMMSS, normalizePhone, getResendInitialTtl, getResendInitialTtlEmail } = useContext(AuthContext);
  const nav = useNavigate();

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      if (!phone && !email) {
        setError("Please enter phone or email");
        return;
      }

      // Use explicit method selection: only send via selected method
      if (method === "sms") {
        if (!phone) {
          setError("Please enter your phone number for SMS reset");
          return;
        }
        const res = await forgotPassword(phone, null);
        setMethod("sms");
        setSessionId(res.data.sessionId || "");
        setMessage(res.data.message || "OTP sent successfully");
        if (res.data.full?.debug || res.data.sessionId?.startsWith("DEV_SESSION_")) {
          setMessage("⚠️ Dev mode: OTP not sent. Use any 6-digit number for testing.");
        }
        const normalized = normalizePhone(phone || "");
        const rem = getResendRemaining(normalized);
        setResendSeconds(rem);
        setResendTotal(getResendInitialTtl ? getResendInitialTtl(normalized) : 60);
      } else {
        if (!email) {
          setError("Please enter your email for Email reset");
          return;
        }
        const res = await forgotPassword(null, email);
        setMethod("email");
        setMessage(res.data.message || "OTP sent successfully");
        if (res.data.debug?.otp) {
          setMessage(`Email OTP sent! (Dev mode OTP: ${res.data.debug.otp})`);
        }
        setResendSeconds(getResendRemainingEmail(email) || 0);
        setResendTotal(getResendInitialTtlEmail ? getResendInitialTtlEmail(email) : 60);
      }

      setStep(2);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  // resend countdown state for SMS flows
  const [resendSeconds, setResendSeconds] = useState(0);
  const [resendTotal, setResendTotal] = useState(60);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const t = setInterval(() => setResendSeconds(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendSeconds]);

  const handleResend = async () => {
    if (resendSeconds > 0) return;
    if (method === 'sms' && !phone) return;
    if (method === 'email' && !email) return;
    setLoading(true);
    setError("");
    try {
      if (method === 'sms') {
        const normalized = normalizePhone(phone);
        const res = await sendOtp(normalized);
        setSessionId(res?.data?.sessionId || "");
        const rem = getResendRemaining(normalized);
        setResendSeconds(rem || 60);
        setResendTotal(getResendInitialTtl ? getResendInitialTtl(normalized) : 60);
        setMessage(res.data.message || "OTP resent");
      } else {
        await sendEmailOtp(email);
        setResendSeconds(getResendRemainingEmail(email) || 0);
        setResendTotal(getResendInitialTtlEmail ? getResendInitialTtlEmail(email) : 60);
        setMessage("Email OTP resent");
      }
    } catch (err) {
      if (method === 'sms') {
        const rem = getResendRemaining(phone);
        if (rem > 0) {
          setResendSeconds(rem);
          setError(err.response?.data?.message || `Please wait ${rem}s before retrying`);
        } else {
          setError(err.response?.data?.message || "Failed to resend OTP");
        }
      } else {
        const rem = getResendRemainingEmail(email);
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

  const handleVerifyOtpAndReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      if (!otp) {
        setError("Please enter OTP");
        return;
      }

      if (!newPassword || !confirmPassword) {
        setError("Please enter new password and confirmation");
        return;
      }

      if (newPassword.length < 6) {
        setError("Password must be at least 6 characters");
        return;
      }

      if (newPassword !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }

      const payload = {
        method,
        newPassword,
        otp,
      };

      if (method === "sms") {
        payload.phone = phone;
        payload.sessionId = sessionId;
      } else {
        payload.email = email;
      }

      await resetPassword(payload);
      setMessage("Password reset successful! Redirecting to login...");
      setTimeout(() => {
        nav("/login");
      }, 2000);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || "Password reset failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <header className="header">
        <div className="logo">
          <img src="/imgs/logo-DME.png" alt="Logo" />
        </div>
        <DarkModeToggle />
        <h2>RESET PASSWORD</h2>
      </header>

      <div className="auth-container">
        <div className="auth-box">
          {step === 1 ? (
            <>
              <h2>Forgot Password?</h2>
              <p className="auth-subtitle">Choose a method to receive a reset OTP</p>
              
              {error && (
                <div className="error-message">
                  {error}
                </div>
              )}

              {message && (
                <div className="success-message" style={{ color: '#4caf50' }}>
                  {message}
                </div>
              )}

              <form onSubmit={handleRequestOtp}>
                <div className="input-group">
                  <label>Choose method</label>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="radio" name="fpMethod" value="sms" checked={method === 'sms'} onChange={() => setMethod('sms')} /> SMS
                    </label>
                    <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="radio" name="fpMethod" value="email" checked={method === 'email'} onChange={() => setMethod('email')} /> Email
                    </label>
                  </div>
                </div>
                <div className="input-group">
                  <label>Phone Number</label>
                  <input 
                    type="tel"
                    placeholder="Enter your phone number" 
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required={method === 'sms'}
                  />
                </div>

                <div style={{ textAlign: 'center', margin: '10px 0', color: '#999' }}>OR</div>

                <div className="input-group">
                  <label>Email Address</label>
                  <input 
                    type="email"
                    placeholder="Enter your email address" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required={method === 'email'}
                  />
                </div>

                <button 
                  type="submit" 
                  className="auth-button"
                  disabled={loading || (!phone && !email)}
                >
                  {loading ? "⌛️Sending OTP..." : "Send Reset OTP"}
                </button>
              </form>

              <div className="auth-footer">
                <Link to="/login">← Back to Login</Link>
              </div>
            </>
          ) : step === 2 ? (
            <>
              <h2>Verify OTP & Reset Password</h2>
              <p className="auth-subtitle">
                Enter the OTP sent to {method === "sms" ? phone : email}
              </p>
              
              {error && (
                <div className="error-message">
                  {error}
                </div>
              )}

              {message && (
                <div className="success-message" style={{ color: '#4caf50' }}>
                  {message}
                </div>
              )}

              <form onSubmit={handleVerifyOtpAndReset}>
                <div className="input-group">
                  <label>OTP Code</label>
                  <input 
                    type="text"
                    placeholder="Enter 6-digit OTP" 
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    maxLength="6"
                    required
                  />
                  {method === "sms" && (
                    <div style={{ marginTop: 8 }}>
                      <button type="button" className="back-button" onClick={handleResend} disabled={loading || resendSeconds > 0}>
                        {resendSeconds > 0 ? `Resend OTP (${formatSecondsMMSS(resendSeconds)})` : 'Resend OTP'}
                      </button>
                      {resendSeconds > 0 && (
                        <div style={{ height: 6, background: '#eee', borderRadius: 4, marginTop: 6 }}>
                          <div style={{ height: 6, borderRadius: 4, background: '#4caf50', width: `${Math.max(0, Math.min(100, Math.round(((resendTotal - resendSeconds)/resendTotal)*100)))}%` }} />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="input-group">
                  <label>New Password</label>
                  <input 
                    type="password" 
                    placeholder="Enter new password (min 6 characters)" 
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength="6"
                  />
                </div>

                <div className="input-group">
                  <label>Confirm Password</label>
                  <input 
                    type="password" 
                    placeholder="Confirm new password" 
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength="6"
                  />
                </div>

                <button 
                  type="submit" 
                  className="auth-button"
                  disabled={loading}
                >
                  {loading ? "⌛️Resetting Password..." : "Reset Password"}
                </button>
              </form>

              <div className="auth-footer">
                <button 
                  type="button"
                  className="back-button"
                  onClick={() => {
                    setStep(1);
                    setOtp("");
                    setNewPassword("");
                    setConfirmPassword("");
                    setError("");
                    setMessage("");
                  }}
                >
                  ← Back
                </button>
              </div>
            </>
          ) : null}

          <div className="auth-footer">
            <p>Remember your password? <Link to="/login">Sign In</Link></p>
          </div>
        </div>
      </div>
    </>
  );
}

