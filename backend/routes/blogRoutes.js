// // // backend/routes/blogRoutes.js
// // backend/routes/blogRoutes.js

// backend/routes/blogRoutes.js
import express from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import { protect } from "../middleware/authMiddleware.js";
import * as blogCtrl from "../controllers/blogController.js";
import { uploadImage, uploadPDF } from "../middleware/upload.js";

import Blog from "../models/Blog.js"; // Path based on your folder structure

const router = express.Router();

/**
 * Ensure local upload directories exist (uploads/images, uploads/pdfs)
 * This helps when running on fresh environments.
 */
const ensureUploadDirs = () => {
  const imgsDir = path.join(process.cwd(), "uploads", "images");
  const pdfsDir = path.join(process.cwd(), "uploads", "pdfs");
  if (!fs.existsSync(imgsDir)) fs.mkdirSync(imgsDir, { recursive: true });
  if (!fs.existsSync(pdfsDir)) fs.mkdirSync(pdfsDir, { recursive: true });
};
ensureUploadDirs();

/**
 * ---- Standalone upload endpoints (useful for front-end that uploads file first)
 * These use the middleware already exported from middleware/upload.js
 * (uploadImage -> stores to uploads/images, uploadPDF -> stores to uploads/pdfs)
 */
router.post("/upload/image", protect, uploadImage.single("image"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No image uploaded" });

    // Local path (client can use /uploads/images/<filename> if you serve /uploads via express.static)
    const imageUrl = req.file.location || `/${req.file.path}`; 
    res.status(201).json({ message: "Image uploaded", imageUrl, file: req.file });
  } catch (err) {
    console.error("Image upload error:", err);
    res.status(500).json({ message: "Failed to upload image" });
  }
});

router.post("/upload/pdf", protect, uploadPDF.single("pdf"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No PDF uploaded" });

    const pdfUrl = req.file.location || `/${req.file.path}`;
    res.status(201).json({ message: "PDF uploaded", pdfUrl, file: req.file });
  } catch (err) {
    console.error("PDF upload error:", err);
    res.status(500).json({ message: "Failed to upload PDF" });
  }
});

/**
 * ---- Combined multipart uploader for text + image + pdf in a single request
 *
 * This uses a local multer instance that places files into the same folders
 * as your upload.js local storage. We only use this combined route for local
 * development (it will not touch S3).
 *
 * Expected form-data fields:
 *  - title (string)
 *  - content (string)
 *  - category (string) optional
 *  - tags (string or JSON array) optional
 *  - isPublished (string "true"/"false") optional
 *  - image (file) optional
 *  - pdf (file) optional
 */
const combinedStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // choose folder based on fieldname
    if (file.fieldname === "image") {
      cb(null, path.join("uploads", "images"));
    } else if (file.fieldname === "pdf") {
      cb(null, path.join("uploads", "pdfs"));
    } else {
      cb(null, path.join("uploads", "others"));
    }
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || "";
    // keep original fieldname in file name: image-<unique>.ext or pdf-<unique>.ext
    cb(null, `${file.fieldname}-${unique}${ext}`);
  }
});

// Combined file filter: accept images for 'image' and pdf for 'pdf'
const combinedFileFilter = (req, file, cb) => {
  if (file.fieldname === "image") {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files allowed for 'image' field"), false);
  } else if (file.fieldname === "pdf") {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Only PDF files allowed for 'pdf' field"), false);
  } else {
    cb(null, false); // ignore other fields
  }
};

const combinedUpload = multer({
  storage: combinedStorage,
  fileFilter: combinedFileFilter,
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB max for any single file
});

/**
 * Wrapper handler that:
 *  - runs the multer fields middleware
 *  - sets req.body.imageUrl and req.body.pdfUrl to saved file paths (local)
 *  - maps common boolean/array conversions
 *  - finally calls existing blogCtrl.createBlog to reuse validation + saving logic
 */
router.post(
  "/multipart",
  protect,
  combinedUpload.fields([
    { name: "image", maxCount: 1 },
    { name: "pdf", maxCount: 1 }
  ]),
  async (req, res, next) => {
    try {
      // If files were uploaded, set URLs (local path). Frontend should be able to request them
      // if you serve /uploads statically (see server.js: app.use('/uploads', express.static(...)))
      if (req.files) {
        if (req.files.image && req.files.image[0]) {
          // create a path similar to uploadImage: use req.file.path or /uploads/...
          req.body.imageUrl = req.files.image[0].path ? `/${req.files.image[0].path.replace(/\\/g, "/")}` : undefined;
        }
        if (req.files.pdf && req.files.pdf[0]) {
          req.body.pdfUrl = req.files.pdf[0].path ? `/${req.files.pdf[0].path.replace(/\\/g, "/")}` : undefined;
        }
      }

      // Convert isPublished string to boolean if needed
      if (typeof req.body.isPublished === "string") {
        const val = req.body.isPublished.toLowerCase();
        req.body.isPublished = val === "true" || val === "1";
      }

      // If tags sent as JSON string, try to parse; if comma-separated, convert to array
      if (req.body.tags) {
        if (typeof req.body.tags === "string") {
          try {
            const parsed = JSON.parse(req.body.tags);
            if (Array.isArray(parsed)) req.body.tags = parsed;
            else req.body.tags = parsed ? [String(parsed)] : [];
          } catch (err) {
            // not JSON => split by comma
            req.body.tags = req.body.tags.split(",").map(t => t.trim()).filter(Boolean);
          }
        }
      }

      // Now call the existing createBlog controller (it expects title/content in req.body)
      return blogCtrl.createBlog(req, res, next);
    } catch (err) {
      console.error("Multipart create blog error:", err);
      return res.status(500).json({ message: "Failed to create blog (multipart)" });
    }
  }
);





// Add this route before or after other routes
// router.post("/:id/view", protect, async (req, res) => {
//   // console.log("View route hit for ID:", req.params.id);
//   try {
//     const blogId = req.params.id;
//     const blog = await Blog.findById(blogId);
//     if (!blog) {
//       return res.status(404).json({ message: "Blog not found" });
//     }
//     // Increment the views count
//     blog.views = (blog.views || 0) + 1;
//     await blog.save();
//     res.json({ message: "View count updated", views: blog.views });
//   } catch (err) {
//     console.error("Error updating view count:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// });
// Increment view count for all blogs of a user
// router.post("/:userId/view", protect, async (req, res) => {
//   try {
//     const userId = req.params.userId;
//     const userBlogs = await Blog.find({ author: userId });
//     await Promise.all(
//       userBlogs.map(async (blog) => {
//         blog.views = (blog.views || 0) + 1;
//         await blog.save();
//       })
//     );
//     res.json({ message: "Views incremented for user blogs." });
//   } catch (err) {
//     console.error("Error updating user blogs views:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// });
router.post("/:userId/view", protect, async (req, res) => {
  try {
    const userId = req.params.userId;
    const userBlogs = await Blog.find({ author: userId });
    await Promise.all(
      userBlogs.map(async (blog) => {
        blog.views = (blog.views || 0) + 1;
        await blog.save();
      })
    );
    res.json({ message: "Views incremented for user blogs." });
  } catch (err) {
    console.error("Error updating user blogs views:", err);
    res.status(500).json({ message: "Server error" });
  }
});





/**
 * ---- Existing public + protected routes (kept intact)
 * Note: keep the order so '/user/:userId' is before '/:id' to avoid route collisions.
 */

// Public routes
router.get("/", blogCtrl.getBlogs); // Get all published blogs (with pagination/filters)
router.get("/categories", blogCtrl.getCategories); // Get all blog categories

// Serve PDF files
router.get("/pdfs/:filename", (req, res) => {
  const filePath = path.join(process.cwd(), "uploads", "pdfs", req.params.filename);

  res.sendFile(filePath, (err) => {
    if (err) {
      console.error("PDF send error:", err);
      res.status(404).json({ message: "PDF not found" });
    }
  });
});

router.get("/popular", blogCtrl.getPopularBlogs); // Get popular blogs
router.get("/user/:userId", blogCtrl.getBlogsByUserId); // Get blogs by user ID
router.get("/:id", blogCtrl.getBlogById); // Get single blog by ID

// Protected routes
router.get("/my/blogs", protect, blogCtrl.getMyBlogs); // Get user's own blogs

// router.post("/", protect, blogCtrl.createBlog); // Create new blog (JSON body)
router.post(
  "/",
  protect,
  combinedUpload.fields([
    { name: "image", maxCount: 1 },
    { name: "pdf", maxCount: 1 }
  ]),
  blogCtrl.createBlog
);

router.put("/:id", protect, blogCtrl.updateBlog); // Update blog
router.delete("/:id", protect, blogCtrl.deleteBlog); // Delete blog
router.post("/:id/like", protect, blogCtrl.toggleLike); // Toggle like on blog
router.post("/:id/comment", protect, blogCtrl.addComment); // Add comment to blog

export default router;







// import express from "express";
// import { protect } from "../middleware/authMiddleware.js";
// import * as blogCtrl from "../controllers/blogController.js";
// import { uploadPDF } from "../middleware/upload.js";  // Add this import

// const router = express.Router();

// router.post("/upload/pdf", protect, uploadPDF.single("pdf"), blogCtrl.uploadPDFNote);  // Fix: Use blogCtrl.uploadPDFNote

// // Public routes
// router.get("/", blogCtrl.getBlogs); // Get all published blogs with pagination and filters
// router.get("/categories", blogCtrl.getCategories); // Get all blog categories
// router.get("/popular", blogCtrl.getPopularBlogs); // Get popular blogs
// router.get("/user/:userId", blogCtrl.getBlogsByUserId); // Get blogs by user ID
// router.get("/:id", blogCtrl.getBlogById); // Get single blog by ID

// // Protected routes
// router.get("/my/blogs", protect, blogCtrl.getMyBlogs); // Get user's own blogs
// router.post("/", protect, blogCtrl.createBlog); // Create new blog
// router.put("/:id", protect, blogCtrl.updateBlog); // Update blog
// router.delete("/:id", protect, blogCtrl.deleteBlog); // Delete blog
// router.post("/:id/like", protect, blogCtrl.toggleLike); // Toggle like on blog
// router.post("/:id/comment", protect, blogCtrl.addComment); // Add comment to blog

// export default router;












// import express from "express";
// import { protect } from "../middleware/authMiddleware.js";
// import * as blogCtrl from "../controllers/blogController.js";

// const router = express.Router();

// router.post("/upload/pdf", protect, uploadPDF.single("pdf"), uploadPDFNote);

// // Public routes
// router.get("/", blogCtrl.getBlogs); // Get all published blogs with pagination and filters
// router.get("/categories", blogCtrl.getCategories); // Get all blog categories
// router.get("/popular", blogCtrl.getPopularBlogs); // Get popular blogs
// router.get("/user/:userId", blogCtrl.getBlogsByUserId); // Get blogs by user ID
// router.get("/:id", blogCtrl.getBlogById); // Get single blog by ID

// // Protected routes
// router.get("/my/blogs", protect, blogCtrl.getMyBlogs); // Get user's own blogs
// router.post("/", protect, blogCtrl.createBlog); // Create new blog
// router.put("/:id", protect, blogCtrl.updateBlog); // Update blog
// router.delete("/:id", protect, blogCtrl.deleteBlog); // Delete blog
// router.post("/:id/like", protect, blogCtrl.toggleLike); // Toggle like on blog
// router.post("/:id/comment", protect, blogCtrl.addComment); // Add comment to blog

// export default router;