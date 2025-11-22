// backend/controllers/blogController.js
import Blog from "../models/Blog.js";
import User from "../models/User.js";
import Block from "../models/Block.js";

// Minimal HTML sanitizer to strip script tags; consider sanitize-html for production
function sanitize(input) {
  if (typeof input !== 'string') return input;
  return input.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').trim();
}

// Count words in text (300 words max as per requirements)
function countWords(str) {
  if (!str) return 0;
  return str.trim().split(/\s+/).filter(word => word.length > 0).length;
}

// Get all published blogs (public)
export const getBlogs = async (req, res) => {
  try {
    console.log("📝 Blog request received:", req.query);
    const { page = 1, limit = 10, category, search } = req.query;
    const skip = (page - 1) * limit;
    
    let query = { isPublished: true };
    
    // Filter by category
    if (category && category !== 'all') {
      query.category = category;
    }
    
    // Search functionality
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }
    
    console.log("🔍 Blog query:", query);
    
    let blogs = await Blog.find(query)
      .populate("author", "fullName username profileImage")
      .populate("likes", "fullName username")
      .sort({ publishedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Filter out blogs from blocked users if user is logged in
    if (req.user && req.user.id) {
      const blockedUsers = await Block.find({
        $or: [
          { blockedBy: req.user.id },
          { blockedUser: req.user.id }
        ]
      });
      
      const blockedUserIds = new Set();
      blockedUsers.forEach(block => {
        if (block.blockedBy.toString() === req.user.id) {
          blockedUserIds.add(block.blockedUser.toString());
        }
        if (block.blockedUser.toString() === req.user.id) {
          blockedUserIds.add(block.blockedBy.toString());
        }
      });
      
      blogs = blogs.filter(blog => {
        const authorId = blog.author?._id?.toString();
        return !authorId || !blockedUserIds.has(authorId);
      });
    }
    
    const total = await Blog.countDocuments(query);
    
    console.log("📊 Found blogs:", blogs.length, "out of", total, "total");
    
    res.json({
      blogs,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalBlogs: total,
        hasNext: skip + blogs.length < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error("Error fetching blogs:", error);
    res.status(500).json({ message: "Failed to fetch blogs" });
  }
};

// Get user's own blogs (published and draft)
export const getMyBlogs = async (req, res) => {
  try {
    const { page = 1, limit = 10, status = 'all' } = req.query;
    const skip = (page - 1) * limit;
    
    let query = { author: req.user.id };
    
    // Filter by publication status
    if (status === 'published') {
      query.isPublished = true;
    } else if (status === 'draft') {
      query.isPublished = false;
    }
    
    const blogs = await Blog.find(query)
      .populate("author", "fullName username profileImage")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    res.json(blogs);
  } catch (error) {
    console.error("Error fetching user blogs:", error);
    res.status(500).json({ message: "Failed to fetch user blogs" });
  }
};

// Get single blog by ID
export const getBlogById = async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id)
      .populate("author", "fullName username profileImage")
      .populate("likes", "fullName username")
      .populate("comments.user", "fullName username profileImage");
    
    if (!blog) {
      return res.status(404).json({ message: "Blog not found" });
    }
    
    // Check if user can view this blog
    if (!blog.isPublished && blog.author._id.toString() !== req.user?.id?.toString()) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    // Increment view count for published blogs
    if (blog.isPublished) {
      blog.views += 1;
      await blog.save();
    }
    
    res.json(blog);
  } catch (error) {
    console.error("Error fetching blog:", error);
    res.status(500).json({ message: "Failed to fetch blog" });
  }
};

// Create new blog
// export const createBlog = async (req, res) => {
//   try {
//     const { title, content, category, tags, isPublished, imageUrl } = req.body;
    
//     if (!title || !content) {
//       return res.status(400).json({ message: "Title and content are required" });
//     }
    
//     if (title.length > 200) {
//       return res.status(400).json({ message: "Title must be less than 200 characters" });
//     }
    
//     // Enforce 300 words limit for blog content
//     const wordCount = countWords(content);
//     if (wordCount > 300) {
//       return res.status(400).json({ 
//         message: `Content exceeds 300 words limit. Current: ${wordCount} words. Please reduce to 300 words or less.`,
//         wordCount,
//         maxWords: 300
//       });
//     }
    
//     if (wordCount === 0) {
//       return res.status(400).json({ message: "Content cannot be empty" });
//     }
    
//     const blog = new Blog({ 
//       title: sanitize(title), 
//       content: sanitize(content),
//       category: category || 'general',
//       tags: tags || [],
//       isPublished: isPublished || false,
//       imageUrl: imageUrl || null,
//       author: req.user.id 
//     });
    
//     // Set published date if publishing
//     if (isPublished) {
//       blog.publishedAt = new Date();
//     }
    
//     await blog.save();
//     await blog.populate("author", "fullName username profileImage");
    
//     res.status(201).json(blog);
//   } catch (error) {
//     console.error("Error creating blog:", error);
//     res.status(500).json({ message: "Failed to create blog" });
//   }
// };
export const createBlog = async (req, res) => {
  try {
    // When using FormData, text fields come in req.body, files in req.files
    const { title, content, category, tags, isPublished } = req.body;

    if (!title || !content) {
      return res.status(400).json({ message: "Title and content are required" });
    }

    const wordCount = countWords(content);
    if (wordCount > 300) {
      return res.status(400).json({
        message: `Content exceeds 300 words limit. Current: ${wordCount} words.`,
        wordCount,
        maxWords: 300
      });
    }

    let imageUrl = null;
    let pdfUrl = null;

    if (req.files?.image?.[0]) {
      // For local storage, use just the filename (served via /images/ route)
      // For S3, use the location URL
      if (req.files.image[0].location) {
        imageUrl = req.files.image[0].location; // S3 URL
      } else {
        imageUrl = req.files.image[0].filename; // Local: just filename
      }
    }

    if (req.files?.pdf?.[0]) {
      // For local storage, use just the filename (served via /pdfs/ route)
      // For S3, use the location URL
      if (req.files.pdf[0].location) {
        pdfUrl = req.files.pdf[0].location; // S3 URL
      } else {
        pdfUrl = req.files.pdf[0].filename; // Local: just filename
      }
    }

    const blog = new Blog({
      title: sanitize(title),
      content: sanitize(content),
      category: category || "general",
      tags: tags || [],
      isPublished: isPublished === "true" || isPublished === true,
      imageUrl,
      pdfUrl,
      author: req.user.id
    });

    if (blog.isPublished) blog.publishedAt = new Date();

    await blog.save();
    await blog.populate("author", "fullName username profileImage");

    res.status(201).json(blog);
  } catch (error) {
    console.error("Error creating blog:", error);
    res.status(500).json({ message: "Failed to create blog" });
  }
};


// Update blog
export const updateBlog = async (req, res) => {
  try {
    const { title, content, category, tags, isPublished, imageUrl } = req.body;
    
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ message: "Blog not found" });
    }
    
    // Check ownership
    if (blog.author.toString() !== req.user.id) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    // Update fields
    if (title !== undefined) {
      if (title.length > 200) {
        return res.status(400).json({ message: "Title must be less than 200 characters" });
      }
      blog.title = sanitize(title);
    }
    
    if (content !== undefined) {
      // Enforce 300 words limit for blog content
      const wordCount = countWords(content);
      if (wordCount > 300) {
        return res.status(400).json({ 
          message: `Content exceeds 300 words limit. Current: ${wordCount} words. Please reduce to 300 words or less.`,
          wordCount,
          maxWords: 300
        });
      }
      
      if (wordCount === 0) {
        return res.status(400).json({ message: "Content cannot be empty" });
      }
      
      blog.content = sanitize(content);
    }
    
    if (category !== undefined) blog.category = category;
    if (tags !== undefined) blog.tags = tags;
    if (imageUrl !== undefined) blog.imageUrl = imageUrl;
    
    // Handle publication status change
    if (isPublished !== undefined && isPublished !== blog.isPublished) {
      blog.isPublished = isPublished;
      if (isPublished && !blog.publishedAt) {
        blog.publishedAt = new Date();
      }
    }
    
    await blog.save();
    await blog.populate("author", "fullName username profileImage");
    
    res.json(blog);
  } catch (error) {
    console.error("Error updating blog:", error);
    res.status(500).json({ message: "Failed to update blog" });
  }
};

// Delete blog
export const deleteBlog = async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ message: "Blog not found" });
    }
    
    // Check ownership
    if (blog.author.toString() !== req.user.id) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    await blog.deleteOne();
    res.json({ message: "Blog deleted successfully" });
  } catch (error) {
    console.error("Error deleting blog:", error);
    res.status(500).json({ message: "Failed to delete blog" });
  }
};

// Toggle like on blog
export const toggleLike = async (req, res) => {
  try {
    console.log("🔄 Toggle like request:", {
      blogId: req.params.id,
      userId: req.user.id
    });
    
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      console.log("❌ Blog not found:", req.params.id);
      return res.status(404).json({ message: "Blog not found" });
    }
    
    // Check if blog is published (for non-authors)
    if (!blog.isPublished && blog.author.toString() !== req.user.id) {
      console.log("❌ Access denied - blog not published");
      return res.status(403).json({ message: "Access denied" });
    }
    
    console.log("📝 Current likes before toggle:", blog.likes.length);
    const isLiked = blog.toggleLike(req.user.id);
    await blog.save();
    
    console.log("✅ Like toggled:", { isLiked, newLikeCount: blog.likes.length });
    
    res.json({ 
      liked: isLiked,
      likes: blog.likes.length 
    });
  } catch (error) {
    console.error("❌ Error toggling like:", error);
    res.status(500).json({ message: "Failed to toggle like" });
  }
};

// Add comment to blog
export const addComment = async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ message: "Comment content is required" });
    }
    
    if (content.length > 500) {
      return res.status(400).json({ message: "Comment must be less than 500 characters" });
    }
    
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ message: "Blog not found" });
    }
    
    // Check if blog is published (for non-authors)
    if (!blog.isPublished && blog.author.toString() !== req.user.id) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    blog.comments.push({
      user: req.user.id,
      content: content.trim()
    });
    
    await blog.save();
    await blog.populate("comments.user", "fullName username profileImage");
    
    const newComment = blog.comments[blog.comments.length - 1];
    res.status(201).json(newComment);
  } catch (error) {
    console.error("Error adding comment:", error);
    res.status(500).json({ message: "Failed to add comment" });
  }
};

// Get blog categories
export const getCategories = async (req, res) => {
  try {
    const categories = await Blog.distinct('category', { isPublished: true });
    res.json(categories);
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ message: "Failed to fetch categories" });
  }
};

// Get popular blogs
export const getPopularBlogs = async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    
    const blogs = await Blog.find({ isPublished: true })
      .populate("author", "fullName username profileImage")
      .sort({ views: -1, likeCount: -1 })
      .limit(parseInt(limit));
    
    res.json(blogs);
  } catch (error) {
    console.error("Error fetching popular blogs:", error);
    res.status(500).json({ message: "Failed to fetch popular blogs" });
  }
};

// Get blogs by user ID (public - only published blogs)
export const getBlogsByUserId = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    
    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Get only published blogs for this user
    const query = { 
      author: userId, 
      isPublished: true 
    };
    
    const blogs = await Blog.find(query)
      .populate("author", "fullName username profileImage")
      .populate("likes", "fullName username")
      .sort({ publishedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Blog.countDocuments(query);
    
    res.json({
      blogs,
      user: {
        _id: user._id,
        fullName: user.fullName,
        username: user.username,
        profileImage: user.profileImage
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalBlogs: total,
        hasNext: skip + blogs.length < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error("Error fetching user blogs:", error);
    res.status(500).json({ message: "Failed to fetch user blogs" });
  }
};


// Upload PDF Only (For Notes)
export const uploadPDFNote = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No PDF uploaded" });

    const { title } = req.body;

    const blog = new Blog({
      title: title || "PDF Note",
      content: "PDF Note Uploaded",
      author: req.user.id,
      pdfUrl: req.file.location || req.file.filename, // S3 URL or local filename
      isPublished: true,
      publishedAt: new Date()
    });

    await blog.save();
    await blog.populate("author", "fullName username profileImage");

    res.status(201).json(blog);

  } catch (err) {
    console.error("PDF Upload Error:", err);
    res.status(500).json({ message: "Failed to upload PDF" });
  }
};
