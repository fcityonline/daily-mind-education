// backend/middleware/authMiddleware.js
// Phase-1: Enhanced auth middleware with refresh token support

import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in Authorization header (Bearer token) - access token
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
    // Check for token in cookies (fallback for legacy support)
    else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      // Phase-1: Try to refresh token from HttpOnly cookie
      const refreshToken = req.cookies?.rt; // User refresh token cookie
      if (refreshToken) {
        try {
          // Verify refresh token
          const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
          const user = await User.findById(decoded.id);
          
          if (!user) {
            return res.status(401).json({ 
              message: "Not authorized",
              success: false 
            });
          }

          // Check token version (for revocation)
          if (typeof decoded.v !== "number" || decoded.v !== (user.tokenVersion || 0)) {
            return res.status(401).json({ 
              message: "Token revoked",
              success: false 
            });
          }

            // Issue new access token
            const { issueAuthTokens } = await import('../controllers/tokenController.js');
            const tokens = await issueAuthTokens(user, res, false);
            const accessToken = tokens?.accessToken;
            
            if (!accessToken) {
              return res.status(500).json({ 
                message: "Failed to refresh token",
                success: false 
              });
            }
            
            // Set user and continue
            req.user = { id: user._id };
            // Also set new access token in response header for frontend
            res.setHeader('X-New-Access-Token', accessToken);
            return next();
        } catch (refreshError) {
          // Refresh token invalid, continue to return 401
          console.warn("Refresh token verification failed:", refreshError.message);
        }
      }
      
      return res.status(401).json({ 
        message: "Not authorized, no token provided",
        success: false 
      });
    }

    try {
      // Verify access token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = { id: decoded.id };
      next();
    } catch (jwtError) {
      // Access token expired - try refresh token
      if (jwtError.name === 'TokenExpiredError') {
        const refreshToken = req.cookies?.rt;
        if (refreshToken) {
          try {
            const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
            const user = await User.findById(decoded.id);
            
            if (!user) {
              return res.status(401).json({ 
                message: "Not authorized",
                success: false 
              });
            }

            if (typeof decoded.v !== "number" || decoded.v !== (user.tokenVersion || 0)) {
              return res.status(401).json({ 
                message: "Token revoked",
                success: false 
              });
            }

            // Issue new access token
            const { issueAuthTokens } = await import('../controllers/tokenController.js');
            const { accessToken } = issueAuthTokens(user, res, false);
            
            req.user = { id: user._id };
            res.setHeader('X-New-Access-Token', accessToken);
            return next();
          } catch (refreshError) {
            // Refresh also failed
            console.warn("Refresh token verification failed:", refreshError.message);
          }
        }
      }
      
      // Phase-1: Generic error message (don't leak token details)
      console.error("JWT verification failed:", jwtError.message);
      return res.status(401).json({ 
        message: "Not authorized",
        success: false 
      });
    }
  } catch (err) {
    console.error("protect middleware error:", err.message);
    // Phase-1: Generic error message
    return res.status(401).json({ 
      message: "Not authorized",
      success: false 
    });
  }
};

// Admin only middleware - checks if user is admin
export const adminOnly = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role !== 'admin') {
      return res.status(403).json({ message: "Access denied: Admins only" });
    }

    req.user.role = user.role; // Add role to request object
    next();
  } catch (error) {
    console.error("adminOnly middleware error:", error);
    res.status(500).json({ message: "Server error" });
  }
};