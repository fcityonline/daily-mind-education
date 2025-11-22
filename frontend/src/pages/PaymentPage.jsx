// // frontend/src/pages/PaymentPage.jsx

// frontend/src/pages/PaymentPage.jsx
import React, { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import DarkModeToggle from "../components/DarkModeToggle";
import BottomNavBar from "../components/BottomNavBar";
import ProfileDrawer from "../components/ProfileDrawer";
import API from "../utils/api";
import "../styles/global.css";

export default function PaymentPage() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 🚦 1️⃣ CHECK IF USER ALREADY PAID FOR TODAY
  useEffect(() => {
    if (!user) return;

    async function checkPayment() {
      try {
        const paymentStatus = await API.get("/payment/quiz-status");

        if (paymentStatus.data.hasPaidToday) {
          const quizData = await API.get("/quiz/today");

          if (quizData.data.exists && quizData.data.quiz.isLive) {
            navigate("/quiz");
          } else {
            navigate("/payment");
          }
        }
      } catch (err) {
        console.error("Payment check error:", err);
      }
    }

    checkPayment();
  }, [user, navigate]);


  // 🔗 2️⃣ Load Razorpay script
  useEffect(() => {
    if (!window.Razorpay) {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.id = "rzp-checkout-script";
      document.body.appendChild(script);
    }
  }, []);

  // 💰 3️⃣ Test Mode Payment Handler
  const handlePayment = () => {
    if (!user) return navigate("/login");

    const spinner = document.createElement("div");
    spinner.id = "spinner-overlay";
    spinner.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.5);
      display: flex; justify-content: center; align-items: center;
      z-index: 99999;
    `;
    spinner.innerHTML = `
      <div style="background:white; padding:25px; border-radius:10px; text-align:center;">
        <div style="border:4px solid #ddd; border-top:4px solid #660000;
        border-radius:50%; width:40px; height:40px; margin:auto;
        animation:spin 1s linear infinite;"></div>
        <p style="margin-top:10px;">Processing...</p>
      </div>
      <style>
        @keyframes spin { 0%{transform:rotate(0deg);} 100%{transform:rotate(360deg);} }
      </style>
    `;
    document.body.appendChild(spinner);
    setLoading(true);

    setTimeout(() => {
      if (!window.Razorpay) {
        alert("❌ Razorpay failed to load. Check connection.");
        spinner.remove();
        setLoading(false);
        return;
      }

      const rzp = new window.Razorpay({
        key: "rzp_test_1DP5mmOlF5G5ag",
        amount: 500, // ₹5
        currency: "INR",
        name: "Quiz Entry",
        description: "Daily Quiz Fee",
        handler: async function (response) {
          alert("✅ Payment Success!\nPayment ID: " + response.razorpay_payment_id);
          spinner.remove();
          navigate("/join-quiz");
        },
        prefill: {
          name: user?.fullName || "Student",
          email: user?.email || "test@example.com",
          contact: user?.phone || "9999999999",
        },
        theme: {
          color: "#3399cc",
        },
      });

      rzp.on("payment.failed", function (response) {
        spinner.remove();
        alert("❌ Payment failed: " + response.error.description);
        setLoading(false);
      });

      spinner.remove();
      setLoading(false);
      rzp.open();
    }, 600);
  };


  if (!user) return null;

  return (
    <>
      <header className="header">
        <div className="logo">
          <img src="/imgs/logo-DME.png" alt="Logo" />
        </div>
        <DarkModeToggle />
        <h2>PAYMENT</h2>
      </header>

      <div className="payment-container" style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
        <div className="payment-card" style={{
          background: "#fff", borderRadius: "12px", padding: "30px",
          boxShadow: "0 4px 6px rgba(0,0,0,0.1)", marginBottom: "20px"
        }}>
          <h2 style={{ marginBottom: "10px", color: "#660000" }}>🎯 Daily Quiz Entry</h2>
          <p style={{ color: "#666", marginBottom: "20px" }}>
            Participate in today's live quiz at 8:00 PM - 8:30 PM IST
          </p>

          <div style={{
            textAlign: "center", marginBottom: "30px", padding: "20px",
            background: "linear-gradient(135deg, #660000, #990000)",
            borderRadius: "12px", color: "white"
          }}>
            <span style={{ fontSize: "24px" }}>₹</span>
            <span style={{ fontSize: "48px", fontWeight: "bold", margin: "0 5px" }}>5</span>
            <span style={{ fontSize: "16px", opacity: 0.9 }}>per quiz</span>
          </div>

          <button
            onClick={handlePayment}
            disabled={loading}
            style={{
              width: "100%", padding: "15px",
              background: loading ? "#aaa" : "#660000",
              color: "white", border: "none", borderRadius: "8px",
              fontSize: "18px", fontWeight: "bold", cursor: "pointer"
            }}
          >
            {loading ? "⌛️Processing..." : "Pay ₹5 & Join Quiz"}
          </button>

          <p style={{ textAlign: "center", marginTop: "10px", color: "#666", fontSize: "14px" }}>
            Secure payments powered by Razorpay
          </p>
        </div>

        <div style={{
          background: "#f8f9fa", padding: "20px", borderRadius: "12px"
        }}>
          <h3 style={{ marginBottom: "15px", color: "#660000" }}>Payment Information</h3>
          <ul style={{ paddingLeft: "20px", lineHeight: "1.8" }}>
            <li>One-time payment per quiz</li>
            <li>Valid for today's quiz only</li>
            <li>Refund if quiz is cancelled</li>
            <li>Secure & encrypted payment</li>
          </ul>
        </div>
      </div>

      <ProfileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <BottomNavBar onProfileClick={() => setDrawerOpen(true)} />
    </>
  );
}
  

// // frontend/src/pages/PaymentPage.jsx
// import React, { useState, useEffect, useContext } from "react";
// import { useNavigate } from "react-router-dom";
// import { AuthContext } from "../context/AuthContext";
// import DarkModeToggle from "../components/DarkModeToggle";
// import BottomNavBar from "../components/BottomNavBar";
// import ProfileDrawer from "../components/ProfileDrawer";
// import "../styles/global.css";

// export default function PaymentPage() {
//   const { user } = useContext(AuthContext);
//   const navigate = useNavigate();
//   const [loading, setLoading] = useState(false);
//   const [drawerOpen, setDrawerOpen] = useState(false);

//   // Load Razorpay script
//   useEffect(() => {
//     if (!window.Razorpay) {
//       const script = document.createElement("script");
//       script.src = "https://checkout.razorpay.com/v1/checkout.js";
//       script.async = true;
//       script.id = "rzp-checkout-script";
//       document.body.appendChild(script);
//     }
//   }, []);

//    // Check if user already paid for today
//     const paymentStatus = await API.get("/payment/quiz-status");
//     if (paymentStatus.data.hasPaidToday) {
//       // If already paid, check if quiz is live or redirect to payment page
//       const quizData = await API.get("/quiz/today");
//       if (quizData.data.exists && quizData.data.quiz.isLive) {
//         navigate("/quiz");
//       } else {
//         navigate("/payment");
//       }
//       return;

//   const handlePayment = () => {
//     if (!user) return navigate("/login");

//     // Show loading spinner overlay
//     const spinner = document.createElement("div");
//     spinner.id = "spinner-overlay";
//     spinner.style.cssText = `
//       position: fixed; inset: 0; background: rgba(0,0,0,0.5);
//       display: flex; justify-content: center; align-items: center;
//       z-index: 99999;
//     `;
//     spinner.innerHTML = `
//       <div style="background:white; padding:25px; border-radius:10px; text-align:center;">
//         <div style="border:4px solid #ddd; border-top:4px solid #660000;
//         border-radius:50%; width:40px; height:40px; margin:auto;
//         animation:spin 1s linear infinite;"></div>
//         <p style="margin-top:10px;">Processing...</p>
//       </div>
//       <style>
//         @keyframes spin { 0%{transform:rotate(0deg);} 100%{transform:rotate(360deg);} }
//       </style>
//     `;
//     document.body.appendChild(spinner);
//     setLoading(true);

//     setTimeout(() => {
//       if (!window.Razorpay) {
//         alert("❌ Razorpay failed to load. Check your connection.");
//         spinner.remove();
//         setLoading(false);
//         return;
//       }

//       const rzp = new window.Razorpay({
//         key: "rzp_test_1DP5mmOlF5G5ag",
//         amount: 500, // ₹5
//         currency: "INR",
//         name: "Quiz Entry Fee",
//         description: "Daily Quiz Payment",
//         handler: function (response) {
//           alert("✅ Payment Successful!\nPayment ID: " + response.razorpay_payment_id);
//           spinner.remove();
//           navigate("/join-quiz");
//         },
//         prefill: {
//           name: user?.fullName || "Student",
//           email: user?.email || "test@example.com",
//           contact: user?.phone || "9999999999",
//         },
//         theme: {
//           color: "#3399cc",
//         },
//       });

//       rzp.on("payment.failed", function (response) {
//         spinner.remove();
//         alert("❌ Payment failed: " + response.error.description);
//         setLoading(false);
//       });

//       spinner.remove();
//       setLoading(false);
//       rzp.open();
//     }, 800);
//   };

//   if (!user) return null;

//   return (
//     <>
//       <header className="header">
//         <div className="logo">
//           <img src="/imgs/logo-DME.png" alt="Logo" />
//         </div>
//         <DarkModeToggle />
//         <h2>PAYMENT</h2>
//       </header>

//       <div className="payment-container" style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
//         <div className="payment-card" style={{
//           background: "#fff", borderRadius: "12px", padding: "30px",
//           boxShadow: "0 4px 6px rgba(0,0,0,0.1)", marginBottom: "20px"
//         }}>
//           <h2 style={{ marginBottom: "10px", color: "#660000" }}>🎯 Daily Quiz Entry</h2>
//           <p style={{ color: "#666", marginBottom: "20px" }}>
//             Participate in today's live quiz at 8:00 PM - 8:30 PM IST
//           </p>

//           <div style={{
//             textAlign: "center", marginBottom: "30px", padding: "20px",
//             background: "linear-gradient(135deg, #660000, #990000)",
//             borderRadius: "12px", color: "white"
//           }}>
//             <span style={{ fontSize: "24px" }}>₹</span>
//             <span style={{ fontSize: "48px", fontWeight: "bold", margin: "0 5px" }}>5</span>
//             <span style={{ fontSize: "16px", opacity: 0.9 }}>per quiz</span>
//           </div>

//           <button
//             onClick={handlePayment}
//             disabled={loading}
//             style={{
//               width: "100%", padding: "15px",
//               background: loading ? "#aaa" : "#660000",
//               color: "white", border: "none", borderRadius: "8px",
//               fontSize: "18px", fontWeight: "bold", cursor: "pointer"
//             }}
//           >
//             {loading ? "Processing..." : "Pay ₹5 & Join Quiz"}
//           </button>

//           <p style={{ textAlign: "center", marginTop: "10px", color: "#666", fontSize: "14px" }}>
//             Secure payments powered by Razorpay
//           </p>
//         </div>

//         <div style={{
//           background: "#f8f9fa", padding: "20px", borderRadius: "12px"
//         }}>
//           <h3 style={{ marginBottom: "15px", color: "#660000" }}>Payment Information</h3>
//           <ul style={{ paddingLeft: "20px", lineHeight: "1.8" }}>
//             <li>One-time payment per quiz</li>
//             <li>Valid for today's quiz only</li>
//             <li>Refund if quiz is cancelled</li>
//             <li>Secure & encrypted payment</li>
//           </ul>
//         </div>
//       </div>

//       <ProfileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
//       <BottomNavBar onProfileClick={() => setDrawerOpen(true)} />
//     </>
//   );
// }








// v1
// import React, { useState, useEffect, useContext } from "react";
// import { useNavigate } from "react-router-dom";
// import { AuthContext } from "../context/AuthContext";
// import API from "../utils/api";
// import DarkModeToggle from "../components/DarkModeToggle";
// import BottomNavBar from "../components/BottomNavBar";
// import ProfileDrawer from "../components/ProfileDrawer";
// import "../styles/global.css";

// export default function PaymentPage() {
//   const { user } = useContext(AuthContext);
//   const navigate = useNavigate();
//   const [loading, setLoading] = useState(false);
//   const [paymentStatus, setPaymentStatus] = useState(null);
//   const [drawerOpen, setDrawerOpen] = useState(false);

//   const checkPaymentStatus = async () => {
//     try {
//       // Add timestamp to prevent caching and force fresh data
//       // Backend already sets cache-control headers, we just need to bypass browser cache
//       const timestamp = Date.now();
//       const response = await API.get("/payment/quiz-status", {
//         params: { _t: timestamp }
//       });
//       // Always use fresh data from response
//       setPaymentStatus(response.data);
//     } catch (error) {
//       console.error("Failed to check payment status:", error);
//       // On error, assume not paid to be safe
//       setPaymentStatus({ hasPaidToday: false });
//     }
//   };

//   useEffect(() => {
//     if (!user) {
//       navigate("/login");
//       return;
//     }
//     // Force refresh payment status on mount with immediate check
//     checkPaymentStatus();
    
//     // Refresh every 3 seconds to catch any updates (more frequent for testing)
//     const interval = setInterval(() => {
//       checkPaymentStatus();
//     }, 3000);
    
//     return () => clearInterval(interval);
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [user, navigate]);

//   // Load Razorpay script on component mount
//   useEffect(() => {
//     if (typeof window.Razorpay === "undefined") {
//       const script = document.createElement("script");
//       script.src = "https://checkout.razorpay.com/v1/checkout.js";
//       script.async = true;
//       script.id = "razorpay-checkout-script";
//       document.body.appendChild(script);
//     }
//   }, []);

//   // const handlePayment = async () => {
//   //   if (!user) {
//   //     navigate("/login");
//   //     return;
//   //   }

//   //   // Show spinner
//   //   const spinner = document.createElement("div");
//   //   spinner.id = "payment-spinner";
//   //   spinner.style.cssText = `
//   //     position: fixed;
//   //     top: 0;
//   //     left: 0;
//   //     width: 100%;
//   //     height: 100%;
//   //     background: rgba(0,0,0,0.5);
//   //     display: flex;
//   //     justify-content: center;
//   //     align-items: center;
//   //     z-index: 10000;
//   //   `;
//   //   spinner.innerHTML = `
//   //     <div style="background: white; padding: 30px; border-radius: 10px; text-align: center;">
//   //       <div style="border: 4px solid #f3f3f3; border-top: 4px solid #660000; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 15px;"></div>
//   //       <p>Processing payment...</p>
//   //     </div>
//   //     <style>
//   //       @keyframes spin {
//   //         0% { transform: rotate(0deg); }
//   //         100% { transform: rotate(360deg); }
//   //       }
//   //     </style>
//   //   `;
//   //   document.body.appendChild(spinner);

//   //   setLoading(true);
//   //   try {
//       // Create Razorpay order
//       // let orderResponse;
//       // try {
//       //   orderResponse = await API.post("/payment/create-order", {
//       //     amount: 500, // ₹5 in paise
//       //   });
//       // } catch (error) {
//       //   spinner.style.display = "none";
//       //   if (document.body.contains(spinner)) {
//       //     document.body.removeChild(spinner);
//       //   }
//       //   setLoading(false);
        
//       //   // Handle authentication errors
//       //   if (error?.response?.status === 401) {
//       //     const errorMsg = error?.response?.data?.message || "Razorpay authentication failed";
//       //     alert(`⚠️ ${errorMsg}\n\nPlease configure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your .env file.`);
//       //   } else {
//       //     const errorMsg = error?.response?.data?.message || error?.message || "Failed to create payment order. Please try again.";
//       //     alert(`⚠️ ${errorMsg}`);
//       //   }
//               // ✅ Make sure Razorpay is loaded
//         if (typeof Razorpay === "undefined") {
//           alert("❌ Razorpay script not loaded. Check your internet connection.");
//           spinner.style.display = "none";
//           return;
//         }

//         const options = {
//           key: "rzp_test_1DP5mmOlF5G5ag", // Razorpay test key
//           amount: 500, // Rs. 5 = 500 paise
//           currency: "INR",
//           name: "Quiz Entry Fee",
//           description: "Test Transaction for Quiz",
//           handler: function (response) {
//             alert("✅ Payment Successful!\nPayment ID: " + response.razorpay_payment_id);
//             window.location.href = "/join-quiz";
//           },
//           prefill: {
//             name: "Test User",
//             email: "test@example.com",
//             contact: "9999999999"
//           },
//           theme: { color: "#3399cc" }
//         };

//         const rzp = new Razorpay(options);

//         // Optional: Handle payment failures
//         rzp.on("payment.failed", function (response) {
//           alert("❌ Payment Failed: " + response.error.description);
//         });

//         spinner.style.display = "none";
//         rzp.open();
//       }, 1000);
//     });

//         return;
//       }

//       // Check if dev mode (no Razorpay keys configured)
//       if (orderResponse.data.devMode || orderResponse.data.key === 'dev_key') {
//         // In dev mode, payment is already completed
//         spinner.style.display = "none";
//         if (document.body.contains(spinner)) {
//           document.body.removeChild(spinner);
//         }
//         const warning = orderResponse.data.warning ? `\n\n⚠️ ${orderResponse.data.warning}` : '';
//         alert(`✅ Payment simulated (development). You can now join the quiz.${warning}`);
//         // Refresh payment status
//         await checkPaymentStatus();
//         setLoading(false);
//         // Redirect to quiz after payment
//         setTimeout(() => {
//           navigate("/quiz");
//         }, 1000);
//         return;
//       }

//       const { order, key } = orderResponse.data;

//       if (!order || !key) {
//         spinner.style.display = "none";
//         if (document.body.contains(spinner)) {
//           document.body.removeChild(spinner);
//         }
//         alert("Failed to create payment order. Please try again.");
//         setLoading(false);
//         return;
//       }

//       // Wait for Razorpay script to load
//       setTimeout(() => {
//         // ✅ Make sure Razorpay is loaded
//         if (typeof window.Razorpay === "undefined") {
//           alert("❌ Razorpay script not loaded. Check your internet connection.");
//           spinner.style.display = "none";
//           document.body.removeChild(spinner);
//           setLoading(false);
//           return;
//         }

//         const options = {
//           key: key, // Razorpay key from backend
//           amount: order.amount, // Rs. 5 = 500 paise
//           currency: order.currency || "INR",
//           name: "Daily Mind Education",
//           description: "Daily Quiz Entry Fee",
//           image: "/imgs/logo-DME.png",
//           order_id: order.id,
//           handler: async function (response) {
//             try {
//               console.log("Payment response:", response);
              
//               const verifyRes = await API.post("/payment/verify", {
//                 razorpay_order_id: response.razorpay_order_id,
//                 razorpay_payment_id: response.razorpay_payment_id,
//                 razorpay_signature: response.razorpay_signature
//               });

//               if (verifyRes.data.success) {
//                 alert("✅ Payment Successful!\nPayment ID: " + response.razorpay_payment_id);
//                 // Refresh payment status immediately
//                 await checkPaymentStatus();
//                 // Redirect to quiz after successful payment
//                 setTimeout(() => {
//                   navigate("/quiz");
//                 }, 1000);
//               } else {
//                 alert("❌ Payment verification failed. Please contact support.");
//               }
//             } catch (error) {
//               console.error("Payment verification failed:", error);
//               const errorMsg = error?.response?.data?.message || "Payment verification failed. Please contact support.";
//               alert(`⚠️ ${errorMsg}`);
//             } finally {
//               spinner.style.display = "none";
//               if (document.body.contains(spinner)) {
//                 document.body.removeChild(spinner);
//               }
//               setLoading(false);
//             }
//           },
//           prefill: {
//             name: user?.fullName || user?.username || "Student",
//             email: user?.email || "student@example.com",
//             contact: user?.phone || "9999999999"
//           },
//           notes: {
//             purpose: "Quiz Entry Fee",
//             userId: user._id
//           },
//           theme: { 
//             color: "#660000" 
//           },
//           modal: {
//             ondismiss: function() {
//               spinner.style.display = "none";
//               if (document.body.contains(spinner)) {
//                 document.body.removeChild(spinner);
//               }
//               setLoading(false);
//             }
//           }
//         };

//         const rzp = new window.Razorpay(options);
        
//         // Optional: Handle payment failures
//         rzp.on("payment.failed", function (response) {
//           spinner.style.display = "none";
//           if (document.body.contains(spinner)) {
//             document.body.removeChild(spinner);
//           }
//           setLoading(false);
//           alert("❌ Payment Failed: " + (response.error?.description || "Unknown error"));
//         });

//         spinner.style.display = "none";
//         if (document.body.contains(spinner)) {
//           document.body.removeChild(spinner);
//         }
//         setLoading(false);
//         rzp.open();
//       }, 1000);
//     } catch (error) {
//       console.error("Payment failed:", error);
//       const errorMsg = error?.response?.data?.message || error?.message || "Payment initialization failed. Please try again.";
//       alert(`⚠️ ${errorMsg}`);
//       spinner.style.display = "none";
//       if (document.body.contains(spinner)) {
//         document.body.removeChild(spinner);
//       }
//       setLoading(false);
//     }
//   };

//   if (!user) {
//     return null;
//   }

//   return (
//     <>
//       <header className="header">
//         <div className="logo">
//           <img src="/imgs/logo-DME.png" alt="Logo" />
//         </div>
//         <DarkModeToggle />
//         <h2>PAYMENT</h2>
//       </header>

//       <div className="payment-container" style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
//         <div className="payment-card" style={{ 
//           background: "#fff", 
//           borderRadius: "12px", 
//           padding: "30px", 
//           boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
//           marginBottom: "20px"
//         }}>
//           <h2 style={{ marginBottom: "10px", color: "#660000" }}>🎯 Daily Quiz Entry</h2>
//           <p className="quiz-description" style={{ color: "#666", marginBottom: "20px" }}>
//             Participate in today's live quiz at 8:00 PM - 8:30 PM IST
//           </p>
          
//           <div className="quiz-features" style={{ marginBottom: "30px" }}>
//             <div className="feature-item" style={{ display: "flex", alignItems: "center", marginBottom: "10px" }}>
//               <span className="feature-icon" style={{ marginRight: "10px", fontSize: "20px" }}>⏰</span>
//               <span>15 seconds per question</span>
//             </div>
//             <div className="feature-item" style={{ display: "flex", alignItems: "center", marginBottom: "10px" }}>
//               <span className="feature-icon" style={{ marginRight: "10px", fontSize: "20px" }}>📝</span>
//               <span>50 MCQ questions</span>
//             </div>
//             <div className="feature-item" style={{ display: "flex", alignItems: "center", marginBottom: "10px" }}>
//               <span className="feature-icon" style={{ marginRight: "10px", fontSize: "20px" }}>🏆</span>
//               <span>Win prizes & recognition</span>
//             </div>
//             <div className="feature-item" style={{ display: "flex", alignItems: "center", marginBottom: "10px" }}>
//               <span className="feature-icon" style={{ marginRight: "10px", fontSize: "20px" }}>🔒</span>
//               <span>Anti-cheat protection</span>
//             </div>
//           </div>

//           <div className="payment-section">
//             <div className="price-display" style={{ 
//               textAlign: "center", 
//               marginBottom: "30px",
//               padding: "20px",
//               background: "linear-gradient(135deg, #660000, #990000)",
//               borderRadius: "12px",
//               color: "white"
//             }}>
//               <span className="currency" style={{ fontSize: "24px" }}>₹</span>
//               <span className="amount" style={{ fontSize: "48px", fontWeight: "bold", margin: "0 5px" }}>5</span>
//               <span className="period" style={{ fontSize: "16px", opacity: 0.9 }}>per quiz</span>
//             </div>

//             {paymentStatus?.hasPaidToday ? (
//               <div className="payment-status paid" style={{
//                 padding: "20px",
//                 background: "#d4edda",
//                 borderRadius: "8px",
//                 textAlign: "center",
//                 border: "2px solid #28a745"
//               }}>
//                 <span className="status-icon" style={{ fontSize: "32px", display: "block", marginBottom: "10px" }}>✅</span>
//                 <span style={{ display: "block", marginBottom: "15px", color: "#155724", fontWeight: "bold" }}>
//                   Payment completed! You can participate in today's quiz.
//                 </span>
//                 <button 
//                   className="quiz-btn"
//                   onClick={() => navigate("/quiz")}
//                   style={{
//                     padding: "12px 30px",
//                     background: "#28a745",
//                     color: "white",
//                     border: "none",
//                     borderRadius: "8px",
//                     fontSize: "16px",
//                     fontWeight: "bold",
//                     cursor: "pointer",
//                     width: "100%"
//                   }}
//                 >
//                   Go to Quiz
//                 </button>
//               </div>
//             ) : (
//               <div className="payment-section">
//                 <button 
//                   className="pay-btn"
//                   onClick={handlePayment}
//                   disabled={loading}
//                   style={{
//                     width: "100%",
//                     padding: "15px",
//                     background: loading ? "#ccc" : "#660000",
//                     color: "white",
//                     border: "none",
//                     borderRadius: "8px",
//                     fontSize: "18px",
//                     fontWeight: "bold",
//                     cursor: loading ? "not-allowed" : "pointer",
//                     marginBottom: "15px"
//                   }}
//                 >
//                   {loading ? "Processing..." : "Pay ₹5 & Join Quiz"}
//                 </button>
//                 <p className="payment-note" style={{ textAlign: "center", color: "#666", fontSize: "14px" }}>
//                   Secure payment powered by Razorpay
//                 </p>
//                 <p style={{ textAlign: "center", color: "#dc3545", fontSize: "12px", marginTop: "10px" }}>
//                   ⚠️ Payment deadline: 7:55 PM IST
//                 </p>
//               </div>
//             )}
//           </div>
//         </div>

//         <div className="payment-info" style={{
//           background: "#f8f9fa",
//           padding: "20px",
//           borderRadius: "12px"
//         }}>
//           <h3 style={{ marginBottom: "15px", color: "#660000" }}>Payment Information</h3>
//           <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
//             <li style={{ marginBottom: "10px", paddingLeft: "20px", position: "relative" }}>
//               <span style={{ position: "absolute", left: 0 }}>✓</span>
//               One-time payment per quiz session
//             </li>
//             <li style={{ marginBottom: "10px", paddingLeft: "20px", position: "relative" }}>
//               <span style={{ position: "absolute", left: 0 }}>✓</span>
//               Payment is valid only for the current day's quiz
//             </li>
//             <li style={{ marginBottom: "10px", paddingLeft: "20px", position: "relative" }}>
//               <span style={{ position: "absolute", left: 0 }}>✓</span>
//               Refunds available if quiz is cancelled
//             </li>
//             <li style={{ marginBottom: "10px", paddingLeft: "20px", position: "relative" }}>
//               <span style={{ position: "absolute", left: 0 }}>✓</span>
//               All payments are secure and encrypted
//             </li>
//           </ul>
//         </div>
//       </div>

//       <ProfileDrawer 
//         key={user?._id || 'no-user'} 
//         open={drawerOpen} 
//         onClose={() => setDrawerOpen(false)} 
//       />
//       <BottomNavBar onProfileClick={() => setDrawerOpen(true)} />
//     </>
//   );
// }
