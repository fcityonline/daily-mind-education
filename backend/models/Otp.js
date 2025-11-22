// backend/models/Otp.js
// MongoDB model for storing password reset OTPs with TTL (Time To Live)

import mongoose from "mongoose";

const otpSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, index: true },
    email: { type: String, sparse: true, index: true },
    otp: { type: String, required: true },
    type: { 
      type: String, 
      enum: ['sms', 'email', 'sms_reset', 'email_reset'], 
      required: true 
    },
    sessionId: { type: String }, // For SMS OTP (2factor sessionId)
    verified: { type: Boolean, default: false },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: true }
);

// Compound indexes for efficient queries
otpSchema.index({ phone: 1, type: 1, verified: 1 });
otpSchema.index({ email: 1, type: 1, verified: 1 });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

export default mongoose.model("Otp", otpSchema);

