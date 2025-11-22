// // // src/pages/EditBlogPage.jsx

import React, { useState, useEffect } from "react";
import API from "../utils/api";
import DarkModeToggle from "../components/DarkModeToggle";

export default function EditBlogPage() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pdfFile, setPdfFile] = useState(null);
  const [blogs, setBlogs] = useState([]);

  const loadMyBlogs = async () => {
    const { data } = await API.get("/blogs/my/blogs");
    setBlogs(data);
  };

  useEffect(() => {
    loadMyBlogs();
  }, []);

  const handlePdfChange = (e) => {
    setPdfFile(e.target.files[0]);
  };

  const createBlog = async () => {
    try {
      const wordCount = content.trim().split(/\s+/).filter(w => w.length > 0).length;
      if (wordCount > 300) {
        alert(`Content exceeds 300 words limit. Current: ${wordCount} words. Please reduce to 300 words or less.`);
        return;
      }

      const formData = new FormData();
      formData.append("title", title);
      formData.append("content", content);
      formData.append("isPublished", true);
      if (pdfFile) {
        // formData.append("pdfFile", pdfFile);
        formData.append("pdf", pdfFile);
      }

      // Send the formData to the backend
      await API.post("/blogs", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      setTitle("");
      setContent("");
      setPdfFile(null); // Reset the file input
      loadMyBlogs();
    } catch (err) {
      const errorMsg = err.response?.data?.message || "Failed to create note";
      alert(errorMsg);
      console.error("Create blog error:", err);
    }
  };

  const deleteBlog = async (id) => {
    if (!window.confirm("Delete note?")) return;
    await API.delete(`/blogs/${id}`);
    loadMyBlogs();
  };

  return (
    <>
      <header className="header">
        <div className="logo">
          <img src="/imgs/logo-DME.png" alt="Logo" />
        </div>
        <DarkModeToggle />
        <h2>EDIT NOTES</h2>
      </header>

      <div className="edit-blog-container">
        <div className="edit-blog">
          <div className="create-section">
            <h2>Create Note</h2>
            <div className="form-group">
              <input
                type="text"
                placeholder="Create note title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="title-input"
              />
            </div>
            <div className="form-group">
              <textarea
                placeholder="Write your note content here... (Max 300 words)"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="content-textarea"
                rows="6"
                maxLength={2000}
              />
              <div style={{ fontSize: '12px', color: '#666', marginTop: '5px', textAlign: 'right' }}>
                {content.trim().split(/\s+/).filter(w => w.length > 0).length} / 300 words
              </div>
            </div>

            {/* PDF Upload */}
            <div className="form-group">
              <input
                type="file"
                accept="application/pdf"
                onChange={handlePdfChange}
                className="pdf-input"
              />
              {pdfFile && <p>Selected PDF: {pdfFile.name}</p>}
            </div>

            <button 
              onClick={createBlog} 
              className="publish-btn"
              disabled={!title.trim() || !content.trim()}
            >
              📝 Publish Note
            </button>
          </div>

          <div className="notes-section">
            <h3>📚 My Notes ({blogs.length})</h3>
            {blogs.length === 0 ? (
              <div className="empty-state">
                <p>No notes yet. Create your first note above!</p>
              </div>
            ) : (
              <div className="notes-grid">
                {blogs.map((b) => (
                  <div key={b._id} className="note-card">
                    <div className="note-content">
                      <h4 className="note-title">{b.title}</h4>
                      <p className="note-preview">
                        {b.content.length > 100 
                          ? `${b.content.substring(0, 100)}...` 
                          : b.content
                        }
                      </p>
                      <span className="note-date">
                        {new Date(b.createdAt).toLocaleDateString()}
                      </span>
                    </div>

{b.pdfUrl && (
  <div className="pdf-link">
    <a
      href={`http://localhost:5000/api/blogs/pdfs/${b.pdfUrl.split("/").pop()}`}
      target="_blank"
      rel="noreferrer"
    >
      PDF File
    </a>
  </div>
)}

                    {/* {b.pdfUrl && ( */}
                      {/* // <div className="note-pdf"> */}
                      {/* //   <a href={b.pdfUrl} target="_blank" rel="noopener noreferrer">PDF File</a> */}
                      {/* // </div> */}
                    {/* // )} */}
                    
                    <button 
                      onClick={() => deleteBlog(b._id)} 
                      className="delete-btn"
                      title="Delete note"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}










// import React, { useState, useEffect } from "react";
// import API from "../utils/api";

// import DarkModeToggle from "../components/DarkModeToggle";

// export default function EditBlogPage() {
//   const [title, setTitle] = useState("");
//   const [content, setContent] = useState("");
//   const [blogs, setBlogs] = useState([]);

//   const loadMyBlogs = async () => {
//     const { data } = await API.get("/blogs/my/blogs");
//     setBlogs(data);
//   };

//   useEffect(() => {
//     loadMyBlogs();
//   }, []);

//   const createBlog = async () => {
//     try {
//       const wordCount = content.trim().split(/\s+/).filter(w => w.length > 0).length;
//       if (wordCount > 300) {
//         alert(`Note content exceeds 300 words limit. Current: ${wordCount} words. Please reduce to 300 words or less.`);
//         return;
//       }
      
//       await API.post("/blogs", { title, content, isPublished: true });
//       setTitle("");
//       setContent("");
//       loadMyBlogs();
//     } catch (err) {
//       const errorMsg = err.response?.data?.message || "Failed to create note";
//       alert(errorMsg);
//       console.error("Create blog error:", err);
//     }
//   };

//   const deleteBlog = async (id) => {
//     if (!window.confirm("Delete note?")) return;
//     await API.delete(`/blogs/${id}`);
//     loadMyBlogs();
//   };
//   return (
//     <>
//       <header className="header">
//         <div className="logo">
//           <img src="/imgs/logo-DME.png" alt="Logo" />
//         </div>
//         <DarkModeToggle />
//         <h2>EDIT NOTES</h2>
//       </header>

//       <div className="edit-blog-container">
//         <div className="edit-blog">
//           <div className="create-section">
//             <h2>Create Note</h2>
//             <div className="form-group">
//               <input
//                 type="text"
//                 placeholder="Enter note title..."
//                 value={title}
//                 onChange={(e) => setTitle(e.target.value)}
//                 className="title-input"
//               />
//             </div>
//             <div className="form-group">
//               <textarea
//                 placeholder="Write your note content here... (Max 300 words)"
//                 value={content}
//                 onChange={(e) => setContent(e.target.value)}
//                 className="content-textarea"
//                 rows="6"
//                 maxLength={2000}
//               />
//               <div style={{ fontSize: '12px', color: '#666', marginTop: '5px', textAlign: 'right' }}>
//                 {content.trim().split(/\s+/).filter(w => w.length > 0).length} / 300 words
//               </div>
//             </div>
//             <button 
//               onClick={createBlog} 
//               className="publish-btn"
//               disabled={!title.trim() || !content.trim()}
//             >
//               📝 Publish Note
//             </button>
//           </div>

//           <div className="notes-section">
//             <h3>📚 My Notes ({blogs.length})</h3>
//             {blogs.length === 0 ? (
//               <div className="empty-state">
//                 <p>No notes yet. Create your first note above!</p>
//               </div>
//             ) : (
//               <div className="notes-grid">
//                 {blogs.map((b) => (
//                   <div key={b._id} className="note-card">
//                     <div className="note-content">
//                       <h4 className="note-title">{b.title}</h4>
//                       <p className="note-preview">
//                         {b.content.length > 100 
//                           ? `${b.content.substring(0, 100)}...` 
//                           : b.content
//                         }
//                       </p>
//                       <span className="note-date">
//                         {new Date(b.createdAt).toLocaleDateString()}
//                       </span>
//                     </div>
//                     <button 
//                       onClick={() => deleteBlog(b._id)} 
//                       className="delete-btn"
//                       title="Delete note"
//                     >
//                       🗑️
//                     </button>
//                   </div>
//                 ))}
//               </div>
//             )}
//           </div>
//         </div>
//       </div>
//     </>
//   );
// }
