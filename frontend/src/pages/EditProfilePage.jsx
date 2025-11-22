// // frontend/src/pages/EditProfilePage.jsx

// frontend/src/pages/EditProfilePage.jsx
import React, { useContext, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import DarkModeToggle from "../components/DarkModeToggle";
import API from "../utils/api";
import "../styles/global.css";

// Robust image URL getter
const getImageURL = (imagePath) => {
  if (!imagePath) return null;
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) return imagePath;
  const hostname = window.location.hostname;
  const port = window.location.port || "5000";
  return `http://${hostname}:${port}/images/${imagePath}`;
};

export default function EditProfilePage() {
  const { user, updateUser, refreshUser } = useContext(AuthContext);
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: user?.fullName || "",
    username: user?.username || "",
    phone: user?.phone || "",
  });
  const [profileImage, setProfileImage] = useState(null);
  const [previewImage, setPreviewImage] = useState(
    user?.profileImage ? getImageURL(user.profileImage) : null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (user?.profileImage) {
      setPreviewImage(getImageURL(user.profileImage));
    }
  }, [user?.profileImage]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Please select an image file");
    if (file.size > 5 * 1024 * 1024) return setError("Image must be <5MB");
    setError("");
    setProfileImage(file);

    const reader = new FileReader();
    reader.onload = (ev) => setPreviewImage(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const formData = new FormData();
      formData.append("fullName", form.fullName);
      formData.append("username", form.username);
      if (profileImage) formData.append("profileImage", profileImage);

      const { data } = await API.put("/auth/profile", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      updateUser(data.user);
      await refreshUser();

      setPreviewImage(data.user?.profileImage ? getImageURL(data.user.profileImage) : null);
      setSuccess("Profile updated! Redirecting...");
      setTimeout(() => navigate("/profile"), 2000);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || "Failed to update profile");
      setTimeout(() => setError(""), 5000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <header className="header">
        <div className="logo">
          <img src="/imgs/logo-DME.png" alt="Logo" />
        </div>
        <DarkModeToggle />
        <h2>EDIT PROFILE</h2>
      </header>

      <div className="auth-container">
        <div className="auth-box">
          <h2>Edit Profile</h2>
          <p className="auth-subtitle">Update your personal information</p>

          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}

          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label>Profile Picture</label>
              <div className="profile-image-upload">
                <div className="profile-image-preview" style={{ position: "relative", width: 120, height: 120 }}>
                  {previewImage ? (
                    <img
                      src={previewImage}
                      alt="Profile Preview"
                      style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }}
                      onError={(e) => (e.target.style.display = "none")}
                    />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        borderRadius: "50%",
                        backgroundColor: "#b30000",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "36px",
                        fontWeight: "bold",
                      }}
                    >
                      {(user?.fullName || user?.username || "U").charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <input type="file" id="profileImage" accept="image/*" onChange={handleImageChange} style={{ display: "none" }} />
                <label htmlFor="profileImage" className="upload-button">Choose Image</label>
              </div>
            </div>

            <div className="input-group">
              <label>Full Name</label>
              <input
                type="text"
                name="fullName"
                value={form.fullName}
                onChange={handleChange}
                required
                minLength={2}
                maxLength={50}
              />
            </div>

            <div className="input-group">
              <label>Username</label>
              <input
                type="text"
                name="username"
                value={form.username}
                onChange={handleChange}
                required
                minLength={3}
                maxLength={30}
                pattern="[a-zA-Z0-9_]+"
              />
            </div>

            <button type="submit" className="auth-button" disabled={loading}>
              {loading ? "⌛️Updating..." : "Update Profile"}
            </button>
          </form>

          <div className="auth-footer">
            <button className="back-button" onClick={() => navigate("/profile")}>
              ← Back to Profile
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
// import API from "../utils/api";
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

// export default function EditProfilePage() {
//   const { user, updateUser, refreshUser } = useContext(AuthContext);
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState("");
//   const [success, setSuccess] = useState("");
//   const navigate = useNavigate();

//   const [form, setForm] = useState({
//     fullName: user?.fullName || "",
//     username: user?.username || "",
//     phone: user?.phone || "",
//   });
//   const [profileImage, setProfileImage] = useState(null);
//   const [previewImage, setPreviewImage] = useState(user?.profileImage ? getImageURL(user.profileImage) : null);

//   // Update preview when user changes
//   React.useEffect(() => {
//     if (user?.profileImage) {
//       setPreviewImage(getImageURL(user.profileImage));
//     }
//   }, [user?.profileImage]);

//   const handleSubmit = async (e) => {
//     e.preventDefault();
//     setLoading(true);
//     setError("");
//     setSuccess("");

//     try {
//       const formData = new FormData();
//       formData.append("fullName", form.fullName);
//       formData.append("username", form.username);
      
//       if (profileImage) {
//         formData.append("profileImage", profileImage);
//       }

//       const { data } = await API.put("/auth/profile", formData, {
//         headers: {
//           "Content-Type": "multipart/form-data",
//         },
//       });
      
//       // Update preview with new image URL
//       if (data.user?.profileImage) {
//         setPreviewImage(getImageURL(data.user.profileImage));
//       }
      
//       updateUser(data.user);
//       await refreshUser(); // Refresh user data to ensure all components update
//       setSuccess("Profile updated successfully! Redirecting...");
      
//       setTimeout(() => {
//         navigate("/profile");
//       }, 2000);
//     } catch (err) {
//       console.error("Update error:", err);
//       const errorMessage = err.response?.data?.message || "Failed to update profile";
//       setError(errorMessage);
      
//       // Auto-hide error after 5 seconds
//       setTimeout(() => {
//         setError("");
//       }, 5000);
//     } finally {
//       setLoading(false);
//     }
//   };

//   const handleChange = (e) => {
//     setForm({
//       ...form,
//       [e.target.name]: e.target.value,
//     });
//   };

//   const handleImageChange = (e) => {
//     const file = e.target.files[0];
//     if (file) {
//       // Validate file size (5MB limit)
//       if (file.size > 5 * 1024 * 1024) {
//         setError("Image size must be less than 5MB");
//         return;
//       }
      
//       // Validate file type
//       if (!file.type.startsWith('image/')) {
//         setError("Please select a valid image file");
//         return;
//       }
      
//       setProfileImage(file);
//       setError(""); // Clear any previous errors
      
//       const reader = new FileReader();
//       reader.onload = (e) => {
//         setPreviewImage(e.target.result);
//       };
//       reader.readAsDataURL(file);
//     }
//   };

//   return (
//     <>
//       <header className="header">
//         <div className="logo">
//           <img src="/imgs/logo-DME.png" alt="Logo" />
//         </div>
//         <DarkModeToggle />
//         <h2>EDIT PROFILE</h2>
//       </header>

//       <div className="auth-container">
//         <div className="auth-box">
//           <h2>Edit Profile</h2>
//           <p className="auth-subtitle">Update your personal information</p>
          
//           {error && (
//             <div className="error-message">
//               {error}
//             </div>
//           )}

//           {success && (
//             <div className="success-message">
//               {success}
//             </div>
//           )}

//           <form onSubmit={handleSubmit}>
//             <div className="input-group">
//               <label>Profile Picture</label>
//               <div className="profile-image-upload">
//                 <div className="profile-image-preview">
//                   {previewImage ? (
//                     <img src={previewImage} alt="Profile Preview" />
//                   ) : (
//                     <div className="profile-image-placeholder">
//                       <span>📷</span>
//                       <p>No image selected</p>
//                     </div>
//                   )}
//                 </div>
//                 <input
//                   type="file"
//                   id="profileImage"
//                   accept="image/*"
//                   onChange={handleImageChange}
//                   style={{ display: "none" }}
//                 />
//                 <label htmlFor="profileImage" className="upload-button">
//                   Choose Image
//                 </label>
//               </div>
//             </div>

//             <div className="input-group">
//               <label>Full Name</label>
//               <input 
//                 type="text"
//                 name="fullName"
//                 placeholder="Enter your full name" 
//                 value={form.fullName}
//                 onChange={handleChange}
//                 required
//                 minLength={2}
//                 maxLength={50}
//               />
//               <small className="input-hint">2-50 characters</small>
//             </div>

//             <div className="input-group">
//               <label>Username</label>
//               <input 
//                 type="text"
//                 name="username"
//                 placeholder="Enter your username" 
//                 value={form.username}
//                 onChange={handleChange}
//                 required
//                 minLength={3}
//                 maxLength={30}
//                 pattern="[a-zA-Z0-9_]+"
//               />
//               <small className="input-hint">3-30 characters, letters, numbers, and underscores only</small>
//             </div>

//             <div className="input-group">
//               <label>Phone Number</label>
//               <input 
//                 type="tel"
//                 name="phone"
//                 placeholder="Enter your phone number" 
//                 value={form.phone}
//                 onChange={handleChange}
//                 required
//                 disabled
//               />
//               <small style={{ color: "#666", fontSize: "12px" }}>
//                 Phone number cannot be changed
//               </small>
//             </div>

//             <button 
//               type="submit" 
//               className="auth-button"
//               disabled={loading}
//             >
//               {loading ? "Updating..." : "Update Profile"}
//             </button>
//           </form>

//           <div className="auth-footer">
//             <button 
//               type="button"
//               className="back-button"
//               onClick={() => navigate("/profile")}
//             >
//               ← Back to Profile
//             </button>
//           </div>
//         </div>
//       </div>
//     </>
//   );
// }
