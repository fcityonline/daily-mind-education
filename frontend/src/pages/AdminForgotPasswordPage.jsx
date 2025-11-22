// frontend/src/pages/AdminForgotPasswordPage.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminAuth } from "../context/AdminAuthContext";
import "../styles/global.css";

export default function AdminForgotPasswordPage() {
  const navigate = useNavigate();
  const { forgotAdminPassword, resetAdminPassword } = useAdminAuth();

  const [step, setStep] = useState(1); // 1: Enter phone/email, 2: Enter OTP & new password
  const [method, setMethod] = useState(""); // "sms" or "email"
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    document.body.classList.toggle("dark", darkMode);
  }, [darkMode]);

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

      const result = await forgotAdminPassword(phone || null, email || null);
      if (result.success) {
        setMethod(result.data.method);
        setSessionId(result.data.sessionId || "");
        setStep(2);
        setMessage(result.data.message || "OTP sent successfully");
      } else {
        setError(result.error);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to send OTP");
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

      const result = await resetAdminPassword(payload);
      if (result.success) {
        setMessage("Password reset successful! Redirecting to login...");
        setTimeout(() => {
          navigate("/admin-login");
        }, 2000);
      } else {
        setError(result.error);
      }
    } catch (err) {
      console.error(err);
      setError("Password reset failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`admin-forgot-password-page ${darkMode ? "dark" : ""}`}>
      <button className="back-btn" onClick={() => navigate("/admin-login")}>
        ← Back
      </button>
      <button className="dark-toggle" onClick={() => setDarkMode(!darkMode)}>
        {darkMode ? "☀️" : "🌙"}
      </button>

      <div className="forgot-password-box">
        <div className="logo0">
          <img src="/imgs/logo-DME.png" alt="Logo" />
        </div>
        <h1>Daily Mind Education</h1>
        <h2>Admin Password Reset</h2>
        <p>
          {step === 1
            ? "Enter your phone or email to receive reset OTP"
            : "Enter OTP and new password"}
        </p>

        {step === 1 ? (
          <form onSubmit={handleRequestOtp}>
            <input
              type="tel"
              placeholder="Phone Number"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setEmail("");
              }}
            />
            <div style={{ textAlign: "center", margin: "10px 0", color: "#999" }}>
              OR
            </div>
            <input
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setPhone("");
              }}
            />
            <button type="submit" className="auth-btn" disabled={loading || (!phone && !email)}>
              {loading ? "⌛️Sending OTP..." : "Send Reset OTP"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtpAndReset}>
            <input
              type="text"
              placeholder="Enter 6-digit OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              maxLength="6"
              required
            />
            <input
              type="password"
              placeholder="New Password (min 6 characters)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength="6"
            />
            <input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength="6"
            />
            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? "⌛️Resetting Password..." : "Reset Password"}
            </button>
            <button
              type="button"
              className="resend-btn"
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
          </form>
        )}

        {error && <div className="error-message">{error}</div>}
        {message && (
          <div className="success-message" style={{ color: "#4caf50" }}>
            {message}
          </div>
        )}
      </div>

      {loading && (
        <div className="spinner-overlay">
          <div className="spinner"></div>
        </div>
      )}

      <style>{`
        .admin-forgot-password-page {
          background: linear-gradient(to bottom, #3b060e, #200307, #000000);
          color: white;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 20px;
          transition: background 0.4s ease, color 0.4s ease;
        }

        .dark {
          background: #121212;
          color: #eee;
        }

        .back-btn, .dark-toggle {
          position: fixed;
          top: 20px;
          background: rgba(255, 255, 255, 0.1);
          color: white;
          padding: 8px 15px;
          border: none;
          border-radius: 20px;
          font-size: 14px;
          cursor: pointer;
          z-index: 1000;
        }

        .back-btn { left: 20px; }
        .dark-toggle { right: 20px; }

        .forgot-password-box {
          max-width: 400px;
          width: 100%;
          background-color: rgba(255, 255, 255, 0.05);
          padding: 30px;
          border-radius: 20px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
          margin-top: 50px;
          text-align: center;
        }

        .dark .forgot-password-box {
          background-color: #1e1e1e;
        }

        .logo0 img {
          width: 125px;
          height: auto;
        }

        input {
          width: 100%;
          padding: 12px;
          margin-bottom: 15px;
          border: none;
          border-radius: 10px;
          font-size: 16px;
          background: #f4f4f4;
          color: #000;
          box-sizing: border-box;
        }

        .dark input {
          background: #2b2b2b;
          color: #eee;
          border: 1px solid #555;
        }

        .auth-btn {
          width: 100%;
          background: green;
          color: white;
          padding: 12px;
          font-size: 18px;
          border: none;
          border-radius: 30px;
          cursor: pointer;
          margin-top: 10px;
        }

        .auth-btn:hover:not(:disabled) {
          background: #008000;
        }

        .auth-btn:disabled {
          background: #666;
          cursor: not-allowed;
        }

        .resend-btn {
          width: 100%;
          background: transparent;
          color: white;
          padding: 10px;
          font-size: 14px;
          border: 1px solid #888;
          border-radius: 20px;
          cursor: pointer;
          margin-top: 10px;
        }

        .error-message, .success-message {
          margin-top: 15px;
          font-weight: 600;
        }

        .error-message {
          color: #f44336;
        }

        .spinner-overlay {
          position: fixed;
          top: 0;
          left: 0;
          height: 100%;
          width: 100%;
          background: rgba(0, 0, 0, 0.85);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 9999;
        }

        .spinner {
          border: 8px solid #f3f3f3;
          border-top: 8px solid #00ff00;
          border-radius: 50%;
          width: 60px;
          height: 60px;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

