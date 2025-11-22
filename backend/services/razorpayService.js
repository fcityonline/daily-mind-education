// backend/services/razorpayService.js
import Razorpay from 'razorpay';
import crypto from 'crypto';

const instance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_xxx',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'rzp_test_secret'
});

async function createOrder(amountPaise, receipt) {
  const options = {
    amount: amountPaise,
    currency: 'INR',
    receipt: receipt || `rcpt_${Date.now()}`
  };
  return instance.orders.create(options);
}

function verifySignature(orderId, paymentId, signature) {
  // Verify using HMAC SHA256 of orderId|paymentId with key_secret
  const secret = process.env.RAZORPAY_KEY_SECRET || 'testsecret';
  const generated = crypto.createHmac('sha256', secret)
    .update(orderId + '|' + paymentId)
    .digest('hex');
  try {
    // Use timing-safe compare
    return crypto.timingSafeEqual(Buffer.from(generated), Buffer.from(signature));
  } catch (e) {
    return false;
  }
}

function verifyWebhookSignature(rawBody, signature) {
  // rawBody should be a string or Buffer (exact body bytes), signature from 'x-razorpay-signature' header
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET || '';
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch (e) {
    return false;
  }
}

export { createOrder, verifySignature, verifyWebhookSignature };