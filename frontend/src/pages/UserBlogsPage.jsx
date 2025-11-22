// // // frontend/src/pages/UserBlogsPage.jsx

// frontend/src/pages/UserBlogsPage.jsx

// import React, { useState, useEffect, useCallback, useContext } from "react";  // Ensure imports are correct
// import { useParams, useNavigate } from "react-router-dom";  // Ensure navigate is imported
// import dayjs from "dayjs";  // Ensure dayjs is imported
// import relativeTime from "dayjs/plugin/relativeTime";  // Ensure relativeTime plugin is imported
// import API from "../utils/api";  // Assuming you have API utility
// import { AuthContext } from "../context/AuthContext";  // Assuming you have AuthContext
// import BottomNavBar from "../components/BottomNavBar";
// import ProfileDrawer from "../components/ProfileDrawer";
// import DarkModeToggle from "../components/DarkModeToggle";
// import "../styles/global.css";  // Your global styles

// dayjs.extend(relativeTime);  // Initialize relative time plugin

// // Helper function to get image URL
// const getImageURL = (imagePath) => {
//   if (!imagePath) return null;
//   if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) return imagePath;
//   return `http://localhost:5000/images/${imagePath}`;
// };

// export default function UserBlogsPage() {
//   const { userId } = useParams();
//   const navigate = useNavigate();

//   const { user } = useContext(AuthContext);
//   const [blogs, setBlogs] = useState([]);
//   const [blogUser, setBlogUser] = useState(null);
//   const [drawerOpen, setDrawerOpen] = useState(false);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState(null);
//   const [page, setPage] = useState(1);
//   const [pagination, setPagination] = useState(null);
//   const [searchTerm, setSearchTerm] = useState("");

//   const loadUserBlogs = useCallback(async () => {
//     if (!userId) {
//       setError("Invalid user ID");
//       setLoading(false);
//       return;
//     }

//     try {
//       setLoading(true);
//       setError(null);
//       const { data } = await API.get(`/blogs/user/${userId}?page=${page}&limit=10`);

//       if (!data.blogs || !Array.isArray(data.blogs)) {
//         setBlogs([]);
//         setBlogUser(data.user || null);
//         return;
//       }

//       const mapped = data.blogs.map((b) => ({
//         ...b,
//         likesCount: b.likes?.length || 0,
//         liked: Array.isArray(b.likes) && user ? b.likes.some(like => like.toString() === user._id) : false,
//       }));

//       setBlogs(mapped);
//       setBlogUser(data.user);
//       setPagination(data.pagination);
//     } catch (err) {
//       setError(err.response?.data?.message || err.message || "Failed to load user blogs");
//       setBlogs([]);
//       if (err.response?.status === 404) {
//         setTimeout(() => navigate("/home"), 2000);
//       }
//     } finally {
//       setLoading(false);
//     }
//   }, [userId, page, user, navigate]);

//   useEffect(() => {
//     loadUserBlogs();
//   }, [loadUserBlogs]);

//   const toggleLike = async (id) => {
//     try {
//       if (!user) {
//         window.location.href = "/login";
//         return;
//       }

//       const { data } = await API.post(`/blogs/${id}/like`);
//       setBlogs((prev) =>
//         prev.map((b) =>
//           b._id === id
//             ? { ...b, liked: data.liked, likesCount: Array.isArray(data.likes) ? data.likes.length : data.likes }
//             : b
//         )
//       );
//     } catch (err) {
//       console.error("Like toggle error:", err);
//     }
//   };

//   // Filter blogs based on search term
//   const filteredBlogs = blogs.filter((b) =>
//     b.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
//     b.content.toLowerCase().includes(searchTerm.toLowerCase())
//   );

//   return (
//     <>
//       <header className="header">
//         <div className="logo">
//           <img src="/imgs/logo-DME.png" alt="Logo" />
//         </div>
//         <DarkModeToggle />
//         <h2>USER NOTES</h2>
//       </header>

//       <div className="home-container">
//         {blogUser && (
//           <div
//             style={{
//               display: "flex",
//               alignItems: "center",
//               gap: "15px",
//               margintop: "-25px",
//               marginBottom: "20px",
//               padding: "15px",
//               backgroundColor: "var(--card-bg, #ffffff00)",
//               borderRadius: "10px",
//               position: "relative",
//             }}
//           >
//             <div style={{ position: "relative", width: 60, height: 60 }}>
//               <img
//                 src={getImageURL(blogUser.profileImage)}
//                 alt={blogUser.username || blogUser.fullName}
//                 style={{
//                   width: "60px",
//                   height: "60px",
//                   borderRadius: "50%",
//                   objectFit: "cover",
//                   display: blogUser.profileImage ? "block" : "none",
//                 }}
//                 onError={(e) => (e.target.style.display = "none")}
//               />
//               <div
//                 style={{
//                   position: "absolute",
//                   top: 0,
//                   left: 0,
//                   width: "60px",
//                   height: "60px",
//                   borderRadius: "50%",
//                   backgroundColor: "#b30000",
//                   display: blogUser.profileImage ? "none" : "flex",
//                   alignItems: "center",
//                   justifyContent: "center",
//                   fontSize: "24px",
//                   fontWeight: "bold",
//                   color: "#fff",
//                 }}
//               >
//                 {(blogUser.fullName || blogUser.username || "U").charAt(0).toUpperCase()}
//               </div>
//             </div>
//             <div>
//               <h3 style={{ margin: 0, fontSize: "18px" }}>
//                 {blogUser.fullName || blogUser.username || "Unknown User"}
//               </h3>
//               <p style={{ margin: "5px 0 0 0", color: "#666", fontSize: "14px" }}>
//                 @{blogUser.username || "user"}
//               </p>
//             </div>
//           </div>
//         )}

//         <h2>📝 {blogUser?.fullName || blogUser?.username || "User"}'s Notes</h2>

//         <input
//           id="searchBar2"
//           placeholder="Search..."
//           value={searchTerm}
//           onChange={(e) => setSearchTerm(e.target.value)}
//           style={{
//             display: "block",
//             width: "100%",
//             maxWidth: "400px",
//             margin: "0 auto 25px auto",
//             padding: "10px 15px",
//             fontSize: "16px",
//             border: "1px solid gainsboro",
//             borderRadius: "30px",
//             outline: "none",
//             transition: "border-color 0.3s ease",
//           }}
//         />

//         <div id="postListHome">
//           {loading && <p style={{ textAlign: "center" }}>Loading blogs...</p>}
//           {error && (
//             <p style={{ textAlign: "center", color: "red" }}>
//               Error: {error}
//               {error.includes("not found") && <><br />Redirecting to home...</>}
//             </p>
//           )}
//           {!loading && !error && filteredBlogs.length === 0}
//         </div>
//       </div>
//     </>
//   );
// }
















// frontend/src/pages/UserBlogsPage.jsx
import React, { useEffect, useState, useContext, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import API from "../utils/api";
import { AuthContext } from "../context/AuthContext";
import BottomNavBar from "../components/BottomNavBar";
import ProfileDrawer from "../components/ProfileDrawer";
import DarkModeToggle from "../components/DarkModeToggle";
import "../styles/global.css";

dayjs.extend(relativeTime);

// Helper function to get image URL
const getImageURL = (imagePath) => {
  if (!imagePath) return null;
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) return imagePath;
  return `http://localhost:5000/images/${imagePath}`;
};

export default function UserBlogsPage() {
  const { userId } = useParams();
  const navigate = useNavigate();

  const { user } = useContext(AuthContext);
  const [blogs, setBlogs] = useState([]);
  const [blogUser, setBlogUser] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  const loadUserBlogs = useCallback(async () => {
    if (!userId) {
      setError("Invalid user ID");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data } = await API.get(`/blogs/user/${userId}?page=${page}&limit=10`);

      if (!data.blogs || !Array.isArray(data.blogs)) {
        setBlogs([]);
        setBlogUser(data.user || null);
        return;
      }

      // STEP 1 — Update views automatically once per visit
      data.blogs.forEach(async (b) => {
        const key = `viewed_${userId}`;

        if (!localStorage.getItem(key)) {
          try {
            // await API.post(`/blogs/${b._id}/view`);
            await API.post(`/blogs/${userId}/view`);
            localStorage.setItem(key, "1");
          } catch (err) {
            console.log("Auto view update failed:", b._id, err);
          }
        }
      });

      // STEP 2 — Map blog data
      const mapped = data.blogs.map((b) => ({
        ...b,
        likesCount: b.likes?.length || 0,
        liked: Array.isArray(b.likes) && user
          ? b.likes.some((like) => like.toString() === user._id)
          : false,
      }));

      setBlogs(mapped);
      setBlogUser(data.user);
      setPagination(data.pagination);

    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to load user blogs");
      setBlogs([]);

      if (err.response?.status === 404) {
        setTimeout(() => navigate("/home"), 2000);
      }
    } finally {
      setLoading(false);
    }
  }, [userId, page, user, navigate]);

  useEffect(() => {
    loadUserBlogs();
  }, [loadUserBlogs]);

  const toggleLike = async (id) => {
    try {
      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data } = await API.post(`/blogs/${id}/like`);

      setBlogs((prev) =>
        prev.map((b) =>
          b._id === id
            ? {
                ...b,
                liked: data.liked,
                likesCount: Array.isArray(data.likes)
                  ? data.likes.length
                  : data.likes,
              }
            : b
        )
      );
    } catch (err) {
      console.error("Like toggle error:", err);
    }
  };

  const filteredBlogs = blogs.filter(
    (b) =>
      b.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <header className="header">
        <div className="logo">
          <img src="/imgs/logo-DME.png" alt="Logo" />
        </div>
        <DarkModeToggle />
        <h2>USER NOTES</h2>
      </header>

      <div className="home-container">
        {blogUser && (
          <div
            className="glass-premium-card"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "15px",
              marginBottom: "20px",
              padding: "15px",
              background: "rgba(255, 255, 255, 0.2)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              borderRadius: "16px",
              border: "1px solid rgba(255, 255, 255, 0.3)",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.15)",
            }}
          >
            <div style={{ position: "relative", width: 60, height: 60 }}>
              <img
                src={getImageURL(blogUser.profileImage)}
                alt={blogUser.username || blogUser.fullName}
                style={{
                  width: "60px",
                  height: "60px",
                  borderRadius: "50%",
                  objectFit: "cover",
                  display: blogUser.profileImage ? "block" : "none",
                }}
                onError={(e) => (e.target.style.display = "none")}
              />

              {!blogUser.profileImage && (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "60px",
                    height: "60px",
                    borderRadius: "50%",
                    backgroundColor: "#b30000",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "24px",
                    fontWeight: "bold",
                    color: "#fff",
                  }}
                >
                  {(blogUser.fullName || blogUser.username || "U")
                    .charAt(0)
                    .toUpperCase()}
                </div>
              )}
            </div>

            <div>
              <h3 style={{ margin: 0, fontSize: "16px", color: "white" }}>
                {blogUser.fullName || blogUser.username || "Unknown User"}
              </h3>
              <p style={{ margin: 0, color: "#666", fontSize: "14px" }}>
                @{blogUser.username || "user"}
              </p>
            </div>
          </div>
        )}

        <h2
          style={{
            fontSize: "15px",
            fontWeight: "bold",
            color: "#b30000",
            margin: "5px 0 15px 0",
            letterSpacing: "0.5px",
          }}
        >
          📝 {blogUser?.fullName || blogUser?.username || "User"}'s Notes
        </h2>

        <input
          id="searchBar2"
          placeholder="Search..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            display: "block",
            width: "100%",
            maxWidth: "400px",
            margin: "0 auto 25px auto",
            padding: "10px 15px",
            fontSize: "16px",
            border: "1px solid gainsboro",
            borderRadius: "30px",
            outline: "none",
          }}
        />

        <div id="postListHome">
          {loading && <p style={{ textAlign: "center" }}>⌛️Loading notes...</p>}
          {error && (
            <p style={{ textAlign: "center", color: "red" }}>
              Error: {error}
              {error.includes("not found") && (
                <>
                  <br />⌛️Redirecting to home...
                </>
              )}
            </p>
          )}

          {!loading &&
            !error &&
            filteredBlogs.length > 0 &&
            filteredBlogs.map((post) => (
              <PostCard key={post._id} post={post} onLike={() => toggleLike(post._id)} />
            ))}
        </div>

        {pagination && pagination.totalPages > 1 && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "10px",
              marginTop: "20px",
            }}
          >
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={!pagination.hasPrev}
              style={{
                padding: "8px 16px",
                backgroundColor: pagination.hasPrev ? "#b30000" : "#ccc",
                color: "white",
                border: "none",
                borderRadius: "5px",
                cursor: pagination.hasPrev ? "pointer" : "not-allowed",
              }}
            >
              Previous
            </button>

            <span style={{ display: "flex", alignItems: "center" }}>
              Page {pagination.currentPage} of {pagination.totalPages}
            </span>

            <button
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={!pagination.hasNext}
              style={{
                padding: "8px 16px",
                backgroundColor: pagination.hasNext ? "#b30000" : "#ccc",
                color: "white",
                border: "none",
                borderRadius: "5px",
                cursor: pagination.hasNext ? "pointer" : "not-allowed",
              }}
            >
              Next
            </button>
          </div>
        )}
      </div>

      <ProfileDrawer
        key={user?._id || "no-user"}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
      <BottomNavBar onProfileClick={() => setDrawerOpen(true)} />
    </>
  );
}

// ----------------------------------
// POSTCARD COMPONENT (final version)
// ----------------------------------
function PostCard({ post, onLike }) {
  const [expanded, setExpanded] = useState(false);
  // const [localViews, setLocalViews] = useState(post.views || 0);
  

  const isLong = post.content.length > 300;
  const shortContent = isLong ? post.content.slice(0, 300) + "..." : post.content;

  const timestamp = `${dayjs(post.createdAt).format("MMM D, YYYY")} • ${dayjs(
    post.createdAt
  ).fromNow()}`;

  return (
    <div className="post-card" style={{ marginBottom: 16 }}>
      <div className="post-header">
        <div className="username">
          <div>
            {post.author?.fullName ||
              post.author?.username ||
              post.user?.fullName ||
              post.user?.username ||
              "Unknown"}
          </div>
          <div className="timestamp">{timestamp}</div>
        </div>
      </div>

      <div
        className="post-title"
        style={{
          fontWeight: "bold",
          marginBottom: "10px",
          fontSize: "18px",
        }}
      >
        {post.title}

        {post.pdfUrl && (
          <div className="pdf-link">
            <a
              href={`http://localhost:5000/api/blogs/pdfs/${post.pdfUrl.split("/").pop()}`}
              target="_blank"
              rel="noreferrer"
            >
              Click Here To Download PDF File
            </a>
          </div>
        )}
      </div>

      <div className={`post-content ${expanded ? "expanded" : isLong ? "collapsed" : ""}`}>
        {expanded ? post.content : shortContent}
        {!expanded && isLong && <div className="fade"></div>}
      </div>

      {isLong && (
        <div
          className="read-more"
          onClick={() => setExpanded((s) => !s)}
          style={{ cursor: "pointer" }}
        >
          {expanded ? "Show less" : "Read more"}
        </div>
      )}

      <div style={{ marginTop: "8px" }}>
        <span
          className="star-icon"
          onClick={onLike}
          style={{
            color: post.liked ? "gold" : "gray",
            cursor: "pointer",
          }}
        >
          ⭐
        </span>

        <span className="star-count" style={{ marginLeft: "4px" }}>
          {post.likesCount}
        </span>

        <span style={{ marginLeft: "15px", color: "#666" }}>
          👁{post.views}
        </span>
      </div>
    </div>
  );
}





//////////////////////////////////////////
// // frontend/src/pages/UserBlogsPage.jsx
// import React, { useEffect, useState, useContext, useCallback } from "react";
// import { useParams, useNavigate } from "react-router-dom";
// import dayjs from "dayjs";
// import relativeTime from "dayjs/plugin/relativeTime";
// import API from "../utils/api";
// import { AuthContext } from "../context/AuthContext";
// import BottomNavBar from "../components/BottomNavBar";
// import ProfileDrawer from "../components/ProfileDrawer";
// import DarkModeToggle from "../components/DarkModeToggle";
// import "../styles/global.css";

// dayjs.extend(relativeTime);

// // Helper function to get image URL
// const getImageURL = (imagePath) => {
//   if (!imagePath) return null;
//   if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) return imagePath;
//   return `http://localhost:5000/images/${imagePath}`;
// };

// export default function UserBlogsPage() {
//   const { userId } = useParams();
//   const navigate = useNavigate();

//   const { user } = useContext(AuthContext);
//   const [blogs, setBlogs] = useState([]);
//   const [blogUser, setBlogUser] = useState(null);
//   const [drawerOpen, setDrawerOpen] = useState(false);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState(null);
//   const [page, setPage] = useState(1);
//   const [pagination, setPagination] = useState(null);
//   const [searchTerm, setSearchTerm] = useState("");

//   const loadUserBlogs = useCallback(async () => {
//     if (!userId) {
//       setError("Invalid user ID");
//       setLoading(false);
//       return;
//     }

//     try {
//       setLoading(true);
//       setError(null);
//       const { data } = await API.get(`/blogs/user/${userId}?page=${page}&limit=10`);

//       if (!data.blogs || !Array.isArray(data.blogs)) {
//         setBlogs([]);
//         setBlogUser(data.user || null);
//         return;
//       }

//       const mapped = data.blogs.map((b) => ({
//         ...b,
//         likesCount: b.likes?.length || 0,
//         liked: Array.isArray(b.likes) && user ? b.likes.some(like => like.toString() === user._id) : false,
//       }));

//       setBlogs(mapped);
//       setBlogUser(data.user);
//       setPagination(data.pagination);
//     } catch (err) {
//       setError(err.response?.data?.message || err.message || "Failed to load user blogs");
//       setBlogs([]);
//       if (err.response?.status === 404) {
//         setTimeout(() => navigate("/home"), 2000);
//       }
//     } finally {
//       setLoading(false);
//     }
//   }, [userId, page, user, navigate]);

//   useEffect(() => {
//     loadUserBlogs();
//   }, [loadUserBlogs]);

//   const toggleLike = async (id) => {
//     try {
//       if (!user) {
//         window.location.href = "/login";
//         return;
//       }

//       const { data } = await API.post(`/blogs/${id}/like`);
//       setBlogs((prev) =>
//         prev.map((b) =>
//           b._id === id
//             ? { ...b, liked: data.liked, likesCount: Array.isArray(data.likes) ? data.likes.length : data.likes }
//             : b
//         )
//       );
//     } catch (err) {
//       console.error("Like toggle error:", err);
//     }
//   };

//   // Filter blogs based on search term
//   const filteredBlogs = blogs.filter((b) =>
//     b.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
//     b.content.toLowerCase().includes(searchTerm.toLowerCase())
//   );

//   return (
//     <>
//       <header className="header">
//         <div className="logo">
//           <img src="/imgs/logo-DME.png" alt="Logo" />
//         </div>
//         <DarkModeToggle />
//         <h2>USER NOTES</h2>
//       </header>

//       <div className="home-container">

//         {blogUser && (

// <div className="glass-premium-card"
//   style={{
//     display: "flex",
//     alignItems: "center",
//     gap: "15px",
//     marginBottom: "20px",
//     padding: "15px",
//     background: "rgba(255, 255, 255, 0.2)",   // glass transparency
//     backdropFilter: "blur(10px)",           // main glass blur
//     WebkitBackdropFilter: "blur(10px)",     // Safari support
//     borderRadius: "16px",
//     position: "relative",
//     border: "1px solid rgba(255, 255, 255, 0.3)",
//     boxShadow: "0 8px 32px rgba(0, 0, 0, 0.15)",
//   }}
// >


//             <div style={{ position: "relative", width: 60, height: 60 }}>
//               <img
//                 src={getImageURL(blogUser.profileImage)}
//                 alt={blogUser.username || blogUser.fullName}
//                 style={{
//                   width: "60px",
//                   height: "60px",
//                   borderRadius: "50%",
//                   objectFit: "cover",
//                   display: blogUser.profileImage ? "block" : "none",
//                 }}
//                 onError={(e) => (e.target.style.display = "none")}
//                 />
//               <div
//                 style={{
//                   position: "absolute",
//                   top: 0,
//                   left: 0,
//                   width: "60px",
//                   height: "60px",
//                   borderRadius: "50%",
//                   backgroundColor: "#b30000",
//                   display: blogUser.profileImage ? "none" : "flex",
//                   alignItems: "center",
//                   justifyContent: "center",
//                   fontSize: "24px",
//                   fontWeight: "bold",
//                   color: "#fff",
//                 }}
//               >
//                 {(blogUser.fullName || blogUser.username || "U").charAt(0).toUpperCase()}
//               </div>
//             </div>
//             <div>
//               <h3 style={{ margin: 0, fontSize: "16px", color:"white" }}>
//                 {blogUser.fullName || blogUser.username || "Unknown User"}
//               </h3>
//               <p style={{ margin: "5px 0 0 0", color: "#666", fontSize: "14px" }}>
//                 @{blogUser.username || "user"}
//               </p>
//             </div>
//           </div>
//         )}
        
//         <h2   style={{
//     fontSize: "15px",
//     fontWeight: "bold",
//     color: "#b30000",
//     margin: "5px 0 15px 0",
//     letterSpacing: "0.5px",
//   }}>📝 {blogUser?.fullName || blogUser?.username || "User"}'s Notes</h2>
                
//                 <input
//                   id="searchBar2"
//                   placeholder="Search..."
//                   value={searchTerm}
//                   onChange={(e) => setSearchTerm(e.target.value)}
//                   style={{
//                     display: "block",
//                     width: "100%",
//                     maxWidth: "400px",
//                     margin: "0 auto 25px auto",
//                     padding: "10px 15px",
//                     fontSize: "16px",
//                     border: "1px solid gainsboro",
//                     borderRadius: "30px",
//                     outline: "none",
//                     transition: "border-color 0.3s ease",
//                   }}
//                   />


//         <div id="postListHome">
//           {loading && <p style={{ textAlign: "center" }}>⌛️Loading notes...</p>}
//           {error && (
//             <p style={{ textAlign: "center", color: "red" }}>
//               Error: {error}
//               {error.includes("not found") && <><br />⌛️Redirecting to home...</>}
//             </p>
//           )}
//           {!loading && !error && filteredBlogs.length === 0 && (
//             <p style={{ textAlign: "center" }}>No posts found.</p>
//           )}
//           {!loading && !error && filteredBlogs.map((post) => (
//             <PostCard key={post._id} post={post} onLike={() => toggleLike(post._id)} />
//           ))}
//         </div>

//         {pagination && pagination.totalPages > 1 && (
//           <div style={{ display: "flex", justifyContent: "center", gap: "10px", marginTop: "20px" }}>
//             <button
//               onClick={() => setPage(p => Math.max(1, p - 1))}
//               disabled={!pagination.hasPrev}
//               style={{
//                 padding: "8px 16px",
//                 backgroundColor: pagination.hasPrev ? "#b30000" : "#ccc",
//                 color: "white",
//                 border: "none",
//                 borderRadius: "5px",
//                 cursor: pagination.hasPrev ? "pointer" : "not-allowed",
//               }}
//             >
//               Previous
//             </button>
//             <span style={{ display: "flex", alignItems: "center", padding: "0 10px" }}>
//               Page {pagination.currentPage} of {pagination.totalPages}
//             </span>
//             <button
//               onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
//               disabled={!pagination.hasNext}
//               style={{
//                 padding: "8px 16px",
//                 backgroundColor: pagination.hasNext ? "#b30000" : "#ccc",
//                 color: "white",
//                 border: "none",
//                 borderRadius: "5px",
//                 cursor: pagination.hasNext ? "pointer" : "not-allowed",
//               }}
//             >
//               Next
//             </button>
//           </div>
//         )}
//       </div>

//       <ProfileDrawer
//         key={user?._id || "no-user"}
//         open={drawerOpen}
//         onClose={() => setDrawerOpen(false)}
//       />
//       <BottomNavBar onProfileClick={() => setDrawerOpen(true)} />
//     </>
//   );
// }

// // --------------------
// // PostCard Component
// // --------------------
// // function PostCard({ post, onLike }) {
// //   const [expanded, setExpanded] = useState(false);
// //   const isLong = post.content.length > 300;
// //   const shortContent = isLong ? post.content.slice(0, 300) + "..." : post.content;
// //   const timestamp = `${dayjs(post.createdAt).format("MMM D, YYYY")} • ${dayjs(post.createdAt).fromNow()}`;

// //   return (
// //     <div className="post-card" style={{ marginBottom: 16 }}>
// //       <div className="post-header">
// //           <div className="username">
// //         <div>
// //             {post.author?.fullName || post.author?.username || post.user?.fullName || post.user?.username || "Unknown"}
// //           </div>
// //           <div className="timestamp">{timestamp}</div>
// //         </div>
// //       </div>

// //       <div className="post-title" style={{ fontWeight: 'bold', marginBottom: '10px', fontSize: '18px' }}>
// //         {post.title}
// //         href={`http://localhost:5000/api/blogs/pdfs/${post.pdfUrl.split("/").pop()}`}
// //         <div className="star-section">
// //           {post.pdfUrl && (
// //           <div className="pdf-link">
// //               <a
// //                 href={`http://localhost:5000/api/blogs/pdfs/${post.pdfUrl.split("/").pop()}`}
// //                 target="_blank"
// //                 rel="noreferrer"
// //               >
// //                 Click Here To Download PDF File
// //               </a>
// //           </div>
// //           )}
// //         </div>
// //       </div>
      
// //       <div className={`post-content ${expanded ? "expanded" : isLong ? "collapsed" : ""}`}>
// //         {expanded ? post.content : shortContent}
// //         {!expanded && isLong && <div className="fade"></div>}
// //       </div>

// //       {isLong && (
// //         <div className="read-more" onClick={() => setExpanded(s => !s)} style={{ cursor: "pointer" }}>
// //           {expanded ? "Show less" : "Read more"}
// //         </div>
// //       )}

// //       <div style={{ marginTop: "8px" }}>
// //         <span className="star-icon" onClick={onLike} style={{ color: post.liked ? "gold" : "gray", cursor: "pointer" }}>⭐</span>
// //         <span className="star-count" style={{ marginLeft: "4px" }}>{post.likesCount || 0}</span>
// //         <span style={{ marginLeft: '15px', color: '#666' }}>👁️ {post.views || 0} views</span>
// //       </div>
// //     </div>
// //   );
// // }
// // function PostCard({ post, onLike }) {
// //   const [expanded, setExpanded] = useState(false);
// //   const isLong = post.content.length > 300;
// //   const shortContent = isLong ? post.content.slice(0, 300) + "..." : post.content;
// //   const timestamp = `${dayjs(post.createdAt).format("MMM D, YYYY")} • ${dayjs(post.createdAt).fromNow()}`;
// //   // const navigate = useNavigate();

// //   return (
// //     <div className="post-card" style={{ marginBottom: 16 }}>
// //       <div className="post-header">
// //         <div className="username">
// //           <div
// //             // style={{ cursor: 'pointer', color: 'inherit', textDecoration: 'none' }}
// //             // onClick={() => navigate(`/user/${postAuthorId}/blogs`)}            
// //             >
// //             {post.author?.fullName || post.author?.username || post.user?.fullName || post.user?.username || "Unknown"}
// //           </div>
// //           <div className="timestamp">{timestamp}</div>
// //         </div>
// //       </div>

// //       <div className="post-title" style={{ fontWeight: 'bold', marginBottom: '10px', fontSize: '18px' }}>
// //         {post.title}
// //         {post.pdfUrl && (
// //           <div className="star-section">
// //             <div className="pdf-link">
// //               <a
// //                 href={`http://localhost:5000/api/blogs/pdfs/${post.pdfUrl.split("/").pop()}`}
// //                 target="_blank"
// //                 rel="noreferrer"
// //               >
// //                 Click Here To Download PDF File
// //               </a>
// //             </div>
// //           </div>
// //         )}
// //       </div>

// //       <div className={`post-content ${expanded ? "expanded" : isLong ? "collapsed" : ""}`}>
// //         {expanded ? post.content : shortContent}
// //         {!expanded && isLong && <div className="fade"></div>}
// //       </div>

// //       {isLong && (
// //         <div className="read-more" onClick={() => setExpanded(s => !s)} style={{ cursor: "pointer" }}>
// //           {expanded ? "Show less" : "Read more"}
// //         </div>
// //       )}

// //       <div style={{ marginTop: "8px" }}>
// //         <span className="star-icon" onClick={onLike} style={{ color: post.liked ? "gold" : "gray", cursor: "pointer" }}>⭐</span>
// //         <span className="star-count" style={{ marginLeft: "4px" }}>{post.likesCount || 0}</span>
// //         <span style={{ marginLeft: '15px', color: '#666' }}>👁️ {post.views || 0} views</span>
// //       </div>
// //     </div>
// //   );
// // }
// function PostCard({ post, onLike }) {
//   const [expanded, setExpanded] = useState(false);
//   const [localViews, setLocalViews] = useState(post.views || 0);

//   const isLong = post.content.length > 300;
//   const shortContent = isLong ? post.content.slice(0, 300) + "..." : post.content;
//   const timestamp = `${dayjs(post.createdAt).format("MMM D, YYYY")} • ${dayjs(post.createdAt).fromNow()}`;

//   const increaseViews = async () => {
//     try {
//       await API.post(`/blogs/${post._id}/view`);
//       setLocalViews(v => v + 1);
//     } catch (err) {
//       console.log("View update failed:", err);
//     }
//   };

//   return (
//     <div className="post-card" style={{ marginBottom: 16 }}>
//       <div className="post-header">
//         <div className="username">
//           <div>
//             {post.author?.fullName || post.author?.username || post.user?.fullName || post.user?.username || "Unknown"}
//           </div>
//           <div className="timestamp">{timestamp}</div>
//         </div>
//       </div>

//       <div
//         className="post-title"
//         style={{ fontWeight: 'bold', marginBottom: '10px', fontSize: '18px', cursor: "pointer" }}
//         onClick={increaseViews}
//       >
//         {post.title}

//         {post.pdfUrl && (
//           <div className="star-section">
//             <div className="pdf-link">
//               <a
//                 href={`http://localhost:5000/api/blogs/pdfs/${post.pdfUrl.split("/").pop()}`}
//                 target="_blank"
//                 rel="noreferrer"
//               >
//                 Click Here To Download PDF File
//               </a>
//             </div>
//           </div>
//         )}
//       </div>

//       <div className={`post-content ${expanded ? "expanded" : isLong ? "collapsed" : ""}`}>
//         {expanded ? post.content : shortContent}
//         {!expanded && isLong && <div className="fade"></div>}
//       </div>

//       {isLong && (
//         <div
//           className="read-more"
//           onClick={() => setExpanded(s => !s)}
//           style={{ cursor: "pointer" }}
//         >
//           {expanded ? "Show less" : "Read more"}
//         </div>
//       )}

//       <div style={{ marginTop: "8px" }}>
//         <span
//           className="star-icon"
//           onClick={onLike}
//           style={{ color: post.liked ? "gold" : "gray", cursor: "pointer" }}
//         >
//           ⭐
//         </span>
//         <span className="star-count" style={{ marginLeft: "4px" }}>
//           {post.likesCount || 0}
//         </span>

//         {/* Updated views */}
//         <span style={{ marginLeft: "15px", color: "#666" }}>
//           👁️ {localViews} views
//         </span>
//       </div>
//     </div>
//   );
// }








// // frontend/src/pages/UserBlogsPage.jsx
// import React, { useEffect, useState, useContext, useCallback } from "react";
// import { useParams, useNavigate } from "react-router-dom";
// import dayjs from "dayjs";
// import relativeTime from "dayjs/plugin/relativeTime";
// import API from "../utils/api";
// import { AuthContext } from "../context/AuthContext";
// import BottomNavBar from "../components/BottomNavBar";
// import ProfileDrawer from "../components/ProfileDrawer";
// import DarkModeToggle from "../components/DarkModeToggle";
// import "../styles/global.css";

// // Helper function to get the correct base URL for images
// const getImageURL = (imagePath) => {
//   if (!imagePath) return null;
//   if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) return imagePath;

//   // Always point to backend for images
//   return `http://localhost:5000/images/${imagePath}`;
// };

// dayjs.extend(relativeTime);

// export default function UserBlogsPage() {
//   const { userId } = useParams();
//   const navigate = useNavigate();

//   const { user } = useContext(AuthContext);
//   const [blogs, setBlogs] = useState([]);
//   const [blogUser, setBlogUser] = useState(null);
//   const [drawerOpen, setDrawerOpen] = useState(false);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState(null);
//   const [page, setPage] = useState(1);
//   const [pagination, setPagination] = useState(null);

//   const loadUserBlogs = useCallback(async () => {
//     if (!userId) {
//       setError("Invalid user ID");
//       setLoading(false);
//       return;
//     }

//     try {
//       setLoading(true);
//       setError(null);
//       const { data } = await API.get(`/blogs/user/${userId}?page=${page}&limit=10`);

//       if (!data.blogs || !Array.isArray(data.blogs)) {
//         setBlogs([]);
//         setBlogUser(data.user || null);
//         return;
//       }

//       const mapped = data.blogs.map((b) => ({
//         ...b,
//         likesCount: b.likes?.length || 0,
//         liked: Array.isArray(b.likes) && user ? b.likes.some(like => like.toString() === user._id) : false,
//       }));

//       setBlogs(mapped);
//       setBlogUser(data.user);
//       setPagination(data.pagination);
//     } catch (err) {
//       setError(err.response?.data?.message || err.message || "Failed to load user blogs");
//       setBlogs([]);
//       if (err.response?.status === 404) {
//         setTimeout(() => navigate("/home"), 2000);
//       }
//     } finally {
//       setLoading(false);
//     }
//   }, [userId, page, user, navigate]);

//   useEffect(() => {
//     loadUserBlogs();
//   }, [loadUserBlogs]);

//   const toggleLike = async (id) => {
//     try {
//       if (!user) {
//         window.location.href = "/login";
//         return;
//       }

//       const { data } = await API.post(`/blogs/${id}/like`);
//       setBlogs((prev) =>
//         prev.map((b) =>
//           b._id === id ? { ...b, liked: data.liked, likesCount: data.likes } : b
//         )
//       );
//     } catch (err) {
//       console.error("Like toggle error:", err);
//     }
//   };

//   return (
//     <>
//       <header className="header">
//         <div className="logo">
//           <img src="/imgs/logo-DME.png" alt="Logo" />
//         </div>
//         <DarkModeToggle />
//         <h2>USER NOTES</h2>
//       </header>



//       <div className="home-container">
//       <h2>📝 {blogUser?.fullName || blogUser?.username || "User"}'s Notes</h2>
//       <input id="searchBar" placeholder="Search..." value=""></input>
//       #searchBar {
//     display: block;
//     width: 100%;
//     max-width: 400px;
//     margin: 0 auto 25px auto;
//     padding: 10px 15px;
//     font-size: 16px;
//     border: 1px solid gainsboro;
//     border-radius: 30px;
//     outline: none;
//     transition: border-color 0.3s 
// ease;
// }


//         {blogUser && (
//           <div
//           style={{
//             display: "flex",
//             alignItems: "center",
//             gap: "15px",
//             marginBottom: "20px",
//             padding: "15px",
//             backgroundColor: "var(--card-bg, #ffffff00)",
//             borderRadius: "10px",
//             // boxShadow: "0 4px 8px rgba(0, 0, 0, 0.1) : 0 2px 4px rgba(0, 0, 0, 0.05)",
//             // boxShadow: "0 4px 20px rgba(0, 0, 0, 0.4)",
//             position: "relative",
//           }}
//           >
//             <div style={{ position: "relative", width: 60, height: 60 }}>
//               <img
//                 src={getImageURL(blogUser.profileImage)}
//                 alt={blogUser.username || blogUser.fullName}
//                 style={{
//                   width: "60px",
//                   height: "60px",
//                   borderRadius: "50%",
//                   objectFit: "cover",
//                   display: blogUser.profileImage ? "block" : "none",
//                 }}
//                 onError={(e) => (e.target.style.display = "none")}
//               />
//               <div
//                 style={{
//                   position: "absolute",
//                   top: 0,
//                   left: 0,
//                   width: "60px",
//                   height: "60px",
//                   borderRadius: "50%",
//                   backgroundColor: "#b30000",
//                   display: blogUser.profileImage ? "none" : "flex",
//                   alignItems: "center",
//                   justifyContent: "center",
//                   fontSize: "24px",
//                   fontWeight: "bold",
//                   color: "#fff",
//                 }}
//               >
//                 {(blogUser.fullName || blogUser.username || "U").charAt(0).toUpperCase()}
//               </div>
//             </div>
//             <div>
//               <h3 style={{ margin: 0, fontSize: "18px" }}>
//                 {blogUser.fullName || blogUser.username || "Unknown User"}
//               </h3>
//               <p style={{ margin: "5px 0 0 0", color: "#666", fontSize: "14px" }}>
//                 @{blogUser.username || "user"}
//               </p>
//             </div>
//           </div>
//         )}

        

//         <div id="postListHome">
//           {loading && <p style={{ textAlign: "center" }}>Loading blogs...</p>}
//           {error && (
//             <p style={{ textAlign: "center", color: "red" }}>
//               Error: {error}
//               {error.includes("not found") && <><br />Redirecting to home...</>}
//             </p>
//           )}
//           {!loading && !error && blogs.length === 0 && (
//             <p style={{ textAlign: "center" }}>No posts found.</p>
//           )}
//           {!loading && !error && blogs.map((post) => (
//             <PostCard key={post._id} post={post} onLike={() => toggleLike(post._id)} />
//           ))}
//         </div>

//         {pagination && pagination.totalPages > 1 && (
//           <div style={{ display: "flex", justifyContent: "center", gap: "10px", marginTop: "20px" }}>
//             <button
//               onClick={() => setPage(p => Math.max(1, p - 1))}
//               disabled={!pagination.hasPrev}
//               style={{
//                 padding: "8px 16px",
//                 backgroundColor: pagination.hasPrev ? "#b30000" : "#ccc",
//                 color: "white",
//                 border: "none",
//                 borderRadius: "5px",
//                 cursor: pagination.hasPrev ? "pointer" : "not-allowed",
//               }}
//             >
//               Previous
//             </button>
//             <span style={{ display: "flex", alignItems: "center", padding: "0 10px" }}>
//               Page {pagination.currentPage} of {pagination.totalPages}
//             </span>
//             <button
//               onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
//               disabled={!pagination.hasNext}
//               style={{
//                 padding: "8px 16px",
//                 backgroundColor: pagination.hasNext ? "#b30000" : "#ccc",
//                 color: "white",
//                 border: "none",
//                 borderRadius: "5px",
//                 cursor: pagination.hasNext ? "pointer" : "not-allowed",
//               }}
//             >
//               Next
//             </button>
//           </div>
//         )}
//       </div>

//       <ProfileDrawer
//         key={user?._id || "no-user"}
//         open={drawerOpen}
//         onClose={() => setDrawerOpen(false)}
//       />
//       <BottomNavBar onProfileClick={() => setDrawerOpen(true)} />
//     </>
//   );
// }

// function PostCard({ post, onLike }) {
//   const [expanded, setExpanded] = useState(false);
//   const isLong = post.content.length > 300;
//   const shortContent = isLong ? post.content.slice(0, 300) + "..." : post.content;
//   const timestamp = `${dayjs(post.createdAt).format("MMM D, YYYY")} • ${dayjs(post.createdAt).fromNow()}`;

//   return (
//     <div className="post-card" style={{ marginBottom: 16 }}>
//       <div className="post-header">
//         <div>
//           <div className="username">
//             {post.author?.fullName || post.author?.username || post.user?.fullName || post.user?.username || "Unknown"}
//           </div>
//           <div className="timestamp">{timestamp}</div>
//         </div>
//       </div>

//       <div className="post-title" style={{ fontWeight: 'bold', marginBottom: '10px', fontSize: '18px' }}>
//         {post.title}
//       <div className="star-section">
//         {post.pdfUrl && (
//           <div className="pdf-link">
//             <a href={`http://localhost:5000/api/blogs/pdfs/${post.pdfUrl.split("/").pop()}`} target="_blank" rel="noreferrer">
//               Click Here To Download PDF File
//             </a>
//           </div>
//         )}
//       </div>
//       </div>
      

//       <div className={`post-content ${expanded ? "expanded" : isLong ? "collapsed" : ""}`}>
//         {expanded ? post.content : shortContent}
//         {!expanded && isLong && <div className="fade"></div>}
//       </div>

//       {isLong && (
//         <div className="read-more" onClick={() => setExpanded((s) => !s)} style={{ cursor: "pointer" }}>
//           {expanded ? "Show less" : "Read more"}
//         </div>
//       )}

// <span className="star-icon" onClick={onLike} style={{ color: post.liked ? "gold" : "gray" }}>⭐</span>
// <span className="star-count">{post.likesCount || 0}</span>
// <span style={{ marginLeft: '15px', color: '#666' }}>👁️ {post.views || 0} views</span>

//     </div>
//   );
// }












// import React, { useEffect, useState, useContext, useCallback } from "react";
// import { useParams, useNavigate } from "react-router-dom";
// import dayjs from "dayjs";
// import relativeTime from "dayjs/plugin/relativeTime";
// import API from "../utils/api";
// import { AuthContext } from "../context/AuthContext";
// import BottomNavBar from "../components/BottomNavBar";
// import ProfileDrawer from "../components/ProfileDrawer";
// import DarkModeToggle from "../components/DarkModeToggle";
// import "../styles/global.css";
// import { Link } from "react-router-dom";

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

// dayjs.extend(relativeTime);

// export default function UserBlogsPage() {
//   const { userId } = useParams();
//   const navigate = useNavigate();
  
//   const { user } = useContext(AuthContext);
//   const [blogs, setBlogs] = useState([]);
//   const [blogUser, setBlogUser] = useState(null);
//   const [drawerOpen, setDrawerOpen] = useState(false);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState(null);
//   const [page, setPage] = useState(1);
//   const [pagination, setPagination] = useState(null);

//   const loadUserBlogs = useCallback(async () => {
//     if (!userId) {
//       setError("Invalid user ID");
//       setLoading(false);
//       return;
//     }

//     try {
//       setLoading(true);
//       setError(null);
//       console.log("🔄 Loading user blogs for:", userId);
//       const { data } = await API.get(`/blogs/user/${userId}?page=${page}&limit=10`);
//       console.log("📝 User blogs data received:", data);
      
//       if (!data.blogs || !Array.isArray(data.blogs)) {
//         console.warn("⚠️ No blogs data received");
//         setBlogs([]);
//         setBlogUser(data.user || null);
//         return;
//       }
      
//       const mapped = data.blogs.map((b) => ({
//         ...b,
//         likesCount: b.likes?.length || 0,
//         liked: Array.isArray(b.likes) && user ? b.likes.some(like => like.toString() === user._id) : false,
//       }));
//       setBlogs(mapped);
//       setBlogUser(data.user);
//       setPagination(data.pagination);
//       console.log("✅ User blogs loaded successfully:", mapped.length, "blogs");
//     } catch (err) {
//       console.error("❌ Failed to load user blogs:", err);
//       console.error("Error details:", err.response?.data || err.message);
//       setError(err.response?.data?.message || err.message || "Failed to load user blogs");
//       setBlogs([]);
//       if (err.response?.status === 404) {
//         setTimeout(() => navigate("/home"), 2000);
//       }
//     } finally {
//       setLoading(false);
//     }
//   }, [userId, page, user, navigate]);

//   useEffect(() => {
//     loadUserBlogs();
//   }, [loadUserBlogs]);

//   const toggleLike = async (id) => {
//     try {
//       console.log("🔄 Toggling like for blog:", id);
//       const { data } = await API.post(`/blogs/${id}/like`);
//       console.log("✅ Like response:", data);
//       setBlogs((prev) =>
//         prev.map((b) =>
//           b._id === id ? { ...b, liked: data.liked, likesCount: data.likes } : b
//         )
//       );
//     } catch (err) {
//       console.error("❌ Like toggle error:", err);
//       if (!user) {
//         window.location.href = "/login";
//         return;
//       }
//     }
//   };

//   return (
//     <>
//       <header className="header">
//         <div className="logo">
//           <img src="/imgs/logo-DME.png" alt="Logo" />
//         </div>
//         <DarkModeToggle />
//         <h2>USER NOTES</h2>
//       </header>

//       <div className="home-container">
//         {blogUser && (
//           <div style={{ 
//             display: 'flex', 
//             alignItems: 'center', 
//             gap: '15px', 
//             marginBottom: '20px',
//             padding: '15px',
//             backgroundColor: 'var(--card-bg, #fff)',
//             borderRadius: '10px',
//             boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
//           }}>
//             {blogUser.profileImage ? (
//               <img
//                 src={getImageURL(blogUser.profileImage)}
//                 alt={blogUser.username || blogUser.fullName}
//                 style={{
//                   width: '60px',
//                   height: '60px',
//                   borderRadius: '50%',
//                   objectFit: 'cover'
//                 }}
//                 onError={(e) => {
//                   e.target.style.display = 'none';
//                   e.target.nextSibling.style.display = 'flex';
//                 }}
//               />
//             ) : null}
//             <div 
//               style={{
//                 display: blogUser.profileImage ? 'none' : 'flex',
//                 width: '60px',
//                 height: '60px',
//                 borderRadius: '50%',
//                 backgroundColor: '#b30000',
//                 alignItems: 'center',
//                 justifyContent: 'center',
//                 fontSize: '24px',
//                 fontWeight: 'bold',
//                 color: '#fff'
//               }}
//             >
//               {(blogUser.fullName || blogUser.username || 'U').charAt(0).toUpperCase()}
//             </div>
//             <div>
//               <h3 style={{ margin: 0, fontSize: '18px' }}>
//                 {blogUser.fullName || blogUser.username || "Unknown User"}
//               </h3>
//               <p style={{ margin: '5px 0 0 0', color: '#666', fontSize: '14px' }}>
//                 @{blogUser.username || "user"}
//               </p>
//             </div>
//           </div>
//         )}





// {/* {blogUser && (
//   <Link
//     to={`/profile/${blogUser._id}`}
//     style={{
//       display: 'flex',
//       alignItems: 'center',
//       gap: '15px',
//       marginBottom: '20px',
//       padding: '15px',
//       backgroundColor: 'var(--card-bg, #fff)',
//       borderRadius: '10px',
//       boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
//       textDecoration: 'none',
//       color: 'inherit',
//       transition: 'background 0.3s',
//     }}
//     onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f0f0'}
//     onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--card-bg, #fff)'}
//   >
//     {blogUser.profileImage ? (
//       <img
//         src={getImageURL(blogUser.profileImage)}
//         alt={blogUser.username || blogUser.fullName}
//         style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover' }}
//         onError={(e) => {
//           e.target.style.display = 'none';
//           e.target.nextSibling.style.display = 'flex';
//         }}
//       />
//     ) : (
//       <div
//         style={{
//           width: '60px',
//           height: '60px',
//           borderRadius: '50%',
//           backgroundColor: '#b30000',
//           display: 'flex',
//           alignItems: 'center',
//           justifyContent: 'center',
//           fontSize: '24px',
//           fontWeight: 'bold',
//           color: '#fff'
//         }}
//       >
//         {(blogUser.fullName || blogUser.username || 'U').charAt(0).toUpperCase()}
//       </div>
//     )}

//     <div>
//       <h3 style={{ margin: 0, fontSize: '18px' }}>
//         {blogUser.fullName || blogUser.username || "Unknown User"}
//       </h3>
//       <p style={{ margin: '5px 0 0 0', color: '#666', fontSize: '14px' }}>
//         @{blogUser.username || "user"}
//       </p>
//     </div>
//   </Link>
// )} */}



//         <h2>📝 {blogUser?.fullName || blogUser?.username || "User"}'s Notes</h2>

//         <div id="postListHome">
//           {loading && <p style={{ textAlign: "center" }}>Loading blogs...</p>}
//           {error && (
//             <p style={{ textAlign: "center", color: "red" }}>
//               Error: {error}
//               {error.includes("not found") && <><br />Redirecting to home...</>}
//             </p>
//           )}
//           {!loading && !error && blogs.length === 0 && (
//             <p style={{ textAlign: "center" }}>No posts found.</p>
//           )}
//           {!loading && !error && blogs.map((post) => (
//             <PostCard key={post._id} post={post} onLike={() => toggleLike(post._id)} />
//           ))}
//         </div>

//         {pagination && pagination.totalPages > 1 && (
//           <div style={{ 
//             display: 'flex', 
//             justifyContent: 'center', 
//             gap: '10px', 
//             marginTop: '20px' 
//           }}>
//             <button
//               onClick={() => setPage(p => Math.max(1, p - 1))}
//               disabled={!pagination.hasPrev}
//               style={{
//                 padding: '8px 16px',
//                 backgroundColor: pagination.hasPrev ? '#b30000' : '#ccc',
//                 color: 'white',
//                 border: 'none',
//                 borderRadius: '5px',
//                 cursor: pagination.hasPrev ? 'pointer' : 'not-allowed'
//               }}
//             >
//               Previous
//             </button>
//             <span style={{
//               display: 'flex', 
//               alignItems: 'center', 
//               padding: '0 10px' 
//             }}>
//               Page {pagination.currentPage} of {pagination.totalPages}
//             </span>
//             <button
//               onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
//               disabled={!pagination.hasNext}
//               style={{
//                 padding: '8px 16px',
//                 backgroundColor: pagination.hasNext ? '#b30000' : '#ccc',
//                 color: 'white',
//                 border: 'none',
//                 borderRadius: '5px',
//                 cursor: pagination.hasNext ? 'pointer' : 'not-allowed'
//               }}
//             >
//               Next
//             </button>
//           </div>
//         )}
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

// function PostCard({ post, onLike }) {
//   const [expanded, setExpanded] = useState(false);
//   const isLong = post.content.length > 300;
//   const shortContent = isLong ? post.content.slice(0, 300) + "..." : post.content;
//   const timestamp = `${dayjs(post.createdAt).format("MMM D, YYYY")} • ${dayjs(post.createdAt).fromNow()}`;

//   return (
//     <div className="post-card" style={{ marginBottom: 16 }}>
//       <div className="post-header">
//         <div>
//           <div className="username">
//             {post.author?.fullName || post.author?.username || post.user?.fullName || post.user?.username || "Unknown"}
//           </div>
//           <div className="timestamp">{timestamp}</div>
//         </div>
//       </div>

//       <div className="post-title" style={{ fontWeight: 'bold', marginBottom: '10px', fontSize: '18px' }}>
//         {post.title}
//       </div>

//       <div className={`post-content ${expanded ? "expanded" : isLong ? "collapsed" : ""}`}>
//         {expanded ? post.content : shortContent}
//         {!expanded && isLong && <div className="fade"></div>}
//       </div>

//       {isLong && (
//         <div className="read-more" onClick={() => setExpanded((s) => !s)} style={{ cursor: "pointer" }}>
//           {expanded ? "Show less" : "Read more"}
//         </div>
//       )}

//       <div className="star-section">

//         {/* PDF Link */}
//         {post.pdfUrl && (
//           <div className="pdf-link">
//             {/* <a href={post.pdfUrl} target="_blank" rel="noopener noreferrer">View PDF</a> */}

//             <a href={`http://localhost:5000/api/blogs/pdfs/${post.pdfUrl.split("/").pop()}`} target="_blank" rel="noreferrer">View PDF</a>

//           </div>
//         )}
//         <span
//           className="star-icon"
//           onClick={onLike}
//           style={{ color: post.liked ? "gold" : "gray" }}
//         >
//           ⭐
//         </span>
//         <span className="star-count">{post.likesCount || 0}</span>
//         <span style={{ marginLeft: '15px', color: '#666' }}>
//           👁️ {post.views || 0} views
//         </span>
//       </div>
//     </div>
//   );
// }












// import React, { useEffect, useState, useContext, useCallback } from "react";
// import { useParams, useNavigate } from "react-router-dom";
// import dayjs from "dayjs";
// import relativeTime from "dayjs/plugin/relativeTime";
// import API from "../utils/api";
// import { AuthContext } from "../context/AuthContext";
// import BottomNavBar from "../components/BottomNavBar";
// import ProfileDrawer from "../components/ProfileDrawer";
// import DarkModeToggle from "../components/DarkModeToggle";
// import "../styles/global.css";

// // Helper function to get the correct base URL for images
// const getImageURL = (imagePath) => {
//   if (!imagePath) return null;
//   const hostname = window.location.hostname;
//   if (hostname === 'localhost' || hostname === '127.0.0.1') {
//     return `http://localhost:5000/uploads/${imagePath}`;
//   } else {
//     return `http://${hostname}:5000/uploads/${imagePath}`;
//   }
// };

// dayjs.extend(relativeTime);

// export default function UserBlogsPage() {
//   const { userId } = useParams();
//   const navigate = useNavigate();
//   const { user } = useContext(AuthContext);
//   const [blogs, setBlogs] = useState([]);
//   const [blogUser, setBlogUser] = useState(null);
//   const [drawerOpen, setDrawerOpen] = useState(false);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState(null);
//   const [page, setPage] = useState(1);
//   const [pagination, setPagination] = useState(null);

//   const loadUserBlogs = useCallback(async () => {
//     if (!userId) {
//       setError("Invalid user ID");
//       setLoading(false);
//       return;
//     }

//     try {
//       setLoading(true);
//       setError(null);
//       console.log("🔄 Loading user blogs for:", userId);
//       const { data } = await API.get(`/blogs/user/${userId}?page=${page}&limit=10`);
//       console.log("📝 User blogs data received:", data);
      
//       if (!data.blogs || !Array.isArray(data.blogs)) {
//         console.warn("⚠️ No blogs data received");
//         setBlogs([]);
//         setBlogUser(data.user || null);
//         return;
//       }
      
//       const mapped = data.blogs.map((b) => ({
//         ...b,
//         likesCount: b.likes?.length || 0,
//         liked: Array.isArray(b.likes) && user ? b.likes.some(like => like.toString() === user._id) : false,
//       }));
//       setBlogs(mapped);
//       setBlogUser(data.user);
//       setPagination(data.pagination);
//       console.log("✅ User blogs loaded successfully:", mapped.length, "blogs");
//     } catch (err) {
//       console.error("❌ Failed to load user blogs:", err);
//       console.error("Error details:", err.response?.data || err.message);
//       setError(err.response?.data?.message || err.message || "Failed to load user blogs");
//       setBlogs([]);
//       if (err.response?.status === 404) {
//         setTimeout(() => navigate("/home"), 2000);
//       }
//     } finally {
//       setLoading(false);
//     }
//   }, [userId, page, user, navigate]);

//   useEffect(() => {
//     loadUserBlogs();
//   }, [loadUserBlogs]);

//   const toggleLike = async (id) => {
//     try {
//       console.log("🔄 Toggling like for blog:", id);
//       const { data } = await API.post(`/blogs/${id}/like`);
//       console.log("✅ Like response:", data);
//       setBlogs((prev) =>
//         prev.map((b) =>
//           b._id === id ? { ...b, liked: data.liked, likesCount: data.likes } : b
//         )
//       );
//     } catch (err) {
//       console.error("❌ Like toggle error:", err);
//       if (!user) {
//         window.location.href = "/login";
//         return;
//       }
//     }
//   };

//   return (
//     <>
//       <header className="header">
//         <div className="logo">
//           <img src="/imgs/logo-DME.png" alt="Logo" />
//         </div>
//         <DarkModeToggle />
//         <h2>USER NOTES</h2>
//       </header>

//       <div className="home-container">
//         {blogUser && (
//           <div style={{ 
//             display: 'flex', 
//             alignItems: 'center', 
//             gap: '15px', 
//             marginBottom: '20px',
//             padding: '15px',
//             backgroundColor: 'var(--card-bg, #fff)',
//             borderRadius: '10px',
//             boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
//           }}>
//             {blogUser.profileImage ? (
//               <img
//                 src={getImageURL(blogUser.profileImage)}
//                 alt={blogUser.username || blogUser.fullName}
//                 style={{
//                   width: '60px',
//                   height: '60px',
//                   borderRadius: '50%',
//                   objectFit: 'cover'
//                 }}
//                 onError={(e) => {
//                   e.target.style.display = 'none';
//                   e.target.nextSibling.style.display = 'flex';
//                 }}
//               />
//             ) : null}
//             <div 
//               style={{
//                 display: blogUser.profileImage ? 'none' : 'flex',
//                 width: '60px',
//                 height: '60px',
//                 borderRadius: '50%',
//                 backgroundColor: '#b30000',
//                 alignItems: 'center',
//                 justifyContent: 'center',
//                 fontSize: '24px',
//                 fontWeight: 'bold',
//                 color: '#fff'
//               }}
//             >
//               {(blogUser.fullName || blogUser.username || 'U').charAt(0).toUpperCase()}
//             </div>
//             <div>
//               <h3 style={{ margin: 0, fontSize: '18px' }}>
//                 {blogUser.fullName || blogUser.username || "Unknown User"}
//               </h3>
//               <p style={{ margin: '5px 0 0 0', color: '#666', fontSize: '14px' }}>
//                 @{blogUser.username || "user"}
//               </p>
//             </div>
//           </div>
//         )}

//         <h2>📝 {blogUser?.fullName || blogUser?.username || "User"}'s Notes</h2>

//         <div id="postListHome">
//           {loading && <p style={{ textAlign: "center" }}>Loading blogs...</p>}
//           {error && (
//             <p style={{ textAlign: "center", color: "red" }}>
//               Error: {error}
//               {error.includes("not found") && <><br />Redirecting to home...</>}
//             </p>
//           )}
//           {!loading && !error && blogs.length === 0 && (
//             <p style={{ textAlign: "center" }}>No posts found.</p>
//           )}
//           {!loading && !error && blogs.map((post) => (
//             <PostCard key={post._id} post={post} onLike={() => toggleLike(post._id)} />
//           ))}
//         </div>

//         {pagination && pagination.totalPages > 1 && (
//           <div style={{ 
//             display: 'flex', 
//             justifyContent: 'center', 
//             gap: '10px', 
//             marginTop: '20px' 
//           }}>
//             <button
//               onClick={() => setPage(p => Math.max(1, p - 1))}
//               disabled={!pagination.hasPrev}
//               style={{
//                 padding: '8px 16px',
//                 backgroundColor: pagination.hasPrev ? '#b30000' : '#ccc',
//                 color: 'white',
//                 border: 'none',
//                 borderRadius: '5px',
//                 cursor: pagination.hasPrev ? 'pointer' : 'not-allowed'
//               }}
//             >
//               Previous
//             </button>
//             <span style={{ 
//               display: 'flex', 
//               alignItems: 'center', 
//               padding: '0 10px' 
//             }}>
//               Page {pagination.currentPage} of {pagination.totalPages}
//             </span>
//             <button
//               onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
//               disabled={!pagination.hasNext}
//               style={{
//                 padding: '8px 16px',
//                 backgroundColor: pagination.hasNext ? '#b30000' : '#ccc',
//                 color: 'white',
//                 border: 'none',
//                 borderRadius: '5px',
//                 cursor: pagination.hasNext ? 'pointer' : 'not-allowed'
//               }}
//             >
//               Next
//             </button>
//           </div>
//         )}
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

// function PostCard({ post, onLike }) {
//   const [expanded, setExpanded] = useState(false);
//   const isLong = post.content.length > 300;
//   const shortContent = isLong ? post.content.slice(0, 300) + "..." : post.content;
//   const timestamp = `${dayjs(post.createdAt).format("MMM D, YYYY")} • ${dayjs(
//     post.createdAt
//   ).fromNow()}`;

//   return (
//     <div className="post-card" style={{ marginBottom: 16 }}>
//       <div className="post-header">
//         <div>
//           <div className="username">
//             {post.author?.fullName || post.author?.username || post.user?.fullName || post.user?.username || "Unknown"}
//           </div>
//           <div className="timestamp">{timestamp}</div>
//         </div>
//       </div>

//       <div className="post-title" style={{ fontWeight: 'bold', marginBottom: '10px', fontSize: '18px' }}>
//         {post.title}
//       </div>

//       <div
//         className={`post-content ${expanded ? "expanded" : isLong ? "collapsed" : ""}`}
//       >
//         {expanded ? post.content : shortContent}
//         {!expanded && isLong && <div className="fade"></div>}
//       </div>

//       {isLong && (
//         <div
//           className="read-more"
//           onClick={() => setExpanded((s) => !s)}
//           style={{ cursor: "pointer" }}
//         >
//           {expanded ? "Show less" : "Read more"}
//         </div>
//       )}

//       <div className="star-section">
//         <span
//           className="star-icon"
//           onClick={onLike}
//           style={{ color: post.liked ? "gold" : "gray" }}
//         >
//           ⭐
//         </span>
//         <span className="star-count">{post.likesCount || 0}</span>
//         <span style={{ marginLeft: '15px', color: '#666' }}>
//           👁️ {post.views || 0} views
//         </span>        
//       </div>
//     </div>
//   );
// }