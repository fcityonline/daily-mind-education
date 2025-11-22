// backend/utils/notifications.js
import Quiz from '../models/Quiz.js';
import Payment from '../models/Payment.js';
import User from '../models/User.js';

/**
 * Send quiz notifications via Socket.IO to eligible users
 * Eligible users = users who have paid for today's quiz
 */
export async function sendQuizNotifications({ quizId, kind }) {
  try {
    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      console.warn(`[notifications] Quiz ${quizId} not found`);
      return;
    }

    // Find all eligible users (paid for today's quiz)
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86400000);

    const eligiblePayments = await Payment.find({
      forDate: { $gte: todayStart, $lt: todayEnd },
      status: 'completed',
      verified: true
    }).populate('user', '_id phone email fullName');

    const eligibleUserIds = eligiblePayments.map(p => p.user._id.toString());

    console.log(`[notifications] Found ${eligibleUserIds.length} eligible users for quiz ${quizId}`);

    // Notification messages based on kind
    let notification = {};
    switch (kind) {
      case '5min_before':
        notification = {
          title: '📢 Quiz Starting Soon!',
          body: 'Daily quiz starts in 5 minutes. Get ready!',
          type: 'quiz-alert',
          quizId: quizId.toString()
        };
        break;
      case '1min_before':
      case 'ready':
        notification = {
          title: '⏰ Quiz Starting Now!',
          body: 'Quiz starts in 1 minute. Join now!',
          type: 'quiz-ready',
          quizId: quizId.toString()
        };
        break;
      case 'started':
        notification = {
          title: '🚀 Quiz is Live!',
          body: 'Quiz has started. Join now to participate!',
          type: 'quiz-started',
          quizId: quizId.toString()
        };
        break;
      case 'results':
        notification = {
          title: '🏆 Quiz Results Ready!',
          body: 'Check your rank and the winners list!',
          type: 'quiz-results',
          quizId: quizId.toString()
        };
        break;
      default:
        notification = {
          title: '📢 Quiz Update',
          body: 'Check the quiz page for updates',
          type: 'quiz-update',
          quizId: quizId.toString()
        };
    }

    // Return notification data for Socket.IO emission
    // The actual emission will be done in quizScheduler.js via ioInstance
    return {
      eligibleUserIds,
      notification,
      count: eligibleUserIds.length
    };
  } catch (error) {
    console.error('[notifications] Error sending quiz notifications:', error);
    return null;
  }
}


