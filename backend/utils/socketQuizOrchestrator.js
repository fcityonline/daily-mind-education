// backend/utils/socketQuizOrchestrator.js
import Quiz from "../models/Quiz.js";
import User from "../models/User.js";

const ORCHESTRATOR = {
  io: null,
  quizzes: new Map(), // quizId -> { currentIndex, timer, participants: Map(userId->{socketId, answeredForCurrent}), state }
};

/**
 * Call this once with the socket.io server instance
 */
export function initQuizOrchestrator(io) {
  ORCHESTRATOR.io = io;

  io.on("connection", (socket) => {
    console.log("socket connected:", socket.id);

    // Basic join-room contract: { quizId, userId, token? }
    socket.on("join-quiz", async ({ quizId, userId }) => {
      try {
        if (!quizId || !userId) {
          socket.emit("join-error", { message: "Missing quizId or userId" });
          return;
        }

        socket.join(quizId);
        socket.quizId = quizId;
        socket.userId = userId;
        console.log(`user ${userId} joined quiz room ${quizId}`);

        // prepare state
        let qstate = ORCHESTRATOR.quizzes.get(String(quizId));
        if (!qstate) {
          // if quiz not scheduled/started, just create minimal state
          qstate = {
            currentIndex: -1,
            running: false,
            participants: new Map(), // userId -> { socketId, answers: Map(questionIndex->answer) }
          };
          ORCHESTRATOR.quizzes.set(String(quizId), qstate);
        }

        // anti-cheat: disallow multiple sockets for same user in same quiz
        const existing = qstate.participants.get(String(userId));
        if (existing && existing.socketId !== socket.id) {
          // store but mark multi-socket
          console.warn(`User ${userId} already connected with ${existing.socketId} to quiz ${quizId}.`);
          // Option: disconnect previous socket or keep both but ignore duplicate answers
        }

        qstate.participants.set(String(userId), {
          socketId: socket.id,
          answers: new Map(),
          score: 0,
          correctAnswers: 0,
          timeSpent: 0,
          isCompleted: false,
          registeredAt: Date.now(),
        });

        socket.emit("joined", { quizId, message: "joined" });
      } catch (err) {
        console.error("join-quiz error:", err);
        socket.emit("join-error", { message: "Failed to join" });
      }
    });

    socket.on("submit-answer", async (payload) => {
      /*
        payload = {
          quizId,
          userId,
          questionIndex,
          selectedIndex,
          timestampClient (optional)
        }
      */
      try {
        const { quizId, userId, questionIndex, selectedIndex } = payload;
        if (!quizId || !userId || questionIndex === undefined || selectedIndex === undefined) {
          socket.emit("answer-error", { message: "Invalid payload" });
          return;
        }

        const qstate = ORCHESTRATOR.quizzes.get(String(quizId));
        if (!qstate || !qstate.running) {
          socket.emit("answer-error", { message: "Quiz not running" });
          return;
        }

        // ensure current question
        if (qstate.currentIndex !== Number(questionIndex)) {
          socket.emit("answer-error", { message: "Answer for wrong question or late" });
          return;
        }

        const participant = qstate.participants.get(String(userId));
        if (!participant) {
          socket.emit("answer-error", { message: "User not registered for quiz" });
          return;
        }

        // Check if participant already answered current question
        if (participant.answers.has(questionIndex)) {
          socket.emit("answer-error", { message: "Question already answered" });
          return;
        }

        // Time window enforcement
        const questionStart = qstate.questionStartAt; // ms
        const now = Date.now();
        const timeTaken = Math.max(0, Math.floor((now - questionStart) / 1000)); // seconds
        if (timeTaken > qstate.questionDurationSec) {
          socket.emit("answer-error", { message: "Too late to answer" });
          return;
        }

        // Load question to verify answer
        const quizDoc = qstate.quizDoc;
        const question = quizDoc.questions[qstate.currentIndex];
        const isCorrect = Number(selectedIndex) === Number(question.correctIndex);
        const points = isCorrect ? (question.points || 1) : 0;

        // Save to participant
        participant.answers.set(questionIndex, {
          selectedIndex,
          isCorrect,
          points,
          timeTaken,
        });

        participant.score += points;
        participant.timeSpent += timeTaken;
        if (isCorrect) participant.correctAnswers += 1;

        // Acknowledge to submitter
        socket.emit("answer-result", {
          questionIndex,
          correct: isCorrect,
          points,
          totalScore: participant.score,
        });

        // Optionally broadcast summary to room (not include correct answer)
        ORCHESTRATOR.io.to(String(quizId)).emit("participant-answered", {
          userId,
          questionIndex,
        });

        // Persist to Quiz doc participant array (lightweight update)
        // We can defer full persistence until quiz completion, but we'll update every answer to reduce data-loss risk
        // Find participant entry in quizDoc (or create)
        const p = (qstate.quizDoc.participants = qstate.quizDoc.participants || []);
        let pd = p.find((x) => String(x.user) === String(userId));
        if (!pd) {
          pd = {
            user: userId,
            score: 0,
            answers: [],
            isCompleted: false,
            totalQuestions: 0,
            correctAnswers: 0,
            timeSpent: 0,
          };
          p.push(pd);
        }
        pd.answers.push({
          questionIndex,
          selectedIndex,
          correct: isCorrect,
          points,
          timeTaken,
        });
        pd.score = participant.score;
        pd.totalQuestions = (pd.totalQuestions || 0) + 1;
        pd.correctAnswers = participant.correctAnswers;
        pd.timeSpent = participant.timeSpent;

        // light save: update quiz doc in memory and occasionally persist
        const SAVE_INTERVAL = 5; // every 5 answers persist
        qstate._persistCount = (qstate._persistCount || 0) + 1;
        if (qstate._persistCount >= SAVE_INTERVAL) {
          qstate._persistCount = 0;
          try {
            await Quiz.findByIdAndUpdate(qstate.quizDoc._id, { participants: qstate.quizDoc.participants }, { new: true });
          } catch (err) {
            console.error("Failed to persist quiz participants:", err);
          }
        }
      } catch (err) {
        console.error("submit-answer error:", err);
        socket.emit("answer-error", { message: "Failed to process answer" });
      }
    });

    socket.on("leave-quiz", ({ quizId, userId }) => {
      if (!quizId || !userId) return;
      const qstate = ORCHESTRATOR.quizzes.get(String(quizId));
      if (qstate) qstate.participants.delete(String(userId));
      socket.leave(quizId);
    });

    socket.on("disconnect", () => {
      // clean up user from all quizes it joined
      const sid = socket.id;
      ORCHESTRATOR.quizzes.forEach((qstate, quizId) => {
        for (const [uid, p] of qstate.participants.entries()) {
          if (p.socketId === sid) {
            qstate.participants.delete(uid);
            console.log(`Removed participant ${uid} due to disconnect`);
          }
        }
      });
    });
  });
}

/**
 * Start a quiz now (quizId)
 * - loads quiz doc
 * - sets up qstate with questions shuffled per user if needed
 * - orchestrates per-question emit / per-second countdown events (emits 'question-start' and each second 'tick' or 'time-left')
 */
export async function startQuizNow(quizId) {
  if (!ORCHESTRATOR.io) throw new Error("Orchestrator not initialized with io");

  const quizDoc = await Quiz.findById(quizId);
  if (!quizDoc) throw new Error("Quiz not found");

  const qid = String(quizId);
  if (ORCHESTRATOR.quizzes.has(qid) && ORCHESTRATOR.quizzes.get(qid).running) {
    console.warn("Quiz already running:", qid);
    return;
  }

  // Prepare state
  const qstate = {
    quizDoc: JSON.parse(JSON.stringify(quizDoc)), // clone so we can mutate in memory
    currentIndex: -1,
    running: true,
    questionDurationSec: 15,
    participants: new Map(),
    questionStartAt: null,
    timerHandle: null,
  };

  // Initialize participants map from quizDoc.participants if present (these are pre-registered paid participants)
  (quizDoc.participants || []).forEach((p) => {
    qstate.participants.set(String(p.user), {
      socketId: null, // if user later connects, socket event adds socketId
      answers: new Map(),
      score: p.score || 0,
      correctAnswers: p.correctAnswers || 0,
      timeSpent: p.timeSpent || 0,
      isCompleted: p.isCompleted || false,
    });
  });

  ORCHESTRATOR.quizzes.set(qid, qstate);

  // Function to advance to next question
  const advanceTo = async (idx) => {
    if (!qstate.running) return;
    qstate.currentIndex = idx;
    qstate.questionStartAt = Date.now();

    // For fairness shuffle options server-side per-question for everyone or use stored randomized order in question object.
    const question = qstate.quizDoc.questions[idx];
    if (!question) {
      // quiz finished
      await finalizeQuiz(qid);
      return;
    }

    // Emit question to room: include question text + options but remove correctIndex
    const questionForClients = {
      questionIndex: idx,
      text: question.text,
      options: question.options, // you can optionally shuffle here and include mapping
      duration: qstate.questionDurationSec,
    };

    ORCHESTRATOR.io.to(qid).emit("question-start", questionForClients);

    // per-second tick for UI
    let remaining = qstate.questionDurationSec;
    ORCHESTRATOR.io.to(qid).emit("time-left", { questionIndex: idx, remaining });

    const perSecond = setInterval(() => {
      remaining -= 1;
      if (remaining >= 0) {
        ORCHESTRATOR.io.to(qid).emit("time-left", { questionIndex: idx, remaining });
      }
    }, 1000);

    // schedule end of this question
    const endHandle = setTimeout(async () => {
      clearInterval(perSecond);
      // compute any necessary per-question aggregation (e.g., lock answers)
      // emit correct answer (optional) but anti-cheat: reveal after the question ends
      const correctIndex = question.correctIndex;
      ORCHESTRATOR.io.to(qid).emit("question-ended", { questionIndex: idx, correctIndex });

      // small persistence: update quizDoc in DB
      try {
        await Quiz.findByIdAndUpdate(qstate.quizDoc._id, {
          $set: {
            "participants": Array.from(qstate.participants.entries()).map(([userId, p]) => ({
              user: userId,
              score: p.score,
              correctAnswers: p.correctAnswers,
              timeSpent: p.timeSpent,
              isCompleted: p.isCompleted,
            })),
          },
        });
      } catch (err) {
        console.error("Failed to persist after question end", err);
      }

      // move to next question or finish
      const nextIdx = idx + 1;
      if (nextIdx >= qstate.quizDoc.questions.length) {
        await finalizeQuiz(qid);
      } else {
        // small gap - 1 second between questions, or start immediately
        setTimeout(() => advanceTo(nextIdx), 1000);
      }
    }, qstate.questionDurationSec * 1000);

    qstate.timerHandle = { perSecond, endHandle };
  };

  // Start from question 0
  await advanceTo(0);

  // Broadcast quiz-start
  ORCHESTRATOR.io.to(qid).emit("quiz-started", {
    quizId: qid,
    title: qstate.quizDoc.title,
    totalQuestions: qstate.quizDoc.questions.length,
    questionDuration: qstate.questionDurationSec,
  });

  console.log("Quiz started:", qid);
}

// finalizeQuiz: compute ranks, save participants, emit quiz-completed per user and overall results
async function finalizeQuiz(qid) {
  const qstate = ORCHESTRATOR.quizzes.get(qid);
  if (!qstate) return;
  qstate.running = false;

  // build sorted participants
  const participantsArr = [];
  for (const [userId, p] of qstate.participants.entries()) {
    participantsArr.push({
      user: userId,
      score: p.score || 0,
      correctAnswers: p.correctAnswers || 0,
      timeSpent: p.timeSpent || 0,
    });
  }

  participantsArr.sort((a, b) => b.score - a.score || (a.timeSpent || 0) - (b.timeSpent || 0));

  // assign ranks
  participantsArr.forEach((p, idx) => {
    p.rank = idx + 1;
  });

  // persist results to DB (update quizDoc.participants)
  try {
    const quizDoc = await Quiz.findById(qstate.quizDoc._id);
    quizDoc.participants = participantsArr.map((p) => ({
      user: p.user,
      score: p.score,
      rank: p.rank,
      correctAnswers: p.correctAnswers,
      timeSpent: p.timeSpent,
      isCompleted: true,
    }));
    await quizDoc.save();

    // update each user's quizHistory
    for (const p of participantsArr) {
      try {
        const user = await User.findById(p.user);
        if (!user) continue;
        user.quizHistory = user.quizHistory || [];
        user.quizHistory.push({
          quizId: quizDoc._id,
          score: p.score,
          date: new Date(),
          rank: p.rank,
        });
        await user.save();
      } catch (err) {
        console.warn("Failed to update user history for", p.user, err);
      }
    }
  } catch (err) {
    console.error("Failed to persist final quiz results:", err);
  }

  // Emit final leaderboard
  ORCHESTRATOR.io.to(qid).emit("quiz-ended", {
    quizId: qid,
    leaderboard: participantsArr.slice(0, 50), // top 50
  });

  // Cleanup
  if (qstate.timerHandle) {
    try {
      clearTimeout(qstate.timerHandle.endHandle);
      clearInterval(qstate.timerHandle.perSecond);
    } catch (e) {}
  }

  ORCHESTRATOR.quizzes.delete(qid);
  console.log("Quiz finalized:", qid);
}

export default {
  initQuizOrchestrator,
  startQuizNow,
};
