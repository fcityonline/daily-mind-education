// backend/models/Blog.js
import mongoose from "mongoose";

// Helper function to count words
function countWords(str) {
  if (!str) return 0;
  return str.trim().split(/\s+/).filter(word => word.length > 0).length;
}

const blogSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    content: { type: String, required: true, trim: true }, // 300 words limit enforced in controller
    excerpt: { type: String, maxlength: 300 }, // auto-generated excerpt
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    comments: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      content: { type: String, required: true, maxlength: 500 },
      createdAt: { type: Date, default: Date.now }
    }],
    tags: [{ type: String, trim: true }],
    category: { type: String, enum: ['general', 'education', 'technology', 'lifestyle', 'other'], default: 'general' },
    isPublished: { type: Boolean, default: false },
    publishedAt: Date,
    views: { type: Number, default: 0 },
    featured: { type: Boolean, default: false },
    imageUrl: { type: String }, // optional blog image
    pdfUrl: { type: String },
  },
  { timestamps: true }
);

// Indexes for better performance
blogSchema.index({ author: 1, createdAt: -1 });
blogSchema.index({ isPublished: 1, publishedAt: -1 });
blogSchema.index({ category: 1, isPublished: 1 });
blogSchema.index({ tags: 1 });

// Virtual for like count
blogSchema.virtual('likeCount').get(function() {
  return this.likes.length;
});

// Virtual for comment count
blogSchema.virtual('commentCount').get(function() {
  return this.comments.length;
});

// Pre-save middleware to generate excerpt
blogSchema.pre('save', function(next) {
  if (this.content && !this.excerpt) {
    this.excerpt = this.content.substring(0, 200) + (this.content.length > 200 ? '...' : '');
  }
  next();
});

// Method to check if user liked the blog
blogSchema.methods.isLikedBy = function(userId) {
  return this.likes.some(like => like.toString() === userId.toString());
};

// Method to toggle like
blogSchema.methods.toggleLike = function(userId) {
  const likeIndex = this.likes.findIndex(like => like.toString() === userId.toString());
  
  if (likeIndex > -1) {
    this.likes.splice(likeIndex, 1);
    return false; // unliked
  } else {
    this.likes.push(userId);
    return true; // liked
  }
};

export default mongoose.model("Blog", blogSchema);
