// // // // // // backend/utils/otpService.js

// backend/utils/otpService.js
import axios from "axios";
import dotenv from "dotenv";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { createClient } from "redis";
import { getRedisClient } from "../config/redis.js";

dotenv.config();

const TWOFACTOR_API_KEY = process.env.TWOFACTOR_API_KEY;
const TWOFACTOR_BASE = "https://2factor.in/API/V1";
const OTP_HASH_SECRET = process.env.OTP_HASH_SECRET || process.env.JWT_SECRET || "change-this-in-prod";
const OTP_TTL_MS = Number(process.env.OTP_TTL_MS || 3 * 60 * 1000);
const EMAIL_OTP_TTL_MS = Number(process.env.EMAIL_OTP_TTL_MS || 5 * 60 * 1000);
const RESEND_COOLDOWN_MS = Number(process.env.OTP_RESEND_TTL_MS || 60 * 1000);
const MAX_EMAIL_OTP_ATTEMPTS = Number(process.env.EMAIL_OTP_ATTEMPT_LIMIT || 5);

function hashValue(value, extra = "") {
  return crypto.createHmac("sha256", OTP_HASH_SECRET).update(`${value}:${extra}`).digest("hex");
}

// Helper keys
const sessionKey = (sid) => `otp:session:${sid}`;        // sessionId -> phone
const attemptsKey = (phone) => `otp:attempts:${phone}`;  // incr attempts on phone
const resendKey = (phone) => `otp:resend:${phone}`;      // cooldown on resend
const emailOtpKey = (email) => `otp:email:${email}`;     // store email OTP payload

async function redis() {
  const c = await getRedisClient();
  return c;
}

/**
 * Send SMS via 2factor.in AUTOGEN
 * Stores sessionId -> phone in Redis with TTL and sets a resend cooldown.
 */
export async function sendSmsOtp(phone) {
  if (!TWOFACTOR_API_KEY) {
    // If not configured, return debug session id (for local tests)
    const fallbackId = `dev_session_${Date.now()}`;
    return { success: true, sessionId: fallbackId, dev: true };
  }

  const digitsOnly = String(phone).replace(/\D/g, "");
  if (digitsOnly.length !== 10) return { success: false, error: "Invalid phone (must be 10 digits)" };

  const url = `${TWOFACTOR_BASE}/${TWOFACTOR_API_KEY}/SMS/+91${digitsOnly}/AUTOGEN`;
  try {
    const resp = await axios.get(url, { timeout: 15000, validateStatus: (s) => s < 600 });
    const data = resp.data;
    const sessionId = data?.Details || data?.SessionId || data?.sessionId || null;
    if (data.Status === "Success" || data.Status === "SUCCESS") {
      // persist mapping session -> phone in Redis with TTL
      try {
        const c = await redis();
        if (c) {
          await c.set(sessionKey(sessionId), digitsOnly, { PX: OTP_TTL_MS });
          // reset attempt counter for this phone
          await c.del(attemptsKey(digitsOnly));
          // set resend cooldown
          await c.set(resendKey(digitsOnly), "1", { PX: RESEND_COOLDOWN_MS });
        }
      } catch (e) {
        console.warn("[otpService] redis write failed (sendSmsOtp)", e.message || e);
      }
      return { success: true, sessionId };
    } else {
      const details = data?.Details || data?.Message || JSON.stringify(data);
      return { success: false, error: details, full: data };
    }
  } catch (err) {
    const httpData = err.response?.data;
    return { success: false, error: httpData?.Message || err.message || "Failed to send SMS OTP" };
  }
}

/**
 * Verify SMS OTP against 2factor
 * On success deletes session key and resets attempts.
 */
export async function verifySmsOtp(sessionId, otp) {
  if (!TWOFACTOR_API_KEY) {
    // In dev, accept any OTP if dev session id format
    if (String(sessionId).startsWith("dev_session_")) {
      return { success: true, dev: true, message: "dev-otp-accepted" };
    }
    return { success: false, error: "2Factor not configured" };
  }
  try {
    const url = `${TWOFACTOR_BASE}/${TWOFACTOR_API_KEY}/SMS/VERIFY/${sessionId}/${otp}`;
    const resp = await axios.get(url, { timeout: 15000, validateStatus: (s) => s < 600 });
    const data = resp.data;
    if (data.Status === "Success" || data.Status === "SUCCESS") {
      // delete session -> phone mapping
      try {
        const c = await redis();
        if (c) await c.del(sessionKey(sessionId));
      } catch (e) {
        console.warn("[otpService] redis del failed (verifySmsOtp)", e.message || e);
      }
      return { success: true, full: data };
    } else {
      return { success: false, error: data?.Details || data?.Message || "OTP mismatch", full: data };
    }
  } catch (err) {
    const httpData = err.response?.data;
    return { success: false, error: httpData?.Message || err.message || "Verification failed" };
  }
}

/* ---------------- Email OTP (server generated) ---------------- */
function genNumericOtp(digits = 6) {
  const min = 10 ** (digits - 1);
  const max = 10 ** digits - 1;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

function getEmailTransporter() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port: Number(process.env.EMAIL_PORT || 587),
    secure: process.env.EMAIL_SECURE === "true",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

export async function sendEmailOtp(email) {
  if (!email) throw new Error("email required");
  const normalized = String(email).toLowerCase().trim();
  const otp = genNumericOtp(6);
  const expiresAt = Date.now() + EMAIL_OTP_TTL_MS;
  const payload = { otpHash: hashValue(otp, normalized), expiresAt, attempts: 0 };

  try {
    const c = await redis();
    if (c) {
      await c.set(emailOtpKey(normalized), JSON.stringify(payload), { PX: EMAIL_OTP_TTL_MS });
    } else {
      // fallback in-memory (dev)
      global.__emailOtpStore = global.__emailOtpStore || new Map();
      global.__emailOtpStore.set(normalized, payload);
    }
  } catch (e) {
    console.warn("[otpService] write email otp failed", e.message || e);
    global.__emailOtpStore = global.__emailOtpStore || new Map();
    global.__emailOtpStore.set(normalized, payload);
  }

  const transporter = getEmailTransporter();
  if (!transporter) {
    // dev: return OTP so tests can pick it up
    return { success: true, debug: true, otp, expiresAt };
  }

  const html = `<div>Your verification code is <b>${otp}</b>. It expires in ${Math.round(EMAIL_OTP_TTL_MS / 60000)} minutes.</div>`;
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: normalized,
      subject: "Your verification code",
      text: `Your verification code is ${otp}`,
      html,
    });
    return { success: true };
  } catch (e) {
    console.warn("[otpService] email send failed, but OTP stored", e.message || e);
    return { success: true, mailError: true };
  }
}

export async function verifyEmailOtp(email, otp) {
  const normalized = String(email).toLowerCase().trim();
  try {
    const c = await redis();
    let raw = null;
    if (c) raw = await c.get(emailOtpKey(normalized));
    let payload = raw ? JSON.parse(raw) : (global.__emailOtpStore && global.__emailOtpStore.get(normalized));

    if (!payload) return { success: false, message: "OTP not found or expired" };
    if (Date.now() > payload.expiresAt) {
      // cleanup
      try { if (c) await c.del(emailOtpKey(normalized)); } catch (e) {}
      if (global.__emailOtpStore) global.__emailOtpStore.delete(normalized);
      return { success: false, message: "OTP expired" };
    }
    if (payload.attempts >= MAX_EMAIL_OTP_ATTEMPTS) {
      try { if (c) await c.del(emailOtpKey(normalized)); } catch (e) {}
      if (global.__emailOtpStore) global.__emailOtpStore.delete(normalized);
      return { success: false, message: "Too many attempts" };
    }

    // increment attempts and persist
    payload.attempts = (payload.attempts || 0) + 1;
    if (c) await c.set(emailOtpKey(normalized), JSON.stringify(payload), { PX: EMAIL_OTP_TTL_MS });
    else global.__emailOtpStore.set(normalized, payload);

    const expected = payload.otpHash;
    const isValid = expected && expected === hashValue(otp, normalized);
    if (isValid) {
      try { if (c) await c.del(emailOtpKey(normalized)); } catch (e) {}
      if (global.__emailOtpStore) global.__emailOtpStore.delete(normalized);
      return { success: true, message: "OTP matched" };
    }
    return { success: false, message: "Invalid OTP" };
  } catch (e) {
    console.warn("[otpService] verifyEmailOtp error", e.message || e);
    return { success: false, message: "Verification failed" };
  }
}

/* ---------------- Helper exports for controllers ---------------- */
export async function setSessionInStore(sessionId, phone, ttl = OTP_TTL_MS) {
  try {
    const c = await redis();
    if (!c) return false;
    await c.set(sessionKey(sessionId), phone, { PX: ttl });
    await c.del(attemptsKey(phone));
    return true;
  } catch (e) {
    console.warn("[otpService] setSessionInStore failed", e.message || e);
    return false;
  }
}

export async function getSessionFromStore(sessionId) {
  try {
    const c = await redis();
    if (!c) return null;
    const phone = await c.get(sessionKey(sessionId));
    return phone;
  } catch (e) {
    console.warn("[otpService] getSessionFromStore failed", e.message || e);
    return null;
  }
}

export async function delSessionFromStore(sessionId) {
  try {
    const c = await redis();
    if (!c) return false;
    await c.del(sessionKey(sessionId));
    return true;
  } catch (e) {
    console.warn("[otpService] delSessionFromStore failed", e.message || e);
    return false;
  }
}

export async function incrPhoneAttempts(phone) {
  try {
    const c = await redis();
    if (!c) return null;
    const v = await c.incr(attemptsKey(phone));
    if (v === 1) await c.pexpire(attemptsKey(phone), OTP_TTL_MS);
    return Number(v);
  } catch (e) {
    console.warn("[otpService] incrPhoneAttempts failed", e.message || e);
    return null;
  }
}

export async function resetPhoneAttempts(phone) {
  try {
    const c = await redis();
    if (!c) return false;
    await c.del(attemptsKey(phone));
    return true;
  } catch (e) {
    console.warn("[otpService] resetPhoneAttempts failed", e.message || e);
    return false;
  }
}

export async function setResendCooldownForPhone(phone, ttl = RESEND_COOLDOWN_MS) {
  try {
    const c = await redis();
    if (!c) return false;
    await c.set(resendKey(phone), "1", { PX: ttl });
    return true;
  } catch (e) {
    console.warn("[otpService] setResendCooldown failed", e.message || e);
    return false;
  }
}

// export async function getResendCooldownForPhone(phone) {
//   try {
//     const c = await redis();
//     if (!c) return -2;
//     return await c.pttl(resendKey(phone));
//   } catch (e) {
//     console.warn("[otpService] getResendCooldown failed", e.message || e);
//     return -2;
//   }
// }

// export default {
//   sendSmsOtp,
//   verifySmsOtp,
//   sendEmailOtp,
//   verifyEmailOtp,
//   setSessionInStore,
//   getSessionFromStore,
//   delSessionFromStore,
//   incrPhoneAttempts,
//   resetPhoneAttempts,
//   setResendCooldownForPhone,
//   getResendCooldownForPhone,
// };
// export async function getResendCooldownForPhone(phone) {
//   try {
//     const c = await redis();
//     if (!c) return -2;
//     return await c.pttl(resendKey(phone));
//   } catch (e) {
//     console.warn("[otpService] getResendCooldown failed", e.message || e);
//     return -2;
//   }
// }
// export async function getResendCooldownForPhone(phone) {
//   try {
//     const c = await redis();
//     if (!c) return 0; // no redis, no cooldown
//     let ttl = 0;
//     // Some Redis clients use pttl(), others ttl()
//     if (typeof c.pTTL === "function") ttl = await c.pTTL(resendKey(phone));
//     else if (typeof c.pttl === "function") ttl = await c.pttl(resendKey(phone));
//     else if (typeof c.ttl === "function") ttl = (await c.ttl(resendKey(phone))) * 1000;
//     else ttl = 0;
//     if (ttl < 0) ttl = 0;
//     return ttl;
//   } catch (e) {
//     console.warn("[otpService] getResendCooldown failed", e.message || e);
//     return 0; // never block OTP or verification
//   }
// }
// otpService.js

export async function getResendCooldownForPhone(phone) {
  try {
    const c = await redis();
    if (!c) return 0; // No redis = no cooldown

    let ttl = 0;
    // check which function your redis client actually has
    if (typeof c.pTTL === "function") {
      ttl = await c.pTTL(resendKey(phone));
    } else if (typeof c.pttl === "function") {
      ttl = await c.pttl(resendKey(phone));
    } else if (typeof c.ttl === "function") {
      const seconds = await c.ttl(resendKey(phone));
      ttl = seconds > 0 ? seconds * 1000 : 0;
    } else if (typeof c.sendCommand === "function") {
      // fallback for modern Redis clients (v5+)
      const resp = await c.sendCommand(["PTTL", resendKey(phone)]);
      ttl = Number(resp);
    }

    if (isNaN(ttl) || ttl < 0) ttl = 0;
    return ttl;
  } catch (err) {
    console.warn("[otpService] getResendCooldownForPhone failed:", err.message);
    return 0; // Always default to 0 so verification never gets blocked
  }
}



// 👇 ADD THIS ALIAS so adminAuthController.js works
export const sendSmsAutogen = sendSmsOtp;

export default {
  sendSmsOtp,
  sendSmsAutogen,   // include it here too for consistency
  verifySmsOtp,
  sendEmailOtp,
  verifyEmailOtp,
  setSessionInStore,
  getSessionFromStore,
  delSessionFromStore,
  incrPhoneAttempts,
  resetPhoneAttempts,
  setResendCooldownForPhone,
  getResendCooldownForPhone,
};


// ---------------------- DEBUG/DEV UTILITIES ----------------------
// This helper is safe for development or automated testing environments.
// It lets the admin fetch a stored email OTP from Redis if the mailer fails or in dev mode.

// import { getRedisClient } from "../config/redis.js";

/**
 * Fetch a stored email OTP for debugging / fallback purposes.
 * Only enabled in non-production environments.
 */
export async function debugFetchEmailOtp(email) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("debugFetchEmailOtp is disabled in production");
  }

  try {
    const client = await getRedisClient();
    if (!client) {
      console.warn("[debugFetchEmailOtp] Redis client unavailable");
      return null;
    }

    const key = `emailotp:${email.toLowerCase().trim()}`;
    const data = await client.get(key);
    if (!data) return null;

    try {
      return JSON.parse(data);
    } catch {
      return { otp: data };
    }
  } catch (err) {
    console.error("[debugFetchEmailOtp] Error:", err.message);
    return null;
  }
}






// // backend/utils/otpService.js
// import axios from "axios";
// import dotenv from "dotenv";
// import nodemailer from "nodemailer";
// import crypto from "crypto";
// import { createClient } from "redis";

// dotenv.config();

// const TWOFACTOR_API_KEY = process.env.TWOFACTOR_API_KEY;
// const TWOFACTOR_BASE = "https://2factor.in/API/V1";
// const REDIS_URL = process.env.REDIS_URL || null;
// const OTP_HASH_SECRET = process.env.OTP_HASH_SECRET || process.env.JWT_SECRET || 'default-secret-change-in-production';

// /**
//  * Hash OTP using HMAC SHA256 for secure storage
//  */
// function hashOtp(otp, phone) {
//   const secret = OTP_HASH_SECRET;
//   const data = `${phone}:${otp}:${Date.now()}`;
//   return crypto.createHmac('sha256', secret)
//     .update(data)
//     .digest('hex');
// }

// /**
//  * Verify OTP hash
//  */
// function verifyOtpHash(hashedOtp, otp, phone, timestamp) {
//   const secret = OTP_HASH_SECRET;
//   const data = `${phone}:${otp}:${timestamp}`;
//   const expected = crypto.createHmac('sha256', secret)
//     .update(data)
//     .digest('hex');
//   try {
//     return crypto.timingSafeEqual(Buffer.from(hashedOtp), Buffer.from(expected));
//   } catch (e) {
//     return false;
//   }
// }

// /**
//  * Send OTP to a given phone number using 2Factor API
//  */
// export const sendOtp = async (phone) => {
//   try {
//     if (!TWOFACTOR_API_KEY) throw new Error("Missing 2Factor API Key");

//     const phoneDigits = phone.replace(/\D/g, "");
//     if (phoneDigits.length !== 10)
//       throw new Error("Invalid phone number (must be 10 digits)");

//     const url = `${TWOFACTOR_BASE}/${TWOFACTOR_API_KEY}/SMS/+91${phoneDigits}/AUTOGEN`;
//     console.log(`📤 Sending OTP via 2Factor: ${url.replace(TWOFACTOR_API_KEY, "***API_KEY***")}`);

//     const resp = await axios.get(url, { timeout: 15000, validateStatus: (s) => s < 600 });
//     const data = resp.data;

//     // 2factor sometimes returns SessionId or Details as the session identifier
//     const sessionId = data?.SessionId || data?.sessionId || data?.Details || null;

//     if (data.Status === "Success" || data.Status === "SUCCESS") {
//       console.log("✅ OTP sent successfully:", { Status: data.Status, SessionId: sessionId, Details: data.Details });
//       return { success: true, sessionId };
//     } else {
//       const details = data?.Details || data?.Message || JSON.stringify(data);
//       console.error("❌ 2Factor Send Error:", details);
//       return { success: false, error: details, full: data };
//     }
//   } catch (err) {
//     console.error("❌ sendOtp() Error:", err.message);
//     const httpData = err.response?.data;
//     if (httpData) {
//       return { success: false, error: httpData.Details || httpData.Message || JSON.stringify(httpData), full: httpData };
//     }
//     return { success: false, error: err.message };
//   }
// };

// /**
//  * Verify OTP for a given session
//  */
// export const verifyOtp = async (sessionId, otp) => {
//   try {
//     const url = `${TWOFACTOR_BASE}/${TWOFACTOR_API_KEY}/SMS/VERIFY/${sessionId}/${otp}`;
//     console.log(`📥 Verifying OTP via 2Factor: ${url.replace(TWOFACTOR_API_KEY, "***API_KEY***")}`);

//     const resp = await axios.get(url, { timeout: 15000, validateStatus: (s) => s < 600 });
//     const data = resp.data;

//     if (data.Status === "Success" || data.Status === "SUCCESS") {
//       console.log("✅ OTP verified successfully:", data);
//       return { success: true, full: data };
//     } else {
//       const details = data?.Details || data?.Message || JSON.stringify(data);
//       console.error("❌ OTP Verification Error:", details);
//       return { success: false, error: details, full: data };
//     }
//   } catch (err) {
//     console.error("❌ verifyOtp() Error:", err.message);
//     const httpData = err.response?.data;
//     if (httpData) {
//       return { success: false, error: httpData.Details || httpData.Message || JSON.stringify(httpData), full: httpData };
//     }
//     return { success: false, error: err.message };
//   }
// };

// /* --------------------- Compatibility wrappers & Email OTP --------------------- */

// // In-memory email OTP store for simple compatibility (use Redis in prod)
// const emailOtpStore = new Map();
// const EMAIL_OTP_TTL = Number(process.env.EMAIL_OTP_TTL_MS || 5 * 60 * 1000);
// const OTP_TTL_MS = Number(process.env.OTP_TTL_MS || 3 * 60 * 1000);

// // Redis client (optional). If REDIS_URL not provided or connect fails we'll continue with in-memory fallbacks.
// let redisClient = null;
// let redisReady = false;
// async function initRedis() {
//   if (redisClient) return redisClient;
//   if (!REDIS_URL) return null;
//   try {
//     redisClient = createClient({ url: REDIS_URL });
//     redisClient.on("error", (e) => console.warn("[otpService][redis] error", e.message || e));
//     await redisClient.connect();
//     redisReady = true;
//     console.log("[otpService] Connected to Redis");
//     return redisClient;
//   } catch (err) {
//     console.warn("[otpService] Failed to connect to Redis, falling back to in-memory stores:", err.message || err);
//     redisClient = null;
//     redisReady = false;
//     return null;
//   }
// }

// // Helper keys
// const sessionKey = (sid) => `otp:session:${sid}`;
// const attemptsKey = (phone) => `otp:attempts:${phone}`;
// const resendKey = (phone) => `otp:resend:${phone}`;

// async function setSessionInStore(sessionId, phone, ttl = OTP_TTL_MS) {
//   await initRedis();
//   if (redisReady && redisClient) {
//     try {
//       await redisClient.set(sessionKey(sessionId), phone, { PX: ttl });
//       // reset attempts for this phone
//       await redisClient.del(attemptsKey(phone));
//       return true;
//     } catch (e) {
//       console.warn("[otpService] setSessionInStore redis error", e.message || e);
//       return false;
//     }
//   }
//   return false;
// }

// async function getSessionFromStore(sessionId) {
//   await initRedis();
//   if (redisReady && redisClient) {
//     try {
//       const phone = await redisClient.get(sessionKey(sessionId));
//       return phone;
//     } catch (e) {
//       console.warn("[otpService] getSessionFromStore redis error", e.message || e);
//       return null;
//     }
//   }
//   return null;
// }

// async function delSessionFromStore(sessionId) {
//   await initRedis();
//   if (redisReady && redisClient) {
//     try {
//       await redisClient.del(sessionKey(sessionId));
//       return true;
//     } catch (e) {
//       console.warn("[otpService] delSessionFromStore redis error", e.message || e);
//       return false;
//     }
//   }
//   return false;
// }

// async function incrPhoneAttempts(phone) {
//   await initRedis();
//   if (redisReady && redisClient) {
//     try {
//       const v = await redisClient.incr(attemptsKey(phone));
//       // set TTL if first increment
//       if (v === 1) await redisClient.pexpire(attemptsKey(phone), OTP_TTL_MS);
//       return Number(v);
//     } catch (e) {
//       console.warn("[otpService] incrPhoneAttempts redis error", e.message || e);
//       return null;
//     }
//   }
//   return null;
// }

// async function resetPhoneAttempts(phone) {
//   await initRedis();
//   if (redisReady && redisClient) {
//     try {
//       await redisClient.del(attemptsKey(phone));
//       return true;
//     } catch (e) {
//       console.warn("[otpService] resetPhoneAttempts redis error", e.message || e);
//       return false;
//     }
//   }
//   return false;
// }

// async function setResendCooldownForPhone(phone, ttlMs = 60 * 1000) {
//   await initRedis();
//   if (redisReady && redisClient) {
//     try {
//       await redisClient.set(resendKey(phone), "1", { PX: ttlMs });
//       return true;
//     } catch (e) {
//       console.warn("[otpService] setResendCooldownForPhone redis error", e.message || e);
//       return false;
//     }
//   }
//   return false;
// }

// async function getResendCooldownForPhone(phone) {
//   await initRedis();
//   if (redisReady && redisClient) {
//     try {
//       const ttl = await redisClient.pttl(resendKey(phone));
//       return ttl; // -2 = not exists, -1 = no ttl
//     } catch (e) {
//       console.warn("[otpService] getResendCooldownForPhone redis error", e.message || e);
//       return -2;
//     }
//   }
//   return -2;
// }

// function genEmailOtp(digits = 6) {
//   const min = 10 ** (digits - 1);
//   const max = 10 ** digits - 1;
//   return String(Math.floor(Math.random() * (max - min + 1)) + min);
// }

// function getEmailTransporter() {
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

// // alias for older name used in controllers
// export async function sendSmsAutogen(phone) {
//   return sendOtp(phone);
// }

// export async function verifySmsOtp(sessionId, otp) {
//   const result = await verifyOtp(sessionId, otp);
//   if (result && result.success) return result.full || { Status: 'Success', Details: 'OTP Matched' };
//   if (result && result.full) return result.full;
//   return { Status: 'Error', Details: result?.error || 'Verification failed' };
// }

// export async function sendEmailOtp(email) {
//   if (!email) throw new Error('email required');
//   const key = `otp:email:${email.toLowerCase().trim()}`;
//   const otp = genEmailOtp(6);
//   const expiresAt = Date.now() + EMAIL_OTP_TTL;

//   const payload = { otp, expiresAt, attempts: 0 };

//   // Try Redis first
//   try {
//     await initRedis();
//     if (redisReady && redisClient) {
//       await redisClient.set(key, JSON.stringify(payload), { PX: EMAIL_OTP_TTL });
//     } else {
//       emailOtpStore.set(email.toLowerCase().trim(), payload);
//     }
//   } catch (e) {
//     console.warn('[otpService] sendEmailOtp: redis write failed, using in-memory fallback', e.message || e);
//     emailOtpStore.set(email.toLowerCase().trim(), payload);
//   }

//   const transporter = getEmailTransporter();
//   const html = `<div style="font-family: Arial, sans-serif;">Your OTP is <b>${otp}</b>. It expires in ${Math.round(EMAIL_OTP_TTL/60000)} minutes.</div>`;

//   if (!transporter) {
//     // dev fallback: return OTP so E2E tests can read it
//     return { success: true, debug: true, otp, expiresAt };
//   }

//   try {
//     await transporter.sendMail({
//       from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
//       to: email,
//       subject: 'Verification code',
//       text: `Your OTP is ${otp}. It expires in ${Math.round(EMAIL_OTP_TTL/60000)} minutes.`,
//       html,
//     });
//     return { success: true };
//   } catch (e) {
//     console.warn('[otpService] sendEmailOtp: mail send failed, but OTP stored for verification', e.message || e);
//     return { success: true, mailError: true };
//   }
// }

// export async function verifyEmailOtp(email, otp) {
//   if (!email || !otp) return { success: false, message: 'email and otp required' };
//   const key = `otp:email:${email.toLowerCase().trim()}`;
//   let data = null;
//   try {
//     await initRedis();
//     if (redisReady && redisClient) {
//       const raw = await redisClient.get(key);
//       if (raw) data = JSON.parse(raw);
//     } else {
//       data = emailOtpStore.get(email.toLowerCase().trim());
//     }
//   } catch (e) {
//     console.warn('[otpService] verifyEmailOtp: redis read failed, using in-memory fallback', e.message || e);
//     data = emailOtpStore.get(email.toLowerCase().trim());
//   }

//   if (!data) return { success: false, message: 'OTP not found or expired' };
//   if (Date.now() > data.expiresAt) {
//     try { if (redisReady && redisClient) await redisClient.del(key); else emailOtpStore.delete(email.toLowerCase().trim()); } catch (e) {}
//     return { success: false, message: 'OTP expired' };
//   }
//   if (data.attempts >= 5) {
//     try { if (redisReady && redisClient) await redisClient.del(key); else emailOtpStore.delete(email.toLowerCase().trim()); } catch (e) {}
//     return { success: false, message: 'Too many attempts' };
//   }
//   data.attempts += 1;
//   try {
//     if (redisReady && redisClient) {
//       await redisClient.set(key, JSON.stringify(data), { PX: EMAIL_OTP_TTL });
//     } else {
//       emailOtpStore.set(email.toLowerCase().trim(), data);
//     }
//   } catch (e) {
//     console.warn('[otpService] verifyEmailOtp: redis write failed, using in-memory fallback', e.message || e);
//     emailOtpStore.set(email.toLowerCase().trim(), data);
//   }
//   if (String(data.otp) === String(otp)) {
//     try { if (redisReady && redisClient) await redisClient.del(key); else emailOtpStore.delete(email.toLowerCase().trim()); } catch (e) {}
//     return { success: true, message: 'OTP matched' };
//   }
//   return { success: false, message: 'Invalid OTP' };
// }

// export function debugFetchEmailOtp(email) {
//   const data = emailOtpStore.get(email.toLowerCase().trim());
//   if (!data) return null;
//   return { otp: data.otp, expiresAt: data.expiresAt, attempts: data.attempts };
// }

// /**
//  * Fetch stored email OTP regardless of storage backend (Redis or in-memory)
//  * Returns null or an object { otp, expiresAt, attempts }
//  */
// export async function fetchStoredEmailOtp(email) {
//   if (!email) return null;
//   const key = `otp:email:${email.toLowerCase().trim()}`;
//   try {
//     await initRedis();
//     if (redisReady && redisClient) {
//       const raw = await redisClient.get(key);
//       if (!raw) return null;
//       try {
//         const parsed = JSON.parse(raw);
//         return { otp: parsed.otp, expiresAt: parsed.expiresAt, attempts: parsed.attempts };
//       } catch (e) {
//         // if stored raw string format, attempt simple parse
//         return null;
//       }
//     }
//   } catch (e) {
//     console.warn('[otpService] fetchStoredEmailOtp redis read failed', e.message || e);
//   }

//   // fallback to in-memory store
//   try {
//     const data = emailOtpStore.get(email.toLowerCase().trim());
//     if (!data) return null;
//     return { otp: data.otp, expiresAt: data.expiresAt, attempts: data.attempts };
//   } catch (e) {
//     return null;
//   }
// }

// // Export Redis-backed helpers (best-effort). Controllers may use these when Redis is configured.
// export {
//   setSessionInStore,
//   getSessionFromStore,
//   delSessionFromStore,
//   incrPhoneAttempts,
//   resetPhoneAttempts,
//   setResendCooldownForPhone,
//   getResendCooldownForPhone,
// };







// // backend/utils/otpService.js
// // Unified OTP service for SMS (2factor.in) and Email (Nodemailer)
// // OTP expiry configured via OTP_TTL_MS env (default 3 minutes)
// // Exports:
// //   sendSmsAutogen(phone) -> { success, SessionId?, Details?, debug? }
// //   verifySmsOtp(sessionId, otp) -> { Status, Details }  or throws
// //   sendEmailOtp(email) -> { success, debug?, otp? }
// //   verifyEmailOtp(email, otp) -> { success: bool, message? }
// //   debugFetchEmailOtp(email) -> { otp, expiresAt, attempts } | null

// import axios from "axios";
// import nodemailer from "nodemailer";

// const TWOFACTOR_API_KEY = process.env.TWOFACTOR_API_KEY || "";
// const TWOFACTOR_BASE = "https://2factor.in/API/V1";

// const EMAIL_FROM = process.env.EMAIL_FROM || process.env.EMAIL_USER || "no-reply@example.com";
// const OTP_TTL_MS = Number(process.env.OTP_TTL_MS || 3 * 60 * 1000); // default 3 minutes
// const EMAIL_ATTEMPT_LIMIT = Number(process.env.EMAIL_OTP_ATTEMPT_LIMIT || 3);

// // In-memory store for email OTPs (dev). Replace with Redis for production.
// const emailOtpStore = new Map();

// // small delay helper
// const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// /* --------------------- Helpers --------------------- */
// function genOtp(digits = 6) {
//   const min = 10 ** (digits - 1);
//   const max = 10 ** digits - 1;
//   return String(Math.floor(Math.random() * (max - min + 1)) + min);
// }

// function sanitizePhone(phone = "") {
//   const digits = String(phone).replace(/\D/g, "");
//   // Accept either 10-digit (local) or with leading 91; caller should supply 10-digit ideally
//   if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
//   if (digits.length === 10) return digits;
//   return digits;
// }

// /* --------------------- 2factor SMS --------------------- */

// /**
//  * sendSmsAutogen(phone)
//  * - phone: 10-digit string (no +91)
//  * returns: { success: true, SessionId, Status, Details } or throws Error
//  * Dev-mode: when TWOFACTOR_API_KEY not set, returns debug sessionId and debug: true
//  */
// export async function sendSmsAutogen(phoneRaw) {
//   const phone = sanitizePhone(phoneRaw);
//   if (!phone || phone.length !== 10) {
//     throw new Error("Invalid phone: must be 10 digits");
//   }

//   if (!TWOFACTOR_API_KEY) {
//     // Dev fallback (safe)
//     const session = `DEV_SESSION_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
//     console.warn("[otpService] TWOFACTOR_API_KEY not set. Running in DEV MODE. Session:", session);
//     // Return a structure similar to 2factor for compatibility
//     return { success: true, debug: true, SessionId: session, Details: "DEV_AUTOGEN" };
//   }

//   const url = `${TWOFACTOR_BASE}/${TWOFACTOR_API_KEY}/SMS/+91${phone}/AUTOGEN`;

//   try {
//     const resp = await axios.get(url, { timeout: 15000, validateStatus: (s) => s < 600 });
//     const data = resp.data;
//     // Standard 2factor responses: { Status: "Success"|"Error", Details: "...", SessionId: "..." }
//     if (!data || typeof data !== "object") throw new Error("Invalid response from 2factor");
//     if (data.Status === "Success" || data.Status === "SUCCESS") {
//       return { success: true, ...data };
//     } else {
//       // Return object but mark success false; caller handles message
//       return { success: false, ...data };
//     }
//   } catch (err) {
//     // Provide helpful diagnostics mirroring your test script
//     console.error("[otpService] sendSmsAutogen error:", err?.response?.data || err.message || err);
//     const message = err?.response?.data || err.message || "Failed to contact 2factor";
//     throw new Error(`2factor AUTOGEN failed: ${JSON.stringify(message)}`);
//   }
// }

// /**
//  * verifySmsOtp(sessionId, otp)
//  * - sessionId: returned by AUTOGEN (2factor) or DEV_SESSION_... in dev
//  * returns 2factor response object or in dev returns Success
//  */
// export async function verifySmsOtp(sessionId, otp) {
//   if (!sessionId || !otp) throw new Error("sessionId and otp required");

//   if (!TWOFACTOR_API_KEY) {
//     // DEV mode: accept any OTP for DEV_SESSION_
//     if (String(sessionId).startsWith("DEV_SESSION_")) {
//       return { Status: "Success", Details: "OTP Matched (DEV)" };
//     }
//     throw new Error("2factor not configured");
//   }

//   const url = `${TWOFACTOR_BASE}/${TWOFACTOR_API_KEY}/SMS/VERIFY/${sessionId}/${otp}`;
//   try {
//     const resp = await axios.get(url, { timeout: 15000, validateStatus: (s) => s < 600 });
//     const data = resp.data;
//     if (!data || typeof data !== "object") throw new Error("Invalid verify response from 2factor");
//     return data;
//   } catch (err) {
//     console.error("[otpService] verifySmsOtp error:", err?.response?.data || err.message || err);
//     throw new Error(`2factor VERIFY failed: ${err?.response?.data || err.message}`);
//   }
// }

// /* --------------------- Email OTP via Nodemailer --------------------- */

// let transporter = null;
// function getTransporter() {
//   if (transporter) return transporter;
//   transporter = nodemailer.createTransport({
//     host: process.env.EMAIL_HOST || "smtp.gmail.com",
//     port: Number(process.env.EMAIL_PORT || 587),
//     secure: process.env.EMAIL_SECURE === "true", // true for 465
//     auth: {
//       user: process.env.EMAIL_USER,
//       pass: process.env.EMAIL_PASS,
//     },
//   });
//   return transporter;
// }

// /**
//  * sendEmailOtp(email)
//  * - returns { success: true } in production
//  * - if EMAIL_USER / EMAIL_PASS missing -> returns { success: true, debug: true, otp } so dev can read OTP
//  */
// export async function sendEmailOtp(email) {
//   if (!email) throw new Error("email required");
//   const otp = genOtp(6);
//   const expiresAt = Date.now() + OTP_TTL_MS;
//   emailOtpStore.set(email, { otp, expiresAt, attempts: 0 });

//   const html = `
//     <div style="font-family: Arial, sans-serif; max-width:600px;">
//       <h3>Daily Mind Education — Verification Code</h3>
//       <p>Your verification code is:</p>
//       <div style="font-size: 28px; font-weight: bold; margin: 12px 0;">${otp}</div>
//       <p>This code will expire in ${Math.round(OTP_TTL_MS / 1000)} seconds.</p>
//       <p>If you did not request this, ignore this email.</p>
//       <hr/>
//       <small>Daily Mind Education Quiz Platform</small>
//     </div>
//   `;

//   // Dev fallback: if EMAIL_PASS or EMAIL_USER not configured return OTP for debugging
//   if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
//     console.warn("[otpService] Nodemailer not configured. Returning OTP for dev:", otp);
//     return { success: true, debug: true, otp, expiresAt };
//   }

//   try {
//     const transporterLocal = getTransporter();
//     await transporterLocal.sendMail({
//       from: EMAIL_FROM,
//       to: email,
//       subject: "Your verification code — Daily Mind Education",
//       text: `Your OTP is ${otp}. It expires in ${Math.round(OTP_TTL_MS / 1000)} seconds.`,
//       html,
//     });
//     return { success: true };
//   } catch (err) {
//     console.error("[otpService] sendEmailOtp failed:", err?.response || err.message || err);
//     // still keep OTP stored for later verification even if email send failed,
//     // so developers can inspect with debugFetchEmailOtp.
//     return { success: false, error: "Failed to send email" };
//   }
// }

// /**
//  * verifyEmailOtp(email, otp)
//  * - returns { success: true } when matched
//  * - increments attempts and deletes OTP after attempt limit or expiry
//  */
// export async function verifyEmailOtp(email, otp) {
//   if (!email || !otp) throw new Error("email and otp required");
//   const data = emailOtpStore.get(email);
//   if (!data) return { success: false, message: "OTP not found or expired" };

//   if (Date.now() > data.expiresAt) {
//     emailOtpStore.delete(email);
//     return { success: false, message: "OTP expired" };
//   }

//   if (data.attempts >= EMAIL_ATTEMPT_LIMIT) {
//     emailOtpStore.delete(email);
//     return { success: false, message: "Too many attempts. Request new OTP." };
//   }

//   data.attempts += 1;

//   if (String(data.otp) === String(otp)) {
//     emailOtpStore.delete(email);
//     return { success: true, message: "OTP matched" };
//   } else {
//     emailOtpStore.set(email, data);
//     return { success: false, message: "Invalid OTP" };
//   }
// }

// /* --------------------- Debug helpers --------------------- */
// export function debugFetchEmailOtp(email) {
//   const data = emailOtpStore.get(email);
//   if (!data) return null;
//   return { otp: data.otp, expiresAt: data.expiresAt, attempts: data.attempts };
// }







// // backend/utils/otpService.js
// // Unified OTP service for SMS (2factor.in) and Email (Nodemailer)
// // OTP expiry set to 3 minutes (configurable via OTP_TTL_MS env)

// import axios from "axios";
// import nodemailer from "nodemailer";

// // Load API key with validation
// const TWOFACTOR_API_KEY = process.env.TWOFACTOR_API_KEY?.trim() || "";
// const TWOFACTOR_BASE = "https://2factor.in/API/V1";

// // Warn if API key is not set (only in development)
// if (!TWOFACTOR_API_KEY && process.env.NODE_ENV !== 'production') {
//   console.warn('[otpService] ⚠️ TWOFACTOR_API_KEY not found in environment variables');
//   console.warn('[otpService] ⚠️ SMS OTP will run in DEV mode (fake sessions)');
// }

// const EMAIL_FROM = process.env.EMAIL_FROM || process.env.EMAIL_USER || "no-reply@example.com";
// const OTP_TTL_MS = Number(process.env.OTP_TTL_MS || 3 * 60 * 1000); // default 3 minutes
// const EMAIL_ATTEMPT_LIMIT = Number(process.env.EMAIL_OTP_ATTEMPT_LIMIT || 3);

// // In-memory store for email OTPs (dev). Use Redis in production.
// const emailOtpStore = new Map();

// /**
//  * Generate a numeric OTP string of length `digits`.
//  */
// function genOtp(digits = 6) {
//   const min = 10 ** (digits - 1);
//   const max = 10 ** digits - 1;
//   return String(Math.floor(Math.random() * (max - min + 1)) + min);
// }

// /* --------------------- SMS (2factor.in) --------------------- */
// /**
//  * sendSmsAutogen(phone)
//  * returns: { success: true, sessionId } (or throw on error)
//  *
//  * 2factor AUTOGEN endpoint returns a SessionId that you must pass to verifyOTP.
//  * It also returns Status which can be 'Success' if sent.
//  */
// export async function sendSmsAutogen(phone) {
//   // phone should be raw 10-digit without +91 prefix
//   if (!phone) throw new Error("phone required");
  
//   // Validate phone number format (should be 10 digits)
//   const phoneDigits = phone.replace(/\D/g, "");
//   if (phoneDigits.length !== 10) {
//     throw new Error("Phone number must be exactly 10 digits");
//   }
  
//   if (!TWOFACTOR_API_KEY) {
//     // Dev-mode: return a fake session (not secure)
//     const debugSession = `DEV_SESSION_${Date.now()}`;
//     console.warn("[otpService] ⚠️ TWOFACTOR_API_KEY not set. Running in DEV mode.");
//     console.warn("[otpService] Session:", debugSession);
//     console.warn("[otpService] For testing, use any 6-digit OTP with this session ID");
//     return { success: true, sessionId: debugSession, debug: true, Status: "Success", Details: debugSession };
//   }

//   try {
//     const url = `${TWOFACTOR_BASE}/${TWOFACTOR_API_KEY}/SMS/+91${phoneDigits}/AUTOGEN`;
//     console.log(`[otpService] 📱 Sending SMS OTP to +91${phoneDigits}`);
//     console.log(`[otpService] 🔗 API URL: ${url.replace(TWOFACTOR_API_KEY, '***API_KEY***')}`);
//     console.log(`[otpService] 🔑 API Key present: ${TWOFACTOR_API_KEY ? 'Yes (' + TWOFACTOR_API_KEY.substring(0, 8) + '...)' : 'No'}`);
    
//     const resp = await axios.get(url, { 
//       timeout: 15000,
//       validateStatus: function (status) {
//         // Accept all status codes to handle errors properly
//         return status < 600;
//       }
//     });
    
//     // Log full response for debugging
//     console.log(`[otpService] 📥 Full 2Factor API Response:`, JSON.stringify(resp.data, null, 2));
    
//     // resp.data contains fields like Status, Details, SessionId
//     if (!resp?.data) {
//       console.error(`[otpService] ❌ No data in response. Status: ${resp.status}`);
//       throw new Error("Invalid 2factor response - no data received");
//     }
    
//     console.log(`[otpService] 📊 Response Summary:`, {
//       Status: resp.data.Status,
//       Details: resp.data.Details,
//       SessionId: resp.data.SessionId,
//       ResponseCode: resp.status
//     });
    
//     // Check for common error scenarios
//     if (resp.data.Status === "Error" || resp.data.Status === "error") {
//       const errorMsg = resp.data.Details || resp.data.Message || "Unknown error from 2Factor";
//       console.error(`[otpService] ❌ 2Factor API Error:`, errorMsg);
      
//       // Provide helpful error messages based on common issues
//       if (errorMsg.toLowerCase().includes('dlt') || errorMsg.toLowerCase().includes('template')) {
//         throw new Error(`DLT/Template issue: ${errorMsg}. Please complete DLT registration and template approval on 2Factor dashboard.`);
//       }
//       if (errorMsg.toLowerCase().includes('credit') || errorMsg.toLowerCase().includes('balance')) {
//         throw new Error(`Insufficient credits: ${errorMsg}. Please recharge your 2Factor account.`);
//       }
//       if (errorMsg.toLowerCase().includes('invalid') || errorMsg.toLowerCase().includes('api')) {
//         throw new Error(`API Key issue: ${errorMsg}. Please verify your TWOFACTOR_API_KEY in .env file.`);
//       }
      
//       throw new Error(`2Factor API Error: ${errorMsg}`);
//     }
    
//     // Check if OTP was sent successfully
//     if (resp.data.Status === "Success" || resp.data.Status === "SUCCESS") {
//       console.log(`[otpService] ✅ SMS OTP sent successfully to +91${phoneDigits}`);
//       console.log(`[otpService] 📝 SessionId: ${resp.data.SessionId}`);
//       return { success: true, ...resp.data };
//     } else {
//       console.warn(`[otpService] ⚠️ Unexpected response status:`, resp.data.Status);
//       console.warn(`[otpService] ⚠️ Full response:`, resp.data);
//       // Still return the data but log warning
//       return { success: false, ...resp.data, warning: "Unexpected status" };
//     }
//   } catch (err) {
//     console.error("[otpService] ❌ sendSmsAutogen error:", err.message);
//     console.error("[otpService] ❌ Error stack:", err.stack);
    
//     if (err.response) {
//       console.error("[otpService] ❌ HTTP Status:", err.response.status);
//       console.error("[otpService] ❌ Response Data:", JSON.stringify(err.response.data, null, 2));
      
//       // Provide specific error messages
//       if (err.response.status === 401 || err.response.status === 403) {
//         throw new Error("Invalid API Key or unauthorized access. Please check your TWOFACTOR_API_KEY in .env file.");
//       }
//       if (err.response.status === 429) {
//         throw new Error("Rate limit exceeded. Please wait a few minutes before trying again.");
//       }
//       if (err.response.status >= 500) {
//         throw new Error("2Factor service is temporarily unavailable. Please try again later.");
//       }
//     }
    
//     if (err.response?.data) {
//       const errorDetails = err.response.data.Details || err.response.data.Message || JSON.stringify(err.response.data);
//       throw new Error(`Failed to send SMS OTP: ${errorDetails}`);
//     }
    
//     if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
//       throw new Error("Request timeout. Please check your internet connection and try again.");
//     }
    
//     throw new Error(`Failed to send SMS OTP: ${err.message}`);
//   }
// }

// /**
//  * verifySmsOtp(sessionId, otp)
//  * For real 2factor sessions: call VERIFY endpoint
//  * For DEV sessionIds (generated above) we cannot verify OTP; instead the frontend must accept dev mode.
//  */
// export async function verifySmsOtp(sessionId, otp) {
//   if (!sessionId || !otp) throw new Error("sessionId and otp required");

//   if (!TWOFACTOR_API_KEY) {
//     // dev-mode: we cannot verify real OTP; treat any numeric OTP as matched for dev sessions prefixed with DEV_SESSION_
//     if (String(sessionId).startsWith("DEV_SESSION_")) {
//       return { Status: "Success", Details: "OTP Matched (DEV)" };
//     }
//     return { Status: "Error", Details: "2FA not configured" };
//   }

//   try {
//     const url = `${TWOFACTOR_BASE}/${TWOFACTOR_API_KEY}/SMS/VERIFY/${sessionId}/${otp}`;
//     const resp = await axios.get(url, { timeout: 15000 });
//     return resp.data; // {Status: "Success", Details: "OTP Matched", ...}
//   } catch (err) {
//     console.error("[otpService] verifySmsOtp error:", err.response?.data || err.message || err);
//     throw new Error("Failed to verify SMS OTP");
//   }
// }

// /* --------------------- EMAIL OTP via Nodemailer --------------------- */
// /**
//  * create transporter lazily
//  */
// let transporter = null;
// function getTransporter() {
//   if (transporter) return transporter;
//   transporter = nodemailer.createTransport({
//     host: process.env.EMAIL_HOST || "smtp.gmail.com",
//     port: Number(process.env.EMAIL_PORT || 587),
//     secure: process.env.EMAIL_SECURE === "true", // true for 465
//     auth: {
//       user: process.env.EMAIL_USER,
//       pass: process.env.EMAIL_PASS,
//     },
//   });
//   return transporter;
// }

// /**
//  * sendEmailOtp(email)
//  * stores OTP in emailOtpStore for OTP_TTL_MS ms
//  * Returns { success: true, otp } in dev-mode (when EMAIL_PASS not set) for testing
//  */
// export async function sendEmailOtp(email) {
//   if (!email) throw new Error("email required");

//   const otp = genOtp(6);
//   const expiresAt = Date.now() + OTP_TTL_MS;

//   // store
//   emailOtpStore.set(email, { otp, expiresAt, attempts: 0 });

//   // prepare email
//   const transporterLocal = getTransporter();

//   const html = `
//     <div style="font-family: Arial, sans-serif; max-width:600px;">
//       <h3>Daily Mind Education — Verification Code</h3>
//       <p>Your OTP code is:</p>
//       <div style="font-size: 28px; font-weight: bold; margin: 12px 0;">${otp}</div>
//       <p>This code will expire in ${Math.round(OTP_TTL_MS / 60000 * 100)/100} minutes (${Math.round(OTP_TTL_MS/1000)} seconds).</p>
//       <p>If you did not request this, ignore this email.</p>
//       <hr/>
//       <small>Daily Mind Education Quiz Platform</small>
//     </div>
//   `;

//   // In dev if EMAIL_PASS is not configured or transporter fails we return debug
//   if (!process.env.EMAIL_PASS || !process.env.EMAIL_USER) {
//     console.warn("[otpService] Nodemailer not configured. Returning OTP in response for dev:", otp);
//     return { success: true, debug: true, otp };
//   }

//   try {
//     await transporterLocal.sendMail({
//       from: EMAIL_FROM,
//       to: email,
//       subject: "Your verification code — Daily Mind Education",
//       text: `Your OTP is ${otp}. It expires in ${Math.round(OTP_TTL_MS / 1000)} seconds.`,
//       html,
//     });
//     return { success: true };
//   } catch (err) {
//     console.error("[otpService] sendEmailOtp failed:", err);
//     // keep OTP stored for verification attempts even if send failed (so you can debug)
//     return { success: false, error: "Failed to send email" };
//   }
// }

// /**
//  * verifyEmailOtp(email, otp)
//  * - returns { success: true } when matched
//  * - increments attempts and deletes OTP after attempt limit or expiry
//  */
// export async function verifyEmailOtp(email, otp) {
//   if (!email || !otp) throw new Error("email and otp required");
//   const data = emailOtpStore.get(email);
//   if (!data) return { success: false, message: "OTP not found or expired" };

//   // expired?
//   if (Date.now() > data.expiresAt) {
//     emailOtpStore.delete(email);
//     return { success: false, message: "OTP expired" };
//   }

//   // attempts
//   if (data.attempts >= EMAIL_ATTEMPT_LIMIT) {
//     emailOtpStore.delete(email);
//     return { success: false, message: "Too many attempts. Request new OTP." };
//   }

//   data.attempts += 1;

//   if (String(data.otp) === String(otp)) {
//     emailOtpStore.delete(email);
//     return { success: true, message: "OTP matched" };
//   } else {
//     // do not delete on wrong attempt until attempts exceeded or expiry
//     emailOtpStore.set(email, data);
//     return { success: false, message: "Invalid OTP" };
//   }
// }

// /* --------------------- Helpers for testing / admin --------------------- */

// /**
//  * debugFetchEmailOtp(email) -> returns OTP when running in dev (useful for e2e tests)
//  */
// export function debugFetchEmailOtp(email) {
//   const data = emailOtpStore.get(email);
//   if (!data) return null;
//   return { otp: data.otp, expiresAt: data.expiresAt, attempts: data.attempts };
// }









// import axios from "axios";
// import nodemailer from "nodemailer";

// // SMS OTP Service using 2factor.in
// export const sendOTP = async (phone) => {
//     const apiKey = process.env.TWOFACTOR_API_KEY;
//     const resp = await axios.get(
//         `https://2factor.in/API/V1/${apiKey}/SMS/+91${phone}/AUTOGEN`
//       );
//       return resp.data;
//     };
    
//     export const verifyOTP = async (sessionId, otp) => {
//         const apiKey = process.env.TWOFACTOR_API_KEY;
//         const resp = await axios.get(
//             `https://2factor.in/API/V1/${apiKey}/SMS/VERIFY/${sessionId}/${otp}`
//           );
//           return resp.data;
//         };
        
//         // Email OTP Service using Nodemailer
//         const transporter = nodemailer.createTransport({
//             host: process.env.EMAIL_HOST,
//             port: process.env.EMAIL_PORT,
//             secure: false, // true for 465, false for other ports
//             auth: {
//                 user: process.env.EMAIL_USER,
//                 pass: process.env.EMAIL_PASS,
//               },
//             });
            
//             // Store OTPs temporarily (in production, use Redis)
//             const emailOTPs = new Map();
            
//             export const sendEmailOTP = async (email) => {
//                 try {
//                     // Generate 6-digit OTP
//                     const otp = Math.floor(100000 + Math.random() * 900000).toString();
                
//                     // Store OTP with expiration (5 minutes)
//                     emailOTPs.set(email, {
//                         otp,
//                         expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
//                         attempts: 0
//                       });
                  
//                       const mailOptions = {
//                           from: process.env.EMAIL_FROM,
//                           to: email,
//                           subject: 'DME Quiz App - Email Verification OTP',
//                           html: `
//                             <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//                               <h2 style="color: #333;">Email Verification</h2>
//                               <p>Your OTP for email verification is:</p>
//                               <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 24px; font-weight: bold; color: #333; margin: 20px 0;">
//                                 ${otp}
//                               </div>
//                               <p>This OTP is valid for 5 minutes.</p>
//                               <p>If you didn't request this OTP, please ignore this email.</p>
//                               <hr style="margin: 20px 0;">
//                               <p style="color: #666; font-size: 12px;">Daily Mind Education Quiz App</p>
//                             </div>
//                           `
//                         };
                    
//                         await transporter.sendMail(mailOptions);
//                         return { success: true, message: 'OTP sent successfully' };
//                       } catch (error) {
//                           console.error('Email OTP error:', error);
//                           throw new Error('Failed to send email OTP');
//                         }
//                       };
                      
//                       export const verifyEmailOTP = async (email, otp) => {
//                           try {
//                               const storedData = emailOTPs.get(email);
                          
//                               if (!storedData) {
//                                   return { success: false, message: 'OTP not found or expired' };
//                                 }
                            
//                                 // Check if OTP has expired
//                                 if (Date.now() > storedData.expiresAt) {
//                                     emailOTPs.delete(email);
//                                     return { success: false, message: 'OTP has expired' };
//                                   }
                              
//                                   // Check attempt limit
//                                   if (storedData.attempts >= 3) {
//                                       emailOTPs.delete(email);
//                                       return { success: false, message: 'Too many attempts. Please request a new OTP' };
//                                     }
                                
//                                     // Increment attempts
//                                     storedData.attempts++;
                                
//                                     if (storedData.otp === otp) {
//                                         // OTP is correct, remove it
//                                         emailOTPs.delete(email);
//                                         return { success: true, message: 'Email verified successfully' };
//                                       } else {
//                                           // Update attempts
//                                           emailOTPs.set(email, storedData);
//                                           return { success: false, message: 'Invalid OTP' };
//                                         }
//                                       } catch (error) {
//                                           console.error('Email OTP verification error:', error);
//                                           throw new Error('Failed to verify email OTP');
//                                         }
//                                       };
                                      
                                      
//                                       // import axios from "axios";
//                                       // import nodemailer from "nodemailer";
                                      
//                                       // // SMS OTP Service using 2factor.in
//                                       // export const sendOTP = async (phone) => {
//                                       //   const apiKey = process.env.TWOFACTOR_API_KEY;
//                                       //   const resp = await axios.get(
//                                       //     `https://2factor.in/API/V1/${apiKey}/SMS/+91${phone}/AUTOGEN`
//                                       //   );
//                                       //   return resp.data;
//                                       // };
                                      
//                                       // export const verifyOTP = async (sessionId, otp) => {
//                                       //   const apiKey = process.env.TWOFACTOR_API_KEY;
//                                       //   const resp = await axios.get(
//                                       //     `https://2factor.in/API/V1/${apiKey}/SMS/VERIFY/${sessionId}/${otp}`
//                                       //   );
//                                       //   return resp.data;
//                                       // };
                                      
//                                       // // Email OTP Service using Nodemailer
//                                       // const transporter = nodemailer.createTransport({
//                                       //   host: process.env.EMAIL_HOST,
//                                       //   port: process.env.EMAIL_PORT,
//                                       //   secure: false, // true for 465, false for other ports
//                                       //   auth: {
//                                       //     user: process.env.EMAIL_USER,
//                                       //     pass: process.env.EMAIL_PASS, // Use app-specific passwords for Gmail if 2FA is enabled
//                                       //   },
//                                       // });
                                      
//                                       // // Store OTPs temporarily (in production, use Redis or a DB)
//                                       // const emailOTPs = new Map();
                                      
//                                       // // Helper function to generate OTP
//                                       // const generateOTP = () => {
//                                       //   return Math.floor(100000 + Math.random() * 900000).toString();
//                                       // };
                                      
//                                       // // Send Email OTP
//                                       // export const sendEmailOTP = async (email) => {
//                                       //   try {
//                                       //     // Generate 6-digit OTP
//                                       //     const otp = generateOTP();
                                      
//                                       //     // Store OTP with expiration (5 minutes)
//                                       //     emailOTPs.set(email, {
//                                       //       otp,
//                                       //       expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
//                                       //       attempts: 0,
//                                       //     });
                                      
//                                       //     const mailOptions = {
//                                       //       from: process.env.EMAIL_FROM, // Sender email address
//                                       //       to: email,
//                                       //       subject: 'DME Quiz App - Email Verification OTP',
//                                       //       html: `
//                                       //         <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//                                       //           <h2 style="color: #333;">Email Verification</h2>
//                                       //           <p>Your OTP for email verification is:</p>
//                                       //           <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 24px; font-weight: bold; color: #333; margin: 20px 0;">
//                                       //             ${otp}
//                                       //           </div>
//                                       //           <p>This OTP is valid for 5 minutes.</p>
//                                       //           <p>If you didn't request this OTP, please ignore this email.</p>
//                                       //           <hr style="margin: 20px 0;">
//                                       //           <p style="color: #666; font-size: 12px;">Daily Mind Education Quiz App</p>
//                                       //         </div>
//                                       //       `,
//                                       //     };
                                      
//                                       //     // Send OTP via email
//                                       //     await transporter.sendMail(mailOptions);
//                                       //     return { success: true, message: 'OTP sent successfully' };
//                                       //   } catch (error) {
//                                       //     console.error('Email OTP error:', error);
//                                       //     throw new Error('Failed to send email OTP');
//                                       //   }
//                                       // };
                                      
//                                       // // Verify Email OTP
//                                       // export const verifyEmailOTP = async (email, otp) => {
//                                       //   try {
//                                       //     const storedData = emailOTPs.get(email);
                                      
//                                       //     if (!storedData) {
//                                       //       return { success: false, message: 'OTP not found or expired' };
//                                       //     }
                                      
//                                       //     // Check if OTP has expired
//                                       //     if (Date.now() > storedData.expiresAt) {
//                                       //       emailOTPs.delete(email);
//                                       //       return { success: false, message: 'OTP has expired' };
//                                       //     }
                                      
//                                       //     // Check attempt limit (Max 3 attempts)
//                                       //     if (storedData.attempts >= 3) {
//                                       //       emailOTPs.delete(email);
//                                       //       return { success: false, message: 'Too many attempts. Please request a new OTP' };
//                                       //     }
                                      
//                                       //     // Increment attempts
//                                       //     storedData.attempts++;
                                      
//                                       //     if (storedData.otp === otp) {
//                                       //       // OTP is correct, remove it
//                                       //       emailOTPs.delete(email);
//                                       //       return { success: true, message: 'Email verified successfully' };
//                                       //     } else {
//                                       //       // Update attempts
//                                       //       emailOTPs.set(email, storedData);
//                                       //       return { success: false, message: 'Invalid OTP' };
//                                       //     }
//                                       //   } catch (error) {
//                                       //     console.error('Email OTP verification error:', error);
//                                       //     throw new Error('Failed to verify email OTP');
//                                       //   }
//                                       // };