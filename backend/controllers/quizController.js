// backend/controllers/quizController.js
import Quiz from "../models/Quiz.js";
import User from "../models/User.js";
import Payment from "../models/Payment.js";

// Get today's quiz information
export const getTodayQuiz = async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);

    const quiz = await Quiz.findOne({ 
      date: { $gte: start, $lt: end } 
    }).select("-questions.correctIndex");

    if (!quiz) {
      return res.json({ 
        exists: false, 
        message: "No quiz scheduled for today" 
      });
    }

    // Check if user has already participated
    const userParticipated = quiz.participants.some(p => 
      p.user.toString() === req.user?.id?.toString()
    );

    // Attach current user's participant state for better UI decisions
    const currentParticipant = quiz.participants.find(p => p.user.toString() === req.user?.id?.toString());

    res.json({ 
      exists: true, 
      quiz: {
        _id: quiz._id,
        date: quiz.date,
        startTime: quiz.startTime,
        endTime: quiz.endTime,
        isLive: quiz.isLive,
        isCompleted: quiz.isCompleted,
        totalQuestions: quiz.totalQuestions,
        timePerQuestion: quiz.timePerQuestion,
        currentParticipants: quiz.currentParticipants,
        maxParticipants: quiz.maxParticipants,
        userParticipated,
        participant: currentParticipant ? {
          isCompleted: !!currentParticipant.isCompleted,
          score: currentParticipant.score || 0,
          correctAnswers: currentParticipant.correctAnswers || 0,
          totalQuestions: currentParticipant.totalQuestions || 0,
        } : null,
        questions: quiz.questions.map(q => ({
          _id: q._id,
          text: q.text,
          options: q.options,
          category: q.category,
          difficulty: q.difficulty,
          points: q.points
        }))
      }
    });
  } catch (error) {
    console.error("getTodayQuiz error:", error);
    res.status(500).json({ message: "Failed to fetch quiz data" });
  }
};

// Helper function to check IST time
function getISTTime() {
  const now = new Date();
  const nowUTC = now.getTime() + now.getTimezoneOffset() * 60000;
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  return new Date(nowUTC + IST_OFFSET_MS);
}

// Check if user can enter quiz (payment verification)
export const checkQuizEligibility = async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check IST time - payment deadline is 7:55 PM IST
    const nowIST = getISTTime();
    const paymentDeadline = new Date(nowIST.getFullYear(), nowIST.getMonth(), nowIST.getDate(), 19, 55, 0, 0);
    const quizStartTime = new Date(nowIST.getFullYear(), nowIST.getMonth(), nowIST.getDate(), 20, 0, 0, 0);
    const quizEndTime = new Date(nowIST.getFullYear(), nowIST.getMonth(), nowIST.getDate(), 20, 30, 0, 0);
    
    // Check if it's before payment deadline
    if (nowIST < paymentDeadline) {
      const minutesLeft = Math.ceil((paymentDeadline.getTime() - nowIST.getTime()) / 60000);
      return res.json({ 
        eligible: false, 
        message: `Payment must be completed before 7:55 PM IST. ${minutesLeft} minutes remaining.`,
        paymentDeadline: paymentDeadline.toISOString(),
        paymentAmount: 500 // ₹5 = 500 paise
      });
    }

    // Check if user has paid for today's quiz
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    // Prefer Payment collection; fallback to user.payments
    const paymentRecord = await Payment.findOne({
      user: req.user.id,
      forDate: { $gte: todayStart, $lt: new Date(todayStart.getTime() + 86400000) },
      status: 'completed',
      verified: true
    });

    let hasPaidToday = !!paymentRecord;
    if (!hasPaidToday) {
      hasPaidToday = (user.payments || []).some(payment => {
        const paymentDate = new Date(payment.date);
        return paymentDate >= todayStart && (payment.amount >= 5);
      });
    }

    // Check if payment was made before deadline (if quiz hasn't started yet)
    if (hasPaidToday && paymentRecord && nowIST < quizStartTime) {
      const paymentTime = new Date(paymentRecord.createdAt || paymentRecord.forDate);
      const paymentTimeIST = new Date(paymentTime.getTime() + paymentTime.getTimezoneOffset() * 60000 + (5.5 * 60 * 60 * 1000));
      
      if (paymentTimeIST > paymentDeadline) {
        return res.json({ 
          eligible: false, 
          message: "Payment was made after the 7:55 PM deadline. You cannot participate in today's quiz.",
          paymentDeadline: paymentDeadline.toISOString()
        });
      }
    }

    if (!hasPaidToday) {
      // If after deadline, show different message
      if (nowIST >= paymentDeadline && nowIST < quizStartTime) {
        return res.json({ 
          eligible: false, 
          message: "Payment deadline has passed (7:55 PM IST). You cannot join today's quiz.",
          paymentDeadline: paymentDeadline.toISOString(),
          paymentAmount: 500 
        });
      }
      return res.json({ 
        eligible: false, 
        message: "Payment required to participate in quiz",
        paymentAmount: 500 
      });
    }

    // Check if quiz is live or about to start
    const isQuizTime = nowIST >= quizStartTime && nowIST <= quizEndTime;
    const isBeforeQuiz = nowIST < quizStartTime;
    const isAfterQuiz = nowIST > quizEndTime;

    if (isAfterQuiz) {
      return res.json({
        eligible: false,
        message: "Today's quiz has ended. Check winners page for results.",
        quizEnded: true
      });
    }

    if (!isQuizTime && !isBeforeQuiz) {
      return res.json({ 
        eligible: false, 
        message: "Quiz is not live yet. Quiz runs from 8:00 PM to 8:30 PM IST",
        nextQuizTime: quizStartTime.toISOString()
      });
    }

    res.json({ 
      eligible: true, 
      message: "User is eligible to participate" 
    });
  } catch (error) {
    console.error("checkQuizEligibility error:", error);
    res.status(500).json({ message: "Failed to check eligibility" });
  }
};

// Enter quiz (register participant)
export const enterQuiz = async (req, res) => {
  try {
    const { quizId } = req.body;
    const userId = req.user.id;

    // Check payment eligibility
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Check Payment model
    const paymentRecord = await Payment.findOne({
      user: userId,
      forDate: { $gte: today, $lt: tomorrow },
      status: 'completed',
      verified: true
    });

    // Check if user has paid
    let hasPaid = !!paymentRecord;
    if (!hasPaid && user.paidForDates && user.paidForDates.length > 0) {
      hasPaid = user.paidForDates.some(date => {
        const d = new Date(date);
        return d >= today && d < tomorrow;
      });
    }

    // For testing purposes, create a test payment if user hasn't paid
    if (!hasPaid) {
      console.log('Creating test payment for user:', user.fullName);
      
      // Create a test payment
      const testPayment = new Payment({
        user: userId,
        amount: 5, // ₹5
        currency: 'INR',
        status: 'completed',
        verified: true,
        razorpayOrderId: 'test_order_' + Date.now(),
        razorpayPaymentId: 'test_payment_' + Date.now(),
        razorpaySignature: 'test_signature_' + Date.now(),
        forDate: today,
        orderId: 'test_order_' + Date.now(),
        notes: {
          purpose: 'quiz_entry',
          test: true
        }
      });
      
      await testPayment.save();
      
      // Update user's paidForDates
      if (!user.paidForDates) {
        user.paidForDates = [];
      }
      if (!user.paidForDates.includes(today)) {
        user.paidForDates.push(today);
      }
      
      // Add to user's payments array
      if (!user.payments) {
        user.payments = [];
      }
      user.payments.push({
        orderId: testPayment.razorpayOrderId,
        paymentId: testPayment.razorpayPaymentId,
        amount: testPayment.amount,
        currency: 'INR',
        status: 'completed',
        date: new Date(),
        purpose: 'quiz_entry',
        razorpaySignature: testPayment.razorpaySignature,
        forDate: testPayment.forDate
      });
      
      await user.save();
      hasPaid = true;
      console.log('✅ Test payment created for user:', user.fullName);
    }

    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }

    // Check if quiz is live OR published (allow entry if quiz is live, even if not explicitly published)
    if (!quiz.isLive && !quiz.published) {
      return res.status(403).json({ message: "Quiz is not available yet" });
    }

    // Check if user already participated
    const existingParticipant = quiz.participants.find(p => 
      p.user.toString() === userId
    );

    if (existingParticipant) {
      // If quiz is live and user already participated, allow reconnection
      if (quiz.isLive && existingParticipant.paid) {
        return res.json({ 
          success: true, 
          message: "Reconnected to quiz",
          participantId: existingParticipant._id,
          quiz: {
            _id: quiz._id,
            isLive: quiz.isLive,
            totalQuestions: quiz.totalQuestions,
            timePerQuestion: quiz.timePerQuestion
          }
        });
      }
      return res.status(400).json({ 
        message: "You have already participated in this quiz" 
      });
    }

    // Check if quiz is at capacity
    if (quiz.currentParticipants >= quiz.maxParticipants) {
      return res.status(400).json({ 
        message: "Quiz is full. Maximum participants reached" 
      });
    }

    // Add participant with payment verification
    const participant = {
      user: userId,
      startTime: new Date(),
      joinTime: new Date(),
      paid: true, // User has verified payment
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      deviceInfo: {
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip || req.connection.remoteAddress,
        timestamp: new Date()
      }
    };

    quiz.participants.push(participant);
    quiz.currentParticipants += 1;
    await quiz.save();

    res.json({ 
      success: true, 
      message: "Successfully entered quiz",
      participantId: quiz.participants[quiz.participants.length - 1]._id,
      quiz: {
        _id: quiz._id,
        isLive: quiz.isLive,
        totalQuestions: quiz.totalQuestions,
        timePerQuestion: quiz.timePerQuestion
      }
    });
  } catch (error) {
    console.error("enterQuiz error:", error);
    res.status(500).json({ message: "Failed to enter quiz", error: error.message });
  }
};

// Submit answer (real-time via Socket.IO)
export const submitAnswer = async (req, res) => {
  try {
    const { quizId, questionId, selectedIndex, timeTaken } = req.body;
    const userId = req.user.id;

    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }

    const participant = quiz.participants.find(p => 
      p.user.toString() === userId
    );

    if (!participant) {
      return res.status(400).json({ message: "User not registered for this quiz" });
    }

    // Check if user already answered this question
    const existingAnswer = participant.answers.find(a => 
      a.questionId.toString() === questionId
    );

    if (existingAnswer) {
      return res.status(400).json({ message: "Question already answered" });
    }

    // Find the question to get correct answer
    const question = quiz.questions.find(q => 
      q._id.toString() === questionId
    );

    if (!question) {
      return res.status(404).json({ message: "Question not found" });
    }

    // Server-side timing enforcement similar to socket handler
    const now = Date.now();
    const questionStartTime = quiz.questionStartTime?.getTime() || 0;
    const elapsed = (now - questionStartTime) / 1000;
    if (elapsed > quiz.timePerQuestion + 1) {
      return res.status(400).json({ message: "Time limit exceeded" });
    }
    if (elapsed < 0.5) {
      return res.status(400).json({ message: "Answer submitted too quickly" });
    }

    // Calculate score
    const isCorrect = selectedIndex === question.correctIndex;
    const points = isCorrect ? question.points : 0;

    // Add answer
    participant.answers.push({
      questionId,
      selectedIndex,
      correct: isCorrect,
      timeTaken: Math.round(elapsed),
      points,
      submittedAt: new Date(),
      serverTimeReceived: new Date()
    });

    // Update participant stats
    participant.score += points;
    participant.totalQuestions += 1;
    if (isCorrect) participant.correctAnswers += 1;
    participant.timeSpent += Math.round(elapsed);

    await quiz.save();

    res.json({ 
      success: true, 
      correct: isCorrect,
      points,
      totalScore: participant.score
    });
  } catch (error) {
    console.error("submitAnswer error:", error);
    res.status(500).json({ message: "Failed to submit answer" });
  }
};

// Complete quiz
export const completeQuiz = async (req, res) => {
  try {
    const { quizId } = req.body;
    const userId = req.user.id;

    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }

    const participant = quiz.participants.find(p => 
      p.user.toString() === userId
    );

    if (!participant) {
      return res.status(400).json({ message: "User not registered for this quiz" });
    }

    if (participant.isCompleted) {
      return res.status(400).json({ message: "Quiz already completed" });
    }

    // Mark as completed
    participant.isCompleted = true;
    participant.endTime = new Date();

    // Calculate rank
    const sortedParticipants = quiz.participants
      .filter(p => p.isCompleted)
      .sort((a, b) => b.score - a.score || a.timeSpent - b.timeSpent);

    const rank = sortedParticipants.findIndex(p => 
      p.user.toString() === userId
    ) + 1;

    participant.rank = rank;

    await quiz.save();

    // Update user's quiz history
    const user = await User.findById(userId);
    if (user) {
      // Check if this quiz is already in history
      const existingHistory = user.quizHistory.find(h => 
        h.quizId && h.quizId.toString() === quiz._id.toString()
      );
      
      if (!existingHistory) {
        user.quizHistory.push({
          quizId: quiz._id,
          score: participant.score,
          date: quiz.date || new Date(),
          rank: rank,
          correctAnswers: participant.correctAnswers,
          totalQuestions: participant.totalQuestions,
          timeSpent: participant.timeSpent
        });
        await user.save();
      } else {
        // Update existing history entry
        existingHistory.score = participant.score;
        existingHistory.rank = rank;
        existingHistory.correctAnswers = participant.correctAnswers;
        existingHistory.totalQuestions = participant.totalQuestions;
        existingHistory.timeSpent = participant.timeSpent;
        await user.save();
      }
    }

    res.json({ 
      success: true, 
      message: "Quiz completed successfully",
      score: participant.score,
      correctAnswers: participant.correctAnswers,
      totalQuestions: participant.totalQuestions,
      rank: rank,
      timeSpent: participant.timeSpent
    });
  } catch (error) {
    console.error("completeQuiz error:", error);
    res.status(500).json({ message: "Failed to complete quiz" });
  }
};

// Get winners for a specific date
export const getWinners = async (req, res) => {
  try {
    const dateParam = req.params.date || null;
    const queryDate = dateParam ? new Date(dateParam) : new Date();
    const start = new Date(queryDate.getFullYear(), queryDate.getMonth(), queryDate.getDate());
    const end = new Date(start);
    end.setDate(start.getDate() + 1);

    const quiz = await Quiz.findOne({ 
      date: { $gte: start, $lt: end } 
    }).populate("participants.user", "fullName username phone profileImage");

    if (!quiz) {
      return res.json({ 
        winners: [], 
        message: "No quiz found for this date" 
      });
    }

    // Get top 20 winners - filter by paid and completed
    const completedParticipants = quiz.participants.filter(p => p.isCompleted && p.paid);
    
    if (completedParticipants.length === 0) {
      return res.json({ 
        winners: [], 
        message: "No completed participants found for this quiz",
        totalParticipants: 0,
        quizDate: quiz.date
      });
    }

    const winners = completedParticipants
      .sort((a, b) => {
        // Sort by score (desc), then by time (asc) - fastest wins on tie
        if (b.score !== a.score) return b.score - a.score;
        return (a.timeSpent || 0) - (b.timeSpent || 0);
      })
      .slice(0, 20)
      .map((participant, index) => ({
        rank: index + 1,
        user: {
          _id: participant.user?._id || participant.user,
          fullName: participant.user?.fullName || 'Unknown',
          username: participant.user?.username || 'unknown',
          profileImage: participant.user?.profileImage || null
        },
        score: participant.score || 0,
        correctAnswers: participant.correctAnswers || 0,
        totalQuestions: participant.totalQuestions || quiz.totalQuestions || 50,
        timeSpent: participant.timeSpent || 0,
        accuracy: participant.totalQuestions > 0 
          ? ((participant.correctAnswers / participant.totalQuestions) * 100).toFixed(2)
          : 0
      }));

    res.json({ 
      winners,
      totalParticipants: completedParticipants.length,
      quizDate: quiz.date || quiz.createdAt
    });
  } catch (error) {
    console.error("getWinners error:", error);
    res.status(500).json({ message: "Failed to fetch winners" });
  }
};

// Get user's quiz history
export const getUserQuizHistory = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('quizHistory.quizId', 'date totalQuestions')
      .select('quizHistory');

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Format quiz history with all required fields
    const formattedHistory = user.quizHistory
      .filter(h => h.quizId) // Filter out invalid entries
      .map(h => ({
        _id: h._id || h.quizId?._id,
        quizId: h.quizId?._id || h.quizId,
        score: h.score || 0,
        date: h.date || h.quizId?.date || h.participationDate || new Date(),
        rank: h.rank || 0,
        correctAnswers: h.correctAnswers || 0,
        totalQuestions: h.totalQuestions || h.quizId?.totalQuestions || 50,
        timeSpent: h.timeSpent || 0
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({ 
      quizHistory: formattedHistory
    });
  } catch (error) {
    console.error("getUserQuizHistory error:", error);
    res.status(500).json({ message: "Failed to fetch quiz history" });
  }
};
