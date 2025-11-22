// // // frontend/src/pages/QuizPage.jsx

// frontend/src/pages/QuizPage.jsx
import React, { useEffect, useState, useRef, useContext, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import { AuthContext } from "../context/AuthContext";
import API from "../utils/api";

const socket = io(
  process.env.REACT_APP_API_URL?.replace("/api", "") || "http://localhost:5000",
  { autoConnect: false }
);

export default function QuizPage() {
  const { user } = useContext(AuthContext);
  const userId = user?._id;
  const navigate = useNavigate();

  const [quizData, setQuizData] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const [disabled, setDisabled] = useState(false);
  const [roomId, setRoomId] = useState(null);
  const [quizStatus, setQuizStatus] = useState("loading"); // loading, waiting, active, completed, ended, no-quiz, not-live, already-participated, not-eligible, error
  const [score, setScore] = useState(0);
  const [countdown, setCountdown] = useState(3); // For animated redirect countdown

  const answerGivenRef = useRef(false);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const durationMsRef = useRef(15000);

  // ------------------------ API CALLS ------------------------
  const checkEligibility = useCallback(async () => {
    try {
      const response = await API.get("/quiz/eligibility");
      if (!response.data.eligible) setQuizStatus("not-eligible");
    } catch (error) {
      console.error("Eligibility check failed:", error);
      setQuizStatus("error");
    }
  }, []);

  const getQuizData = useCallback(async () => {
    try {
      const response = await API.get("/quiz/today");
      if (response.data.exists) {
        setQuizData(response.data.quiz);
        setRoomId(response.data.quiz._id);

        // If quiz is live, allow entry/reconnection regardless of participation status
        if (response.data.quiz.isLive) {
          if (response.data.quiz.userParticipated) {
            // User already participated but quiz is live - allow reconnection
            setQuizStatus("waiting");
          } else {
            // User hasn't participated yet, need to enter
            setQuizStatus("waiting");
          }
        } else if (response.data.quiz.userParticipated) {
          // Quiz not live and user already participated
          setQuizStatus("already-participated");
        } else if (response.data.quiz.isCompleted) {
          // Quiz completed
          setQuizStatus("already-participated");
        } else {
          // Quiz not live yet
          setQuizStatus("not-live");
        }
      } else {
        setQuizStatus("no-quiz");
      }
    } catch (error) {
      console.error("Failed to fetch quiz data:", error);
      setQuizStatus("error");
    }
  }, []);

  // ------------------------ SOCKET ------------------------
  // Debounce connectAndJoin to prevent rapid reconnections
  const connectAndJoinRef = useRef(null);
  const lastConnectTime = useRef(0);
  const CONNECT_DEBOUNCE_MS = 2000; // 2 seconds debounce
  const isConnectingRef = useRef(false);

  const connectAndJoin = useCallback(() => {
    if (!roomId || !userId) {
      console.warn("Cannot connect: missing roomId or userId", { roomId, userId });
      return;
    }

    // Prevent multiple simultaneous connections
    if (isConnectingRef.current) {
      console.log("Already connecting, skipping...");
      return;
    }

    // Clear any pending connection
    if (connectAndJoinRef.current) {
      clearTimeout(connectAndJoinRef.current);
      connectAndJoinRef.current = null;
    }

    // Debounce rapid reconnections
    const now = Date.now();
    if (now - lastConnectTime.current < CONNECT_DEBOUNCE_MS) {
      console.log("Debouncing rapid reconnection...");
      connectAndJoinRef.current = setTimeout(() => {
        connectAndJoin();
      }, CONNECT_DEBOUNCE_MS - (now - lastConnectTime.current));
      return;
    }
    lastConnectTime.current = now;
    isConnectingRef.current = true;
    
    // Generate or get device ID - allow device ID to be updated in development
    let deviceId = localStorage.getItem("deviceId");
    if (!deviceId) {
      deviceId = `device_${Math.random().toString(36).slice(2)}_${Date.now()}`;
      localStorage.setItem("deviceId", deviceId);
      console.log("Generated new device ID:", deviceId);
    } else {
      console.log("Using existing device ID:", deviceId);
    }

    // Only connect if not already connected
    if (!socket.connected) {
      socket.auth = { token: localStorage.getItem("token") };
      socket.connect();
    }
    
    const joinPayload = { roomId, userId, deviceId };
    if (socket.connected) {
      socket.emit("join-room", joinPayload);
      isConnectingRef.current = false;
    } else {
      socket.once("connect", () => {
        socket.emit("join-room", joinPayload);
        isConnectingRef.current = false;
      });
      socket.once("connect_error", () => {
        isConnectingRef.current = false;
      });
    }
  }, [roomId, userId]);

  const enterQuiz = useCallback(async () => {
    try {
      if (!roomId) {
        console.error("No roomId available");
        setQuizStatus("error");
        return;
      }
      
      const response = await API.post("/quiz/enter", { quizId: roomId });
      if (response.data.success) {
        setQuizStatus("waiting");
        connectAndJoin();
      }
    } catch (error) {
      console.error("Failed to enter quiz:", error);
      const msg = error?.response?.data?.message || "";
      const status = error?.response?.status;
      
      if (status === 400) {
        if (/already participated/i.test(msg)) {
          setQuizStatus("already-participated");
        } else if (/full|capacity/i.test(msg)) {
          alert("❌ Quiz is full. Maximum participants reached.");
          setQuizStatus("error");
        } else {
          // If already a participant, try to reconnect
          console.log("User may already be a participant, attempting to reconnect...");
          setQuizStatus("waiting");
          connectAndJoin();
        }
      } else if (status === 403) {
        alert("❌ Quiz is not available yet or payment required.");
        setQuizStatus("not-eligible");
      } else {
        setQuizStatus("error");
      }
    }
  }, [roomId, connectAndJoin]);

  const handleTimeout = useCallback(
    (question) => {
      if (!answerGivenRef.current && question) {
        // Calculate actual time taken from server start time (server-authoritative)
        const now = Date.now();
        const elapsed = now - (startTimeRef.current || now);
        const timeTaken = Math.max(0, Math.ceil(elapsed / 1000));
        
        socket.emit("submit-answer", {
          roomId,
          userId: userId,
          questionId: question._id,
          selectedIndex: -1,
          timeTaken,
        });
        setDisabled(true);
        answerGivenRef.current = true;
      }
    },
    [roomId, userId]
  );

  const handleAnswer = useCallback(
    (selectedIndex) => {
      if (answerGivenRef.current || !currentQuestion) return;

      answerGivenRef.current = true;
      setDisabled(true);
      
      // Cleanup timer
      if (timerRef.current) {
        if (typeof timerRef.current === 'number') {
          cancelAnimationFrame(timerRef.current);
        } else {
          clearInterval(timerRef.current);
        }
        timerRef.current = null;
      }

      // Calculate actual time taken from server start time (server-authoritative)
      const now = Date.now();
      const elapsed = now - (startTimeRef.current || now);
      const timeTaken = Math.max(0, Math.ceil(elapsed / 1000));
      
      socket.emit("submit-answer", {
        roomId,
        userId: userId,
        questionId: currentQuestion._id,
        selectedIndex,
        timeTaken,
      });
    },
    [roomId, userId, currentQuestion]
  );

  // ------------------------ SOCKET LISTENERS ------------------------
  useEffect(() => {
    const onConnect = () => {
      console.log("✅ Socket connected successfully");
    };

    const onDisconnect = (reason) => {
      console.log("Socket disconnected:", reason);
    };

    const onConnectError = (error) => {
      console.error("Socket connection error:", error);
    };

    const onJoined = (data) => {
      console.log("✅ Successfully joined quiz room:", data);
      setQuizStatus("waiting"); // Wait for questions
    };

    const onJoinError = (error) => {
      console.error("Failed to join quiz room:", error);
      const msg = error?.message || "Failed to join quiz";
      
      // Handle "already connected" error - allow reconnection
      if (/already connected/i.test(msg)) {
        console.log("Reconnecting to quiz...");
        // The server will disconnect old socket and allow new connection
        // Try to reconnect after a short delay
        setTimeout(() => {
          connectAndJoin();
        }, 1000);
        return;
      }
      
      if (/not registered|payment/i.test(msg)) {
        setQuizStatus("not-eligible");
      } else if (/not live/i.test(msg)) {
        setQuizStatus("not-live");
      } else {
        setQuizStatus("error");
      }
    };

    const onQuestion = (data) => {
      // Minimize logging for performance
      answerGivenRef.current = false;
      const question = data.question || data;
      
      // Batch state updates to reduce re-renders
      setCurrentQuestion(question);
      setCurrentQuestionIndex(data.questionIndex || 1);
      setDisabled(false);
      setQuizStatus("active");

      // Server sends: startTime (when question started), timeLeft (remaining ms), duration (total ms)
      const serverStartTime = Number(data.startTime) || Date.now();
      const serverDuration = Number(data.duration) || 15000; // total duration in ms
      
      // Use server time for accurate countdown
      startTimeRef.current = serverStartTime;
      durationMsRef.current = serverDuration; // total duration
      
      // Calculate initial remaining time based on server time
      const now = Date.now();
      const elapsed = now - serverStartTime;
      const initialRemaining = Math.max(0, Math.ceil((serverDuration - elapsed) / 1000));
      setTimeLeft(initialRemaining);

      // Clear any existing timer
      if (timerRef.current) {
        if (typeof timerRef.current === 'number') {
          cancelAnimationFrame(timerRef.current);
        } else {
          clearInterval(timerRef.current);
        }
        timerRef.current = null;
      }
      
      // Optimized timer - use requestAnimationFrame for smooth updates without lag
      const updateTimer = () => {
        const now = Date.now();
        const elapsed = now - startTimeRef.current;
        const remaining = Math.max(0, Math.ceil((durationMsRef.current - elapsed) / 1000));
        
        // Update state (React will batch updates)
        setTimeLeft(remaining);
        
        if (remaining <= 0) {
          if (timerRef.current) {
            cancelAnimationFrame(timerRef.current);
            timerRef.current = null;
          }
          handleTimeout(question);
        } else {
          timerRef.current = requestAnimationFrame(updateTimer);
        }
      };
      
      // Start the animation frame loop
      timerRef.current = requestAnimationFrame(updateTimer);
    };

    const onAnswerResult = (result) => {
      // Silently update score in background - don't log to reduce lag
      // Score will be displayed only after quiz completion
      setScore(result.totalScore || 0);
    };

    const onQuizCompleted = (data) => {
      console.log("🏁 Quiz completed", data);
      // Update score from final result if provided
      if (data?.score !== undefined) {
        setScore(data.score);
      }
      setQuizStatus("completed");
      // Show completion screen for 3 seconds before redirect
      setTimeout(() => navigate("/winners"), 3000);
    };

    const onQuizEnded = (data) => {
      console.log("🏁 Quiz ended", data);
      // Update score from final result if provided
      if (data?.score !== undefined) {
        setScore(data.score);
      }
      setQuizStatus("ended");
      // Show completion screen for 3 seconds before redirect
      setTimeout(() => navigate("/winners"), 3000);
    };

    // Register all socket listeners
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on("joined", onJoined);
    socket.on("join-error", onJoinError);
    socket.on("question", onQuestion);
    socket.on("answer-result", onAnswerResult);
    socket.on("quiz-completed", onQuizCompleted);
    socket.on("quiz-ended", onQuizEnded);
    socket.on("force-disconnect", (data) => {
      console.log("Force disconnect received:", data);
      // Handle forced disconnect (e.g., from another device)
      // The server will allow reconnection, so we can try again
      setTimeout(() => {
        if (socket.connected) {
          socket.disconnect();
        }
        connectAndJoin();
      }, 1000);
    });

    return () => {
      // Cleanup all listeners
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off("joined", onJoined);
      socket.off("join-error", onJoinError);
      socket.off("question", onQuestion);
      socket.off("answer-result", onAnswerResult);
      socket.off("quiz-completed", onQuizCompleted);
      socket.off("quiz-ended", onQuizEnded);
      socket.off("force-disconnect");
      
      // Cleanup timer
      if (timerRef.current) {
        if (typeof timerRef.current === 'number') {
          cancelAnimationFrame(timerRef.current);
        } else {
          clearInterval(timerRef.current);
        }
        timerRef.current = null;
      }
    };
  }, [navigate, handleTimeout, connectAndJoin]);

  // ------------------------ INITIAL LOAD ------------------------
  useEffect(() => {
    if (!userId) {
      navigate("/login");
      return;
    }
    checkEligibility();
    getQuizData();
  }, [userId, navigate, checkEligibility, getQuizData]);

  useEffect(() => {
    if (quizStatus === "waiting" && roomId) {
      // Check if user already participated before trying to enter
      if (quizData?.userParticipated) {
        // Already participated, just connect to socket
        connectAndJoin();
      } else {
        // Not participated yet, enter quiz first
        enterQuiz();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [quizStatus, enterQuiz, connectAndJoin, roomId, quizData]);

  // ------------------------ REDIRECT COUNTDOWN ------------------------
  useEffect(() => {
    const redirectStates = [
      "not-live",
      "no-quiz",
      "already-participated",
      "not-eligible",
      "error",
    ];

    if (redirectStates.includes(quizStatus)) {
      setCountdown(3);
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            // Use setTimeout to avoid calling navigate during render
            setTimeout(() => {
              if (quizStatus === "not-eligible") {
                navigate("/payment");
              } else {
                navigate("/");
              }
            }, 0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [quizStatus, navigate]);

  // ------------------------ RENDER ------------------------
  if (quizStatus === "loading") return <h2 style={{ textAlign: "center" }}>⌛️Loading Quiz...</h2>;

  if (["not-live", "no-quiz", "already-participated", "not-eligible", "error"].includes(quizStatus)) {
    const messages = {
      "not-live": "Quiz Not Live Yet⌛️",
      "no-quiz": "No Quiz Today🚫",
      "already-participated": "Already Participated📢",
      "not-eligible": "Payment Required📌",
      "error": "Unable to Load Quiz❌",
    };
    
    const descriptions = {
      "not-live": "The quiz will start at 8:00 PM IST.⌛️Please wait...",
      "no-quiz": "There's no quiz scheduled for today. Check back tomorrow!⌛️",
      "already-participated": "You have already participated in today's quiz.📢",
      "not-eligible": "You need to pay ₹5 to participate in today's quiz.💳",
      "error": "There was an issue loading the quiz.❌Please try again later.",
    };
    
    return (
      <div style={{ 
        padding: 24, 
        textAlign: "center",
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center"
      }}>
        <h2 style={{ marginBottom: "15px", fontSize: "24px", color: "#333" }}>
          {messages[quizStatus]}
        </h2>
        <p style={{ marginBottom: "20px", color: "#666", fontSize: "16px" }}>
          {descriptions[quizStatus]}
        </p>
        {quizStatus === "not-eligible" && (
          <button
            onClick={() => navigate("/payment")}
            style={{
              padding: "12px 30px",
              background: "#660000",
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontSize: "16px",
              fontWeight: "bold",
              cursor: "pointer",
              marginBottom: "15px"
            }}
          >
            Go to Payment Page
          </button>
        )}
        <p style={{ fontSize: "14px", color: "#999" }}>
          Redirecting in {countdown}...
        </p>
      </div>
    );
  }

  if (!currentQuestion)
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <h2>Waiting for Questions...</h2>
        <p>The quiz is live! Please wait while questions appear...</p>
      </div>
    );

  // ------------------------ QUIZ COMPLETED DISPLAY ------------------------
  if (quizStatus === "completed" || quizStatus === "ended") {
    const isMobile = window.innerWidth <= 768;
    const isSmallMobile = window.innerWidth <= 480;
    
    return (
      <div style={{ 
        padding: isSmallMobile ? "15px" : isMobile ? "20px" : "24px", 
        textAlign: "center",
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        boxSizing: "border-box"
      }}>
        <h2 style={{ 
          fontSize: isSmallMobile ? "24px" : isMobile ? "28px" : "32px", 
          marginBottom: isMobile ? "15px" : "20px", 
          color: "#28a745",
          padding: "0 10px"
        }}>
          🎉 Quiz Completed!
        </h2>
        <div style={{ 
          background: "#f8f9fa", 
          padding: isSmallMobile ? "20px" : isMobile ? "25px" : "30px", 
          borderRadius: "10px",
          marginBottom: isMobile ? "15px" : "20px",
          minWidth: isSmallMobile ? "250px" : isMobile ? "280px" : "300px",
          maxWidth: "90%",
          boxSizing: "border-box"
        }}>
          <p style={{ 
            fontSize: isSmallMobile ? "18px" : isMobile ? "20px" : "24px", 
            fontWeight: "bold", 
            marginBottom: "10px" 
          }}>
            Your Final Score
          </p>
          <p style={{ 
            fontSize: isSmallMobile ? "36px" : isMobile ? "42px" : "48px", 
            color: "#007bff", 
            fontWeight: "bold", 
            margin: "10px 0" 
          }}>
            {score}
          </p>
          <p style={{ 
            fontSize: isSmallMobile ? "14px" : isMobile ? "15px" : "16px", 
            color: "#666" 
          }}>
            out of {quizData?.totalQuestions || 50} questions
          </p>
        </div>
        <p style={{ 
          fontSize: isSmallMobile ? "14px" : isMobile ? "15px" : "16px", 
          color: "#666", 
          marginTop: isMobile ? "15px" : "20px",
          padding: "0 10px"
        }}>
          Redirecting to results page...
        </p>
      </div>
    );
  }

  // ------------------------ QUIZ DISPLAY ------------------------
  // Responsive breakpoints
  const isMobile = window.innerWidth <= 768;
  const isSmallMobile = window.innerWidth <= 480;
  
  return (
    <div style={{ 
      paddingTop: isSmallMobile ? "10px" : isMobile ? "15px" : "20px",
      paddingLeft: isSmallMobile ? "10px" : isMobile ? "15px" : "20px",
      paddingRight: isSmallMobile ? "10px" : isMobile ? "15px" : "20px",
      paddingBottom: "100px", // Space for bottom navigation
      maxWidth: "900px",
      margin: "0 auto",
      minHeight: "100vh",
      backgroundColor: "#f8f9fa",
      boxSizing: "border-box"
    }}>
      {/* Main Quiz Card */}
      <div style={{
        background: "#fff",
        borderRadius: isMobile ? "12px" : "16px",
        padding: isSmallMobile ? "15px" : isMobile ? "20px" : "30px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
        marginBottom: isMobile ? "15px" : "20px",
        maxWidth: "100%",
        width: "100%",
        boxSizing: "border-box"
      }}>
        {/* Header - Question number and Timer */}
        <div style={{ 
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "center",
          marginBottom: isMobile ? 20 : 25,
          paddingBottom: isMobile ? 15 : 20,
          borderBottom: "2px solid #e9ecef",
          flexWrap: "wrap",
          gap: isMobile ? "10px" : "15px"
        }}>
          <div style={{ flex: "1", minWidth: isMobile ? "120px" : "150px" }}>
            <h3 style={{ 
              margin: 0,
              fontSize: isSmallMobile ? "14px" : isMobile ? "16px" : "18px",
              fontWeight: "600",
              color: "#495057",
              lineHeight: "1.4"
            }}>
              Question {currentQuestionIndex} of {quizData?.totalQuestions || 50}
            </h3>
          </div>
          {/* <div style={{ 
            fontSize: isSmallMobile ? "18px" : isMobile ? "22px" : "28px", 
            fontWeight: "bold", 
            color: timeLeft <= 5 ? "#dc3545" : timeLeft <= 10 ? "#ffc107" : "#28a745",
            padding: isSmallMobile ? "6px 12px" : isMobile ? "8px 15px" : "10px 20px",
            background: timeLeft <= 5 ? "#fee" : timeLeft <= 10 ? "#fff3cd" : "#e8f5e9",
            borderRadius: isMobile ? "10px" : "12px",
            minWidth: isSmallMobile ? "60px" : isMobile ? "70px" : "90px",
            textAlign: "center",
            boxShadow: timeLeft <= 5 ? "0 2px 8px rgba(220,53,69,0.3)" : "0 2px 8px rgba(0,0,0,0.1)",
            transition: "all 0.3s ease",
            whiteSpace: "nowrap"
          }}>
            ⏱ {timeLeft}s
          </div> */}
          <div
  className={`quiz-timer ${
    timeLeft > 10
      ? "timer-green"
      : timeLeft > 5
      ? "timer-yellow"
      : "timer-red"
  }`}
  style={{
    fontSize: isSmallMobile ? "18px" : isMobile ? "22px" : "28px"
  }}
>
  ⏱ {timeLeft}s
  <div
    className="timer-bar"
    style={{
      width: `${(timeLeft / 15) * 100}%`
    }}
  ></div>
</div>

        </div>

        {/* Question Text */}
        <h4 style={{ 
          marginBottom: isMobile ? 20 : 25,
          fontSize: isSmallMobile ? "16px" : isMobile ? "18px" : "22px",
          lineHeight: "1.6",
          color: "#212529",
          fontWeight: "600",
          padding: isSmallMobile ? "12px" : isMobile ? "15px" : "18px",
          background: "#f8f9fa",
          borderRadius: isMobile ? "10px" : "12px",
          borderLeft: "4px solid #007bff",
          wordWrap: "break-word",
          overflowWrap: "break-word"
        }}>
          {currentQuestion.text}
        </h4>

        {/* Answer Options */}
        <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 10 : 12 }}>
          {currentQuestion.options?.map((option, index) => (
            <button
              key={index}
              onClick={() => handleAnswer(index)}
              disabled={disabled}
              style={{
                padding: isSmallMobile ? "12px 14px" : isMobile ? "14px 16px" : "18px 20px",
                border: "2px solid #dee2e6",
                borderRadius: isMobile ? "10px" : "12px",
                cursor: disabled ? "not-allowed" : "pointer",
                backgroundColor: disabled ? "#f8f9fa" : "#fff",
                fontSize: isSmallMobile ? "14px" : isMobile ? "15px" : "16px",
                textAlign: "left",
                transition: "all 0.3s ease",
                opacity: disabled ? 0.6 : 1,
                fontWeight: "500",
                boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
                width: "100%",
                boxSizing: "border-box",
                wordWrap: "break-word",
                overflowWrap: "break-word",
                display: "flex",
                alignItems: "flex-start"
              }}
              onMouseEnter={(e) => {
                if (!disabled && !isMobile) {
                  e.target.style.backgroundColor = "#e7f3ff";
                  e.target.style.borderColor = "#007bff";
                  e.target.style.transform = "translateX(5px)";
                  e.target.style.boxShadow = "0 4px 12px rgba(0,123,255,0.2)";
                } else if (!disabled) {
                  e.target.style.backgroundColor = "#e7f3ff";
                  e.target.style.borderColor = "#007bff";
                }
              }}
              onMouseLeave={(e) => {
                if (!disabled) {
                  e.target.style.backgroundColor = "#fff";
                  e.target.style.borderColor = "#dee2e6";
                  e.target.style.transform = "translateX(0)";
                  e.target.style.boxShadow = "0 2px 4px rgba(0,0,0,0.05)";
                }
              }}
              onTouchStart={(e) => {
                if (!disabled) {
                  e.target.style.backgroundColor = "#e7f3ff";
                  e.target.style.borderColor = "#007bff";
                }
              }}
              onTouchEnd={(e) => {
                if (!disabled) {
                  setTimeout(() => {
                    e.target.style.backgroundColor = "#fff";
                    e.target.style.borderColor = "#dee2e6";
                  }, 200);
                }
              }}
            >
              <span style={{ 
                fontWeight: "bold", 
                color: "#007bff",
                marginRight: isSmallMobile ? "8px" : isMobile ? "10px" : "15px",
                fontSize: isSmallMobile ? "16px" : isMobile ? "18px" : "20px",
                flexShrink: 0
              }}>
                {String.fromCharCode(65 + index)}.
              </span>
              <span style={{ flex: 1 }}>{option}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Progress Bar */}
      <div style={{ 
        marginTop: isMobile ? 20 : 30,
        width: "100%", 
        height: isMobile ? 10 : 12, 
        backgroundColor: "#e9ecef", 
        borderRadius: 10,
        overflow: "hidden",
        boxShadow: "inset 0 2px 4px rgba(0,0,0,0.1)"
      }}>
        <div style={{
          width: `${(currentQuestionIndex / (quizData?.totalQuestions || 50)) * 100}%`,
          height: "100%",
          background: "linear-gradient(90deg, #007bff 0%, #0056b3 100%)",
          borderRadius: 10,
          transition: "width 0.5s ease",
          boxShadow: "0 2px 4px rgba(0,123,255,0.3)"
        }}></div>
      </div>
      
      {/* Progress Text */}
      <div style={{
        textAlign: "center",
        marginTop: isMobile ? "10px" : "15px",
        color: "#6c757d",
        fontSize: isSmallMobile ? "12px" : isMobile ? "13px" : "14px",
        fontWeight: "500"
      }}>
        {Math.round((currentQuestionIndex / (quizData?.totalQuestions || 50)) * 100)}% Complete
      </div>
    </div>
  );
}




// // frontend/src/pages/QuizPage.jsx
// import React, { useEffect, useState, useRef, useContext, useCallback } from "react";
// import { useNavigate } from "react-router-dom";
// import { io } from "socket.io-client";
// import { AuthContext } from "../context/AuthContext";
// import API from "../utils/api";

// const socket = io(
//   process.env.REACT_APP_API_URL?.replace("/api", "") || "http://localhost:5000",
//   { autoConnect: false }
// );

// export default function QuizPage() {
//   const { user } = useContext(AuthContext);
//   const userId = user?._id;
//   const navigate = useNavigate();
//   const [quizData, setQuizData] = useState(null);
//   const [currentQuestion, setCurrentQuestion] = useState(null);
//   const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
//   const [timeLeft, setTimeLeft] = useState(15);
//   const [disabled, setDisabled] = useState(false);
//   const [roomId, setRoomId] = useState(null);
//   const [quizStatus, setQuizStatus] = useState("loading"); // loading, waiting, active, completed, ended
//   const [score, setScore] = useState(0);
//   const [, setAnswers] = useState([]);
//   const [, setIsEligible] = useState(false);
//   const [hasEntered, setHasEntered] = useState(false);

//   const answerGivenRef = useRef(false);
//   const timerRef = useRef(null);
//   const startTimeRef = useRef(null);
//   const durationMsRef = useRef(15000);

//   // ------------------------ API CALLS ------------------------
//   const checkEligibility = useCallback(async () => {
//     try {
//       const response = await API.get("/quiz/eligibility");
//       setIsEligible(response.data.eligible);
//       setQuizStatus((prev) => {
//         if (prev === "waiting" || prev === "active") return prev;
//         return response.data.eligible ? prev : "not-eligible";
//       });
//     } catch (error) {
//       console.error("Eligibility check failed:", error);
//       setQuizStatus("error");
//     }
//   }, []);

//   const getQuizData = useCallback(async () => {
//     try {
//       const response = await API.get("/quiz/today");
//       if (response.data.exists) {
//         setQuizData(response.data.quiz);
//         setRoomId(response.data.quiz._id);

//         if (response.data.quiz.isLive) {
//           setQuizStatus("waiting");
//         } else if (response.data.quiz.userParticipated) {
//           setQuizStatus("already-participated");
//         } else {
//           setQuizStatus("not-live");
//         }
//       } else {
//         setQuizStatus("no-quiz");
//       }
//     } catch (error) {
//       console.error("Failed to fetch quiz data:", error);
//       setQuizStatus("error");
//     }
//   }, []);

//   // ------------------------ SOCKET ------------------------
//   const connectAndJoin = useCallback(() => {
//     let deviceId = localStorage.getItem("deviceId");
//     if (!deviceId) {
//       deviceId = Math.random().toString(36).slice(2) + Date.now();
//       localStorage.setItem("deviceId", deviceId);
//     }
//     socket.auth = { token: localStorage.getItem("token") };
//     if (!socket.connected) socket.connect();
//     const joinPayload = { roomId, userId: userId, deviceId };
//     if (socket.connected) {
//       socket.emit("join-room", joinPayload);
//     } else {
//       socket.once("connect", () => socket.emit("join-room", joinPayload));
//     }
//   }, [roomId, userId]);

//   const enterQuiz = useCallback(async () => {
//     try {
//       if (!hasEntered) {
//         const response = await API.post("/quiz/enter", { quizId: roomId });
//         if (response.data.success) {
//           setHasEntered(true);
//           setQuizStatus("waiting");
//           connectAndJoin();
//         }
//       } else {
//         connectAndJoin();
//       }
//     } catch (error) {
//       console.error("Failed to enter quiz:", error);
//       const msg = error?.response?.data?.message || "";
//       if (error.response?.status === 403) setQuizStatus("payment-required");
//       if (/already participated/i.test(msg)) {
//         setHasEntered(true);
//         connectAndJoin();
//       }
//     }
//   }, [roomId, hasEntered, connectAndJoin]);

//   const handleTimeout = useCallback(
//     (question) => {
//       if (!answerGivenRef.current && question) {
//         const timeTaken = 15 - timeLeft;
//         socket.emit("submit-answer", {
//           roomId,
//           userId: userId,
//           questionId: question._id,
//           selectedIndex: -1,
//           timeTaken,
//         });
//         setDisabled(true);
//         answerGivenRef.current = true;
//       }
//     },
//     [roomId, userId, timeLeft]
//   );

//   const handleAnswer = useCallback(
//     (selectedIndex) => {
//       if (answerGivenRef.current || !currentQuestion) return;

//       answerGivenRef.current = true;
//       setDisabled(true);

//       if (timerRef.current) clearInterval(timerRef.current);

//       const timeTaken = 15 - timeLeft;

//       socket.emit("submit-answer", {
//         roomId,
//         userId: userId,
//         questionId: currentQuestion._id,
//         selectedIndex,
//         timeTaken,
//       });
//     },
//     [roomId, userId, currentQuestion, timeLeft]
//   );

//   // ------------------------ LIFECYCLE ------------------------
//   useEffect(() => {
//     if (!userId) {
//       navigate("/login");
//       return;
//     }
//     checkEligibility();
//     getQuizData();
//   }, [userId, navigate, checkEligibility, getQuizData]);

//   useEffect(() => {
//     const onConnect = () => console.log("Socket connected successfully");
//     const onConnectError = (error) => console.error("Socket connection error:", error);
//     const onDisconnect = (reason) => console.log("Socket disconnected:", reason);

//     const onQuestion = (data) => {
//       answerGivenRef.current = false;
//       const question = data.question || data;
//       setCurrentQuestion(question);
//       setCurrentQuestionIndex(data.questionIndex || 1);
//       setDisabled(false);

//       const serverStartMs = Number(data.startTime) || Date.now();
//       const durationMs = Number(data.timeLeft) || 15000;
//       startTimeRef.current = serverStartMs;
//       durationMsRef.current = durationMs;

//       const computeRemaining = () =>
//         Math.max(0, Math.ceil(startTimeRef.current + durationMsRef.current - Date.now()) / 1000);
//       setTimeLeft(computeRemaining());

//       if (timerRef.current) clearInterval(timerRef.current);
//       timerRef.current = setInterval(() => {
//         const remaining = Math.max(
//           0,
//           Math.ceil(startTimeRef.current + durationMsRef.current - Date.now()) / 1000
//         );
//         setTimeLeft(remaining);
//         if (remaining <= 0) {
//           clearInterval(timerRef.current);
//           handleTimeout(question);
//         }
//       }, 250);

//       setQuizStatus("active");
//     };

//     const onAnswerResult = (result) => {
//       setAnswers((prev) => [
//         ...prev,
//         { questionId: result.questionId, correct: result.correct, points: result.points },
//       ]);
//       setScore(result.totalScore);
//     };

//     const onTimeLeft = (payload) => {
//       if (!payload) return;
//       setTimeLeft(Math.max(0, Number(payload.remaining) || 0));
//     };

//     const onQuizCompleted = (result) => {
//       setQuizStatus("completed");
//       setScore(result.score);
//       setTimeout(() => navigate("/winners"), 3000);
//     };

//     const onQuizEnded = () => {
//       setQuizStatus("ended");
//       setTimeout(() => navigate("/winners"), 2000);
//     };

//     const onAnswerError = (error) => {
//       console.error("Answer submission error:", error);
//       setDisabled(false);
//     };

//     socket.on("connect", onConnect);
//     socket.on("connect_error", onConnectError);
//     socket.on("disconnect", onDisconnect);
//     socket.on("question", onQuestion);
//     socket.on("answer-result", onAnswerResult);
//     socket.on("time-left", onTimeLeft);
//     socket.on("quiz-completed", onQuizCompleted);
//     socket.on("quiz-ended", onQuizEnded);
//     socket.on("answer-error", onAnswerError);

//     return () => {
//       socket.off("connect", onConnect);
//       socket.off("connect_error", onConnectError);
//       socket.off("disconnect", onDisconnect);
//       socket.off("question", onQuestion);
//       socket.off("answer-result", onAnswerResult);
//       socket.off("quiz-completed", onQuizCompleted);
//       socket.off("quiz-ended", onQuizEnded);
//       socket.off("answer-error", onAnswerError);
//       socket.off("time-left", onTimeLeft);
//       if (timerRef.current) clearInterval(timerRef.current);
//     };
//   }, [navigate, handleTimeout]);

//   // ------------------------ REDIRECT IF NO QUESTION ------------------------
//   useEffect(() => {
//     if (!currentQuestion && quizStatus === "active") {
//       const timer = setTimeout(() => {
//         navigate("/");
//       }, 3000);
//       return () => clearTimeout(timer);
//     }
//   }, [currentQuestion, navigate, quizStatus]);

//   // ------------------------ RENDER ------------------------
//   if (quizStatus === "loading") {
//     return (
//       <div style={{ padding: 24, textAlign: "center" }}>
//         <h2>Loading Quiz...</h2>
//         <p>Please wait while we prepare your quiz.</p>
//       </div>
//     );
//   }

//   if (quizStatus === "not-live") {
//     return (
//       <div style={{ padding: 24, textAlign: "center" }}>
//         <h2>Quiz Not Live Yet</h2>
//         <p>The quiz will start at 8:00 PM. Please wait...</p>
//         <button
//           onClick={() => navigate("/")}
//           style={{
//             padding: "10px 20px",
//             backgroundColor: "#28a745",
//             color: "white",
//             border: "none",
//             borderRadius: "5px",
//             cursor: "pointer",
//           }}
//         >
//           Go Home
//         </button>
//       </div>
//     );
//   }

//   if (quizStatus === "already-participated") {
//     return (
//       <div style={{ padding: 24, textAlign: "center" }}>
//         <h2>Already Participated</h2>
//         <p>You have already participated in today's quiz.</p>
//         <button
//           onClick={() => navigate("/winners")}
//           style={{
//             padding: "10px 20px",
//             backgroundColor: "#007bff",
//             color: "white",
//             border: "none",
//             borderRadius: "5px",
//             cursor: "pointer",
//           }}
//         >
//           View Results
//         </button>
//       </div>
//     );
//   }

//   if (!currentQuestion) {
//     return (
//       <div style={{ padding: 24, textAlign: "center" }}>
//         <h2>Waiting for Questions...</h2>
//         <p>Redirecting to home in 3 seconds...</p>
//       </div>
//     );
//   }

//   // ------------------------ QUIZ DISPLAY ------------------------
//   return (
//     <div style={{ padding: 24 }}>
//       <div
//         style={{
//           display: "flex",
//           justifyContent: "space-between",
//           alignItems: "center",
//           marginBottom: 20,
//           padding: "10px 0",
//           borderBottom: "1px solid #eee",
//         }}
//       >
//         <div>
//           <h3>
//             Question {currentQuestionIndex} of {quizData?.totalQuestions || 50}
//           </h3>
//           <p>Score: {score}</p>
//         </div>
//         <div
//           style={{
//             fontSize: "24px",
//             fontWeight: "bold",
//             color: timeLeft <= 5 ? "#dc3545" : "#28a745",
//           }}
//         >
//           ⏱ {timeLeft}s
//         </div>
//       </div>

//       <div style={{ marginBottom: 20 }}>
//         <h4 style={{ fontSize: "18px", marginBottom: 15 }}>{currentQuestion.text}</h4>

//         <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
//           {currentQuestion.options && currentQuestion.options.length > 0
//             ? currentQuestion.options.map((option, index) => (
//                 <button
//                   key={index}
//                   onClick={() => handleAnswer(index)}
//                   disabled={disabled}
//                   style={{
//                     padding: "10px 15px",
//                     border: "1px solid #ccc",
//                     borderRadius: "5px",
//                     cursor: disabled ? "not-allowed" : "pointer",
//                     backgroundColor: "#fff",
//                   }}
//                 >
//                   {option}
//                 </button>
//               ))
//             : null}
//         </div>
//       </div>

//       <div style={{ height: 10, backgroundColor: "#eee", borderRadius: 5 }}>
//         <div
//           style={{
//             width: `${((currentQuestionIndex - 1) / (quizData?.totalQuestions || 50)) * 100}%`,
//             height: "100%",
//             backgroundColor: "#28a745",
//             borderRadius: 5,
//             transition: "width 0.3s",
//           }}
//         />
//       </div>
//     </div>
//   );
// }












// import React, { useEffect, useState, useRef, useContext, useCallback } from "react";
// import { useNavigate } from "react-router-dom";
// import { io } from "socket.io-client";
// import { AuthContext } from "../context/AuthContext";
// import API from "../utils/api";

// const socket = io(process.env.REACT_APP_API_URL?.replace('/api','') || "http://localhost:5000", { autoConnect: false });

// export default function QuizPage() {
//   const { user } = useContext(AuthContext);
//   const userId = user?._id;
//   const navigate = useNavigate();
//   const [quizData, setQuizData] = useState(null);
//   const [currentQuestion, setCurrentQuestion] = useState(null);
//   const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
//   const [timeLeft, setTimeLeft] = useState(15);
//   const [disabled, setDisabled] = useState(false);
//   const [roomId, setRoomId] = useState(null);
//   const [quizStatus, setQuizStatus] = useState('loading'); // loading, waiting, active, completed
//   const [score, setScore] = useState(0);
//   const [, setAnswers] = useState([]);
//   const [, setIsEligible] = useState(false);
//   const [hasEntered, setHasEntered] = useState(false);
  
//   const answerGivenRef = useRef(false);
//   const timerRef = useRef(null);
//   const startTimeRef = useRef(null);
//   const durationMsRef = useRef(15000);

//   // Check quiz eligibility
//   const checkEligibility = useCallback(async () => {
//     try {
//       const response = await API.get("/quiz/eligibility");
//       setIsEligible(response.data.eligible);
//       // Do not override if quiz is live / already in waiting or active states
//       setQuizStatus((prev) => {
//         if (prev === 'waiting' || prev === 'active') return prev;
//         return response.data.eligible ? prev : 'not-eligible';
//       });
//     } catch (error) {
//       console.error("Eligibility check failed:", error);
//       setQuizStatus('error');
//     }
//   }, []);

//   // Get today's quiz data
//   const getQuizData = useCallback(async () => {
//     try {
//       const response = await API.get("/quiz/today");
//       if (response.data.exists) {
//         setQuizData(response.data.quiz);
//         setRoomId(response.data.quiz._id);
        
//         if (response.data.quiz.isLive) {
//           setQuizStatus('waiting');
//         } else if (response.data.quiz.userParticipated) {
//           setQuizStatus('already-participated');
//         } else {
//           setQuizStatus('not-live');
//         }
//       } else {
//         setQuizStatus('no-quiz');
//       }
//     } catch (error) {
//       console.error("Failed to fetch quiz data:", error);
//       setQuizStatus('error');
//     }
//   }, []);

//   const connectAndJoin = useCallback(() => {
//     let deviceId = localStorage.getItem('deviceId');
//     if (!deviceId) {
//       deviceId = Math.random().toString(36).slice(2) + Date.now();
//       localStorage.setItem('deviceId', deviceId);
//     }
//     socket.auth = { token: localStorage.getItem("token") };
//     if (!socket.connected) socket.connect();
//     const joinPayload = { roomId, userId: userId, deviceId };
//     if (socket.connected) {
//       socket.emit("join-room", joinPayload);
//     } else {
//       socket.once('connect', () => socket.emit('join-room', joinPayload));
//     }
//   }, [roomId, userId]);

//   // Enter quiz
//   const enterQuiz = useCallback(async () => {
//     try {
//       console.log("Attempting to enter quiz with roomId:", roomId);
//       if (!hasEntered) {
//         const response = await API.post("/quiz/enter", { quizId: roomId });
//         console.log("Enter quiz response:", response.data);
//         if (response.data.success) {
//           setHasEntered(true);
//           setQuizStatus('waiting');
//           connectAndJoin();
//         }
//       } else {
//         connectAndJoin();
//       }
//     } catch (error) {
//       console.error("Failed to enter quiz:", error);
//       const msg = error?.response?.data?.message || '';
//       if (error.response?.status === 403) setQuizStatus('payment-required');
//       if (/already participated/i.test(msg)) {
//         setHasEntered(true);
//         connectAndJoin();
//       }
//     }
//   }, [roomId, hasEntered, connectAndJoin]);

//   const handleTimeout = useCallback((question) => {
//     if (!answerGivenRef.current && question) {
//       const timeTaken = 15 - timeLeft;
//       socket.emit("submit-answer", {
//         roomId,
//         userId: userId,
//         questionId: question._id,
//         selectedIndex: -1, // No answer selected
//         timeTaken,
//       });
//       setDisabled(true);
//       answerGivenRef.current = true;
//     }
//   }, [roomId, userId, timeLeft]);

//   const handleAnswer = useCallback((selectedIndex) => {
//     if (answerGivenRef.current || !currentQuestion) return;
    
//     answerGivenRef.current = true;
//     setDisabled(true);
    
//     if (timerRef.current) clearInterval(timerRef.current);
    
//     const timeTaken = 15 - timeLeft;
    
//     socket.emit("submit-answer", {
//       roomId,
//       userId: userId,
//       questionId: currentQuestion._id,
//       selectedIndex,
//       timeTaken,
//     });
//   }, [roomId, userId, currentQuestion, timeLeft]);

//   // Complete quiz (unused for now)
//   // const _completeQuiz = useCallback(() => {
//   //   socket.emit("complete-quiz", {
//   //     roomId,
//   //     userId: user._id
//   //   });
//   // }, [roomId, user]);

//   useEffect(() => {
//     if (!userId) {
//       navigate("/login");
//       return;
//     }

//     console.log("QuizPage mounted, userId:", userId);
//     checkEligibility();
//     getQuizData();

//     return undefined;
//   }, [userId, navigate, checkEligibility, getQuizData]);

//   // Socket event listeners: wire once, don't disconnect on re-render
//   useEffect(() => {
//     const onConnect = () => console.log('Socket connected successfully');
//     const onConnectError = (error) => console.error('Socket connection error:', error);
//     const onDisconnect = (reason) => console.log('Socket disconnected:', reason);

//     const onQuestion = (data) => {
//       console.log("Received question data:", data);
//       answerGivenRef.current = false;
      
//       // Extract question from the data structure
//       const question = data.question || data;
//       setCurrentQuestion(question);
//       // Server sends 1-based questionIndex; display as-is
//       setCurrentQuestionIndex(data.questionIndex || 1);
//       setDisabled(false);
//       // Use server-provided startTime and duration to compute remaining time continuously
//       const serverStartMs = Number(data.startTime) || Date.now();
//       const durationMs = Number(data.timeLeft) || 15000;
//       startTimeRef.current = serverStartMs;
//       durationMsRef.current = durationMs;
//       const computeRemaining = () => {
//         const endMs = startTimeRef.current + durationMsRef.current;
//         const remaining = Math.max(0, Math.ceil((endMs - Date.now()) / 1000));
//         return remaining;
//       };
//       setTimeLeft(computeRemaining());
//       setQuizStatus('active');

//       if (timerRef.current) clearInterval(timerRef.current);
//       timerRef.current = setInterval(() => {
//         const remaining = Math.max(0, Math.ceil((startTimeRef.current + durationMsRef.current - Date.now()) / 1000));
//         setTimeLeft(remaining);
//         if (remaining <= 0) {
//           clearInterval(timerRef.current);
//           handleTimeout(question);
//         }
//       }, 250);
//     };

//     const onAnswerResult = (result) => {
//       setAnswers(prev => [...prev, {
//         questionId: result.questionId,
//         correct: result.correct,
//         points: result.points
//       }]);
//       setScore(result.totalScore);
//     };

//     const onTimeLeft = (payload) => {
//       if (!payload) return;
//       // payload: { questionIndex, remaining }
//       setTimeLeft(Math.max(0, Number(payload.remaining) || 0));
//     };

//     const onQuizCompleted = (result) => {
//       setQuizStatus('completed');
//       setScore(result.score);
//       // Redirect to results after 3 seconds
//       setTimeout(() => {
//         navigate("/winners");
//       }, 3000);
//     };

//     const onQuizEnded = () => {
//       setQuizStatus('ended');
//       setTimeout(() => {
//         navigate("/winners");
//       }, 2000);
//     };

//     const onAnswerError = (error) => {
//       console.error("Answer submission error:", error);
//       setDisabled(false);
//     };

//     socket.on('connect', onConnect);
//     socket.on('connect_error', onConnectError);
//     socket.on('disconnect', onDisconnect);
//     socket.on("question", onQuestion);
//     socket.on("answer-result", onAnswerResult);
//     socket.on("time-left", onTimeLeft);
//     socket.on("quiz-completed", onQuizCompleted);
//     socket.on("quiz-ended", onQuizEnded);
//     socket.on("answer-error", onAnswerError);

//     return () => {
//       socket.off('connect', onConnect);
//       socket.off('connect_error', onConnectError);
//       socket.off('disconnect', onDisconnect);
//       socket.off("question", onQuestion);
//       socket.off("answer-result", onAnswerResult);
//       socket.off("quiz-completed", onQuizCompleted);
//       socket.off("quiz-ended", onQuizEnded);
//       socket.off("answer-error", onAnswerError);
//       socket.off("time-left", onTimeLeft);
//       if (timerRef.current) clearInterval(timerRef.current);
//     };
//   }, [navigate, handleTimeout, setAnswers]);

//   // Render different states
//   if (quizStatus === 'loading') {
//     return (
//       <div style={{ padding: 24, textAlign: 'center' }}>
//         <h2>Loading Quiz...</h2>
//         <p>Please wait while we prepare your quiz.</p>
//       </div>
//     );
//   }

//   // if (quizStatus === 'not-eligible') {
//   //   return (
//   //     <div style={{ padding: 24, textAlign: 'center' }}>
//   //       <h2>Payment Required</h2>
//   //       <p>You need to pay ₹5 to participate in today's quiz.</p>
//   //       <button 
//   //         onClick={() => navigate("/")}
//   //         style={{ 
//   //           padding: '10px 20px', 
//   //           backgroundColor: '#007bff', 
//   //           color: 'white', 
//   //           border: 'none', 
//   //           borderRadius: '5px',
//   //           cursor: 'pointer'
//   //         }}
//   //       >
//   //         Pay Now
//   //       </button>
//   //     </div>
//   //   );
//   // }

//   // if (quizStatus === 'payment-required') {
//   //   return (
//   //     <div style={{ padding: 24, textAlign: 'center' }}>
//   //       <h2>Payment Required</h2>
//   //       <p>You need to pay ₹5 to participate in today's quiz.</p>
//   //       <button 
//   //         onClick={() => navigate("/")}
//   //         style={{ 
//   //           padding: '10px 20px', 
//   //           backgroundColor: '#007bff', 
//   //           color: 'white', 
//   //           border: 'none', 
//   //           borderRadius: '5px',
//   //           cursor: 'pointer'
//   //         }}
//   //       >
//   //         Pay Now
//   //       </button>
//   //     </div>
//   //   );
//   // }

//   if (quizStatus === 'not-live') {
//     return (
//       <div style={{ padding: 24, textAlign: 'center' }}>
//         <h2>Quiz Not Live Yet</h2>
//         <p>The quiz will start at 8:00 PM. Please wait...</p>
//         <button 
//           onClick={() => navigate("/")}
//           style={{ 
//             padding: '10px 20px', 
//             backgroundColor: '#28a745', 
//             color: 'white', 
//             border: 'none', 
//             borderRadius: '5px',
//             cursor: 'pointer'
//           }}
//         >
//           Go Home
//         </button>
//       </div>
//     );
//   }

//   if (quizStatus === 'already-participated') {
//     return (
//       <div style={{ padding: 24, textAlign: 'center' }}>
//         <h2>Already Participated</h2>
//         <p>You have already participated in today's quiz.</p>
//         <button 
//           onClick={() => navigate("/winners")}
//           style={{ 
//             padding: '10px 20px', 
//             backgroundColor: '#007bff', 
//             color: 'white', 
//             border: 'none', 
//             borderRadius: '5px',
//             cursor: 'pointer'
//           }}
//         >
//           View Results
//         </button>
//       </div>
//     );
//   }

// // if (quizStatus === "no-quiz") {
// //   return (
// //     <div className="no-quiz-container">
// //       <div className="no-quiz-card">
// //         <h2>🚫 No Quiz Today</h2>
// //         <p>
// //           There’s no quiz scheduled for today.
// //           <br />
// //           Check back tomorrow at <strong>8:00 PM</strong>!
// //         </p>
// //         <button onClick={() => navigate("/")} className="go-home-btn">
// //           🏠 Go Home
// //         </button>
// //       </div>
// //     </div>
// //   );
// // }


//   // if (quizStatus === 'waiting') {
//   //   return (
//   //     <div style={{ padding: 24, textAlign: 'center' }}>
//   //       <h2>Quiz is Live!</h2>
//   //       <p>Join the quiz now to participate.</p>
//   //       <div style={{ marginTop: 20 }}>
//   //         <p>Participants: {quizData?.currentParticipants || 0} / {quizData?.maxParticipants || 2000}</p>
//   //       </div>
//   //       <button 
//   //         onClick={hasEntered ? connectAndJoin : enterQuiz}
//   //         style={{ 
//   //           padding: '15px 30px', 
//   //           backgroundColor: '#28a745', 
//   //           color: 'white', 
//   //           border: 'none', 
//   //           borderRadius: '8px',
//   //           cursor: 'pointer',
//   //           fontSize: '18px',
//   //           fontWeight: 'bold',
//   //           marginTop: '20px'
//   //         }}
//   //       >
//   //         {hasEntered ? 'Reconnect to Quiz' : 'Join Quiz Now'}
//   //       </button>
//   //     </div>
//   //   );
//   // }

//   if (quizStatus === 'completed') {
//     return (
//       <div style={{ padding: 24, textAlign: 'center' }}>
//         <h2>Quiz Completed!</h2>
//         <p>Your Score: {score}</p>
//         <p>Redirecting to results...</p>
//       </div>
//     );
//   }

//   if (quizStatus === 'ended') {
//     return (
//       <div style={{ padding: 24, textAlign: 'center' }}>
//         <h2>Quiz Ended</h2>
//         <p>Redirecting to results...</p>
//       </div>
//     );
//   }

//   if (!currentQuestion) {
//     return (
//       <div style={{ padding: 24, textAlign: 'center' }}>
//         <h2>Waiting for Questions...</h2>
        
//       </div>
//     );
//   }

//   return (
//     <div style={{ padding: 24 }}>
//       {/* Quiz Header */}
//       <div style={{ 
//         display: 'flex', 
//         justifyContent: 'space-between', 
//         alignItems: 'center',
//         marginBottom: 20,
//         padding: '10px 0',
//         borderBottom: '1px solid #eee'
//       }}>
//         <div>
//           <h3>Question {currentQuestionIndex} of {quizData?.totalQuestions || 50}</h3>
//           <p>Score: {score}</p>
//         </div>
//         <div style={{ 
//           fontSize: '24px', 
//           fontWeight: 'bold',
//           color: timeLeft <= 5 ? '#dc3545' : '#28a745'
//         }}>
//           ⏱ {timeLeft}s
//         </div>
//       </div>

//       {/* Question */}
//       <div style={{ marginBottom: 20 }}>
//         <h4 style={{ fontSize: '18px', marginBottom: 15 }}>
//           {currentQuestion.text}
//         </h4>
        
//         {/* Options */}
//         <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
//           {currentQuestion.options && currentQuestion.options.length > 0 ? currentQuestion.options.map((option, index) => (
//             <button
//               key={index}
//               disabled={disabled}
//               onClick={() => handleAnswer(index)}
//               style={{
//                 padding: 15,
//                 width: "100%",
//                 textAlign: "left",
//                 cursor: disabled ? "not-allowed" : "pointer",
//                 backgroundColor: disabled ? "#f8f9fa" : "#fff",
//                 borderRadius: 8,
//                 border: "2px solid #dee2e6",
//                 fontSize: '16px',
//                 transition: 'all 0.2s ease',
//                 opacity: disabled ? 0.6 : 1
//               }}
//               onMouseEnter={(e) => {
//                 if (!disabled) {
//                   e.target.style.backgroundColor = "#e9ecef";
//                   e.target.style.borderColor = "#007bff";
//                 }
//               }}
//               onMouseLeave={(e) => {
//                 if (!disabled) {
//                   e.target.style.backgroundColor = "#fff";
//                   e.target.style.borderColor = "#dee2e6";
//                 }
//               }}
//             >
//               {String.fromCharCode(65 + index)}. {option}
//             </button>
//           )) : (
//             <div style={{ padding: 20, textAlign: 'center', color: '#666' }}>
//               No options available for this question
//             </div>
//           )}
//         </div>
//       </div>

//       {/* Progress Bar */}
//       <div style={{ 
//         width: '100%', 
//         backgroundColor: '#e9ecef', 
//         borderRadius: 10, 
//         height: 8,
//         marginTop: 20
//       }}>
//         <div style={{
//           width: `${(currentQuestionIndex / (quizData?.totalQuestions || 50)) * 100}%`,
//           backgroundColor: '#007bff',
//           height: '100%',
//           borderRadius: 10,
//           transition: 'width 0.3s ease'
//         }}></div>
//       </div>
//     </div>
//   );
// }
