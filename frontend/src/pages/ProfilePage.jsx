// // frontend/src/pages/ProfilePage.jsx

// frontend/src/pages/ProfilePage.jsx
import React, { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import DarkModeToggle from "../components/DarkModeToggle";
import "../styles/global.css";

// Helper function to get the correct base URL for images
const getImageURL = (imagePath) => {
  if (!imagePath) return null;

  // If already a full URL, return as is
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    return imagePath;
  }

  const hostname = window.location.hostname;
  const port = window.location.port || "5000";

  return `http://${hostname}:${port}/images/${imagePath}`;
};

export default function ProfilePage() {
  const { user, logout } = useContext(AuthContext);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [imgError, setImgError] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    try {
      await logout();
      window.location.href = "/";
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setLoading(false);
    }
  };

  const avatarURL = user?.profileImage && !imgError ? getImageURL(user.profileImage) : null;
  const placeholderURL = `https://ui-avatars.com/api/?name=${encodeURIComponent(
    user?.fullName || user?.username || "User"
  )}&background=b30000&color=fff`;

  return (
    <>
      <header className="header">
        <div className="logo">
          <img src="/imgs/logo-DME.png" alt="Logo" />
        </div>
        <DarkModeToggle />
        <h2>PROFILE</h2>
      </header>

      <div className="profile-container">
        <div className="profile-card">
          <div className="profile-header">
            <div
              className="profile-avatar"
              style={{
                width: "120px",
                height: "120px",
                borderRadius: "50%",
                overflow: "hidden",
                position: "relative",
                backgroundColor: "#b30000",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {avatarURL ? (
                <img
                  src={avatarURL}
                  alt="Profile"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                  onError={() => setImgError(true)}
                />
              ) : (
                <img
                  src={placeholderURL}
                  alt="Placeholder"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              )}
            </div>

            <div className="profile-info">
              <h2>{user?.fullName || "User"}</h2>
              <p>@{user?.username || "No username"}</p>
              <span className="verified-badge">
                {user?.isVerified ? "✓ Verified" : "⚠ Not Verified"}
              </span>
            </div>
          </div>

          <div className="profile-stats">
            <div className="stat-item">
              <h3>Posts</h3>
              <p>{user?.stats?.posts || user?.blogCount || 0}</p>
            </div>
            <div className="stat-item">
              <h3>Quizzes</h3>
              <p>{user?.stats?.quizzes || user?.quizHistory?.length || 0}</p>
            </div>
            <div className="stat-item">
              <h3>Joined</h3>
              <p>{user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "Recently"}</p>
            </div>
          </div>

          <div className="profile-actions">
            <button className="action-button primary" onClick={() => navigate("/edit-profile")}>
              Edit Profile
            </button>
            <button className="action-button secondary">Change Password</button>
            <button className="action-button danger" onClick={handleLogout} disabled={loading}>
              {loading ? "⌛️Logging out..." : "Logout"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}


// import React, { useContext, useState } from "react";
// import { useNavigate } from "react-router-dom";
// import { AuthContext } from "../context/AuthContext";
// import DarkModeToggle from "../components/DarkModeToggle";
// import "../styles/global.css";

// // Helper function to get the correct base URL for images
// const getImageURL = (imagePath) => {
//   if (!imagePath) return null;
  
//   // If already a full URL, return as is
//   if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
//     return imagePath;
//   }
  
//   const hostname = window.location.hostname;
//   const port = window.location.port || '5000';
  
//   // Images are stored in uploads/images/ but served via /images/ route
//   if (hostname === 'localhost' || hostname === '127.0.0.1') {
//     return `http://localhost:${port}/images/${imagePath}`;
//   } else {
//     return `http://${hostname}:${port}/images/${imagePath}`;
//   }
// };

// export default function ProfilePage() {
//   const { user, logout } = useContext(AuthContext);
//   const [loading, setLoading] = useState(false);
//   const navigate = useNavigate();

//   const handleLogout = async () => {
//     setLoading(true);
//     try {
//       await logout();
//       window.location.href = "/";
//     } catch (error) {
//       console.error("Logout error:", error);
//     } finally {
//       setLoading(false);
//     }
//   };

//   return (
//     <>
//       <header className="header">
//         <div className="logo">
//           <img src="/imgs/logo-DME.png" alt="Logo" />
//         </div>
//         <DarkModeToggle />
//         <h2>PROFILE</h2>
//       </header>

//       <div className="profile-container">
//         <div className="profile-card">
//           <div className="profile-header">
//             <div className="profile-avatar" style={{ position: 'relative' }}>
//               {user?.profileImage ? (
//                 <>
//                   <img 
//                     src={getImageURL(user.profileImage)} 
//                     alt="Profile"
//                     style={{
//                       width: '100%',
//                       height: '100%',
//                       borderRadius: '50%',
//                       objectFit: 'cover',
//                       position: 'absolute',
//                       top: 0,
//                       left: 0
//                     }}
//                     onError={(e) => {
//                       e.target.style.display = 'none';
//                       const fallback = e.target.parentElement?.querySelector('.avatar-placeholder');
//                       if (fallback) {
//                         fallback.style.display = 'flex';
//                       }
//                     }}
//                   />
//                   <div 
//                     className="avatar-placeholder"
//                     style={{
//                       display: 'none',
//                       width: '100%',
//                       height: '100%',
//                       borderRadius: '50%',
//                       backgroundImage: `url(https://ui-avatars.com/api/?name=${encodeURIComponent(user?.fullName || user?.username || 'User')}&background=b30000&color=fff)`,
//                       backgroundSize: 'cover',
//                       backgroundPosition: 'center',
//                       alignItems: 'center',
//                       justifyContent: 'center',
//                       fontSize: '32px',
//                       fontWeight: 'bold',
//                       color: '#fff',
//                       position: 'absolute',
//                       top: 0,
//                       left: 0
//                     }}
//                   >
//                     {user?.fullName?.charAt(0)?.toUpperCase() || user?.username?.charAt(0)?.toUpperCase() || "U"}
//                   </div>
//                 </>
//               ) : (
//                 <div 
//                   className="avatar-placeholder"
//                   style={{
//                     display: 'flex',
//                     width: '100%',
//                     height: '100%',
//                     borderRadius: '50%',
//                     backgroundImage: `url(https://ui-avatars.com/api/?name=${encodeURIComponent(user?.fullName || user?.username || 'User')}&background=b30000&color=fff)`,
//                     backgroundSize: 'cover',
//                     backgroundPosition: 'center',
//                     alignItems: 'center',
//                     justifyContent: 'center',
//                     fontSize: '32px',
//                     fontWeight: 'bold',
//                     color: '#fff'
//                   }}
//                 >
//                   {user?.fullName?.charAt(0)?.toUpperCase() || user?.username?.charAt(0)?.toUpperCase() || "U"}
//                 </div>
//               )}
//             </div>
//             <div className="profile-info">
//               <h2>{user?.fullName || "User"}</h2>
//               <p>@{user?.username || "No username"}</p>
//               <span className="verified-badge">
//                 {user?.isVerified ? "✓ Verified" : "⚠ Not Verified"}
//               </span>
//             </div>
//           </div>

//           <div className="profile-stats">
//             <div className="stat-item">
//               <h3>Posts</h3>
//               <p>{user?.stats?.posts || user?.blogCount || 0}</p>
//             </div>
//             <div className="stat-item">
//               <h3>Quizzes</h3>
//               <p>{user?.stats?.quizzes || user?.quizHistory?.length || 0}</p>
//             </div>
//             <div className="stat-item">
//               <h3>Joined</h3>
//               <p>{user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "Recently"}</p>
//             </div>
//           </div>

//           <div className="profile-actions">
//             <button 
//               className="action-button primary"
//               onClick={() => navigate("/edit-profile")}
//             >
//               Edit Profile
//             </button>
//             <button className="action-button secondary">
//               Change Password
//             </button>
//             <button 
//               className="action-button danger"
//               onClick={handleLogout}
//               disabled={loading}
//             >
//               {loading ? "Logging out..." : "Logout"}
//             </button>
//           </div>
//         </div>
//       </div>
//     </>
//   );
// }