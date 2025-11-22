// // backend/middleware/errorHandler.js

// backend/middleware/errorHandler.js
// ESM style

export function notFound(req, res, next) {
  res.status(404);
  res.json({ success: false, message: `Not Found - ${req.originalUrl}` });
}

export function globalErrorHandler(err, req, res, next) {
  // Phase-1: Sanitize error messages - don't leak sensitive info
  const isProduction = process.env.NODE_ENV === "production";
  
  // Log full error details server-side (for debugging)
  console.error("🔥 Global Error Handler:", {
    message: err.message,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Determine status code
  let statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
  
  // Handle specific error types with generic messages (Phase-1 requirement)
  let message = "Internal Server Error"; // Default generic message
  
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = "Invalid input data";
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = "Invalid ID format";
  } else if (err.code === 11000) {
    statusCode = 400;
    message = "Duplicate entry";
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = "Invalid token";
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = "Token expired";
  } else if (err.name === 'MulterError') {
    statusCode = 400;
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = "File size too large. Maximum size is 5MB for images and 20MB for PDFs.";
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      message = "Too many files uploaded";
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      message = "Unexpected file field";
    } else {
      message = "File upload error: " + (err.message || "Unknown error");
    }
  } else if (err.statusCode) {
    statusCode = err.statusCode;
    // Only use custom message if it's not sensitive
    if (err.message && !err.message.toLowerCase().includes('password') && 
        !err.message.toLowerCase().includes('secret') &&
        !err.message.toLowerCase().includes('token')) {
      message = err.message;
    }
  } else if (!isProduction && err.message) {
    // In development, show actual error messages
    message = err.message;
  }

  // Never send stack traces or sensitive info to client (Phase-1 requirement)
  const response = {
    success: false,
    message: message
  };

  // Only include stack in development
  if (!isProduction && err.stack) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

// helper: async handler wrapper (use in routes/controllers)
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);










// backend/middleware/errorHandler.js
// export const errorHandler = (err, req, res, next) => {
//   console.error("🔥 Global Error Handler:", err);

//   const statusCode =
//     res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;

//   res.status(statusCode).json({
//     success: false,
//     message: err.message || "Internal Server Error",
//     stack: process.env.NODE_ENV === "production" ? "🥞" : err.stack,
//   });
// };












// export const notFound = (req, res, next) => {
//   res.status(404);
//   next(new Error(`Not Found - ${req.originalUrl}`));
// };

// export const globalErrorHandler = (err, req, res, next) => {
//   if (res.headersSent) return next(err);
  
//   let statusCode = res.statusCode !== 200 ? res.statusCode : 500;
//   let message = err.message || "Internal server error";
  
//   // Handle specific error types
//   if (err.name === 'ValidationError') {
//     statusCode = 400;
//     message = Object.values(err.errors).map(val => val.message).join(', ');
//   } else if (err.name === 'CastError') {
//     statusCode = 400;
//     message = 'Invalid ID format';
//   } else if (err.code === 11000) {
//     statusCode = 400;
//     message = 'Duplicate field value';
//   } else if (err.name === 'JsonWebTokenError') {
//     statusCode = 401;
//     message = 'Invalid token';
//   } else if (err.name === 'TokenExpiredError') {
//     statusCode = 401;
//     message = 'Token expired';
//   }
  
//   res.status(statusCode);
  
//   const response = { 
//     success: false,
//     message,
//     ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
//   };
  
//   // Log error details
//   console.error(`[${new Date().toISOString()}] [${req.method}] ${req.originalUrl} →`, {
//     statusCode,
//     message,
//     stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
//   });
  
//   res.json(response);
// };

// // Async error wrapper
// export const asyncHandler = (fn) => (req, res, next) => {
//   Promise.resolve(fn(req, res, next)).catch(next);
// };

// // Rate limiting error handler
// export const rateLimitHandler = (req, res) => {
//   res.status(429).json({
//     success: false,
//     message: 'Too many requests, please try again later',
//     retryAfter: req.rateLimit?.resetTime || 60
//   });
// };
