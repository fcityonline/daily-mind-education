// backend/models/Report.js
import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
  {
    reportedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true 
    },
    reportedUser: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true 
    },
    blog: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Blog", 
      required: true 
    },
    reason: { 
      type: String, 
      required: true,
      enum: ['spam', 'inappropriate', 'harassment', 'fake', 'other'],
      default: 'other'
    },
    description: { 
      type: String, 
      maxlength: 500 
    },
    status: { 
      type: String, 
      enum: ['pending', 'reviewed', 'resolved', 'dismissed'], 
      default: 'pending' 
    },
    reviewedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User" 
    },
    reviewedAt: { 
      type: Date 
    },
    adminNotes: { 
      type: String 
    }
  },
  { timestamps: true }
);

// Indexes for efficient queries
reportSchema.index({ reportedUser: 1, createdAt: -1 });
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ blog: 1 });

export default mongoose.model("Report", reportSchema);

