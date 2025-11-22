// // // frontend/src/pages/LandingPage.jsx

// import React, { useEffect, useState, useContext } from "react";
// import { useNavigate } from "react-router-dom";
// import { AuthContext } from "../context/AuthContext";
// import DarkModeToggle from "../components/DarkModeToggle";
// import BottomNavBar from "../components/BottomNavBar";
// import ProfileDrawer from "../components/ProfileDrawer";
// import API from "../utils/api";
// import "../styles/global.css";
// import AnimatedContent from "../components/AnimatedContent";

// function getNext8PM() {
//   const now = new Date();
//   const start = new Date(now);
//   start.setHours(20, 0, 0, 0);
//   if (now >= start) start.setDate(start.getDate() + 1);
//   return start;
// }

// function isQuizLive() {
//   const now = new Date();
//   const start = new Date();
//   const end = new Date();
//   start.setHours(20, 0, 0, 0);
//   end.setHours(20, 30, 0, 0);
//   return now >= start && now <= end;
// }

// export default function LandingPage() {
//   const { user, token } = useContext(AuthContext);
//   const navigate = useNavigate();
//   const [drawerOpen, setDrawerOpen] = useState(false);
//   const [target, setTarget] = useState(getNext8PM());
//   const [timeLeft, setTimeLeft] = useState("");
//   const [joinedCount] = useState(0);
//   const totalStudents = 2000;

//   // ⏰ Countdown Timer
//   useEffect(() => {
//     const timer = setInterval(() => {
//       const diff = target - new Date();
//       if (diff <= 0) {
//         setTarget(getNext8PM());
//         return;
//       }
//       const hrs = String(Math.floor(diff / 3600000)).padStart(2, "0");
//       const mins = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
//       const secs = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
//       setTimeLeft(`${hrs}:${mins}:${secs}`);
//     }, 500);
//     return () => clearInterval(timer);
//   }, [target]);

//   // 🚀 Auto redirect if quiz is live
//   useEffect(() => {
//     if (isQuizLive()) navigate("/quiz");
//   }, [navigate]);

//   // 💳 Load Razorpay script dynamically
//   useEffect(() => {
//     const script = document.createElement("script");
//     script.src = "https://checkout.razorpay.com/v1/checkout.js";
//     script.async = true;
//     document.body.appendChild(script);
//     return () => document.body.removeChild(script);
//   }, []);

//   const handleJoin = async () => {
//     if (!user || !token) {
//       navigate("/login");
//       return;
//     }

//     try {
//       // 🔍 Check if user already paid for today
//       const response = await API.get("/payments/quiz-status", {
//         headers: { Authorization: `Bearer ${token}` },
//       });

//       if (response.data.hasPaidToday) {
//         navigate("/quiz");
//         return;
//       }

//       // 💰 Create new Razorpay order
//       const orderRes = await API.post(
//         "/payments/create-order",
//         { amount: 500 }, // ₹5 (500 paise)
//         { headers: { Authorization: `Bearer ${token}` } }
//       );

//       const orderData = orderRes.data;

//       if (!orderData.order || !orderData.key) {
//         alert("Failed to create payment order. Please try again.");
//         return;
//       }

//       // ⚙️ Setup Razorpay Checkout
//       const options = {
//         key: orderData.key,
//         amount: orderData.order.amount,
//         currency: "INR",
//         name: "Daily Mind Education",
//         description: "Quiz Entry Fee",
//         order_id: orderData.order.id,
//         handler: async function (response) {
//           try {
//             // ✅ Verify payment
//             const verifyRes = await API.post("/payments/verify", response, {
//               headers: { Authorization: `Bearer ${token}` },
//             });

//             if (verifyRes.data.success) {
//               alert("✅ Payment successful!");
//               navigate("/quiz");
//             } else {
//               alert("❌ Payment verification failed.");
//             }
//           } catch (err) {
//             console.error("Verification failed:", err);
//             alert("⚠️ Payment verification error.");
//           }
//         },
//         prefill: {
//           name: user?.name || "Student",
//           email: user?.email || "user@example.com",
//           contact: user?.phone || "9999999999",
//         },
//         theme: { color: "#3399cc" },
//       };

//       const rzp = new window.Razorpay(options);
//       rzp.on("payment.failed", function (response) {
//         alert("❌ Payment Failed: " + response.error.description);
//       });
//       rzp.open();
//     } catch (error) {
//       console.error("Payment error:", error);
//       navigate("/payment"); // fallback
//     }
//   };

//   return (
//     <>
//       <header className="header">
//         <div className="logo">
//           <img src="/imgs/logo-DME.png" alt="Logo" />
//         </div>
//         <DarkModeToggle />
//         <h2>UPCOMING QUIZ</h2>
//       </header>

//       <div className="container">
//         <div className="class">Class 12th</div>
//         <div className="quiz-time">Quiz Starts In</div>
//         <div className="time-highlight">08:00 PM to 08:30 PM</div>

//         <div className="countdown-wrapper">
//           {["Hours", "Minutes", "Seconds"].map((label, i) => {
//             const val = timeLeft.split(":")[i] || "00";
//             const icons = ["⏰", "🕑", "⏱️"];
//             return (
//               <div key={i} className="countdown-item">
//                 <span className="icon">{icons[i]}</span>
//                 <span>{val}</span>
//                 <div className="label">{label}</div>
//               </div>
//             );
//           })}
//         </div>

//         <div className="progress-container" style={{ width: "100%", margin: "10px 0" }}>
//           <div
//             style={{
//               backgroundColor: "#ddd",
//               borderRadius: "10px",
//               height: "5px",
//               width: "100%",
//             }}
//           >
//             <div
//               style={{
//                 height: "100%",
//                 width: `${Math.min((joinedCount / totalStudents) * 100, 100)}%`,
//                 backgroundColor: "#4caf50",
//                 borderRadius: "10px",
//                 transition: "width 0.5s ease-in-out",
//               }}
//             ></div>
//           </div>
//           <div style={{ textAlign: "center", marginTop: "5px", fontWeight: "bold" }}>
//             {joinedCount}+ Students Joined
//           </div>
//         </div>

//         <AnimatedContent
//           distance={150}
//           direction="vertical"
//           duration={1.2}
//           ease="elastic.out(1, 0.5)"
//           initialOpacity={0.2}
//           animateOpacity
//           scale={1.05}
//           threshold={0.3}
//           triggerOnScroll={false}
//         >
//           <div className="price-row">
//             <div className="price-left">
//               <h6>Join for</h6>
//               <div className="price">Rs. 5 Only</div>
//             </div>
//             <button className="join-btn" onClick={handleJoin}>
//               JOIN NOW
//             </button>
//           </div>
//         </AnimatedContent>
//       </div>

//       <div className="info-box">
//         <h3>
//           ✨ <span className="highlight">छात्रों के लिए <span className="highlight">सुनहरा अवसर</span></span> ✨
//         </h3>
//         <p>
//           <strong>Daily Mind Education प्रतियोगिता परीक्षा</strong>, जिसमें <strong>मात्र 2000 छात्र</strong> भाग ले पाएंगे।
//         </p>
//         <p>प्रतियोगिता परीक्षा <strong>दो लेवल</strong> में होगी:</p>
//         <ul>
//           <li>📘 10th Level</li>
//           <li>📗 12th Level</li>
//         </ul>
//         <p>
//           <strong>ग्रैजुएशन</strong> तक के कोई भी छात्र इस परीक्षा में भाग ले सकते हैं।
//         </p>
//         <p>
//           🏆 कुल <strong>20 छात्र विजेता</strong> होंगे, जिनमें <strong>6 को बड़े पुरस्कार</strong> मिलेंगे:
//         </p>
//         <ul>
//           <li>🥇 प्रथम पुरस्कार (2 छात्र): ₹10,000/-</li>
//           <li>🥈 द्वितीय पुरस्कार (2 छात्र): ₹5,000/-</li>
//           <li>🥉 तृतीय पुरस्कार (2 छात्र): ₹2,500/-</li>
//         </ul>
//         <p>
//           🔸 बाकी <strong>14 छात्रों को ₹500/-</strong> और <span className="green">सभी छात्रों को नोट्स फ्री</span>
//         </p>
//         <p>📘 <strong>PDF Notes फ्री</strong> – जिस भी कक्षा या विषय के होंगे, माँगे जाने पर दिए जाएंगे।</p>
//         <p className="fee">
//           <strong>💰 रजिस्ट्रेशन शुल्क: ₹5/- मात्र</strong>
//         </p>

//         <div className="contact">
//           <p>📲 <strong>WhatsApp / Call:</strong> 8578986352</p>
//           <p>📧 <strong>Email:</strong> dailymind.edu@gmail.com</p>
//           <div className="t-and-c">
//             <h6>
//               This educational platform is intended for students in India. All transactions comply with Indian regulations.
//               Participation is subject to terms and conditions.
//             </h6>
//           </div>
//         </div>
//       </div>

//       <ProfileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
//       <BottomNavBar onProfileClick={() => setDrawerOpen(true)} />
//     </>
//   );
// }

import React, { useEffect, useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import DarkModeToggle from "../components/DarkModeToggle";
import BottomNavBar from "../components/BottomNavBar";
import ProfileDrawer from "../components/ProfileDrawer";
import API from "../utils/api";
import "../styles/global.css";
import AnimatedContent from "../components/AnimatedContent";
import { requestNotificationPermission, showQuizReadyNotification, showQuizStartedNotification } from "../utils/notifications";
import { io } from "socket.io-client";

// Helper functions
function getNext8PM() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(20, 0, 0, 0);
  if (now >= start) start.setDate(start.getDate() + 1);
  return start;
}

// function isQuizLive() {
//   const now = new Date();
//   const start = new Date();
//   const end = new Date();
//   start.setHours(20, 0, 0, 0);
//   end.setHours(20, 30, 0, 0);
//   return now >= start && now <= end;
// }

export default function LandingPage() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [target, setTarget] = useState(getNext8PM());
  const [timeLeft, setTimeLeft] = useState("");
  const [joinedCount] = useState(0);
  const [quizReady, setQuizReady] = useState(false);
  const [readyMessage, setReadyMessage] = useState("");
  const totalStudents = 2000;

  // 🕒 Countdown logic
  useEffect(() => {
    const timer = setInterval(() => {
      const diff = target - new Date();
      if (diff <= 0) {
        setTarget(getNext8PM());
        return;
      }
      const hrs = String(Math.floor(diff / 3600000)).padStart(2, "0");
      const mins = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
      const secs = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
      setTimeLeft(`${hrs}:${mins}:${secs}`);
    }, 500);
    return () => clearInterval(timer);
  }, [target]);

  // 💳 Load Razorpay script once
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
    return () => document.body.removeChild(script);
  }, []);

  // 🔔 Setup notifications and socket connection
  useEffect(() => {
    // Request notification permission
    requestNotificationPermission();

    // Only connect to socket if user is logged in
    if (!user || !localStorage.getItem('token')) {
      return;
    }

    // Connect to socket for quiz events
    const apiUrl = process.env.REACT_APP_API_URL?.replace("/api", "") || 'http://localhost:5000';
    const socket = io(apiUrl, {
      auth: {
        token: localStorage.getItem('token')
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    // Listen for quiz ready event
    socket.on('quiz-ready', (data) => {
      console.log('🔔 Quiz ready event received:', data);
      setQuizReady(true);
      setReadyMessage(data.message || 'Quiz starting in 1 minute! Join now!');
      
      // Show notification
      showQuizReadyNotification(data);
    });

    // Listen for quiz started event
    socket.on('quiz-started', (data) => {
      console.log('🎯 Quiz started event received:', data);
      setQuizReady(false);
      setReadyMessage('');
      
      // Show notification
      showQuizStartedNotification(data);
    });

    // Handle connection errors gracefully
    socket.on('connect_error', (error) => {
      console.warn('Socket connection error (non-critical):', error.message);
      // Don't show error to user, socket will retry
    });

    socket.on('connect', () => {
      console.log('✅ Socket connected successfully');
    });

    socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
    });

    return () => {
      if (socket.connected) {
        socket.disconnect();
      }
    };
  }, [user]);

const handleJoin = async () => {
  if (!user) {
    navigate("/login");
    return;
  }

  try {
    // Check if user already paid for today
    const paymentStatus = await API.get("/payment/quiz-status");
    if (paymentStatus.data.hasPaidToday) {
      // If already paid, check if quiz is live or redirect to payment page
      const quizData = await API.get("/quiz/today");
      if (quizData.data.exists && quizData.data.quiz.isLive) {
        navigate("/quiz");
      } else {
        navigate("/payment");
      }
      return;
    }

    // Show spinner
    const spinner = document.getElementById("joinSpinner");
    if (spinner) spinner.style.display = "flex";

    // Load Razorpay checkout script if not already loaded
    if (typeof window.Razorpay === "undefined") {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      document.body.appendChild(script);
      
      // Wait for script to load
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
        setTimeout(reject, 10000); // 10 second timeout
      });
    }

    // Create Razorpay order
    const orderResponse = await API.post("/payment/create-order", {
      amount: 500, // ₹5 in paise
    });

    // Check if dev mode
    if (orderResponse.data.devMode || orderResponse.data.key === 'dev_key') {
      if (spinner) spinner.style.display = "none";
      alert('✅ Payment simulated (development). You can now join the quiz.');
      // Refresh payment status
      await API.get("/payment/quiz-status");
      navigate("/quiz");
      return;
    }

    const { order, key } = orderResponse.data;

    if (!order || !key) {
      if (spinner) spinner.style.display = "none";
      alert("Failed to create payment order. Please try again.");
      return;
    }

    // Make sure Razorpay is loaded
    if (typeof window.Razorpay === "undefined") {
      if (spinner) spinner.style.display = "none";
      alert("❌ Razorpay script not loaded. Check your internet connection.");
      return;
    }

    // Open Razorpay checkout
    const options = {
      key: key, // Razorpay key from backend
      amount: order.amount, // Rs. 5 = 500 paise
      currency: order.currency || "INR",
      name: "Daily Mind Education",
      description: "Daily Quiz Entry Fee",
      image: "/imgs/logo-DME.png",
      order_id: order.id,
      handler: async function (response) {
        try {
          console.log("Payment response:", response);
          
          const verifyRes = await API.post("/payment/verify", {
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature
          });

          if (verifyRes.data.success) {
            alert("✅ Payment Successful!\nPayment ID: " + response.razorpay_payment_id);
            // Refresh payment status
            await API.get("/payment/quiz-status");
            // Redirect to quiz after successful payment
            navigate("/quiz");
          } else {
            alert("❌ Payment verification failed. Please contact support.");
          }
        } catch (error) {
          console.error("Payment verification failed:", error);
          const errorMsg = error?.response?.data?.message || "Payment verification failed. Please contact support.";
          alert(`⚠️ ${errorMsg}`);
        } finally {
          if (spinner) spinner.style.display = "none";
        }
      },
      prefill: {
        name: user?.fullName || user?.username || "Student",
        email: user?.email || "student@example.com",
        contact: user?.phone || "9999999999"
      },
      notes: {
        purpose: "Quiz Entry Fee",
        userId: user._id
      },
      theme: { 
        color: "#660000" 
      },
      modal: {
        ondismiss: function() {
          if (spinner) spinner.style.display = "none";
        }
      }
    };

    const rzp = new window.Razorpay(options);
    
    // Handle payment failures
    rzp.on("payment.failed", function (response) {
      if (spinner) spinner.style.display = "none";
      alert("❌ Payment Failed: " + (response.error?.description || "Unknown error"));
    });

    if (spinner) spinner.style.display = "none";
    rzp.open();
  } catch (error) {
    console.error("Payment failed:", error);
    const errorMsg = error?.response?.data?.message || error?.message || "Payment initialization failed. Please try again.";
    alert(`⚠️ ${errorMsg}`);
    const spinner = document.getElementById("joinSpinner");
    if (spinner) spinner.style.display = "none";
  }
};


  return (
    <>
      <header className="header">
        <div className="logo">
          <img src="/imgs/logo-DME.png" alt="Logo" />
        </div>

              <DarkModeToggle />
        <h2>UPCOMING QUIZ</h2>
      </header>

      {/* Quiz Ready Banner */}
      {quizReady && (
        <div style={{
          background: 'linear-gradient(135deg, #ff6b6b, #ee5a24)',
          color: 'white',
          padding: '15px',
          textAlign: 'center',
          fontWeight: 'bold',
          fontSize: '18px',
          animation: 'pulse 1s infinite'
        }}>
          🔔 {readyMessage}
        </div>
      )}

      <div className="container">
        <div className="class">Class 12th</div>
        <div className="quiz-time">Quiz Starts In</div>
        <div className="time-highlight">08:00 PM to 08:30 PM</div>

        {/* Countdown timer */}
        <div className="countdown-wrapper">
          {["Hours", "Minutes", "Seconds"].map((label, i) => {
            const val = timeLeft.split(":")[i] || "00";
            const icons = ["⏰", "🕑", "⏱️"];
            return (
              <div key={i} className="countdown-item">
                <span className="icon">{icons[i]}</span>
                <span>{val}</span>
                <div className="label">{label}</div>
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        <div className="progress-container" style={{ width: "100%", margin: "10px 0" }}>
          <div
            style={{
              backgroundColor: "#ddd",
              borderRadius: "10px",
              height: "5px",
              width: "100%",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.min((joinedCount / totalStudents) * 100, 100)}%`,
                backgroundColor: "#4caf50",
                borderRadius: "10px",
                transition: "width 0.5s ease-in-out",
              }}
            ></div>
          </div>
          <div style={{ textAlign: "center", marginTop: "5px", fontWeight: "bold" }}>
            {joinedCount}+ Students Joined
          </div>
        </div>

        {/* Animated Join Section */}
        <AnimatedContent
          distance={150}
          direction="vertical"
          duration={1.2}
          ease="elastic.out(1, 0.5)"
          initialOpacity={0.2}
          animateOpacity
          scale={1.05}
          threshold={0.3}
          delay={0.0}
          triggerOnScroll={false}
        >
          <div className="price-row">
            <div className="price-left">
              <h6>Join for</h6>
              <div className="price">Rs. 5 Only</div>
            </div>
            <button className="join-btn" onClick={handleJoin}>
              JOIN NOW
            </button>
          </div>
        </AnimatedContent>
        
        {/* Spinner for payment processing */}
        <div id="joinSpinner" style={{
          display: "none",
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          background: "rgba(0,0,0,0.5)",
          zIndex: 10000,
          justifyContent: "center",
          alignItems: "center"
        }}>
          <div style={{
            background: "white",
            padding: "30px",
            borderRadius: "10px",
            textAlign: "center"
          }}>
            <div style={{
              border: "4px solid #f3f3f3",
              borderTop: "4px solid #660000",
              borderRadius: "50%",
              width: "40px",
              height: "40px",
              animation: "spin 1s linear infinite",
              margin: "0 auto 15px"
            }}></div>
            <p>Processing payment...</p>
            <style>{`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div className="info-box">
        <h3>
          ✨{" "}
          <span className="highlight">
            छात्रों के लिए <span className="highlight">सुनहरा अवसर</span>
          </span>{" "}
          ✨
        </h3>

        <p>
          <strong>Daily Mind Education प्रतियोगिता परीक्षा</strong>, जिसमें{" "}
          <strong>मात्र 2000 छात्र</strong> भाग ले पाएंगे।
        </p>

        <p>प्रतियोगिता परीक्षा <strong>दो लेवल</strong> में होगी:</p>
        <ul>
          <li>📘 10th Level</li>
          <li>📗 12th Level</li>
        </ul>

        <p>
          <strong>ग्रैजुएशन</strong> तक के कोई भी छात्र इस परीक्षा में भाग ले सकते हैं।
        </p>

        <p>
          🏆 कुल <strong>20 छात्र विजेता</strong> होंगे, जिनमें{" "}
          <strong>6 को बड़े पुरस्कार</strong> मिलेंगे:
        </p>
        <ul>
          <li>🥇 प्रथम पुरस्कार (2 छात्र): ₹10,000/-</li>
          <li>🥈 द्वितीय पुरस्कार (2 छात्र): ₹5,000/-</li>
          <li>🥉 तृतीय पुरस्कार (2 छात्र): ₹2,500/-</li>
        </ul>

        <p>
          🔸 बाकी <strong>14 छात्रों को ₹500/-</strong> और{" "}
          <span className="green">सभी छात्रों को नोट्स फ्री</span>
        </p>

        <p>
          📘 <strong>PDF Notes फ्री</strong> – जिस भी कक्षा या विषय के होंगे, माँगे जाने पर दिए जाएंगे।
        </p>

        <p className="fee">
          <strong>💰 रजिस्ट्रेशन शुल्क: ₹5/- मात्र</strong>
        </p>

        <div className="contact">
          <p>
            📲 <strong>WhatsApp / Call:</strong> 8578986352
          </p>
          <p>
            📧 <strong>Email:</strong> dailymind.edu@gmail.com
          </p>
          <div className="t-and-c">
            <h6>
              This educational platform is intended for students in India. All transactions comply
              with Indian regulations. Participation is subject to terms and conditions.
            </h6>
          </div>
        </div>
      </div>

      <ProfileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <BottomNavBar onProfileClick={() => setDrawerOpen(true)} />
    </>
  );
}


