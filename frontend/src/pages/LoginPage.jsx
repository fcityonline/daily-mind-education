// frontend/src/pages/LoginPage.jsx

import React, { useContext, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import DarkModeToggle from "../components/DarkModeToggle";
import "../styles/global.css";

export default function LoginPage() {
  const [form, setForm] = useState({ phone: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { login, normalizePhone } = useContext(AuthContext);
  const nav = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (!form.phone || !form.password) {
        setError("Please fill in all fields");
        return;
      }

  const normalized = normalizePhone(form.phone);
  await login(normalized, form.password);
      nav("/home");
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || "Login failed");
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
        <h2>LOGIN</h2>
      </header>

      <div className="auth-container">
        <div className="auth-box">
          <h2>Daily Mind Education</h2>
          <p className="auth-subtitle">Sign in to your account</p>
          
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="input-group">
              <label>Phone Number</label>
              <input 
                type="tel"
                placeholder="Enter your phone number" 
                value={form.phone} 
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                required
              />
            </div>

            <div className="input-group">
              <label>Password</label>
              <input 
                type="password" 
                placeholder="Enter your password" 
                value={form.password} 
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>

            <button 
              type="submit" 
              className="auth-button"
              disabled={loading}
            >
              {loading ? "⌛️Signing In..." : "Sign In"}
            </button>
          </form>

          <div className="auth-footer">
            <p>Don't have an account? <Link to="/register">Sign Up</Link></p>
            <p style={{ marginTop: '10px' }}>
              <Link to="/forgot-password">Forgot Password?</Link>
            </p>

        <footer>
  <button onClick={() => window.location.href = '/help.html'}>Policy</button>
  <button onClick={() => window.location.href = '/help.html#help-section'}>Help</button>
          </footer>
          
          </div>
        </div>
      </div>
    </>
  );
}


