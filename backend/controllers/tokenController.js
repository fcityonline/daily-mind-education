// // // // backend/controllers/tokenController.js

// backend/controllers/tokenController.js
import jwt from "jsonwebtoken";
import crypto from "crypto";
import dotenv from "dotenv";
import { getRedisClient } from "../config/redis.js";

dotenv.config();

const ACCESS_TTL_SECONDS = Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 60 * 30); // default 30m
const REFRESH_TTL_SECONDS = Number(process.env.REFRESH_TTL_SECONDS || 60 * 60 * 24 * 14); // 14d

function signAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: `${ACCESS_TTL_SECONDS}s`, algorithm: "HS256" });
}

function signRefreshToken(payload, jti) {
  return jwt.sign({ ...payload, jti }, process.env.JWT_REFRESH_SECRET, { expiresIn: `${REFRESH_TTL_SECONDS}s`, algorithm: "HS256" });
}

async function redisClient() {
  const r = await getRedisClient();
  return r;
}

async function storeRefreshToken(jti, userId) {
  const c = await redisClient();
  if (!c) return false;
  await c.set(`refresh:${jti}`, String(userId), { EX: REFRESH_TTL_SECONDS });
  return true;
}

async function revokeRefreshToken(jti) {
  const c = await redisClient();
  if (!c) return false;
  await c.del(`refresh:${jti}`);
  return true;
}

async function isRefreshValid(jti, userId) {
  const c = await redisClient();
  if (!c) return false;
  const val = await c.get(`refresh:${jti}`);
  if (!val) return false;
  return val === String(userId);
}

export async function issueAuthTokens(user, res = null, setCookie = true) {
  const payload = { id: user._id.toString(), phone: user.phone, v: user.tokenVersion || 0 };
  const accessToken = signAccessToken(payload);
  const jti = crypto.randomBytes(16).toString("hex");
  const refreshToken = signRefreshToken(payload, jti);

  await storeRefreshToken(jti, user._id.toString());

  if (setCookie && res) {
    const isProd = process.env.NODE_ENV === "production";
    res.cookie("rt", refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: "strict",
      maxAge: REFRESH_TTL_SECONDS * 1000,
      path: "/",
    });
  }

  return { accessToken, refreshToken, jti };
}

export async function refreshTokensHandler(req, res) {
  try {
    const token = req.cookies?.rt || req.body?.refreshToken;
    if (!token) return res.status(401).json({ success: false, message: "No refresh token" });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET, { algorithms: ["HS256"] });
    } catch (err) {
      return res.status(401).json({ success: false, message: "Invalid refresh token" });
    }

    const { jti, id: userId, v } = decoded;
    const valid = await isRefreshValid(jti, userId);
    if (!valid) return res.status(401).json({ success: false, message: "Refresh token revoked" });

    // rotate
    await revokeRefreshToken(jti);

    const newJti = crypto.randomBytes(16).toString("hex");
    const newAccess = jwt.sign({ id: userId, v }, process.env.JWT_SECRET, { expiresIn: `${ACCESS_TTL_SECONDS}s`, algorithm: "HS256" });
    const newRefresh = jwt.sign({ id: userId, v, jti: newJti }, process.env.JWT_REFRESH_SECRET, { expiresIn: `${REFRESH_TTL_SECONDS}s`, algorithm: "HS256" });

    await storeRefreshToken(newJti, userId);

    const isProd = process.env.NODE_ENV === "production";
    res.cookie("rt", newRefresh, {
      httpOnly: true,
      secure: isProd,
      sameSite: "strict",
      maxAge: REFRESH_TTL_SECONDS * 1000,
      path: "/",
    });

    return res.json({ success: true, accessToken: newAccess });
  } catch (err) {
    console.error("refreshTokensHandler error:", err);
    return res.status(500).json({ success: false, message: "Token rotation failed" });
  }
}

// export async function revokeTokensHandler(req, res) {
//   try {
//     const token = req.cookies?.rt || req.body?.refreshToken;
//     if (!token) {
//       res.clearCookie("rt", { path: "/" });
//       return res.status(200).json({ success: true });
//     }
//     let decoded;
//     try {
//       decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET, { algorithms: ["HS256"] });
//     } catch (err) {
//       res.clearCookie("rt", { path: "/" });
//       return res.status(200).json({ success: true });
//     }
//     const { jti } = decoded;
//     if (jti) await revokeRefreshToken(jti);
//     res.clearCookie("rt", { path: "/" });
//     return res.json({ success: true });
//   } catch (err) {
//     console.error("revokeTokensHandler error:", err);
//     return res.status(500).json({ success: false, message: "Failed to revoke tokens" });
//   }
// }

// export default {
//   issueAuthTokens,
//   refreshTokensHandler,
//   revokeTokensHandler,
//   isRefreshValid,
// };
// export async function revokeTokensHandler(req, res) {
//   try {
//     const token = req.cookies?.rt || req.body?.refreshToken;
//     if (!token) {
//       res.clearCookie("rt", { path: "/" });
//       return res.status(200).json({ success: true });
//     }
//     let decoded;
//     try {
//       decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET, { algorithms: ["HS256"] });
//     } catch (err) {
//       res.clearCookie("rt", { path: "/" });
//       return res.status(200).json({ success: true });
//     }
//     const { jti } = decoded;
//     if (jti) await revokeRefreshToken(jti);
//     res.clearCookie("rt", { path: "/" });
//     return res.json({ success: true });
//   } catch (err) {
//     console.error("revokeTokensHandler error:", err);
//     return res.status(500).json({ success: false, message: "Failed to revoke tokens" });
//   }
// }

// // ✅ Add aliases for compatibility
// export const refreshToken = refreshTokensHandler;
// export const revokeTokens = revokeTokensHandler;

// export default {
//   issueAuthTokens,
//   refreshTokensHandler,
//   revokeTokensHandler,
//   isRefreshValid,
// };

export async function revokeTokensHandler(req, res) {
  try {
    const token = req.cookies?.rt || req.body?.refreshToken;
    if (!token) {
      res.clearCookie("rt", { path: "/" });
      return res.status(200).json({ success: true });
    }
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET, { algorithms: ["HS256"] });
    } catch (err) {
      res.clearCookie("rt", { path: "/" });
      return res.status(200).json({ success: true });
    }
    const { jti } = decoded;
    if (jti) await revokeRefreshToken(jti);
    res.clearCookie("rt", { path: "/" });
    return res.json({ success: true });
  } catch (err) {
    console.error("revokeTokensHandler error:", err);
    return res.status(500).json({ success: false, message: "Failed to revoke tokens" });
  }
}

// ✅ Add aliases for both user and admin routes
export const refreshToken = refreshTokensHandler;
export const revokeTokens = revokeTokensHandler;
export const refreshAdminToken = refreshTokensHandler;   // alias for admin routes
export const revokeAdminTokens = revokeTokensHandler;    // alias for admin routes

export default {
  issueAuthTokens,
  refreshTokensHandler,
  revokeTokensHandler,
  isRefreshValid,
  refreshToken,
  revokeTokens,
  refreshAdminToken,
  revokeAdminTokens,
};










// // backend/controllers/tokenController.js
// import jwt from "jsonwebtoken";
// import crypto from "crypto";
// import redisClient from "../config/redis.js";

// const ACCESS_TTL_SECONDS = Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 60 * 15); // 15 mins
// const REFRESH_TTL_SECONDS = Number(process.env.REFRESH_TOKEN_TTL_SECONDS || 60 * 60 * 24 * 14); // 14 days

// function signAccessToken(payload) {
//   return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: `${ACCESS_TTL_SECONDS}s` });
// }

// function signRefreshToken(payload, jti) {
//   // store jti inside token for rotation check
//   return jwt.sign({ ...payload, jti }, process.env.JWT_REFRESH_SECRET, { expiresIn: `${REFRESH_TTL_SECONDS}s` });
// }

// async function storeRefreshToken(jti, userId) {
//   // use key 'refresh:jti' => userId (or store whole token if needed)
//   await redisClient.set(`refresh:${jti}`, String(userId), { EX: REFRESH_TTL_SECONDS });
// }

// async function revokeRefreshToken(jti) {
//   await redisClient.del(`refresh:${jti}`);
// }

// async function isRefreshValid(jti, userId) {
//   const val = await redisClient.get(`refresh:${jti}`);
//   if (!val) return false;
//   return val === String(userId);
// }

// /**
//  * issueAuthTokens(user, res, setCookie)
//  * - user: Mongoose user doc (must have _id)
//  * - res: Express res object; if setCookie true, will set refresh cookie (HttpOnly)
//  * - returns { accessToken, refreshToken, jti }
//  */
// export async function issueAuthTokens(user, res = null, setCookie = true) {
//   const payload = { id: user._id.toString(), phone: user.phone, v: user.tokenVersion || 0 };

//   const accessToken = signAccessToken(payload);
//   const jti = crypto.randomBytes(16).toString("hex");
//   const refreshToken = signRefreshToken(payload, jti);

//   // store refresh jti in redis for revocation/rotation check
//   await storeRefreshToken(jti, user._id.toString());

//   if (setCookie && res) {
//     const isProd = process.env.NODE_ENV === "production";
//     res.cookie("rt", refreshToken, {
//       httpOnly: true,
//       secure: isProd,
//       sameSite: "strict",
//       maxAge: REFRESH_TTL_SECONDS * 1000,
//       path: "/",
//     });
//   }

//   return { accessToken, refreshToken, jti };
// }

// /**
//  * refresh tokens endpoint: validate existing refresh token (cookie or body), rotate & return new pair
//  */
// export async function refreshTokensHandler(req, res) {
//   try {
//     const token = req.cookies?.rt || req.body?.refreshToken;
//     if (!token) return res.status(401).json({ success: false, message: "No refresh token" });

//     let decoded;
//     try {
//       decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
//     } catch (err) {
//       return res.status(401).json({ success: false, message: "Invalid refresh token" });
//     }

//     const { jti, id: userId, v } = decoded;
//     // validate stored jti
//     const valid = await isRefreshValid(jti, userId);
//     if (!valid) return res.status(401).json({ success: false, message: "Refresh token revoked" });

//     // rotate: revoke old jti and issue new tokens
//     await revokeRefreshToken(jti);

//     // NOTE: re-fetch user to get current tokenVersion if needed (omitted for simplicity)
//     const newPayload = { id: userId, v };

//     const newJti = crypto.randomBytes(16).toString("hex");
//     const newAccess = jwt.sign(newPayload, process.env.JWT_SECRET, { expiresIn: `${ACCESS_TTL_SECONDS}s` });
//     const newRefresh = jwt.sign({ ...newPayload, jti: newJti }, process.env.JWT_REFRESH_SECRET, { expiresIn: `${REFRESH_TTL_SECONDS}s` });

//     await storeRefreshToken(newJti, userId);

//     const isProd = process.env.NODE_ENV === "production";
//     res.cookie("rt", newRefresh, {
//       httpOnly: true,
//       secure: isProd,
//       sameSite: "strict",
//       maxAge: REFRESH_TTL_SECONDS * 1000,
//       path: "/",
//     });

//     return res.json({ success: true, accessToken: newAccess });
//   } catch (err) {
//     console.error("refreshTokensHandler error:", err);
//     return res.status(500).json({ success: false, message: "Token rotation failed" });
//   }
// }

// /**
//  * revokeTokensHandler (logout)
//  * - revokes a refresh token by jti (extracted from cookie or body)
//  */
// export async function revokeTokensHandler(req, res) {
//   try {
//     const token = req.cookies?.rt || req.body?.refreshToken;
//     if (!token) return res.status(200).json({ success: true });

//     let decoded;
//     try {
//       decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
//     } catch (err) {
//       // invalid token — nothing to revoke
//       res.clearCookie("rt", { path: "/" });
//       return res.status(200).json({ success: true });
//     }

//     const { jti } = decoded;
//     if (jti) await revokeRefreshToken(jti);
//     res.clearCookie("rt", { path: "/" });
//     return res.json({ success: true });
//   } catch (err) {
//     console.error("revokeTokensHandler error:", err);
//     return res.status(500).json({ success: false, message: "Failed to revoke tokens" });
//   }
// }

// export default {
//   issueAuthTokens,
//   refreshTokensHandler,
//   revokeTokensHandler,
//   isRefreshValid,
// };










// // backend/controllers/tokenController.js
// import jwt from "jsonwebtoken";
// import User from "../models/User.js";

// /**
//  * TOKEN SETTINGS
//  * - access token: 15m
//  * - refresh token: 30d
//  * - user cookie path: /api/auth
//  * - admin cookie path: /api/admin-auth
//  */
// const USER_REFRESH_COOKIE = "rt";
// const ADMIN_REFRESH_COOKIE = "art";

// /* -------------------- SIGN HELPERS -------------------- */
// function signAccessToken(userId) {
//   // Phase-1: JWT expires in 30 minutes (not 15m)
//   return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "30m" });
// }

// function signRefreshToken(userId, tokenVersion) {
//   return jwt.sign(
//     { id: userId, v: tokenVersion },
//     process.env.JWT_REFRESH_SECRET,
//     { expiresIn: "30d" }
//   );
// }

// /* -------------------- COOKIE HELPERS -------------------- */
// function setRefreshCookie(res, token, isAdmin = false) {
//   // Phase-1: HttpOnly, SameSite=None (for cross-origin), Secure flags
//   res.cookie(isAdmin ? ADMIN_REFRESH_COOKIE : USER_REFRESH_COOKIE, token, {
//     httpOnly: true, // Prevents XSS attacks
//     secure: process.env.NODE_ENV === "production", // HTTPS only in production
//     sameSite: process.env.NODE_ENV === "production" ? "None" : "lax", // Phase-1: SameSite=None for cross-origin
//     path: isAdmin ? "/api/admin-auth" : "/api/auth",
//     maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
//   });
// }

// /* -------------------- ISSUE TOKENS (used by controllers) -------------------- */
// /**
//  * issueAuthTokens(user, res, isAdmin?)
//  *  -> sets refresh cookie and returns { accessToken }
//  */
// export function issueAuthTokens(user, res, isAdmin = false) {
//   const accessToken = signAccessToken(user._id);
//   const refreshToken = signRefreshToken(user._id, user.tokenVersion || 0);
//   setRefreshCookie(res, refreshToken, isAdmin);
//   return { accessToken };
// }

// /* -------------------- REFRESH ENDPOINTS -------------------- */
// export async function refreshToken(req, res) {
//   await handleRefresh(req, res, false);
// }

// export async function refreshAdminToken(req, res) {
//   await handleRefresh(req, res, true);
// }

// async function handleRefresh(req, res, isAdmin) {
//   try {
//     const cookieName = isAdmin ? ADMIN_REFRESH_COOKIE : USER_REFRESH_COOKIE;
//     const token = req.cookies?.[cookieName];
//     if (!token) return res.status(401).json({ message: "No refresh token" });

//     let payload;
//     try {
//       payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
//     } catch {
//       return res.status(401).json({ message: "Invalid or expired refresh token" });
//     }

//     const user = await User.findById(payload.id);
//     if (!user) return res.status(401).json({ message: "User not found" });
//     if (typeof payload.v !== "number" || payload.v !== user.tokenVersion) {
//       return res.status(401).json({ message: "Refresh token revoked" });
//     }

//     const newAccess = signAccessToken(user._id);
//     const newRefresh = signRefreshToken(user._id, user.tokenVersion);
//     setRefreshCookie(res, newRefresh, isAdmin);

//     res.json({ accessToken: newAccess });
//   } catch (err) {
//     console.error("handleRefresh:", err.message);
//     res.status(500).json({ message: "Failed to refresh token" });
//   }
// }

// /* -------------------- REVOKE ENDPOINTS -------------------- */
// export async function revokeTokens(req, res) {
//   await handleRevoke(req, res, false);
// }

// export async function revokeAdminTokens(req, res) {
//   await handleRevoke(req, res, true);
// }

// async function handleRevoke(req, res, isAdmin) {
//   try {
//     const user = await User.findById(req.user.id);
//     if (!user) return res.status(404).json({ message: "User not found" });

//     user.tokenVersion = (user.tokenVersion || 0) + 1;
//     await user.save();

//     res.clearCookie(isAdmin ? ADMIN_REFRESH_COOKIE : USER_REFRESH_COOKIE, {
//       path: isAdmin ? "/api/admin-auth" : "/api/auth",
//     });

//     res.json({ message: "Tokens revoked" });
//   } catch (err) {
//     console.error("handleRevoke:", err.message);
//     res.status(500).json({ message: "Failed to revoke tokens" });
//   }
// }
















// import jwt from "jsonwebtoken";
// import User from "../models/User.js";

// const REFRESH_COOKIE_NAME = "rt";

// function signAccessToken(userId) {
//   return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "15m" });
// }

// function signRefreshToken(userId, tokenVersion) {
//   return jwt.sign({ id: userId, v: tokenVersion }, process.env.JWT_REFRESH_SECRET, { expiresIn: "30d" });
// }

// function setRefreshCookie(res, token) {
//   res.cookie(REFRESH_COOKIE_NAME, token, {
//     httpOnly: true,
//     secure: process.env.NODE_ENV === "production",
//     sameSite: "lax",
//     path: "/api/auth", // restrict path
//     maxAge: 30 * 24 * 60 * 60 * 1000,
//   });
// }

// export async function refreshToken(req, res) {
//   try {
//     const token = req.cookies?.[REFRESH_COOKIE_NAME];
//     if (!token) return res.status(401).json({ message: "No refresh token" });

//     let payload;
//     try {
//       payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
//     } catch (e) {
//       return res.status(401).json({ message: "Invalid refresh token" });
//     }

//     const user = await User.findById(payload.id);
//     if (!user) return res.status(401).json({ message: "User not found" });
//     if (typeof payload.v !== "number" || payload.v !== user.tokenVersion) {
//       return res.status(401).json({ message: "Refresh token revoked" });
//     }

//     const newAccess = signAccessToken(user._id);
//     const newRefresh = signRefreshToken(user._id, user.tokenVersion);
//     setRefreshCookie(res, newRefresh);

//     res.json({ accessToken: newAccess });
//   } catch (err) {
//     console.error("refreshToken:", err.message);
//     res.status(500).json({ message: "Failed to refresh token" });
//   }
// }

// export async function revokeTokens(req, res) {
//   try {
//     const user = await User.findById(req.user.id);
//     if (!user) return res.status(404).json({ message: "User not found" });
//     user.tokenVersion = (user.tokenVersion || 0) + 1;
//     await user.save();
//     res.clearCookie(REFRESH_COOKIE_NAME, { path: "/api/auth" });
//     res.json({ message: "Tokens revoked" });
//   } catch (err) {
//     console.error("revokeTokens:", err.message);
//     res.status(500).json({ message: "Failed to revoke tokens" });
//   }
// }

// // Helpers for authController to set refresh on login/verify
// export function issueAuthTokens(user, res) {
//   const accessToken = signAccessToken(user._id);
//   const refreshToken = signRefreshToken(user._id, user.tokenVersion || 0);
//   setRefreshCookie(res, refreshToken);
//   return { accessToken };
// }


