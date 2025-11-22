// // frontend/src/pages/AdminRegisterPage.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';
import API from '../utils/api.js';

export default function AdminRegisterPage() {
  const navigate = useNavigate();
  const { admin, adminRegister, sendAdminOtp } = useAdminAuth();

  const [step, setStep] = useState(1);
  const [otpMethod, setOtpMethod] = useState('sms'); // 'sms' or 'email' - single method selection
  const [formData, setFormData] = useState({
    fullName: '',
    username: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [otpData, setOtpData] = useState({
    sessionId: '',
    otp: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    if (admin) {
      navigate('/admin-dashboard');
    }
  }, [admin, navigate]);

  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
  }, [darkMode]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setMessage('');
  };

  const handleOtpChange = (e) => {
    setOtpData({ ...otpData, [e.target.name]: e.target.value });
    setMessage('');
  };

  const handleResendOtp = async () => {
    if (!validateForm()) return;
    setIsLoading(true);
    setMessage('');
    
    const payload = {
      fullName: formData.fullName,
      username: formData.username,
      method: otpMethod
    };
    
    if (otpMethod === 'sms') {
      payload.phone = formData.phone;
    } else {
      payload.email = formData.email;
    }
    
    const result = await sendAdminOtp(payload);
    if (result.success) {
      if (otpMethod === 'sms') {
        // Preserve existing OTP input but update sessionId
        setOtpData(prev => ({ ...prev, sessionId: result.data.sessionId }));
        setMessage('SMS OTP resent successfully! Please check your phone.');
      } else {
        setMessage('Email OTP resent successfully! Please check your email.');
      }
    } else {
      setMessage(result.error);
    }
    setIsLoading(false);
  };

  const validateForm = () => {
    if (!formData.fullName || !formData.username || !formData.password) {
      setMessage('Full name, username, and password are required');
      return false;
    }
    
    // Validate based on selected method
    if (otpMethod === 'sms' && !formData.phone) {
      setMessage('Phone number is required for SMS OTP');
      return false;
    }
    if (otpMethod === 'email' && !formData.email) {
      setMessage('Email is required for Email OTP');
      return false;
    }
    
    if (formData.password !== formData.confirmPassword) {
      setMessage('Passwords do not match');
      return false;
    }
    if (formData.password.length < 6) {
      setMessage('Password must be at least 6 characters long');
      return false;
    }
    if (formData.username.length < 3) {
      setMessage('Username must be at least 3 characters long');
      return false;
    }
    
    if (formData.phone) {
      const phoneRegex = /^[6-9]\d{9}$/;
      if (!phoneRegex.test(formData.phone)) {
        setMessage('Please enter a valid 10-digit phone number');
        return false;
      }
    }
    
    if (formData.email && !/\S+@\S+\.\S+/.test(formData.email)) {
      setMessage('Please enter a valid email address');
      return false;
    }
    return true;
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsLoading(true);
    setMessage('');
    
    const payload = {
      fullName: formData.fullName,
      username: formData.username,
      method: otpMethod
    };
    
    if (otpMethod === 'sms') {
      payload.phone = formData.phone;
    } else {
      payload.email = formData.email;
    }
    
    const result = await sendAdminOtp(payload);
    if (result.success) {
      if (otpMethod === 'sms') {
        setOtpData({ ...otpData, sessionId: result.data.sessionId });
        setMessage('SMS OTP sent successfully! Please check your phone.');
      } else {
        setMessage('Email OTP sent successfully! Please check your email.');
      }
      setStep(2);
    } else {
      setMessage(result.error);
    }
    setIsLoading(false);
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otpData.otp) {
      setMessage(`Please enter the ${otpMethod.toUpperCase()} OTP`);
      return;
    }
    
    // Validate sessionId for SMS method
    if (otpMethod === 'sms' && !otpData.sessionId) {
      setMessage('Session ID missing. Please request a new OTP.');
      return;
    }
    
    setIsLoading(true);
    setMessage('');
    
    const payload = {
      fullName: formData.fullName,
      username: formData.username,
      password: formData.password,
      method: otpMethod,
      otp: otpData.otp
    };
    
    if (otpMethod === 'sms') {
      payload.phone = formData.phone;
      payload.sessionId = otpData.sessionId;
    } else {
      payload.email = formData.email;
    }
    
    console.log('[AdminRegister] Verifying OTP with payload:', { ...payload, otp: '***', password: '***' });
    
    const result = await adminRegister(payload);
    if (result.success) {
      setMessage('Admin registration successful! Redirecting to dashboard...');
      setTimeout(() => {
        navigate('/admin-dashboard');
      }, 2000);
    } else {
      setMessage(result.error || 'Registration failed. Please try again.');
    }
    setIsLoading(false);
  };

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  const goBack = () => {
    if (step === 2) {
      setStep(1);
      setMessage('');
    } else {
      navigate('/admin-login');
    }
  };

  return (
    <div className={`admin-register-container ${darkMode ? 'dark' : ''}`}>
      {/* Top Buttons */}
      <button className="back-btn" onClick={goBack}>← Back</button>
      <button className="dark-toggle" onClick={toggleDarkMode}>{darkMode ? '☀️' : '🌙'}</button>

      {/* Register box */}
      <div className="register-box">
        <div className="logo0">
          <img src="/imgs/logo-DME.png" alt="Logo0" />
        </div>
        <h1>Daily Mind Education</h1>
        <h2>Admin Registration</h2>
        <p>
          {step === 1 ? 'Create your admin account' : 
           `Verify your ${otpMethod === 'sms' ? 'phone number' : 'email address'}`}
        </p>

        {step === 1 ? (
          <form onSubmit={handleSendOtp}>
            <div className="form-group">
              <input
                type="text"
                name="fullName"
                placeholder="Full Name"
                value={formData.fullName}
                onChange={handleChange}
                required
                disabled={isLoading}
                aria-label="Full Name"
              />
            </div>
            <div className="form-group">
              <input
                type="text"
                name="username"
                placeholder="Username"
                value={formData.username}
                onChange={handleChange}
                required
                disabled={isLoading}
                aria-label="Username"
              />
            </div>
            <div className="form-group">
              <label style={{ color: '#ccc', fontSize: '14px', marginBottom: '8px', display: 'block', textAlign: 'left' }}>
                Choose OTP Method *
              </label>
              <div style={{ display: 'flex', gap: '15px', marginBottom: '10px' }}>
                <label style={{ display: 'flex', gap: '6px', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="otpMethod"
                    value="sms"
                    checked={otpMethod === 'sms'}
                    onChange={(e) => setOtpMethod(e.target.value)}
                    disabled={isLoading}
                  />
                  <span>SMS</span>
                </label>
                <label style={{ display: 'flex', gap: '6px', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="otpMethod"
                    value="email"
                    checked={otpMethod === 'email'}
                    onChange={(e) => setOtpMethod(e.target.value)}
                    disabled={isLoading}
                  />
                  <span>Email</span>
                </label>
              </div>
            </div>
            {otpMethod === 'sms' && (
              <div className="form-group">
                <input
                  type="tel"
                  name="phone"
                  placeholder="Phone Number (10 digits) *"
                  value={formData.phone}
                  onChange={handleChange}
                  required
                  disabled={isLoading}
                  aria-label="Phone Number"
                  maxLength="10"
                />
              </div>
            )}
            {otpMethod === 'email' && (
              <div className="form-group">
                <input
                  type="email"
                  name="email"
                  placeholder="Email Address *"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  disabled={isLoading}
                  aria-label="Email Address"
                />
              </div>
            )}
            <div className="form-group">
              <input
                type="password"
                name="password"
                placeholder="Password (min 6 characters)"
                value={formData.password}
                onChange={handleChange}
                required
                disabled={isLoading}
                aria-label="Password"
                minLength="6"
              />
            </div>
            <div className="form-group">
              <input
                type="password"
                name="confirmPassword"
                placeholder="Confirm Password"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                disabled={isLoading}
                aria-label="Confirm Password"
              />
            </div>
            <button type="submit" className="auth-btn" disabled={isLoading}>
              {isLoading ? '⌛️Sending OTP...' : 'Send OTP'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp}>
            <div className="otp-info">
              <p>We've sent a verification code to <strong>{otpMethod === 'sms' ? formData.phone : formData.email}</strong></p>
            </div>
            <div className="form-group">
              <input
                type="text"
                name="otp"
                placeholder={`Enter 6-digit ${otpMethod.toUpperCase()} OTP`}
                value={otpData.otp}
                onChange={handleOtpChange}
                required
                disabled={isLoading}
                aria-label={`${otpMethod.toUpperCase()} OTP Code`}
                maxLength="6"
                pattern="[0-9]{6}"
              />
            </div>
            <button type="submit" className="auth-btn" disabled={isLoading}>
              {isLoading ? '⌛️Verifying...' : 'Verify & Register'}
            </button>
            <button
              type="button"
              className="resend-btn"
              onClick={handleResendOtp}
              disabled={isLoading}
            >
              Resend OTP
            </button>
            <button
              type="button"
              className="resend-btn"
              onClick={() => setStep(1)}
              disabled={isLoading}
            >
              ← Back
            </button>
          </form>
        )}

        <div className="register-footer">
          <p>Already have an admin account?</p>
          <button
            type="button"
            className="login-link"
            onClick={() => navigate('/admin-login')}
          >
            Login as Admin
          </button>
        </div>

        <div
          id="message"
          className={`message ${message.includes('successful') ? 'success' : 'error'}`}
          aria-live="polite"
          role="alert"
        >
          {message}
        </div>
      </div>

      {/* Spinner */}
      {isLoading && (
        <div className="spinner-overlay" aria-hidden="true">
          <div className="spinner" role="progressbar" aria-label="Loading"></div>
        </div>
      )}

      {/* Footer */}
      <footer>
        <button onClick={() => navigate('/policy')}>Policy</button>
        <button onClick={() => navigate('/help')}>Help</button>
      </footer>

      {/* Styles matching your login page */}
      <style>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }

        body, .admin-register-container {
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

        .register-box {
          max-width: 400px;
          width: 100%;
          background-color: rgba(255, 255, 255, 0.05);
          padding: 30px;
          border-radius: 20px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
          margin-top: 50px;
          text-align: center;
        }

        .dark .register-box {
          background-color: #1e1e1e;
        }

        .logo0 {
          margin-bottom: 1px;
          animation: pulse 3s infinite ease-in-out;
        }

        .logo0 img {
          width: 125px;
          height: auto;
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.9; }
        }

        h1 {
          font-size: 36px;
          margin-bottom: 5px;
        }

        h2 {
          font-size: 22px;
          margin-bottom: 10px;
        }

        p {
          color: #ccc;
          margin-bottom: 20px;
        }

        .otp-info {
          background: rgba(255, 255, 255, 0.1);
          padding: 15px;
          border-radius: 10px;
          margin-bottom: 20px;
        }

        .otp-info p {
          margin: 0;
          color: #fff;
        }

        .form-group {
          margin-bottom: 15px;
        }

        input {
          width: 100%;
          padding: 12px;
          border: none;
          border-radius: 10px;
          font-size: 16px;
          background: #f4f4f4;
          color: #000;
          transition: background 0.3s, color 0.3s;
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
          transition: background 0.3s ease;
        }

        .auth-btn:hover:enabled {
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
          transition: background 0.3s ease;
        }

        .resend-btn:hover:enabled {
          background: rgba(255, 255, 255, 0.1);
        }

        .resend-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .register-footer {
          margin-top: 20px;
        }

        .register-footer p {
          color: #ccc;
          margin-bottom: 10px;
        }

        .login-link {
          background: transparent;
          border: 1px solid #888;
          color: white;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 14px;
          cursor: pointer;
          transition: 0.3s;
        }

        .login-link:hover {
          background-color: #444;
        }

        .message {
          margin-top: 15px;
          min-height: 20px;
          font-weight: 600;
          user-select: none;
        }
        .error {
          color: #f44336;
        }
        .success {
          color: #4caf50;
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

        footer {
          margin-top: 40px;
          text-align: center;
        }

        footer button {
          background: transparent;
          border: 1px solid #888;
          color: white;
          padding: 8px 16px;
          margin: 5px 10px;
          border-radius: 20px;
          font-size: 14px;
          cursor: pointer;
          transition: 0.3s;
        }

        footer button:hover {
          background-color: #444;
        }

        @media (max-width: 500px) {
          .register-box {
            padding: 20px;
          }
          h1 {
            font-size: 28px;
          }
          h2 {
            font-size: 18px;
          }
          .dark-toggle, .back-btn {
            font-size: 12px;
            padding: 6px 12px;
          }
          input {
            font-size: 15px;
            padding: 10px;
          }
        }
      `}</style>
    </div>
  );
}




// import React, { useState, useEffect } from 'react';
// import { useNavigate } from 'react-router-dom';
// import { useAdminAuth } from '../context/AdminAuthContext';

// export default function AdminRegisterPage() {
//   const navigate = useNavigate();
//   const { admin, adminRegister, sendAdminOtp } = useAdminAuth();
//   const [step, setStep] = useState(1); // 1: Basic info, 2: OTP verification
//   const [formData, setFormData] = useState({
//     fullName: '',
//     username: '',
//     phone: '',
//     email: '',
//     password: '',
//     confirmPassword: ''
//   });
//   const [otpData, setOtpData] = useState({
//     sessionId: '',
//     otp: ''
//   });
//   const [isLoading, setIsLoading] = useState(false);
//   const [message, setMessage] = useState('');
//   const [darkMode, setDarkMode] = useState(false);

//   useEffect(() => {
//     // Check if admin is already logged in
//     if (admin) {
//       navigate('/admin-dashboard');
//     }
//   }, [admin, navigate]);

//   useEffect(() => {
//     // Apply dark mode class to body
//     if (darkMode) {
//       document.body.classList.add('dark');
//     } else {
//       document.body.classList.remove('dark');
//     }
//   }, [darkMode]);

//   const handleChange = (e) => {
//     setFormData({
//       ...formData,
//       [e.target.name]: e.target.value
//     });
//     setMessage(''); // Clear message when user types
//   };

//   const handleOtpChange = (e) => {
//     setOtpData({
//       ...otpData,
//       [e.target.name]: e.target.value
//     });
//     setMessage('');
//   };

//   const validateForm = () => {
//     if (!formData.fullName || !formData.username || !formData.phone || !formData.password) {
//       setMessage('All fields are required');
//       return false;
//     }

//     if (formData.password !== formData.confirmPassword) {
//       setMessage('Passwords do not match');
//       return false;
//     }

//     if (formData.password.length < 6) {
//       setMessage('Password must be at least 6 characters long');
//       return false;
//     }

//     if (formData.username.length < 3) {
//       setMessage('Username must be at least 3 characters long');
//       return false;
//     }

//     const phoneRegex = /^[6-9]\d{9}$/;
//     if (!phoneRegex.test(formData.phone)) {
//       setMessage('Please enter a valid 10-digit phone number');
//       return false;
//     }

//     if (formData.email && !/\S+@\S+\.\S+/.test(formData.email)) {
//       setMessage('Please enter a valid email address');
//       return false;
//     }

//     return true;
//   };

//   const handleSendOtp = async (e) => {
//     e.preventDefault();
    
//     if (!validateForm()) {
//       return;
//     }

//     setIsLoading(true);
//     setMessage('');

//     const result = await sendAdminOtp({
//       phone: formData.phone,
//       fullName: formData.fullName,
//       username: formData.username,
//       email: formData.email || null
//     });

//     if (result.success) {
//       setOtpData({
//         ...otpData,
//         sessionId: result.data.sessionId
//       });
//       setStep(2);
//       setMessage('OTP sent successfully! Please check your phone.');
//     } else {
//       setMessage(result.error);
//     }
    
//     setIsLoading(false);
//   };

//   const handleVerifyOtp = async (e) => {
//     e.preventDefault();
    
//     if (!otpData.otp) {
//       setMessage('Please enter the OTP');
//       return;
//     }

//     setIsLoading(true);
//     setMessage('');

//     const result = await adminRegister({
//       phone: formData.phone,
//       sessionId: otpData.sessionId,
//       otp: otpData.otp,
//       fullName: formData.fullName,
//       username: formData.username,
//       email: formData.email || null,
//       password: formData.password
//     });

//     if (result.success) {
//       setMessage('Admin registration successful! Redirecting to dashboard...');
//       setTimeout(() => {
//         navigate('/admin-dashboard');
//       }, 2000);
//     } else {
//       setMessage(result.error);
//     }
    
//     setIsLoading(false);
//   };

//   const toggleDarkMode = () => {
//     setDarkMode(!darkMode);
//   };

//   const goBack = () => {
//     if (step === 2) {
//       setStep(1);
//       setMessage('');
//     } else {
//       navigate('/admin-login');
//     }
//   };

//   return (
//     <div className={`admin-register-container ${darkMode ? 'dark' : ''}`}>
//       {/* Back and Dark Mode Buttons */}
//       <button 
//         className="admin-back-btn" 
//         onClick={goBack}
//       >
//         ← Back
//       </button>
//       <button 
//         className="admin-dark-toggle" 
//         onClick={toggleDarkMode}
//       >
//         {darkMode ? '☀️' : '🌙'}
//       </button>

//       <div className="admin-register-box" role="main" aria-label="Admin Registration Form">
//         <div className="admin-logo">
//           <img src="/imgs/logo-DME.png" alt="Daily Mind Education Logo" />
//         </div>
//         <h1>Daily Mind Education</h1>
//         <h2>Admin Registration</h2>
//         <p>{step === 1 ? 'Create your admin account' : 'Verify your phone number'}</p>

//         {step === 1 ? (
//           <form onSubmit={handleSendOtp}>
//             <div className="admin-form-group">
//               <input
//                 type="text"
//                 name="fullName"
//                 placeholder="Full Name"
//                 value={formData.fullName}
//                 onChange={handleChange}
//                 required
//                 disabled={isLoading}
//                 aria-label="Full Name"
//               />
//             </div>
//             <div className="admin-form-group">
//               <input
//                 type="text"
//                 name="username"
//                 placeholder="Username"
//                 value={formData.username}
//                 onChange={handleChange}
//                 required
//                 disabled={isLoading}
//                 aria-label="Username"
//               />
//             </div>
//             <div className="admin-form-group">
//               <input
//                 type="tel"
//                 name="phone"
//                 placeholder="Phone Number (10 digits)"
//                 value={formData.phone}
//                 onChange={handleChange}
//                 required
//                 disabled={isLoading}
//                 aria-label="Phone Number"
//               maxLength="10"
//               />
//             </div>
//             <div className="admin-form-group">
//               <input
//                 type="email"
//                 name="email"
//                 placeholder="Email (Optional)"
//                 value={formData.email}
//                 onChange={handleChange}
//                 disabled={isLoading}
//                 aria-label="Email Address"
//               />
//             </div>
//             <div className="admin-form-group">
//               <input
//                 type="password"
//                 name="password"
//                 placeholder="Password (min 6 characters)"
//                 value={formData.password}
//                 onChange={handleChange}
//                 required
//                 disabled={isLoading}
//                 aria-label="Password"
//                 minLength="6"
//               />
//             </div>
//             <div className="admin-form-group">
//               <input
//                 type="password"
//                 name="confirmPassword"
//                 placeholder="Confirm Password"
//                 value={formData.confirmPassword}
//                 onChange={handleChange}
//                 required
//                 disabled={isLoading}
//                 aria-label="Confirm Password"
//               />
//             </div>
//             <button 
//               type="submit" 
//               className="admin-register-btn" 
//               disabled={isLoading}
//             >
//               {isLoading ? 'Sending OTP...' : 'Send OTP'}
//             </button>
//           </form>
//         ) : (
//           <form onSubmit={handleVerifyOtp}>
//             <div className="otp-info">
//               <p>We've sent a verification code to <strong>{formData.phone}</strong></p>
//             </div>
//             <div className="admin-form-group">
//               <input
//                 type="text"
//                 name="otp"
//                 placeholder="Enter 6-digit OTP"
//                 value={otpData.otp}
//                 onChange={handleOtpChange}
//                 required
//                 disabled={isLoading}
//                 aria-label="OTP Code"
//                 maxLength="6"
//                 pattern="[0-9]{6}"
//               />
//             </div>
//             <button 
//               type="submit" 
//               className="admin-register-btn" 
//               disabled={isLoading}
//             >
//               {isLoading ? 'Verifying...' : 'Verify OTP'}
//             </button>
//             <button 
//               type="button" 
//               className="resend-btn"
//               onClick={() => setStep(1)}
//               disabled={isLoading}
//             >
//               Resend OTP
//             </button>
//           </form>
//         )}

//         <div className="admin-register-footer">
//           <p>Already have an admin account?</p>
//           <button 
//             type="button" 
//             className="login-link"
//             onClick={() => navigate('/admin-login')}
//           >
//             Login as Admin
//           </button>
//         </div>

//         <div 
//           id="message" 
//           className={`admin-message ${message.includes('successful') ? 'success' : 'error'}`}
//           aria-live="polite" 
//           role="alert"
//         >
//           {message}
//         </div>
//       </div>

//       {/* Spinner */}
//       {isLoading && (
//         <div className="admin-spinner-overlay" aria-hidden="true">
//           <div className="admin-spinner" role="progressbar" aria-label="Loading"></div>
//         </div>
//       )}

//       {/* Footer */}
//       <footer>
//         <button onClick={() => navigate('/policy')}>Policy</button>
//         <button onClick={() => navigate('/help')}>Help</button>
//       </footer>

//       <style>{`
//         .admin-register-container {
//           background: linear-gradient(to bottom, #3b060e, #200307, #000000);
//           color: white;
//           min-height: 100vh;
//           display: flex;
//           flex-direction: column;
//           align-items: center;
//           padding: 20px;
//           transition: background 0.4s ease, color 0.4s ease;
//           position: relative;
//         }

//         .admin-register-container.dark {
//           background: #121212;
//           color: #eee;
//         }

//         .back-btn, .dark-toggle {
//           position: fixed;
//           top: 20px;
//           background: rgba(255, 255, 255, 0.1);
//           color: white;
//           padding: 8px 15px;
//           border: none;
//           border-radius: 20px;
//           font-size: 14px;
//           cursor: pointer;
//           z-index: 1000;
//           user-select: none;
//           transition: background-color 0.3s;
//         }

//         .back-btn:hover, .dark-toggle:hover {
//           background: rgba(255, 255, 255, 0.25);
//         }

//         .back-btn {
//           left: 20px;
//         }

//         .dark-toggle {
//           right: 20px;
//         }

//         .register-box {
//           max-width: 400px;
//           width: 100%;
//           background-color: rgba(255, 255, 255, 0.05);
//           padding: 30px;
//           border-radius: 20px;
//           box-shadow: 0 4px 20px rgba(0,0,0,0.3);
//           margin-top: 80px;
//           text-align: center;
//           transition: background-color 0.3s ease;
//         }

//         .admin-register-container.dark .register-box {
//           background-color: #1e1e1e;
//         }

//         .logo {
//           margin-bottom: 15px;
//           animation: pulse 3s infinite ease-in-out;
//           user-select: none;
//         }

//         .logo img {
//           width: 100px;
//           height: auto;
//           user-select: none;
//         }

//         @keyframes pulse {
//           0%, 100% { transform: scale(1); opacity: 1; }
//           50% { transform: scale(1.05); opacity: 0.9; }
//         }

//         h1 {
//           font-size: 36px;
//           margin-bottom: 5px;
//           user-select: none;
//         }

//         h2 {
//           font-size: 22px;
//           margin-bottom: 10px;
//           user-select: none;
//         }

//         p {
//           color: #ccc;
//           margin-bottom: 20px;
//           user-select: none;
//         }

//         .otp-info {
//           background: rgba(255, 255, 255, 0.1);
//           padding: 15px;
//           border-radius: 10px;
//           margin-bottom: 20px;
//         }

//         .otp-info p {
//           margin: 0;
//           color: #fff;
//         }

//         input {
//           width: 100%;
//           padding: 12px;
//           margin-bottom: 15px;
//           border: none;
//           border-radius: 10px;
//           font-size: 16px;
//           background: #f4f4f4;
//           color: #000;
//           transition: background 0.3s, color 0.3s;
//           box-sizing: border-box;
//         }

//         .admin-register-container.dark input {
//           background: #2b2b2b;
//           color: #eee;
//           border: 1px solid #555;
//         }

//         .auth-btn {
//           width: 100%;
//           background: green;
//           color: white;
//           padding: 12px;
//           font-size: 18px;
//           border: none;
//           border-radius: 30px;
//           cursor: pointer;
//           margin-top: 10px;
//           transition: background 0.3s ease;
//           user-select: none;
//         }

//         .auth-btn:hover:not(:disabled) {
//           background: #008000;
//         }

//         .auth-btn:disabled {
//           background: #666;
//           cursor: not-allowed;
//         }

//         .resend-btn {
//           width: 100%;
//           background: transparent;
//           color: white;
//           padding: 10px;
//           font-size: 14px;
//           border: 1px solid #888;
//           border-radius: 20px;
//           cursor: pointer;
//           margin-top: 10px;
//           transition: background 0.3s ease;
//           user-select: none;
//         }

//         .resend-btn:hover:not(:disabled) {
//           background: rgba(255, 255, 255, 0.1);
//         }

//         .resend-btn:disabled {
//           opacity: 0.5;
//           cursor: not-allowed;
//         }

//         .auth-footer {
//           margin-top: 20px;
//           text-align: center;
//         }

//         .auth-footer p {
//           color: #ccc;
//           margin-bottom: 10px;
//         }

//         .login-link {
//           background: transparent;
//           border: 1px solid #888;
//           color: white;
//           padding: 8px 16px;
//           border-radius: 20px;
//           font-size: 14px;
//           cursor: pointer;
//           transition: 0.3s;
//           user-select: none;
//         }

//         .login-link:hover {
//           background-color: #444;
//         }

//         .error-message {
//           color: #f44336;
//           font-weight: 600;
//           margin-top: 15px;
//           min-height: 20px;
//           user-select: none;
//         }

//         .success-message {
//           color: #4caf50;
//           font-weight: 600;
//           margin-top: 15px;
//           min-height: 20px;
//           user-select: none;
//         }

//         .spinner-overlay {
//           position: fixed;
//           top: 0;
//           left: 0;
//           height: 100%;
//           width: 100%;
//           background: rgba(0, 0, 0, 0.85);
//           display: flex;
//           justify-content: center;
//           align-items: center;
//           z-index: 9999;
//           user-select: none;
//         }

//         .spinner {
//           border: 8px solid #f3f3f3;
//           border-top: 8px solid #00ff00;
//           border-radius: 50%;
//           width: 60px;
//           height: 60px;
//           animation: spin 1s linear infinite;
//           user-select: none;
//         }

//         @keyframes spin {
//           0% { transform: rotate(0deg); }
//           100% { transform: rotate(360deg); }
//         }

//         footer {
//           margin-top: 40px;
//           text-align: center;
//           user-select: none;
//         }

//         footer button {
//           background: transparent;
//           border: 1px solid #888;
//           color: white;
//           padding: 8px 16px;
//           margin: 5px 10px;
//           border-radius: 20px;
//           font-size: 14px;
//           cursor: pointer;
//           transition: 0.3s;
//           user-select: none;
//         }

//         footer button:hover {
//           background-color: #444;
//         }

//         @media (max-width: 500px) {
//           .register-box {
//             padding: 20px;
//           }

//           h1 {
//             font-size: 28px;
//           }

//           h2 {
//             font-size: 18px;
//           }

//           .dark-toggle, .back-btn {
//             font-size: 12px;
//             padding: 6px 12px;
//           }

//           .auth-btn {
//             font-size: 16px;
//             padding: 10px;
//           }

//           input {
//             font-size: 15px;
//             padding: 10px;
//           }
//         }
//       `}</style>
//     </div>
//   );
// }
