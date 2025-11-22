// backend/utils/jobs.js
import { Queue, Worker } from 'bullmq';
import Quiz from '../models/Quiz.js';
import { startQuizSession, endQuizSession } from './quizScheduler.js';
import { sendQuizNotifications } from './notifications.js';

const connection = process.env.REDIS_URL ? { connection: { url: process.env.REDIS_URL } } : null;

export const QUIZ_QUEUE_NAME = 'quiz-lifecycle';

export let quizQueue = null;
export function initQuizQueue() {
  if (!process.env.REDIS_URL) return null;
  if (quizQueue) return quizQueue;
  // QueueScheduler was removed in BullMQ v4+ - delayed jobs are handled automatically
  quizQueue = new Queue(QUIZ_QUEUE_NAME, connection);
  return quizQueue;
}

let workerInstance = null;

export function registerQuizWorkers(io) {
  if (!process.env.REDIS_URL) {
    console.warn('[jobs] Redis not available, workers not registered');
    return;
  }
  
  if (workerInstance) {
    console.warn('[jobs] Worker already registered, skipping...');
    return;
  }

  try {
    workerInstance = new Worker(QUIZ_QUEUE_NAME, async (job) => {
      try {
        const { type } = job.data;
        console.log(`[jobs] Processing job: ${type}`, job.id);
        
        if (type === 'ALERT_5MIN') {
          const { quizId } = job.data;
          await sendQuizNotifications({ quizId, kind: '5min_before' });
        }
        
        if (type === 'READY_NOTIFY') {
          const { quizId } = job.data;
          await sendQuizNotifications({ quizId, kind: 'ready' });
        }
        
        if (type === 'START') {
          const { quizId } = job.data;
          const quiz = await Quiz.findById(quizId);
          if (!quiz) {
            console.error(`[jobs] Quiz not found: ${quizId}`);
            throw new Error(`Quiz ${quizId} not found`);
          }
          
          if (quiz.isLive) {
            console.warn(`[jobs] Quiz ${quizId} already live, skipping start`);
            return;
          }
          
          // Shuffle questions before starting
          if (quiz.settings?.shuffleQuestions && quiz.questions && quiz.questions.length > 0) {
            const { shuffleQuestions } = await import('./quizScheduler.js');
            quiz.questions = shuffleQuestions(quiz.questions);
            console.log(`🔀 Quiz questions shuffled for quiz ${quizId}`);
          }
          
          // Mark quiz as live and start session
          quiz.status = "live";
          quiz.isLive = true;
          quiz.published = true;
          quiz.startTime = new Date();
          quiz.currentQuestionIndex = 0;
          await quiz.save();
          
          console.log(`🚀 Starting quiz session for ${quizId}`);
          await startQuizSession(quiz);
          
          // Emit socket event if io available
          if (io) {
            io.to(`quiz-${quizId}`).emit('quiz-started', {
              quizId: quiz._id.toString(),
              startTime: quiz.startTime,
              totalQuestions: quiz.totalQuestions,
              timePerQuestion: quiz.timePerQuestion
            });
          }
        }
        
        if (type === 'END') {
          const { quizId } = job.data;
          const quiz = await Quiz.findById(quizId);
          if (quiz && quiz.isLive) {
            await endQuizSession(quiz);
          }
        }
        
        if (type === 'RESULT_ANNOUNCE') {
          const { quizId } = job.data;
          await sendQuizNotifications({ quizId, kind: 'results' });
          // Also finalize results
          const { finalizeQuizResults } = await import('./quizScheduler.js');
          await finalizeQuizResults();
        }
        
        console.log(`[jobs] Job ${type} completed successfully`);
      } catch (error) {
        console.error(`[jobs] Job processing error:`, error);
        throw error; // Re-throw to mark job as failed
      }
    }, {
      ...connection,
      concurrency: 1, // Process one job at a time for quiz lifecycle
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 }
    });

    // Worker event handlers
    workerInstance.on('completed', (job) => {
      console.log(`[jobs] Job ${job.id} (${job.data.type}) completed`);
    });

    workerInstance.on('failed', (job, err) => {
      console.error(`[jobs] Job ${job?.id} (${job?.data?.type}) failed:`, err.message);
    });

    workerInstance.on('error', (err) => {
      console.error('[jobs] Worker error:', err);
    });

    console.log('✅ BullMQ worker registered');
  } catch (error) {
    console.error('[jobs] Failed to register worker:', error);
    workerInstance = null;
  }
}

export async function scheduleDailyQuizJobsForDate(date, quizId) {
  if (!quizQueue) return;
  const base = new Date(date);
  // Times in IST
  const IST = 5.5 * 60 * 60 * 1000;
  const d = new Date(base.getTime());
  const setIST = (h, m) => new Date(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0)).getTime() + IST + (h * 60 + m) * 60000);
  const tAlert5min = setIST(19, 55); // 5 minutes before
  const tReady = setIST(19, 59); // 1 minute before
  const tStart = setIST(20, 0); // Quiz start
  const tEnd = setIST(20, 30); // Quiz end
  const tAnnounce = setIST(20, 31); // Results

  const opts = { removeOnComplete: true, removeOnFail: true };
  
  // Schedule all notification and quiz lifecycle events
  await quizQueue.add('ALERT_5MIN', { type: 'ALERT_5MIN', quizId }, { ...opts, delay: Math.max(0, tAlert5min.getTime() - Date.now()) });
  await quizQueue.add('READY_NOTIFY', { type: 'READY_NOTIFY', quizId }, { ...opts, delay: Math.max(0, tReady.getTime() - Date.now()) });
  await quizQueue.add('START', { type: 'START', quizId }, { ...opts, delay: Math.max(0, tStart.getTime() - Date.now()) });
  await quizQueue.add('END', { type: 'END', quizId }, { ...opts, delay: Math.max(0, tEnd.getTime() - Date.now()) });
  await quizQueue.add('RESULT_ANNOUNCE', { type: 'RESULT_ANNOUNCE', quizId }, { ...opts, delay: Math.max(0, tAnnounce.getTime() - Date.now()) });
  
  console.log(`📅 Scheduled jobs for quiz ${quizId}: 5min alert, ready, start, end, results`);
}


