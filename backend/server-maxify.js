// // backend/server.js
// backend/server.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import hsts from "hsts";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import http from "http";
import { Server as IOServer } from "socket.io";
import jwt from "jsonwebtoken";
import os from "os";
import { connectDB } from "./config/db.js";
import { notFound, globalErrorHandler } from "./middleware/errorHandler.js";
import authRoutes from "./routes/authRoutes.js";
import adminAuthRoutes from "./routes/adminAuthRoutes.js";
import quizRoutes from "./routes/quizRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import blogRoutes from "./routes/blogRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import { webhookHandler } from "./controllers/paymentController.js";
import { initializeQuizScheduler, setIoInstance } from "./utils/quizScheduler.js";
import { startDeletionWorker } from "./utils/deletionWorker.js";
import Quiz from "./models/Quiz.js";
import User from "./models/User.js";
import { getRedisClient } from "./config/redis.js";
import fs from "fs";
import path from "path";

import notificationRoutes from "./routes/notificationRoutes.js";


dotenv.config();



// Ensure upload directories exist
const ensureUploadDirs = () => {
  const imgsDir = path.join(process.cwd(), "uploads", "images");
  const pdfsDir = path.join(process.cwd(), "uploads", "pdfs");
  if (!fs.existsSync(imgsDir)) {
    fs.mkdirSync(imgsDir, { recursive: true });
    console.log("📁 Created uploads/images directory");
  }
  if (!fs.existsSync(pdfsDir)) {
    fs.mkdirSync(pdfsDir, { recursive: true });
    console.log("📁 Created uploads/pdfs directory");
  }
};
ensureUploadDirs();

connectDB();

const app = express();


// ---------------------- Dependencies you may need ----------------------
// npm i helmet cors cookie-parser morgan express-rate-limit socket.io redis @socket.io/redis-adapter
// Optional for Redis-backed rate limiter: npm i rate-limit-redis
// ----------------------------------------------------------------------

// ---------------------- Local IP detection (for dev mobile testing) ----------------------
const networkInterfaces = os.networkInterfaces();
let localIP = "localhost";
for (const ifName in networkInterfaces) {
  const ifaces = networkInterfaces[ifName];
  for (const iface of ifaces) {
    if (iface.family === "IPv4" && !iface.internal) {
      localIP = iface.address;
      break;
    }
  }
  if (localIP !== "localhost") break;
}
console.log(`🌐 Local IP: ${localIP}`);

// ---------------------- Security: Helmet + HSTS + HTTPS enforcement ----------------------
app.use(helmet({
  // Keep CSP minimal — adjust in production to match your frontend domains
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      // imgSrc: ["'self'", "data:", "https:"],
      imgSrc: [
  "'self'",
  "data:",
  "https:",
  "http://localhost:5000",
  "http://127.0.0.1:5000",
  `http://${localIP}:5000`,
],

      connectSrc: ["'self'", "wss:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  referrerPolicy: { policy: "no-referrer" },
}));

// HSTS (only in production)
if (process.env.NODE_ENV === "production") {
  // 1 year HSTS, includeSubDomains, preload
  app.use(hsts({
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }));

  // Enforce HTTPS (X-Forwarded header for proxies)
  app.use((req, res, next) => {
    const proto = req.headers["x-forwarded-proto"] || req.protocol;
    if (proto !== "https") {
      // Redirect to HTTPS except for local health checks
      const host = req.headers.host;
      const url = `https://${host}${req.originalUrl}`;
      return res.redirect(301, url);
    }
    next();
  });
}

// ---------------------- CORS ----------------------
const allowedOrigins = (process.env.NODE_ENV === 'production')
  ? [
      process.env.FRONTEND_URL,
      'https://dailymindeducation.com',
      'https://www.dailymindeducation.com'
    ].filter(Boolean)
  : [
      "http://localhost:3000",
      `http://${localIP}:3000`,
      `http://${localIP}:3001`,
      process.env.FRONTEND_URL
    ].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // allow non-browser requests like curl/postman (undefined origin)
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error("CORS blocked"), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Requested-With']
}));

// ---------------------- Basic Middlewares ----------------------
app.use(cookieParser());
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// Note: JSON body parser comes after webhook raw route (below).

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// ---------------------- Rate limiting ----------------------
// Global general limiter
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.GLOBAL_RATE_LIMIT_MAX || 1000),
  message: { success: false, message: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use(globalLimiter);

// Auth-specific (stricter) limiter - applied to auth routes (router-level too)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 200),
  message: { success: false, message: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// OTP & login stricter limit example will be applied inside authRoutes (your route file already uses express-rate-limit).
// If you want Redis-backed store for rate-limit, install `rate-limit-redis` and wire it here.

// ---------------------- Razorpay Webhook (raw body) ----------------------
// Must be before express.json()
app.post('/api/payment/webhook', express.raw({ type: 'application/json' }), webhookHandler);

// Now JSON body parser for the rest of the app
app.use(express.json({ limit: '10mb' }));

// ---------------------- Static uploads with caching ----------------------
// app.use("/uploads", (req, res, next) => {
//   res.header('Access-Control-Allow-Origin', '*');
//   res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
//   res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
//   res.header('Cache-Control', 'public, max-age=31536000'); // 1 year
//   if (req.method === 'OPTIONS') return res.sendStatus(200);
//   next();
// }, express.static("uploads", {
//   // Support for range requests for large files
//   setHeaders: (res, path) => {
//     // Enable range requests for better streaming
//     res.setHeader('Accept-Ranges', 'bytes');
//   }
// }));
// existing uploads route (you already had this)
app.use("/uploads", (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Cache-Control', 'public, max-age=31536000'); // 1 year
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
}, express.static("uploads", {
  setHeaders: (res, path) => {
    res.setHeader('Accept-Ranges', 'bytes');
  }
}));

// Add these two lines (images + pdfs)
app.use('/images', express.static(path.join(process.cwd(), 'uploads', 'images'), {
  setHeaders: (res, filePath) => {
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.setHeader('Accept-Ranges', 'bytes');
  }
}));
app.use('/pdfs', express.static(path.join(process.cwd(), 'uploads', 'pdfs'), {
  setHeaders: (res, filePath) => {
    res.setHeader('Cache-Control', 'public, max-age=604800');
  }
}));


// ---------------------- Health & Debug ----------------------
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'unknown'
  });
});

app.get('/api', (req, res) => {
  res.json({
    message: 'Daily Mind Education API',
    version: '1.0.0',
    status: 'active',
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: '/api/auth',
      quiz: '/api/quiz',
      payment: '/api/payment',
      blogs: '/api/blogs',
      admin: '/api/admin'
    }
  });
});

// debug routes list
app.get('/api/debug/routes', (req, res) => {
  res.json({
    routes: [
      'POST /api/auth/send-otp',
      'POST /api/auth/verify-otp',
      'POST /api/auth/login',
      'POST /api/auth/forgot-password',
      'POST /api/auth/reset-password',
    ]
  });
});

// ---------------------- API Routes ----------------------
// Mount auth routes with additional auth limiter

// app.use("/pdfs", express.static("uploads/pdfs"));
// app.use("/images", express.static("uploads/images"));


app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/quiz", quizRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/blogs", blogRoutes);
app.use("/api", userRoutes);
app.use("/api/reports", reportRoutes);

app.use("/api/notifications", notificationRoutes);


// Admin
app.use("/api/admin", adminRoutes);
app.use("/api/admin-auth", adminAuthRoutes);

// 404 & error handlers
app.use(notFound);
app.use(globalErrorHandler);

// ---------------------- HTTP Server + Socket.IO + Redis Adapter ----------------------
const server = http.createServer(app);

const io = new IOServer(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true
  },
  // pingInterval/pingTimeout etc can be tuned for production mobile use
});

// Try to use Redis adapter for Socket.IO if possible
(async () => {
  try {
    if (!process.env.REDIS_URL) {
      console.log('⚠️ Socket.IO Redis adapter not enabled — REDIS_URL not set');
      return;
    }

    const pubClient = await getRedisClient();
    
    if (!pubClient) {
      console.log('⚠️ Socket.IO Redis adapter not enabled — Redis client not available');
      return;
    }

    // Create subscriber client (duplicate of publisher)
    const { createClient } = await import('redis');
    const subClient = pubClient.duplicate ? pubClient.duplicate() : createClient({ url: process.env.REDIS_URL });
    
    if (!subClient.isOpen && !subClient.isReady) {
      await subClient.connect();
    }

    // Apply adapter
    const { createAdapter } = await import('@socket.io/redis-adapter');
    io.adapter(createAdapter(pubClient, subClient));
    console.log('🔌 Socket.IO Redis adapter enabled');
  } catch (e) {
    console.warn('Redis adapter not enabled:', e && e.message ? e.message : e);
  }
})();

// ---------------------- Socket.io Authentication ----------------------
const socketAuth = async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || (socket.handshake.headers?.authorization ? socket.handshake.headers.authorization.split(" ")[1] : null);
    if (!token) return next(new Error("Authentication error: No token provided"));

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    } catch (err) {
      return next(new Error("Authentication error: Invalid token"));
    }

    // check expiry (jwt.verify already checks expiry but double-check for clarity)
    if (decoded.exp && Date.now() >= decoded.exp * 1000) {
      return next(new Error("Authentication error: Token expired"));
    }

    const user = await User.findById(decoded.id).select("-password");
    if (!user) return next(new Error("Authentication error: User not found"));
    if (user.isBanned) return next(new Error("Authentication error: User banned"));

    socket.user = user;
    socket.userId = user._id.toString();
    next();
  } catch (err) {
    console.error("Socket auth error:", err && err.message ? err.message : err);
    next(new Error("Authentication error"));
  }
};

io.use(socketAuth);

// Keep small in-memory map for active connections (safe because we rely on Redis adapter for multi-instance)
const activeSockets = new Map(); // userId -> Set(socketId)
// Store active connected users for notifications
global.onlineUsers = new Map(); // userId => socketId

// ---------------------- Socket.io event handlers (quiz logic preserved) ----------------------
io.on("connection", (socket) => {

  // -----------------------------------------------
// LIVE ADMIN BROADCASTER (REAL-TIME STATS)
// -----------------------------------------------

const emitLiveStats = async () => {
  try {
    const totalWaiting = await User.countDocuments({ status: "waiting" });
    const totalJoined = await User.countDocuments({ status: "joined" });
    // Register user for notifications
const userId = socket.userId;
if (userId) {
  global.onlineUsers.set(userId, socket.id);
  console.log(`🔔 User registered for notifications: ${userId} → ${socket.id}`);
}


    io.emit("liveStatsUpdate", {
      waiting: totalWaiting,
      joined: totalJoined
    });
  } catch (err) {
    console.error("Live stats error:", err);
  }
};

// Emit once when any user connects
emitLiveStats();






  // Defensive checks (socket.user should exist thanks to socketAuth)
  const username = socket.user?.fullName || 'unknown';
  console.log(`🔌 Socket connected: ${username} (${socket.userId})`);

  socket.on("join-room", async ({ roomId, deviceId }) => {
    try {
      const quizId = roomId;
      const userId = socket.userId;

      const quiz = await Quiz.findById(quizId);
      if (!quiz) {
        socket.emit("join-error", { message: "Quiz not found" });
        return;
      }
      if (!quiz.isLive) {
        socket.emit("join-error", { message: "Quiz is not live yet" });
        return;
      }

      const participant = quiz.participants.find(p => p.user.toString() === userId && p.paid === true);
      if (!participant) {
        socket.emit("join-error", { message: "You are not registered or payment not verified" });
        return;
      }

      // device enforcement logic (preserve from your existing implementation)
      if (deviceId) {
        const u = await User.findById(userId);
        if (u) {
          if (!u.deviceId) {
            u.deviceId = deviceId;
            await u.save();
          } else if (u.deviceId !== deviceId) {
            if (process.env.NODE_ENV === 'production') {
              socket.emit("join-error", { message: "Device mismatch detected. Please use the same device you registered with." });
              return;
            } else {
              u.deviceId = deviceId;
              await u.save();
            }
          }
        }
      }

      if (!activeSockets.has(userId)) activeSockets.set(userId, new Set());
      const userSockets = activeSockets.get(userId);

      // disconnect old sockets to prevent multi-login in same quiz
      if (userSockets.size > 0) {
        userSockets.forEach(oldSocketId => {
          const oldSocket = io.sockets.sockets.get(oldSocketId);
          if (oldSocket) {
            oldSocket.emit("force-disconnect", { message: "You connected from another device/session" });
            oldSocket.disconnect(true);
          }
        });
        userSockets.clear();
      }

      userSockets.add(socket.id);
      socket.join(`quiz-${quizId}`);

      // Atomic participant update
      try {
        await Quiz.findOneAndUpdate(
          { _id: quizId, 'participants.user': userId },
          {
            $set: {
              'participants.$.socketId': socket.id,
              'participants.$.ipAddress': socket.handshake.address,
              'participants.$.userAgent': socket.handshake.headers['user-agent'],
              'participants.$.lastSubmissionAt': new Date()
            }
          },
          { new: true }
        );
      } catch (error) {
        console.error("Join room atomic update failed:", error);
        // fallback: best-effort retry once
        const updatedQuiz = await Quiz.findById(quizId);
        const updatedParticipant = updatedQuiz?.participants?.find(p => p.user.toString() === userId && p.paid === true);
        if (!updatedParticipant) {
          socket.emit("join-error", { message: "Failed to join quiz. Please try again." });
          return;
        }
      }

      socket.emit("joined", { roomId: `quiz-${quizId}` });
      socket.to(`quiz-${quizId}`).emit("user-joined", { userId, username: socket.user.fullName });

      // If quiz is live, immediately emit the current question state (existing logic preserved)
      if (quiz.isLive && typeof quiz.currentQuestionIndex === 'number' && quiz.currentQuestionIndex >= 0) {
        const idx = quiz.currentQuestionIndex;
        const q = quiz.questions[idx];
        if (q) {
          const startMs = quiz.questionStartTime ? quiz.questionStartTime.getTime() : Date.now();
          const elapsedMs = Date.now() - startMs;
          const durationMs = (quiz.timePerQuestion || 15) * 1000;
          const remainingMs = Math.max(0, durationMs - elapsedMs);
          socket.emit('question', {
            questionIndex: idx + 1,
            totalQuestions: quiz.totalQuestions,
            question: {
              _id: q._id,
              text: q.text,
              options: q.options,
              category: q.category,
              points: q.points
            },
            timeLeft: remainingMs,
            startTime: startMs,
            duration: durationMs
          });
        }
      }

    } catch (err) {
      console.error("join-room error:", err);
      socket.emit("join-error", { message: err.message || "Failed to join quiz" });
    }
  });

  // submit-answer handler (preserve your logic)
  socket.on("submit-answer", async (payload) => {
    try {
      const { roomId, questionId, selectedIndex } = payload;
      const userId = socket.userId;

      if (!roomId || !userId || !questionId || selectedIndex === undefined) {
        socket.emit("answer-error", { message: "Invalid answer data" });
        return;
      }

      const quiz = await Quiz.findById(roomId);
      if (!quiz) {
        socket.emit("answer-error", { message: "Quiz not found" });
        return;
      }

      if (!quiz.isLive) {
        socket.emit("answer-error", { message: "Quiz is not live" });
        return;
      }

      const participant = quiz.participants.find(p => p.user.toString() === userId && p.paid === true);
      if (!participant) {
        socket.emit("answer-error", { message: "User not registered for this quiz" });
        return;
      }

      const question = quiz.questions.find(q => q._id.toString() === questionId);
      if (!question) {
        socket.emit("answer-error", { message: "Question not found" });
        return;
      }

      const existingAnswer = participant.answers.find(a => a.questionId.toString() === questionId);
      if (existingAnswer) {
        socket.emit("answer-error", { message: "Question already answered" });
        return;
      }

      const now = Date.now();
      const questionStartTime = quiz.questionStartTime?.getTime() || 0;
      const timeElapsed = (now - questionStartTime) / 1000;

      if (timeElapsed > quiz.timePerQuestion + 1) {
        socket.emit("answer-error", { message: "Time limit exceeded" });
        return;
      }

      const isCorrect = selectedIndex === question.correctIndex;
      const points = isCorrect ? question.points : 0;
      const timeTaken = Math.round(timeElapsed);

      // Use atomic update to prevent race conditions
      const updatedQuiz = await Quiz.findOneAndUpdate(
        {
          _id: roomId,
          'participants.user': userId,
          'participants.paid': true,
          'participants.answers.questionId': { $ne: questionId } // Ensure not already answered
        },
        {
          $push: {
            'participants.$.answers': {
              questionId,
              selectedIndex,
              correct: isCorrect,
              timeTaken,
              points,
              submittedAt: new Date(),
              serverTimeReceived: new Date()
            }
          },
          $inc: {
            'participants.$.score': points,
            'participants.$.totalQuestions': 1,
            'participants.$.correctAnswers': isCorrect ? 1 : 0,
            'participants.$.timeSpent': timeTaken
          },
          $set: {
            'participants.$.lastSubmissionAt': new Date()
          }
        },
        { new: true }
      );

      if (!updatedQuiz) {
        socket.emit("answer-error", { message: "Failed to save answer or already answered" });
        return;
      }

      // Get updated participant for response
      const updatedParticipant = updatedQuiz.participants.find(p => p.user.toString() === userId && p.paid === true);

      socket.emit("answer-result", {
        questionId,
        correct: isCorrect,
        points,
        totalScore: updatedParticipant?.score || 0,
        timeElapsed: timeTaken
      });

      socket.to(`quiz-${roomId}`).emit("participant-answered", {
        userId,
        username: socket.user.fullName
      });
    } catch (err) {
      console.error("submit-answer error:", err);
      socket.emit("answer-error", { message: "Failed to process answer" });
    }
  });

  // complete-quiz handler (preserve your logic)
  socket.on("complete-quiz", async ({ roomId }) => {
    try {
      const userId = socket.userId;
      const quiz = await Quiz.findById(roomId);
      if (!quiz) {
        socket.emit("quiz-error", { message: "Quiz not found" });
        return;
      }
      const participant = quiz.participants.find(p => p.user.toString() === userId);
      if (!participant) {
        socket.emit("quiz-error", { message: "User not registered for this quiz" });
        return;
      }
      if (participant.isCompleted) {
        socket.emit("quiz-error", { message: "Quiz already completed" });
        return;
      }

      participant.isCompleted = true;
      participant.endTime = new Date();

      const sortedParticipants = quiz.participants
        .filter(p => p.isCompleted)
        .sort((a, b) => b.score - a.score || a.timeSpent - b.timeSpent);

      const rank = sortedParticipants.findIndex(p => p.user.toString() === userId) + 1;
      participant.rank = rank;
      await quiz.save();

      const user = await User.findById(userId);
      if (user) {
        const existingHistory = user.quizHistory.find(h => h.quizId && h.quizId.toString() === quiz._id.toString());
        if (!existingHistory) {
          user.quizHistory.push({
            quizId: quiz._id,
            score: participant.score,
            date: quiz.date || new Date(),
            rank,
            correctAnswers: participant.correctAnswers,
            totalQuestions: participant.totalQuestions,
            timeSpent: participant.timeSpent
          });
          await user.save();
        } else {
          existingHistory.score = participant.score;
          existingHistory.rank = rank;
          existingHistory.correctAnswers = participant.correctAnswers;
          existingHistory.totalQuestions = participant.totalQuestions;
          existingHistory.timeSpent = participant.timeSpent;
          await user.save();
        }
      }

      socket.emit("quiz-completed", {
        score: participant.score,
        rank,
        correctAnswers: participant.correctAnswers,
        totalQuestions: participant.totalQuestions,
        timeSpent: participant.timeSpent
      });
    } catch (err) {
      console.error("complete-quiz error:", err);
      socket.emit("quiz-error", { message: "Failed to complete quiz" });
    }
  });

  socket.on("disconnect", (reason) => {
    try {

      global.onlineUsers.delete(socket.userId);

      const userId = socket.userId;
      if (userId && activeSockets.has(userId)) {
        const set = activeSockets.get(userId);
        set.delete(socket.id);
        if (set.size === 0) activeSockets.delete(userId);
      }
      console.log(`🔌 Socket disconnected: ${socket.userId} (reason: ${reason})`);
    } catch (e) {
      console.warn("socket disconnect cleanup error", e);
    }
  });

  // Error handler for socket
  socket.on("error", (error) => {
    console.error(`Socket error for user ${socket.userId}:`, error);
  });
});

// Global error handlers for unhandled rejections and exceptions
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // In production, you might want to gracefully shutdown
  // For now, just log and continue
});

// ---------------------- Scheduler & workers ----------------------
setIoInstance(io);
initializeQuizScheduler();

try {
  startDeletionWorker();
} catch (e) {
  console.warn('failed to start deletion worker', e && e.message ? e.message : e);
}

// Export io for other modules
export { io };

// ---------------------- Start server ----------------------
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`💻 PC access: http://localhost:${PORT}`);
  console.log(`📱 Mobile access: http://${localIP}:${PORT}`);
});




































// import express from "express";
// import dotenv from "dotenv";
// import cors from "cors";
// import cookieParser from "cookie-parser";
// import helmet from "helmet";
// import morgan from "morgan";
// import rateLimit from "express-rate-limit";
// import http from "http";
// import { Server as IOServer } from "socket.io";
// import jwt from "jsonwebtoken";
// import { connectDB } from "./config/db.js";
// import { notFound, globalErrorHandler } from "./middleware/errorHandler.js";
// import authRoutes from "./routes/authRoutes.js";
// import adminAuthRoutes from "./routes/adminAuthRoutes.js";
// import quizRoutes from "./routes/quizRoutes.js";
// import paymentRoutes from "./routes/paymentRoutes.js";
// import userRoutes from './routes/userRoutes.js';
// import blogRoutes from "./routes/blogRoutes.js";
// import adminRoutes from "./routes/adminRoutes.js";
// import reportRoutes from "./routes/reportRoutes.js";
// import { webhookHandler } from "./controllers/paymentController.js";
// import { initializeQuizScheduler, setIoInstance } from "./utils/quizScheduler.js";
// import { startDeletionWorker } from './utils/deletionWorker.js';
// import Quiz from "./models/Quiz.js";
// import User from "./models/User.js";

// dotenv.config();
// connectDB();

// const app = express();

// // Security middleware - Phase-1: Enhanced security headers
// app.use(helmet({
//   contentSecurityPolicy: {
//     directives: {
//       defaultSrc: ["'self'"],
//       styleSrc: ["'self'", "'unsafe-inline'"],
//       scriptSrc: ["'self'"],
//       imgSrc: ["'self'", "data:", "https:", "http://localhost:5000", "http://192.168.56.1:5000"],
//     },
//   },
//   crossOriginEmbedderPolicy: false,
//   crossOriginResourcePolicy: { policy: "cross-origin" },
//   // Phase-1: Additional security headers
//   xFrameOptions: { action: 'deny' }, // X-Frame-Options: DENY
//   xContentTypeOptions: true, // X-Content-Type-Options: nosniff
// }));

// // Rate limiting
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000,
//   max: 1000,
//   message: {
//     success: false,
//     message: 'Too many requests from this IP, please try again later.'
//   },
//   standardHeaders: true,
//   legacyHeaders: false,
// });

// app.use(limiter);

// // Stricter rate limiting for auth endpoints
// const authLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000,
//   max: 200,
//   message: {
//     success: false,
//     message: 'Too many authentication attempts, please try again later.'
//   }
// });

// // Razorpay webhook must receive raw body for signature verification
// app.post('/api/payment/webhook', express.raw({ type: 'application/json' }), webhookHandler);

// // Body parsing middleware (after webhook)
// app.use(express.json({ limit: '10mb' }));
// app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// app.use(cookieParser());

// // Logging middleware
// if (process.env.NODE_ENV === 'development') {
//   app.use(morgan('dev'));
// } else {
//   app.use(morgan('combined'));
// }

// // Get the local IP address for mobile access
// import os from 'os';
// const networkInterfaces = os.networkInterfaces();
// let localIP = 'localhost';

// for (const interfaceName in networkInterfaces) {
//   const interfaces = networkInterfaces[interfaceName];
//   for (const iface of interfaces) {
//     if (iface.family === 'IPv4' && !iface.internal) {
//       localIP = iface.address;
//       break;
//     }
//   }
//   if (localIP !== 'localhost') break;
// }

// console.log(`🌐 Local IP: ${localIP}`);
// console.log(`📱 Mobile access: http://${localIP}:3000`);

// // CORS configuration - restrict to production domains in production
// const allowedOrigins = process.env.NODE_ENV === 'production' 
//   ? [
//       process.env.FRONTEND_URL,
//       'https://dailymindeducation.com',
//       'https://www.dailymindeducation.com'
//     ].filter(Boolean)
//   : [
//       "http://localhost:3000",
//       `http://${localIP}:3000`,
//       `http://${localIP}:3001`,
//       "http://192.168.1.2:3000",
//       "http://192.168.1.2:3001",
//       process.env.FRONTEND_URL
//     ].filter(Boolean);

// app.use(cors({
//   origin: allowedOrigins,
//   credentials: true,
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
//   allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Requested-With'],
//   optionsSuccessStatus: 200
// }));

// // Serve static files from uploads directory with CORS headers
// app.use("/uploads", (req, res, next) => {
//   res.header('Access-Control-Allow-Origin', '*');
//   res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
//   res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
//   res.header('Access-Control-Allow-Credentials', 'true');
//   res.header('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
//   if (req.method === 'OPTIONS') {
//     res.sendStatus(200);
//   } else {
//     next();
//   }
// }, express.static("uploads"));

// // Health check endpoint
// app.get('/health', (req, res) => {
//   res.json({ 
//     status: 'OK', 
//     timestamp: new Date().toISOString(),
//     uptime: process.uptime(),
//     environment: process.env.NODE_ENV
//   });
// });

// // Root API endpoint
// app.get('/api', (req, res) => {
//   res.json({ 
//     message: 'Daily Mind Education API',
//     version: '1.0.0',
//     status: 'active',
//     timestamp: new Date().toISOString(),
//     endpoints: {
//       auth: '/api/auth',
//       quiz: '/api/quiz',
//       payment: '/api/payment',
//       blogs: '/api/blogs',
//       admin: '/api/admin'
//     }
//   });
// });

// // Debug endpoint to check routes
// app.get('/api/debug/routes', (req, res) => {
//   res.json({
//     routes: [
//       'POST /api/auth/send-otp',
//       'POST /api/auth/verify-otp',
//       'POST /api/auth/login',
//       'POST /api/auth/forgot-password',
//       'POST /api/auth/reset-password',
//       'POST /api/admin-auth/login',
//       'POST /api/admin-auth/forgot-password',
//       'POST /api/admin-auth/reset-password',
//     ]
//   });
// });

// // API routes
// app.use("/api/auth", authLimiter, authRoutes);
// app.use("/api/quiz", quizRoutes);
// app.use("/api/payment", paymentRoutes);
// app.use("/api/blogs", blogRoutes);
// app.use("/api", userRoutes);
// app.use("/api/reports", reportRoutes);

// // Admin routes (after CORS configuration)
// app.use("/api/admin", adminRoutes);
// app.use("/api/admin-auth", adminAuthRoutes);

// // 404 handler
// app.use(notFound);

// // Global error handler
// app.use(globalErrorHandler);

// // Create http server and socket.io
// const server = http.createServer(app);
// const io = new IOServer(server, {
//   cors: { 
//     origin: [
//       "http://localhost:3000",
//       `http://${localIP}:3000`,
//       `http://${localIP}:3001`,
//       "http://192.168.1.2:3000",
//       "http://192.168.1.2:3001",
//     ],
//     credentials: true
//   }
// });

// // Optional: Redis adapter for Socket.IO if REDIS_URL provided
// (async () => {
//   try {
//     if (process.env.REDIS_URL) {
//       const { createAdapter } = await import('@socket.io/redis-adapter');
//       const { createClient } = await import('redis');
//       const pubClient = createClient({ url: process.env.REDIS_URL });
//       const subClient = pubClient.duplicate();
//       await pubClient.connect();
//       await subClient.connect();
//       io.adapter(createAdapter(pubClient, subClient));
//       console.log('🔌 Socket.IO Redis adapter enabled');
//     }
//   } catch (e) {
//     console.warn('Redis adapter not enabled:', e.message);
//   }
// })();

// // Socket.io authentication middleware
// // const socketAuth = async (socket, next) => {
// //   try {
// //     const token = socket.handshake.auth.token;
// //     if (!token) {
// //       return next(new Error("Authentication error: No token provided"));
// //     }

// //     const decoded = jwt.verify(token, process.env.JWT_SECRET);
// //     const user = await User.findById(decoded.id).select("-password");
    
// //     if (!user) {
// //       return next(new Error("Authentication error: User not found"));
// //     }

// //     if (user.isBanned) {
// //       return next(new Error("User account is banned"));
// //     }

// //     socket.user = user;
// //     socket.userId = user._id.toString();
// //     next();
// //   } catch (error) {
// //     console.error("Socket auth error:", error.message);
// //     next(new Error("Authentication error: Invalid token"));
// //   }
// // };
// const socketAuth = async (socket, next) => {
//   try {
//     const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(" ")[1];
//     if (!token) return next(new Error("Authentication error: No token provided"));

//     let decoded;
//     try {
//       decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
//     } catch (err) {
//       return next(new Error("Authentication error: Invalid token"));
//     }

//     if (decoded.exp && Date.now() >= decoded.exp * 1000) {
//       return next(new Error("Authentication error: Token expired"));
//     }

//     const user = await User.findById(decoded.id).select("-password");
//     if (!user) return next(new Error("Authentication error: User not found"));
//     if (user.isBanned) return next(new Error("Authentication error: User banned"));

//     socket.user = user;
//     socket.userId = user._id.toString();
//     next();
//   } catch (error) {
//     console.error("Socket auth error:", error && error.message ? error.message : error);
//     next(new Error("Authentication error"));
//   }
// };



// // Track active socket connections per user per quiz
// const activeSockets = new Map(); // userId -> Set of socketIds

// io.use(socketAuth);

// // Enhanced socket.io quiz room logic with anti-cheat
// io.on("connection", (socket) => {
//   console.log(`🔌 Socket connected: ${socket.user.fullName} (${socket.userId})`);

//   socket.on("join-room", async ({ roomId, deviceId }) => {
//     try {
//       const quizId = roomId;
//       const userId = socket.userId;
      
//       // Verify quiz exists and is live
//       const quiz = await Quiz.findById(quizId);
//       if (!quiz) {
//         socket.emit("join-error", { message: "Quiz not found" });
//         return;
//       }

//       if (!quiz.isLive) {
//         socket.emit("join-error", { message: "Quiz is not live yet" });
//         return;
//       }

//       // Check payment
//       const participant = quiz.participants.find(p => 
//         p.user.toString() === userId && p.paid === true
//       );

//       if (!participant) {
//         socket.emit("join-error", { message: "You are not registered or payment not verified" });
//         return;
//       }

//       // Device enforcement (optional - lenient for development)
//       if (deviceId) {
//         const user = await User.findById(userId);
//         if (user) {
//           // Allow device ID update if not set, or if in development mode
//           // In production, you might want stricter device checking
//           if (!user.deviceId) {
//             user.deviceId = deviceId;
//             await user.save();
//           } else if (user.deviceId !== deviceId) {
//             // In development, allow device change (for testing)
//             // In production, you can uncomment the strict check below
//             if (process.env.NODE_ENV === 'production') {
//               // Strict device checking in production
//               socket.emit("join-error", { message: "Device mismatch detected. Please use the same device you registered with." });
//               return;
//             } else {
//               // Development mode: update device ID
//               console.log(`⚠️ Device ID changed for user ${userId}. Updating device ID.`);
//               user.deviceId = deviceId;
//               await user.save();
//             }
//           }
//         }
//       }

//       // Prevent multiple socket connections for same user in same quiz
//       if (!activeSockets.has(userId)) {
//         activeSockets.set(userId, new Set());
//       }

//       const userSockets = activeSockets.get(userId);
      
//       // If user already has active sockets, disconnect the old ones (allow reconnection)
//       if (userSockets.size > 0) {
//         // Disconnect old sockets for this user
//         userSockets.forEach(oldSocketId => {
//           const oldSocket = io.sockets.sockets.get(oldSocketId);
//           if (oldSocket) {
//             console.log(`⚠️ Disconnecting old socket ${oldSocketId} for user ${userId}`);
//             oldSocket.emit("force-disconnect", { 
//               message: "You connected from another device/session" 
//             });
//             oldSocket.disconnect(true);
//           }
//         });
//         // Clear old sockets
//         userSockets.clear();
//       }

//       // Add this socket
//       userSockets.add(socket.id);
//       socket.join(`quiz-${quizId}`);
      
//       // Update participant info using atomic operation to prevent VersionError
//       // Use findOneAndUpdate to avoid version conflicts when multiple sockets connect simultaneously
//       try {
//         await Quiz.findOneAndUpdate(
//           { 
//             _id: quizId,
//             'participants.user': userId
//           },
//           {
//             $set: {
//               'participants.$.socketId': socket.id,
//               'participants.$.ipAddress': socket.handshake.address,
//               'participants.$.userAgent': socket.handshake.headers['user-agent'],
//               'participants.$.lastSubmissionAt': new Date()
//             }
//           },
//           { new: true }
//         );
//       } catch (error) {
//         console.error("Join room error:", error);
//         // If update fails, try to reload quiz and retry once
//         const updatedQuiz = await Quiz.findById(quizId);
//         if (updatedQuiz) {
//           const updatedParticipant = updatedQuiz.participants.find(p => 
//             p.user.toString() === userId && p.paid === true
//           );
//           if (updatedParticipant) {
//             try {
//               await Quiz.findOneAndUpdate(
//                 { 
//                   _id: quizId,
//                   'participants.user': userId
//                 },
//                 {
//                   $set: {
//                     'participants.$.socketId': socket.id,
//                     'participants.$.ipAddress': socket.handshake.address,
//                     'participants.$.userAgent': socket.handshake.headers['user-agent'],
//                     'participants.$.lastSubmissionAt': new Date()
//                   }
//                 }
//               );
//             } catch (retryError) {
//               console.error("Retry update failed:", retryError);
//               socket.emit("join-error", { message: "Failed to join quiz. Please try again." });
//               return;
//             }
//           }
//         }
//       }

//       console.log(`✅ ${socket.user.fullName} joined room: quiz-${quizId}`);
//       socket.emit("joined", { roomId: `quiz-${quizId}` });
//       socket.to(`quiz-${quizId}`).emit("user-joined", { 
//         userId, 
//         username: socket.user.fullName 
//       });

//       // If quiz already live, emit the current question directly to this socket with correct remaining time
//       if (quiz.isLive && typeof quiz.currentQuestionIndex === 'number' && quiz.currentQuestionIndex >= 0) {
//         const idx = quiz.currentQuestionIndex;
//         const q = quiz.questions[idx];
//         if (q) {
//           const startMs = quiz.questionStartTime ? quiz.questionStartTime.getTime() : Date.now();
//           const elapsedMs = Date.now() - startMs;
//           const durationMs = (quiz.timePerQuestion || 15) * 1000;
//           const remainingMs = Math.max(0, durationMs - elapsedMs);
//           socket.emit('question', {
//             questionIndex: idx + 1, // 1-based for clients
//             totalQuestions: quiz.totalQuestions,
//             question: {
//               _id: q._id,
//               text: q.text,
//               options: q.options,
//               category: q.category,
//               points: q.points
//             },
//             timeLeft: remainingMs, // remaining time, not total duration
//             startTime: startMs, // server start time for accurate calculation
//             duration: durationMs // total duration for reference
//           });
//         }
//       }

//     } catch (error) {
//       console.error("Join room error:", error);
//       socket.emit("join-error", { message: error.message || "Failed to join quiz" });
//     }
//   });

//   // Real-time answer submission with server-side validation
//   socket.on("submit-answer", async (payload) => {
//     try {
//       const { roomId, questionId, selectedIndex } = payload;
//       const userId = socket.userId;
      
//       // Validation
//       if (!roomId || !userId || !questionId || selectedIndex === undefined) {
//         socket.emit("answer-error", { message: "Invalid answer data" });
//         return;
//       }

//       const quiz = await Quiz.findById(roomId);
//       if (!quiz) {
//         socket.emit("answer-error", { message: "Quiz not found" });
//         return;
//       }

//       if (!quiz.isLive) {
//         socket.emit("answer-error", { message: "Quiz is not live" });
//         return;
//       }

//       const participant = quiz.participants.find(p => 
//         p.user.toString() === userId && p.paid === true
//       );

//       if (!participant) {
//         socket.emit("answer-error", { message: "User not registered for this quiz" });
//         return;
//       }

//       // Check if question is still valid
//       const currentQuestionIndex = quiz.currentQuestionIndex;
//       const question = quiz.questions.find(q => q._id.toString() === questionId);
      
//       if (!question) {
//         socket.emit("answer-error", { message: "Question not found" });
//         return;
//       }

//       // Check if user already answered this question
//       const existingAnswer = participant.answers.find(a => 
//         a.questionId.toString() === questionId
//       );

//       if (existingAnswer) {
//         socket.emit("answer-error", { message: "Question already answered" });
//         return;
//       }

//       // Server-side time calculation
//       const now = Date.now();
//       const questionStartTime = quiz.questionStartTime?.getTime() || 0;
//       const timeElapsed = (now - questionStartTime) / 1000; // in seconds

//       // Reject if too late (anti-cheat: 15s + 1s buffer)
//       if (timeElapsed > quiz.timePerQuestion + 1) {
//         socket.emit("answer-error", { message: "Time limit exceeded" });
//         return;
//       }

//       // Optional anti-cheat threshold disabled to reduce false positives for fast responders

//       // Calculate score
//       const isCorrect = selectedIndex === question.correctIndex;
//       const points = isCorrect ? question.points : 0;

//       // Add answer with server timestamps
//       participant.answers.push({
//         questionId,
//         selectedIndex,
//         correct: isCorrect,
//         timeTaken: Math.round(timeElapsed),
//         points,
//         submittedAt: new Date(),
//         serverTimeReceived: new Date()
//       });

//       // Update participant stats
//       participant.score += points;
//       participant.totalQuestions += 1;
//       if (isCorrect) participant.correctAnswers += 1;
//       participant.timeSpent += Math.round(timeElapsed);
//       participant.lastSubmissionAt = new Date();

//       await quiz.save();

//       // Emit result to user
//       socket.emit("answer-result", {
//         questionId,
//         correct: isCorrect,
//         points,
//         totalScore: participant.score,
//         timeElapsed: Math.round(timeElapsed)
//       });

//       // Broadcast to other participants (without sensitive info)
//       socket.to(`quiz-${roomId}`).emit("participant-answered", {
//         userId,
//         username: socket.user.fullName
//       });

//     } catch (error) {
//       console.error("Submit answer error:", error);
//       socket.emit("answer-error", { message: "Failed to process answer" });
//     }
//   });

//   // Handle quiz completion
//   socket.on("complete-quiz", async (payload) => {
//     try {
//       const { roomId } = payload;
//       const userId = socket.userId;
      
//       const quiz = await Quiz.findById(roomId);
//       if (!quiz) {
//         socket.emit("quiz-error", { message: "Quiz not found" });
//         return;
//       }

//       const participant = quiz.participants.find(p => 
//         p.user.toString() === userId
//       );

//       if (!participant) {
//         socket.emit("quiz-error", { message: "User not registered for this quiz" });
//         return;
//       }

//       if (participant.isCompleted) {
//         socket.emit("quiz-error", { message: "Quiz already completed" });
//         return;
//       }

//       // Mark as completed
//       participant.isCompleted = true;
//       participant.endTime = new Date();

//       // Calculate rank
//       const sortedParticipants = quiz.participants
//         .filter(p => p.isCompleted)
//         .sort((a, b) => b.score - a.score || a.timeSpent - b.timeSpent);

//       const rank = sortedParticipants.findIndex(p => 
//         p.user.toString() === userId
//       ) + 1;

//       participant.rank = rank;
//       await quiz.save();

//       // Update user's quiz history
//       const user = await User.findById(userId);
//       if (user) {
//         // Check if this quiz is already in history
//         const existingHistory = user.quizHistory.find(h => 
//           h.quizId && h.quizId.toString() === quiz._id.toString()
//         );
        
//         if (!existingHistory) {
//           user.quizHistory.push({
//             quizId: quiz._id,
//             score: participant.score,
//             date: quiz.date || new Date(),
//             rank: rank,
//             correctAnswers: participant.correctAnswers,
//             totalQuestions: participant.totalQuestions,
//             timeSpent: participant.timeSpent
//           });
//           await user.save();
//         } else {
//           // Update existing history entry
//           existingHistory.score = participant.score;
//           existingHistory.rank = rank;
//           existingHistory.correctAnswers = participant.correctAnswers;
//           existingHistory.totalQuestions = participant.totalQuestions;
//           existingHistory.timeSpent = participant.timeSpent;
//           await user.save();
//         }
//       }

//       socket.emit("quiz-completed", {
//         score: participant.score,
//         rank: rank,
//         correctAnswers: participant.correctAnswers,
//         totalQuestions: participant.totalQuestions,
//         timeSpent: participant.timeSpent
//       });

//     } catch (error) {
//       console.error("Complete quiz error:", error);
//       socket.emit("quiz-error", { message: "Failed to complete quiz" });
//     }
//   });

//   // Handle disconnect
//   socket.on("disconnect", (reason) => {
//     console.log(`🔌 Socket disconnected: ${socket.userId} (reason: ${reason})`);
    
//     // Remove from active sockets
//     if (activeSockets.has(socket.userId)) {
//       const userSockets = activeSockets.get(socket.userId);
//       userSockets.delete(socket.id);
      
//       if (userSockets.size === 0) {
//         activeSockets.delete(socket.userId);
//       }
//     }
//   });
// });

// // Initialize quiz scheduler
// initializeQuizScheduler();

// // Set io instance in scheduler
// setIoInstance(io);

// // Start deletion worker (background job processor)
// try {
//   startDeletionWorker();
// } catch (e) {
//   console.warn('failed to start deletion worker', e.message || e);
// }

// // Export io for use in other modules
// export { io };

// const PORT = process.env.PORT || 5000;
// server.listen(PORT, '0.0.0.0', () => {
//   console.log(`🚀 Server running on port ${PORT}`);
//   console.log(`💻 PC access: http://localhost:${PORT}`);
//   console.log(`📱 Mobile access: http://${localIP}:${PORT}`);
// });
