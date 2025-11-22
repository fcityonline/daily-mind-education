// backend/utils/quizScheduler.js
import cron from 'node-cron';
import Quiz from '../models/Quiz.js';
import { initQuizQueue, registerQuizWorkers, scheduleDailyQuizJobsForDate } from './jobs.js';

// Active quiz sessions map: quizId -> { questionIndex, questionStartTime, interval }
const activeQuizSessions = new Map();
let ioInstance = null;

// Set io instance from server
export const setIoInstance = (io) => {
  ioInstance = io;
};

/**
 * Schedule quizzes to start at specified times
 * For daily quizzes, schedule at 8:00 PM IST (2:30 PM UTC)
 */
// export const initializeQuizScheduler = () => {
//   console.log('📅 Quiz Scheduler initialized');
//   if (process.env.REDIS_URL) {
//     // Use BullMQ jobs on Redis
//     const queue = initQuizQueue();
//     registerQuizWorkers(ioInstance);
//     console.log('✅ Scheduler active via BullMQ');
//   } else {
//     // Fallback to node-cron schedule in single instance with timezone
//     // Quiz alert at 7:55 PM IST - 5 minutes before
//     cron.schedule('55 19 * * *', async () => {
//       console.log('🔔 Scheduled: Quiz alert at 7:55 PM IST (5 minutes before)');
//       await emitQuizAlertEvent('5min_before');
//     }, {
//       timezone: 'Asia/Kolkata'
//     });

//     // Quiz ready event at 7:59 PM IST - 1 minute before
//     cron.schedule('59 19 * * *', async () => {
//       console.log('🔔 Scheduled: Quiz ready event at 7:59 PM IST');
//       await emitQuizReadyEvent();
//     }, {
//       timezone: 'Asia/Kolkata'
//     });

//     // Daily quiz at 8:00 PM IST
//     cron.schedule('0 20 * * *', async () => {
//       console.log('🎯 Scheduled: Starting daily quiz at 8 PM IST');
//       await startScheduledQuiz();
//     }, {
  //       timezone: 'Asia/Kolkata'
  //     });
  
  //     // Quiz end and results at 8:31 PM IST
  //     cron.schedule('31 20 * * *', async () => {
    //       console.log('🏁 Scheduled: Finalizing quiz results at 8:31 PM IST');
    //       await finalizeQuizResults();
    //     }, {
      //       timezone: 'Asia/Kolkata'
      //     });
      //     console.log('✅ Scheduler active - Daily quiz scheduled for 8:00 PM IST');
      //     console.log('   - 7:55 PM: 5-minute alert');
      //     console.log('   - 7:59 PM: 1-minute ready');
      //     console.log('   - 8:00 PM: Quiz start');
      //     console.log('   - 8:31 PM: Results finalized');
      //   }
      // };
// Track if scheduler is initialized to prevent double initialization
let schedulerInitialized = false;

export const initializeQuizScheduler = () => {
  if (schedulerInitialized) {
    console.warn('⚠️ Quiz Scheduler already initialized, skipping...');
    return;
  }
  
  console.log('📅 Quiz Scheduler initialized');

  // Check Redis health
  const useRedis = process.env.REDIS_URL && process.env.USE_BULLMQ !== 'false';
  let redisHealthy = false;

  if (useRedis) {
    // Test Redis connection
    import('../config/redis.js').then(async ({ isRedisHealthy }) => {
      redisHealthy = await isRedisHealthy();
      if (redisHealthy) {
        try {
          const queue = initQuizQueue();
          if (queue) {
            registerQuizWorkers(ioInstance);
            console.log('✅ Scheduler active via BullMQ (Redis)');
          }
        } catch (err) {
          console.warn('⚠️ BullMQ initialization failed, falling back to cron:', err.message);
          redisHealthy = false;
        }
      } else {
        console.warn('⚠️ Redis not healthy, falling back to cron');
      }
    }).catch(err => {
      console.warn('⚠️ Redis health check failed, using cron:', err.message);
      redisHealthy = false;
    });
  }

  // Schedule cron jobs ONLY if Redis is not available or USE_BULLMQ is false
  // This prevents double scheduling
  if (!useRedis || !redisHealthy) {
    console.log('📅 Using cron-based scheduling (Redis unavailable or disabled)');
    
    cron.schedule('55 19 * * *', async () => {
      console.log('🔔 7:55 PM alert - 5min before quiz');
      await emitQuizAlertEvent('5min_before');
    }, { timezone: 'Asia/Kolkata' });

    cron.schedule('59 19 * * *', async () => {
      console.log('🔔 7:59 PM ready event');
      await emitQuizReadyEvent();
    }, { timezone: 'Asia/Kolkata' });

    cron.schedule('0 20 * * *', async () => {
      console.log('🎯 8:00 PM quiz start');
      await startScheduledQuiz();
    }, { timezone: 'Asia/Kolkata' });

    cron.schedule('31 20 * * *', async () => {
      console.log('🏁 8:31 PM finalize results');
      await finalizeQuizResults();
    }, { timezone: 'Asia/Kolkata' });

    console.log('✔ Daily cron schedule enabled');
  } else {
    console.log('✔ BullMQ scheduling enabled (cron disabled to prevent duplication)');
  }

  schedulerInitialized = true;
};




/**
 * Emit quiz alert event (5 minutes before start)
 */
export const emitQuizAlertEvent = async (kind = '5min_before') => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const quiz = await Quiz.findOne({
      date: { $gte: today, $lt: new Date(today.getTime() + 86400000) },
      published: true,
      isLive: false,
      isCompleted: false
    });

    if (!quiz) {
      console.log('ℹ️ No quiz found for alert event');
      return;
    }

    // Get eligible users and send notifications
    const { sendQuizNotifications } = await import('./notifications.js');
    const notifyData = await sendQuizNotifications({ quizId: quiz._id, kind });

    if (ioInstance && notifyData) {
      const alertEvent = {
        quizId: quiz._id.toString(),
        message: 'Quiz starting in 5 minutes! Make sure you are ready!',
        notification: notifyData.notification
      };

      ioInstance.emit('quiz-alert', alertEvent);

      // Send personal notifications to eligible users
      notifyData.eligibleUserIds.forEach(userId => {
        ioInstance.to(`user-${userId}`).emit('quiz-alert-personal', alertEvent);
      });
      
      console.log(`📢 Quiz alert sent to ${notifyData.count} eligible users`);
    }
  } catch (error) {
    console.error('❌ Error emitting quiz alert:', error);
  }
};

/**
 * Finalize quiz results after quiz ends
 */
export const finalizeQuizResults = async () => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const quiz = await Quiz.findOne({
      date: { $gte: today, $lt: new Date(today.getTime() + 86400000) },
      isLive: true
    });

    if (!quiz) {
      console.log('ℹ️ No active quiz found for finalization');
      return;
    }

    // Calculate final winners (top 20)
    const winners = quiz.participants
      .filter(p => p.isCompleted)
      .sort((a, b) => {
        // Sort by score (desc), then by time (asc) - fastest wins on tie
        if (b.score !== a.score) return b.score - a.score;
        return (a.timeSpent || 0) - (b.timeSpent || 0);
      })
      .slice(0, 20)
      .map((participant, index) => ({
        rank: index + 1,
        userId: participant.user,
        score: participant.score,
        correctAnswers: participant.correctAnswers,
        totalQuestions: participant.totalQuestions,
        timeSpent: participant.timeSpent,
        accuracy: participant.totalQuestions > 0 
          ? ((participant.correctAnswers / participant.totalQuestions) * 100).toFixed(2)
          : 0
      }));

    // Mark quiz as completed
    quiz.status = "ended";
    quiz.isLive = false;
    quiz.isCompleted = true;
    quiz.endTime = new Date();
    await quiz.save();

    // Send results notifications
    const { sendQuizNotifications } = await import('./notifications.js');
    const notifyData = await sendQuizNotifications({ quizId: quiz._id, kind: 'results' });

    if (ioInstance) {
      ioInstance.emit('quiz-results-ready', {
        quizId: quiz._id.toString(),
        winners: winners.slice(0, 10), // Top 10 for broadcast
        totalParticipants: quiz.participants.filter(p => p.isCompleted).length,
        notification: notifyData?.notification
      });

      if (notifyData) {
        notifyData.eligibleUserIds.forEach(userId => {
          ioInstance.to(`user-${userId}`).emit('quiz-results-personal', {
            quizId: quiz._id.toString(),
            winners,
            notification: notifyData.notification
          });
        });
      }
    }

    console.log(`🏆 Quiz results finalized. Top ${winners.length} winners calculated.`);
  } catch (error) {
    console.error('❌ Error finalizing quiz results:', error);
  }
};

/**
 * Emit quiz ready event (1 minute before start)
 * Also sends notifications to eligible paid users
 */
export const emitQuizReadyEvent = async () => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Find quiz for today
    const quiz = await Quiz.findOne({
      date: { $gte: today, $lt: new Date(today.getTime() + 86400000) },
      published: true,
      isLive: false,
      isCompleted: false
    });

    if (!quiz) {
      console.log('ℹ️ No quiz found for ready event');
      return;
    }

    // Get eligible users and send notifications
    const { sendQuizNotifications } = await import('./notifications.js');
    const notifyData = await sendQuizNotifications({ quizId: quiz._id, kind: 'ready' });

    // Emit ready event to all connected users via Socket.IO
    if (ioInstance) {
      const readyEvent = {
        quizId: quiz._id.toString(),
        startsAt: new Date(today.getTime() + 20 * 60 * 60 * 1000), // 8 PM today
        message: 'Quiz starting in 1 minute! Join now!',
        totalQuestions: quiz.totalQuestions,
        timePerQuestion: quiz.timePerQuestion,
        notification: notifyData?.notification
      };

      // Emit to all users (for frontend display)
      ioInstance.emit('quiz-ready', readyEvent);

      // Also emit to specific eligible users if we have their socket IDs
      if (notifyData && notifyData.eligibleUserIds) {
        notifyData.eligibleUserIds.forEach(userId => {
          ioInstance.to(`user-${userId}`).emit('quiz-ready-personal', readyEvent);
        });
        console.log(`📢 Quiz ready notifications sent to ${notifyData.count} eligible users`);
      }

      console.log('📢 Quiz ready event emitted to all participants');
    }
  } catch (error) {
    console.error('❌ Error emitting quiz ready event:', error);
  }
};

/**
 * Shuffle questions array and update correctIndex accordingly
 * This ensures questions are randomized before quiz starts (anti-cheat measure)
 */
export function shuffleQuestions(questions) {
  if (!questions || questions.length === 0) return questions;
  
  // Create a copy and shuffle using Fisher-Yates algorithm
  const shuffled = [...questions];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  // Also shuffle options within each question and update correctIndex
  shuffled.forEach((question) => {
    if (!question.options || question.options.length === 0) return;
    
    // Store original correct answer
    const originalCorrectIndex = question.correctIndex;
    const originalCorrectAnswer = question.options[originalCorrectIndex];
    
    // Shuffle options
    const shuffledOptions = [...question.options];
    for (let i = shuffledOptions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledOptions[i], shuffledOptions[j]] = [shuffledOptions[j], shuffledOptions[i]];
    }
    
    // Find new correct index after shuffling
    question.options = shuffledOptions;
    question.correctIndex = shuffledOptions.findIndex(opt => opt === originalCorrectAnswer);
  });
  
  return shuffled;
}

/**
 * Start a scheduled quiz
 */
export const startScheduledQuiz = async () => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Find quiz for today that's scheduled but not live yet
    const quiz = await Quiz.findOne({
      date: { $gte: today, $lt: new Date(today.getTime() + 86400000) },
      isLive: false,
      published: true
    });

    if (!quiz) {
      console.log('ℹ️ No quiz scheduled for today');
      return;
    }

    // Check if quiz is already being started (prevent race conditions)
    if (quiz.isLive) {
      console.log('⚠️ Quiz already live, skipping start');
      return;
    }

    // Shuffle questions before starting (anti-cheat measure)
    if (quiz.settings?.shuffleQuestions && quiz.questions && quiz.questions.length > 0) {
      console.log('🔀 Shuffling quiz questions for fairness...');
      quiz.questions = shuffleQuestions(quiz.questions);
      await quiz.save();
      console.log(`✅ Quiz questions shuffled. Total: ${quiz.questions.length}`);
    }

    // Send notifications for quiz start
    const { sendQuizNotifications } = await import('./notifications.js');
    const notifyData = await sendQuizNotifications({ quizId: quiz._id, kind: 'started' });
    if (notifyData && ioInstance) {
      notifyData.eligibleUserIds.forEach(userId => {
        ioInstance.to(`user-${userId}`).emit('quiz-started-personal', {
          quizId: quiz._id.toString(),
          message: 'Quiz is now live! Join now!'
        });
      });
    }

    // Check if using BullMQ (Redis-based scheduling)
    const useBullMQ = process.env.REDIS_URL && process.env.USE_BULLMQ !== 'false';
    
    if (useBullMQ) {
      // For BullMQ, the START job will handle quiz start
      // Just ensure jobs are scheduled (they should already be scheduled)
      const { initQuizQueue, scheduleDailyQuizJobsForDate } = await import('./jobs.js');
      const queue = initQuizQueue();
      if (queue) {
        // Jobs should already be scheduled, but verify
        console.log(`🧰 Using BullMQ for quiz ${quiz._id} - START job will handle quiz start`);
      } else {
        // Fallback to direct start if queue not available
        console.warn('⚠️ BullMQ queue not available, starting quiz directly');
        await startQuizDirectly(quiz);
      }
    } else {
      // Direct start for cron-based scheduling
      await startQuizDirectly(quiz);
    }
  } catch (error) {
    console.error('❌ Error starting scheduled quiz:', error);
  }
};

/**
 * Start quiz directly (for cron-based scheduling)
 */
async function startQuizDirectly(quiz) {
  try {
    // Use atomic update to prevent race conditions
    const updatedQuiz = await Quiz.findOneAndUpdate(
      { _id: quiz._id, isLive: false },
      {
        $set: {
          status: "live",
          isLive: true,
          published: true,
          startTime: new Date(),
          currentQuestionIndex: 0
        }
      },
      { new: true }
    );

    if (!updatedQuiz) {
      console.warn('⚠️ Quiz already started or not found');
      return;
    }

    console.log(`🚀 Quiz started: ${updatedQuiz._id}`);
    
    // Start quiz session
    await startQuizSession(updatedQuiz);
    
    // Emit socket event
    if (ioInstance) {
      ioInstance.to(`quiz-${updatedQuiz._id}`).emit('quiz-started', {
        quizId: updatedQuiz._id.toString(),
        startTime: updatedQuiz.startTime,
        totalQuestions: updatedQuiz.totalQuestions,
        timePerQuestion: updatedQuiz.timePerQuestion
      });
    }
  } catch (error) {
    console.error('❌ Error in startQuizDirectly:', error);
    throw error;
  }
}

/**
 * Start quiz session with real-time question emission
 */
export const startQuizSession = async (quiz) => {
  const quizId = quiz._id.toString();
  
  if (activeQuizSessions.has(quizId)) {
    console.log(`⚠️ Quiz ${quizId} already has active session`);
    return;
  }

  // Reload quiz to get latest state
  let currentQuiz = await Quiz.findById(quizId);
  if (!currentQuiz) {
    console.error(`❌ Quiz ${quizId} not found`);
    return;
  }

  if (!currentQuiz.questions || currentQuiz.questions.length === 0) {
    console.error(`❌ Quiz ${quizId} has no questions`);
    return;
  }

  let questionIndex = currentQuiz.currentQuestionIndex >= 0 ? currentQuiz.currentQuestionIndex : 0;
  let perSecondInterval = null;
  let currentTimer = null;

  const emitNextQuestion = async () => {
    try {
      // Reload quiz state to ensure we have latest data
      currentQuiz = await Quiz.findById(quizId);
      if (!currentQuiz || !currentQuiz.isLive) {
        console.log(`⚠️ Quiz ${quizId} no longer live, stopping session`);
        activeQuizSessions.delete(quizId);
        return;
      }

      if (!currentQuiz.questions || questionIndex >= currentQuiz.questions.length) {
        // End quiz
        console.log(`🏁 Quiz ${quizId} completed - all questions answered`);
        await endQuizSession(currentQuiz);
        return;
      }

      const currentQuestion = currentQuiz.questions[questionIndex];
      if (!currentQuestion) {
        console.error(`❌ Question at index ${questionIndex} not found`);
        questionIndex++;
        setTimeout(emitNextQuestion, 1000);
        return;
      }

      const questionStartTime = Date.now();
      const durationMs = currentQuiz.timePerQuestion * 1000; // Convert to milliseconds

      // Update quiz state atomically
      try {
        await Quiz.findByIdAndUpdate(
          quizId,
          {
            $set: {
              currentQuestionIndex: questionIndex,
              questionStartTime: new Date(questionStartTime)
            }
          },
          { new: true }
        );
      } catch (e) {
        console.warn('Failed to persist questionStartTime', e.message);
      }
      
      // Emit question to all participants
      if (ioInstance) {
        ioInstance.to(`quiz-${quizId}`).emit('question', {
          questionIndex: questionIndex + 1,
          totalQuestions: currentQuiz.totalQuestions,
          question: {
            _id: currentQuestion._id,
            text: currentQuestion.text,
            options: currentQuestion.options,
            category: currentQuestion.category,
            points: currentQuestion.points
          },
          timeLeft: durationMs, // remaining time (full duration for new question)
          startTime: questionStartTime, // server start time
          duration: durationMs // total duration for reference
        });
      }

      console.log(`📝 Question ${questionIndex + 1}/${currentQuiz.totalQuestions} emitted for quiz ${quizId}`);

      // Clear any prior per-second emitter
      if (perSecondInterval) clearInterval(perSecondInterval);

      // Emit per-second remaining time to room for smoother client countdowns
      perSecondInterval = setInterval(() => {
        const remainingMs = Math.max(0, questionStartTime + durationMs - Date.now());
        const remaining = Math.ceil(remainingMs / 1000);
        if (ioInstance && remaining >= 0) {
          ioInstance.to(`quiz-${quizId}`).emit('time-left', { 
            questionIndex: questionIndex + 1, 
            remaining 
          });
        }
        if (remaining <= 0 && perSecondInterval) {
          clearInterval(perSecondInterval);
          perSecondInterval = null;
        }
      }, 1000);

      // Schedule next question after timePerQuestion
      if (currentTimer) clearTimeout(currentTimer);
      currentTimer = setTimeout(() => {
        questionIndex++;
        emitNextQuestion();
      }, durationMs);

      // Store session info
      activeQuizSessions.set(quizId, {
        questionIndex,
        questionStartTime,
        timer: currentTimer,
        perSecondInterval
      });
    } catch (error) {
      console.error(`❌ Error in emitNextQuestion for quiz ${quizId}:`, error);
      // Try to continue with next question after a delay
      questionIndex++;
      setTimeout(emitNextQuestion, 2000);
    }
  };

  // Start with first question
  await emitNextQuestion();
};

/**
 * End quiz session
 */
export const endQuizSession = async (quiz) => {
  const quizId = quiz._id.toString();
  
  console.log(`🏁 Quiz ${quizId} ended`);
  
  // Clear session
  const session = activeQuizSessions.get(quizId);
  if (session?.timer) {
    clearTimeout(session.timer);
  }
  if (session?.perSecondInterval) {
    clearInterval(session.perSecondInterval);
  }
  activeQuizSessions.delete(quizId);

  try {
    // Reload quiz to get latest state
    const currentQuiz = await Quiz.findById(quizId);
    if (!currentQuiz) {
      console.error(`❌ Quiz ${quizId} not found when ending session`);
      return;
    }

    // Mark all participants as completed and calculate final ranks
    const participants = currentQuiz.participants.filter(p => p.paid);
    
    // Sort participants by score (desc) then time (asc) for ranking
    const sortedParticipants = [...participants].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.timeSpent || 0) - (b.timeSpent || 0);
    });

    // Update participants with ranks using atomic operations
    const updatePromises = sortedParticipants.map((participant, index) => {
      return Quiz.findOneAndUpdate(
        { _id: quizId, 'participants._id': participant._id },
        {
          $set: {
            'participants.$.isCompleted': true,
            'participants.$.rank': index + 1,
            'participants.$.endTime': participant.endTime || new Date()
          }
        }
      );
    });

    await Promise.all(updatePromises);

    // Mark quiz as completed using atomic update
    await Quiz.findByIdAndUpdate(
      quizId,
      {
        $set: {
          status: "ended",
          isLive: false,
          isCompleted: true,
          endTime: new Date()
        }
      }
    );

    // Reload for user history updates
    const finalQuiz = await Quiz.findById(quizId);

    // Update user quiz history for all participants
    const { default: User } = await import('../models/User.js');
    for (const participant of sortedParticipants) {
      try {
        const user = await User.findById(participant.user);
        if (user) {
          // Check if this quiz is already in history
          const existingHistory = user.quizHistory.find(h => 
            h.quizId && h.quizId.toString() === finalQuiz._id.toString()
          );
          
          if (!existingHistory) {
            user.quizHistory.push({
              quizId: finalQuiz._id,
              score: participant.score,
              date: finalQuiz.date || new Date(),
              rank: participant.rank,
              correctAnswers: participant.correctAnswers,
              totalQuestions: participant.totalQuestions,
              timeSpent: participant.timeSpent
            });
            await user.save();
          }
        }
      } catch (err) {
        console.warn(`Failed to update quiz history for user ${participant.user}:`, err);
      }
    }

    // Notify all participants
    if (ioInstance) {
      ioInstance.to(`quiz-${quizId}`).emit('quiz-ended', {
        quizId,
        endTime: finalQuiz.endTime,
        totalParticipants: finalQuiz.participants.length,
        winners: sortedParticipants.slice(0, 20).map((p, idx) => ({
          rank: idx + 1,
          userId: p.user,
          score: p.score,
          correctAnswers: p.correctAnswers,
          totalQuestions: p.totalQuestions,
          timeSpent: p.timeSpent
        }))
      });
    }
  } catch (error) {
    console.error(`❌ Error ending quiz session ${quizId}:`, error);
    throw error;
  }
};

/**
 * Manually start a quiz (for admin)
 */
export const manualStartQuiz = async (quizId) => {
  try {
    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      throw new Error('Quiz not found');
    }
    
    if (quiz.isLive) {
      throw new Error('Quiz already live');
    }

    // Shuffle questions before starting (anti-cheat measure)
    if (quiz.settings.shuffleQuestions && quiz.questions && quiz.questions.length > 0) {
      console.log('🔀 Shuffling quiz questions for fairness...');
      quiz.questions = shuffleQuestions(quiz.questions);
      console.log(`✅ Quiz questions shuffled. Total: ${quiz.questions.length}`);
    }

    quiz.status = "live";
    quiz.isLive = true;
    quiz.published = true; // Set published when quiz goes live
    quiz.startTime = new Date();
    quiz.currentQuestionIndex = 0;
    await quiz.save();

    startQuizSession(quiz);
    
    return { success: true, message: 'Quiz started successfully' };
  } catch (error) {
    console.error('Error manually starting quiz:', error);
    throw error;
  }
};

/**
 * Get active session info
 */
export const getActiveSession = (quizId) => {
  return activeQuizSessions.get(quizId);
};

export default {
  initializeQuizScheduler,
  startScheduledQuiz,
  startQuizSession,
  endQuizSession,
  manualStartQuiz,
  getActiveSession
};

