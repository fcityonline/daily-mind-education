// // backend/controllers/adminAuthController.js

// backend/controllers/adminAuthController.js
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import {
  sendSmsAutogen,
  verifySmsOtp,
  sendEmailOtp,
  debugFetchEmailOtp,
  verifyEmailOtp,
  setSessionInStore,
  getResendCooldownForPhone,
  setResendCooldownForPhone,
} from "../utils/otpService.js";
import { issueAuthTokens } from "./tokenController.js";

/**
 * createToken: signs JWT and sets HttpOnly cookie (adminToken)
 */
const createToken = (user, res) => {
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  res.cookie("adminToken", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return token;
};

/**
 * POST /api/admin-auth/send-otp
 * Body: { phone?, email?, fullName, username, method: 'sms' | 'email' }
 * Supports single method selection (like user registration)
 */
export const sendAdminOtp = async (req, res) => {
  try {
    const { phone, email, fullName, username, method = 'sms' } = req.body;

    if (!fullName || !username) {
      return res.status(400).json({ success: false, message: "Full name and username are required" });
    }

    // Validate method
    if (method !== 'sms' && method !== 'email') {
      return res.status(400).json({ success: false, message: "Method must be 'sms' or 'email'" });
    }

    // Validate required field based on method
    if (method === 'sms' && !phone) {
      return res.status(400).json({ success: false, message: "Phone is required for SMS OTP" });
    }
    if (method === 'email' && !email) {
      return res.status(400).json({ success: false, message: "Email is required for Email OTP" });
    }

    const sanitized = phone ? phone.replace(/^\+?91/, "").trim() : null;
    const normalizedEmail = email ? String(email).toLowerCase().trim() : null;

    // Check if admin already exists
    const existingAdmin = await User.findOne({
      $or: [
        ...(sanitized ? [{ phone: sanitized }] : []),
        { username },
        ...(normalizedEmail ? [{ email: normalizedEmail }] : [])
      ],
      role: "admin",
    });

    if (existingAdmin) {
      return res.status(400).json({ success: false, message: "Admin with this phone, username, or email already exists" });
    }

    if (method === 'sms') {
      // enforce resend cooldown for admin phone
      try {
        const ttl = await getResendCooldownForPhone(sanitized);
        if (ttl > 0) return res.status(429).json({ success: false, message: 'Please wait before requesting another OTP', retryAfter: Math.ceil(ttl/1000) });
      } catch (e) { /* best-effort */ }

      const data = await sendSmsAutogen(sanitized);
      const sessionId = data?.SessionId || data?.sessionId || data?.Details || null;

      return res.json({ success: true, sessionId, message: "SMS OTP sent successfully", method: 'sms' });
    } else {
      // Email OTP
      const result = await sendEmailOtp(normalizedEmail);
      if (result.success) {
        return res.json({ success: true, message: "Email OTP sent successfully", method: 'email', debug: result.debug });
      } else {
        return res.status(500).json({ success: false, message: result.error || "Failed to send email OTP" });
      }
    }
  } catch (err) {
    console.error("sendAdminOtp error:", err.response?.data || err.message);
    return res.status(500).json({ success: false, message: "OTP send failed", error: err.message });
  }
};

/**
 * POST /api/admin-auth/verify-otp
 * Body: { phone?, email?, sessionId?, otp, fullName, username, password, method: 'sms' | 'email' }
 * Single method verification (like user registration)
 */
export const verifyAdminOtp = async (req, res) => {
  try {
    const { phone, email, sessionId, otp, fullName, username, password, method = 'sms' } = req.body;

    console.log('[adminAuth] verifyAdminOtp called:', { method, phone, email, hasSessionId: !!sessionId, hasOtp: !!otp, fullName, username });

    if (!fullName || !username || !password || !otp) {
      return res.status(400).json({ success: false, message: "All required fields must be provided" });
    }

    // Validate method
    if (method !== 'sms' && method !== 'email') {
      return res.status(400).json({ success: false, message: "Method must be 'sms' or 'email'" });
    }

    const sanitized = phone ? phone.replace(/^\+?91/, "").replace(/[\s\-\(\)]/g, "").trim() : null;
    const normalizedEmail = email ? String(email).toLowerCase().trim() : null;

    let verified = false;
    let isVerified = false;
    let emailVerified = false;

    if (method === 'sms') {
      if (!phone) {
        return res.status(400).json({ success: false, message: "Phone is required for SMS OTP" });
      }
      if (!sessionId) {
        return res.status(400).json({ success: false, message: "Session ID is required. Please request a new OTP." });
      }

      console.log('[adminAuth] Verifying SMS OTP:', { sessionId: sessionId.substring(0, 20) + '...', otpLength: otp?.length });

      // Verify SMS OTP
      const result = await verifySmsOtp(sessionId, otp);
      console.log('[adminAuth] SMS OTP verification result:', { success: result?.success, error: result?.error });
      
      if (!result || !result.success) {
        // Check if dev mode (lowercase check)
        if (String(sessionId).toLowerCase().startsWith("dev_session_")) {
          // Dev mode - accept any OTP
          console.log('[adminAuth] Dev mode detected, accepting OTP');
          verified = true;
          isVerified = true;
        } else {
          return res.status(400).json({ 
            success: false, 
            message: result?.error || "Invalid SMS OTP. Please check the code and try again.", 
            details: result 
          });
        }
      } else {
        verified = true;
        isVerified = true;
      }
    } else {
      // Email OTP method
      if (!email) {
        return res.status(400).json({ success: false, message: "Email is required for Email OTP" });
      }

      const emailResult = await verifyEmailOtp(normalizedEmail, otp);
      if (!emailResult.success) {
        return res.status(400).json({ success: false, message: emailResult.message || "Invalid Email OTP" });
      }
      verified = true;
      emailVerified = true;
      isVerified = true; // Email verification counts as verification
    }

    if (!verified) {
      return res.status(400).json({ success: false, message: "OTP verification failed" });
    }

    // Check if user already exists (any role)
    const existingUser = await User.findOne({
      $or: [
        ...(sanitized ? [{ phone: sanitized }] : []),
        { username },
        ...(normalizedEmail ? [{ email: normalizedEmail }] : [])
      ]
    });

    if (existingUser) {
      // If user is already an admin, prevent duplicate registration
      if (existingUser.role === "admin") {
        return res.status(400).json({ 
          success: false, 
          message: "Admin account already exists with this phone, username, or email. Please login instead." 
        });
      }
      
      // If user is a regular user, convert them to admin
      existingUser.role = "admin";
      existingUser.fullName = fullName;
      existingUser.username = username;
      if (sanitized) existingUser.phone = sanitized;
      if (normalizedEmail) existingUser.email = normalizedEmail;
      existingUser.password = password; // Will be hashed by pre-save hook
      existingUser.isVerified = isVerified;
      existingUser.emailVerified = emailVerified;
      
      await existingUser.save();
      
      const token = createToken(existingUser, res);
      try {
        await issueAuthTokens(existingUser, res, true); // isAdmin = true
      } catch (e) {
        // ignore
      }

      console.log(`[adminRegister] User converted to admin: ${existingUser._id}, method: ${method}, phone: ${existingUser.phone || 'N/A'}, email: ${existingUser.email || 'N/A'}`);

      return res.json({
        success: true,
        message: "Your account has been upgraded to admin successfully",
        admin: {
          _id: existingUser._id,
          fullName: existingUser.fullName,
          username: existingUser.username,
          phone: existingUser.phone,
          email: existingUser.email,
          role: existingUser.role,
          isVerified: existingUser.isVerified,
          emailVerified: existingUser.emailVerified,
        },
        token,
      });
    }

    // Create new admin with single method verification
    const admin = new User({
      fullName,
      username,
      ...(sanitized ? { phone: sanitized } : {}),
      ...(normalizedEmail ? { email: normalizedEmail } : {}),
      password,
      role: "admin",
      isVerified,
      emailVerified,
    });

    try {
      await admin.save();
    } catch (saveError) {
      // Handle duplicate key error more gracefully
      if (saveError.code === 11000) {
        const field = Object.keys(saveError.keyPattern || {})[0] || 'field';
        return res.status(400).json({ 
          success: false, 
          message: `An account with this ${field} already exists. Please use a different ${field} or login instead.` 
        });
      }
      throw saveError; // Re-throw if it's a different error
    }

    const token = createToken(admin, res);
    try {
      await issueAuthTokens(admin, res, true); // isAdmin = true
    } catch (e) {
      // ignore
    }

    console.log(`[adminRegister] New admin registered: ${admin._id}, method: ${method}, phone: ${admin.phone || 'N/A'}, email: ${admin.email || 'N/A'}`);

    return res.json({
      success: true,
      message: "Admin registered successfully",
      admin: {
        _id: admin._id,
        fullName: admin.fullName,
        username: admin.username,
        phone: admin.phone,
        email: admin.email,
        role: admin.role,
        isVerified: admin.isVerified,
        emailVerified: admin.emailVerified,
      },
      token,
    });
  } catch (err) {
    console.error("verifyAdminOtp error:", err.response?.data || err.message);
    return res.status(500).json({ success: false, message: "Admin registration failed", error: err.message });
  }
};

/* ---------------- Admin Password Reset Handlers ---------------- */

/**
 * POST /api/admin-auth/forgot-password
 * Body: { phone? OR email? }
 * Sends OTP via SMS (if phone) or Email (if email) for password reset
 */
export const forgotAdminPasswordHandler = async (req, res) => {
  try {
    const { phone, email } = req.body;
    
    if (!phone && !email) {
      return res.status(400).json({ message: "Phone or email is required" });
    }

    let admin = null;
    if (phone) {
      const sanitized = phone.replace(/^\+?91/, "").trim();
      admin = await User.findOne({ phone: sanitized, role: "admin" });
      if (!admin) {
        return res.status(404).json({ message: "Admin not found" });
      }

      // Send SMS OTP
      // enforce resend cooldown
      try {
        const ttl = await getResendCooldownForPhone(sanitized);
        if (ttl > 0) return res.status(429).json({ message: 'Please wait before requesting another OTP', retryAfter: Math.ceil(ttl/1000) });
      } catch (e) { console.warn('[adminAuth] getResendCooldown failed', e.message || e); }

      const data = await sendSmsAutogen(sanitized);
      const sessionId = data?.SessionId || data?.sessionId || data?.Details || null;
      // persist session data on admin record for later verification and tracking
      try {
        admin.otpSessionId = sessionId;
        admin.otpSentAt = new Date();
        admin.otpAttemptCount = 0;
        await admin.save();
      } catch (e) {
        console.warn('[adminAuth] failed to save admin otp metadata', e.message || e);
      }

      // best-effort: store mapping in Redis and set resend cooldown
      try {
        if (sessionId) await setSessionInStore(sessionId, sanitized);
        await setResendCooldownForPhone(sanitized, Number(process.env.OTP_RESEND_TTL_MS || 60*1000));
      } catch (e) { console.warn('[adminAuth] setSessionInStore/setResendCooldown failed', e.message || e); }

      return res.json({ 
        message: "Password reset OTP sent to phone",
        sessionId,
        method: "sms",
        full: data 
      });
    } else if (email) {
      admin = await User.findOne({ email, role: "admin" });
      if (!admin) {
        return res.status(404).json({ message: "Admin not found" });
      }

      // Send Email OTP
      try {
        const result = await sendEmailOtp(email);
        // If transporter not configured, sendEmailOtp returns debug info (otp)
        if (result?.debug) {
          return res.json({ message: "Password reset OTP sent to email (dev-mode)", method: "email", debug: result });
        }
        // If mail send failed but OTP was stored, return a sanitized message and include debug fetch for dev
        if (result?.mailError) {
          const dbg = debugFetchEmailOtp ? debugFetchEmailOtp(email) : undefined;
          return res.json({ message: "Password reset OTP stored (email send failed)", method: "email", debug: dbg || { mailError: true } });
        }
        return res.json({ message: "Password reset OTP sent to email", method: "email" });
      } catch (e) {
        console.warn('[adminAuth] sendEmailOtp threw:', e.message || e);
        // Try to expose debug OTP if available for dev/tests
        const dbg = debugFetchEmailOtp ? debugFetchEmailOtp(email) : undefined;
        return res.status(200).json({ message: "Password reset OTP could not be emailed (mail send error)", method: "email", debug: dbg || { error: e.message } });
      }
    }
  } catch (err) {
    console.error("forgotAdminPasswordHandler:", err.message);
    return res.status(500).json({ message: "Failed to send reset OTP", error: err.message });
  }
};

/**
 * POST /api/admin-auth/reset-password
 * Body: { phone?, email?, sessionId?, otp, newPassword, method }
 * Verifies OTP and resets password
 */
export const resetAdminPasswordHandler = async (req, res) => {
  try {
    const { phone, email, sessionId, otp, newPassword, method } = req.body;
    
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    let admin = null;
    let verified = false;

    if (method === "sms" && phone && sessionId && otp) {
      const sanitized = phone.replace(/^\+?91/, "").trim();
      admin = await User.findOne({ phone: sanitized, role: "admin" });
      if (!admin) {
        return res.status(404).json({ message: "Admin not found" });
      }

      const result = await verifySmsOtp(sessionId, otp);
      if (!result || (result.Details !== "OTP Matched" && result.Status !== "Success" && result.Status !== "SUCCESS")) {
        return res.status(400).json({ message: "Invalid SMS OTP" });
      }
      verified = true;
    } else if (method === "email" && email && otp) {
      admin = await User.findOne({ email, role: "admin" });
      if (!admin) {
        return res.status(404).json({ message: "Admin not found" });
      }

      const result = await verifyEmailOtp(email, otp);
      if (!result.success) {
        return res.status(400).json({ message: result.message || "Invalid Email OTP" });
      }
      verified = true;
    } else {
      return res.status(400).json({ message: "Invalid reset parameters" });
    }

    if (!verified || !admin) {
      return res.status(400).json({ message: "OTP verification failed" });
    }

    // Update password
    admin.password = newPassword;
    await admin.save();

    return res.json({ message: "Password reset successful. Please login with your new password." });
  } catch (err) {
    console.error("resetAdminPasswordHandler:", err.message);
    return res.status(500).json({ message: "Password reset failed", error: err.message });
  }
};

/**
 * POST /api/admin-auth/login
 * Body: { phone, password }  // Phone + password login (as per requirements)
 */
export const adminLogin = async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) return res.status(400).json({ message: "Phone and password are required" });

    const sanitized = phone.replace(/^\+?91/, "").trim();
    const admin = await User.findOne({
      phone: sanitized,
      role: "admin",
    });

    if (!admin) return res.status(401).json({ message: "Invalid credentials" });

    const valid = await admin.matchPassword(password);
    if (!valid) return res.status(401).json({ message: "Invalid credentials" });

    if (!admin.isVerified) return res.status(401).json({ message: "Admin account not verified" });

    const token = createToken(admin, res);
    try {
      await issueAuthTokens(admin, res, true); // isAdmin = true
    } catch (e) {
      // ignore
    }

    return res.json({
      message: "Admin login successful",
      admin: {
        _id: admin._id,
        fullName: admin.fullName,
        username: admin.username,
        phone: admin.phone,
        email: admin.email,
        role: admin.role,
        isVerified: admin.isVerified,
        emailVerified: admin.emailVerified,
      },
      token,
    });
  } catch (err) {
    console.error("adminLogin error:", err.message);
    return res.status(500).json({ message: "Admin login failed", error: err.message });
  }
};

/**
 * POST /api/admin-auth/logout
 */
export const adminLogout = async (req, res) => {
  try {
    res.clearCookie("adminToken");
    res.clearCookie("refreshToken", { path: "/api/admin-auth/refresh" });
    return res.json({ message: "Admin logged out successfully" });
  } catch (err) {
    console.error("adminLogout error:", err.message);
    return res.status(500).json({ message: "Logout failed", error: err.message });
  }
};

/**
 * GET /api/admin-auth/profile
 * Protected endpoint (requires admin middleware)
 */
export const getAdminProfile = async (req, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ message: "Unauthorized" });
    const admin = await User.findById(req.user.id).select("-password").where({ role: "admin" });
    if (!admin) return res.status(404).json({ message: "Admin not found" });
    return res.json(admin);
  } catch (err) {
    console.error("getAdminProfile error:", err.message);
    return res.status(500).json({ message: "Failed to get admin profile" });
  }
};

/**
 * PUT /api/admin-auth/profile
 * Similar to update admin by admin user (profile update)
 */
export const updateAdminProfile = async (req, res) => {
  try {
    const { fullName, username, email } = req.body;
    if (!fullName || !username) return res.status(400).json({ message: "Full name and username are required" });

    const admin = await User.findById(req.user.id).where({ role: "admin" });
    if (!admin) return res.status(404).json({ message: "Admin not found" });

    const existingAdmin = await User.findOne({ username, _id: { $ne: req.user.id }, role: "admin" });
    if (existingAdmin) return res.status(400).json({ message: "Username already taken" });

    if (email) {
      const existingEmailAdmin = await User.findOne({ email, _id: { $ne: req.user.id }, role: "admin" });
      if (existingEmailAdmin) return res.status(400).json({ message: "Email already taken" });
    }

    admin.fullName = fullName;
    admin.username = username;
    if (email) admin.email = email;

    if (req.file) {
      // Delete old profile image if exists
      if (admin.profileImage) {
        try {
          const fs = await import("fs");
          const path = await import("path");
          const oldImagePath = path.join(process.cwd(), "uploads", "images", admin.profileImage);
          if (fs.existsSync(oldImagePath)) {
            fs.unlinkSync(oldImagePath);
            console.log(`[updateAdminProfile] Deleted old image: ${admin.profileImage}`);
          }
        } catch (e) {
          console.warn("Error deleting old image:", e.message);
        }
      }
      admin.profileImage = req.file.filename;
      console.log(`[updateAdminProfile] New image saved: ${req.file.filename}`);
    }

    await admin.save();

    return res.json({
      message: "Admin profile updated successfully",
      admin: {
        _id: admin._id,
        fullName: admin.fullName,
        username: admin.username,
        phone: admin.phone,
        email: admin.email,
        profileImage: admin.profileImage,
        role: admin.role,
        isVerified: admin.isVerified,
        createdAt: admin.createdAt,
      },
    });
  } catch (err) {
    console.error("updateAdminProfile error:", err.message);
    return res.status(500).json({ message: "Failed to update admin profile", error: err.message });
  }
};






// import jwt from "jsonwebtoken";
// import User from "../models/User.js";
// import { sendOTP, verifyOTP } from "../utils/otpService.js";

// /**
//  * createToken: signs JWT and sets HttpOnly cookie
//  */
// const createToken = (user, res) => {
//   const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
//     expiresIn: "7d",
//   });
  
//   // Set secure cookie
//   res.cookie("adminToken", token, {
//     httpOnly: true,
//     secure: process.env.NODE_ENV === "production",
//     sameSite: "lax",
//     maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
//   });
  
//   return token;
// };

// /**
//  * Send OTP for admin registration
//  */
// export const sendAdminOtp = async (req, res) => {
//   try {
//     const { phone, fullName, username, email } = req.body;
    
//     if (!phone || !fullName || !username) {
//       return res.status(400).json({ 
//         message: "Phone, full name, and username are required" 
//       });
//     }

//     // Check if admin already exists
//     const existingAdmin = await User.findOne({ 
//       $or: [
//         { phone },
//         { username },
//         { email: email || null }
//       ],
//       role: 'admin'
//     });

//     if (existingAdmin) {
//       return res.status(400).json({ 
//         message: "Admin with this phone, username, or email already exists" 
//       });
//     }

//     const data = await sendOTP(phone);
//     return res.json({ 
//       sessionId: data.Details, 
//       message: "OTP sent successfully" 
//     });
//   } catch (err) {
//     console.error("sendAdminOtp error:", err.response?.data || err.message);
//     res.status(500).json({ message: "OTP send failed", error: err.message });
//   }
// };

// /**
//  * Verify OTP and create admin account
//  */
// export const verifyAdminOtp = async (req, res) => {
//   try {
//     const { phone, sessionId, otp, fullName, username, email, password } = req.body;
    
//     if (!phone || !sessionId || !otp || !fullName || !username || !password) {
//       return res.status(400).json({ 
//         message: "All fields are required" 
//       });
//     }

//     const result = await verifyOTP(sessionId, otp);
//     if (!result || (result.Details !== "OTP Matched" && result.Status !== "Success")) {
//       return res.status(400).json({ message: "Invalid OTP", details: result });
//     }

//     // Check if admin already exists
//     const existingAdmin = await User.findOne({ 
//       $or: [
//         { phone },
//         { username },
//         { email: email || null }
//       ],
//       role: 'admin'
//     });

//     if (existingAdmin) {
//       return res.status(400).json({ 
//         message: "Admin with this phone, username, or email already exists" 
//       });
//     }

//     // Create admin user
//     const admin = new User({
//       fullName,
//       username,
//       phone,
//       email: email || null,
//       password,
//       role: 'admin',
//       isVerified: true,
//       emailVerified: email ? true : false
//     });

//     await admin.save();

//     const token = createToken(admin, res);
    
//     return res.json({ 
//       message: "Admin registered successfully", 
//       admin: {
//         _id: admin._id,
//         fullName: admin.fullName,
//         username: admin.username,
//         phone: admin.phone,
//         email: admin.email,
//         role: admin.role,
//         isVerified: admin.isVerified
//       },
//       token 
//     });
//   } catch (err) {
//     console.error("verifyAdminOtp error:", err.response?.data || err.message);
//     res.status(500).json({ message: "Admin registration failed", error: err.message });
//   }
// };

// /**
//  * Admin login with phone/username and password
//  */
// export const adminLogin = async (req, res) => {
//   try {
//     const { identifier, password } = req.body; // identifier can be phone, username, or email
    
//     if (!identifier || !password) {
//       return res.status(400).json({ message: "Identifier and password are required" });
//     }

//     // Find admin by phone, username, or email
//     const admin = await User.findOne({
//       $or: [
//         { phone: identifier },
//         { username: identifier },
//         { email: identifier }
//       ],
//       role: 'admin'
//     });

//     if (!admin) {
//       return res.status(401).json({ message: "Invalid credentials" });
//     }

//     const valid = await admin.matchPassword(password);
//     if (!valid) {
//       return res.status(401).json({ message: "Invalid credentials" });
//     }

//     if (!admin.isVerified) {
//       return res.status(401).json({ message: "Admin account not verified" });
//     }

//     const token = createToken(admin, res);
    
//     return res.json({ 
//       message: "Admin login successful", 
//       admin: {
//         _id: admin._id,
//         fullName: admin.fullName,
//         username: admin.username,
//         phone: admin.phone,
//         email: admin.email,
//         role: admin.role,
//         isVerified: admin.isVerified
//       },
//       token 
//     });
//   } catch (err) {
//     console.error("adminLogin error:", err.message);
//     res.status(500).json({ message: "Admin login failed", error: err.message });
//   }
// };

// /**
//  * Admin logout
//  */
// export const adminLogout = async (req, res) => {
//   res.clearCookie("adminToken");
//   res.json({ message: "Admin logged out successfully" });
// };

// /**
//  * Get admin profile
//  */
// export const getAdminProfile = async (req, res) => {
//   try {
//     const admin = await User.findById(req.user.id)
//       .select("-password")
//       .where({ role: 'admin' });
    
//     if (!admin) {
//       return res.status(404).json({ message: "Admin not found" });
//     }
    
//     res.json(admin);
//   } catch (err) {
//     console.error("getAdminProfile error:", err.message);
//     res.status(500).json({ message: "Failed to get admin profile" });
//   }
// };

// /**
//  * Update admin profile
//  */
// export const updateAdminProfile = async (req, res) => {
//   try {
//     const { fullName, username, email } = req.body;
    
//     if (!fullName || !username) {
//       return res.status(400).json({ message: "Full name and username are required" });
//     }

//     const admin = await User.findById(req.user.id).where({ role: 'admin' });
//     if (!admin) {
//       return res.status(404).json({ message: "Admin not found" });
//     }

//     // Check if username is already taken by another admin
//     const existingAdmin = await User.findOne({ 
//       username, 
//       _id: { $ne: req.user.id },
//       role: 'admin'
//     });
    
//     if (existingAdmin) {
//       return res.status(400).json({ message: "Username already taken" });
//     }

//     // Check if email is already taken by another admin
//     if (email) {
//       const existingEmailAdmin = await User.findOne({ 
//         email, 
//         _id: { $ne: req.user.id },
//         role: 'admin'
//       });
      
//       if (existingEmailAdmin) {
//         return res.status(400).json({ message: "Email already taken" });
//       }
//     }

//     admin.fullName = fullName;
//     admin.username = username;
//     if (email) admin.email = email;
    
//     // Handle profile image upload
//     if (req.file) {
//       // Delete old profile image if exists
//       if (admin.profileImage) {
//         const fs = await import('fs');
//         const path = await import('path');
//         const oldImagePath = path.join(process.cwd(), 'uploads', admin.profileImage);
//         try {
//           if (fs.existsSync(oldImagePath)) {
//             fs.unlinkSync(oldImagePath);
//           }
//         } catch (deleteErr) {
//           console.error("Error deleting old image:", deleteErr);
//         }
//       }
//       admin.profileImage = req.file.filename;
//     }
    
//     await admin.save();

//     res.json({ 
//       message: "Admin profile updated successfully", 
//       admin: {
//         _id: admin._id,
//         fullName: admin.fullName,
//         username: admin.username,
//         phone: admin.phone,
//         email: admin.email,
//         profileImage: admin.profileImage,
//         role: admin.role,
//         isVerified: admin.isVerified,
//         createdAt: admin.createdAt
//       }
//     });
//   } catch (err) {
//     console.error("updateAdminProfile error:", err.message);
//     res.status(500).json({ message: "Failed to update admin profile" });
//   }
// };
