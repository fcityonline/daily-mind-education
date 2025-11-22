// backend/models/Payment.js
import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "INR",
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
    },
    paymentMethod: {
      type: String, default: "razorpay"
    },
    // Razorpay specific fields
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String, unique: true, sparse: true },
    razorpaySignature: { type: String },
    verified: { type: Boolean, default: false }, // Whether webhook verified
    forDate: { type: Date }, // Which quiz date this payment is for
    orderId: {
      type: String,
    },
    transactionId: {
      type: String,
    },
    // Additional metadata
    notes: { type: Object },
    metadata: { type: Object } // Store raw webhook payload
  },
  { timestamps: true }
);

// Indexes for efficient queries
paymentSchema.index({ user: 1, status: 1 });
paymentSchema.index({ razorpayOrderId: 1 });
paymentSchema.index({ razorpayPaymentId: 1 });
paymentSchema.index({ forDate: 1 });

const Payment = mongoose.model("Payment", paymentSchema);
export default Payment;
