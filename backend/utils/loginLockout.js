// // backend/utils/loginLockout.js

// backend/utils/loginLockout.js
import { getRedisClient } from "../config/redis.js";

/**
 * Keys:
 * - attempts:{identifier}
 * - lockout:{identifier}
 *
 * incrementLoginAttempts -> returns total attempts
 * isLockedOut(lockKey) -> boolean or set lock when second param true
 * resetLoginAttempts(attemptsKey, lockKey)
 */

const DEFAULT_ATTEMPT_WINDOW_MS = Number(process.env.LOGIN_ATTEMPT_WINDOW_MS || 5 * 60 * 1000); // 5 min
const DEFAULT_MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS || 3);
const DEFAULT_LOCKOUT_MS = Number(process.env.LOGIN_LOCKOUT_MS || 5 * 60 * 1000); // 5 min

function attemptsKey(id) { return `login:attempts:${id}`; }
function lockoutKey(id) { return `login:lockout:${id}`; }

export async function incrementLoginAttempts(id) {
  try {
    const client = await getRedisClient();
    if (!client) {
      // Redis unavailable - allow login but log warning
      console.warn('[loginLockout] Redis unavailable, skipping attempt tracking');
      return 0;
    }
    
    const key = attemptsKey(id);
    const v = await client.incr(key);
    if (v === 1) {
      // set TTL for attempts window
      await client.pExpire(key, DEFAULT_ATTEMPT_WINDOW_MS);
    }
    return Number(v);
  } catch (err) {
    console.warn('incrementLoginAttempts error', err.message);
    // Fallback: if Redis unavailable, return 0 so login still proceeds
    return 0;
  }
}

export async function isLockedOut(id, setLock = false) {
  try {
    const client = await getRedisClient();
    if (!client) {
      // Redis unavailable - don't lock out
      return false;
    }
    
    const lk = lockoutKey(id);
    if (setLock) {
      // set lock with TTL
      await client.set(lk, "1", { PX: DEFAULT_LOCKOUT_MS });
      return true;
    }
    
    // Check if lock exists
    const exists = await client.exists(lk);
    return exists === 1;
  } catch (err) {
    console.warn('isLockedOut error', err.message);
    return false;
  }
}

export async function resetLoginAttempts(id) {
  try {
    const client = await getRedisClient();
    if (!client) {
      return false;
    }
    
    await client.del(attemptsKey(id));
    await client.del(lockoutKey(id));
    return true;
  } catch (err) {
    console.warn('resetLoginAttempts error', err.message);
    return false;
  }
}


// // Login attempt lockout system using Redis (Phase-1 security requirement)
// import { createClient } from "redis";
// import dotenv from "dotenv";

// // Load environment variables
// dotenv.config();

// const REDIS_URL = process.env.REDIS_URL || null;
// let redisClient = null;
// let redisReady = false;

// async function initRedis() {
//   if (redisClient && redisReady) return redisClient;
  
//   // Get REDIS_URL from environment (may not be loaded at module level)
//   const redisUrl = process.env.REDIS_URL || REDIS_URL;
//   if (!redisUrl) {
//     // Only warn once to avoid spam
//     if (!redisClient) {
//       console.warn("[loginLockout] Redis not configured, using in-memory fallback");
//     }
//     return null;
//   }
  
//   try {
//     // Close existing connection if any
//     if (redisClient && !redisReady) {
//       try {
//         await redisClient.quit();
//       } catch (e) {
//         // Ignore quit errors
//       }
//     }
    
//     redisClient = createClient({ url: redisUrl });
//     redisClient.on("error", (e) => {
//       console.warn("[loginLockout][redis] error", e.message || e);
//       redisReady = false;
//     });
//     await redisClient.connect();
//     redisReady = true;
//     console.log("[loginLockout] ✅ Connected to Redis");
//     return redisClient;
//   } catch (err) {
//     console.warn("[loginLockout] Failed to connect to Redis, using in-memory fallback:", err.message || err);
//     redisClient = null;
//     redisReady = false;
//     return null;
//   }
// }

// // In-memory fallback store
// const inMemoryStore = new Map();
// const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes (Phase-1 requirement)
// const MAX_ATTEMPTS = 3; // Phase-1 requirement

// /**
//  * Get login attempts count
//  */
// export async function getLoginAttempts(attemptsKey) {
//   await initRedis();
//   if (redisReady && redisClient) {
//     try {
//       const count = await redisClient.get(attemptsKey);
//       return count ? parseInt(count, 10) : 0;
//     } catch (e) {
//       console.warn("[loginLockout] getLoginAttempts redis error", e.message || e);
//       return inMemoryStore.get(attemptsKey)?.attempts || 0;
//     }
//   }
//   return inMemoryStore.get(attemptsKey)?.attempts || 0;
// }

// /**
//  * Increment login attempts
//  */
// export async function incrementLoginAttempts(attemptsKey) {
//   await initRedis();
//   if (redisReady && redisClient) {
//     try {
//       const count = await redisClient.incr(attemptsKey);
//       // Set TTL on first increment
//       if (count === 1) {
//         await redisClient.pexpire(attemptsKey, LOCKOUT_DURATION_MS);
//       }
//       return count;
//     } catch (e) {
//       console.warn("[loginLockout] incrementLoginAttempts redis error", e.message || e);
//       const stored = inMemoryStore.get(attemptsKey) || { attempts: 0 };
//       stored.attempts += 1;
//       inMemoryStore.set(attemptsKey, stored);
//       return stored.attempts;
//     }
//   }
//   const stored = inMemoryStore.get(attemptsKey) || { attempts: 0 };
//   stored.attempts += 1;
//   inMemoryStore.set(attemptsKey, stored);
//   return stored.attempts;
// }

// /**
//  * Reset login attempts (on successful login)
//  */
// export async function resetLoginAttempts(attemptsKey, lockoutKey) {
//   await initRedis();
//   if (redisReady && redisClient) {
//     try {
//       await redisClient.del(attemptsKey);
//       if (lockoutKey) {
//         await redisClient.del(lockoutKey);
//       }
//       return true;
//     } catch (e) {
//       console.warn("[loginLockout] resetLoginAttempts redis error", e.message || e);
//       inMemoryStore.delete(attemptsKey);
//       if (lockoutKey) {
//         inMemoryStore.delete(lockoutKey);
//       }
//       return false;
//     }
//   }
//   inMemoryStore.delete(attemptsKey);
//   if (lockoutKey) {
//     inMemoryStore.delete(lockoutKey);
//   }
//   return false;
// }

// /**
//  * Check if account is locked out
//  * @param {string} lockoutKey - Redis key for lockout
//  * @param {boolean} setLockout - If true, set lockout (used when attempts >= MAX_ATTEMPTS)
//  * @returns {Promise<boolean>} - true if locked out
//  */
// export async function isLockedOut(lockoutKey, setLockout = false) {
//   await initRedis();
  
//   if (setLockout) {
//     // Set lockout
//     if (redisReady && redisClient) {
//       try {
//         await redisClient.set(lockoutKey, "1", { PX: LOCKOUT_DURATION_MS });
//         return true;
//       } catch (e) {
//         console.warn("[loginLockout] isLockedOut set redis error", e.message || e);
//         inMemoryStore.set(lockoutKey, { locked: true, expiresAt: Date.now() + LOCKOUT_DURATION_MS });
//         return true;
//       }
//     }
//     inMemoryStore.set(lockoutKey, { locked: true, expiresAt: Date.now() + LOCKOUT_DURATION_MS });
//     return true;
//   }
  
//   // Check lockout
//   if (redisReady && redisClient) {
//     try {
//       const exists = await redisClient.exists(lockoutKey);
//       return exists === 1;
//     } catch (e) {
//       console.warn("[loginLockout] isLockedOut check redis error", e.message || e);
//       const stored = inMemoryStore.get(lockoutKey);
//       if (stored && stored.expiresAt > Date.now()) {
//         return true;
//       }
//       if (stored && stored.expiresAt <= Date.now()) {
//         inMemoryStore.delete(lockoutKey);
//       }
//       return false;
//     }
//   }
  
//   const stored = inMemoryStore.get(lockoutKey);
//   if (stored && stored.expiresAt > Date.now()) {
//     return true;
//   }
//   if (stored && stored.expiresAt <= Date.now()) {
//     inMemoryStore.delete(lockoutKey);
//   }
//   return false;
// }

