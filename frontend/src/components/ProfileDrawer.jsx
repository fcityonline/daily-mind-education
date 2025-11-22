// // frontend/src/components/ProfileDrawer.jsx

import React, { useEffect, useContext } from "react";
import { AuthContext } from "../context/AuthContext";

const getImageURL = (imagePath) => {
  if (!imagePath) return null;
  
  // If already a full URL, return as is
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  
  const hostname = window.location.hostname;
  const port = window.location.port || '5000';
  
  // Check if path already includes /images or /uploads/images
  if (imagePath.startsWith('/images/') || imagePath.startsWith('images/')) {
    const cleanPath = imagePath.replace(/^\/?images\//, '');
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `http://localhost:${port}/images/${cleanPath}`;
    } else {
      return `http://${hostname}:${port}/images/${cleanPath}`;
    }
  }
  
  // Check if path includes /uploads/images
  if (imagePath.includes('/images/')) {
    const cleanPath = imagePath.split('/images/')[1];
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `http://localhost:${port}/images/${cleanPath}`;
    } else {
      return `http://${hostname}:${port}/images/${cleanPath}`;
    }
  }
  
  // Default: assume it's just the filename (stored in uploads/images/)
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `http://localhost:${port}/images/${imagePath}`;
  } else {
    return `http://${hostname}:${port}/images/${imagePath}`;
  }
};

export default function ProfileDrawer({ open, onClose }) {
  const { user, logout } = useContext(AuthContext);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
  }, [open]);

  const getInitials = () => {
    if (!user) return "U";
    const name = user.fullName || user.username || "User";
    return name.charAt(0).toUpperCase();
  };

  return (
    <>
      {/* Overlay */}
      <div
        className={`overlay ${open ? "active" : ""}`}
        onClick={onClose}
      ></div>

      {/* Drawer */}
      <aside className={`drawer left-drawer ${open ? "open" : ""}`}>
        <div className="drawer-header">
          <h2>Profile</h2>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="profile-pic" style={{ position: "relative" }}>
          {user?.profileImage ? (
            <>
              <img
                src={getImageURL(user.profileImage)}
                alt="Profile"
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: "50%",
                  objectFit: "cover",
                  position: "absolute",
                  top: 0,
                  left: 0,
                }}
                onError={(e) => {
                  e.target.style.display = "none";
                  // Show fallback div
                  const fallback = e.target.parentElement?.querySelector('.profile-pic-fallback');
                  if (fallback) {
                    fallback.style.display = "flex";
                  }
                }}
              />
              <div
                className="profile-pic-fallback"
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: "50%",
                  background: "linear-gradient(to bottom, #3b060e, #200307)",
                  display: "none",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "32px",
                  fontWeight: "bold",
                  color: "#fff",
                  position: "absolute",
                  top: 0,
                  left: 0,
                }}
              >
                {getInitials()}
              </div>
            </>
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                borderRadius: "50%",
                background: "linear-gradient(to bottom, #3b060e, #200307)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "32px",
                fontWeight: "bold",
                color: "#fff",
              }}
            >
              {getInitials()}
            </div>
          )}
        </div>

        <div className="profile-info">
          <h3>{user?.fullName || "Guest User"}</h3>
          {/* <p>@{user?.username || "Not logged in"}</p> */}
          {<p>{user?.username}</p>}

        </div>

        <div
          className="sidebar-item"
          onClick={() => (window.location.href = "/edit-profile")}
        >
          👤 Edit Profile
        </div>
        <div
          className="sidebar-item"
          onClick={() => (window.location.href = "/quiz-analytics")}
        >
          📜 My Quizzes Analytics
        </div>
        <div
          className="sidebar-item"
          onClick={() => (window.location.href = "/payment-history")}
        >
          💳 Payment History
        </div>
        <div
          className="sidebar-item"
          onClick={() => (window.location.href = "/settings")}
        >
          ⚙️ Settings
        </div>
        <div
          className="sidebar-item"
          onClick={async () => {
            await logout();
            onClose();
            window.location.href = "/login";
          }}
        >
          🚪 Logout
        </div>
      </aside>
    </>
  );
}













// import React, { useEffect, useContext } from "react";
// import { AuthContext } from "../context/AuthContext";

// // Helper function to get the correct base URL for images
// const getImageURL = (imagePath) => {
//   const hostname = window.location.hostname;
//   if (hostname === 'localhost' || hostname === '127.0.0.1') {
//     return `http://localhost:5000/uploads/${imagePath}`;
//   } else {
//     return `http://${hostname}:5000/uploads/${imagePath}`;
//   }
// };

// export default function ProfileDrawer({ open, onClose }) {
//   const { user, logout } = useContext(AuthContext);
//   // Close drawer on Escape key
//   useEffect(() => {
//     const handleKeyDown = (e) => {
//       if (e.key === "Escape") onClose();
//     };
//     document.addEventListener("keydown", handleKeyDown);
//     return () => document.removeEventListener("keydown", handleKeyDown);
//   }, [onClose]);

//   // Prevent scroll when drawer open
//   useEffect(() => {
//     document.body.style.overflow = open ? "hidden" : "";
//   }, [open]);

//   return (
//     <>
//       {/* Blurred Overlay */}
//       <div
//         className={`overlay ${open ? "active" : ""}`}
//         onClick={onClose}
//       ></div>

//       {/* Drawer (slide from left) */}
//       <aside className={`drawer left-drawer ${open ? "open" : ""}`}>
//         <div className="drawer-header">
//           <h2>Profile</h2>
//           <button className="close-btn" onClick={onClose}>×</button>
//         </div>

//         <div className="profile-pic">
//           {user?.profileImage ? (
//             <img 
//               src={getImageURL(user.profileImage)} 
//               alt="Profile" 
//               style={{
//                 width: '100%',
//                 height: '100%',
//                 borderRadius: '50%',
//                 objectFit: 'cover'
//               }}
//               onError={(e) => {
//                 e.target.style.display = 'none';
//                 e.target.nextSibling.style.display = 'flex';
//               }}
//             />
//           ) : null}
//           <div 
//             style={{
//               width: '100%',
//               height: '100%',
//               borderRadius: '50%',
//               backgroundImage: user?.profileImage ? 'none' : `url(https://ui-avatars.com/api/?name=${encodeURIComponent(user?.fullName || user?.username || 'User')}&background=b30000&color=fff)`,
//               backgroundSize: 'cover',
//               backgroundPosition: 'center',
//               backgroundColor: user?.profileImage ? 'transparent' : 'transparent',
//               display: user?.profileImage ? 'none' : 'flex',
//               alignItems: 'center',
//               justifyContent: 'center',
//               fontSize: '32px',
//               fontWeight: 'bold',
//               color: '#fff'
//             }}
//           >
//             {!user?.profileImage && (user?.fullName?.charAt(0)?.toUpperCase() || user?.username?.charAt(0)?.toUpperCase() || 'U')}
//           </div>
//         </div>

//         <div className="profile-info">
//           <h3>{user?.fullName || "Guest User"}</h3>
//           <p>@{user?.username || "Not logged in"}</p>
//         </div>

//         <div className="sidebar-item" onClick={() => window.location.href = "/edit-profile"}>
//           👤 Edit Profile
//         </div>
//         <div className="sidebar-item" onClick={() => window.location.href = "/quiz-analytics"}>
//           📜 My Quizzes Analytics
//         </div>
//         <div className="sidebar-item" onClick={() => window.location.href = "/payment-history"}>
//           💳 Payment History
//         </div>
//         <div className="sidebar-item" onClick={() => window.location.href = "/settings"}>
//           ⚙️ Settings
//         </div>
//         <div
//           className="sidebar-item"
//           onClick={async () => {
//             await logout();
//             onClose();
//             window.location.href = "/login";
//           }}
//         >
//           🚪 Logout
//         </div>
//       </aside>
//     </>
//   );
// }
