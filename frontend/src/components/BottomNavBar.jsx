// // // // // // // // frontend/src/components/BottomNavBar.jsx

// frontend/src/components/BottomNavBar.jsx

// import React, { useContext, useState, useEffect } from "react";
// import { useNavigate } from "react-router-dom";
// import { AuthContext } from "../context/AuthContext";
// import { getUserNotifications } from "../api/notifications"; // Assuming this API fetches notifications for the user

// export default function BottomNavBar({ onProfileClick }) {
//   const { user } = useContext(AuthContext);
//   const navigate = useNavigate();
//   const [hasNewNotifications, setHasNewNotifications] = useState(false);

//   const go = (path, protectedRoute = false) => {
//     if (protectedRoute && !user) {
//       navigate("/login");
//     } else {
//       navigate(path);
//     }
//   };

//   const isDarkMode = document.body.classList.contains('dark');

//   // Fetch notifications and check if there are any unread ones
//   useEffect(() => {
//     if (user) {
//       const fetchNotifications = async () => {
//         const notifications = await getUserNotifications(user._id); // Assuming this API returns notifications
//         setHasNewNotifications(notifications.some(notification => !notification.read)); // Check if there's any unread notification
//       };

//       fetchNotifications();
//     }
//   }, [user]);

//   return (
//     <div className={`bottom-nav ${isDarkMode ? 'dark' : ''}`}>
//       <img
//         src="https://img.icons8.com/?size=100&id=ngY49upLM_vX&format=png&color=000000"
//         alt="home"
//         onClick={() => go("/home")}
//         style={{ cursor: "pointer", width: 30 }}
//       />

//       <div style={{ position: "relative" }}>
//         {/* Edit Icon with Bell Highlight */}
//         <img
//           src="https://img.icons8.com/?size=100&id=bvLrlEUfi2ZI&format=png&color=000000"
//           alt="edit"
//           onClick={() => go("/edit-blog", true)} // Redirect to edit-blog
//           style={{ cursor: "pointer", width: 30 }}
//         />
        
//         {/* If there are new notifications, highlight the edit icon */}
//         {hasNewNotifications && (
//           <div style={{
//             position: "absolute",
//             top: "-5px",
//             right: "-5px",
//             width: "10px",
//             height: "10px",
//             backgroundColor: "red",
//             borderRadius: "50%",
//             border: "2px solid white"
//           }} />
//         )}
//       </div>

//       <img
//         src="https://img.icons8.com/?size=100&id=cRDlJeszVWm0&format=png&color=000000"
//         alt="quiz"
//         onClick={() => go("/quiz", true)}
//         style={{ cursor: "pointer", width: 30 }}
//       />

//       <img
//         src="https://img.icons8.com/?size=100&id=zeRZbA_1nZ3n&format=png&color=000000"
//         alt="winners"
//         onClick={() => go("/winners")}
//         style={{ cursor: "pointer", width: 30 }}
//       />

//       <img
//         src="https://img.icons8.com/?size=100&id=85147&format=png"
//         alt="profile"
//         onClick={() => {
//           if (!user) {
//             navigate("/login");
//             return;
//           }
//           if (onProfileClick) onProfileClick();
//           else navigate("/profile");
//         }}
//         style={{ cursor: "pointer", width: 30 }}
//       />
//     </div>
//   );
// }


import React, { useContext } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";

export default function BottomNavBar({ onProfileClick }) {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const go = (path, protectedRoute = false) => {
    if (protectedRoute && !user) {
      navigate("/login");
    } else {
      navigate(path);
    }
  };

  const isDarkMode = document.body.classList.contains('dark');

  return (
    <div className={`bottom-nav ${isDarkMode ? 'dark' : ''}`}>
      <img
        src="https://img.icons8.com/?size=100&id=ngY49upLM_vX&format=png&color=000000"
        alt="home"
        onClick={() => go("/home")}
        style={{ cursor: "pointer", width: 30 }}
      />

      <img
        src="https://img.icons8.com/?size=100&id=bvLrlEUfi2ZI&format=png&color=000000"
        alt="edit"
        onClick={() => go("/edit-blog", true)}
        style={{ cursor: "pointer", width: 30 }}
      />

      <img
        src="https://img.icons8.com/?size=100&id=cRDlJeszVWm0&format=png&color=000000"
        alt="quiz"
        onClick={() => go("/quiz", true)}
        style={{ cursor: "pointer", width: 30 }}
      />

      <img
        src="https://img.icons8.com/?size=100&id=zeRZbA_1nZ3n&format=png&color=000000"
        alt="winners"
        onClick={() => go("/winners")}
        style={{ cursor: "pointer", width: 30 }}
      />

      <img
        src="https://img.icons8.com/?size=100&id=85147&format=png"
        alt="profile"
        onClick={() => {
          if (!user) {
            navigate("/login");
            return;
          }
          if (onProfileClick) onProfileClick();
          else navigate("/profile");
        }}
        style={{ cursor: "pointer", width: 30 }}
      />
    </div>
  );
}
