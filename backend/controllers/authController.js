// // // // backend/controllers/authController.js

// backend/controllers/authController.js
import dotenv from "dotenv";
dotenv.config();

import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sendSmsOtp, verifySmsOtp, sendEmailOtp, verifyEmailOtp, setSessionInStore, getResendCooldownForPhone, setResendCooldownForPhone, incrPhoneAttempts, resetPhoneAttempts } from "../utils/otpService.js";
import { issueAuthTokens } from "./tokenController.js";

function sanitizePhone(input) {
  if (!input) return "";
  const onlyDigits = String(input).replace(/\D/g, "");
  const noLeadingZeros = onlyDigits.replace(/^0+/, "");
  if (noLeadingZeros.length > 10 && noLeadingZeros.startsWith("91")) return noLeadingZeros.slice(-10);
  if (noLeadingZeros.length > 10) return noLeadingZeros.slice(-10);
  return noLeadingZeros;
}

/**
 * sendOtpHandler - called when user requests SMS OTP during registration or forgot-password flow
 * returns { success, sessionId } if sent
 */
export const sendOtpHandler = async (req, res) => {
  try {
    let { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: "Phone required" });

    const sanitized = sanitizePhone(phone);
    if (!sanitized || sanitized.length !== 10) return res.status(400).json({ success: false, message: "Invalid phone" });

    // Enforce resend cooldown (server-side)
    try {
      const ttl = await getResendCooldownForPhone(sanitized);
      if (ttl > 0) return res.status(429).json({ success: false, message: "Please wait before requesting another OTP", retryAfter: Math.ceil(ttl / 1000) });
    } catch (e) {
      console.warn("[sendOtpHandler] getResendCooldown error", e.message || e);
    }

    const result = await sendSmsOtp(sanitized);
    if (!result.success) return res.status(500).json({ success: false, message: result.error || "Failed to send OTP" });

    const sessionId = result.sessionId || `dev_session_${Date.now()}`;

    // Create or update user record for registration flow
    let user = await User.findOne({ phone: sanitized });
    if (!user) {
      user = new User({
        phone: sanitized,
        password: "tempPass@123",
        isVerified: false,
      });
      await user.save();
    } else {
      // reset any stored otp metadata
      user.otpAttemptCount = 0;
      user.otpSessionId = sessionId;
      user.otpSentAt = new Date();
      await user.save();
    }

    // Persist mapping in Redis as extra safety
    try { await setSessionInStore(sessionId, sanitized); await setResendCooldownForPhone(sanitized); } catch (e) {}

    return res.json({ success: true, message: "OTP sent", sessionId });
  } catch (err) {
    console.error("sendOtpHandler error:", err && err.message ? err.message : err);
    return res.status(500).json({ success: false, message: "Failed to send OTP" });
  }
};

/**
 * verifyOtpHandler - verifies SMS OTP; used for registration and forgot-password flows
 * If registration fields are included, creates/updates user details and issues tokens
 */
export const verifyOtpHandler = async (req, res) => {
  try {
    const { phone, otp, sessionId: providedSessionId, name, password, email } = req.body;
    if (!phone || !otp) return res.status(400).json({ success: false, message: "Phone and OTP required" });

    const sanitized = sanitizePhone(phone);
    if (!sanitized) return res.status(400).json({ success: false, message: "Invalid phone" });

    let user = await User.findOne({ phone: sanitized });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    // server-side attempt checks (stored in redis by otpService via incrPhoneAttempts)
    const MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);
    if (user.otpAttemptCount >= MAX_ATTEMPTS) return res.status(429).json({ success: false, message: "Too many incorrect OTP attempts. Request a new OTP." });

    const sessionToVerify = providedSessionId || user.otpSessionId;
    if (!sessionToVerify) return res.status(400).json({ success: false, message: "No OTP session found" });

    const verifyResponse = await verifySmsOtp(sessionToVerify, otp);
    if (!verifyResponse.success) {
      try { await incrPhoneAttempts(sanitized); } catch (e) {}
      user.otpAttemptCount = (user.otpAttemptCount || 0) + 1;
      await user.save();
      if (user.otpAttemptCount >= MAX_ATTEMPTS) return res.status(429).json({ success: false, message: "Too many incorrect OTP attempts. Request a new OTP." });
      return res.status(400).json({ success: false, message: verifyResponse.error || "OTP verification failed" });
    }

    // Success:
    try { await resetPhoneAttempts(sanitized); } catch (e) {}
    user.otpAttemptCount = 0;
    user.isVerified = true;
    user.otpSessionId = null;

    if (name) user.fullName = name;
    if (email) user.email = String(email).toLowerCase().trim();
    if (password) {
      // only replace temp password when appropriate
      const isTemp = await user.matchPassword("tempPass@123").catch(() => false);
      if (isTemp || !user.password) {
        user.password = password; // will be hashed by pre-save
      }
    }

    await user.save();

    // Issue tokens and set refresh cookie
    const tokens = await issueAuthTokens(user, res, true);
    return res.json({
      success: true,
      message: "OTP verified",
      accessToken: tokens.accessToken,
      user: {
        id: user._id,
        phone: user.phone,
        fullName: user.fullName,
        email: user.email,
        isVerified: user.isVerified,
      },
    });
  } catch (err) {
    console.error("verifyOtpHandler error:", err && err.message ? err.message : err);
    return res.status(500).json({ success: false, message: "OTP verification failed" });
  }
};

/**
 * loginHandler - phone + password login
 */
export const loginHandler = async (req, res) => {
  try {
    let { phone, password } = req.body;
    if (!phone || !password) return res.status(400).json({ success: false, message: "Phone and password required" });

    const sanitized = sanitizePhone(phone);
    if (!sanitized) return res.status(400).json({ success: false, message: "Invalid credentials" });

    // login lockout helpers (loginLockout.js uses Redis)
    const { incrementLoginAttempts, resetLoginAttempts, isLockedOut } = await import("../utils/loginLockout.js");

    // check lockout
    const locked = await isLockedOut(sanitized);
    if (locked) {
      return res.status(429).json({ success: false, message: "Account locked due to multiple failed login attempts. Try again later." });
    }

    const user = await User.findOne({ phone: sanitized });
    if (!user) return res.status(401).json({ success: false, message: "Invalid credentials" });

    const match = await user.matchPassword(password);
    if (!match) {
      const attempts = await incrementLoginAttempts(sanitized);
      if (attempts >= Number(process.env.LOGIN_MAX_ATTEMPTS || 3)) {
        await isLockedOut(sanitized, true);
        return res.status(429).json({ success: false, message: "Account locked due to multiple failed login attempts. Try again later." });
      }
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // success
    await resetLoginAttempts(sanitized);

    if (user.isBanned) return res.status(403).json({ success: false, message: "Account banned" });

    const tokens = await issueAuthTokens(user, res, true);
    return res.json({
      success: true,
      accessToken: tokens.accessToken,
      user: { id: user._id, phone: user.phone, fullName: user.fullName, role: user.role }
    });
  } catch (err) {
    console.error("loginHandler error:", err && err.message ? err.message : err);
    return res.status(500).json({ success: false, message: "Login failed" });
  }
};

/* =================== Profile, email OTP, forgot/reset flows =================== */

export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    return res.json(user);
  } catch (err) {
    console.error("getProfile error", err);
    return res.status(500).json({ success: false, message: "Failed to get profile" });
  }
};

export const logoutHandler = async (req, res) => {
  try {
    // revoke refresh cookie server-side
    res.clearCookie("rt", { path: "/" });
    return res.json({ success: true, message: "Logged out" });
  } catch (err) {
    console.error("logoutHandler error", err);
    return res.status(500).json({ success: false, message: "Logout failed" });
  }
};

export const sendEmailOtpHandler = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email required" });
    const result = await sendEmailOtp(email);
    if (result.success) {
      if (result.debug) return res.json({ success: true, message: "Email OTP (debug)", debug: { otp: result.otp } });
      return res.json({ success: true, message: "Email OTP sent" });
    }
    return res.status(500).json({ success: false, message: "Failed to send email OTP" });
  } catch (e) {
    console.error("sendEmailOtpHandler", e);
    return res.status(500).json({ success: false, message: "Failed to send email OTP" });
  }
};

export const verifyEmailOtpHandler = async (req, res) => {
  try {
    const { email, otp, name, phone, password } = req.body;
    if (!email || !otp) return res.status(400).json({ success: false, message: "Email and OTP required" });

    const result = await verifyEmailOtp(email, otp);
    if (!result.success) return res.status(400).json({ success: false, message: result.message || "OTP verification failed" });

    const normalizedEmail = String(email).toLowerCase().trim();
    let user = await User.findOne({ email: normalizedEmail });

    if (user) {
      user.emailVerified = true;
      user.email = normalizedEmail;
      await user.save();
      return res.json({ success: true, message: "Email verified" });
    }

    // If no user exists and registration details provided, create
    if (name && password) {
      const newUser = new User({
        fullName: name,
        email: normalizedEmail,
        password,
        isVerified: false,
        emailVerified: true,
        phone: phone ? sanitizePhone(phone) : undefined
      });
      await newUser.save();
      const tokens = await issueAuthTokens(newUser, res, true);
      return res.json({
        success: true,
        message: "Registered via email",
        accessToken: tokens.accessToken,
        user: { id: newUser._id, fullName: newUser.fullName, email: newUser.email }
      });
    }

    return res.json({ success: true, message: "Email verified" });
  } catch (e) {
    console.error("verifyEmailOtpHandler", e);
    return res.status(500).json({ success: false, message: "Email OTP verification failed" });
  }
};

/* ================= Forgot and reset password flows ================= */

export const forgotPasswordHandler = async (req, res) => {
  try {
    const { phone, email } = req.body;
    if (!phone && !email) return res.status(400).json({ success: false, message: "Phone or email required" });

    if (phone) {
      const sanitized = sanitizePhone(phone);
      const user = await User.findOne({ phone: sanitized });
      if (!user) return res.status(404).json({ success: false, message: "User not found" });
      const data = await sendSmsOtp(sanitized);
      const sessionId = data.sessionId || `dev_session_${Date.now()}`;

      user.otpSessionId = sessionId;
      user.otpSentAt = new Date();
      user.otpAttemptCount = 0;
      await user.save();
      try { await setSessionInStore(sessionId, sanitized); } catch (e) {}
      return res.json({ success: true, message: "Password reset OTP sent", sessionId, method: "sms" });
    }

    if (email) {
      const normalized = String(email).toLowerCase().trim();
      const found = await User.findOne({ email: normalized });
      if (!found) return res.status(404).json({ success: false, message: "User not found" });
      const result = await sendEmailOtp(normalized);
      if (result.success) return res.json({ success: true, message: "Email OTP sent (if email configured)", method: "email" });
      return res.status(500).json({ success: false, message: "Failed to send email OTP" });
    }
  } catch (e) {
    console.error("forgotPasswordHandler", e);
    return res.status(500).json({ success: false, message: "Failed to start reset flow" });
  }
};

export const resetPasswordHandler = async (req, res) => {
  try {
    const { phone, sessionId, otp, newPassword, method } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ success: false, message: "Password must be 6+ chars" });

    if (method === "sms") {
      if (!phone || !sessionId || !otp) return res.status(400).json({ success: false, message: "Missing SMS reset params" });
      const sanitized = sanitizePhone(phone);
      const user = await User.findOne({ phone: sanitized });
      if (!user) return res.status(404).json({ success: false, message: "User not found" });

      // check attempts server-side
      const MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);
      if (user.otpAttemptCount >= MAX_ATTEMPTS) return res.status(429).json({ success: false, message: "Too many attempts" });

      const result = await verifySmsOtp(sessionId, otp);
      if (!result.success) {
        user.otpAttemptCount = (user.otpAttemptCount || 0) + 1;
        await user.save();
        return res.status(400).json({ success: false, message: result.error || "Invalid OTP" });
      }

      user.otpAttemptCount = 0;
      user.password = newPassword;
      await user.save();
      return res.json({ success: true, message: "Password reset successful" });
    }

    // Email reset not implemented here (could be added)
    return res.status(501).json({ success: false, message: "Email reset not implemented" });
  } catch (e) {
    console.error("resetPasswordHandler", e);
    return res.status(500).json({ success: false, message: "Reset failed" });
  }
};

/* Profile update handler (simple) */
export const updateProfile = async (req, res) => {
  try {
    const updates = req.body || {};
    
    // Get current user to check for old image
    const currentUser = await User.findById(req.user.id);
    
    if (req.file) {
      // Delete old profile image if exists
      if (currentUser?.profileImage) {
        try {
          const fs = await import("fs");
          const path = await import("path");
          const oldImagePath = path.join(process.cwd(), "uploads", "images", currentUser.profileImage);
          if (fs.existsSync(oldImagePath)) {
            fs.unlinkSync(oldImagePath);
            console.log(`[updateProfile] Deleted old image: ${currentUser.profileImage}`);
          }
        } catch (e) {
          console.warn("Error deleting old image:", e.message);
        }
      }
      updates.profileImage = req.file.filename;
      console.log(`[updateProfile] New image saved: ${req.file.filename}`);
    }
    
    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true }).select("-password");
    return res.json({ success: true, user });
  } catch (e) {
    console.error("updateProfile", e);
    return res.status(500).json({ success: false, message: "Profile update failed" });
  }
};

/* Delete account (enqueue) */
export const deleteAccountHandler = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
    const DeletionJob = (await import("../models/DeletionJob.js")).default;
    const job = await DeletionJob.create({ user: userId, status: "queued", progress: 0, message: "Queued" });
    return res.status(202).json({ success: true, jobId: job._id });
  } catch (e) {
    console.error("deleteAccountHandler", e);
    return res.status(500).json({ success: false, message: "Failed to enqueue deletion" });
  }
};



/* ====================== Change Password ====================== */
export const changePasswordHandler = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { oldPassword, newPassword } = req.body;

    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
    if (!oldPassword || !newPassword)
      return res.status(400).json({ success: false, message: "Old and new password required" });

    const user = await User.findById(userId).select("+password");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const match = await bcrypt.compare(oldPassword, user.password);
    if (!match)
      return res.status(400).json({ success: false, message: "Old password is incorrect" });

    user.password = newPassword; // hashed by pre-save hook
    await user.save();

    return res.json({ success: true, message: "Password changed successfully" });
  } catch (e) {
    console.error("changePasswordHandler", e);
    return res.status(500).json({ success: false, message: "Failed to change password" });
  }
};

/* ====================== User Preferences ====================== */
// (these are stored directly in the user document)
export const getUserPreferencesHandler = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("preferences");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, preferences: user.preferences || {} });
  } catch (e) {
    console.error("getUserPreferencesHandler", e);
    res.status(500).json({ success: false, message: "Failed to load preferences" });
  }
};

export const setUserPreferencesHandler = async (req, res) => {
  try {
    const updates = req.body || {};
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: { preferences: updates } },
      { new: true }
    ).select("preferences");

    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, preferences: user.preferences });
  } catch (e) {
    console.error("setUserPreferencesHandler", e);
    res.status(500).json({ success: false, message: "Failed to save preferences" });
  }
};



// ====================== Account Deletion Helper ======================
export async function performFullAccountDeletion(userId) {
  try {
    if (!userId) throw new Error("User ID required for deletion");
    const User = (await import("../models/User.js")).default;
    const DeletionJob = (await import("../models/DeletionJob.js")).default;

    const user = await User.findById(userId);
    if (!user) {
      console.warn(`[performFullAccountDeletion] User not found: ${userId}`);
      return false;
    }

    // ⚙️ Optional: remove related data (courses, progress, etc.)
    // await SomeOtherModel.deleteMany({ user: userId });

    await User.findByIdAndDelete(userId);
    await DeletionJob.findOneAndUpdate(
      { user: userId },
      { status: "completed", progress: 100, message: "Account deleted" },
      { new: true }
    );

    console.log(`[performFullAccountDeletion] Deleted user ${userId}`);
    return true;
  } catch (err) {
    console.error("[performFullAccountDeletion] Error:", err.message || err);
    try {
      const DeletionJob = (await import("../models/DeletionJob.js")).default;
      await DeletionJob.findOneAndUpdate(
        { user: userId },
        { status: "failed", message: err.message || "Error deleting account" },
        { new: true }
      );
    } catch {}
    return false;
  }
}





// // backend/controllers/authController.js
// import User from "../models/User.js";
// import bcrypt from "bcryptjs";
// import jwt from "jsonwebtoken";
// import { sendOtp, verifyOtp, sendEmailOtp, verifyEmailOtp, setSessionInStore, getResendCooldownForPhone, setResendCooldownForPhone, incrPhoneAttempts, resetPhoneAttempts } from "../utils/otpService.js";
// import dotenv from "dotenv";
// import nodemailer from "nodemailer";

// dotenv.config();

// // In-memory store for email OTPs (dev). For production use Redis or DB.
// const emailOtpStore = new Map();

// function genOtp(digits = 6) {
//   const min = 10 ** (digits - 1);
//   const max = 10 ** digits - 1;
//   return String(Math.floor(Math.random() * (max - min + 1)) + min);
// }

// // Normalize phone to 10-digit Indian local number (strip +91, leading zeros, non-digits)
// function sanitizePhone(input) {
//   if (!input) return "";
//   const onlyDigits = String(input).replace(/\D/g, "");
//   // remove leading 0s
//   const noLeadingZeros = onlyDigits.replace(/^0+/, "");
//   // remove leading country code 91 if present and length > 10
//   if (noLeadingZeros.length > 10 && noLeadingZeros.startsWith("91")) {
//     return noLeadingZeros.slice(noLeadingZeros.length - 10);
//   }
//   // if more than 10 digits, take last 10 (local number)
//   if (noLeadingZeros.length > 10) return noLeadingZeros.slice(-10);
//   return noLeadingZeros;
// }

// function getTransporter() {
//   if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;
//   return nodemailer.createTransport({
//     host: process.env.EMAIL_HOST || 'smtp.gmail.com',
//     port: Number(process.env.EMAIL_PORT || 587),
//     secure: process.env.EMAIL_SECURE === 'true',
//     auth: {
//       user: process.env.EMAIL_USER,
//       pass: process.env.EMAIL_PASS,
//     },
//   });
// }

// /* ==============================
//    🔹 SEND OTP HANDLER (2FACTOR)
// ================================= */
// export const sendOtpHandler = async (req, res) => {
//   try {
//     let { phone } = req.body;
//     if (!phone) return res.status(400).json({ message: "Phone number required" });

//     const sanitized = sanitizePhone(phone);
//     if (!sanitized || sanitized.length !== 10) return res.status(400).json({ message: "Invalid phone number" });

//     // enforce resend cooldown using Redis (best-effort)
//     try {
//       const ttl = await getResendCooldownForPhone(sanitized);
//       if (ttl > 0) {
//         return res.status(429).json({ message: "Please wait before requesting another OTP", retryAfter: Math.ceil(ttl / 1000) });
//       }
//     } catch (e) {
//       console.warn('[authController] getResendCooldownForPhone failed', e.message || e);
//     }

//     const otpResponse = await sendOtp(sanitized);
//     if (!otpResponse.success) {
//       return res.status(500).json({ message: otpResponse.error });
//     }

//     let user = await User.findOne({ phone: sanitized });
//     if (!user) {
//       user = new User({
//         phone: sanitized,
//         password: "tempPass@123",
//         isVerified: false,
//       });
//       await user.save();
//     }

//     user.otpSessionId = otpResponse.sessionId;
//     user.otpSentAt = new Date();
//     user.otpAttemptCount = 0; // reset attempts when sending a fresh OTP
//     await user.save();

//     // best-effort: store sessionId -> phone mapping in Redis so other instances can verify or enforce cooldowns
//     try {
//       if (otpResponse.sessionId) await setSessionInStore(otpResponse.sessionId, sanitized);
//       // set resend cooldown (default 60s)
//       const RESEND_TTL_MS = Number(process.env.OTP_RESEND_TTL_MS || 60 * 1000);
//       await setResendCooldownForPhone(sanitized, RESEND_TTL_MS);
//     } catch (e) {
//       console.warn("[authController] setSessionInStore/setResendCooldown failed:", e.message || e);
//     }

//     res.status(200).json({
//       success: true,
//       message: "OTP sent successfully",
//       sessionId: otpResponse.sessionId,
//     });
//   } catch (err) {
//     console.error("Send OTP Error:", err);
//     res.status(500).json({ message: "Error sending OTP" });
//   }
// };

// /* ==============================
//    🔹 VERIFY OTP HANDLER (2FACTOR)
// ================================= */
// export const verifyOtpHandler = async (req, res) => {
//   try {
//     // Accept additional registration fields so we can complete signup after SMS verification
//     const { phone, otp, name, password, email, sessionId: providedSessionId } = req.body;
//     if (!phone || !otp)
//       return res.status(400).json({ message: "Phone and OTP required" });

//     // Sanitize phone and find user
//     const sanitized = sanitizePhone(phone);
//     if (!sanitized) return res.status(400).json({ message: "Invalid phone" });

//     let user = await User.findOne({ phone: sanitized });
//     if (!user) return res.status(404).json({ message: "User not found" });

//     // Lockout check
//     const MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);
//     if (user.otpAttemptCount >= MAX_ATTEMPTS) {
//       return res.status(429).json({ message: "Too many incorrect OTP attempts. Request a new OTP." });
//     }

//     // Determine which sessionId to verify: prefer providedSessionId else user's stored otpSessionId
//     const sessionToVerify = providedSessionId || user.otpSessionId;
//     if (!sessionToVerify) return res.status(404).json({ message: "No OTP session found" });

//     const verifyResponse = await verifyOtp(sessionToVerify, otp);
//     if (!verifyResponse || !verifyResponse.success) {
//       // increment attempt count in redis (best-effort) and return error
//       try { await incrPhoneAttempts(sanitized); } catch (e) { console.warn('[authController] incrPhoneAttempts failed', e.message || e); }
//       user.otpAttemptCount = (user.otpAttemptCount || 0) + 1;
//       await user.save();
//       const MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);
//       if (user.otpAttemptCount >= MAX_ATTEMPTS) {
//         return res.status(429).json({ message: "Too many incorrect OTP attempts. Request a new OTP." });
//       }
//       return res.status(400).json({ message: verifyResponse?.error || "OTP verification failed", details: verifyResponse });
//     }

//     // On success, reset attempt count and mark phone as verified and clear session
//     try { await resetPhoneAttempts(sanitized); } catch (e) { /* best-effort */ }
//     user.otpAttemptCount = 0;
//     user.isVerified = true;
//     user.otpSessionId = null;

//     // If frontend supplied registration fields, set them now.
//     if (name) user.fullName = name;

//     if (email) {
//       user.email = String(email).toLowerCase().trim();
//       user.emailVerified = false; // email OTP step may be required separately
//     }

//     // If frontend provided a password and user's existing password is the placeholder, replace it.
//     if (password) {
//       // detect if current password is the initial temp password
//       let isTemp = false;
//       try {
//         isTemp = await bcrypt.compare("tempPass@123", user.password);
//       } catch (e) {
//         isTemp = false;
//       }
//       // Only overwrite password if it appears to be the temp placeholder or empty
//       if (isTemp || !user.password) {
//         user.password = password; // will be hashed by pre-save hook
//       }
//     }

//     await user.save();

//     // Phase-1: Use refresh token system with HttpOnly cookies (OTP deletion handled by otpService TTL)
//     // Delete OTP session from Redis after successful verification
//     const { delSessionFromStore } = await import('../utils/otpService.js');
//     if (sessionToVerify) {
//       await delSessionFromStore(sessionToVerify);
//     }

//     // Issue tokens using refresh token system
//     const { issueAuthTokens } = await import('./tokenController.js');
//     const { accessToken } = issueAuthTokens(user, res, false);

//     res.status(200).json({
//       success: true,
//       message: "OTP verified successfully",
//       token: accessToken, // Access token (30 min expiry)
//       // Refresh token is in HttpOnly cookie
//       user: {
//         id: user._id,
//         phone: user.phone,
//         fullName: user.fullName,
//         email: user.email,
//         isVerified: user.isVerified,
//       },
//     });
//   } catch (err) {
//     console.error("Verify OTP Error:", err);
//     res.status(500).json({ message: "OTP verification failed" });
//   }
// };

// /* ==============================
//    🔹 LOGIN HANDLER (Phase-1: Secure with lockout & refresh tokens)
// ================================= */
// export const loginHandler = async (req, res) => {
//   try {
//     let { phone, password } = req.body;
//     if (!phone || !password) return res.status(400).json({ message: "Invalid credentials" });

//     const sanitized = sanitizePhone(phone);
//     if (!sanitized) return res.status(400).json({ message: "Invalid credentials" });

//     // Phase-1: Login lockout check (3 failed attempts → 5 min cooldown)
//     const { incrementLoginAttempts, resetLoginAttempts, isLockedOut } = await import('../utils/loginLockout.js');
//     const lockoutKey = `login:lockout:${sanitized}`;
//     const attemptsKey = `login:attempts:${sanitized}`;
    
//     // Check if account is locked
//     const locked = await isLockedOut(lockoutKey);
//     if (locked) {
//       // Get remaining lockout time from Redis
//       const { createClient } = await import('redis');
//       let minutesLeft = 5; // Default
//       if (process.env.REDIS_URL) {
//         try {
//           const redis = createClient({ url: process.env.REDIS_URL });
//           await redis.connect();
//           const ttl = await redis.pttl(lockoutKey);
//           await redis.disconnect();
//           if (ttl > 0) minutesLeft = Math.ceil(ttl / 60000);
//         } catch (e) {
//           // Fallback to default
//         }
//       }
//       return res.status(429).json({ 
//         message: `Account locked due to multiple failed login attempts. Please try again after ${minutesLeft} minute(s).`,
//         retryAfter: minutesLeft
//       });
//     }

//     const user = await User.findOne({ phone: sanitized });
//     if (!user) {
//       // Phase-1: Generic error message (don't reveal if user exists)
//       return res.status(401).json({ message: "Invalid credentials" });
//     }

//     const isMatch = await user.matchPassword(password);
//     if (!isMatch) {
//       // Increment failed attempts
//       const attempts = await incrementLoginAttempts(attemptsKey);
      
//       // Lock account after 3 failed attempts (Phase-1 requirement)
//       if (attempts >= 3) {
//         await isLockedOut(lockoutKey, true); // Set lockout
//         return res.status(429).json({ 
//           message: "Account locked due to multiple failed login attempts. Please try again after 5 minutes.",
//           retryAfter: 5
//         });
//       }
      
//       // Phase-1: Generic error message
//       return res.status(401).json({ message: "Invalid credentials" });
//     }

//     // Successful login - reset attempts
//     await resetLoginAttempts(attemptsKey, lockoutKey);

//     if (user.isBanned)
//       return res.status(403).json({ message: "Account banned" });

//     // Phase-1: Use refresh token system with HttpOnly cookies
//     const { issueAuthTokens } = await import('./tokenController.js');
//     const { accessToken } = issueAuthTokens(user, res, false);

//     res.status(200).json({
//       success: true,
//       token: accessToken, // Access token (30 min expiry)
//       // Refresh token is in HttpOnly cookie
//       user: {
//         id: user._id,
//         phone: user.phone,
//         fullName: user.fullName,
//         role: user.role,
//       },
//     });
//   } catch (err) {
//     console.error("Login Error:", err);
//     // Phase-1: Generic error message (don't leak sensitive info)
//     res.status(500).json({ message: "Login failed" });
//   }
// };

// /* ==============================
//    🔹 GET PROFILE
// ================================= */
// export const getProfile = async (req, res) => {
//   try {
//     const user = await User.findById(req.user.id).select("-password");
//     if (!user) return res.status(404).json({ message: "User not found" });
    
//     // Get blog count and quiz count
//     const { default: Blog } = await import('../models/Blog.js');
//     const blogCount = await Blog.countDocuments({ author: req.user.id });
//     const quizCount = user.quizHistory ? user.quizHistory.length : 0;
    
//     // Return user with stats
//     const userObj = user.toObject();
//     userObj.stats = {
//       posts: blogCount,
//       quizzes: quizCount
//     };
    
//     res.status(200).json(userObj);
//   } catch (err) {
//     console.error("Get Profile Error:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// };

// /* ==============================
//    🔹 LOGOUT HANDLER
// ================================= */
// export const logoutHandler = async (req, res) => {
//   res.status(200).json({ success: true, message: "Logged out successfully" });
// };

// /* ==============================
//    🔹 UPDATE PROFILE
// ================================= */
// export const updateProfile = async (req, res) => {
//   try {
//     const updates = req.body;
//     if (req.file) updates.profileImage = req.file.filename;

//     const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true });
//     res.status(200).json({ success: true, user });
//   } catch (err) {
//     console.error("Update Profile Error:", err);
//     res.status(500).json({ message: "Profile update failed" });
//   }
// };

// /* ==============================
//    🔹 SEND EMAIL OTP
// ================================= */
// export const sendEmailOtpHandler = async (req, res) => {
//   try {
//     const { email } = req.body;
//     if (!email) return res.status(400).json({ message: "Email required" });
//     const result = await sendEmailOtp(email);
//     if (result.success) {
//       // Return debug OTP when transporter isn't configured
//       if (result.debug) return res.json({ message: 'Email OTP sent (debug)', debug: { otp: result.otp, expiresAt: result.expiresAt } });
//       return res.json({ message: 'Email OTP sent successfully' });
//     }
//     return res.status(500).json({ message: 'Failed to send email OTP', error: result.error || 'unknown' });
//   } catch (err) {
//     console.error('sendEmailOtpHandler:', err);
//     return res.status(500).json({ message: 'Email OTP send failed', error: err.message });
//   }
// };

// /* ==============================
//    🔹 VERIFY EMAIL OTP
// ================================= */
// export const verifyEmailOtpHandler = async (req, res) => {
//   try {
//     // Accept optional registration fields: name, phone, password
//     const { email, otp, name, phone, password } = req.body;
//     if (!email || !otp) return res.status(400).json({ message: 'Email and OTP required' });

//     const result = await verifyEmailOtp(email, otp);
//     if (!result.success) return res.status(400).json({ message: result.message || 'OTP verification failed' });

//     // Try to find existing user by email
//     const normalizedEmail = email.toLowerCase().trim();
//     let user = await User.findOne({ email: normalizedEmail });

//     if (user) {
//       // mark verified and return
//       user.emailVerified = true;
//       user.email = normalizedEmail;
//       await user.save();

//       return res.json({ message: 'Email verified successfully' });
//     }

//     // If no user exists but registration fields present, create account (email-only registration)
//     if (name && password) {
//       // optional phone normalization
//       let sanitizedPhone = null;
//       if (phone) {
//         const onlyDigits = String(phone).replace(/\D/g, "");
//         const noLeadingZeros = onlyDigits.replace(/^0+/, "");
//         sanitizedPhone = noLeadingZeros.length > 10 && noLeadingZeros.startsWith("91") ? noLeadingZeros.slice(-10) : (noLeadingZeros.length > 10 ? noLeadingZeros.slice(-10) : noLeadingZeros);
//       }

//       // Check for uniqueness
//       if (sanitizedPhone) {
//         const existingPhoneUser = await User.findOne({ phone: sanitizedPhone });
//         if (existingPhoneUser) return res.status(400).json({ message: 'Phone already registered' });
//       }
//       const existingEmailUser = await User.findOne({ email: normalizedEmail });
//       if (existingEmailUser) return res.status(400).json({ message: 'Email already registered' });

//       const newUser = new User({
//         fullName: name,
//         phone: sanitizedPhone || undefined,
//         email: normalizedEmail,
//         password,
//         isVerified: false,
//         emailVerified: true,
//       });

//       await newUser.save();

//       // issue token so frontend can treat user as logged in after registration via email
//       const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

//       return res.status(200).json({
//         success: true,
//         message: 'Registration (email) successful',
//         token,
//         user: {
//           id: newUser._id,
//           fullName: newUser.fullName,
//           phone: newUser.phone,
//           email: newUser.email,
//           emailVerified: newUser.emailVerified,
//           isVerified: newUser.isVerified,
//         }
//       });
//     }

//     // Otherwise email verified but not part of registration flow
//     return res.json({ message: 'Email verified successfully' });
//   } catch (err) {
//     console.error('verifyEmailOtpHandler:', err);
//     return res.status(500).json({ message: 'Email OTP verification failed', error: err.message });
//   }
// };

// /* ==============================
//    🔹 FORGOT PASSWORD (SMS)
// ================================= */
// export const forgotPasswordHandler = async (req, res) => {
//   try {
//     let { phone, email } = req.body;
//     if (!phone && !email) {
//       return res.status(400).json({ message: "Phone or email is required" });
//     }

//     if (phone) {
//       const sanitized = sanitizePhone(phone);
//       const user = await User.findOne({ phone: sanitized });
//       if (!user) return res.status(404).json({ message: "User not found with this phone number" });

//       // Send SMS OTP using otpService
//       const data = await sendOtp(sanitized);
//       const sessionId = data?.sessionId || data?.SessionId || data?.Details || null;

//       // update user session metadata
//       user.otpSessionId = sessionId;
//       user.otpSentAt = new Date();
//       user.otpAttemptCount = 0;
//       await user.save();

//       // best-effort: persist mapping in Redis
//       try {
//         if (sessionId) await setSessionInStore(sessionId, sanitized);
//       } catch (e) {
//         console.warn("[authController][forgotPassword] setSessionInStore failed:", e.message || e);
//       }

//       return res.json({
//         message: "Password reset OTP sent to phone",
//         sessionId,
//         method: "sms",
//         full: data,
//       });
//     }

//     // Email-based password reset
//     if (email) {
//       const normalizedEmail = String(email).toLowerCase().trim();
//       const userByEmail = await User.findOne({ email: normalizedEmail });
//       if (!userByEmail) return res.status(404).json({ message: "User not found with this email address" });

//       try {
//         const result = await sendEmailOtp(normalizedEmail);
//         // If transporter not configured, sendEmailOtp returns debug OTP in result.debug / result.otp
//         if (result.success) {
//           if (result.debug || result.otp) {
//             return res.json({ message: "Email OTP sent (debug)", method: "email", debug: { otp: result.otp, expiresAt: result.expiresAt } });
//           }
//           return res.json({ message: "Email OTP sent", method: "email" });
//         }
//         return res.status(500).json({ message: "Failed to send email OTP", method: "email", error: result.error || 'unknown' });
//       } catch (e) {
//         console.error("forgotPassword email send failed:", e);
//         return res.status(500).json({ message: "Failed to send email OTP", method: "email", error: e.message || e });
//       }
//     }
//   } catch (err) {
//     console.error("forgotPasswordHandler error:", err.message || err);
//     return res.status(500).json({ message: "Failed to send reset OTP", error: err.message || err });
//   }
// };

// /* ==============================
//    🔹 RESET PASSWORD (SMS)
// ================================= */
// export const resetPasswordHandler = async (req, res) => {
//   try {
//     const { phone, sessionId, otp, newPassword, method } = req.body;

//     if (!newPassword || newPassword.length < 6) {
//       return res.status(400).json({ message: "Password must be at least 6 characters" });
//     }

//     if (method === "sms") {
//       if (!phone || !sessionId || !otp) return res.status(400).json({ message: "Missing SMS reset parameters" });

//       const sanitized = sanitizePhone(phone);
//       let user = await User.findOne({ phone: sanitized });
//       if (!user) return res.status(404).json({ message: "User not found" });

//       // Check lockout
//       const MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);
//       if (user.otpAttemptCount >= MAX_ATTEMPTS) {
//         return res.status(429).json({ message: "Too many incorrect OTP attempts. Request a new OTP." });
//       }

//       const result = await verifyOtp(sessionId, otp);
//       if (!result || !result.success) {
//         user.otpAttemptCount = (user.otpAttemptCount || 0) + 1;
//         await user.save();
//         return res.status(400).json({ message: result?.error || 'Invalid SMS OTP' });
//       }

//       // success: reset attempts
//       user.otpAttemptCount = 0;
//       user.password = newPassword;
//       await user.save();

//       return res.json({ message: "Password reset successful. Please login with your new password." });
//     }

//     return res.status(501).json({ message: "Email reset flow not implemented" });
//   } catch (err) {
//     console.error("resetPasswordHandler error:", err.message || err);
//     return res.status(500).json({ message: "Password reset failed", error: err.message || err });
//   }
// };

// /* ==============================
//    🔹 CHANGE PASSWORD (authenticated)
// ================================= */
// export const changePasswordHandler = async (req, res) => {
//   try {
//     const userId = req.user?.id;
//     const { currentPassword, newPassword } = req.body;
//     if (!userId) return res.status(401).json({ message: 'Unauthorized' });
//     if (!currentPassword || !newPassword) return res.status(400).json({ message: 'Current and new passwords are required' });
//     if (newPassword.length < 6) return res.status(400).json({ message: 'New password must be at least 6 characters' });

//     const user = await User.findById(userId);
//     if (!user) return res.status(404).json({ message: 'User not found' });

//     const isMatch = await user.matchPassword(currentPassword);
//     if (!isMatch) return res.status(401).json({ message: 'Current password is incorrect' });

//     user.password = newPassword;
//     await user.save();

//     return res.json({ success: true, message: 'Password changed successfully' });
//   } catch (err) {
//     console.error('changePasswordHandler error:', err.message || err);
//     return res.status(500).json({ message: 'Failed to change password', error: err.message || err });
//   }
// };

// /* ==============================
//    🔹 DELETE ACCOUNT (self-service)
// ================================= */
// export const deleteAccountHandler = async (req, res) => {
//   // Convert immediate deletion into enqueued background job
//   try {
//     const userId = req.user?.id;
//     if (!userId) return res.status(401).json({ message: 'Unauthorized' });

//     const user = await User.findById(userId);
//     if (!user) return res.status(404).json({ message: 'User not found' });
//     if (user.role === 'admin') return res.status(403).json({ message: 'Cannot delete admin account' });

//     const DeletionJob = (await import('../models/DeletionJob.js')).default;
//     const job = await DeletionJob.create({ user: user._id, status: 'queued', progress: 0, message: 'Queued for deletion' });

//     // Worker (separate poller) will pick up and process the job.
//     return res.status(202).json({ success: true, message: 'Deletion enqueued', jobId: job._id });
//   } catch (err) {
//     console.error('enqueue deleteAccountHandler error:', err);
//     return res.status(500).json({ message: 'Failed to enqueue delete job', error: err.message || err });
//   }
// };

// // Helper: perform full deletion (used by worker)
// export const performFullAccountDeletion = async (userId, progressCallback = async () => {}) => {
//   // progressCallback(percent:number, message:string)
//   try {
//     const u = await User.findById(userId);
//     if (!u) throw new Error('User not found');

//     // step 1: delete payments
//     await progressCallback(5, 'Removing payments');
//     try {
//       const Payment = (await import('../models/Payment.js')).default;
//       await Payment.deleteMany({ user: userId });
//     } catch (e) {
//       console.warn('[performDelete] payments removal failed', e.message || e);
//     }

//     // step 2: remove quiz participant entries
//     await progressCallback(25, 'Removing user from quizzes');
//     try {
//       const Quiz = (await import('../models/Quiz.js')).default;
//       await Quiz.updateMany({ 'participants.user': userId }, { $pull: { participants: { user: userId } } });
//     } catch (e) {
//       console.warn('[performDelete] quiz cleanup failed', e.message || e);
//     }

//     // step 3: delete blogs and associated local files
//     await progressCallback(45, 'Deleting blogs and uploaded images');
//     try {
//       const Blog = (await import('../models/Blog.js')).default;
//       const blogs = await Blog.find({ author: userId });
//       for (const b of blogs) {
//         try {
//           if (b.imageUrl && typeof b.imageUrl === 'string' && !b.imageUrl.startsWith('http')) {
//             const fs = await import('fs');
//             const path = await import('path');
//             const uploadPath = path.isAbsolute(b.imageUrl) ? b.imageUrl : path.join(process.cwd(), b.imageUrl);
//             if (fs.existsSync(uploadPath)) {
//               try { fs.unlinkSync(uploadPath); } catch (e) { console.warn('unlink blog image failed', e.message || e); }
//             }
//           }
//         } catch (e) {
//           console.warn('blog file delete error', e.message || e);
//         }
//         try { await Blog.findByIdAndDelete(b._id); } catch (e) { console.warn('delete blog doc failed', e.message || e); }
//       }
//     } catch (e) {
//       console.warn('[performDelete] blogs removal failed', e.message || e);
//     }

//     // step 4: delete comments/likes and other references
//     await progressCallback(65, 'Removing comments and likes');
//     try {
//       // Attempt common collections: Comments, Likes (if present)
//       try {
//         const Comments = (await import('../models/Comment.js')).default;
//         await Comments.deleteMany({ user: userId });
//       } catch (e) { /* no Comments model or error - best effort */ }

//       try {
//         const Like = (await import('../models/Like.js')).default;
//         await Like.deleteMany({ user: userId });
//       } catch (e) { /* no Like model or error - best effort */ }

//       // Remove references in other collections (e.g., Blog.comments arrays)
//       try {
//         const Blog = (await import('../models/Blog.js')).default;
//         await Blog.updateMany({}, { $pull: { comments: { user: userId } } });
//       } catch (e) {}
//     } catch (e) {
//       console.warn('[performDelete] comments/likes cleanup failed', e.message || e);
//     }

//     // step 5: remove profile image
//     await progressCallback(80, 'Removing profile image');
//     try {
//       if (u.profileImage && typeof u.profileImage === 'string' && !u.profileImage.startsWith('http')) {
//         const fs = await import('fs');
//         const path = await import('path');
//         const uploadPath = path.isAbsolute(u.profileImage) ? u.profileImage : path.join(process.cwd(), u.profileImage);
//         if (fs.existsSync(uploadPath)) try { fs.unlinkSync(uploadPath); } catch (e) { console.warn('unlink profile image failed', e.message || e); }
//       }
//     } catch (e) { console.warn('[performDelete] profile image removal failed', e.message || e); }

//     // step 6: final user deletion and minor cleanup
//     await progressCallback(90, 'Deleting user record');
//     try { await User.findByIdAndDelete(userId); } catch (e) { console.warn('final user delete failed', e.message || e); }

//     await progressCallback(100, 'Completed');
//     return { success: true };
//   } catch (err) {
//     console.error('performFullAccountDeletion error:', err);
//     try { await progressCallback(0, 'Failed'); } catch (e) {}
//     return { success: false, error: err.message || String(err) };
//   }
// };

// // get user preferences
// export const getUserPreferencesHandler = async (req, res) => {
//   try {
//     const user = await User.findById(req.user?.id).select('preferences');
//     if (!user) return res.status(404).json({ message: 'User not found' });
//     return res.json({ success: true, preferences: user.preferences || {} });
//   } catch (err) {
//     console.error('getUserPreferencesHandler error:', err.message || err);
//     return res.status(500).json({ message: 'Failed to get preferences', error: err.message || err });
//   }
// };

// // set user preferences
// export const setUserPreferencesHandler = async (req, res) => {
//   try {
//     const userId = req.user?.id;
//     const { preferences } = req.body;
//     if (!userId) return res.status(401).json({ message: 'Unauthorized' });
//     if (typeof preferences !== 'object') return res.status(400).json({ message: 'preferences object required' });

//     const user = await User.findById(userId);
//     if (!user) return res.status(404).json({ message: 'User not found' });
//     user.preferences = preferences;
//     await user.save();
//     return res.json({ success: true, preferences: user.preferences });
//   } catch (err) {
//     console.error('setUserPreferencesHandler error:', err.message || err);
//     return res.status(500).json({ message: 'Failed to set preferences', error: err.message || err });
//   }
// };










// // backend/controllers/authController.js
// import jwt from "jsonwebtoken";
// import User from "../models/User.js";
// import { issueAuthTokens } from "./tokenController.js";
// import {
//   sendSmsAutogen,
//   verifySmsOtp,
//   sendEmailOtp,
//   verifyEmailOtp,
//   debugFetchEmailOtp,
// } from "../utils/otpService.js";

// /**
//  * createToken: signs JWT and sets HttpOnly cookie (legacy cookie "token")
//  */
// const createToken = (user, res) => {
//   const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "15m" });
//   res.cookie("token", token, {
//     httpOnly: true,
//     secure: process.env.NODE_ENV === "production",
//     sameSite: "lax",
//     maxAge: 15 * 60 * 1000,
//   });
//   return token;
// };

// /**
//  * POST /api/auth/send-otp
//  * Body: { phone }
//  * Returns: { sessionId, full } where full is raw 2factor response (or debug)
//  */
// export const sendOtpHandler = async (req, res) => {
//   try {
//     const { phone } = req.body;
//     if (!phone) return res.status(400).json({ message: "Phone required" });

//     // Ensure phone is passed as 10-digit (strip +91 if present)
//     const sanitized = phone.replace(/^\+?91/, "").trim();

//     const data = await sendSmsAutogen(sanitized);
//     // 2factor returns SessionId in resp data or our dev wrapper returns sessionId
//     const sessionId = data?.SessionId || data?.sessionId || data?.Details || null;

//     return res.json({ sessionId, full: data });
//   } catch (err) {
//     console.error("sendOtpHandler:", err.response?.data || err.message);
//     return res.status(500).json({ message: "OTP send failed", error: err.message });
//   }
// };

// /**
//  * POST /api/auth/verify-otp
//  * Body: { phone, sessionId, otp, name, password, email, emailOtp }
//  * Two-step verification: SMS OTP first, then Email OTP (REQUIRED - both must be verified)
//  * Marks isVerified and emailVerified accordingly.
//  */
// export const verifyOtpHandler = async (req, res) => {
//   try {
//     const { phone, sessionId, otp, name, password, email, emailOtp } = req.body;
//     if (!phone || !sessionId || !otp) return res.status(400).json({ message: "Missing SMS OTP params" });
//     if (!name || !password) return res.status(400).json({ message: "Name and password are required" });
    
//     // Email is now REQUIRED for registration
//     if (!email) {
//       return res.status(400).json({ message: "Email is required for registration" });
//     }
    
//     if (!emailOtp) {
//       return res.status(400).json({ 
//         message: "Email OTP is required for registration", 
//         requiresEmailOtp: true,
//         phoneVerified: false 
//       });
//     }

//     const sanitized = phone.replace(/^\+?91/, "").replace(/[\s\-\(\)]/g, "").trim();
    
//     // Verify SMS OTP first
//     const result = await verifySmsOtp(sessionId, otp);
//     if (!result || (result.Details !== "OTP Matched" && result.Status !== "Success" && result.Status !== "SUCCESS")) {
//       // Check if dev mode
//       if (!sessionId.startsWith("DEV_SESSION_")) {
//         return res.status(400).json({ message: "Invalid SMS OTP", details: result });
//       }
//     }

//     // Verify Email OTP (REQUIRED)
//     const emailResult = await verifyEmailOtp(email.toLowerCase().trim(), emailOtp);
//     if (!emailResult.success) {
//       return res.status(400).json({ 
//         message: emailResult.message || "Invalid Email OTP",
//         phoneVerified: true,
//         emailVerified: false
//       });
//     }

//     // Check if user already exists
//     const existingUser = await User.findOne({ phone: sanitized });
//     if (existingUser) {
//       return res.status(400).json({ message: "User with this phone number already exists" });
//     }

//     // Check if email is already taken
//     const existingEmailUser = await User.findOne({ email: email.toLowerCase().trim() });
//     if (existingEmailUser) {
//       return res.status(400).json({ message: "Email already registered" });
//     }

//     // Create new user with both SMS and Email verified
//     const user = new User({
//       fullName: name,
//       username: sanitized,
//       phone: sanitized,
//       email: email.toLowerCase().trim(),
//       password,
//       isVerified: true, // SMS verified
//       emailVerified: true, // Email verified (required)
//     });

//     await user.save();

//     // Issue tokens
//     const token = createToken(user, res);
//     const { accessToken } = await issueAuthTokens(user, res);

//     console.log(`[register] New user registered: ${user._id}, phone: ${user.phone}, email: ${user.email}`);

//     return res.json({
//       message: "Registration successful",
//       user: {
//         _id: user._id,
//         fullName: user.fullName,
//         username: user.username,
//         phone: user.phone,
//         email: user.email,
//         isVerified: user.isVerified,
//         emailVerified: user.emailVerified,
//       },
//       token,
//       accessToken,
//     });
//   } catch (err) {
//     console.error("verifyOtpHandler:", err.response?.data || err.message);
//     return res.status(500).json({ message: "OTP verification failed", error: err.message });
//   }
// };

// /**
//  * POST /api/auth/login
//  * Body: { phone, password }
//  * Phone + password login required (as per requirements)
//  */
// export const loginHandler = async (req, res) => {
//   try {
//     const { phone, password } = req.body;
//     if (!phone || !password) return res.status(400).json({ message: "Missing credentials" });

//     const sanitized = phone.replace(/^\+?91/, "").trim();
//     const user = await User.findOne({ phone: sanitized });
//     if (!user) return res.status(401).json({ message: "Invalid credentials" });

//     const valid = await user.matchPassword(password);
//     if (!valid) return res.status(401).json({ message: "Invalid credentials" });

//     if (!user.isVerified) return res.status(401).json({ message: "Phone not verified" });

//     const token = createToken(user, res);
//     const { accessToken } = await issueAuthTokens(user, res);

//     return res.json({
//       message: "Login successful",
//       user: {
//         _id: user._id,
//         fullName: user.fullName,
//         username: user.username,
//         phone: user.phone,
//         email: user.email,
//         isVerified: user.isVerified,
//         emailVerified: user.emailVerified,
//       },
//       token,
//       accessToken,
//     });
//   } catch (err) {
//     console.error("loginHandler:", err.message);
//     return res.status(500).json({ message: "Login failed", error: err.message });
//   }
// };

// /**
//  * POST /api/auth/logout
//  */
// export const logoutHandler = async (req, res) => {
//   try {
//     res.clearCookie("token");
//     // also clear refresh cookie if your tokenController uses one (issueAuthTokens might)
//     res.clearCookie("refreshToken", { path: "/api/auth/refresh" });
//     return res.json({ message: "Logged out" });
//   } catch (err) {
//     console.error("logoutHandler:", err.message);
//     return res.status(500).json({ message: "Logout failed", error: err.message });
//   }
// };

// /**
//  * GET /api/auth/profile
//  * Protected by requireAuth middleware (req.user)
//  */
// export const getProfile = async (req, res) => {
//   try {
//     if (!req.user?.id) return res.status(401).json({ message: "Unauthorized" });
//     const user = await User.findById(req.user.id).select("-password");
//     if (!user) return res.status(404).json({ message: "User not found" });
//     return res.json(user);
//   } catch (err) {
//     console.error("getProfile:", err.message);
//     return res.status(500).json({ message: "Failed to get profile" });
//   }
// };

// /**
//  * PUT /api/auth/profile
//  * Update user profile (fullName, username, email, profile image handled via multer)
//  */
// export const updateProfile = async (req, res) => {
//   try {
//     const { fullName, username, email } = req.body;

//     if (!fullName || !username) {
//       return res.status(400).json({ message: "Full name and username are required" });
//     }

//     const user = await User.findById(req.user.id);
//     if (!user) return res.status(404).json({ message: "User not found" });

//     const existingUser = await User.findOne({ username, _id: { $ne: req.user.id } });
//     if (existingUser) return res.status(400).json({ message: "Username already taken" });

//     if (email) {
//       const existingEmailUser = await User.findOne({ email, _id: { $ne: req.user.id } });
//       if (existingEmailUser) return res.status(400).json({ message: "Email already taken" });
//     }

//     user.fullName = fullName;
//     user.username = username;
//     if (email) user.email = email;

//     if (req.file) {
//       // delete old file if exists
//       if (user.profileImage) {
//         try {
//           const fs = await import("fs");
//           const path = await import("path");
//           const oldImagePath = path.join(process.cwd(), "uploads", user.profileImage);
//           if (fs.existsSync(oldImagePath)) fs.unlinkSync(oldImagePath);
//         } catch (e) {
//           console.error("Error deleting old image:", e.message);
//         }
//       }
//       user.profileImage = req.file.filename;
//     }

//     await user.save();

//     return res.json({
//       message: "Profile updated successfully",
//       user: {
//         _id: user._id,
//         fullName: user.fullName,
//         username: user.username,
//         phone: user.phone,
//         email: user.email,
//         profileImage: user.profileImage,
//         isVerified: user.isVerified,
//         emailVerified: user.emailVerified,
//         createdAt: user.createdAt,
//       },
//     });
//   } catch (err) {
//     console.error("updateProfile:", err.message);
//     return res.status(500).json({ message: "Failed to update profile" });
//   }
// };

// /* ---------------- Email OTP Handlers ---------------- */

// /**
//  * POST /api/auth/send-email-otp
//  * Body: { email }
//  */
// export const sendEmailOtpHandler = async (req, res) => {
//   try {
//     const { email } = req.body;
//     if (!email) return res.status(400).json({ message: "Email required" });

//     const result = await sendEmailOtp(email);
//     // If dev, result may contain otp for debugging
//     return res.json({ message: "Email OTP sent successfully", debug: result.debug ? result : undefined });
//   } catch (err) {
//     console.error("sendEmailOtpHandler:", err.message);
//     return res.status(500).json({ message: "Email OTP send failed", error: err.message });
//   }
// };

// /**
//  * POST /api/auth/verify-email-otp
//  * Body: { email, otp }
//  *
//  * Works both for verifying during registration (no auth) and for logged-in users.
//  */
// export const verifyEmailOtpHandler = async (req, res) => {
//   try {
//     const { email, otp } = req.body;
//     if (!email || !otp) return res.status(400).json({ message: "Email and OTP required" });

//     const result = await verifyEmailOtp(email, otp);
//     if (!result.success) {
//       return res.status(400).json({ message: result.message || "OTP verification failed" });
//     }

//     // If request is authenticated, update that user; otherwise update user with this email (reg flow)
//     let user = null;
//     if (req.user?.id) {
//       user = await User.findById(req.user.id);
//     } else {
//       user = await User.findOne({ email });
//     }

//     if (user) {
//       user.email = email;
//       user.emailVerified = true;
//       await user.save();
//     }

//     return res.json({ message: "Email verified successfully" });
//   } catch (err) {
//     console.error("verifyEmailOtpHandler:", err.message);
//     return res.status(500).json({ message: "Email OTP verification failed", error: err.message });
//   }
// };

// /* ---------------- Password Reset Handlers ---------------- */

// /**
//  * POST /api/auth/forgot-password
//  * Body: { phone? OR email? }
//  * Sends OTP via SMS (if phone) or Email (if email) for password reset
//  */
// export const forgotPasswordHandler = async (req, res) => {
//   try {
//     const { phone, email } = req.body;
    
//     if (!phone && !email) {
//       return res.status(400).json({ message: "Phone or email is required" });
//     }

//     let user = null;
//     if (phone) {
//       // Sanitize phone number - remove +91, spaces, dashes, and other non-digits
//       let sanitized = phone.replace(/^\+?91/, "").replace(/[\s\-\(\)]/g, "").trim();
      
//       // Try to find user with exact match first
//       user = await User.findOne({ phone: sanitized });
      
//       // If not found, try without country code stripping (in case stored differently)
//       if (!user && phone.length >= 10) {
//         const alternate = phone.replace(/[\s\-\(\)]/g, "").trim();
//         user = await User.findOne({ 
//           $or: [
//             { phone: alternate },
//             { phone: sanitized }
//           ]
//         });
//       }
      
//       if (!user) {
//         console.error(`[forgotPassword] User not found for phone: ${phone} (sanitized: ${sanitized})`);
//         return res.status(404).json({ message: "User not found with this phone number" });
//       }

//       console.log(`[forgotPassword] Found user: ${user._id}, phone: ${user.phone}`);

//       // Send SMS OTP
//       const data = await sendSmsAutogen(sanitized);
//       const sessionId = data?.SessionId || data?.sessionId || data?.Details || null;
      
//       console.log(`[forgotPassword] SMS OTP sent, sessionId: ${sessionId}`);
      
//       return res.json({ 
//         message: "Password reset OTP sent to phone",
//         sessionId,
//         method: "sms",
//         full: data 
//       });
//     } else if (email) {
//       user = await User.findOne({ email: email.toLowerCase().trim() });
//       if (!user) {
//         console.error(`[forgotPassword] User not found for email: ${email}`);
//         return res.status(404).json({ message: "User not found with this email address" });
//       }

//       console.log(`[forgotPassword] Found user: ${user._id}, email: ${user.email}`);

//       // Send Email OTP
//       const result = await sendEmailOtp(email.toLowerCase().trim());
//       return res.json({ 
//         message: "Password reset OTP sent to email",
//         method: "email",
//         debug: result.debug ? result : undefined
//       });
//     }
//   } catch (err) {
//     console.error("forgotPasswordHandler error:", err.message);
//     console.error("Stack:", err.stack);
//     return res.status(500).json({ message: "Failed to send reset OTP", error: err.message });
//   }
// };

// /**
//  * POST /api/auth/reset-password
//  * Body: { phone?, email?, sessionId?, otp, newPassword, method }
//  * Verifies OTP and resets password
//  */
// export const resetPasswordHandler = async (req, res) => {
//   try {
//     const { phone, email, sessionId, otp, newPassword, method } = req.body;
    
//     if (!newPassword || newPassword.length < 6) {
//       return res.status(400).json({ message: "Password must be at least 6 characters" });
//     }

//     let user = null;
//     let verified = false;

//     if (method === "sms" && phone && sessionId && otp) {
//       // Sanitize phone number - same as forgot password
//       let sanitized = phone.replace(/^\+?91/, "").replace(/[\s\-\(\)]/g, "").trim();
//       user = await User.findOne({ phone: sanitized });
      
//       if (!user && phone.length >= 10) {
//         const alternate = phone.replace(/[\s\-\(\)]/g, "").trim();
//         user = await User.findOne({ 
//           $or: [
//             { phone: alternate },
//             { phone: sanitized }
//           ]
//         });
//       }
      
//       if (!user) {
//         return res.status(404).json({ message: "User not found" });
//       }

//       const result = await verifySmsOtp(sessionId, otp);
//       if (!result || (result.Details !== "OTP Matched" && result.Status !== "Success" && result.Status !== "SUCCESS")) {
//         // Check if it's dev mode
//         if (sessionId.startsWith("DEV_SESSION_")) {
//           console.log("[resetPassword] Dev mode: Accepting any OTP for testing");
//           verified = true;
//         } else {
//           return res.status(400).json({ message: "Invalid SMS OTP" });
//         }
//       } else {
//         verified = true;
//       }
//     } else if (method === "email" && email && otp) {
//       user = await User.findOne({ email: email.toLowerCase().trim() });
//       if (!user) {
//         return res.status(404).json({ message: "User not found" });
//       }

//       const result = await verifyEmailOtp(email.toLowerCase().trim(), otp);
//       if (!result.success) {
//         return res.status(400).json({ message: result.message || "Invalid Email OTP" });
//       }
//       verified = true;
//     } else {
//       return res.status(400).json({ message: "Invalid reset parameters" });
//     }

//     if (!verified || !user) {
//       return res.status(400).json({ message: "OTP verification failed" });
//     }

//     // Update password
//     user.password = newPassword;
//     await user.save();

//     console.log(`[resetPassword] Password reset successful for user: ${user._id}`);
//     return res.json({ message: "Password reset successful. Please login with your new password." });
//   } catch (err) {
//     console.error("resetPasswordHandler error:", err.message);
//     console.error("Stack:", err.stack);
//     return res.status(500).json({ message: "Password reset failed", error: err.message });
//   }
// };




















// import jwt from "jsonwebtoken";
// import User from "../models/User.js";
// import { issueAuthTokens } from "./tokenController.js";
// import { sendOTP, verifyOTP, sendEmailOTP, verifyEmailOTP } from "../utils/otpService.js";

// /**
//  * createToken: signs JWT and sets HttpOnly cookie
//  */
// const createToken = (user, res) => {
//   // For backward compatibility, keep setting legacy cookie with longer life
//   const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "15m" });
//   res.cookie("token", token, {
//     httpOnly: true,
//     secure: process.env.NODE_ENV === "production",
//     sameSite: "lax",
//     maxAge: 15 * 60 * 1000,
//   });
//   return token;
// };

// export const sendOtpHandler = async (req, res) => {
//   try {
//     const { phone } = req.body;
//     if (!phone) return res.status(400).json({ message: "Phone required" });
//     const data = await sendOTP(phone);
//     // twofactor returns Details which is the session id
//     return res.json({ sessionId: data.Details, full: data });
//   } catch (err) {
//     console.error("sendOtpHandler:", err.response?.data || err.message);
//     res.status(500).json({ message: "OTP send failed", error: err.message });
//   }
// };

// export const verifyOtpHandler = async (req, res) => {
//   try {
//     const { phone, sessionId, otp, name, password } = req.body;
//     if (!phone || !sessionId || !otp) return res.status(400).json({ message: "Missing params" });

//     const result = await verifyOTP(sessionId, otp);
//     // 2factor typical success: Status = Success and Details = "OTP Matched"
//     if (!result || (result.Details !== "OTP Matched" && result.Status !== "Success")) {
//       return res.status(400).json({ message: "Invalid OTP", details: result });
//     }

//     // let user = await User.findOne({ phone });
//     // if (!user) {
//     //   // create user with provided password (if not provided, random)
//     //   const pw = password || Math.random().toString(36).slice(2, 10);
//     //   user = await User.create({ name: name || "User", phone, password: pw, verified: true });
//     // } else {
//     //   user.verified = true;
//     //   await user.save();
//     // }
//     let user = await User.findOne({ phone });
// if (!user) {
//   const pw = password || Math.random().toString(36).slice(2, 10);
//   user = new User({
//     fullName: name || "",
//     username: phone,        // you can change this mapping if you want a custom username
//     phone,
//     password: pw,
//     isVerified: true
//   });
//   await user.save();
// } else {
//   user.isVerified = true;
//   await user.save();
// }


//     const token = createToken(user, res);
//     const { accessToken } = issueAuthTokens(user, res);
//     return res.json({ 
//       message: "Verified & Logged In", 
//       user,
//       token,
//       accessToken
//     });
//   } catch (err) {
//     console.error("verifyOtpHandler:", err.response?.data || err.message);
//     res.status(500).json({ message: "OTP verification failed", error: err.message });
//   }
// };

// export const loginHandler = async (req, res) => {
//   try {
//     const { phone, password } = req.body;
//     if (!phone || !password) return res.status(400).json({ message: "Missing credentials" });

//     const user = await User.findOne({ phone });
//     if (!user) return res.status(401).json({ message: "Invalid credentials" });

//     const valid = await user.matchPassword(password);
//     if (!valid) return res.status(401).json({ message: "Invalid credentials" });

//     // if (!user.verified) return res.status(401).json({ message: "Phone not verified" });
//     if (!user.isVerified) return res.status(401).json({ message: "Phone not verified" });

//     const token = createToken(user, res);
//     const { accessToken } = issueAuthTokens(user, res);
//     return res.json({ 
//       message: "Login successful", 
//       user,
//       token,
//       accessToken
//     });
//   } catch (err) {
//     console.error("loginHandler:", err.message);
//     res.status(500).json({ message: "Login failed", error: err.message });
//   }
// };

// export const logoutHandler = async (req, res) => {
//   res.clearCookie("token");
//   res.json({ message: "Logged out" });
// };

// export const getProfile = async (req, res) => {
//   try {
//     const user = await User.findById(req.user.id).select("-password");
//     if (!user) return res.status(404).json({ message: "User not found" });
//     res.json(user);
//   } catch (err) {
//     console.error("getProfile:", err.message);
//     res.status(500).json({ message: "Failed to get profile" });
//   }
// };

// export const updateProfile = async (req, res) => {
//   try {
//     const { fullName, username, email } = req.body;
    
//     if (!fullName || !username) {
//       return res.status(400).json({ message: "Full name and username are required" });
//     }

//     const user = await User.findById(req.user.id);
//     if (!user) return res.status(404).json({ message: "User not found" });

//     // Check if username is already taken by another user
//     const existingUser = await User.findOne({ 
//       username, 
//       _id: { $ne: req.user.id } 
//     });
    
//     if (existingUser) {
//       return res.status(400).json({ message: "Username already taken" });
//     }

//     // Check if email is already taken by another user
//     if (email) {
//       const existingEmailUser = await User.findOne({ 
//         email, 
//         _id: { $ne: req.user.id } 
//       });
      
//       if (existingEmailUser) {
//         return res.status(400).json({ message: "Email already taken" });
//       }
//     }

//     user.fullName = fullName;
//     user.username = username;
//     if (email) user.email = email;
    
//     // Handle profile image upload
//     if (req.file) {
//       // Delete old profile image if exists
//       if (user.profileImage) {
//         const fs = await import('fs');
//         const path = await import('path');
//         const oldImagePath = path.join(process.cwd(), 'uploads', user.profileImage);
//         try {
//           if (fs.existsSync(oldImagePath)) {
//             fs.unlinkSync(oldImagePath);
//           }
//         } catch (deleteErr) {
//           console.error("Error deleting old image:", deleteErr);
//         }
//       }
//       user.profileImage = req.file.filename;
//     }
    
//     await user.save();

//     res.json({ 
//       message: "Profile updated successfully", 
//       user: {
//         _id: user._id,
//         fullName: user.fullName,
//         username: user.username,
//         phone: user.phone,
//         email: user.email,
//         profileImage: user.profileImage,
//         isVerified: user.isVerified,
//         emailVerified: user.emailVerified,
//         createdAt: user.createdAt
//       }
//     });
//   } catch (err) {
//     console.error("updateProfile:", err.message);
//     res.status(500).json({ message: "Failed to update profile" });
//   }
// };

// // Email OTP handlers
// export const sendEmailOtpHandler = async (req, res) => {
//   try {
//     const { email } = req.body;
//     if (!email) return res.status(400).json({ message: "Email required" });
    
//     const result = await sendEmailOTP(email);
//     return res.json({ message: "Email OTP sent successfully" });
//   } catch (err) {
//     console.error("sendEmailOtpHandler:", err.message);
//     res.status(500).json({ message: "Email OTP send failed", error: err.message });
//   }
// };

// export const verifyEmailOtpHandler = async (req, res) => {
//   try {
//     const { email, otp } = req.body;
//     if (!email || !otp) return res.status(400).json({ message: "Email and OTP required" });

//     const result = await verifyEmailOTP(email, otp);
//     if (!result.success) {
//       return res.status(400).json({ message: result.message });
//     }

//     // Update user's email verification status
//     const user = await User.findById(req.user.id);
//     if (user) {
//       user.email = email;
//       user.emailVerified = true;
//       await user.save();
//     }

//     return res.json({ message: "Email verified successfully" });
//   } catch (err) {
//     console.error("verifyEmailOtpHandler:", err.message);
//     res.status(500).json({ message: "Email OTP verification failed", error: err.message });
//   }
// };









