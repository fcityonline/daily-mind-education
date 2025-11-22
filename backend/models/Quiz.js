// backend/models/Quiz.js
import mongoose from "mongoose";

const QuestionSchema = new mongoose.Schema({
  text: String,
  options: [String], // array of 4 options
  correctIndex: Number, // store correct answer index (server-only)
  category: String, // subject/category
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
  points: { type: Number, default: 1 }
});

const ParticipantSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  score: { type: Number, default: 0 },
  totalQuestions: { type: Number, default: 0 },
  correctAnswers: { type: Number, default: 0 },
  timeSpent: { type: Number, default: 0 }, // total time in seconds
  answers: [{
    questionId: mongoose.Schema.Types.ObjectId,
    selectedIndex: Number,
    correct: Boolean,
    timeTaken: Number, // time taken for this question
    points: Number,
    submittedAt: { type: Date }, // Server timestamp
    serverTimeReceived: { type: Date } // When server received this answer
  }],
  startTime: Date,
  endTime: Date,
  isCompleted: { type: Boolean, default: false },
  rank: Number,
  paid: { type: Boolean, default: false }, // Payment verification for this quiz
  socketId: { type: String }, // Track socket connection
  ipAddress: String,
  userAgent: String,
  joinTime: { type: Date },
  lastSubmissionAt: { type: Date },
  deviceInfo: {
    userAgent: String,
    ipAddress: String,
    timestamp: Date
  }
});

const QuizSchema = new mongoose.Schema({
  title: { type: String, default: "Daily Quiz" },
  description: { type: String, default: "" },
  date: { type: Date, required: true, index: true }, // date/time for quiz
  scheduledAt: { type: Date }, // Scheduled time (8 PM IST for daily quizzes)
  startTime: Date,
  endTime: Date,
  questions: [QuestionSchema],
  participants: [ParticipantSchema],
  isLive: { type: Boolean, default: false },
  isCompleted: { type: Boolean, default: false },
  published: { type: Boolean, default: false }, // Admin can publish/unpublish
  scheduleType: { type: String, enum: ['one-off', 'daily', 'weekly'], default: 'daily' },
  totalQuestions: { type: Number, default: 50 },
  timePerQuestion: { type: Number, default: 15 }, // seconds
  maxParticipants: { type: Number, default: 2000 },
  currentParticipants: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  settings: {
    allowRetake: { type: Boolean, default: false },
    showCorrectAnswers: { type: Boolean, default: false },
    shuffleQuestions: { type: Boolean, default: true },
    shuffleOptions: { type: Boolean, default: true }
  },
  // Server-side quiz state
  currentQuestionIndex: { type: Number, default: -1 },
  questionStartTime: { type: Date },
  participantsAnswered: { type: Number, default: 0 }
});

// Index for better performance
QuizSchema.index({ date: 1, isLive: 1 });
QuizSchema.index({ 'participants.user': 1 });


// ... existing fields ...

// Add this before `export default mongoose.model("Quiz", QuizSchema);`
// QuizSchema.add({
//   winners: [
//     {
//       user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//       score: Number,
//       rank: Number,
//       totalQuestions: Number,
//       correctAnswers: Number,
//       timeSpent: Number
//     }
//   ]
// });

export default mongoose.model("Quiz", QuizSchema);
