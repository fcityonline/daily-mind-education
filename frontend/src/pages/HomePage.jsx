// // // // frontend/src/pages/HomePage.jsx

import React, { useEffect, useState, useContext, useCallback, useRef } from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import API from "../utils/api";
import { AuthContext } from "../context/AuthContext";
import BottomNavBar from "../components/BottomNavBar";
import ProfileDrawer from "../components/ProfileDrawer";
import DarkModeToggle from "../components/DarkModeToggle";
import "../styles/global.css";

// Helper function to get the correct base URL for images
const getImageURL = (imagePath) => {
  if (!imagePath) return null;
  
  // If already a full URL, return as is
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  
  const hostname = window.location.hostname;
  // const port = window.location.port || '5000';
  const port = 5000;

  
  // Images are stored in uploads/images/ but served via /images/ route
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `http://localhost:${port}/images/${imagePath}`;
  } else {
    return `http://${hostname}:${port}/images/${imagePath}`;
  }
};

dayjs.extend(relativeTime);

export default function HomePage() {
  const { user } = useContext(AuthContext);
  const [blogs, setBlogs] = useState([]);
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadBlogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      console.log("⌛️Loading blogs...");
      const { data } = await API.get("/blogs");
      console.log("📝 Blogs data received:", data);
      
      if (!data.blogs || !Array.isArray(data.blogs)) {
        console.warn("⚠️ No blogs data received");
        setBlogs([]);
        return;
      }
      
      const mapped = data.blogs.map((b) => ({
        ...b,
        likesCount: b.likes?.length || 0,
        liked: Array.isArray(b.likes) && user ? b.likes.some(like => like.toString() === user._id) : false,
      }));
      setBlogs(mapped);
      console.log("✅ Blogs loaded successfully:", mapped.length, "blogs");
    } catch (err) {
      console.error("❌ Failed to load blogs:", err);
      console.error("Error details:", err.response?.data || err.message);
      setError(err.message || "Failed to load blogs");
      setBlogs([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadBlogs();
  }, [loadBlogs]);

  const toggleLike = async (id) => {
    try {
      console.log("🔄 Toggling like for blog:", id);
      const { data } = await API.post(`/blogs/${id}/like`);
      console.log("✅ Like response:", data);
      setBlogs((prev) =>
        prev.map((b) =>
          b._id === id ? { ...b, liked: data.liked, likesCount: data.likes } : b
        )
      );
    } catch (err) {
      console.error("❌ Like toggle error:", err);
      if (!user) {
        window.location.href = "/login";
        return;
      }
    }
  };

  const filtered = blogs.filter(
    (b) =>
      b.content.toLowerCase().includes(search.toLowerCase()) ||
      (b.user?.username || "").toLowerCase().includes(search.toLowerCase()) ||
      (b.user?.fullName || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <header className="header">
        <div className="logo">
          <img src="/imgs/logo-DME.png" alt="Logo" />
        </div>
        <DarkModeToggle />
        <h2>DAILY NOTES</h2>
      </header>

      <div className="home-container">
        <h2>📝 Latest Notes</h2>

        <input
          id="searchBar"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
        />

        

        <div id="postListHome">

<div id="postListHome">
  {blogs.map((b) => (
    <PostCard
      key={b._id}
      post={b}
      onLike={() => toggleLike(b._id)}
      currentUser={user}
    />
  ))}
</div>



        </div>
      </div>

      <ProfileDrawer 
        key={user?._id || 'no-user'} 
        open={drawerOpen} 
        onClose={() => setDrawerOpen(false)} 
      />
      <BottomNavBar onProfileClick={() => setDrawerOpen(true)} />
    </>
  );
}

function PostCard({ post, onLike, currentUser }) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [isBlocked, setIsBlocked] = useState(false);
  const menuRef = useRef(null);
  const isLong = post.content.length > 300;
  const shortContent = isLong ? post.content.slice(0, 300) + "..." : post.content;
  const timestamp = `${dayjs(post.createdAt).format("MMM D, YYYY")} • ${dayjs(
    post.createdAt
  ).fromNow()}`;
  
  const postAuthorId = post.author?._id || post.user?._id;
  const isOwnPost = currentUser && postAuthorId === currentUser._id;

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Check if user is blocked
  useEffect(() => {
    if (currentUser && postAuthorId && !isOwnPost) {
      API.get(`/reports/check/${postAuthorId}`)
        .then(res => setIsBlocked(res.data.blockedByMe))
        .catch(() => setIsBlocked(false));
    }
  }, [currentUser, postAuthorId, isOwnPost]);

  const handleReport = async () => {
    if (!reportReason) {
      alert("Please select a reason");
      return;
    }

    try {
      await API.post('/reports/user', {
        blogId: post._id,
        reason: reportReason,
        description: reportDescription
      });
      alert("Report submitted successfully. Admin will review it.");
      setShowReportModal(false);
      setReportReason('');
      setReportDescription('');
      setMenuOpen(false);
    } catch (error) {
      alert(error.response?.data?.message || "Failed to submit report");
    }
  };

  const handleBlock = async () => {
    if (!window.confirm(`Are you sure you want to block ${post.author?.fullName || post.author?.username || "this user"}? You won't see their posts anymore.`)) {
      return;
    }

    try {
      await API.post('/reports/block', {
        userId: postAuthorId
      });
      alert("User blocked successfully");
      setIsBlocked(true);
      setMenuOpen(false);
      // Optionally refresh the page or remove the post from view
      window.location.reload();
    } catch (error) {
      alert(error.response?.data?.message || "Failed to block user");
    }
  };

  const handleUnblock = async () => {
    try {
      await API.post('/reports/unblock', {
        userId: postAuthorId
      });
      alert("User unblocked successfully");
      setIsBlocked(false);
      setMenuOpen(false);
      window.location.reload();
    } catch (error) {
      alert(error.response?.data?.message || "Failed to unblock user");
    }
  };

  return (
    <div className="post-card" style={{ marginBottom: 16, position: 'relative' }}>
      {/* <div className="post-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}> */}
        {/* <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
          <a href={`/user/${postAuthorId}/blogs`} onClick={(e) => {
            if (!postAuthorId) {
              e.preventDefault();
              return;
            }
          }}>
            {post.author?.profileImage || post.user?.profileImage ? (
              <img
                className="user-icon"
                src={getImageURL(post.author?.profileImage || post.user?.profileImage)}
                alt={post.author?.username || post.user?.username || "User"}
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
            ) : null}
            <div 
              className="user-icon"
              style={{
                display: post.author?.profileImage || post.user?.profileImage ? 'none' : 'flex',
                backgroundColor: '#b30000',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '15px',
                fontWeight: 'bold',
                color: '#fff'
              }}
            >
              {(post.author?.fullName || post.author?.username || post.user?.fullName || post.user?.username || 'U').charAt(0).toUpperCase()}
            </div>
          </a>
          <div>
            <div className="username">
              {post.author?.fullName || post.author?.username || post.user?.fullName || post.user?.username || "Unknown"}
            </div>
            <div className="timestamp">{timestamp}</div>
          </div>
        </div> */}
        
        {/* Dot Menu Button - Only show if not own post and user is logged in */}
        {/* {currentUser && !isOwnPost && (
          <div style={{ position: 'relative' }} ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '20px',
                cursor: 'pointer',
                padding: '5px 10px',
                color: '#666',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
              onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
            >
              ⋮
            </button>
            
            {menuOpen && (
              <div style={{
                position: 'absolute',
                top: '35px',
                right: '0',
                backgroundColor: 'white',
                border: '1px solid #ddd',
                borderRadius: '8px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                zIndex: 1000,
                minWidth: '150px',
                padding: '5px 0'
              }}>
                {!isBlocked ? (
                  <>
                    <button
                      onClick={() => {
                        setShowReportModal(true);
                        setMenuOpen(false);
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 15px',
                        background: 'none',
                        border: 'none',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                      onMouseEnter={(e) => e.target.style.backgroundColor = '#f5f5f5'}
                      onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                    >
                      🚩 Report
                    </button>
                    <button
                      onClick={handleBlock}
                      style={{
                        width: '100%',
                        padding: '10px 15px',
                        background: 'none',
                        border: 'none',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                      onMouseEnter={(e) => e.target.style.backgroundColor = '#f5f5f5'}
                      onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                    >
                      🚫 Block User
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleUnblock}
                    style={{
                      width: '100%',
                      padding: '10px 15px',
                      background: 'none',
                      border: 'none',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = '#f5f5f5'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                  >
                    ✅ Unblock User
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div> */}
      {/* // Inside PostCard component */}

<div className="post-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
  <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
    <a
      href={`/user/${postAuthorId}/blogs`} // This link will redirect to the user's blog page
      style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', flex: 1  }} // Ensure the link doesn’t change the style
    >
      {/* Profile Image */}
      {post.author?.profileImage || post.user?.profileImage ? (
        <img
          className="user-icon"
          src={getImageURL(post.author?.profileImage || post.user?.profileImage)}
          alt={post.author?.username || post.user?.username || "User"}
          onError={(e) => {
            e.target.style.display = 'none'; // Hide image on error
            e.target.nextSibling.style.display = 'flex'; // Show fallback initials
          }}
          style={{ width: '40px', height: '40px', borderRadius: '50%' }}
        />
      ) : null}

      {/* Fallback initials if no profile image */}
      <div
        className="user-icon"
        style={{
          display: post.author?.profileImage || post.user?.profileImage ? 'none' : 'flex',
          backgroundColor: '#b30000',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '15px',
          fontWeight: 'bold',
          color: '#fff',
          width: '40px',
          height: '40px',
          borderRadius: '50%',
        }}
      >
        {(post.author?.fullName || post.author?.username || post.user?.fullName || post.user?.username || 'U').charAt(0).toUpperCase()}
      </div>

      {/* Username */}
      <div style={{ marginLeft: '10px' }}>
        <div className="username">
          {post.author?.fullName || post.author?.username || post.user?.fullName || post.user?.username || "Unknown"}
        </div>
        <div className="timestamp">{timestamp}</div>
      </div>
    </a>
  </div>

  {/* Dot Menu Button */}
  {currentUser && !isOwnPost && (
    <div style={{ position: 'relative' }} ref={menuRef}>
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        style={{
          background: 'none',
          border: 'none',
          fontSize: '20px',
          cursor: 'pointer',
          padding: '5px 10px',
          color: '#666',
          borderRadius: '50%',
          width: '32px',
          height: '32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        ⋮
      </button>
      
      {menuOpen && (
        <div
          style={{
            position: 'absolute',
            top: '35px',
            right: '0',
            backgroundColor: 'white',
            border: '1px solid #ddd',
            borderRadius: '8px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            zIndex: 1000,
            minWidth: '150px',
            padding: '5px 0',
          }}
        >
          {!isBlocked ? (
            <>
              <button
                onClick={() => {
                  setShowReportModal(true);
                  setMenuOpen(false);
                }}
                style={{
                  width: '100%',
                  padding: '10px 15px',
                  background: 'none',
                  border: 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                🚩 Report
              </button>
              <button
                onClick={handleBlock}
                style={{
                  width: '100%',
                  padding: '10px 15px',
                  background: 'none',
                  border: 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                🚫 Block User
              </button>
            </>
          ) : (
            <button
              onClick={handleUnblock}
              style={{
                width: '100%',
                padding: '10px 15px',
                background: 'none',
                border: 'none',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              ✅ Unblock User
            </button>
          )}
        </div>
      )}
    </div>
  )}
</div>


      {/* Report Modal */}
      {showReportModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000
        }} onClick={() => setShowReportModal(false)}>
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '10px',
            maxWidth: '400px',
            width: '90%'
          }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Report Post</h3>
            <label style={{ display: 'block', marginBottom: '10px' }}>
              Reason:
              <select
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  marginTop: '5px',
                  borderRadius: '5px',
                  border: '1px solid #ddd'
                }}
              >
                <option value="">Select a reason</option>
                <option value="spam">Spam</option>
                <option value="inappropriate">Inappropriate Content</option>
                <option value="harassment">Harassment</option>
                <option value="fake">Fake Information</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label style={{ display: 'block', marginBottom: '10px' }}>
              Description (optional):
              <textarea
                value={reportDescription}
                onChange={(e) => setReportDescription(e.target.value)}
                placeholder="Provide more details..."
                style={{
                  width: '100%',
                  padding: '8px',
                  marginTop: '5px',
                  borderRadius: '5px',
                  border: '1px solid #ddd',
                  minHeight: '80px',
                  resize: 'vertical'
                }}
                maxLength={500}
              />
            </label>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowReportModal(false);
                  setReportReason('');
                  setReportDescription('');
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#ccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleReport}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#b30000',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer'
                }}
              >
                Submit Report
              </button>
            </div>
          </div>
        </div>
      )}

<div
  className={`post-content ${expanded ? "expanded" : isLong ? "collapsed" : ""}`}
>
  {expanded ? post.content : shortContent}
  {!expanded && isLong && <div className="fade"></div>}
</div>

{/* Insert PDF link here inside PostCard */}
{post.pdfUrl && (
  <div style={{ marginTop: '10px' }}>
    <a
      href={`http://localhost:5000/api/blogs/pdfs/${post.pdfUrl.split("/").pop()}`}
      target="_blank"
      rel="noreferrer"
      style={{ color: '#007bff', textDecoration: 'underline' }}
    >
      Download PDF
    </a>
  </div>
)}

      {isLong && (
        <div
          className="read-more"
          onClick={() => setExpanded((s) => !s)}
          style={{ cursor: "pointer" }}
        >
          {expanded ? "Show less" : "Read more"}
        </div>
      )}

      <div className="star-section">
        <span
          className="star-icon"
          onClick={onLike}
          style={{ color: post.liked ? "gold" : "gray" }}
        >
          ⭐
        </span>
        <span className="star-count">{post.likesCount || 0}</span>
      </div>
    </div>
  );
}

