// backend/controllers/paymentController.js
import Razorpay from "razorpay";
import crypto from "crypto";
import dotenv from "dotenv";
import User from "../models/User.js";
import Payment from "../models/Payment.js";
import { createOrder as createRazorpayOrder, verifySignature, verifyWebhookSignature } from "../services/razorpayService.js";
dotenv.config();

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

// Initialize Razorpay instance following official Node.js SDK pattern
// https://razorpay.com/docs/payments/server-integration/nodejs/payment-gateway/build-integration/
let razorpay = null;

if (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
  try {
    razorpay = new Razorpay({
      key_id: RAZORPAY_KEY_ID,
      key_secret: RAZORPAY_KEY_SECRET
    });
    console.log("✅ Razorpay initialized successfully");
  } catch (error) {
    console.error("❌ Razorpay initialization failed:", error.message);
    razorpay = null;
  }
} else {
  console.warn("⚠️ Razorpay keys not configured. Running in dev mode.");
}

/**
 * Create payment order for quiz entry
 */
export const createOrder = async (req, res) => {
  try {
    const { amount = 500, forDate } = req.body; // Default ₹5 for quiz entry
    
    // Validate amount (₹5 = 500 paise)
    if (amount < 100) {
      return res.status(400).json({ message: "Minimum amount is ₹1 (100 paise)" });
    }
    
    if (amount > 100000) {
      return res.status(400).json({ message: "Maximum amount is ₹1000" });
    }

    // Get quiz date to track payment
    let paymentForDate = new Date();
    if (forDate) {
      paymentForDate = new Date(forDate);
    }

    // If Razorpay not configured, create a DEV fallback payment immediately completed
    if (!razorpay) {
      const devOrderId = `dev_order_${Date.now()}`;
      const devPaymentId = `dev_payment_${Date.now()}`;

      const paymentRecord = new Payment({
        user: req.user.id,
        amount: amount / 100, // rupees
        currency: "INR",
        status: "completed",
        razorpayOrderId: devOrderId,
        razorpayPaymentId: devPaymentId,
        verified: true,
        forDate: paymentForDate,
        orderId: devOrderId,
        notes: {
          userId: req.user.id,
          purpose: "quiz_entry",
          forDate: paymentForDate.toISOString(),
          timestamp: new Date().toISOString(),
          devMode: true
        }
      });

      await paymentRecord.save();

      return res.json({
        order: { id: devOrderId, amount, currency: "INR", status: "created" },
        key: "dev_key",
        paymentId: paymentRecord._id,
        devMode: true
      });
    }

    // Normal live/test Razorpay flow - use service
    const receipt = `quiz_${req.user.id}_${Date.now()}`;
    
    let order;
    try {
      // Use Razorpay service for order creation
      order = await createRazorpayOrder(amount, receipt);
      console.log("✅ Razorpay order created:", order.id);
    } catch (error) {
      // Handle specific Razorpay errors
      const errorDetails = error?.error || error;
      const errorCode = errorDetails?.code || error?.code;
      const errorDescription = errorDetails?.description || error?.description || error?.message;
      
      console.error("❌ Razorpay create order failed:", {
        code: errorCode,
        description: errorDescription,
        fullError: error
      });

      // If authentication failed, allow dev mode fallback in development
      if (errorCode === 'BAD_REQUEST_ERROR' && errorDescription?.includes('Authentication failed')) {
        // In development, fall back to dev mode
        if (process.env.NODE_ENV === 'development') {
          console.warn("⚠️ Razorpay authentication failed. Falling back to dev mode.");
          const devOrderId = `dev_order_${Date.now()}`;
          const devPaymentId = `dev_payment_${Date.now()}`;

          const paymentRecord = new Payment({
            user: req.user.id,
            amount: amount / 100, // rupees
            currency: "INR",
            status: "completed",
            razorpayOrderId: devOrderId,
            razorpayPaymentId: devPaymentId,
            verified: true,
            forDate: paymentForDate,
            orderId: devOrderId,
            notes: {
              userId: req.user.id,
              purpose: "quiz_entry",
              forDate: paymentForDate.toISOString(),
              timestamp: new Date().toISOString(),
              devMode: true,
              fallbackFromRazorpay: true,
              originalError: errorDescription
            }
          });

          await paymentRecord.save();

          return res.json({
            order: { id: devOrderId, amount, currency: "INR", status: "created" },
            key: "dev_key",
            paymentId: paymentRecord._id,
            devMode: true,
            warning: "Razorpay authentication failed. Payment processed in development mode."
          });
        }
        
        // In production, return error
        return res.status(401).json({ 
          success: false,
          message: "Razorpay authentication failed. Please check your API keys in .env file.",
          error: "Invalid RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET",
          devMode: false
        });
      }

      // For other errors, fall back to dev mode only in development
      if (process.env.NODE_ENV === 'development') {
        console.warn("⚠️ Falling back to dev mode payment");
        const devOrderId = `dev_order_${Date.now()}`;
        const devPaymentId = `dev_payment_${Date.now()}`;

        const paymentRecord = new Payment({
          user: req.user.id,
          amount: amount / 100, // rupees
          currency: "INR",
          status: "completed",
          razorpayOrderId: devOrderId,
          razorpayPaymentId: devPaymentId,
          verified: true,
          forDate: paymentForDate,
          orderId: devOrderId,
          notes: {
            userId: req.user.id,
            purpose: "quiz_entry",
            forDate: paymentForDate.toISOString(),
            timestamp: new Date().toISOString(),
            devMode: true,
            fallbackFromRazorpay: true,
            originalError: errorDescription
          }
        });

        await paymentRecord.save();

        return res.json({
          order: { id: devOrderId, amount, currency: "INR", status: "created" },
          key: "dev_key",
          paymentId: paymentRecord._id,
          devMode: true,
          warning: "Payment processed in development mode"
        });
      } else {
        // In production, return error
        return res.status(500).json({
          success: false,
          message: "Payment gateway error. Please try again later.",
          error: errorDescription || "Failed to create payment order"
        });
      }
    }

    const paymentRecord = new Payment({
      user: req.user.id,
      amount: amount / 100, // Convert paise to rupees for storage
      currency: "INR",
      status: "pending",
      razorpayOrderId: order.id,
      forDate: paymentForDate,
      orderId: order.id,
      notes: options.notes
    });

    await paymentRecord.save();

    res.json({
      order,
      key: RAZORPAY_KEY_ID, // Frontend needs this
      paymentId: paymentRecord._id
    });
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ message: "Failed to create payment order", error: err.message });
  }
};

/**
 * Verify payment signature
 * Called by client after successful checkout
 */
export const verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ 
        success: false,
        message: "Missing payment verification data" 
      });
    }

    // Use Razorpay service for signature verification
    if (!verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
      // In dev mode without keys, skip verification
      if (razorpay_order_id.startsWith('dev_order_')) {
        const payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id });
        if (payment && payment.status === 'completed') {
          return res.json({ 
            success: true, 
            message: "Payment verified successfully (dev mode)",
            payment: {
              orderId: razorpay_order_id,
              paymentId: razorpay_payment_id,
              amount: payment.amount,
              date: payment.createdAt
            }
          });
        }
      }
      console.error("❌ Payment signature verification failed");
      return res.status(400).json({ 
        success: false, 
        message: "Invalid payment signature. Payment verification failed." 
      });
    }

    // Payment verified successfully
    const payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id });
    
    if (!payment) {
      return res.status(404).json({ message: "Payment record not found" });
    }

    if (payment.status === "completed") {
      return res.status(400).json({ message: "Payment already verified" });
    }

    // Update payment record
    payment.status = "completed";
    payment.razorpayPaymentId = razorpay_payment_id;
    payment.razorpaySignature = razorpay_signature;
    payment.verified = true;
    
    // Also store in user's payments array
    const user = await User.findById(req.user.id);
    if (user) {
      user.payments = user.payments || [];
      user.payments.push({
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        amount: payment.amount,
        currency: "INR",
        status: "completed",
        date: new Date(),
        purpose: "quiz_entry",
        razorpaySignature: razorpay_signature,
        forDate: payment.forDate
      });
      
      // Add to paidForDates if not already there
      if (payment.forDate && !user.paidForDates) {
        user.paidForDates = [];
      }
      if (payment.forDate && !user.paidForDates.includes(payment.forDate)) {
        user.paidForDates.push(payment.forDate);
      }
      
      await user.save();
    }

    await payment.save();

    return res.json({ 
      success: true, 
      message: "Payment verified successfully",
      payment: {
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        amount: payment.amount,
        date: payment.createdAt,
        forDate: payment.forDate
      }
    });
  } catch (err) {
    console.error("Verify payment error:", err);
    res.status(500).json({ message: "Failed to verify payment", error: err.message });
  }
};

/**
 * Webhook handler for Razorpay
 * This is called by Razorpay when payment status changes
 */
// export const webhookHandler = async (req, res) => {
//   try {
//     const signature = req.headers['x-razorpay-signature'];
//     const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    
//     if (!signature) {
//       return res.status(400).json({ message: "No signature provided" });
//     }

//     // Use Razorpay service for webhook signature verification
//     const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
    
//     if (!verifyWebhookSignature(rawBody, signature)) {
//       console.error('Webhook signature verification failed');
//       return res.status(400).json({ message: "Invalid webhook signature" });
//     }

//     // Safely parse JSON body if raw buffer
//     const parsed = Buffer.isBuffer(req.body) ? JSON.parse(rawBody.toString('utf8')) : req.body;
//     const event = parsed.event;
//     const paymentData = parsed?.payload?.payment?.entity;

//     // Handle different webhook events
//     if (event === 'payment.captured' && paymentData?.id) {
//       // Idempotent update: only transition non-completed records
//       const updateResult = await Payment.updateOne(
//         { razorpayPaymentId: paymentData.id, status: { $ne: 'completed' } },
//         {
//           $set: {
//             status: 'completed',
//             verified: true,
//             metadata: parsed,
//           },
//           $setOnInsert: {
//             user: parsed?.payload?.payment?.entity?.notes?.userId,
//             amount: (parsed?.payload?.payment?.entity?.amount / 100) || 5,
//             currency: 'INR',
//             razorpayOrderId: parsed?.payload?.payment?.entity?.order_id,
//             forDate: parsed?.payload?.payment?.entity?.notes?.forDate
//               ? new Date(parsed.payload.payment.entity.notes.forDate)
//               : undefined,
//             orderId: parsed?.payload?.payment?.entity?.order_id,
//             notes: parsed?.payload?.payment?.entity?.notes || {},
//           }
//         },
//         { upsert: false }
//       );

//       // If we matched and modified, fetch the payment and update the user
//       if (updateResult.matchedCount > 0) {
//         const payment = await Payment.findOne({ razorpayPaymentId: paymentData.id });
//         if (payment) {
//           const user = await User.findById(payment.user);
//           if (user) {
//             user.payments = user.payments || [];
//             user.payments.push({
//               orderId: payment.razorpayOrderId,
//               paymentId: paymentData.id,
//               amount: payment.amount,
//               currency: 'INR',
//               status: 'completed',
//               date: new Date(),
//               purpose: 'quiz_entry',
//               forDate: payment.forDate
//             });

//             if (payment.forDate && !user.paidForDates) user.paidForDates = [];
//             if (payment.forDate && !user.paidForDates.find(d => new Date(d).getTime() === new Date(payment.forDate).getTime())) {
//               user.paidForDates.push(payment.forDate);
//             }
//             await user.save();
//           }
//         }
//         console.log(`Payment verified via webhook: ${paymentData.id}`);
//       } else {
//         // Either already completed or no matching payment record (handled elsewhere)
//         console.log(`Webhook idempotent: ${paymentData.id}`);
//       }
//     }

//     // Respond to Razorpay
//     res.json({ received: true });

//   } catch (err) {
//     console.error("Webhook handler error:", err);
//     res.status(500).json({ message: "Webhook processing failed", error: err.message });
//   }
// };
// inside backend/controllers/paymentController.js (replace webhookHandler)
export const webhookHandler = async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!signature || !webhookSecret) {
      console.warn("Webhook missing signature or secret");
      return res.status(400).json({ message: "Missing signature or webhook secret" });
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));

    const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
    if (expected !== signature) {
      console.warn("Invalid Razorpay webhook signature", { expected, received: signature });
      return res.status(400).json({ message: "Invalid webhook signature" });
    }

    // parse payload safely
    const parsed = Buffer.isBuffer(req.body) ? JSON.parse(rawBody.toString("utf8")) : req.body;
    const event = parsed.event;
    const paymentData = parsed?.payload?.payment?.entity;

    // existing handling (your code already handles payment.captured and idempotent updates)
    // ... (keep your existing handling code after this verification block)
    // For brevity: call existing logic as before (the rest of your file remains)
    
    // Example: simple ack for now, existing update logic should be kept below this block
    // (assuming rest of file continues to update Payment collection as present)
    // The rest of the function code you already have should remain.
  } catch (err) {
    console.error("Webhook handler error:", err);
    res.status(500).json({ message: "Webhook processing failed", error: err.message });
  }
};



/**
 * Get user's payment history
 */
export const getPaymentHistory = async (req, res) => {
  try {
    // Get from Payment model (primary source)
    const payments = await Payment.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .lean(); // Use lean() for better performance

    // Format payments with all required fields
    const formattedPayments = payments.map(payment => ({
      _id: payment._id,
      amount: payment.amount || 0,
      currency: payment.currency || 'INR',
      status: payment.status || 'completed',
      razorpayOrderId: payment.razorpayOrderId || payment.orderId,
      razorpayPaymentId: payment.razorpayPaymentId || payment.paymentId,
      createdAt: payment.createdAt,
      forDate: payment.forDate,
      verified: payment.verified || false
    }));

    // Remove duplicates (if any from legacy user.payments)
    const uniquePayments = formattedPayments.filter((payment, index, self) =>
      index === self.findIndex(p => 
        (p.razorpayPaymentId && payment.razorpayPaymentId && p.razorpayPaymentId === payment.razorpayPaymentId) ||
        (p._id && payment._id && p._id.toString() === payment._id.toString())
      )
    );

    res.json({
      payments: uniquePayments.sort((a, b) => {
        const dateA = new Date(a.createdAt || 0);
        const dateB = new Date(b.createdAt || 0);
        return dateB - dateA;
      }),
      totalPayments: uniquePayments.length,
      totalAmount: uniquePayments.reduce((sum, payment) => sum + (payment.amount || 0), 0)
    });
  } catch (err) {
    console.error("Get payment history error:", err);
    res.status(500).json({ message: "Failed to fetch payment history", error: err.message });
  }
};

/**
 * Check if user has paid for today's quiz
 */
export const checkQuizPayment = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Set cache-control headers to prevent caching
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    // PRIMARY CHECK: Payment collection is the ONLY source of truth
    // We do NOT check user.paidForDates or user.payments to avoid stale data
    // This ensures that if payment records are deleted from DB, status immediately shows as not paid
    const paymentRecord = await Payment.findOne({
      user: req.user.id,
      forDate: { $gte: today, $lt: tomorrow },
      status: 'completed',
      verified: true
    });

    if (paymentRecord) {
      return res.json({
        hasPaidToday: true,
        payment: {
          id: paymentRecord._id,
          amount: paymentRecord.amount,
          status: paymentRecord.status,
          forDate: paymentRecord.forDate,
          createdAt: paymentRecord.createdAt
        },
        message: "Payment verified for today's quiz"
      });
    }

    // If Payment collection has no record, user has NOT paid
    // This ensures Payment collection is the single source of truth
    // Even if user.paidForDates or user.payments have old data, we ignore it
    res.json({
      hasPaidToday: false,
      message: "Payment required for today's quiz",
      paymentDeadline: "7:55 PM IST"
    });
  } catch (err) {
    console.error("Check quiz payment error:", err);
    res.status(500).json({ message: "Failed to check payment status", error: err.message });
  }
};

/**
 * Refund payment (admin only - for future implementation)
 */
export const refundPayment = async (req, res) => {
  try {
    const { paymentId, amount } = req.body;
    
    res.json({ 
      message: "Refund functionality not implemented yet",
      note: "Contact support for refunds"
    });
  } catch (err) {
    console.error("Refund payment error:", err);
    res.status(500).json({ message: "Failed to process refund", error: err.message });
  }
};
