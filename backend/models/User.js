// // // backend/models/User.js

import mongoose from "mongoose";
import bcrypt from "bcryptjs";

// Preferences schema for better structure
const preferencesSchema = new mongoose.Schema({
  notifications: {
    quizReminders: { type: Boolean, default: true },
    paymentAlerts: { type: Boolean, default: true },
    winnerAnnouncements: { type: Boolean, default: true }
  },
  language: { type: String, default: 'en' }
}, { _id: false });

const userSchema = new mongoose.Schema(
  {
    profileImage: { type: String, default: "" },
    fullName: { type: String, default: "" },
    username: { type: String, sparse: true }, // sparse avoids duplicate null
    phone: { type: String, unique: true, required: true },
    otpSessionId: { type: String, default: null },
    otpSentAt: { type: Date, default: null },
    otpAttemptCount: { type: Number, default: 0 },
    email: { type: String, sparse: true }, // optional email field
    password: { type: String, required: true },
    passwordChangedAt: { type: Date }, // Track password change timestamp
    isVerified: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },
    roles: { type: [String], default: [] },
    deviceId: { type: String, default: "" },
    payments: { type: Array, default: [] },
    tokenVersion: { type: Number, default: 0 },
    sessions: { type: Array, default: [] },
    isBanned: { type: Boolean, default: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    paidForDates: [{ type: Date }],
    quizHistory: [{
      quizId: { type: mongoose.Schema.Types.ObjectId, ref: "Quiz" },
      score: Number,
      date: Date,
      rank: Number,
      participationDate: { type: Date, default: Date.now }
    }],
    preferences: { type: preferencesSchema, default: {} }, // Nested preferences schema
  },
  { timestamps: true }
);

// Indexes for efficient queries
userSchema.index({ isBanned: 1 });
userSchema.index({ role: 1 });

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  
  const salt = await bcrypt.genSalt(12);  // bcrypt cost factor
  this.password = await bcrypt.hash(this.password, salt);

  // Update passwordChangedAt timestamp
  this.passwordChangedAt = Date.now();
  
  next();
});

// Method to compare entered password with the hashed password
userSchema.methods.matchPassword = async function (entered) {
  return bcrypt.compare(entered, this.password);
};

export default mongoose.model("User", userSchema);






// import mongoose from "mongoose";
// import bcrypt from "bcryptjs";

// const userSchema = new mongoose.Schema(
//   {
//     profileImage: { type: String, default: "" },
//     fullName: { type: String, default: "" },
//     username: { type: String, sparse: true }, // sparse avoids duplicate null
//     phone: { type: String, unique: true, required: true },
//   // 2Factor OTP session id and metadata
//   otpSessionId: { type: String, default: null },
//   otpSentAt: { type: Date, default: null },
//   otpAttemptCount: { type: Number, default: 0 },
//     email: { type: String, sparse: true }, // optional email field
//     password: { type: String, required: true },
//     isVerified: { type: Boolean, default: false },
//     emailVerified: { type: Boolean, default: false },
//     roles: { type: [String], default: [] },
//     deviceId: { type: String, default: "" },
//     payments: { type: Array, default: [] },
//     tokenVersion: { type: Number, default: 0 },
//     sessions: { type: Array, default: [] },
//     isBanned: { type: Boolean, default: false },
//     role: { type: String, enum: ['user', 'admin'], default: 'user' },
//     paidForDates: [{ type: Date }], // Track which dates user has paid for
//     quizHistory: [{ 
//       quizId: { type: mongoose.Schema.Types.ObjectId, ref: "Quiz" },
//       score: Number,
//       date: Date,
//       rank: Number,
//       participationDate: { type: Date, default: Date.now }
//     }],
//     // User preferences persisted server-side
//     preferences: {
//       notifications: {
//         quizReminders: { type: Boolean, default: true },
//         paymentAlerts: { type: Boolean, default: true },
//         winnerAnnouncements: { type: Boolean, default: true }
//       },
//       language: { type: String, default: 'en' }
//     },
//   },
//   { timestamps: true }
// );

// // Add index for efficient queries (avoid duplicates with unique: true above)
// userSchema.index({ isBanned: 1 });
// userSchema.index({ role: 1 });

// userSchema.pre("save", async function (next) {
//   if (!this.isModified("password")) return next();
//   // Phase-1: bcrypt cost factor >= 12 (security requirement)
//   const salt = await bcrypt.genSalt(12);
//   this.password = await bcrypt.hash(this.password, salt);
//   next();
// });

// userSchema.methods.matchPassword = async function (entered) {
//   return bcrypt.compare(entered, this.password);
// };

// export default mongoose.model("User", userSchema);
