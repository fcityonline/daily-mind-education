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
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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
import notificationRoutes from "./routes/notificationRoutes.js";

import { webhookHandler } from "./controllers/paymentController.js";
import { initializeQuizScheduler, setIoInstance } from "./utils/quizScheduler.js";
import { startDeletionWorker } from "./utils/deletionWorker.js";

import Quiz from "./models/Quiz.js";
import User from "./models/User.js";
import { getRedisClient } from "./config/redis.js";

dotenv.config();

// ---------------------- Ensure upload directories ----------------------
const ensureUploadDirs = () => {
  const dirs = ["uploads/images", "uploads/pdfs"];
  dirs.forEach(dir => {
    const fullPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`📁 Created ${dir} directory`);
    }
  });
};
ensureUploadDirs();

// ---------------------- Connect DB ----------------------
connectDB();

// ---------------------- Express App ----------------------
const app = express();
app.set("trust proxy", 1); // for Render / Heroku

// ---------------------- Detect local IP ----------------------
const networkInterfaces = os.networkInterfaces();
let localIP = "localhost";
for (const ifName in networkInterfaces) {
  for (const iface of networkInterfaces[ifName]) {
    if (iface.family === "IPv4" && !iface.internal) {
      localIP = iface.address;
      break;
    }
  }
  if (localIP !== "localhost") break;
}
console.log(`🌐 Local IP: ${localIP}`);

// ---------------------- Security ----------------------
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: [
          "'self'",
          "data:",
          "https:",
          `http://${localIP}:5000`,
          "http://localhost:5000",
          "http://127.0.0.1:5000",
        ],
        connectSrc: ["'self'", "wss:", "https:"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "no-referrer" },
  })
);

if (process.env.NODE_ENV === "production") {
  app.use(
    hsts({
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    })
  );

  app.use((req, res, next) => {
    const proto = req.headers["x-forwarded-proto"] || req.protocol;
    if (proto !== "https") {
      const host = req.headers.host;
      return res.redirect(301, `https://${host}${req.originalUrl}`);
    }
    next();
  });
}

// ---------------------- CORS ----------------------
// const allowedOrigins =
//   process.env.NODE_ENV === "production"
//     ? [
//         process.env.FRONTEND_URL,
//         "https://dailymindeducation.com",
//         "https://www.dailymindeducation.com",
//       ].filter(Boolean)
//     : [
//         "http://localhost:3000",
//         `http://${localIP}:3000`,
//         `http://${localIP}:3001`,
//         process.env.FRONTEND_URL,
//       ].filter(Boolean);

// app.use(
//   cors({
//     origin: (origin, cb) => {
//       if (!origin) return cb(null, true);
//       if (allowedOrigins.includes(origin)) return cb(null, true);
//       return cb(new Error("CORS blocked"), false);
//     },
//     credentials: true,
//     methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
//     allowedHeaders: ["Content-Type", "Authorization", "Cookie", "X-Requested-With"],
//   })
// );
// ---------------------- CORS ----------------------
const allowedOrigins =
  process.env.NODE_ENV === "production"
    ? [
        process.env.FRONTEND_URL,  // your frontend URL (Vercel, etc.)
      ].filter(Boolean)
    : [
        "http://localhost:3000",
        `http://${localIP}:3000`,
        `http://${localIP}:3001`,
      ];

// CORS middleware for all routes
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin || "*");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Cookie, X-Requested-With"
    );
    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    );
    if (req.method === "OPTIONS") {
      // preflight request
      return res.sendStatus(204); // No Content
    }
    return next();
  } else {
    console.log("Blocked CORS Origin:", origin);
    return res.status(403).json({ success: false, message: "CORS blocked" });
  }
});


// ---------------------- Basic Middlewares ----------------------
app.use(cookieParser());
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

if (process.env.NODE_ENV === "development") app.use(morgan("dev"));
else app.use(morgan("combined"));

// ---------------------- Rate Limiting ----------------------
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.GLOBAL_RATE_LIMIT_MAX || 1000),
  message: { success: false, message: "Too many requests from this IP" },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 200),
  message: { success: false, message: "Too many auth attempts" },
  standardHeaders: true,
  legacyHeaders: false,
});

// ---------------------- Razorpay webhook ----------------------
app.post("/api/payment/webhook", express.raw({ type: "application/json" }), webhookHandler);

// JSON parser after webhook
app.use(express.json({ limit: "10mb" }));

// ---------------------- Static Uploads ----------------------
app.use(
  "/uploads",
  express.static("uploads", { setHeaders: res => res.setHeader("Cache-Control", "public, max-age=31536000") })
);
app.use("/images", express.static("uploads/images", { setHeaders: res => res.setHeader("Cache-Control", "public, max-age=31536000") }));
app.use("/pdfs", express.static("uploads/pdfs", { setHeaders: res => res.setHeader("Cache-Control", "public, max-age=604800") }));

// ---------------------- Health & debug ----------------------
app.get("/health", (req, res) => res.json({ status: "OK", timestamp: new Date().toISOString(), uptime: process.uptime() }));

app.get("/api", (req, res) => {
  res.json({
    message: "Daily Mind Education API",
    version: "1.0.0",
    status: "active",
    timestamp: new Date().toISOString(),
  });
});

// ---------------------- API Routes ----------------------
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/quiz", quizRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/blogs", blogRoutes);
app.use("/api", userRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin-auth", adminAuthRoutes);

// ---------------------- Error Handlers ----------------------
app.use(notFound);
app.use(globalErrorHandler);

// ---------------------- HTTP Server + Socket.IO ----------------------
const server = http.createServer(app);
const io = new IOServer(server, { cors: { origin: allowedOrigins, credentials: true } });

// Redis adapter
(async () => {
  try {
    if (!process.env.REDIS_URL) return;
    const pubClient = await getRedisClient();
    if (!pubClient) return;
    const { createClient } = await import("redis");
    const subClient = pubClient.duplicate ? pubClient.duplicate() : createClient({ url: process.env.REDIS_URL });
    if (!subClient.isOpen && !subClient.isReady) await subClient.connect();
    const { createAdapter } = await import("@socket.io/redis-adapter");
    io.adapter(createAdapter(pubClient, subClient));
    console.log("🔌 Socket.IO Redis adapter enabled");
  } catch (e) {
    console.warn("Redis adapter not enabled:", e.message || e);
  }
})();

// ---------------------- Socket.IO Authentication ----------------------
const socketAuth = async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || (socket.handshake.headers?.authorization?.split(" ")[1]);
    if (!token) return next(new Error("No token"));

    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    const user = await User.findById(decoded.id).select("-password");
    if (!user || user.isBanned) return next(new Error("Unauthorized"));

    socket.user = user;
    socket.userId = user._id.toString();
    next();
  } catch (err) {
    next(new Error("Unauthorized"));
  }
};
io.use(socketAuth);

// ---------------------- Active socket tracking ----------------------
const activeSockets = new Map();
global.onlineUsers = new Map();

// ---------------------- Socket.IO Events ----------------------
io.on("connection", (socket) => {
  const userId = socket.userId;
  const username = socket.user?.fullName || "unknown";
  console.log(`🔌 Socket connected: ${username} (${userId})`);
  global.onlineUsers.set(userId, socket.id);

  // live stats
  const emitLiveStats = async () => {
    try {
      const totalWaiting = await User.countDocuments({ status: "waiting" });
      const totalJoined = await User.countDocuments({ status: "joined" });
      io.emit("liveStatsUpdate", { waiting: totalWaiting, joined: totalJoined });
    } catch (err) {
      console.error("Live stats error:", err);
    }
  };
  emitLiveStats();

  // --- Quiz join ---
  socket.on("join-room", async ({ roomId, deviceId }) => {
    try {
      const quiz = await Quiz.findById(roomId);
      if (!quiz || !quiz.isLive) return socket.emit("join-error", { message: "Quiz not available" });

      const participant = quiz.participants.find(p => p.user.toString() === userId && p.paid);
      if (!participant) return socket.emit("join-error", { message: "Not registered" });

      if (deviceId) {
        const u = await User.findById(userId);
        if (u.deviceId && u.deviceId !== deviceId && process.env.NODE_ENV === "production") {
          return socket.emit("join-error", { message: "Device mismatch" });
        } else u.deviceId = deviceId;
        await u.save();
      }

      if (!activeSockets.has(userId)) activeSockets.set(userId, new Set());
      const userSockets = activeSockets.get(userId);
      userSockets.forEach(sid => {
        const oldSocket = io.sockets.sockets.get(sid);
        if (oldSocket) {
          oldSocket.emit("force-disconnect", { message: "Connected elsewhere" });
          oldSocket.disconnect(true);
        }
      });
      userSockets.clear();
      userSockets.add(socket.id);
      socket.join(`quiz-${roomId}`);

      await Quiz.findOneAndUpdate(
        { _id: roomId, "participants.user": userId },
        {
          $set: {
            "participants.$.socketId": socket.id,
            "participants.$.ipAddress": socket.handshake.address,
            "participants.$.userAgent": socket.handshake.headers["user-agent"],
            "participants.$.lastSubmissionAt": new Date(),
          },
        }
      );

      socket.emit("joined", { roomId: `quiz-${roomId}` });
      socket.to(`quiz-${roomId}`).emit("user-joined", { userId, username });

      // emit current question if quiz live
      if (quiz.currentQuestionIndex >= 0) {
        const q = quiz.questions[quiz.currentQuestionIndex];
        if (q) {
          const startMs = quiz.questionStartTime?.getTime() || Date.now();
          const elapsedMs = Date.now() - startMs;
          const durationMs = (quiz.timePerQuestion || 15) * 1000;
          socket.emit("question", { questionIndex: quiz.currentQuestionIndex + 1, totalQuestions: quiz.totalQuestions, question: q, timeLeft: Math.max(0, durationMs - elapsedMs), startTime: startMs, duration: durationMs });
        }
      }
    } catch (err) {
      socket.emit("join-error", { message: err.message || "Join failed" });
    }
  });

  // --- Submit answer ---
  socket.on("submit-answer", async ({ roomId, questionId, selectedIndex }) => {
    try {
      if (!roomId || !questionId || selectedIndex === undefined) return socket.emit("answer-error", { message: "Invalid data" });
      const quiz = await Quiz.findById(roomId);
      if (!quiz || !quiz.isLive) return socket.emit("answer-error", { message: "Quiz not live" });
      const participant = quiz.participants.find(p => p.user.toString() === userId && p.paid);
      if (!participant) return socket.emit("answer-error", { message: "Not registered" });
      const question = quiz.questions.find(q => q._id.toString() === questionId);
      if (!question) return socket.emit("answer-error", { message: "Question not found" });

      const now = Date.now();
      const timeElapsed = (now - (quiz.questionStartTime?.getTime() || 0)) / 1000;
      if (timeElapsed > quiz.timePerQuestion + 1) return socket.emit("answer-error", { message: "Time exceeded" });

      const isCorrect = selectedIndex === question.correctIndex;
      const points = isCorrect ? question.points : 0;
      const updatedQuiz = await Quiz.findOneAndUpdate(
        { _id: roomId, "participants.user": userId, "participants.answers.questionId": { $ne: questionId } },
        {
          $push: { "participants.$.answers": { questionId, selectedIndex, correct: isCorrect, points, timeTaken: Math.round(timeElapsed), submittedAt: new Date(), serverTimeReceived: new Date() } },
          $inc: { "participants.$.score": points, "participants.$.totalQuestions": 1, "participants.$.correctAnswers": isCorrect ? 1 : 0, "participants.$.timeSpent": Math.round(timeElapsed) },
          $set: { "participants.$.lastSubmissionAt": new Date() },
        },
        { new: true }
      );
      const updatedParticipant = updatedQuiz.participants.find(p => p.user.toString() === userId);
      socket.emit("answer-result", { questionId, correct: isCorrect, points, totalScore: updatedParticipant.score, timeElapsed: Math.round(timeElapsed) });
      socket.to(`quiz-${roomId}`).emit("participant-answered", { userId, username });
    } catch (err) {
      socket.emit("answer-error", { message: "Failed to submit" });
    }
  });

  // --- Complete quiz ---
  socket.on("complete-quiz", async ({ roomId }) => {
    try {
      const quiz = await Quiz.findById(roomId);
      const participant = quiz.participants.find(p => p.user.toString() === userId);
      if (!quiz || !participant) return socket.emit("quiz-error", { message: "Quiz not found" });
      if (participant.isCompleted) return socket.emit("quiz-error", { message: "Already completed" });

      participant.isCompleted = true;
      participant.endTime = new Date();
      const sorted = quiz.participants.filter(p => p.isCompleted).sort((a, b) => b.score - a.score || a.timeSpent - b.timeSpent);
      participant.rank = sorted.findIndex(p => p.user.toString() === userId) + 1;
      await quiz.save();

      const user = await User.findById(userId);
      if (user) {
        const existing = user.quizHistory.find(h => h.quizId?.toString() === quiz._id.toString());
        if (!existing) user.quizHistory.push({ quizId: quiz._id, score: participant.score, date: quiz.date || new Date(), rank: participant.rank, correctAnswers: participant.correctAnswers, totalQuestions: participant.totalQuestions, timeSpent: participant.timeSpent });
        else Object.assign(existing, { score: participant.score, rank: participant.rank, correctAnswers: participant.correctAnswers, totalQuestions: participant.totalQuestions, timeSpent: participant.timeSpent });
        await user.save();
      }

      socket.emit("quiz-completed", { score: participant.score, rank: participant.rank, correctAnswers: participant.correctAnswers, totalQuestions: participant.totalQuestions, timeSpent: participant.timeSpent });
    } catch (err) {
      socket.emit("quiz-error", { message: "Failed to complete" });
    }
  });

  // Disconnect
  socket.on("disconnect", (reason) => {
    global.onlineUsers.delete(socket.userId);
    if (activeSockets.has(userId)) {
      const set = activeSockets.get(userId);
      set.delete(socket.id);
      if (set.size === 0) activeSockets.delete(userId);
    }
    console.log(`🔌 Socket disconnected: ${userId} (${reason})`);
  });

  socket.on("error", (err) => console.error(`Socket error ${userId}:`, err));
});

// ---------------------- Scheduler & workers ----------------------
setIoInstance(io);
initializeQuizScheduler();
try { startDeletionWorker(); } catch (e) { console.warn("Deletion worker failed:", e.message || e); }

// ---------------------- Global Error Handlers ----------------------
process.on("unhandledRejection", (reason, promise) => console.error("Unhandled Rejection:", reason, promise));
process.on("uncaughtException", (err) => console.error("Uncaught Exception:", err));

// ---------------------- Start Server ----------------------
const PORT = process.env.PORT || 5000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`💻 PC access: http://localhost:${PORT}`);
  console.log(`📱 Mobile access: http://${localIP}:${PORT}`);
});

export { io };
