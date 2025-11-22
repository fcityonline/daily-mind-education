// backend/controllers/adminController.js
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const csv = require("csv-parser");
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

import User from "../models/User.js";
import Quiz from "../models/Quiz.js";
import Payment from "../models/Payment.js";
import Report from "../models/Report.js";
import { manualStartQuiz } from "../utils/quizScheduler.js";
import Razorpay from "razorpay";

/**
 * Dashboard Statistics
 */
export const getDashboardStats = async (req, res, next) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalQuizzes = await Quiz.countDocuments();
    const bannedUsers = await User.countDocuments({ isBanned: true });
    
    // Calculate total revenue from payments
    const payments = await Payment.find({ status: 'completed', verified: true });
    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
    
    // Today's stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayUsers = await User.countDocuments({ createdAt: { $gte: today } });
    
    const pendingReports = await Report.countDocuments({ status: 'pending' });
    
    res.json({
      totalUsers,
      totalQuizzes,
      bannedUsers,
      totalRevenue,
      todayUsers,
      pendingReports
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get all users with pagination
 */
export const getAllUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, search = '', banned = false } = req.query;
    const skip = (page - 1) * limit;
    
    let query = {};
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (banned === 'true') {
      query.isBanned = true;
    }
    
    const users = await User.find(query)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await User.countDocuments(query);
    
    res.json({
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get all payments
 */
export const getPayments = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, from, to, status } = req.query;
    const skip = (page - 1) * limit;
    
    let query = {};
    
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }
    
    if (status) query.status = status;
    
    const payments = await Payment.find(query)
      .populate("user", "fullName username phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Payment.countDocuments(query);
    
    res.json({
      payments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Reconcile payments for a given date with Razorpay API
 */
export const reconcilePayments = async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ message: "date query param required (YYYY-MM-DD)" });

    const day = new Date(date);
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const end = new Date(start); end.setDate(end.getDate() + 1);

    // Local records
    const local = await Payment.find({
      createdAt: { $gte: start, $lt: end }
    }).lean();

    // Razorpay fetch (if keys present)
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.json({ message: 'Razorpay keys not configured', localOnly: true, local });
    }

    const razor = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    // Razorpay pagination: fetch first 100 payments for the date window
    const from = Math.floor(start.getTime() / 1000);
    const to = Math.floor(end.getTime() / 1000);
    const rpRes = await razor.payments.all({ from, to, count: 100 });
    const remote = rpRes?.items || [];

    // Build maps to compare by payment id
    const localByPaymentId = new Map(local.filter(x => x.razorpayPaymentId).map(x => [x.razorpayPaymentId, x]));
    const diffs = [];
    for (const r of remote) {
      const l = localByPaymentId.get(r.id);
      if (!l) {
        diffs.push({ type: 'MISSING_LOCALLY', remote: r });
      } else {
        const statusMatch = (l.status === 'completed' && r.status === 'captured') || (l.status === 'failed' && r.status === 'failed');
        if (!statusMatch) {
          diffs.push({ type: 'STATUS_MISMATCH', local: l, remote: r });
        }
      }
    }

    return res.json({ localCount: local.length, remoteCount: remote.length, diffs });
  } catch (err) {
    next(err);
  }
};

/**
 * Upload quiz CSV with validation
 * CSV Format: text, options (JSON), correctIndex, points
 */
export const uploadQuizCSV = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "CSV file required" });
    }

    const results = [];
    let rowCount = 0;
    const errors = [];

    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on("data", (data) => {
        rowCount++;
        const { question, optionA, optionB, optionC, optionD, correctAnswer, points } = data;
        
        // Validate required fields
        if (!question || !optionA || !optionB || !optionC || !optionD || !correctAnswer) {
          errors.push(`Row ${rowCount}: Missing required fields`);
          return;
        }

        const options = [optionA, optionB, optionC, optionD];
        let correctIndex = parseInt(correctAnswer);
        
        // Validate correct answer index
        if (isNaN(correctIndex) || correctIndex < 1 || correctIndex > 4) {
          errors.push(`Row ${rowCount}: Invalid correctAnswer (must be 1-4)`);
          return;
        }
        
        // Convert to 0-based index
        correctIndex = correctIndex - 1;
        
        results.push({
          text: question.trim(),
          options: options.map(opt => opt.trim()),
          correctIndex: correctIndex,
          points: parseInt(points) || 1
        });
      })
      .on("end", async () => {
        if (errors.length > 0) {
          fs.unlinkSync(req.file.path);
          return res.status(400).json({ 
            message: "CSV validation errors", 
            errors 
          });
        }

        if (results.length === 0) {
          fs.unlinkSync(req.file.path);
          return res.status(400).json({ message: "No valid questions found in CSV" });
        }

        // Validate question count
        // if (results.length !== 50) {
        //   fs.unlinkSync(req.file.path);
        //   return res.status(400).json({ 
        //     message: `Expected 50 questions, found ${results.length}` 
        //   });
        // }
        if (results.length < 5)
  return res.status(400).json({ message: `At least 5 questions required. Found ${results.length}` });


        try {
          // Create quiz with questions
          const scheduledAt = new Date();
          scheduledAt.setHours(20, 0, 0, 0); // 8 PM IST
          
          const quiz = await Quiz.create({
            title: req.body.title || `Daily Quiz - ${new Date().toISOString().split('T')[0]}`,
            description: req.body.description || "Daily Quiz",
            questions: results,
            date: scheduledAt,
            scheduledAt: scheduledAt,
            scheduleType: 'daily',
            published: false,
            totalQuestions: 50,
            timePerQuestion: 15
          });

          fs.unlinkSync(req.file.path);

          res.status(201).json({
            success: true,
            message: "Quiz created successfully",
            quiz: {
              _id: quiz._id,
              title: quiz.title,
              totalQuestions: quiz.totalQuestions,
              scheduledAt: quiz.scheduledAt,
              createdAt: quiz.createdAt
            }
          });
        } catch (createError) {
          fs.unlinkSync(req.file.path);
          next(createError);
        }
      })
      .on("error", (error) => {
        fs.unlinkSync(req.file.path);
        next(error);
      });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(err);
  }
};

/**
 * Create quiz from JSON
 */
export const createQuiz = async (req, res, next) => {
  try {
    const { title, description, questions, scheduledAt, scheduleType } = req.body;
    
    if (!title || !questions || !Array.isArray(questions)) {
      return res.status(400).json({ message: "Title and questions array required" });
    }

    if (questions.length === 0) {
      return res.status(400).json({ message: "At least one question required" });
    }

    // Validate all questions
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.text || !q.options || !Array.isArray(q.options) || q.options.length !== 4) {
        return res.status(400).json({ message: `Question ${i + 1} invalid: must have text and 4 options` });
      }
      if (typeof q.correctIndex !== 'number' || q.correctIndex < 0 || q.correctIndex > 3) {
        return res.status(400).json({ message: `Question ${i + 1}: correctIndex must be 0-3` });
      }
    }

    // Set scheduled time
    let scheduleDate = new Date();
    if (scheduledAt) {
      scheduleDate = new Date(scheduledAt);
    } else {
      scheduleDate.setHours(20, 0, 0, 0); // Default 8 PM
    }

    const quiz = await Quiz.create({
      title,
      description: description || "",
      questions,
      date: scheduleDate,
      scheduledAt: scheduleDate,
      scheduleType: scheduleType || 'one-off',
      published: false,
      totalQuestions: questions.length,
      timePerQuestion: 15
    });

    res.status(201).json({
      success: true,
      quiz: {
        _id: quiz._id,
        title: quiz.title,
        totalQuestions: quiz.totalQuestions,
        scheduledAt: quiz.scheduledAt,
        createdAt: quiz.createdAt
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get all quizzes with filters
 */
export const getAllQuizzes = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const skip = (page - 1) * limit;
    
    let query = {};
    
    if (status === 'scheduled') {
      query = { isLive: false, isCompleted: false, published: true };
    } else if (status === 'live') {
      query = { isLive: true, isCompleted: false };
    } else if (status === 'past') {
      query = { isCompleted: true };
    }
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    const quizzes = await Quiz.find(query)
      .select("-questions.correctIndex") // Don't send correct answers
      .sort({ scheduledAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Quiz.countDocuments(query);
    
    res.json({
      quizzes,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Update quiz schedule
 */
export const updateQuizSchedule = async (req, res, next) => {
  try {
    const { scheduledAt, scheduleType, published } = req.body;
    
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }

    if (scheduledAt) {
      quiz.scheduledAt = new Date(scheduledAt);
      quiz.date = quiz.scheduledAt;
    }
    
    if (scheduleType) {
      quiz.scheduleType = scheduleType;
    }
    
    if (published !== undefined) {
      quiz.published = published;
    }

    await quiz.save();

    res.json({
      success: true,
      message: "Quiz schedule updated",
      quiz: {
        _id: quiz._id,
        scheduledAt: quiz.scheduledAt,
        scheduleType: quiz.scheduleType,
        published: quiz.published
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Update quiz
 */
export const updateQuiz = async (req, res, next) => {
  try {
    const { title, description, totalQuestions, scheduledAt, scheduleType, published } = req.body;
    
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }

    // Update basic fields
    if (title) quiz.title = title;
    if (description) quiz.description = description;
    if (totalQuestions) quiz.totalQuestions = totalQuestions;
    if (scheduledAt) {
      quiz.scheduledAt = new Date(scheduledAt);
      quiz.date = quiz.scheduledAt;
    }
    if (scheduleType) quiz.scheduleType = scheduleType;
    if (published !== undefined) quiz.published = published;

    await quiz.save();

    res.json({
      success: true,
      message: "Quiz updated successfully",
      quiz: {
        _id: quiz._id,
        title: quiz.title,
        description: quiz.description,
        totalQuestions: quiz.totalQuestions,
        scheduledAt: quiz.scheduledAt,
        scheduleType: quiz.scheduleType,
        published: quiz.published
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Manual start quiz (for testing/admin)
 */
export const startQuiz = async (req, res, next) => {
  try {
    const result = await manualStartQuiz(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

/**
 * Ban user
 */
export const banUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBanned: true },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    res.json({ success: true, message: "User banned successfully", user });
  } catch (err) {
    next(err);
  }
};

/**
 * Unban user
 */
export const unbanUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBanned: false },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    res.json({ success: true, message: "User unbanned successfully", user });
  } catch (err) {
    next(err);
  }
};

/**
 * Get top winners for a specific date
 */
export const getWinners = async (req, res, next) => {
  try {
    const dateParam = req.query.date || null;
    const queryDate = dateParam ? new Date(dateParam) : new Date();
    const start = new Date(queryDate.getFullYear(), queryDate.getMonth(), queryDate.getDate());
    const end = new Date(start);
    end.setDate(start.getDate() + 1);

    const quiz = await Quiz.findOne({
      date: { $gte: start, $lt: end }
    }).populate("participants.user", "fullName username profileImage");

    if (!quiz) {
      return res.json({
        winners: [],
        message: "No quiz found for this date",
        date: queryDate
      });
    }

    const winners = quiz.participants
      .filter(p => p.isCompleted && p.paid)
      .sort((a, b) => b.score - a.score || a.timeSpent - b.timeSpent)
      .slice(0, 20)
      .map((participant, index) => ({
        rank: index + 1,
        user: {
          _id: participant.user._id,
          fullName: participant.user.fullName,
          username: participant.user.username,
          profileImage: participant.user.profileImage
        },
        score: participant.score,
        correctAnswers: participant.correctAnswers,
        totalQuestions: participant.totalQuestions,
        timeSpent: participant.timeSpent,
        accuracy: participant.totalQuestions > 0 
          ? ((participant.correctAnswers / participant.totalQuestions) * 100).toFixed(2)
          : 0
      }));

    res.json({
      winners,
      totalParticipants: quiz.participants.filter(p => p.isCompleted && p.paid).length,
      quizDate: queryDate,
      quizId: quiz._id
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get quiz details
 */
export const getQuizDetails = async (req, res, next) => {
  try {
    const quiz = await Quiz.findById(req.params.id)
      .populate("participants.user", "fullName username phone profileImage")
      .select("-questions.correctIndex");
    
    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }
    
    res.json(quiz);
  } catch (err) {
    next(err);
  }
};

/**
 * Delete quiz
 */
export const deleteQuiz = async (req, res, next) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    
    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }

    if (quiz.isLive) {
      return res.status(400).json({ message: "Cannot delete live quiz" });
    }

    await quiz.deleteOne();
    
    res.json({ success: true, message: "Quiz deleted successfully" });
  } catch (err) {
    next(err);
  }
};

/**
 * Delete user
 */
export const deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Prevent deleting admin users
    if (user.role === 'admin') {
      return res.status(400).json({ message: "Cannot delete admin users" });
    }

    await user.deleteOne();
    
    res.json({ success: true, message: "User deleted successfully" });
  } catch (err) {
    next(err);
  }
};