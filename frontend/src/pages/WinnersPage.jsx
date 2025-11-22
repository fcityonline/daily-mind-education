// // frontend/src/pages/WinnersPage.jsx

// frontend/src/pages/WinnersPage.jsx

// // src/pages/WinnersPage.jsx
// import React, { useEffect, useState, useCallback } from "react";
// // import API from "../api"; // your Axios instance
// import API from "../utils/api";
// // import "./WinnersPage.css"; // optional styling

// const WinnersPage = () => {
//   const [winners, setWinners] = useState([]);
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState(null);

//   // Load winners from API
//   const loadWinners = useCallback(async () => {
//     try {
//       setLoading(true);
//       setError(null);

//       // ✅ Correct endpoint
//       const { data } = await API.get("/quiz/winners");

//       // Handle empty or invalid response
//       if (!data?.winners || !Array.isArray(data.winners)) {
//         setWinners([]);
//       } else {
//         setWinners(data.winners.slice(0, 20)); // show top 20
//       }
//     } catch (err) {
//       console.error("Failed to fetch winners:", err);
//       setError("Failed to load winners. Please try again later.");
//       setWinners([]);
//     } finally {
//       setLoading(false);
//     }
//   }, []);

//   useEffect(() => {
//     loadWinners();
//   }, [loadWinners]);

//   return (
//     <div className="winners-page">
//       <h1>🏆 Quiz Winners</h1>

//       {loading && <p>Loading winners...</p>}
//       {error && <p className="error">{error}</p>}

//       {!loading && !error && winners.length === 0 && <p>No winners yet.</p>}

//       {!loading && !error && winners.length > 0 && (
//         <ul className="winners-list">
//           {winners.map((winner, index) => (
//             <li key={winner.id || index} className="winner-item">
//               <span className="rank">{index + 1}.</span>
//               <span className="name">{winner.name}</span>
//               <span className="score">{winner.score}</span>
//             </li>
//           ))}
//         </ul>
//       )}
//     </div>
//   );
// };

// export default WinnersPage;






// frontend/src/pages/WinnersPage.jsx
// import React, { useState, useEffect, useContext } from "react";
// import { useParams } from "react-router-dom";
// import DarkModeToggle from "../components/DarkModeToggle";
// import { AuthContext } from "../context/AuthContext";
// import API from "../utils/api";
// import "../styles/global.css";

// export default function WinnersPage() {
//   const { user } = useContext(AuthContext);
//   const { date } = useParams(); // Optional date param
//   const [winners, setWinners] = useState([]);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState(null);
//   const [selectedDate, setSelectedDate] = useState(
//     date || new Date().toISOString().split("T")[0]
//   );
//   const [totalParticipants, setTotalParticipants] = useState(0);
//   const [quizDate, setQuizDate] = useState(null);

//   useEffect(() => {
//     loadWinners(selectedDate);
//   }, [selectedDate]);

//   const loadWinners = async (dateParam) => {
//     try {
//       setLoading(true);
//       setError(null);

//       const endpoint = dateParam
//         ? `/quiz/winners/${dateParam}`
//         : "/quiz/winners";
//       const response = await API.get(endpoint);

//       if (response.data.winners && response.data.winners.length > 0) {
//         setWinners(response.data.winners);
//         setTotalParticipants(response.data.totalParticipants || 0);
//         setQuizDate(response.data.quizDate || dateParam);
//       } else {
//         setWinners([]);
//         setTotalParticipants(0);
//         setQuizDate(dateParam || new Date());
//       }
//     } catch (err) {
//       console.error("Failed to load winners:", err);
//       setError("Failed to load winners data");
//       setWinners([]);
//     } finally {
//       setLoading(false);
//     }
//   };

//   const handleDateChange = (e) => setSelectedDate(e.target.value);

//   const getMedalEmoji = (rank) => {
//     if (rank === 1) return "🥇";
//     if (rank === 2) return "🥈";
//     if (rank === 3) return "🥉";
//     return null;
//   };

//   const formatDate = (dateString) => {
//     if (!dateString) return new Date().toLocaleDateString();
//     const dateObj = new Date(dateString);
//     return isNaN(dateObj.getTime())
//       ? "Invalid Date"
//       : dateObj.toLocaleDateString("en-IN", {
//           year: "numeric",
//           month: "long",
//           day: "numeric",
//         });
//   };

//   // Separate top 3 for highlight
//   const topThree = winners.filter((w) => w.rank <= 3);
//   const restWinners = winners.filter((w) => w.rank > 3);

//   return (
//     <>
//       <header className="header">
//         <div className="logo">
//           <img src="/imgs/logo-DME.png" alt="Logo" />
//         </div>
//         <DarkModeToggle />
//         <h2>TODAY'S WINNERS</h2>
//       </header>

//       <div className="winners-container">
//         <div className="winners-header">
//           <h2>Daily Quiz Results</h2>
//           <div className="trophy-icon" aria-label="Trophy">
//             <img
//               alt="quiz"
//               src="https://img.icons8.com/?size=100&id=cRDlJeszVWm0&format=png&color=000000"
//             />
//             <p>Top 20 Winners - {formatDate(quizDate)}</p>
//           </div>

//           <h3>Congratulations To The Winners!</h3>

//           {/* Date Selector */}
//           <div style={{ margin: "20px 0" }}>
//             <label htmlFor="date-select" style={{ marginRight: "10px", fontWeight: "bold" }}>
//               Select Date:
//             </label>
//             <input
//               id="date-select"
//               type="date"
//               value={selectedDate}
//               onChange={handleDateChange}
//               max={new Date().toISOString().split("T")[0]}
//               style={{
//                 padding: "8px",
//                 borderRadius: "5px",
//                 border: "1px solid #ddd",
//                 fontSize: "16px",
//               }}
//             />
//           </div>

//           {totalParticipants > 0 && (
//             <div
//               style={{
//                 backgroundColor: "#f8f9fa",
//                 padding: "15px",
//                 borderRadius: "10px",
//                 marginBottom: "20px",
//                 textAlign: "center",
//               }}
//             >
//               <p style={{ margin: 0, fontSize: "18px", fontWeight: "bold", color: "black" }}>
//                 Total Participants: {totalParticipants}
//               </p>
//             </div>
//           )}
//         </div>

//         {/* Loading / Error / No Winners */}
//         {loading ? (
//           <div className="loading" style={{ textAlign: "center", padding: "40px" }}>
//             <div style={{ fontSize: "18px" }}>Loading winners...</div>
//           </div>
//         ) : error ? (
//           <div style={{ textAlign: "center", padding: "40px", color: "#dc3545" }}>
//             <h3>Error</h3>
//             <p>{error}</p>
//             <button
//               onClick={() => loadWinners(selectedDate)}
//               style={{
//                 padding: "10px 20px",
//                 backgroundColor: "#007bff",
//                 color: "white",
//                 border: "none",
//                 borderRadius: "5px",
//                 cursor: "pointer",
//               }}
//             >
//               Try Again
//             </button>
//           </div>
//         ) : winners.length === 0 ? (
//           <div style={{ textAlign: "center", padding: "40px" }}>
//             <h3>No Results Found</h3>
//             <p>No quiz was conducted on {formatDate(quizDate)}</p>
//             <p>Try selecting a different date.</p>
//           </div>
//         ) : (
//           <>
//             {/* Top 3 Winners Highlight */}
//             <div
//               className="top-three-highlight"
//               style={{
//                 display: "flex",
//                 justifyContent: "center",
//                 gap: "30px",
//                 marginBottom: "30px",
//                 flexWrap: "wrap",
//               }}
//             >
//               {topThree.map((winner) => (
//                 <div
//                   key={winner.rank}
//                   style={{
//                     flex: "0 0 150px",
//                     textAlign: "center",
//                     padding: "15px",
//                     borderRadius: "15px",
//                     backgroundColor: "#fff",
//                     boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
//                   }}
//                 >
//                   <div style={{ fontSize: "40px", marginBottom: "10px" }}>
//                     {getMedalEmoji(winner.rank)}
//                   </div>
//                   {winner.user.profileImage ? (
//                     <img
//                       src={`http://localhost:5000/images/${winner.user.profileImage}`}
//                       alt="Profile"
//                       style={{
//                         width: "80px",
//                         height: "80px",
//                         borderRadius: "50%",
//                         objectFit: "cover",
//                         marginBottom: "10px",
//                       }}
//                       onError={(e) => (e.target.style.display = "none")}
//                     />
//                   ) : (
//                     <div
//                       style={{
//                         width: "80px",
//                         height: "80px",
//                         borderRadius: "50%",
//                         backgroundColor: "#007bff",
//                         color: "white",
//                         display: "flex",
//                         alignItems: "center",
//                         justifyContent: "center",
//                         margin: "0 auto 10px",
//                         fontSize: "24px",
//                         fontWeight: "bold",
//                       }}
//                     >
//                       {winner.user.fullName?.charAt(0)?.toUpperCase() ||
//                         winner.user.username?.charAt(0)?.toUpperCase() ||
//                         "U"}
//                     </div>
//                   )}
//                   <h4 style={{ margin: "5px 0" }}>
//                     {winner.user.fullName || winner.user.username || "Anonymous"}
//                   </h4>
//                   <p style={{ margin: "0", fontSize: "14px", color: "#6c757d" }}>
//                     Score: {winner.score} | Correct: {winner.correctAnswers}/{winner.totalQuestions}
//                   </p>
//                 </div>
//               ))}
//             </div>

//             {/* Rest of Winners List */}
//             <div className="winners-list" style={{ maxWidth: "800px", margin: "0 auto" }}>
//               {restWinners.map((winner) => (
//                 <div
//                   key={winner.rank}
//                   className="winner-card"
//                   style={{
//                     display: "flex",
//                     alignItems: "center",
//                     padding: "15px",
//                     margin: "10px 0",
//                     backgroundColor: "#fff",
//                     border: "1px solid #dee2e6",
//                     borderRadius: "10px",
//                     boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
//                   }}
//                 >
//                   <div className="rank" style={{ marginRight: "20px", minWidth: "60px" }}>
//                     <span
//                       className="rank-number"
//                       style={{ fontSize: "20px", fontWeight: "bold", color: "#6c757d" }}
//                     >
//                       #{winner.rank}
//                     </span>
//                   </div>

//                   <div className="winner-info" style={{ flex: 1 }}>
//                     <div style={{ display: "flex", alignItems: "center", marginBottom: "5px" }}>
//                       {winner.user.profileImage ? (
//                         <img
//                           src={`http://localhost:5000/images/${winner.user.profileImage}`}
//                           alt="Profile"
//                           style={{
//                             width: "40px",
//                             height: "40px",
//                             borderRadius: "50%",
//                             marginRight: "10px",
//                             objectFit: "cover",
//                           }}
//                           onError={(e) => {
//                             e.target.style.display = "none";
//                           }}
//                         />
//                       ) : (
//                         <div
//                           style={{
//                             width: "40px",
//                             height: "40px",
//                             borderRadius: "50%",
//                             backgroundColor: "#007bff",
//                             color: "white",
//                             display: "flex",
//                             alignItems: "center",
//                             justifyContent: "center",
//                             marginRight: "10px",
//                             fontSize: "16px",
//                             fontWeight: "bold",
//                           }}
//                         >
//                           {winner.user.fullName?.charAt(0)?.toUpperCase() ||
//                             winner.user.username?.charAt(0)?.toUpperCase() ||
//                             "U"}
//                         </div>
//                       )}
//                       <h4 style={{ margin: 0, fontSize: "16px" }}>
//                         {winner.user.fullName || winner.user.username || "Anonymous"}
//                       </h4>
//                     </div>

//                     <div
//                       style={{
//                         display: "flex",
//                         gap: "15px",
//                         fontSize: "14px",
//                         color: "#6c757d",
//                       }}
//                     >
//                       <span>
//                         Score: <strong>{winner.score}</strong>
//                       </span>
//                       <span>
//                         Correct: <strong>
//                           {winner.correctAnswers}/{winner.totalQuestions}
//                         </strong>
//                       </span>
//                       <span>
//                         Accuracy: <strong>{winner.accuracy}%</strong>
//                       </span>
//                       <span>
//                         Time: <strong>
//                           {Math.floor(winner.timeSpent / 60)}m {winner.timeSpent % 60}s
//                         </strong>
//                       </span>
//                     </div>
//                   </div>
//                 </div>
//               ))}
//             </div>
//           </>
//         )}

//         <div
//           className="winners-footer"
//           style={{ textAlign: "center", marginTop: "30px", padding: "20px" }}
//         >
//           <p style={{ fontSize: "18px", marginBottom: "10px" }}>🎉 Congratulations to all winners!</p>
//           <p style={{ color: "#6c757d" }}>Join tomorrow's quiz for your chance to win!</p>

//           {user && (
//             <div style={{ marginTop: "20px" }}>
//               <button
//                 onClick={() => (window.location.href = "/quiz")}
//                 style={{
//                   padding: "12px 24px",
//                   backgroundColor: "#007bff",
//                   color: "white",
//                   border: "none",
//                   borderRadius: "25px",
//                   fontSize: "16px",
//                   cursor: "pointer",
//                   fontWeight: "bold",
//                 }}
//               >
//                 Join Next Quiz
//               </button>
//             </div>
//           )}
//         </div>
//       </div>
//     </>
//   );
// }









import React, { useState, useEffect, useContext } from "react";
import { useParams } from "react-router-dom";
import DarkModeToggle from "../components/DarkModeToggle";
import { AuthContext } from "../context/AuthContext";
import API from "../utils/api";
import "../styles/global.css";

export default function WinnersPage() {
  const { user } = useContext(AuthContext);
  const { date } = useParams(); // Optional date parameter
  const [winners, setWinners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(date || new Date().toISOString().split('T')[0]);
  const [totalParticipants, setTotalParticipants] = useState(0);
  const [quizDate, setQuizDate] = useState(null);

  useEffect(() => {
    loadWinners(selectedDate);
  }, [selectedDate]);

  const loadWinners = async (dateParam) => {
    try {
      setLoading(true);
      setError(null);
      
      const endpoint = dateParam ? `/quiz/winners/${dateParam}` : '/quiz/winners';
      const response = await API.get(endpoint);
      
      if (response.data.winners && response.data.winners.length > 0) {
        setWinners(response.data.winners);
        setTotalParticipants(response.data.totalParticipants || 0);
        setQuizDate(response.data.quizDate);
      } else {
        setWinners([]);
        setTotalParticipants(0);
        setQuizDate(dateParam ? new Date(dateParam) : new Date());
      }
    } catch (error) {
      console.error("Failed to load winners:", error);
      setError("Failed to load winners data");
      setWinners([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (e) => {
    setSelectedDate(e.target.value);
  };

  // const getPrizeAmount = (rank) => {
  //   if (rank === 1 || rank === 2) return "10,000";
  //   if (rank === 3 || rank === 4) return "5,000";
  //   if (rank === 5 || rank === 6) return "2,500";
  //   return "500";
  // };

  const getMedalEmoji = (rank) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return null;
  };

  const formatDate = (dateString) => {
    if (!dateString) return new Date().toLocaleDateString();
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Invalid Date';
      return date.toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      return 'Invalid Date';
    }
  };

  return (
    <>
      <header className="header">
        <div className="logo">
          <img src="/imgs/logo-DME.png" alt="Logo" />
        </div>
        <DarkModeToggle />
        <h2>TODAY'S WINNERS</h2>
      </header>

      <div className="winners-container">
        <div className="winners-header">
          {/* <div className="wnr-container"> */}
          <h2>Daily Quiz Results</h2>
          <div className="trophy-icon" aria-label="Trophy">
            <img alt="quiz" src="https://img.icons8.com/?size=100&amp;id=cRDlJeszVWm0&amp;format=png&amp;color=000000" ></img>
          <p>Top 20 Winners - {formatDate(quizDate)}</p>
          </div>


          {/* <p>Total 50 Questions Answered</p> */}
          <h3>Congratulations To The Winners!</h3>
          <div className="winnerr gold">Pramod Kumar - 25 (5 min 48 sec)</div>
          <div className="winnerr silver">Gulshan Singh Rajput - 25 (5 min 50 sec)</div>
          <div className="winnerr bronze">Suman Kumar - 25 (6 min 02 sec)</div>
          {/* </div> */}
          
          {/* Date Selector */}
          <div style={{ margin: '20px 0' }}>
            <label htmlFor="date-select" style={{ marginRight: '10px', fontWeight: 'bold' }}>
              Select Date:
            </label>
            <input
              id="date-select"
              type="date"
              value={selectedDate}
              onChange={handleDateChange}
              max={new Date().toISOString().split('T')[0]}
              style={{
                padding: '8px',
                borderRadius: '5px',
                border: '1px solid #ddd',
                fontSize: '16px'
              }}
            />
          </div>

          {totalParticipants > 0 && (
            <div style={{ 
              backgroundColor: '#f8f9fa', 
              padding: '15px', 
              borderRadius: '10px',
              marginBottom: '20px',
              textAlign: 'center'
            }}>
              <p style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color:'#b30000' }}>
                Total Participants: {totalParticipants}
              </p>
            </div>
          )}
        </div>

        {loading ? (
          <div className="loading" style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{ fontSize: '18px' }}>⌛️Loading winners...</div>
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#dc3545' }}>
            <h3>Error</h3>
            <p>{error}</p>
            <button 
              onClick={() => loadWinners(selectedDate)}
              style={{
                padding: '10px 20px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer'
              }}
            >
              Try Again
            </button>
          </div>
        ) : winners.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <h3>No Results Found</h3>
            <p>No quiz was conducted on {formatDate(quizDate)}</p>
            <p>Try selecting a different date.</p>
          </div>
        ) : (
          <div className="winners-list">
            {winners.map((winner, index) => (
              <div 
                key={index} 
                className={`winner-card ${winner.rank <= 3 ? 'top-three' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '15px',
                  margin: '10px 0',
                  backgroundColor: winner.rank <= 3 ? '#ffffffff' : '#fff',
                  border: winner.rank <= 3 ? '2px solid #ffffffff' : '1px solid #ffffffff',
                  borderRadius: '10px',
                  boxShadow: winner.rank <= 3 ? '0 4px 8px rgba(0, 0, 0, 0.1)' : '0 2px 4px rgba(0, 0, 0, 0.05)'
                }}
              >

                <div className="rank" style={{ marginRight: '20px', minWidth: '60px' }}>
                  {winner.rank <= 3 ? (
                    <span className="medal" style={{ fontSize: '30px' }}>
                      {getMedalEmoji(winner.rank)}
                    </span>
                  ) : (
                    <span 
                      className="rank-number" 
                      style={{ 
                        fontSize: '24px', 
                        fontWeight: 'bold',
                        color: '#6c757d'
                      }}
                    >
                      #{winner.rank}
                    </span>
                  )}
                </div>
                
                <div className="winner-info" style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '5px',  }}>
                    {winner.user.profileImage ? (
                      <img 
                        src={`http://localhost:5000/images/${winner.user.profileImage}`}
                        alt="Profile"
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          marginRight: '10px',
                          objectFit: 'cover'
                        }}
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div 
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          backgroundColor: '#007bff',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: '10px',
                          fontSize: '16px',
                          fontWeight: 'bold'
                        }}
                      >
                        {winner.user.fullName?.charAt(0)?.toUpperCase() || winner.user.username?.charAt(0)?.toUpperCase() || 'U'}
                      </div>
                    )}
                    {/* <h3 style={{ margin: 0, fontSize: '18px' }}>
                      {winner.user.fullName || winner.user.username || 'Anonymous'}
                      </h3> */}
                    {/* <h3 className={winner.rank === 1 ? "shimmer" : ""} style={{ margin: 0, fontSize: '18px' }}>
  {winner.user.fullName || winner.user.username || 'Anonymous'}
  
  {winner.rank === 1 && <span className="badge gold">GOLD</span>}
  {winner.rank === 2 && <span className="badge silver">SILVER</span>}
  {winner.rank === 3 && <span className="badge bronze">BRONZE</span>}
  </h3> */}
  {winner.rank === 1 && <span className="crown">👑</span>}

<h3 className={winner.rank === 1 ? "shimmer" : ""} style={{ margin: 0, fontSize: '13px', position: 'relative' }}>

  {winner.rank === 1 && <span className="badge gold">WINNER</span>}
  {winner.rank === 2 && <span className="badge silver">WINNER</span>}
  {winner.rank === 3 && <span className="badge bronze">WINNER</span>}

  {winner.user.fullName || winner.user.username || 'Anonymous'}
</h3>

                  </div>
                  
                  <div style={{ display: 'flex', gap: '2px', fontSize: '14px', color: '#6c757d' }}>
                    <span>Score: <strong>{winner.score}</strong></span>
                    <span>Correct: <strong>{winner.correctAnswers}/{winner.totalQuestions}</strong></span>
                    <span>Accuracy: <strong>{winner.accuracy}%</strong></span>
                    <span>Time: <strong>{Math.floor(winner.timeSpent / 60)}m {winner.timeSpent % 60}s</strong></span>
                  </div>
                </div>
                
              </div>
            ))}
          </div>
        )}

        <div className="winners-footer" style={{ textAlign: 'center', marginTop: '1px', padding: '20px' }}>
          <p style={{ fontSize: '11px', marginBottom: '1px' }}>🎉 Congratulations to all winners!</p>
          <p style={{ color: '#6c757d' }}>Join tomorrow's quiz for your chance to win!</p>
          
          {user && (
            <div style={{ marginTop: '20px' }}>
              <button 
                onClick={() => window.location.href = '/quiz'}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '25px',
                  fontSize: '16px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Join Next Quiz
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}



